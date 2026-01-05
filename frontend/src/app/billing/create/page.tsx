'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { useRouter } from 'next/navigation'
import { useData } from '@/contexts/DataContext'
import { useClient } from '@/contexts/ClientContext'
import { SystemNotification } from '@/utils/notifications'

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
  limitedByStock?: boolean
  requestedQuantity?: number
  saveToStock?: boolean  // NEW: User can choose to save product to stock after billing
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
}

export default function UnifiedBillingPage() {
  const router = useRouter()
  const { fetchProducts, invalidateCache: invalidateDataCache } = useData()
  const { client, hasPermission } = useClient()

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
  const barcodeTimeout = useRef<NodeJS.Timeout | null>(null)

  // For detecting fast typing (barcode scanner) in product search field
  const searchInputTimestamp = useRef<number>(0)
  const searchInputBuffer = useRef<string>('')
  const searchBarcodeTimeout = useRef<NodeJS.Timeout | null>(null)

  // LocalStorage key for draft persistence
  const DRAFT_STORAGE_KEY = 'billing_draft_tabs'

  // Hardcoded payment types
  const paymentTypes = ['Cash', 'Card', 'UPI']

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

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
  const [tooltipTimeoutId, setTooltipTimeoutId] = useState<NodeJS.Timeout | null>(null)
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
  })
  const [availableStock, setAvailableStock] = useState<number>(0)
  const [stockWarning, setStockWarning] = useState<string>('')

  // Modal states
  const [showDraftRestored, setShowDraftRestored] = useState(false)

  // Customer search states
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerData[]>([])
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [customerSearchField, setCustomerSearchField] = useState<'code' | 'name' | 'phone' | null>(null)
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(0)
  const customerSearchTimeout = useRef<NodeJS.Timeout | null>(null)


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

  // Get current active tab
  const activeTab = billTabs.find((tab) => tab.id === activeTabId) || billTabs[0]

  const loadInitialData = useCallback(async (retryCount = 0) => {
    try {
      setProductsLoading(true)
      // OPTIMIZED: Use lightweight /next-number endpoint instead of fetching full bill list
      // Use cache normally - cache is invalidated after mutations (create/update/delete stock/bills)
      // Backend has fallback lookup by product_name if product_id is stale
      const [productsData, billNumberResponse] = await Promise.all([
        fetchProducts(retryCount > 0), // Force refresh only on retry
        api.get('/billing/next-number'),
      ])
      setProducts(productsData)
      setProductsLoading(false)

      // Use dedicated endpoint response (much faster than list?limit=1)
      setNextBillNumber(billNumberResponse.data.next_bill_number || 1)

      // If products is empty and we haven't retried too many times, retry after delay
      if (productsData.length === 0 && retryCount < 3) {
        console.log(`Products empty, retrying (attempt ${retryCount + 1}/3)...`)
        setTimeout(() => {
          loadInitialData(retryCount + 1)
        }, 1000)
      }
    } catch (error) {
      console.error('Failed to load initial data:', error)
      setNextBillNumber(1)

      // Retry on error if we haven't exceeded retry limit
      if (retryCount < 3) {
        console.log(`Error loading data, retrying (attempt ${retryCount + 1}/3)...`)
        setTimeout(() => {
          loadInitialData(retryCount + 1)
        }, 1000)
      } else {
        setProductsLoading(false) // Stop loading indicator after max retries
      }
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

  // Save drafts to localStorage whenever billTabs or activeTabId changes
  useEffect(() => {
    // Skip saving during initial restoration
    if (isRestoringFromStorage.current) {
      isRestoringFromStorage.current = false
      return
    }

    try {
      const dataToSave = {
        tabs: billTabs,
        activeTabId: activeTabId,
        savedAt: new Date().toISOString()
      }
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(dataToSave))
    } catch (e) {
      console.error('Failed to save draft to localStorage:', e)
    }
  }, [billTabs, activeTabId])

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

  // Customer search function
  const searchCustomers = async (query: string) => {
    if (!query || query.length < 1) {
      setCustomerSuggestions([])
      setShowCustomerDropdown(false)
      setSelectedCustomerIndex(0)
      return
    }

    try {
      const response = await api.get(`/customer/search?q=${encodeURIComponent(query)}`)
      if (response.data.success && response.data.customers.length > 0) {
        setCustomerSuggestions(response.data.customers)
        setShowCustomerDropdown(true)
        setSelectedCustomerIndex(0)
      } else {
        setCustomerSuggestions([])
        setShowCustomerDropdown(false)
        setSelectedCustomerIndex(0)
      }
    } catch (error) {
      console.error('Customer search failed:', error)
      setCustomerSuggestions([])
      setShowCustomerDropdown(false)
      setSelectedCustomerIndex(0)
    }
  }

  // Handle customer field change with debounced search
  const handleCustomerFieldChange = (field: 'code' | 'name' | 'phone', value: string) => {
    // Update the field value
    if (field === 'code') {
      updateActiveTab({ customer_code: value })
    } else if (field === 'name') {
      updateActiveTab({ customer_name: value })
    } else if (field === 'phone') {
      updateActiveTab({ customer_phone: value })
    }

    // Clear previous timeout
    if (customerSearchTimeout.current) {
      clearTimeout(customerSearchTimeout.current)
    }

    // Set field being searched
    setCustomerSearchField(field)

    // Debounced search (optimized from 300ms)
    customerSearchTimeout.current = setTimeout(() => {
      searchCustomers(value)
    }, 150)
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
        alert(error.response?.data?.error || 'Product not found')
        setBarcodeInput('')
        // Move to product search on error
        productSearchRef.current?.focus()
      }
    }
  }

  const handleProductSelect = (product: Product) => {
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
      cost_price: product.cost_price ? Number(product.cost_price) : undefined,
      mrp: product.mrp ? Number(product.mrp) : undefined,
    })
    setProductSearch(product.product_name)
    setShowProductDropdown(false)

    setTimeout(() => {
      quantityInputRef.current?.focus()
      quantityInputRef.current?.select()
    }, 100)
  }

  const handleCreateNewProduct = () => {
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
    })
    setShowProductDropdown(false)
    setNewProductName('') // Reset for next use
    setNewProductBarcode('') // Reset barcode

    setTimeout(() => {
      rateInputRef.current?.focus()
      rateInputRef.current?.select()
    }, 100)
  }

  const filteredProducts = products.filter((product) => {
    const searchLower = productSearch.toLowerCase()
    const searchNoSpaces = productSearch.replace(/\s+/g, '').toLowerCase()
    return (
      product.product_name.toLowerCase().includes(searchLower) ||
      (product.item_code && product.item_code.toLowerCase().includes(searchLower)) ||
      (product.barcode && product.barcode.toLowerCase().includes(searchLower)) ||
      // Also check barcode without spaces in case database has spaces
      (product.barcode && product.barcode.replace(/\s+/g, '').toLowerCase().includes(searchNoSpaces))
    )
  })

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
        alert(`⚠️ Stock limit reached! Only ${availableQty} available for ${existingItem.product_name}`)
        return
      }

      const subtotal = newQuantity * existingItem.rate
      const gstAmt = (subtotal * existingItem.gst_percentage) / 100
      const total = subtotal + gstAmt

      updatedItems[existingItemIndex] = {
        ...existingItem,
        quantity: newQuantity,
        gst_amount: Number(gstAmt.toFixed(2)),
        amount: Number(total.toFixed(2)),
      }

      updateActiveTab({ items: updatedItems })
      console.log(`[BARCODE] Incremented quantity for ${existingItem.product_name} to ${newQuantity}`)
    } else {
      // New product - add to bill
      const subtotal = qty * rate
      const gstAmt = (subtotal * productGstPct) / 100
      const total = subtotal + gstAmt

      const newItem: BillItem = {
        product_id: product.product_id,
        product_name: product.product_name,
        item_code: product.item_code || '',
        hsn_code: product.hsn_code || '',
        unit: product.unit || 'pcs',
        quantity: qty,
        rate: rate,
        gst_percentage: productGstPct,
        gst_amount: Number(gstAmt.toFixed(2)),
        amount: Number(total.toFixed(2)),
        cost_price: product.cost_price ? Number(product.cost_price) : undefined,
        mrp: product.mrp ? Number(product.mrp) : undefined,
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
      alert('Please enter product name and valid quantity')
      return
    }

    if (!currentItem.rate || currentItem.rate <= 0) {
      alert('Please enter a valid rate')
      return
    }

    if (!isNewProductToUse && availableStock === 0) {
      alert('⚠️ This product is out of stock! Cannot add to bill.')
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
      const subtotal = newQuantity * existingItem.rate
      const gstAmt = (subtotal * existingItem.gst_percentage) / 100
      const total = subtotal + gstAmt

      updatedItems[existingItemIndex] = {
        ...existingItem,
        quantity: newQuantity,
        gst_amount: Number(gstAmt.toFixed(2)),
        amount: Number(total.toFixed(2)),
        limitedByStock: limitedByStock || existingItem.limitedByStock,
        requestedQuantity: limitedByStock ? requestedQuantity : existingItem.requestedQuantity,
      }

      updateActiveTab({ items: updatedItems })
    } else {
      const subtotal = actualQuantity * currentItem.rate
      const gstAmt = (subtotal * currentItem.gst_percentage) / 100
      const total = subtotal + gstAmt

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
        gst_amount: Number(gstAmt.toFixed(2)),
        amount: Number(total.toFixed(2)),
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
        // For non-GST only users, skip GST field and add item directly
        if (nonGstOnly) {
          addItem()
        } else {
          gstInputRef.current?.focus()
          gstInputRef.current?.select()
        }
      } else if (field === 'gst') {
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
    const subtotal = newQty * item.rate
    const gstAmt = (subtotal * item.gst_percentage) / 100

    updatedItems[index] = {
      ...item,
      quantity: newQty,
      gst_amount: Number(gstAmt.toFixed(2)),
      amount: Number((subtotal + gstAmt).toFixed(2)),
    }

    updateActiveTab({ items: updatedItems })
  }

  const calculateSubtotal = () => {
    return activeTab.items.reduce((sum, item) => sum + item.quantity * item.rate, 0)
  }

  const calculateTotalGST = () => {
    return activeTab.items.reduce((sum, item) => sum + item.gst_amount, 0)
  }

  const calculateGrandTotal = () => {
    const subtotalWithGST = calculateSubtotal() + calculateTotalGST()

    // If negotiable price is enabled, subtract the negotiable amount as discount
    if (activeTab.useNegotiablePrice && activeTab.negotiableAmount > 0) {
      return Math.max(0, subtotalWithGST - activeTab.negotiableAmount)
    }

    // Otherwise use discount percentage
    const calculatedDiscountAmount = (subtotalWithGST * activeTab.discountPercentage) / 100
    return Math.max(0, subtotalWithGST - calculatedDiscountAmount)
  }

  const getRoundedGrandTotal = () => {
    const grandTotal = calculateGrandTotal()
    return Math.round(grandTotal) // Rounds to nearest whole number (0.5 and above rounds up)
  }

  const getRoundOffAmount = () => {
    const grandTotal = calculateGrandTotal()
    const rounded = getRoundedGrandTotal()
    return rounded - grandTotal // Positive if rounded up, negative if rounded down
  }

  const getDiscountAmount = () => {
    const subtotalWithGST = calculateSubtotal() + calculateTotalGST()
    return (subtotalWithGST * activeTab.discountPercentage) / 100
  }

  const getBalanceAmount = () => {
    const grandTotal = getRoundedGrandTotal() // Use rounded total for balance
    return activeTab.amountReceived - grandTotal
  }

  const hasGSTItems = () => {
    // Non-GST only: Never has GST items
    if (nonGstOnly) return false
    // GST only: Always has GST (even if all items are 0%, treat as GST bill)
    if (gstOnly) return true
    // Both permissions: Smart detection based on items
    return activeTab.items.some((item) => item.gst_percentage > 0)
  }

  const getBillType = () => {
    // Permission-based bill type determination
    if (gstOnly) return 'GST Bill'
    if (nonGstOnly) return 'Non-GST Bill'
    // Both permissions: Smart detection
    return activeTab.items.some((item) => item.gst_percentage > 0) ? 'GST Bill' : 'Non-GST Bill'
  }

  // Determine if GST columns should be shown in the table
  const showGstColumns = () => {
    // Non-GST only: Never show GST columns
    if (nonGstOnly) return false
    // GST only or both permissions: Show GST columns
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (activeTab.items.length === 0) {
      alert('Please add at least one item')
      return
    }

    if (activeTab.payment_splits.length === 0) {
      alert('Please add at least one payment method')
      return
    }

    const totalSplits = getTotalPaymentSplits()
    const grandTotal = getRoundedGrandTotal()

    if (Math.abs(totalSplits - grandTotal) > 0.01) {
      alert(`Payment splits total (₹${totalSplits.toFixed(2)}) must equal bill total (₹${grandTotal.toFixed(2)})`)
      return
    }

    // Directly create and print the bill
    try {
      setLoading(true)
      console.log('[BILLING] Starting bill creation and print process...')

      // Auto-save new customer if phone is provided but no customer code (new customer)
      if (activeTab.customer_phone && !activeTab.customer_code && activeTab.customer_name) {
        try {
          await api.post('/customer/create', {
            customer_name: activeTab.customer_name,
            customer_phone: activeTab.customer_phone,
            customer_gstin: activeTab.customer_gstin || '',
          })
          console.log('[BILLING] New customer saved automatically')
        } catch (customerError: any) {
          // Don't fail the bill if customer creation fails (customer might already exist)
          console.log('[BILLING] Customer save skipped:', customerError.response?.data?.message || 'Already exists or error')
        }
      }

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

      // Format payment_type as JSON string of splits
      const paymentData = JSON.stringify(activeTab.payment_splits)

      console.log('[BILLING] Creating bill...')
      const response = await api.post('/billing/create', {
        customer_name: activeTab.customer_name || 'Walk-in Customer',
        customer_phone: activeTab.customer_phone || '',
        customer_gstin: activeTab.customer_gstin || '',
        items: cleanedItems,
        payment_type: paymentData,
        amount_received: activeTab.amountReceived,
        discount_percentage: activeTab.useNegotiablePrice ? 0 : activeTab.discountPercentage,
        negotiable_amount: activeTab.useNegotiablePrice ? activeTab.negotiableAmount : null,
        bill_date: billDate.toISOString(),
      })
      console.log('[BILLING] Bill created successfully:', response.data.bill?.bill_number)

      // Check for stock warnings and show system notifications
      if (response.data.stock_warnings && response.data.stock_warnings.length > 0) {
        await SystemNotification.showStockWarnings(response.data.stock_warnings)
      }

      // Use bill data directly from create response (no need for additional fetch)
      const billData = response.data.bill

      // Prepare client info for printing
      const clientInfo = client ? {
        client_name: client.client_name,
        address: client.address,
        phone: client.phone,
        email: client.email,
        gstin: client.gstin,
        logo_url: client.logo_url
      } : {
        client_name: 'Business Name',
        address: '',
        phone: '',
        email: '',
        gstin: '',
        logo_url: ''
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
          const { generateReceiptHtml } = await import('@/lib/webPrintService')
          const receiptHtml = generateReceiptHtml(billData, clientInfo, true)

          console.log('[BILLING] Sending to Electron printer...')
          const printResult = await electronAPI.silentPrint(receiptHtml, null)

          if (printResult.success) {
            console.log('[BILLING] Electron print successful!')
          } else {
            console.error('[BILLING] Electron print failed:', printResult.error)
            alert('Bill created but print failed: ' + (printResult.error || 'Unknown error'))
          }
        } catch (electronPrintError: any) {
          console.error('[BILLING] Electron print exception:', electronPrintError)
          alert('Bill created but print failed: ' + (electronPrintError.message || 'Unknown error'))
        }
      } else {
        // Use browser print dialog for web deployment
        console.log('[BILLING] Web mode - using browser print dialog...')
        try {
          const { printBill } = await import('@/lib/webPrintService')
          const printResult = printBill(billData, clientInfo, true)

          if (printResult.success) {
            console.log('[BILLING] Browser print dialog opened successfully!')
          } else {
            console.error('[BILLING] Browser print failed:', printResult.message)
            alert('Bill created but print failed: ' + (printResult.message || 'Print error'))
          }
        } catch (webPrintError: unknown) {
          console.error('[BILLING] Web print exception:', webPrintError)
          // Don't throw - bill was created successfully
          const errorMessage = webPrintError instanceof Error ? webPrintError.message : 'Print error'
          alert('Bill created but print failed: ' + errorMessage)
        }
      }

      // Invalidate product cache after successful bill creation (stock quantities changed)
      invalidateDataCache('products')

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
      alert(error.response?.data?.error || error.message || 'Failed to create bill')
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
            {/* Bill Number and Date Header */}
            <div className="grid grid-cols-2 gap-4 p-2 border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">
                  Bill Number
                </span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  #{nextBillNumber || '...'}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Date</span>
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
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer No
                </label>
                <input
                  ref={customerCodeRef}
                  type="text"
                  placeholder="100+"
                  value={activeTab.customer_code}
                  onChange={(e) => handleCustomerFieldChange('code', e.target.value)}
                  onFocus={() => activeTab.customer_code && searchCustomers(activeTab.customer_code)}
                  onBlur={async () => {
                    // Auto-lookup by exact code when leaving field
                    if (activeTab.customer_code && !activeTab.customer_name) {
                      await lookupCustomerByCode(activeTab.customer_code)
                    }
                    setTimeout(() => setShowCustomerDropdown(false), 100)
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
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 capitalize"
                />
                {/* Customer Dropdown for Code field */}
                {showCustomerDropdown && customerSearchField === 'code' && customerSuggestions.length > 0 && (
                  <div className="absolute z-50 w-64 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {customerSuggestions.map((customer, index) => (
                      <div
                        key={customer.customer_id}
                        onClick={() => selectCustomer(customer)}
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
              <div className="md:col-span-3 relative customer-search-container">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer Name
                </label>
                <input
                  ref={customerNameRef}
                  type="text"
                  placeholder="Optional"
                  value={activeTab.customer_name}
                  onChange={(e) => handleCustomerFieldChange('name', e.target.value)}
                  onFocus={() => activeTab.customer_name && searchCustomers(activeTab.customer_name)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 100)}
                  onKeyDown={(e) => {
                    if (!handleCustomerKeyDown(e, 'name')) {
                      handleEnterNavigation(e, customerPhoneRef)
                    }
                  }}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 capitalize"
                />
                {/* Customer Dropdown for Name field */}
                {showCustomerDropdown && customerSearchField === 'name' && customerSuggestions.length > 0 && (
                  <div className="absolute z-50 w-72 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {customerSuggestions.map((customer, index) => (
                      <div
                        key={customer.customer_id}
                        onClick={() => selectCustomer(customer)}
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
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  ref={customerPhoneRef}
                  type="tel"
                  placeholder="Optional"
                  value={activeTab.customer_phone}
                  onChange={(e) => handleCustomerFieldChange('phone', e.target.value)}
                  onFocus={() => activeTab.customer_phone && searchCustomers(activeTab.customer_phone)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 100)}
                  onKeyDown={(e) => {
                    if (!handleCustomerKeyDown(e, 'phone')) {
                      handleEnterNavigation(e, customerGstinRef)
                    }
                  }}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                />
                {/* Customer Dropdown for Phone field */}
                {showCustomerDropdown && customerSearchField === 'phone' && customerSuggestions.length > 0 && (
                  <div className="absolute z-50 w-64 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {customerSuggestions.map((customer, index) => (
                      <div
                        key={customer.customer_id}
                        onClick={() => selectCustomer(customer)}
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

              {/* GST Number */}
              <div className="md:col-span-5">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer GSTIN
                </label>
                <input
                  ref={customerGstinRef}
                  type="text"
                  placeholder="Optional GSTIN"
                  value={activeTab.customer_gstin}
                  onChange={(e) => updateActiveTab({ customer_gstin: e.target.value })}
                  onKeyDown={(e) => handleEnterNavigation(e, productSearchRef)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                />
              </div>
            </div>

            {/* Manual Product Selection Row */}
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
              <div className="flex gap-2 items-end">
                <div className="flex-1 relative product-search-container">
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
                                    GST: {product.gst_percentage}%
                                    {product.mrp && (
                                      <span className="ml-2 font-semibold text-orange-600 dark:text-orange-400">
                                        | MRP: ₹{Number(product.mrp).toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                  ₹{Number(product.rate).toFixed(2)}
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
                      GST%
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
                      title="Enter GST %"
                    />
                  </div>
                )}
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
          </div>

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
                    {showGstColumns() && (
                      <>
                        <th className="px-1 py-1 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-14">
                          GST%
                        </th>
                        <th className="px-1 py-1 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-20">
                          GST
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
                        colSpan={showGstColumns() ? 10 : 8}
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
                                    MRP: ₹{Number(item.mrp).toFixed(2)}
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
                          ₹{Number(item.rate).toFixed(2)}
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
                              ₹{item.gst_amount.toFixed(2)}
                            </td>
                          </>
                        )}
                        <td className="px-1 py-0.5 text-xs text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 text-right font-bold">
                          ₹{item.amount.toFixed(2)}
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

          {/* Payment Splits Section - MULTI-PAYMENT */}
          <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-2">
            <div className="mb-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">
                Payment Methods (Split Payment)
              </h3>

              {/* Amount Received & Discount - Side by Side */}
              <div className="flex items-center gap-6 mb-3 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
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
                    {activeTab.useNegotiablePrice ? 'Negotiable ₹' : 'Discount %'}
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
                      className="w-28 px-3 py-2 text-sm font-bold border-2 border-blue-400 dark:border-blue-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
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
                    title={activeTab.useNegotiablePrice ? 'Switch to Discount %' : 'Switch to Negotiable ₹'}
                  >
                    {activeTab.useNegotiablePrice ? '% Off' : '₹ Price'}
                  </button>
                </div>
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
                        Math.abs(getTotalPaymentSplits() - getRoundedGrandTotal()) < 0.01
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      ₹{getTotalPaymentSplits().toFixed(2)}
                    </span>
                  </div>
                  {/* Balance to Collect or Change to Give */}
                  {getTotalPaymentSplits() > 0 && Math.abs(getTotalPaymentSplits() - getRoundedGrandTotal()) >= 0.01 && (
                    <div className="flex justify-between text-xs font-bold mt-1 py-1 px-2 rounded bg-orange-50 dark:bg-orange-900/20">
                      <span className={getTotalPaymentSplits() < getRoundedGrandTotal() ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                        {getTotalPaymentSplits() < getRoundedGrandTotal() ? '⚠️ Balance to Collect:' : '💰 Change to Give:'}
                      </span>
                      <span className={getTotalPaymentSplits() < getRoundedGrandTotal() ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                        ₹{Math.abs(getRoundedGrandTotal() - getTotalPaymentSplits()).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Section - Totals & Actions */}
          <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700">
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
                      ₹{calculateSubtotal().toFixed(2)}
                    </span>
                  </div>
                  {showGstColumns() && calculateTotalGST() > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                        Total GST:
                      </span>
                      <span className="text-xs font-semibold text-gray-900 dark:text-white">
                        ₹{calculateTotalGST().toFixed(2)}
                      </span>
                    </div>
                  )}
                  {activeTab.discountPercentage > 0 && (
                    <div className="flex justify-between items-center border-t border-gray-300 dark:border-gray-600 pt-1">
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                        Discount ({activeTab.discountPercentage}%):
                      </span>
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                        - ₹{getDiscountAmount().toFixed(2)}
                      </span>
                    </div>
                  )}
                  {activeTab.useNegotiablePrice && activeTab.negotiableAmount > 0 && (
                    <div className="flex justify-between items-center border-t border-gray-300 dark:border-gray-600 pt-1">
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                        Negotiable:
                      </span>
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                        - ₹{activeTab.negotiableAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {getRoundOffAmount() !== 0 && (
                    <div className="flex justify-between items-center border-t border-gray-300 dark:border-gray-600 pt-1">
                      <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                        Round Off:
                      </span>
                      <span className={`text-xs font-semibold ${getRoundOffAmount() > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {getRoundOffAmount() > 0 ? '+' : ''}{getRoundOffAmount().toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-t border-gray-400 dark:border-gray-600 pt-1 mt-1">
                    <span className="text-sm text-gray-900 dark:text-white font-bold">
                      Grand Total:
                    </span>
                    <span className="text-lg font-bold text-green-700 dark:text-green-400">
                      ₹{getRoundedGrandTotal().toFixed(2)}
                    </span>
                  </div>
                  {activeTab.amountReceived > 0 && (
                    <>
                      <div className="flex justify-between items-center border-t border-gray-300 dark:border-gray-600 pt-1">
                        <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">
                          Received:
                        </span>
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                          ₹{activeTab.amountReceived.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-purple-700 dark:text-purple-400 font-medium">
                          Balance:
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            getBalanceAmount() >= 0
                              ? 'text-purple-700 dark:text-purple-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          ₹{getBalanceAmount().toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Actions - Right Side */}
              <div className="lg:col-span-4 flex flex-col md:flex-row items-stretch md:items-center gap-2">
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
                  className="flex-1 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded hover:bg-green-700 dark:hover:bg-green-800 transition disabled:bg-gray-400 dark:disabled:bg-gray-600 font-bold text-sm shadow-md hover:shadow-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
                >
                  {loading ? 'Processing...' : 'Print Bill'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Clear the current bill
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
                    })
                    setIsNewProduct(false)
                    setProductSearch('')
                    setCustomerSuggestions([])
                    setShowCustomerDropdown(false)
                  }}
                  className="flex-1 px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white rounded hover:bg-gray-600 dark:hover:bg-gray-700 transition font-semibold text-sm"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </form>

      </div>
    </DashboardLayout>
  )
}
