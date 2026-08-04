

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { AlertCircle } from 'lucide-react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/contexts/DataContext'
import { useClient } from '@/contexts/ClientContext'
import { SystemNotification } from '@/utils/notifications'
import ProductCardGrid from '@/components/billing/ProductCardGrid'
import ProfitSummaryBar from '@/components/billing/ProfitSummaryBar'
import MobileCartList from '@/components/billing/MobileCartList'
import MembershipBillingPanel from '@/components/billing/MembershipBillingPanel'
import type { CardLookupResult } from '@/types/membership'
import { useMobileDetect } from '@/hooks/useMobileDetect'
import BarcodeScannerModal from '@/components/billing/BarcodeScannerModal'
import bluetoothPrinterService from '@/services/bluetoothPrinterService'
import { getShopSettings } from '@/services/shopSettingsService'
import type { ShopSettings } from '@/services/shopSettingsService'
import { generateBillPDF } from '@/lib/pdfService'
import { toast } from '@/utils/toast'
import { calcLine, netCost } from '@/utils/billCalc'
import { useCurrency } from '@/lib/useCurrency'

interface Product {
  product_id: string
  product_name: string
  rate: number | string
  quantity: number
  item_code: string
  barcode: string
  gst_percentage: number | string
  hsn_code: string
  unit: string
  available_quantity: number
  cost_price?: number | string
  mrp?: number | string
  purchase_discount_percentage?: number | string
  selling_discount_percentage?: number | string
}

interface BillItem {
  product_id: string
  product_name: string
  item_code: string
  hsn_code: string
  unit: string
  quantity: number
  rate: number
  gst_percentage: number
  gst_amount: number
  amount: number
  cost_price?: number
  mrp?: number
  discount_percentage?: number  // per-line customer discount %; off the rate, before GST
  limitedByStock?: boolean
  requestedQuantity?: number
  saveToStock?: boolean  // NEW: User can choose to save product to stock after billing
}

// Per-line money math. The customer discount comes off the rate, BEFORE GST,
// so GST is charged on the already-discounted amount. Delegates to the shared,
// unit-tested calcLine() so every add/update path matches the bill-calc utility.
function computeLineAmounts(quantity: number, rate: number, gstPct: number, discountPct: number = 0) {
  const safeDisc = Math.min(Math.max(discountPct || 0, 0), 100)
  const t = calcLine({ rate, quantity, discount: safeDisc, tax_percent: gstPct })
  return { gstAmt: Number(t.line_tax_amount.toFixed(2)), amount: Number(t.line_total.toFixed(2)) }
}

// Cost net of the supplier/purchase discount — used for profit display only.
function netCostFromProduct(product: any): number | undefined {
  if (product?.cost_price == null || product.cost_price === '') return undefined
  return netCost(Number(product.cost_price), Number(product.purchase_discount_percentage || 0))
}

interface PaymentSplit {
  payment_type: string
  amount: number
}

interface CustomerData {
  customer_id: string
  customer_code: number
  customer_name: string
  customer_phone: string
  customer_gstin?: string
  customer_email?: string
  customer_address?: string
}

interface BillTab {
  id: string
  customer_code: string
  customer_name: string
  customer_phone: string
  customer_gstin: string
  payment_splits: PaymentSplit[]
  items: BillItem[]
  discountPercentage: number
  negotiableAmount: number
  useNegotiablePrice: boolean
  amountReceived: number
  // Membership card attached to this bill (optional). Cleared when the tab resets.
  membershipCardId?: string
  membershipRedeemPoints?: number
  // ₹ value per point for the attached card's tier — used to convert redeemed
  // points into a money-off amount on this bill (backend re-computes authoritatively).
  membershipRedemptionRate?: number
}

