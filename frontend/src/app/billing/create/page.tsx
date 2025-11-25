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
}

interface PaymentSplit {
  payment_type: string
  amount: number
}

interface BillTab {
  id: string
  customer_name: string
  customer_phone: string
  customer_gstin: string
  payment_splits: PaymentSplit[]
  items: BillItem[]
  discountPercentage: number
  amountReceived: number
}

export default function UnifiedBillingPage() {
  const router = useRouter()
  const { fetchProducts } = useData()
  const { client } = useClient()
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const productSearchRef = useRef<HTMLInputElement>(null)
  const quantityInputRef = useRef<HTMLInputElement>(null)
  const gstInputRef = useRef<HTMLInputElement>(null)
  const rateInputRef = useRef<HTMLInputElement>(null)
  const customerNameRef = useRef<HTMLInputElement>(null)
  const customerPhoneRef = useRef<HTMLInputElement>(null)
  const customerGstinRef = useRef<HTMLInputElement>(null)
  const discountRef = useRef<HTMLInputElement>(null)
  const amountReceivedRef = useRef<HTMLInputElement>(null)
  const printButtonRef = useRef<HTMLButtonElement>(null)

  const hasInitialized = useRef(false)
  const isRestoringFromStorage = useRef(false)
  const barcodeBuffer = useRef('')
  const barcodeTimeout = useRef<NodeJS.Timeout | null>(null)

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
      customer_name: '',
      customer_phone: '',
      customer_gstin: '',
      payment_splits: [],
      items: [],
      discountPercentage: 0,
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

  const [billDate] = useState(new Date())
  const [nextBillNumber, setNextBillNumber] = useState<number | null>(null)

  // Product selection state
  const [barcodeInput, setBarcodeInput] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [productsLoading, setProductsLoading] = useState(true)
  const [selectedProductIndex, setSelectedProductIndex] = useState(0)
  const [isNewProduct, setIsNewProduct] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [newProductBarcode, setNewProductBarcode] = useState('')
  const [currentItem, setCurrentItem] = useState({
    product_id: '',
    product_name: '',
    item_code: '',
    hsn_code: '',
    unit: '',
    quantity: '' as number | string,
    rate: 0,
    gst_percentage: 0,
  })
  const [availableStock, setAvailableStock] = useState<number>(0)
  const [stockWarning, setStockWarning] = useState<string>('')

  // Modal states
  const [showDraftRestored, setShowDraftRestored] = useState(false)

  // Show draft restored notification
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.tabs && parsed.tabs.length > 0 && parsed.tabs.some((t: BillTab) => t.items.length > 0 || t.customer_name)) {
            setShowDraftRestored(true)
            setTimeout(() => setShowDraftRestored(false), 4000)
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
      const [productsData, billsResponse] = await Promise.all([
        fetchProducts(retryCount > 0), // Force refresh on retry
        api.get('/billing/list?limit=1'),
      ])
      setProducts(productsData)
      setProductsLoading(false)

      const bills = billsResponse.data.bills || []
      setNextBillNumber(bills.length > 0 ? bills[0].bill_number + 1 : 1)

      // If products is empty and we haven't retried too many times, retry after delay
      if (productsData.length === 0 && retryCount < 3) {
        console.log(`Products empty, retrying (attempt ${retryCount + 1}/3)...`)
        setTimeout(() => {
          loadInitialData(retryCount + 1)
        }, 2000)
      }
    } catch (error) {
      console.error('Failed to load initial data:', error)
      setNextBillNumber(1)

      // Retry on error if we haven't exceeded retry limit
      if (retryCount < 3) {
        console.log(`Error loading data, retrying (attempt ${retryCount + 1}/3)...`)
        setTimeout(() => {
          loadInitialData(retryCount + 1)
        }, 2000)
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
      if (!target.closest('.product-search-container')) {
        setShowProductDropdown(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
      if (barcodeTimeout.current) {
        clearTimeout(barcodeTimeout.current)
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
        customer_name: '',
        customer_phone: '',
        customer_gstin: '',
        payment_splits: [],
        items: [],
        discountPercentage: 0,
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
        customer_name: '',
        customer_phone: '',
        customer_gstin: '',
        payment_splits: [],
        items: [],
        discountPercentage: 0,
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

  const updateActiveTab = (updates: Partial<BillTab>) => {
    setBillTabs(
      billTabs.map((tab) =>
        tab.id === activeTabId ? { ...tab, ...updates } : tab
      )
    )
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
    setCurrentItem({
      product_id: product.product_id,
      product_name: product.product_name,
      item_code: product.item_code || '',
      hsn_code: product.hsn_code || '',
      unit: product.unit || 'pcs',
      quantity: '' as number | string,
      rate: Number(product.rate),
      gst_percentage: Number(product.gst_percentage || 0),
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
    const productGstPct = Number(product.gst_percentage || 0)

    const existingItemIndex = activeTab.items.findIndex(
      (item) =>
        item.product_id === product.product_id &&
        item.rate === rate &&
        item.gst_percentage === productGstPct
    )

    if (existingItemIndex !== -1) {
      const updatedItems = [...activeTab.items]
      const existingItem = updatedItems[existingItemIndex]
      const newQuantity = existingItem.quantity + qty
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
    } else {
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
    }
  }

  const addItem = () => {
    if (!currentItem.product_name || !currentItem.quantity || Number(currentItem.quantity) <= 0) {
      alert('Please enter product name and valid quantity')
      return
    }

    if (!currentItem.rate || currentItem.rate <= 0) {
      alert('Please enter a valid rate')
      return
    }

    if (!isNewProduct && availableStock === 0) {
      alert('⚠️ This product is out of stock! Cannot add to bill.')
      return
    }

    let actualQuantity = Number(currentItem.quantity)
    let limitedByStock = false
    const requestedQuantity = Number(currentItem.quantity)

    if (!isNewProduct && availableStock > 0 && actualQuantity > availableStock) {
      actualQuantity = availableStock
      limitedByStock = true
    }

    const existingItemIndex = activeTab.items.findIndex(
      (item) =>
        item.product_id === currentItem.product_id &&
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

      const newItem: BillItem = {
        ...currentItem,
        product_id: isNewProduct ? `temp-${Date.now()}` : currentItem.product_id,
        quantity: actualQuantity,
        gst_amount: Number(gstAmt.toFixed(2)),
        amount: Number(total.toFixed(2)),
        limitedByStock,
        requestedQuantity: limitedByStock ? requestedQuantity : undefined,
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
    })
    setProductSearch('')
    setShowProductDropdown(false)
    setIsNewProduct(false)
    setAvailableStock(0)
    setStockWarning('')

    setTimeout(() => {
      productSearchRef.current?.focus()
    }, 100)
  }

  const handleProductSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!showProductDropdown || filteredProducts.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedProductIndex((prev) =>
        prev < filteredProducts.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedProductIndex((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredProducts[selectedProductIndex]) {
        handleProductSelect(filteredProducts[selectedProductIndex])
      }
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()

      if (field === 'quantity') {
        rateInputRef.current?.focus()
        rateInputRef.current?.select()
      } else if (field === 'rate') {
        gstInputRef.current?.focus()
        gstInputRef.current?.select()
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
    return activeTab.items.some((item) => item.gst_percentage > 0)
  }

  const getBillType = () => {
    return hasGSTItems() ? 'GST Bill' : 'Non-GST Bill'
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

      const cleanedItems = activeTab.items.map(({ limitedByStock, requestedQuantity, ...item }) => item)

      // Format payment_type as JSON string of splits
      const paymentData = JSON.stringify(activeTab.payment_splits)

      const response = await api.post('/billing/create', {
        customer_name: activeTab.customer_name || 'Walk-in Customer',
        customer_phone: activeTab.customer_phone || '',
        customer_gstin: activeTab.customer_gstin || '',
        items: cleanedItems,
        payment_type: paymentData,
        amount_received: activeTab.amountReceived,
        discount_percentage: activeTab.discountPercentage,
      })

      // Check for stock warnings and show system notifications
      if (response.data.stock_warnings && response.data.stock_warnings.length > 0) {
        await SystemNotification.showStockWarnings(response.data.stock_warnings)
      }

      // Use bill data directly from create response (no need for additional fetch)
      const billData = response.data.bill

      // Directly print the bill
      const printResponse = await api.post('/billing/print', {
        bill: billData,
        clientInfo: client ? {
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
      })

      if (printResponse.data.success) {
        console.log('Print successful!')
      } else {
        throw new Error(printResponse.data.error || 'Print failed')
      }

      // Clear the completed tab from storage and remove it
      clearDraftFromStorage(activeTabId)
      closeTab(activeTabId)
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create bill')
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
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDate(billDate)}
                </span>
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
            <div className="grid grid-cols-1 md:grid-cols-10 gap-2 p-2">
              {/* Customer Name - NOT REQUIRED */}
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer Name
                </label>
                <input
                  ref={customerNameRef}
                  type="text"
                  placeholder="Optional"
                  value={activeTab.customer_name}
                  onChange={(e) => updateActiveTab({ customer_name: e.target.value })}
                  onKeyDown={(e) => handleEnterNavigation(e, customerPhoneRef)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                />
              </div>

              {/* Phone - NOT REQUIRED */}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  ref={customerPhoneRef}
                  type="tel"
                  placeholder="Optional"
                  value={activeTab.customer_phone}
                  onChange={(e) => updateActiveTab({ customer_phone: e.target.value })}
                  onKeyDown={(e) => handleEnterNavigation(e, customerGstinRef)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                />
              </div>

              {/* GST Number - NEW FIELD */}
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer GSTIN
                </label>
                <input
                  ref={customerGstinRef}
                  type="text"
                  placeholder="Optional GSTIN"
                  value={activeTab.customer_gstin}
                  onChange={(e) => updateActiveTab({ customer_gstin: e.target.value })}
                  onKeyDown={(e) => handleEnterNavigation(e, discountRef)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                />
              </div>

              {/* Discount */}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Discount %
                </label>
                <input
                  ref={discountRef}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0"
                  value={activeTab.discountPercentage || ''}
                  onChange={(e) =>
                    updateActiveTab({ discountPercentage: parseFloat(e.target.value) || 0 })
                  }
                  onKeyDown={(e) => handleEnterNavigation(e, productSearchRef)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
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
              <div className="flex gap-1 items-end">
                <div className="flex-1 relative product-search-container">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Search Product (F2)
                  </label>
                  <input
                    ref={productSearchRef}
                    type="text"
                    placeholder="Type to search product..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value)
                      setShowProductDropdown(true)
                      setSelectedProductIndex(0)
                    }}
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
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
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
                                index === selectedProductIndex
                                  ? 'bg-blue-100 dark:bg-blue-900'
                                  : 'hover:bg-blue-50 dark:hover:bg-gray-700'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                                    {product.product_name}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    Code: {product.item_code || 'N/A'} | Stock: {product.quantity} |
                                    GST: {product.gst_percentage}%
                                  </div>
                                </div>
                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                  ₹{Number(product.rate).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="px-3 py-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700">
                          <div className="text-xs text-yellow-700 dark:text-yellow-400 mb-1">Product not found</div>
                          <div className="bg-white dark:bg-gray-800 rounded px-2 py-1 mb-2 border border-yellow-200 dark:border-yellow-700">
                            <span className="text-xs text-gray-500">Code: </span>
                            <span className="font-mono font-bold text-gray-900 dark:text-white text-sm">{productSearch}</span>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newProductName}
                              onChange={(e) => setNewProductName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newProductName.trim()) {
                                  e.preventDefault()
                                  setNewProductBarcode(productSearch)
                                  handleCreateNewProduct()
                                }
                              }}
                              placeholder="Enter product name"
                              className="flex-1 px-2 py-1.5 text-sm border border-yellow-400 dark:border-yellow-600 rounded focus:ring-2 focus:ring-yellow-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                setNewProductBarcode(productSearch)
                                handleCreateNewProduct()
                              }}
                              disabled={!newProductName.trim()}
                              className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                                newProductName.trim()
                                  ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              }`}
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="w-20">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                    className={`w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white ${
                      !isNewProduct && currentItem.product_id && availableStock === 0
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-600 cursor-not-allowed'
                        : stockWarning
                        ? 'bg-white dark:bg-gray-700 border-red-500 dark:border-red-600'
                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                    }`}
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                    title="Enter rate"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                    title="Enter GST %"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={addItem}
                    disabled={
                      !isNewProduct && Boolean(currentItem.product_id) && availableStock === 0
                    }
                    className={`px-3 py-1 rounded transition font-medium text-xs whitespace-nowrap ${
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
                    {hasGSTItems() && (
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
                    <th className="px-1 py-1 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase w-10">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800">
                  {activeTab.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={hasGSTItems() ? 10 : 8}
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
                        <td className="px-1 py-0.5 text-xs border-r border-gray-200 dark:border-gray-700">
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-gray-900 dark:text-white">
                              {item.product_name}
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
                        {hasGSTItems() && (
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

              {/* Amount Received - First */}
              <div className="flex items-center gap-2 mb-3 bg-gray-50 dark:bg-gray-900 p-2 rounded">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 w-20">
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
                      // Check if there are payment splits, if not add one
                      if (activeTab.payment_splits.length === 0) {
                        addPaymentSplit()
                        setTimeout(() => {
                          // Since Cash is default, go directly to amount input
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
                  className="w-32 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 font-semibold"
                />
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
                    <div className="flex-1">
                      <select
                        value={split.payment_type}
                        onChange={(e) => updatePaymentSplit(index, 'payment_type', e.target.value)}
                        onFocus={(e) => {
                          // Auto-open dropdown on focus
                          const event = new MouseEvent('mousedown', { bubbles: true })
                          e.currentTarget.dispatchEvent(event)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const amountInput = e.currentTarget.parentElement?.nextElementSibling?.querySelector('input')
                            amountInput?.focus()
                            // Auto-select the text in amount field
                            setTimeout(() => {
                              (amountInput as HTMLInputElement)?.select()
                            }, 50)
                          }
                        }}
                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                        title="Select payment type"
                      >
                        <option value="">Select Payment Type</option>
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
                            // Move to Print Bill button
                            printButtonRef.current?.focus()
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
                </div>
              )}
            </div>
          </div>

          {/* Bottom Section - Totals & Actions */}
          <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 p-2">
              {/* Summary Cards - Left Side */}
              <div className="lg:col-span-3 grid grid-cols-2 gap-2">
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
              <div className="lg:col-span-5 bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                      Subtotal:
                    </span>
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">
                      ₹{calculateSubtotal().toFixed(2)}
                    </span>
                  </div>
                  {hasGSTItems() && (
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
                      customer_name: '',
                      customer_phone: '',
                      customer_gstin: '',
                      discountPercentage: 0,
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
                    })
                    setIsNewProduct(false)
                    setProductSearch('')
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