export default function UnifiedBillingPage() {
  const navigate = useNavigate()
  const { fetchProducts, invalidateCache: invalidateDataCache } = useData()
  const { client, user, hasPermission } = useClient()
  const { symbol: cur } = useCurrency()
  // Display label for the tax line — from the client's tax_config (falls back to "GST")
  const taxLabel = client?.tax_config?.name || 'GST'

  // Permission-based billing mode
  const hasGstPermission = hasPermission('gst_billing')
  const hasNonGstPermission = hasPermission('non_gst_billing')
  const hasBothPermissions = hasGstPermission && hasNonGstPermission
  const gstOnly = hasGstPermission && !hasNonGstPermission
  const nonGstOnly = !hasGstPermission && hasNonGstPermission
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const productSearchRef = useRef<HTMLInputElement>(null)
  const quantityInputRef = useRef<HTMLInputElement>(null)
  const gstInputRef = useRef<HTMLInputElement>(null)
  const rateInputRef = useRef<HTMLInputElement>(null)
  const lineDiscountInputRef = useRef<HTMLInputElement>(null)
  const customerCodeRef = useRef<HTMLInputElement>(null)
  const customerNameRef = useRef<HTMLInputElement>(null)
  const customerPhoneRef = useRef<HTMLInputElement>(null)
  const customerGstinRef = useRef<HTMLInputElement>(null)
  const discountRef = useRef<HTMLInputElement>(null)
  const negotiableAmountRef = useRef<HTMLInputElement>(null)
  const amountReceivedRef = useRef<HTMLInputElement>(null)
  const printButtonRef = useRef<HTMLButtonElement>(null)

  const hasInitialized = useRef(false)
  const isRestoringFromStorage = useRef(false)
  const barcodeBuffer = useRef('')

  // M-4: useMemo so localStorage is read once per mount, not on every render
  const userId = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').user_id || 'guest' } catch { return 'guest' }
  }, [])
  const DRAFT_STORAGE_KEY = `billing_draft_tabs_${userId}`
  const VIEW_MODE_KEY = `billing_view_mode_${userId}`

  // POS Card View state
  const [viewMode, setViewMode] = useState<'list' | 'card'>(() => {
    const stored = localStorage.getItem(`billing_view_mode_${userId}`)
    return stored === 'list' || stored === 'card' ? stored : 'list'
  })
  const barcodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // For detecting fast typing (barcode scanner) in product search field
  const searchInputTimestamp = useRef<number>(0)
  const searchInputBuffer = useRef<string>('')
  const searchBarcodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Payment types fetched from API (with fallback)
  const [paymentTypes, setPaymentTypes] = useState<string[]>(['Cash', 'Card', 'UPI', 'Credit Card'])

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  // Partial-payment confirmation. Electron has no window.confirm(), so the
  // "balance will be due" check is an in-app modal; holding the submit args
  // here lets the Continue button re-enter handleSubmit unchanged.
  const [partialConfirm, setPartialConfirm] = useState<{
    paying: number; balance: number; total: number; isPending: boolean; skipPrint: boolean
  } | null>(null)

  // Multi-tab billing state - initialized from localStorage or default
  const [billTabs, setBillTabs] = useState<BillTab[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.tabs && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
            isRestoringFromStorage.current = true
            return parsed.tabs
          }
        }
      } catch (e) {
        console.error('Failed to restore draft from localStorage:', e)
      }
    }
    return [{
      id: '1',
      customer_code: '',
      customer_name: '',
      customer_phone: '',
      customer_gstin: '',
      payment_splits: [],
      items: [],
      discountPercentage: 0,
      negotiableAmount: 0,
      useNegotiablePrice: false,
      amountReceived: 0,
    }]
  })
  const [activeTabId, setActiveTabId] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.activeTabId) {
            return parsed.activeTabId
          }
        }
      } catch (e) {
        // ignore
      }
    }
    return '1'
  })

  const [billDate, setBillDate] = useState(new Date())
  const [nextBillNumber, setNextBillNumber] = useState<number | null>(null)

  // Product selection state
  const [barcodeInput, setBarcodeInput] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [productsLoading, setProductsLoading] = useState(true)
  const [selectedProductIndex, setSelectedProductIndex] = useState(-1)  // -1 means no selection
  const [hasUsedArrowKeys, setHasUsedArrowKeys] = useState(false)  // Track if user navigated with arrows
  const [isNewProduct, setIsNewProduct] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [newProductBarcode, setNewProductBarcode] = useState('')
  const [showCostTooltip, setShowCostTooltip] = useState<number | null>(null)
  const [tooltipTimeoutId, setTooltipTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [currentItem, setCurrentItem] = useState({
    product_id: '',
    product_name: '',
    item_code: '',
    hsn_code: '',
    unit: '',
    quantity: '' as number | string,
    rate: 0,
    gst_percentage: 0,
    cost_price: undefined as number | undefined,
    mrp: undefined as number | undefined,
    discount_percentage: 0,
  })
  const [availableStock, setAvailableStock] = useState<number>(0)
  const [stockWarning, setStockWarning] = useState<string>('')

  // Mobile detection
  const { isMobile, isTouchDevice, supportsWebBluetooth, supportsCamera } = useMobileDetect()
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null)

  // Modal states
  const [showDraftRestored, setShowDraftRestored] = useState(false)

  // Customer search states
  const [allCustomers, setAllCustomers] = useState<CustomerData[]>([])
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerData[]>([])
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [customerSearchField, setCustomerSearchField] = useState<'code' | 'name' | 'phone' | null>(null)
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(0)


  // Show draft restored notification
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.tabs && parsed.tabs.length > 0 && parsed.tabs.some((t: BillTab) => t.items.length > 0 || t.customer_name)) {
            setShowDraftRestored(true)
            setTimeout(() => setShowDraftRestored(false), 2500)
          }
        }
      } catch (e) {
        // ignore
      }
    }
  }, [])

  // Fetch shop settings for Bluetooth printing and UPI QR
  useEffect(() => {
    getShopSettings().then(settings => {
      setShopSettings(settings)
    }).catch(() => {})
  }, [])

  // Get current active tab
  const activeTab = billTabs.find((tab) => tab.id === activeTabId) || billTabs[0]

  const loadInitialData = useCallback(async () => {
    try {
      setProductsLoading(true)
      // Single parallel load — no retries, no recursive loops
      const [productsData, billNumberResponse, customersResponse] = await Promise.all([
        fetchProducts(false),
        api.get('/billing/next-number'),
        api.get('/customer/all').catch(() => ({ data: { customers: [] } })),
      ])
      setProducts(productsData)
      setNextBillNumber(billNumberResponse.data.next_bill_number || 1)
      setAllCustomers(customersResponse.data.customers || [])
    } catch (error) {
      console.error('Failed to load initial data:', error)
      setNextBillNumber(1)
    } finally {
      setProductsLoading(false)
    }
  }, [fetchProducts])

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true
      loadInitialData()
      productSearchRef.current?.focus()

      // Request notification permission on page load
      SystemNotification.requestPermission()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        productSearchRef.current?.focus()
      }
      if (e.key === 'F3') {
        e.preventDefault()
        setViewMode(prev => prev === 'list' ? 'card' : 'list')
      }
      if (e.key === 'Escape') {
        setBarcodeInput('')
        setShowProductDropdown(false)
        barcodeBuffer.current = ''
        productSearchRef.current?.focus()
      }

      // Global barcode scanning - capture input even when not focused on search field
      const activeElement = document.activeElement
      const isInputFocused = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'

      // If not in an input field, capture barcode characters
      if (!isInputFocused) {
        // Handle Enter key - process the barcode buffer
        if (e.key === 'Enter' && barcodeBuffer.current.length > 0) {
          e.preventDefault()
          const scannedBarcode = barcodeBuffer.current.trim()
          barcodeBuffer.current = ''
          if (barcodeTimeout.current) {
            clearTimeout(barcodeTimeout.current)
            barcodeTimeout.current = null
          }
          // Set barcode input and trigger search
          setBarcodeInput(scannedBarcode)
          // Focus the barcode input and trigger Enter
          setTimeout(() => {
            barcodeInputRef.current?.focus()
            // Simulate Enter key press on the input
            const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
            barcodeInputRef.current?.dispatchEvent(enterEvent)
          }, 50)
          return
        }

        // Capture printable characters for barcode
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          barcodeBuffer.current += e.key

          // Clear previous timeout
          if (barcodeTimeout.current) {
            clearTimeout(barcodeTimeout.current)
          }

          // Set timeout to clear buffer if no more input (user stopped typing)
          barcodeTimeout.current = setTimeout(() => {
            barcodeBuffer.current = ''
          }, 100) // Barcode scanners type very fast, 100ms is enough
        }
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Close product dropdown if clicking outside product search container
      if (!target.closest('.product-search-container')) {
        setShowProductDropdown(false)
      }
      // Close customer dropdown if clicking outside customer search containers
      if (!target.closest('.customer-search-container')) {
        setShowCustomerDropdown(false)
      }
      // Close cost tooltip if clicking outside of any product name
      if (!target.closest('.cost-tooltip-trigger') && !target.closest('.cost-tooltip')) {
        if (showCostTooltip !== null) {
          setShowCostTooltip(null)
          if (tooltipTimeoutId) {
            clearTimeout(tooltipTimeoutId)
            setTooltipTimeoutId(null)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('click', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('click', handleClickOutside)
      if (barcodeTimeout.current) {
        clearTimeout(barcodeTimeout.current)
      }
      if (searchBarcodeTimeout.current) {
        clearTimeout(searchBarcodeTimeout.current)
      }
    }
  }, [loadInitialData])

  // M-7: Debounce draft saves — previously wrote ~10KB synchronously on every keystroke.
  // 500ms debounce means at most 2 writes/second during active typing.
  useEffect(() => {
    if (isRestoringFromStorage.current) {
      isRestoringFromStorage.current = false
      return
    }
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
    draftSaveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
          tabs: billTabs,
          activeTabId,
          savedAt: new Date().toISOString()
        }))
      } catch (e) {
        console.error('Failed to save draft to localStorage:', e)
      }
      draftSaveTimer.current = null
    }, 500)
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
    }
  }, [billTabs, activeTabId, DRAFT_STORAGE_KEY])

  // Persist view mode preference (per user)
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode, VIEW_MODE_KEY])

  // Function to clear draft from localStorage (called after successful bill creation)
  const clearDraftFromStorage = useCallback((tabIdToRemove?: string) => {
    try {
      if (tabIdToRemove) {
        // Only clear the specific tab that was completed
        const remainingTabs = billTabs.filter(tab => tab.id !== tabIdToRemove)
        if (remainingTabs.length > 0) {
          const dataToSave = {
            tabs: remainingTabs,
            activeTabId: remainingTabs[0].id,
            savedAt: new Date().toISOString()
          }
          localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(dataToSave))
        } else {
          localStorage.removeItem(DRAFT_STORAGE_KEY)
        }
      } else {
        localStorage.removeItem(DRAFT_STORAGE_KEY)
      }
    } catch (e) {
      console.error('Failed to clear draft from localStorage:', e)
    }
  }, [billTabs])

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  // Handle Enter key navigation between form fields
  const handleEnterNavigation = (e: React.KeyboardEvent, nextFieldRef: React.RefObject<HTMLInputElement> | null) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (nextFieldRef?.current) {
        nextFieldRef.current.focus()
        nextFieldRef.current.select()
      }
    }
  }

  // Tab management functions
  const addNewTab = () => {
    const newTabId = String(Date.now())
    setBillTabs([
      ...billTabs,
      {
        id: newTabId,
        customer_code: '',
        customer_name: '',
        customer_phone: '',
        customer_gstin: '',
        payment_splits: [],
        items: [],
        discountPercentage: 0,
        negotiableAmount: 0,
        useNegotiablePrice: false,
        amountReceived: 0,
      },
    ])
    setActiveTabId(newTabId)
  }

  const closeTab = (tabId: string) => {
    if (billTabs.length === 1) {
      // Reset the single tab instead of closing
      const newTabId = Date.now().toString()
      setBillTabs([{
        id: newTabId,
        customer_code: '',
        customer_name: '',
        customer_phone: '',
        customer_gstin: '',
        payment_splits: [],
        items: [],
        discountPercentage: 0,
        negotiableAmount: 0,
        useNegotiablePrice: false,
        amountReceived: 0,
      }])
      setActiveTabId(newTabId)
      // Also update the bill number for the new bill
      loadInitialData()
      return
    }
    const newTabs = billTabs.filter((tab) => tab.id !== tabId)
    setBillTabs(newTabs)
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[0].id)
    }
  }

  // Close tab without reloading data (used after successful bill creation when we already have next bill number)
  const closeTabWithoutReload = (tabId: string) => {
    if (billTabs.length === 1) {
      // Reset the single tab instead of closing - but don't reload data
      const newTabId = Date.now().toString()
      setBillTabs([{
        id: newTabId,
        customer_code: '',
        customer_name: '',
        customer_phone: '',
        customer_gstin: '',
        payment_splits: [],
        items: [],
        discountPercentage: 0,
        negotiableAmount: 0,
        useNegotiablePrice: false,
        amountReceived: 0,
      }])
      setActiveTabId(newTabId)
      return
    }
    const newTabs = billTabs.filter((tab) => tab.id !== tabId)
    setBillTabs(newTabs)
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[0].id)
    }
  }

  const updateActiveTab = (updates: Partial<BillTab>) => {
    setBillTabs(
      billTabs.map((tab) =>
        tab.id === activeTabId ? { ...tab, ...updates } : tab
      )
    )
  }

  // Close customer dropdown only if focus moves outside customer fields
  const handleCustomerBlur = (e: React.FocusEvent) => {
    const related = e.relatedTarget as HTMLElement | null
    // If focus is moving to another element inside a customer-search-container, don't close
    if (related?.closest('.customer-search-container')) return
    setTimeout(() => setShowCustomerDropdown(false), 150)
  }

  // Filter customers locally from pre-loaded list
  const filterCustomers = (query: string, field: 'code' | 'name' | 'phone') => {
    if (!query) {
      // Show all customers on focus with empty field
      setCustomerSuggestions(allCustomers.slice(0, 20))
      setShowCustomerDropdown(allCustomers.length > 0)
      setSelectedCustomerIndex(0)
      return
    }
    const q = query.toLowerCase()
    const filtered = allCustomers.filter(c => {
      if (field === 'code') return c.customer_code?.toString().startsWith(q)
      if (field === 'name') return c.customer_name?.toLowerCase().includes(q)
      if (field === 'phone') return c.customer_phone?.includes(q)
      return false
    }).slice(0, 20)
    setCustomerSuggestions(filtered)
    setShowCustomerDropdown(filtered.length > 0)
    setSelectedCustomerIndex(0)
  }

  // Handle customer field change with local filtering
  const handleCustomerFieldChange = (field: 'code' | 'name' | 'phone', value: string) => {
    if (field === 'code') {
      updateActiveTab({ customer_code: value })
    } else if (field === 'name') {
      updateActiveTab({ customer_name: value })
    } else if (field === 'phone') {
      updateActiveTab({ customer_phone: value })
    }
    setCustomerSearchField(field)
    filterCustomers(value, field)
  }

  // Lookup customer by exact code and auto-fill
  const lookupCustomerByCode = async (code: string) => {
    if (!code) return false
    try {
      const response = await api.get(`/customer/code/${code}`)
      if (response.data.success && response.data.customer) {
        const customer = response.data.customer
        updateActiveTab({
          customer_code: customer.customer_code.toString(),
          customer_name: customer.customer_name,
          customer_phone: customer.customer_phone,
          customer_gstin: customer.customer_gstin || '',
        })
        setShowCustomerDropdown(false)
        setCustomerSuggestions([])
        return true
      }
    } catch (error) {
      // Customer not found - that's ok
    }
    return false
  }

  // Handle customer selection from dropdown
  const selectCustomer = (customer: CustomerData) => {
    updateActiveTab({
      customer_code: customer.customer_code.toString(),
      customer_name: customer.customer_name,
      customer_phone: customer.customer_phone,
      customer_gstin: customer.customer_gstin || '',
    })
    setShowCustomerDropdown(false)
    setCustomerSuggestions([])
    setCustomerSearchField(null)
    setSelectedCustomerIndex(0)

    // Move to discount field after selection
    setTimeout(() => {
      discountRef.current?.focus()
    }, 100)
  }

  // Handle keyboard navigation for customer dropdown
  const handleCustomerKeyDown = (e: React.KeyboardEvent, field: 'code' | 'name' | 'phone') => {
    if (!showCustomerDropdown || customerSuggestions.length === 0) {
      return false // Not handled
    }

    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault()
      setSelectedCustomerIndex(prev =>
        prev < customerSuggestions.length - 1 ? prev + 1 : 0
      )
      return true
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault()
      setSelectedCustomerIndex(prev =>
        prev > 0 ? prev - 1 : customerSuggestions.length - 1
      )
      return true
    } else if (e.key === 'Enter' && customerSuggestions[selectedCustomerIndex]) {
      e.preventDefault()
      selectCustomer(customerSuggestions[selectedCustomerIndex])
      return true
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setShowCustomerDropdown(false)
      setCustomerSuggestions([])
      return true
    }
    return false
  }

  // Payment split management
  const addPaymentSplit = () => {
    const newSplits = [
      ...activeTab.payment_splits,
      { payment_type: 'Cash', amount: 0 },  // Default to Cash
    ]
    updateActiveTab({ payment_splits: newSplits })
  }

  const updatePaymentSplit = (index: number, field: keyof PaymentSplit, value: string | number) => {
    const newSplits = [...activeTab.payment_splits]
    if (field === 'amount') {
      newSplits[index][field] = Number(value)
    } else {
      newSplits[index][field] = value as string
    }
    updateActiveTab({ payment_splits: newSplits })
  }

  const removePaymentSplit = (index: number) => {
    const newSplits = activeTab.payment_splits.filter((_, i) => i !== index)
    updateActiveTab({ payment_splits: newSplits })
  }

  const getTotalPaymentSplits = () => {
    return activeTab.payment_splits.reduce((sum, split) => sum + split.amount, 0)
  }

  // Barcode scanning
  const handleBarcodeScanned = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()

      // If barcode is empty, move to customer name field
      if (!barcodeInput.trim()) {
        customerNameRef.current?.focus()
        return
      }

      // Process the barcode - ensure it's sent as a complete string
      try {
        // Clean the barcode - remove any unwanted spaces but keep as single string
        const cleanedBarcode = barcodeInput.trim().replace(/\s+/g, '')
        const response = await api.get(`/stock/lookup/${encodeURIComponent(cleanedBarcode)}`)
        const product = response.data.product
        addProductToItems(product)
        setBarcodeInput('')
        barcodeInputRef.current?.focus()
      } catch (error: any) {
        toast.error(error.response?.data?.error || 'Product not found')
        setBarcodeInput('')
        // Move to product search on error
        productSearchRef.current?.focus()
      }
    }
  }

  const handleProductSelect = useCallback((product: Product) => {
    setIsNewProduct(false)
    setAvailableStock(product.quantity || 0)
    setStockWarning('')
    setHasUsedArrowKeys(false)  // Reset arrow key tracking
    setSelectedProductIndex(-1)  // Reset selection
    const defaultRate = Number(product.rate)

    // Determine GST based on permissions:
    // - Non-GST only: Always 0%
    // - GST only or Both: Use product's GST percentage
    const gstPercentage = nonGstOnly ? 0 : Number(product.gst_percentage || 0)

    setCurrentItem({
      product_id: product.product_id,
      product_name: product.product_name,
      item_code: product.item_code || '',
      hsn_code: product.hsn_code || '',
      unit: product.unit || 'pcs',
      quantity: '' as number | string,
      rate: defaultRate,
      gst_percentage: gstPercentage,
      cost_price: netCostFromProduct(product),
      mrp: product.mrp ? Number(product.mrp) : undefined,
      discount_percentage: Number(product.selling_discount_percentage || 0),
    })
    setProductSearch(product.product_name)
    setShowProductDropdown(false)

    setTimeout(() => {
      quantityInputRef.current?.focus()
      quantityInputRef.current?.select()
    }, 100)
  }, [nonGstOnly])

  const handleCreateNewProduct = useCallback(() => {
    if (!newProductName.trim()) return

    setIsNewProduct(true)
    setCurrentItem({
      product_id: 'new-product-temp',
      product_name: newProductName.trim(),
      item_code: newProductBarcode || productSearch, // Store barcode as item_code
      hsn_code: '',
      unit: 'pcs',
      quantity: '' as number | string,
      rate: 0,
      gst_percentage: 0,
      cost_price: undefined,
      mrp: undefined,
      discount_percentage: 0,
    })
    setShowProductDropdown(false)
    setNewProductName('') // Reset for next use
    setNewProductBarcode('') // Reset barcode

    setTimeout(() => {
      rateInputRef.current?.focus()
      rateInputRef.current?.select()
    }, 100)
  }, [newProductName, newProductBarcode, productSearch])

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products
    const searchLower = productSearch.toLowerCase()
    const searchNoSpaces = productSearch.replace(/\s+/g, '').toLowerCase()
    return products.filter((product) =>
      product.product_name.toLowerCase().includes(searchLower) ||
      (product.item_code && product.item_code.toLowerCase().includes(searchLower)) ||
      (product.barcode && product.barcode.toLowerCase().includes(searchLower)) ||
      (product.barcode && product.barcode.replace(/\s+/g, '').toLowerCase().includes(searchNoSpaces))
    )
  }, [products, productSearch])

  const addProductToItems = (product: any) => {
    const qty = 1
    const rate = Number(product.rate)
    // Non-GST only users: Force GST to 0
    const productGstPct = nonGstOnly ? 0 : Number(product.gst_percentage || 0)
    const productId = String(product.product_id)
    const itemCode = product.item_code || ''

    // Check if product already exists in items (by product_id or item_code)
    // Match by product_id OR item_code - same product should increment quantity
    const existingItemIndex = activeTab.items.findIndex((item) => {
      const itemProductId = String(item.product_id)
      const itemItemCode = item.item_code || ''

      // Match by product_id
      if (itemProductId === productId && productId !== '' && productId !== 'undefined') {
        return true
      }
      // Match by item_code (for barcode scans)
      if (itemItemCode === itemCode && itemCode !== '') {
        return true
      }
      return false
    })

    if (existingItemIndex !== -1) {
      // Product already in bill - increment quantity
      const updatedItems = [...activeTab.items]
      const existingItem = updatedItems[existingItemIndex]
      const availableQty = Number(product.quantity || product.available_quantity || 999999)
      const newQuantity = existingItem.quantity + qty

      // Check stock availability
      if (newQuantity > availableQty) {
        toast.warning(`Stock limit reached! Only ${availableQty} available for ${existingItem.product_name}`)
        return
      }

      const { gstAmt, amount } = computeLineAmounts(newQuantity, existingItem.rate, existingItem.gst_percentage, existingItem.discount_percentage)

      updatedItems[existingItemIndex] = {
        ...existingItem,
        quantity: newQuantity,
        gst_amount: gstAmt,
        amount,
      }

      updateActiveTab({ items: updatedItems })
      console.log(`[BARCODE] Incremented quantity for ${existingItem.product_name} to ${newQuantity}`)
    } else {
      // New product - add to bill (pre-fill the product's customer discount)
      const sellingDiscount = Number(product.selling_discount_percentage || 0)
      const { gstAmt, amount } = computeLineAmounts(qty, rate, productGstPct, sellingDiscount)

      const newItem: BillItem = {
        product_id: product.product_id,
        product_name: product.product_name,
        item_code: product.item_code || '',
        hsn_code: product.hsn_code || '',
        unit: product.unit || 'pcs',
        quantity: qty,
        rate: rate,
        gst_percentage: productGstPct,
        gst_amount: gstAmt,
        amount,
        cost_price: netCostFromProduct(product),
        mrp: product.mrp ? Number(product.mrp) : undefined,
        discount_percentage: sellingDiscount,
      }

      updateActiveTab({ items: [...activeTab.items, newItem] })
      console.log(`[BARCODE] Added new product: ${product.product_name}`)
    }
  }

  // Handle barcode scan detection in product search field
  // Barcode scanners type very fast (< 50ms between chars) vs manual typing (> 100ms)
  const BARCODE_TYPING_THRESHOLD_MS = 50   // Max ms between chars for barcode scanner
  const BARCODE_COMPLETION_DELAY_MS = 150  // Wait time after last char before processing
  const BARCODE_MIN_LENGTH = 3             // Minimum barcode length

  const handleProductSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchValue = e.target.value
    const now = Date.now()
    // Handle first character - timestamp 0 means first input, treat as manual typing
    const timeSinceLastInput = searchInputTimestamp.current === 0
      ? Infinity
      : now - searchInputTimestamp.current

    // Update timestamp
    searchInputTimestamp.current = now

    // If typing is fast (< threshold ms between characters), it's likely a barcode scanner
    if (timeSinceLastInput < BARCODE_TYPING_THRESHOLD_MS && searchValue.length > BARCODE_MIN_LENGTH) {
      // Accumulate in buffer for barcode
      searchInputBuffer.current = searchValue

      // Clear any existing timeout
      if (searchBarcodeTimeout.current) {
        clearTimeout(searchBarcodeTimeout.current)
      }

      // Set timeout to process barcode after scanner finishes
      searchBarcodeTimeout.current = setTimeout(async () => {
        const scannedCode = searchInputBuffer.current.trim()
        if (scannedCode.length >= BARCODE_MIN_LENGTH) {
          try {
            const response = await api.get(`/stock/lookup/${encodeURIComponent(scannedCode)}`)
            const product = response.data.product
            addProductToItems(product)
            setProductSearch('')
            searchInputBuffer.current = ''
            setShowProductDropdown(false)
            // Reset timestamp for next scan
            searchInputTimestamp.current = 0
            // Keep focus on search for next scan
            productSearchRef.current?.focus()
          } catch (error: any) {
            // Product not found - let it stay in search field for manual handling
            setShowProductDropdown(true)
          }
        }
        searchInputBuffer.current = ''
      }, BARCODE_COMPLETION_DELAY_MS)
    } else {
      // Manual typing - reset buffer and show dropdown
      searchInputBuffer.current = ''
      // Reset timestamp if field is cleared (for fresh detection on next input)
      if (!searchValue) {
        searchInputTimestamp.current = 0
      }
      if (searchBarcodeTimeout.current) {
        clearTimeout(searchBarcodeTimeout.current)
      }
    }

    // Always update search value for display
    setProductSearch(searchValue)
    setShowProductDropdown(true)
    setSelectedProductIndex(-1)
    setHasUsedArrowKeys(false)
  }

  const addItem = () => {
    // If user typed in search but didn't select a product, use search text as new product
    let productNameToUse = currentItem.product_name
    let productIdToUse = currentItem.product_id
    let isNewProductToUse = isNewProduct

    if (!productNameToUse && productSearch.trim().length > 0) {
      // Auto-create from search text (no minimum length requirement)
      productNameToUse = productSearch.trim()
      productIdToUse = `nosave-${Date.now()}-${Math.random().toString(36).substring(7)}`
      isNewProductToUse = true
    }

    if (!productNameToUse || !currentItem.quantity || Number(currentItem.quantity) <= 0) {
      toast.warning('Please enter product name and valid quantity')
      return
    }

    if (!currentItem.rate || currentItem.rate <= 0) {
      toast.warning('Please enter a valid rate')
      return
    }

    if (!isNewProductToUse && availableStock === 0) {
      toast.warning('This product is out of stock! Cannot add to bill.')
      return
    }

    let actualQuantity = Number(currentItem.quantity)
    let limitedByStock = false
    const requestedQuantity = Number(currentItem.quantity)

    if (!isNewProductToUse && availableStock > 0 && actualQuantity > availableStock) {
      actualQuantity = availableStock
      limitedByStock = true
    }

    const existingItemIndex = activeTab.items.findIndex(
      (item) =>
        item.product_id === productIdToUse &&
        item.rate === currentItem.rate &&
        item.gst_percentage === currentItem.gst_percentage
    )

    if (existingItemIndex !== -1) {
      const updatedItems = [...activeTab.items]
      const existingItem = updatedItems[existingItemIndex]
      const newQuantity = existingItem.quantity + actualQuantity
      const { gstAmt, amount } = computeLineAmounts(newQuantity, existingItem.rate, existingItem.gst_percentage, existingItem.discount_percentage)

      updatedItems[existingItemIndex] = {
        ...existingItem,
        quantity: newQuantity,
        gst_amount: gstAmt,
        amount,
        limitedByStock: limitedByStock || existingItem.limitedByStock,
        requestedQuantity: limitedByStock ? requestedQuantity : existingItem.requestedQuantity,
      }

      updateActiveTab({ items: updatedItems })
    } else {
      const { gstAmt, amount } = computeLineAmounts(actualQuantity, currentItem.rate, currentItem.gst_percentage, currentItem.discount_percentage)

      // For new products, always use nosave- prefix (no stock saving)
      // For existing stock products, keep the original UUID
      const productId = productIdToUse.startsWith('nosave-') || productIdToUse.startsWith('temp-')
        ? productIdToUse  // Keep existing nosave/temp prefix
        : (isNewProductToUse ? `nosave-${Date.now()}-${Math.random().toString(36).substring(7)}` : productIdToUse)

      const newItem: BillItem = {
        ...currentItem,
        product_id: productId,
        product_name: productNameToUse,
        quantity: actualQuantity,
        gst_amount: gstAmt,
        amount,
        limitedByStock,
        requestedQuantity: limitedByStock ? requestedQuantity : undefined,
        // saveToStock removed - quick products are not saved to stock
      }

      updateActiveTab({ items: [...activeTab.items, newItem] })
    }

    setCurrentItem({
      product_id: '',
      product_name: '',
      item_code: '',
      hsn_code: '',
      unit: '',
      quantity: '' as number | string,
      rate: 0,
      gst_percentage: 0,
      cost_price: undefined,
      mrp: undefined,
      discount_percentage: 0,
    })
    setProductSearch('')
    setShowProductDropdown(false)
    setIsNewProduct(false)
    setAvailableStock(0)
    setStockWarning('')
    setHasUsedArrowKeys(false)  // Reset arrow key tracking
    setSelectedProductIndex(-1)  // Reset selection

    setTimeout(() => {
      productSearchRef.current?.focus()
    }, 100)
  }

  const handleProductSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      if (!showProductDropdown || filteredProducts.length === 0) return
      e.preventDefault()
      setHasUsedArrowKeys(true)  // User is navigating with arrows
      setSelectedProductIndex((prev) =>
        prev < filteredProducts.length - 1 ? prev + 1 : 0  // Start from 0 if -1
      )
    } else if (e.key === 'ArrowUp') {
      if (!showProductDropdown || filteredProducts.length === 0) return
      e.preventDefault()
      setHasUsedArrowKeys(true)  // User is navigating with arrows
      setSelectedProductIndex((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()

      // If user navigated with arrow keys and has selection, use that
      if (hasUsedArrowKeys && selectedProductIndex >= 0 && filteredProducts[selectedProductIndex]) {
        handleProductSelect(filteredProducts[selectedProductIndex])
        return
      }

      // Check for exact match by name, item_code, or barcode
      const searchLower = productSearch.toLowerCase().trim()
      const searchNoSpaces = productSearch.replace(/\s+/g, '').toLowerCase()

      if (searchLower && filteredProducts.length > 0) {
        // Find exact match
        const exactMatch = filteredProducts.find((p) =>
          p.product_name.toLowerCase() === searchLower ||
          (p.item_code && p.item_code.toLowerCase() === searchLower) ||
          (p.barcode && p.barcode.toLowerCase() === searchLower) ||
          (p.barcode && p.barcode.replace(/\s+/g, '').toLowerCase() === searchNoSpaces)
        )

        if (exactMatch) {
          // Exact match found - auto-select it
          handleProductSelect(exactMatch)
          return
        }

        // If only one product matches, auto-select it
        if (filteredProducts.length === 1) {
          handleProductSelect(filteredProducts[0])
          return
        }
      }

      // No exact match or multiple matches - move to quantity field
      quantityInputRef.current?.focus()
      quantityInputRef.current?.select()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()

      if (field === 'quantity') {
        rateInputRef.current?.focus()
        rateInputRef.current?.select()
      } else if (field === 'rate') {
        // For non-GST only users, skip GST field and go straight to Disc %
        if (nonGstOnly) {
          lineDiscountInputRef.current?.focus()
          lineDiscountInputRef.current?.select()
        } else {
          gstInputRef.current?.focus()
          gstInputRef.current?.select()
        }
      } else if (field === 'gst') {
        lineDiscountInputRef.current?.focus()
        lineDiscountInputRef.current?.select()
      } else if (field === 'discount') {
        addItem()
      }
    }
  }

  const removeItem = (index: number) => {
    const newItems = activeTab.items.filter((_, i) => i !== index)
    updateActiveTab({ items: newItems })
  }

  const updateItemQuantity = (index: number, newQty: number) => {
    const updatedItems = [...activeTab.items]
    const item = updatedItems[index]
    const { gstAmt, amount } = computeLineAmounts(newQty, item.rate, item.gst_percentage, item.discount_percentage)

    updatedItems[index] = {
      ...item,
      quantity: newQty,
      gst_amount: gstAmt,
      amount,
    }

    updateActiveTab({ items: updatedItems })
  }

  // Edit the per-line customer discount %; recomputes the line off the rate, before GST.
  const updateItemDiscount = (index: number, newDiscount: number) => {
    const updatedItems = [...activeTab.items]
    const item = updatedItems[index]
    const safeDisc = Math.min(Math.max(Number(newDiscount) || 0, 0), 100)
    const { gstAmt, amount } = computeLineAmounts(item.quantity, item.rate, item.gst_percentage, safeDisc)

    updatedItems[index] = {
      ...item,
      discount_percentage: safeDisc,
      gst_amount: gstAmt,
      amount,
    }

    updateActiveTab({ items: updatedItems })
  }

  // C-2: Single useMemo replaces 8 plain functions that each iterated/re-computed on every render.
  // Previous pattern: getRoundedGrandTotal → calculateGrandTotal → calculateSubtotal + calculateTotalGST
  // = 4 separate array passes per render. Now: 1 pass, result cached until deps change.
  const billTotals = useMemo(() => {
    // subtotal = sum of discounted taxable values (amount - GST), so per-line
    // customer discounts are already baked in.
    const subtotal = activeTab.items.reduce((sum, item) => sum + (item.amount - item.gst_amount), 0)
    const totalGST = activeTab.items.reduce((sum, item) => sum + item.gst_amount, 0)
    const subtotalWithGST = subtotal + totalGST

    // Bill-level discount stacks AFTER per-item discounts: line amounts are
    // already net of their own discounts, so the bill % applies on the reduced
    // subtotal+GST (no double-counting of the same discount).
    const hasLineDiscount = activeTab.items.some(item => (item.discount_percentage || 0) > 0)
    const effectiveBillDiscountPct = activeTab.discountPercentage

    const preRedeemTotal = activeTab.useNegotiablePrice && activeTab.negotiableAmount > 0
      ? Math.max(0, subtotalWithGST - activeTab.negotiableAmount)
      : Math.max(0, subtotalWithGST - (subtotalWithGST * effectiveBillDiscountPct) / 100)

    // Membership points redeemed as money off this bill (backend re-computes the
    // ₹ value authoritatively; this mirrors it so the payable total + splits match).
    const redeemValue = Math.min(
      preRedeemTotal,
      (activeTab.membershipRedeemPoints || 0) * (activeTab.membershipRedemptionRate || 0)
    )
    const grandTotal = Math.max(0, preRedeemTotal - redeemValue)

    const rounded = Math.round(grandTotal)

    // Change is computed against what the customer is paying NOW (the splits
    // total), not the grand total — for a partial payment (₹3000 of ₹5000),
    // tendering ₹3000 means zero change, not "-₹2000". When splits equal the
    // total (the normal case) this is identical to the old behaviour.
    const splitsTotal = activeTab.payment_splits.reduce((s, p) => s + (p.amount || 0), 0)
    const payingNow = splitsTotal > 0 && splitsTotal < rounded ? splitsTotal : rounded

    return {
      subtotal,
      totalGST,
      grandTotal: rounded,
      roundOff: rounded - grandTotal,
      discountAmount: (subtotalWithGST * effectiveBillDiscountPct) / 100,
      membershipRedeemValue: redeemValue,
      hasLineDiscount,
      balance: activeTab.amountReceived - payingNow,
    }
  }, [activeTab.items, activeTab.discountPercentage, activeTab.negotiableAmount,
      activeTab.useNegotiablePrice, activeTab.amountReceived, activeTab.payment_splits,
      activeTab.membershipRedeemPoints, activeTab.membershipRedemptionRate])

  // Determine if GST columns should be shown in the table
  const showGstColumns = () => {
    // Non-GST only: Never show GST columns
    if (nonGstOnly) return false
    // GST only or both permissions: Show GST columns
    return true
  }

  const handleClearBill = () => {
    updateActiveTab({
      items: [],
      customer_code: '',
      customer_name: '',
      customer_phone: '',
      customer_gstin: '',
      discountPercentage: 0,
      negotiableAmount: 0,
      useNegotiablePrice: false,
      amountReceived: 0,
      payment_splits: [],
      membershipCardId: undefined,
      membershipRedeemPoints: 0,
      membershipRedemptionRate: undefined,
    })
    setCurrentItem({
      product_id: '',
      product_name: '',
      item_code: '',
      hsn_code: '',
      unit: 'pcs',
      quantity: '' as number | string,
      rate: 0,
      gst_percentage: 0,
      cost_price: undefined,
      mrp: undefined,
      discount_percentage: 0,
    })
    setIsNewProduct(false)
    setProductSearch('')
    setCustomerSuggestions([])
    setShowCustomerDropdown(false)
  }

  const handleSubmit = async (e: React.FormEvent, isPending = false, skipPrint = false, confirmedPartial = false) => {
    e.preventDefault()

    if (activeTab.items.length === 0) {
      toast.warning('Please add at least one item')
      return
    }

    if (activeTab.customer_name && activeTab.customer_name.trim() && !activeTab.customer_phone?.trim()) {
      toast.warning('Phone number is required when customer name is filled')
      customerPhoneRef.current?.focus()
      return
    }

    // Partial payment: splits may be LESS than the total (customer pays some
    // now, owes the rest) — only overpayment is blocked. The confirm() makes
    // an accidental under-entry impossible to save silently.
    let isPartial = false
    if (!isPending) {
      if (activeTab.payment_splits.length === 0) {
        toast.warning('Please add at least one payment method')
        return
      }

      const totalSplits = getTotalPaymentSplits()
      const grandTotal = billTotals.grandTotal

      if (totalSplits - grandTotal > 0.01) {
        toast.error(`Payment splits total (${cur}${totalSplits.toFixed(2)}) cannot exceed bill total (${cur}${grandTotal.toFixed(2)})`)
        return
      }
      if (grandTotal - totalSplits > 0.01) {
        if (totalSplits <= 0) {
          toast.warning('Payment amount is 0 — use the Pending button to save without payment')
          return
        }
        isPartial = true
        // Electron's renderer has no native confirm() — it throws. Gate on an
        // in-app modal instead, re-entering handleSubmit with confirmedPartial
        // once the cashier accepts.
        if (!confirmedPartial) {
          setPartialConfirm({
            paying: totalSplits,
            balance: grandTotal - totalSplits,
            total: grandTotal,
            isPending,
            skipPrint,
          })
          return
        }
      }
    }

    // Directly create and print the bill
    try {
      setLoading(true)
      console.log('[BILLING] Starting bill creation process...')

      // Customer auto-save is handled by the backend during bill creation (no permission needed)

      // Clean items - remove UI-only fields, keep nosave- prefix (no stock saving for quick products)
      const cleanedItems = activeTab.items.map(({ limitedByStock, requestedQuantity, saveToStock, ...item }) => item)

      /* DISABLED: Save to stock feature - quick products are temporary bills only
      const cleanedItems = activeTab.items.map(({ limitedByStock, requestedQuantity, saveToStock, ...item }) => {
        // Convert nosave- to temp- if user wants to save to stock
        if (item.product_id.startsWith('nosave-') && saveToStock !== false) {
          return {
            ...item,
            product_id: `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`
          }
        }
        return item
      })
      */

      // For pending bills: use selected payment splits if the user already picked one,
      // otherwise default to Cash so the Payment Type column displays correctly.
      const pendingPaymentSplit = [{ payment_type: 'Cash', amount: billTotals.grandTotal }]
      const paymentData = isPending
        ? JSON.stringify(activeTab.payment_splits.length > 0 ? activeTab.payment_splits : pendingPaymentSplit)
        : JSON.stringify(activeTab.payment_splits)

      console.log('[BILLING] Creating bill...')
      const response = await api.post('/billing/create', {
        customer_name: activeTab.customer_name || 'Walk-in Customer',
        customer_phone: activeTab.customer_phone || '',
        customer_gstin: activeTab.customer_gstin || '',
        items: cleanedItems,
        payment_type: paymentData,
        amount_received: isPending ? 0 : activeTab.amountReceived,
        // Per-item discounts replace the bill-level discount; send 0 so the backend
        // doesn't double-apply on top of the already-discounted line amounts.
        // Bill-level % is sent even when per-item discounts exist — the backend
        // applies it on the already line-discounted subtotal (stacking, not doubling).
        discount_percentage: activeTab.useNegotiablePrice ? 0 : activeTab.discountPercentage,
        negotiable_amount: activeTab.useNegotiablePrice ? activeTab.negotiableAmount : null,
        // Membership: attached card + points redeemed now. The backend enforces the
        // monthly negotiable budget and recomputes the redemption ₹ value server-side.
        membership_card_id: activeTab.membershipCardId || null,
        membership_redeem_points: activeTab.membershipRedeemPoints || 0,
        membership_negotiate_amount: activeTab.membershipCardId && activeTab.useNegotiablePrice
          ? activeTab.negotiableAmount : null,
        bill_date: billDate.toISOString(),
        // The backend derives the real status from paid_amount vs total — this
        // field only matters for old-server compatibility.
        payment_status: isPending ? 'pending' : (isPartial ? 'partial' : 'paid'),
        // How much money actually changed hands now. Splits are the source of
        // truth (amountReceived is cash-tendered incl. change).
        paid_amount: isPending ? 0 : getTotalPaymentSplits(),
      })
      console.log('[BILLING] Bill created successfully:', response.data.bill?.bill_number)

      // Check for stock warnings and show system notifications
      if (response.data.stock_warnings && response.data.stock_warnings.length > 0) {
        await SystemNotification.showStockWarnings(response.data.stock_warnings)
      }

      // Use bill data directly from create response (no need for additional fetch)
      const billData = response.data.bill

      // Prepare client info for printing (merge with shop settings if available)
      const clientInfo = client ? {
        client_name: shopSettings?.shop_name || client.client_name,
        address: shopSettings?.address1 || client.address,
        address2: shopSettings?.address2 || '',
        phone: shopSettings?.phone || client.phone,
        email: client.email,
        gstin: shopSettings?.gst_number || client.gstin,
        logo_url: client.logo_url,
        upi_id: shopSettings?.upi_id || '',
        receipt_footer: shopSettings?.receipt_footer || '',
      } : {
        client_name: shopSettings?.shop_name || 'Business Name',
        address: shopSettings?.address1 || '',
        address2: shopSettings?.address2 || '',
        phone: shopSettings?.phone || '',
        email: '',
        gstin: shopSettings?.gst_number || '',
        logo_url: '',
        upi_id: shopSettings?.upi_id || '',
        receipt_footer: shopSettings?.receipt_footer || '',
      }

      // Pending bills: skip printing, just confirm and clear
      if (isPending) {
        const billNum = response.data.bill?.bill_number || response.data.bill_number
        await SystemNotification.show?.({
          title: 'Bill Saved as Pending',
          body: `Bill #${billNum} saved. Payment is pending.`,
        }).catch(() => {/* optional notification */})
        invalidateDataCache('products')
        if (billNum) setNextBillNumber(billNum + 1)
        clearDraftFromStorage(activeTabId)
        closeTabWithoutReload(activeTabId)
        setLoading(false)
        return
      }

      // Save without printing: bill is finalized (paid), just skip the print step
      if (skipPrint) {
        const savedBill = response.data.bill || {}
        const billNum = savedBill.bill_number || response.data.bill_number
        const billDisplay = savedBill.bill_no_display || billNum
        toast.success(`Bill #${billDisplay} saved`)
        invalidateDataCache('products')
        api.get('/customer/all').then(res => {
          if (res.data.customers) setAllCustomers(res.data.customers)
        }).catch(() => {})
        if (billNum) setNextBillNumber(billNum + 1)
        clearDraftFromStorage(activeTabId)
        closeTabWithoutReload(activeTabId)
        setLoading(false)
        return
      }

      // Check if running in Electron desktop app
      const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null
      const hasElectronPrint = electronAPI && typeof electronAPI.silentPrint === 'function'

      console.log('[BILLING] Environment check:', {
        hasWindow: typeof window !== 'undefined',
        electronAPI: electronAPI ? 'available' : 'not available',
        hasElectronPrint,
        electronVersion: electronAPI?.electronVersion || 'N/A',
        platform: electronAPI?.platform || 'N/A',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'
      })

      if (hasElectronPrint) {
        // Use Electron's silent print for desktop app
        console.log('[BILLING] Electron detected - using Electron print API...')

        try {
          // Import and generate receipt HTML
          const { generateReceiptHtml, generateUpiQrDataUrl } = await import('@/lib/webPrintService')
          const payAmount = billData.type === 'gst' ? Number(billData.final_amount) : Number(billData.total_amount)
          const qrDataUrl = clientInfo.upi_id
            ? await generateUpiQrDataUrl(clientInfo.upi_id, clientInfo.client_name || '', payAmount, billData.bill_number)
            : undefined
          const receiptHtml = generateReceiptHtml(billData, clientInfo, true, qrDataUrl)

          console.log('[BILLING] Sending to Electron printer...')
          const printResult = await electronAPI.silentPrint(receiptHtml, null)

          if (printResult.success) {
            console.log('[BILLING] Electron print successful!')
          } else {
            console.error('[BILLING] Electron print failed:', printResult.error)
            toast.error('Bill created but print failed: ' + (printResult.error || 'Unknown error'))
          }
        } catch (electronPrintError: any) {
          console.error('[BILLING] Electron print exception:', electronPrintError)
          toast.error('Bill created but print failed: ' + (electronPrintError.message || 'Unknown error'))
        }
      } else {
        // Use browser print dialog for web deployment
        console.log('[BILLING] Web mode - using browser print dialog...')
        try {
          const { printBill } = await import('@/lib/webPrintService')
          const printResult = await printBill(billData, clientInfo, true)

          if (printResult.success) {
            console.log('[BILLING] Browser print dialog opened successfully!')
          } else {
            console.error('[BILLING] Browser print failed:', printResult.message)
            toast.error('Bill created but print failed: ' + (printResult.message || 'Print error'))
          }
        } catch (webPrintError: unknown) {
          console.error('[BILLING] Web print exception:', webPrintError)
          // Don't throw - bill was created successfully
          const errorMessage = webPrintError instanceof Error ? webPrintError.message : 'Print error'
          toast.error('Bill created but print failed: ' + errorMessage)
        }
      }

      // Invalidate product cache after successful bill creation (stock quantities changed)
      invalidateDataCache('products')

      // Refresh customer list (new customer may have been auto-saved by backend)
      api.get('/customer/all').then(res => {
        if (res.data.customers) setAllCustomers(res.data.customers)
      }).catch(() => {})

      // Set next bill number directly from response (avoid extra API call)
      const createdBillNumber = response.data.bill?.bill_number || response.data.bill_number
      if (createdBillNumber) {
        setNextBillNumber(createdBillNumber + 1)
      }

      // Clear the completed tab from storage and remove it (skip loadInitialData since we already have next number)
      clearDraftFromStorage(activeTabId)
      closeTabWithoutReload(activeTabId)
    } catch (error: any) {
      console.error('[BILLING] Error:', error)
      toast.error(error.response?.data?.error || error.message || 'Failed to create bill')
    } finally {
      setLoading(false)
    }
  }


  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        {/* Draft Restored Notification */}
        {showDraftRestored && (
          <div className="mb-2 p-2 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                Draft bill restored! Your previous work has been recovered.
              </span>
            </div>
            <button
              onClick={() => setShowDraftRestored(false)}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Multi-Tab Header */}
        <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 mb-2">
          <div className="flex items-center gap-1 p-1 overflow-x-auto">
            {billTabs.map((tab, index) => (
              <div
                key={tab.id}
                className={`flex items-center gap-1 px-3 py-1.5 rounded cursor-pointer transition ${
                  tab.id === activeTabId
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span className="text-xs font-semibold whitespace-nowrap">
                  Bill #{index + 1} {tab.customer_name && `- ${tab.customer_name}`}
                </span>
                {billTabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                    className="ml-1 hover:bg-red-500 hover:bg-opacity-20 rounded p-0.5"
                    title="Close tab"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addNewTab}
              className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition text-xs font-semibold whitespace-nowrap"
              title="Add new bill"
            >
              + New Bill
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          {/* Bill Info Container */}
          <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700">
            {/* Bill Number, Toggle, and Date Header */}
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">
                  Bill Number
                </span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  #{nextBillNumber || '...'}
                </span>
              </div>

              {/* Centered List / Cards Toggle */}
              <div className="flex flex-col items-center gap-0.5">
                <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === 'list'
                        ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    <span>List</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('card')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === 'card'
                        ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    <span>Cards</span>
                  </button>
                </div>
                <span className="text-[9px] text-gray-400 dark:text-gray-500 hidden sm:block">F3 to toggle</span>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Date</span>
                <input
                  type="date"
                  value={billDate.toISOString().split('T')[0]}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    if (e.target.value) {
                      const newDate = new Date(e.target.value)
                      // Preserve current time
                      newDate.setHours(billDate.getHours(), billDate.getMinutes(), billDate.getSeconds())
                      setBillDate(newDate)
                    }
                  }}
                  className="text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Barcode Scanner - HIDDEN BUT FUNCTIONAL */}
            <div className="hidden">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeScanned}
                placeholder="Scan or type barcode/item code and press Enter..."
                className="w-full px-2 py-2 border border-blue-400 dark:border-blue-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-blue-900 font-mono text-sm text-gray-900 dark:text-white"
              />
            </div>

            {/* Customer Info */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 p-2 relative">
              {/* Customer No */}
              <div className="md:col-span-2 relative customer-search-container">
                <label className="block text-base font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Customer No
                </label>
                <input
                  ref={customerCodeRef}
                  type="text"
                  placeholder="100+"
                  value={activeTab.customer_code}
                  onChange={(e) => handleCustomerFieldChange('code', e.target.value)}
                  onFocus={() => { setCustomerSearchField('code'); filterCustomers(activeTab.customer_code, 'code') }}
                  onBlur={async (e) => {
                    // Auto-lookup by exact code when leaving field
                    if (activeTab.customer_code && !activeTab.customer_name) {
                      await lookupCustomerByCode(activeTab.customer_code)
                    }
                    handleCustomerBlur(e)
                  }}
                  onKeyDown={async (e) => {
                    // First check if dropdown navigation should handle it
                    if (handleCustomerKeyDown(e, 'code')) {
                      return
                    }
                    // Otherwise handle Enter for direct lookup
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const found = await lookupCustomerByCode(activeTab.customer_code)
                      if (found) {
                        discountRef.current?.focus()
                      } else {
                        customerNameRef.current?.focus()
                      }
                    }
                  }}
                  className="w-full p-2 text-xs border-2 border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 capitalize"
                />
                {/* Customer Dropdown for Code field */}
                {showCustomerDropdown && customerSearchField === 'code' && customerSuggestions.length > 0 && (
                  <div className="absolute z-50 w-64 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {customerSuggestions.map((customer, index) => (
                      <div
                        key={customer.customer_id}
                        // Select on MOUSEDOWN, not click: the input's blur closes the
                        // dropdown 150ms after mousedown — a slow click (mouseup later)
                        // would land on a vanished row and select nothing.
                        onMouseDown={(e) => { e.preventDefault(); selectCustomer(customer) }}
                        className={`px-3 py-2 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${
                          index === selectedCustomerIndex
                            ? 'bg-blue-100 dark:bg-blue-900'
                            : 'hover:bg-blue-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">#{customer.customer_code}</span>
                            <span className="text-sm text-gray-900 dark:text-white ml-2">{customer.customer_name}</span>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{customer.customer_phone}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer Name */}
              <div className="md:col-span-2 relative customer-search-container">
                <label className="block text-base font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Customer Name
                </label>
                <input
                  ref={customerNameRef}
                  type="text"
                  placeholder="Optional"
                  value={activeTab.customer_name}
                  onChange={(e) => handleCustomerFieldChange('name', e.target.value)}
                  onFocus={() => { setCustomerSearchField('name'); filterCustomers(activeTab.customer_name, 'name') }}
                  onBlur={handleCustomerBlur}
                  onKeyDown={(e) => {
                    if (!handleCustomerKeyDown(e, 'name')) {
                      handleEnterNavigation(e, customerPhoneRef)
                    }
                  }}
                  className="w-full p-2 text-xs border-2 border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 capitalize"
                />
                {/* Customer Dropdown for Name field */}
                {showCustomerDropdown && customerSearchField === 'name' && customerSuggestions.length > 0 && (
                  <div className="absolute z-50 w-72 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {customerSuggestions.map((customer, index) => (
                      <div
                        key={customer.customer_id}
                        // Select on MOUSEDOWN, not click: the input's blur closes the
                        // dropdown 150ms after mousedown — a slow click (mouseup later)
                        // would land on a vanished row and select nothing.
                        onMouseDown={(e) => { e.preventDefault(); selectCustomer(customer) }}
                        className={`px-3 py-2 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${
                          index === selectedCustomerIndex
                            ? 'bg-blue-100 dark:bg-blue-900'
                            : 'hover:bg-blue-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{customer.customer_name}</span>
                            <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">#{customer.customer_code}</span>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{customer.customer_phone}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Phone */}
              <div className="md:col-span-2 relative customer-search-container">
                <label className="block text-base font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Phone {activeTab.customer_name?.trim() && <span className="text-red-500">*</span>}
                </label>
                <input
                  ref={customerPhoneRef}
                  type="tel"
                  placeholder={activeTab.customer_name?.trim() ? "Required" : "Optional"}
                  value={activeTab.customer_phone}
                  onChange={(e) => handleCustomerFieldChange('phone', e.target.value)}
                  onFocus={() => { setCustomerSearchField('phone'); filterCustomers(activeTab.customer_phone, 'phone') }}
                  onBlur={handleCustomerBlur}
                  onKeyDown={(e) => {
                    if (!handleCustomerKeyDown(e, 'phone')) {
                      handleEnterNavigation(e, customerGstinRef)
                    }
                  }}
                  className="w-full p-2 text-xs border-2 border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                />
                {/* Customer Dropdown for Phone field */}
                {showCustomerDropdown && customerSearchField === 'phone' && customerSuggestions.length > 0 && (
                  <div className="absolute z-50 w-64 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {customerSuggestions.map((customer, index) => (
                      <div
                        key={customer.customer_id}
                        // Select on MOUSEDOWN, not click: the input's blur closes the
                        // dropdown 150ms after mousedown — a slow click (mouseup later)
                        // would land on a vanished row and select nothing.
                        onMouseDown={(e) => { e.preventDefault(); selectCustomer(customer) }}
                        className={`px-3 py-2 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${
                          index === selectedCustomerIndex
                            ? 'bg-blue-100 dark:bg-blue-900'
                            : 'hover:bg-blue-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{customer.customer_phone}</span>
                            <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">#{customer.customer_code}</span>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{customer.customer_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer tax registration number (GSTIN for India, VAT/Tax No. elsewhere) */}
              <div className="md:col-span-2">
                <label className="block text-base font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {taxLabel === 'GST' ? 'Customer GSTIN' : `Customer ${taxLabel} No.`}
                </label>
                <input
                  ref={customerGstinRef}
                  type="text"
                  placeholder={taxLabel === 'GST' ? 'Optional GSTIN' : `Optional ${taxLabel} No.`}
                  value={activeTab.customer_gstin}
                  onChange={(e) => updateActiveTab({ customer_gstin: e.target.value })}
                  onKeyDown={(e) => handleEnterNavigation(e, productSearchRef)}
                  className="w-full p-2 text-xs border-2 border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                />
              </div>

              {/* Membership card — lookup, tier discount, point redemption */}
              <div className="md:col-span-4">
              <MembershipBillingPanel
                customerPhone={activeTab.customer_phone || ''}
                customerName={activeTab.customer_name || ''}
                attachedCardId={activeTab.membershipCardId}
                redeemPoints={activeTab.membershipRedeemPoints || 0}
                billPayableBeforeRedeem={billTotals.grandTotal + (billTotals.membershipRedeemValue || 0)}
                onApply={(result: CardLookupResult) => {
                  const applyTierDiscount = !activeTab.useNegotiablePrice
                  updateActiveTab({
                    membershipCardId: result.card.card_id,
                    membershipRedemptionRate: result.tier?.redemption_rate ?? undefined,
                    discountPercentage: applyTierDiscount
                      ? (result.tier?.discount_percentage ?? activeTab.discountPercentage)
                      : activeTab.discountPercentage,
                  })
                }}
                onRedeemChange={(points) => updateActiveTab({ membershipRedeemPoints: points })}
                onRemove={() => updateActiveTab({
                  membershipCardId: undefined,
                  membershipRedeemPoints: 0,
                  membershipRedemptionRate: undefined,
                })}
              />
              </div>
            </div>

            {viewMode === 'list' ? (
            /* Manual Product Selection Row */
            <div
              className={`border-t border-gray-200 dark:border-gray-700 p-2 ${
                isNewProduct
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'bg-gray-50 dark:bg-gray-900'
              }`}
            >
              {isNewProduct && (
                <div className="mb-2 p-2 bg-green-100 dark:bg-green-900/40 rounded-lg border border-green-300 dark:border-green-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded font-bold">NEW</span>
                      <span className="font-semibold text-gray-900 dark:text-white text-sm">{currentItem.product_name}</span>
                    </div>
                    {currentItem.item_code && (
                      <span className="font-mono text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300">
                        {currentItem.item_code}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap md:flex-nowrap gap-2 items-end">
                <div className="flex-1 min-w-[200px] relative product-search-container">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Search Product (F2)
                  </label>
                  <input
                    ref={productSearchRef}
                    type="text"
                    placeholder="Type To Search Product..."
                    value={productSearch}
                    onChange={handleProductSearchChange}
                    onFocus={() => setShowProductDropdown(true)}
                    onKeyDown={(e) => {
                      // If Enter is pressed without a product, move to Amount Received
                      if (e.key === 'Enter' && !productSearch.trim() && !currentItem.product_name) {
                        e.preventDefault()
                        // Move to Amount Received field
                        amountReceivedRef.current?.focus()
                        amountReceivedRef.current?.select()
                      } else {
                        handleProductSearchKeyDown(e)
                      }
                    }}
                    className="w-full px-3 py-2.5 text-base border-2 border-blue-400 dark:border-blue-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 capitalize font-medium shadow-sm"
                  />
                  {/* Dropdown List */}
                  {showProductDropdown && productSearch && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {productsLoading ? (
                        <div className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">Loading products...</span>
                          </div>
                          {products.length === 0 && (
                            <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
                              Retrying connection...
                            </div>
                          )}
                        </div>
                      ) : filteredProducts.length > 0 ? (
                        <>
                          {filteredProducts.map((product, index) => (
                            <div
                              key={product.product_id}
                              onClick={() => handleProductSelect(product)}
                              className={`px-3 py-2 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${
                                hasUsedArrowKeys && index === selectedProductIndex
                                  ? 'bg-blue-100 dark:bg-blue-900'
                                  : 'hover:bg-blue-50 dark:hover:bg-gray-700'
                              }`}
                              style={{ fontFamily: "'Times New Roman', Times, serif" }}
                            >
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="text-sm font-medium text-gray-900 dark:text-white uppercase">
                                    {product.product_name}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    Code: {product.item_code || 'N/A'} | Stock: {product.quantity} |
                                    {' '}{taxLabel}: {product.gst_percentage}%
                                    {product.mrp && (
                                      <span className="ml-2 font-semibold text-orange-600 dark:text-orange-400">
                                        | MRP: {cur}{Number(product.mrp).toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                  {cur}{Number(product.rate).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : productSearch.trim().length > 0 ? (
                        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700">
                          <div className="text-xs text-blue-700 dark:text-blue-400 mb-1.5 font-medium">
                            💡 No stock product selected
                          </div>
                          <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                            &quot;{productSearch.trim()}&quot;
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            Click <span className="font-semibold text-blue-600 dark:text-blue-400">+ Add</span> to create as new product, or use <span className="font-semibold">↓ Arrow</span> to select from stock above.
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                {isMobile && supportsCamera && (
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0 self-end mb-0.5"
                    title="Scan Barcode"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
                <div className="w-24">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Quantity
                  </label>
                  <input
                    ref={quantityInputRef}
                    type="number"
                    min="1"
                    placeholder="1"
                    value={currentItem.quantity}
                    onChange={(e) => {
                      const qty = parseInt(e.target.value) || 1
                      setCurrentItem({ ...currentItem, quantity: qty })
                      if (!isNewProduct && Boolean(currentItem.product_id) && availableStock === 0) {
                        setStockWarning('🚫 OUT OF STOCK - Cannot add this item!')
                      } else if (
                        !isNewProduct &&
                        Boolean(currentItem.product_id) &&
                        qty > availableStock
                      ) {
                        setStockWarning(`⚠️ Only ${availableStock} available in stock!`)
                      } else {
                        setStockWarning('')
                      }
                    }}
                    onKeyDown={(e) => handleKeyPress(e, 'quantity')}
                    disabled={!isNewProduct && Boolean(currentItem.product_id) && availableStock === 0}
                    className={`w-full px-3 py-2.5 text-base border-2 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white font-medium ${
                      !isNewProduct && currentItem.product_id && availableStock === 0
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-600 cursor-not-allowed'
                        : stockWarning
                        ? 'bg-white dark:bg-gray-700 border-red-500 dark:border-red-600'
                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                    }`}
                  />
                </div>
                <div className="w-28">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Rate
                  </label>
                  <input
                    ref={rateInputRef}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={currentItem.rate || ''}
                    onChange={(e) =>
                      setCurrentItem({ ...currentItem, rate: parseFloat(e.target.value) || 0 })
                    }
                    onKeyDown={(e) => handleKeyPress(e, 'rate')}
                    className="w-full px-3 py-2.5 text-base border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 font-medium"
                    title="Enter rate"
                  />
                </div>
                {/* GST% field - Hidden for non-GST only users */}
                {!nonGstOnly && (
                  <div className="w-20">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      {taxLabel}%
                    </label>
                    <input
                      ref={gstInputRef}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={currentItem.gst_percentage || ''}
                      onChange={(e) =>
                        setCurrentItem({
                          ...currentItem,
                          gst_percentage: parseFloat(e.target.value) || 0,
                        })
                      }
                      onKeyDown={(e) => handleKeyPress(e, 'gst')}
                      className="w-full px-3 py-2.5 text-base border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 font-medium"
                      title={`Enter ${taxLabel} %`}
                    />
                  </div>
                )}
                <div className="w-20">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1" title="Customer discount % — off the rate, before GST. Pre-fills from the product.">
                    Disc %
                  </label>
                  <input
                    ref={lineDiscountInputRef}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    value={currentItem.discount_percentage || ''}
                    onChange={(e) =>
                      setCurrentItem({
                        ...currentItem,
                        discount_percentage: Math.min(Math.max(parseFloat(e.target.value) || 0, 0), 100),
                      })
                    }
                    onKeyDown={(e) => handleKeyPress(e, 'discount')}
                    className="w-full px-3 py-2.5 text-base border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 font-medium"
                    title="Customer discount %"
                  />
                  {(currentItem.discount_percentage || 0) > 0 && currentItem.rate > 0 && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      Net {cur}{(currentItem.rate * (1 - (currentItem.discount_percentage || 0) / 100)).toFixed(2)}
                    </p>
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={addItem}
                    disabled={
                      !isNewProduct && Boolean(currentItem.product_id) && availableStock === 0
                    }
                    className={`px-5 py-2.5 rounded-lg transition font-semibold text-base whitespace-nowrap shadow-sm ${
                      !isNewProduct && currentItem.product_id && availableStock === 0
                        ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                    title={
                      !isNewProduct && currentItem.product_id && availableStock === 0
                        ? 'Out of stock'
                        : 'Add item'
                    }
                  >
                    {!isNewProduct && currentItem.product_id && availableStock === 0
                      ? 'Out'
                      : '+ Add'}
                  </button>
                </div>
              </div>

              {/* Stock Warning */}
              {(stockWarning ||
                (!isNewProduct && Boolean(currentItem.product_id) && availableStock > 0)) && (
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex-1">
                    {stockWarning && (
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                        {stockWarning}
                      </p>
                    )}
                    {!isNewProduct && Boolean(currentItem.product_id) && availableStock > 0 && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-normal">
                        Available Stock: {availableStock}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            ) : (
              <ProductCardGrid
                products={products}
                billItems={activeTab.items}
                onProductTap={addProductToItems}
                isLoading={productsLoading}
              />
            )}
          </div>

          {/* Items Display - Table on desktop, Cards on mobile */}
          <div className="hidden md:block">
          {/* Items Table */}
          <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full border-collapse min-w-[900px]">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10 border-b border-gray-300 dark:border-gray-600">
                  <tr>
                    <th className="px-1 py-1 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-8">
                      #
                    </th>
                    <th className="px-1 py-1 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-20">
                      Code
                    </th>
                    <th className="px-1 py-1 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700">
                      Product Name
                    </th>
                    <th className="px-1 py-1 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-12">
                      Unit
                    </th>
                    <th className="px-1 py-1 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-16">
                      Qty
                    </th>
                    <th className="px-1 py-1 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-20">
                      Rate
                    </th>
                    <th className="px-1 py-1 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-16" title="Customer discount % — off the rate, before GST">
                      Disc %
                    </th>
                    {showGstColumns() && (
                      <>
                        <th className="px-1 py-1 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-14">
                          {taxLabel}%
                        </th>
                        <th className="px-1 py-1 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-20">
                          {taxLabel}
                        </th>
                      </>
                    )}
                    <th className="px-1 py-1 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-24">
                      Total
                    </th>
                    {/* Save column removed - quick products are not saved to stock */}
                    <th className="px-1 py-1 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase w-10">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800">
                  {activeTab.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={showGstColumns() ? 11 : 9}
                        className="px-2 py-12 text-center text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <svg
                            className="w-12 h-12 text-gray-300 dark:text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                            />
                          </svg>
                          <p className="text-sm font-medium text-gray-400 dark:text-gray-500">
                            No items added
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            Scan barcode or select product
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    activeTab.items.map((item, index) => (
                      <tr
                        key={index}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-700"
                      >
                        <td className="px-1 py-0.5 text-xs text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-600 font-medium text-center">
                          {index + 1}
                        </td>
                        <td className="px-1 py-0.5 text-xs text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-600 font-mono">
                          {item.item_code || '-'}
                        </td>
                        <td className="px-1 py-0.5 text-xs border-r border-gray-200 dark:border-gray-700 overflow-visible">
                          <div className="flex items-center gap-1 relative">
                            <span
                              className="cost-tooltip-trigger font-bold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors relative"
                              onClick={(e) => {
                                if (item.cost_price) {
                                  // Clear previous timeout if exists
                                  if (tooltipTimeoutId) {
                                    clearTimeout(tooltipTimeoutId)
                                    setTooltipTimeoutId(null)
                                  }

                                  // Toggle tooltip or show new one
                                  if (showCostTooltip === index) {
                                    // Clicking same item - close tooltip
                                    setShowCostTooltip(null)
                                  } else {
                                    // Show new tooltip
                                    setShowCostTooltip(index)
                                    // Set new timeout
                                    const timeoutId = setTimeout(() => {
                                      setShowCostTooltip(null)
                                      setTooltipTimeoutId(null)
                                    }, 5000)
                                    setTooltipTimeoutId(timeoutId)
                                  }
                                }
                              }}
                            >
                              {item.product_name}
                              {showCostTooltip === index && item.mrp && (
                                <span
                                  className={`cost-tooltip absolute left-0 ${
                                    index >= activeTab.items.length - 2
                                      ? 'bottom-full mb-1'
                                      : 'top-full mt-1'
                                  } bg-orange-600 text-white px-3 py-1.5 rounded-md shadow-xl text-xs font-semibold whitespace-nowrap animate-fade-in`}
                                  style={{ zIndex: 9999 }}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    MRP: {cur}{Number(item.mrp).toFixed(2)}
                                  </span>
                                  <span
                                    className={`absolute left-3 w-2 h-2 bg-orange-600 transform rotate-45 ${
                                      index >= activeTab.items.length - 2
                                        ? '-bottom-1'
                                        : '-top-1'
                                    }`}
                                  ></span>
                                </span>
                              )}
                            </span>
                            {item.product_id === 'new-product-temp' && (
                              <span className="inline-flex items-center px-1 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border border-green-300 dark:border-green-700">
                                NEW
                              </span>
                            )}
                            {item.limitedByStock && (
                              <span className="inline-flex items-center px-1 py-0.5 rounded text-xs font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 border border-orange-300 dark:border-orange-700">
                                Limited
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-1 py-0.5 text-xs text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 text-center">
                          {item.unit || 'pcs'}
                        </td>
                        <td className="px-1 py-0.5 text-xs border-r border-gray-200 dark:border-gray-700">
                          <input
                            type="number"
                            min="1"
                            title="Quantity"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItemQuantity(index, parseInt(e.target.value) || 1)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                // If this is the last item, focus on product search
                                if (index === activeTab.items.length - 1) {
                                  productSearchRef.current?.focus()
                                } else {
                                  // Move to the next row's quantity input
                                  const nextQuantityInput = document.querySelectorAll('input[title="Quantity"]')[index + 1] as HTMLInputElement
                                  nextQuantityInput?.focus()
                                  nextQuantityInput?.select()
                                }
                              }
                            }}
                            className="w-full px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 font-medium text-xs"
                          />
                        </td>
                        <td className="px-1 py-0.5 text-xs text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 text-right font-semibold">
                          {cur}{Number(item.rate).toFixed(2)}
                        </td>
                        <td className="px-1 py-0.5 text-xs border-r border-gray-200 dark:border-gray-700">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            title="Customer discount % (off rate, before GST)"
                            value={item.discount_percentage || ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateItemDiscount(index, parseFloat(e.target.value) || 0)
                            }
                            className="w-full px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 font-medium text-xs"
                          />
                        </td>
                        {showGstColumns() && (
                          <>
                            <td className="px-1 py-0.5 text-xs border-r border-gray-200 dark:border-gray-700 text-center">
                              <span
                                className={`inline-block px-1 py-0.5 rounded text-xs font-semibold ${
                                  item.gst_percentage > 0
                                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                }`}
                              >
                                {item.gst_percentage}%
                              </span>
                            </td>
                            <td className="px-1 py-0.5 text-xs text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 text-right font-medium">
                              {cur}{item.gst_amount.toFixed(2)}
                            </td>
                          </>
                        )}
                        <td className="px-1 py-0.5 text-xs text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 text-right font-bold">
                          {cur}{item.amount.toFixed(2)}
                        </td>
                        {/* Save checkbox removed - quick products are not saved to stock */}
                        <td className="px-1 py-0.5 text-xs text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 p-0.5 rounded transition"
                            title="Delete"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
          <div className="block md:hidden">
            <MobileCartList
              items={activeTab.items}
              showGst={showGstColumns()}
              onUpdateQuantity={updateItemQuantity}
              onRemoveItem={(index) => removeItem(index)}
            />
          </div>

          {/* Profit Summary - Owner only */}
          <ProfitSummaryBar
            items={activeTab.items}
            userRole={user?.role || 'staff'}
          />

          {/* Payment Splits Section - MULTI-PAYMENT */}
          <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-2">
            <div className="mb-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">
                Payment Methods (Split Payment)
              </h3>

              {/* Amount Received & Discount - Side by Side */}
              <div className="flex flex-wrap items-center gap-4 md:gap-6 mb-3 bg-gray-50 dark:bg-gray-900 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                {/* Received */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Received:
                  </label>
                  <input
                    ref={amountReceivedRef}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={activeTab.amountReceived || ''}
                    onChange={(e) =>
                      updateActiveTab({ amountReceived: parseFloat(e.target.value) || 0 })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        // Move to Negotiable/Discount field
                        const discountInput = document.querySelector('input[placeholder="Final amount"], input[placeholder="Enter %"]') as HTMLInputElement
                        if (discountInput) {
                          discountInput.focus()
                          discountInput.select()
                        }
                      }
                    }}
                    className="w-36 px-3 py-2 text-sm border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 font-bold"
                  />
                </div>

                {/* Divider */}
                <div className="h-10 w-px bg-gray-300 dark:bg-gray-600"></div>

                {/* Discount/Negotiable */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-blue-700 dark:text-blue-300 font-semibold">
                    {activeTab.useNegotiablePrice ? `Negotiable ${cur}` : 'Discount %'}
                  </label>
                  {activeTab.useNegotiablePrice ? (
                    <input
                      ref={negotiableAmountRef}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Final amount"
                      value={activeTab.negotiableAmount || ''}
                      onChange={(e) =>
                        updateActiveTab({ negotiableAmount: parseFloat(e.target.value) || 0 })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          // Add payment split and focus on it
                          if (activeTab.payment_splits.length === 0) {
                            addPaymentSplit()
                            setTimeout(() => {
                              const firstAmountInput = document.querySelector('input[placeholder="Amount"]') as HTMLInputElement
                              firstAmountInput?.focus()
                              firstAmountInput?.select()
                            }, 100)
                          } else {
                            const firstPaymentSelect = document.querySelector('select[title="Select payment type"]') as HTMLSelectElement
                            firstPaymentSelect?.focus()
                          }
                        }
                      }}
                      className="w-36 px-3 py-2 text-sm font-bold border-2 border-blue-400 dark:border-blue-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                    />
                  ) : (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="Enter %"
                      title="Bill-level discount % (applies after per-item discounts)"
                      value={activeTab.discountPercentage || ''}
                      onChange={(e) =>
                        updateActiveTab({ discountPercentage: parseFloat(e.target.value) || 0 })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          // Add payment split and focus on it
                          if (activeTab.payment_splits.length === 0) {
                            addPaymentSplit()
                            setTimeout(() => {
                              const firstAmountInput = document.querySelector('input[placeholder="Amount"]') as HTMLInputElement
                              firstAmountInput?.focus()
                              firstAmountInput?.select()
                            }, 100)
                          } else {
                            const firstPaymentSelect = document.querySelector('select[title="Select payment type"]') as HTMLSelectElement
                            firstPaymentSelect?.focus()
                          }
                        }
                      }}
                      className="w-28 px-3 py-2 text-sm font-bold border-2 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 border-blue-400 dark:border-blue-600"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      updateActiveTab({
                        useNegotiablePrice: !activeTab.useNegotiablePrice,
                        discountPercentage: 0,
                        negotiableAmount: 0
                      })
                    }}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-bold px-2 py-1 bg-blue-50 dark:bg-blue-900/30 rounded"
                    title={activeTab.useNegotiablePrice ? 'Switch to Discount %' : `Switch to Negotiable ${cur}`}
                  >
                    {activeTab.useNegotiablePrice ? '% Off' : `${cur} Price`}
                  </button>
                </div>
                {billTotals.hasLineDiscount && !activeTab.useNegotiablePrice && (activeTab.discountPercentage || 0) > 0 && (
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
                    Bill discount applies on top of the per-item discounts.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Payment Splits:
                </label>
                <button
                  type="button"
                  onClick={addPaymentSplit}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-xs font-semibold"
                >
                  + Add Payment
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {activeTab.payment_splits.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                  No payment methods added. Click &quot;+ Add Payment&quot; to add payment splits.
                </p>
              ) : (
                activeTab.payment_splits.map((split, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <div className="flex-1 relative">
                      <select
                        value={split.payment_type}
                        onChange={(e) => {
                          // Just update the value, stay in dropdown
                          updatePaymentSplit(index, 'payment_type', e.target.value)
                        }}
                        onFocus={(e) => {
                          // Auto-open dropdown on focus
                          e.target.size = paymentTypes.length + 1
                        }}
                        onBlur={(e) => {
                          e.target.size = 1
                        }}
                        onKeyDown={(e) => {
                          const select = e.currentTarget as HTMLSelectElement
                          // Only Enter closes dropdown and moves to amount
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            select.size = 1
                            if (split.payment_type) {
                              const amountInput = select.parentElement?.nextElementSibling?.querySelector('input')
                              amountInput?.focus()
                              setTimeout(() => {
                                (amountInput as HTMLInputElement)?.select()
                              }, 50)
                            }
                          } else if (e.key === 'Escape') {
                            select.size = 1
                            select.blur()
                          }
                          // Arrow Up/Down navigate options naturally
                        }}
                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:absolute focus:z-50 focus:shadow-lg"
                        title="Select payment type"
                      >
                        <option value="">-- Select --</option>
                        {paymentTypes.map((pt) => (
                          <option key={pt} value={pt}>
                            {pt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-32">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Amount"
                        value={split.amount || ''}
                        onChange={(e) =>
                          updatePaymentSplit(index, 'amount', e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (e.shiftKey) {
                              // Shift+Enter: Add another payment split
                              addPaymentSplit()
                              setTimeout(() => {
                                const allSelects = document.querySelectorAll('select[title="Select payment type"]')
                                const lastSelect = allSelects[allSelects.length - 1] as HTMLSelectElement
                                lastSelect?.focus()
                              }, 100)
                            } else {
                              // Enter: Check if there are incomplete payment splits
                              const allSelects = document.querySelectorAll('select[title="Select payment type"]')
                              const allAmounts = document.querySelectorAll('input[placeholder="Amount"]')

                              // FIRST: Check ALL payment type dropdowns
                              for (let i = 0; i < activeTab.payment_splits.length; i++) {
                                const ps = activeTab.payment_splits[i]
                                if (!ps.payment_type) {
                                  // Focus on the dropdown that needs payment type
                                  (allSelects[i] as HTMLSelectElement)?.focus()
                                  return
                                }
                              }

                              // SECOND: Check ALL amounts (only after all types are filled)
                              for (let i = 0; i < activeTab.payment_splits.length; i++) {
                                const ps = activeTab.payment_splits[i]
                                if (!ps.amount || ps.amount === 0) {
                                  // Focus on the amount input that needs value
                                  (allAmounts[i] as HTMLInputElement)?.focus()
                                  ;(allAmounts[i] as HTMLInputElement)?.select()
                                  return
                                }
                              }

                              // All complete, go to Print Bill
                              printButtonRef.current?.focus()
                            }
                          } else if (e.key === 'Tab' && !e.shiftKey) {
                            // Tab: Move to next incomplete or add new payment if last
                            const isLast = index === activeTab.payment_splits.length - 1
                            if (isLast) {
                              // Check if there are incomplete payments before adding new
                              const allSelects = document.querySelectorAll('select[title="Select payment type"]')
                              const allAmounts = document.querySelectorAll('input[placeholder="Amount"]')

                              for (let i = 0; i < activeTab.payment_splits.length; i++) {
                                const ps = activeTab.payment_splits[i]
                                if (!ps.payment_type) {
                                  e.preventDefault()
                                  ;(allSelects[i] as HTMLSelectElement)?.focus()
                                  return
                                }
                                if (i !== index && (!ps.amount || ps.amount === 0)) {
                                  e.preventDefault()
                                  ;(allAmounts[i] as HTMLInputElement)?.focus()
                                  ;(allAmounts[i] as HTMLInputElement)?.select()
                                  return
                                }
                              }
                            }
                          }
                        }}
                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removePaymentSplit(index)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-1"
                      title="Remove payment"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))
              )}
              {activeTab.payment_splits.length > 0 && (
                <div className="border-t border-gray-300 dark:border-gray-600 pt-2 mt-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-gray-700 dark:text-gray-300">Total Payment Splits:</span>
                    <span
                      className={`${
                        Math.abs(getTotalPaymentSplits() - billTotals.grandTotal) < 0.01
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {cur}{getTotalPaymentSplits().toFixed(2)}
                    </span>
                  </div>
                  {/* Balance to Collect or Change to Give */}
                  {getTotalPaymentSplits() > 0 && Math.abs(getTotalPaymentSplits() - billTotals.grandTotal) >= 0.01 && (
                    <div className="flex justify-between text-xs font-bold mt-1 py-1 px-2 rounded bg-orange-50 dark:bg-orange-900/20">
                      <span className={getTotalPaymentSplits() < billTotals.grandTotal ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                        {getTotalPaymentSplits() < billTotals.grandTotal ? '⚠️ Balance to Collect:' : '💰 Change to Give:'}
                      </span>
                      <span className={getTotalPaymentSplits() < billTotals.grandTotal ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                        {cur}{Math.abs(billTotals.grandTotal - getTotalPaymentSplits()).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* UPI QR is intentionally not rendered on screen — it is printed on
                  the receipt instead (see webPrintService "Scan to Pay" block). */}
            </div>
          </div>

          {/* Mobile summary strip - visible only on mobile */}
          <div className="md:hidden flex flex-col gap-2 px-3 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 sticky bottom-16">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{cur}{billTotals.grandTotal?.toLocaleString()}</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-2 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm whitespace-nowrap"
              >
                {loading ? '...' : 'Print'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={(e) => handleSubmit(e as any, false, true)}
                title="Save the bill without printing"
                className="px-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm whitespace-nowrap"
              >
                {loading ? '...' : 'Save'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={(e) => handleSubmit(e as any, true)}
                title="Save bill without payment — mark as Payment Pending"
                className="px-2 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm whitespace-nowrap"
              >
                Pending
              </button>
              <button
                type="button"
                onClick={handleClearBill}
                className="px-2 py-2.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm whitespace-nowrap"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Bottom Section - Totals & Actions */}
          <div className="hidden md:block bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 p-2">
              {/* Summary Cards - Left Side */}
              <div className="lg:col-span-2 grid grid-cols-2 gap-2">
                <div className="bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                    Total Items
                  </div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">
                    {activeTab.items.length}
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                    Total Qty
                  </div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">
                    {activeTab.items.reduce((sum, item) => sum + item.quantity, 0)}
                  </div>
                </div>
              </div>

              {/* Billing Summary - Middle */}
              <div className="lg:col-span-6 bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                      Subtotal:
                    </span>
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">
                      {cur}{billTotals.subtotal.toFixed(2)}
                    </span>
                  </div>
                  {showGstColumns() && billTotals.totalGST > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                        Total {taxLabel}:
                      </span>
                      <span className="text-xs font-semibold text-gray-900 dark:text-white">
                        {cur}{billTotals.totalGST.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {activeTab.discountPercentage > 0 && (
                    <div className="flex justify-between items-center border-t border-gray-300 dark:border-gray-600 pt-1">
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                        Discount ({activeTab.discountPercentage}%):
                      </span>
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                        - {cur}{billTotals.discountAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {activeTab.useNegotiablePrice && activeTab.negotiableAmount > 0 && (
                    <div className="flex justify-between items-center border-t border-gray-300 dark:border-gray-600 pt-1">
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                        Negotiable:
                      </span>
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                        - {cur}{activeTab.negotiableAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {(billTotals.membershipRedeemValue || 0) > 0 && (
                    <div className="flex justify-between items-center border-t border-gray-300 dark:border-gray-600 pt-1">
                      <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                        Points Redeemed ({activeTab.membershipRedeemPoints} pts):
                      </span>
                      <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                        - {cur}{(billTotals.membershipRedeemValue || 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {billTotals.roundOff !== 0 && (
                    <div className="flex justify-between items-center border-t border-gray-300 dark:border-gray-600 pt-1">
                      <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                        Round Off:
                      </span>
                      <span className={`text-xs font-semibold ${billTotals.roundOff > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {billTotals.roundOff > 0 ? '+' : ''}{billTotals.roundOff.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-t border-gray-400 dark:border-gray-600 pt-1 mt-1">
                    <span className="text-sm text-gray-900 dark:text-white font-bold">
                      Grand Total:
                    </span>
                    <span className="text-lg font-bold text-green-700 dark:text-green-400">
                      {cur}{billTotals.grandTotal.toFixed(2)}
                    </span>
                  </div>
                  {activeTab.amountReceived > 0 && (
                    <>
                      <div className="flex justify-between items-center border-t border-gray-300 dark:border-gray-600 pt-1">
                        <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">
                          Received:
                        </span>
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                          {cur}{activeTab.amountReceived.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-purple-700 dark:text-purple-400 font-medium">
                          Balance:
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            billTotals.balance >= 0
                              ? 'text-purple-700 dark:text-purple-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {cur}{billTotals.balance.toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Actions - Right Side */}
              <div className="lg:col-span-4 flex flex-row flex-nowrap items-center gap-2">
                <button
                  ref={printButtonRef}
                  type="submit"
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !loading) {
                      e.preventDefault()
                      handleSubmit(e as any)
                    }
                  }}
                  className="flex-1 min-w-0 whitespace-nowrap px-3 py-2 bg-green-600 dark:bg-green-700 text-white rounded hover:bg-green-700 dark:hover:bg-green-800 transition disabled:bg-gray-400 dark:disabled:bg-gray-600 font-bold text-sm shadow-md hover:shadow-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
                >
                  {loading ? '...' : 'Print Bill'}
                </button>
                {/* Save without printing */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={(e) => handleSubmit(e as any, false, true)}
                  title="Save the bill without printing"
                  className="flex-1 min-w-0 whitespace-nowrap px-3 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-800 transition disabled:bg-gray-400 dark:disabled:bg-gray-600 font-bold text-sm shadow-md hover:shadow-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {loading ? '...' : 'Save'}
                </button>
                {/* Save as Pending */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={(e) => handleSubmit(e as any, true)}
                  title="Save bill without payment — mark as Payment Pending"
                  className="flex-1 min-w-0 whitespace-nowrap px-3 py-2 bg-amber-500 dark:bg-amber-600 text-white rounded hover:bg-amber-600 dark:hover:bg-amber-700 transition disabled:bg-gray-400 dark:disabled:bg-gray-600 font-bold text-sm shadow-md hover:shadow-lg focus:ring-2 focus:ring-amber-400 focus:outline-none flex items-center justify-center"
                >
                  {loading ? '...' : 'Pending'}
                </button>
                {isMobile && supportsWebBluetooth && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!bluetoothPrinterService.isConnected) {
                        // Prompt user to pair a printer
                        try {
                          const device = await bluetoothPrinterService.requestDevice()
                          if (!device) return
                          const connected = await bluetoothPrinterService.connect(device)
                          if (!connected) {
                            toast.error('Failed to connect to printer. Please try again.')
                            return
                          }
                        } catch (err) {
                          toast.error('Bluetooth pairing failed: ' + (err as Error).message)
                          return
                        }
                      }
                      const receiptData = {
                        shopName: shopSettings?.shop_name || client?.client_name || '',
                        address1: shopSettings?.address1 || client?.address || '',
                        address2: shopSettings?.address2 || '',
                        phone: shopSettings?.phone || client?.phone || '',
                        gstNumber: shopSettings?.gst_number || client?.gstin || '',
                        billNumber: String(nextBillNumber || ''),
                        date: new Date().toLocaleDateString('en-IN'),
                        time: new Date().toLocaleTimeString('en-IN', { hour12: true }),
                        paymentMethod: activeTab.payment_splits[0]?.payment_type || 'Cash',
                        items: activeTab.items.map(item => ({
                          name: item.product_name,
                          quantity: item.quantity,
                          rate: item.rate,
                          amount: item.amount,
                          discount_percentage: item.discount_percentage || 0,
                        })),
                        subtotal: billTotals.subtotal,
                        gstAmount: billTotals.totalGST,
                        discount: activeTab.useNegotiablePrice ? activeTab.negotiableAmount : billTotals.discountAmount,
                        grandTotal: billTotals.grandTotal,
                        footerText: shopSettings?.receipt_footer || '',
                      }
                      try {
                        await bluetoothPrinterService.printReceipt(receiptData)
                      } catch (err) {
                        toast.error('Print failed: ' + (err as Error).message)
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition font-semibold text-sm flex items-center justify-center gap-2"
                  >
                    <span>BT Print</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClearBill}
                  className="flex-1 px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white rounded hover:bg-gray-600 dark:hover:bg-gray-700 transition font-semibold text-sm"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Partial payment confirmation — replaces window.confirm(), which
            throws in the Electron renderer. Escape and the backdrop both
            cancel, so the cashier is never trapped mid-sale. */}
        {partialConfirm && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="partial-pay-title"
            onClick={() => setPartialConfirm(null)}
            onKeyDown={(e) => { if (e.key === 'Escape') setPartialConfirm(null) }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
              className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                </div>
                <h3 id="partial-pay-title" className="text-base font-semibold text-gray-900 dark:text-white">
                  Confirm partial payment
                </h3>
              </div>

              {/* Numbers, not prose — the cashier is checking figures, and
                  tabular-nums keeps them aligned. */}
              <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-3 mb-4 tabular-nums">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 py-0.5">
                  <span>Bill total</span>
                  <span>{cur}{partialConfirm.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-green-700 dark:text-green-400 py-0.5">
                  <span>Receiving now</span>
                  <span>{cur}{partialConfirm.paying.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-red-600 dark:text-red-400 pt-1.5 mt-1 border-t border-gray-200 dark:border-gray-700">
                  <span>Balance due</span>
                  <span>{cur}{partialConfirm.balance.toFixed(2)}</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                The bill will be saved as partially paid. You can collect the balance later from the Bills list.
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPartialConfirm(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition cursor-pointer"
                >
                  Go back
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    const args = partialConfirm
                    setPartialConfirm(null)
                    handleSubmit(
                      { preventDefault: () => {} } as React.FormEvent,
                      args.isPending, args.skipPrint, true,
                    )
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                >
                  Confirm &amp; Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Barcode Scanner Modal (mobile camera) */}
        <BarcodeScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={async (barcode) => {
            setIsScannerOpen(false)
            try {
              const cleanedBarcode = barcode.trim().replace(/\s+/g, '')
              const response = await api.get(`/stock/lookup/${encodeURIComponent(cleanedBarcode)}`)
              const product = response.data.product
              addProductToItems(product)
            } catch (error: any) {
              toast.error(error.response?.data?.error || 'Product not found for scanned barcode')
            }
          }}
        />

      </div>
    </DashboardLayout>
  )
}
