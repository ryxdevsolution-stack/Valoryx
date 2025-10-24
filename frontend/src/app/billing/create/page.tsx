'use client'

import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { useRouter } from 'next/navigation'
import { useData } from '@/contexts/DataContext'
import { useClient } from '@/contexts/ClientContext'

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
  limitedByStock?: boolean
  requestedQuantity?: number
}

interface PaymentType {
  payment_type_id: string
  payment_name: string
}

export default function UnifiedBillingPage() {
  const router = useRouter()
  const { fetchProducts, fetchPaymentTypes } = useData()
  const { client } = useClient()
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const productSearchRef = useRef<HTMLInputElement>(null)
  const quantityInputRef = useRef<HTMLInputElement>(null)
  const gstInputRef = useRef<HTMLInputElement>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    payment_type: '',
  })

  const [billDate, setBillDate] = useState(new Date())
  const [nextBillNumber, setNextBillNumber] = useState<number | null>(null)
  const [discountPercentage, setDiscountPercentage] = useState<number>(0)

  const [items, setItems] = useState<BillItem[]>([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [selectedProductIndex, setSelectedProductIndex] = useState(0)
  const [isNewProduct, setIsNewProduct] = useState(false)
  const [currentItem, setCurrentItem] = useState({
    product_id: '',
    product_name: '',
    item_code: '',
    hsn_code: '',
    unit: '',
    quantity: 1,
    rate: 0,
    gst_percentage: 0,
  })
  const [availableStock, setAvailableStock] = useState<number>(0)
  const [stockWarning, setStockWarning] = useState<string>('')
  const [showPrintConfirm, setShowPrintConfirm] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [billNumberCreated, setBillNumberCreated] = useState<number | null>(null)

  useEffect(() => {
    loadInitialData()
    fetchNextBillNumber()
    // Auto-focus barcode input on mount
    barcodeInputRef.current?.focus()

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2 - Focus barcode input
      if (e.key === 'F2') {
        e.preventDefault()
        barcodeInputRef.current?.focus()
      }
      // Escape - Clear barcode input and close dropdown
      if (e.key === 'Escape') {
        setBarcodeInput('')
        setShowProductDropdown(false)
        barcodeInputRef.current?.focus()
      }
    }

    // Close dropdown when clicking outside
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadInitialData = async () => {
    try {
      const [productsData, paymentTypesData] = await Promise.all([
        fetchProducts(),
        fetchPaymentTypes()
      ])
      setProducts(productsData)
      setPaymentTypes(paymentTypesData)
    } catch (error) {
      console.error('Failed to load initial data:', error)
    }
  }

  const fetchNextBillNumber = async () => {
    try {
      const response = await api.get('/billing/list?limit=1')
      const bills = response.data.bills || []
      if (bills.length > 0) {
        setNextBillNumber(bills[0].bill_number + 1)
      } else {
        setNextBillNumber(1)
      }
    } catch (error) {
      console.error('Failed to fetch bill number:', error)
      setNextBillNumber(1)
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  const handleBarcodeScanned = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      e.preventDefault()
      try {
        // Lookup product by barcode
        const response = await api.get(`/stock/lookup/${barcodeInput.trim()}`)
        const product = response.data.product

        // Auto-add to items
        addProductToItems(product)
        setBarcodeInput('')
        barcodeInputRef.current?.focus()
      } catch (error: any) {
        alert(error.response?.data?.error || 'Product not found')
        setBarcodeInput('')
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
      quantity: 1,
      rate: Number(product.rate),
      gst_percentage: Number(product.gst_percentage || 0),
    })
    setProductSearch(product.product_name)
    setShowProductDropdown(false)

    // Auto-focus quantity field after selecting product
    setTimeout(() => {
      quantityInputRef.current?.focus()
      quantityInputRef.current?.select()
    }, 100)
  }

  const handleCreateNewProduct = () => {
    setIsNewProduct(true)
    setCurrentItem({
      product_id: 'new-product-temp',
      product_name: productSearch,
      item_code: '',
      hsn_code: '',
      unit: 'pcs',
      quantity: 1,
      rate: 0,
      gst_percentage: 0,
    })
    setShowProductDropdown(false)

    // Auto-focus quantity field
    setTimeout(() => {
      quantityInputRef.current?.focus()
      quantityInputRef.current?.select()
    }, 100)
  }

  const filteredProducts = products.filter((product) => {
    const searchLower = productSearch.toLowerCase()
    return (
      product.product_name.toLowerCase().includes(searchLower) ||
      (product.item_code && product.item_code.toLowerCase().includes(searchLower)) ||
      (product.barcode && product.barcode.toLowerCase().includes(searchLower))
    )
  })

  const addProductToItems = (product: any) => {
    const qty = 1
    const rate = Number(product.rate)
    const productGstPct = Number(product.gst_percentage || 0)

    // Check if product already exists in items
    const existingItemIndex = items.findIndex(
      (item) => item.product_id === product.product_id &&
                item.rate === rate &&
                item.gst_percentage === productGstPct
    )

    if (existingItemIndex !== -1) {
      // Product exists - update quantity
      const updatedItems = [...items]
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

      setItems(updatedItems)
    } else {
      // New product - add to list
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
      }

      setItems([...items, newItem])
    }
  }

  const addItem = () => {
    if (!currentItem.product_name || currentItem.quantity <= 0) {
      alert('Please enter product name and valid quantity')
      return
    }

    if (!currentItem.rate || currentItem.rate <= 0) {
      alert('Please enter a valid rate')
      return
    }

    // Check if stock is 0 (out of stock)
    if (!isNewProduct && availableStock === 0) {
      alert('⚠️ This product is out of stock! Cannot add to bill.')
      return
    }

    // Check stock availability and adjust quantity if needed
    let actualQuantity = currentItem.quantity
    let limitedByStock = false
    let requestedQuantity = currentItem.quantity

    if (!isNewProduct && availableStock > 0 && currentItem.quantity > availableStock) {
      actualQuantity = availableStock
      limitedByStock = true
    }

    // Check if product already exists in items
    const existingItemIndex = items.findIndex(
      (item) => item.product_id === currentItem.product_id &&
                item.rate === currentItem.rate &&
                item.gst_percentage === currentItem.gst_percentage
    )

    if (existingItemIndex !== -1) {
      // Product exists - update quantity
      const updatedItems = [...items]
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

      setItems(updatedItems)
    } else {
      // New product - add to list
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

      setItems([...items, newItem])
    }

    setCurrentItem({
      product_id: '',
      product_name: '',
      item_code: '',
      hsn_code: '',
      unit: '',
      quantity: 1,
      rate: 0,
      gst_percentage: 0,
    })
    setProductSearch('')
    setShowProductDropdown(false)
    setIsNewProduct(false)
    setAvailableStock(0)
    setStockWarning('')

    // Auto-focus search field after adding item
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
        // Move to Rate field
        const rateInput = document.querySelector<HTMLInputElement>('input[title*="Enter rate"]')
        rateInput?.focus()
        rateInput?.select()
      } else if (field === 'rate') {
        // Move to GST field
        gstInputRef.current?.focus()
        gstInputRef.current?.select()
      } else if (field === 'gst') {
        // Add item and return to search
        addItem()
      }
    }
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  // Check for mixed GST items
  const getMixedGSTWarning = () => {
    if (items.length === 0) return null

    const hasGSTItems = items.some(item => item.gst_percentage > 0)
    const hasNonGSTItems = items.some(item => item.gst_percentage === 0)

    if (hasGSTItems && hasNonGSTItems) {
      const nonGSTProducts = items
        .filter(item => item.gst_percentage === 0)
        .map(item => item.product_name)

      return {
        type: 'warning',
        message: `Mixed GST Bill! Products without GST: ${nonGSTProducts.join(', ')}`,
        products: nonGSTProducts
      }
    }
    return null
  }

  const updateItemQuantity = (index: number, newQty: number) => {
    const updatedItems = [...items]
    const item = updatedItems[index]
    const subtotal = newQty * item.rate
    const gstAmt = (subtotal * item.gst_percentage) / 100

    updatedItems[index] = {
      ...item,
      quantity: newQty,
      gst_amount: Number(gstAmt.toFixed(2)),
      amount: Number((subtotal + gstAmt).toFixed(2)),
    }

    setItems(updatedItems)
  }

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + item.quantity * item.rate, 0)
  }

  const calculateTotalGST = () => {
    return items.reduce((sum, item) => sum + item.gst_amount, 0)
  }

  const calculateGrandTotal = () => {
    const subtotalWithGST = calculateSubtotal() + calculateTotalGST()
    const calculatedDiscountAmount = (subtotalWithGST * discountPercentage) / 100
    return Math.max(0, subtotalWithGST - calculatedDiscountAmount)
  }

  const getDiscountAmount = () => {
    const subtotalWithGST = calculateSubtotal() + calculateTotalGST()
    return (subtotalWithGST * discountPercentage) / 100
  }

  const hasGSTItems = () => {
    return items.some((item) => item.gst_percentage > 0)
  }

  const getBillType = () => {
    return hasGSTItems() ? 'GST Bill' : 'Non-GST Bill'
  }

  const hasMixedGST = () => {
    const hasGST = items.some((item) => item.gst_percentage > 0)
    const hasNonGST = items.some((item) => item.gst_percentage === 0)
    return hasGST && hasNonGST
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (items.length === 0) {
      alert('Please add at least one item')
      return
    }

    if (!formData.payment_type) {
      alert('Please select a payment type')
      return
    }

    // Show confirmation dialog
    setShowPrintConfirm(true)
  }

  const confirmPrintBill = async () => {
    try {
      setLoading(true)
      setShowPrintConfirm(false)

      // Remove stock indicators before sending to backend
      const cleanedItems = items.map(({ limitedByStock, requestedQuantity, ...item }) => item)

      const response = await api.post('/billing/create', {
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        items: cleanedItems,
        payment_type: formData.payment_type,
      })

      setBillNumberCreated(response.data.bill_number)
      setSuccessMessage(`${response.data.bill_type} created successfully! Bill #${response.data.bill_number}`)
      setShowSuccessModal(true)
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create bill')
    } finally {
      setLoading(false)
    }
  }

  const handleSuccessClose = () => {
    setShowSuccessModal(false)
    router.push('/billing')
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        {/* Mixed GST Warning */}
        {getMixedGSTWarning() && (
          <div className="mb-2 bg-amber-50 border-l-2 border-amber-500 p-2 rounded">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-4 w-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-2">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-800">
                  {getMixedGSTWarning()?.message}
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          {/* Single Container - Bill Info, Customer Info & Barcode */}
          <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700">
            {/* Bill Number and Date Header */}
            <div className="grid grid-cols-2 gap-4 p-2 border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 mb-1 font-medium">Bill Number</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white dark:text-white">
                  #{nextBillNumber || '...'}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 mb-1 font-medium">Date</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white dark:text-white">
                  {formatDate(billDate)}
                </span>
              </div>
            </div>

            {/* Customer Info & Barcode Section */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 p-2">
              {/* Customer Name */}
              <div className="md:col-span-3">
                <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-0.5">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter customer name"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                />
              </div>

              {/* Phone */}
              <div className="md:col-span-2">
                <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-0.5">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Mobile number"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                />
              </div>

              {/* Payment Type - Dropdown */}
              <div className="md:col-span-2">
                <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-0.5">
                  Payment <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.payment_type}
                  onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                >
                  <option value="">Select Payment</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  {paymentTypes.length > 0 && paymentTypes.map((pt) => (
                    <option key={pt.payment_type_id} value={pt.payment_type_id}>
                      {pt.payment_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Barcode Scanner */}
              <div className="md:col-span-5">
                <label className="block text-[10px] font-medium text-blue-700 dark:text-blue-400 mb-0.5">
                  Barcode Scanner (F2)
                </label>
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeScanned}
                  placeholder="Scan or type item code and press Enter..."
                  className="w-full px-2 py-1 border border-blue-400 dark:border-blue-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-blue-50 dark:bg-blue-900 font-mono text-xs text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Manual Product Selection Row */}
            <div className={`border-t border-gray-200 dark:border-gray-700 p-2 ${isNewProduct ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-gray-900'}`}>
              {isNewProduct && (
                <div className="mb-1 flex items-center gap-1 text-green-700 dark:text-green-400">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[10px] font-semibold">Creating New Product</span>
                </div>
              )}
              <div className="flex gap-1 items-end">
                <div className="flex-1 relative product-search-container">
                  <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-0.5">Search Product</label>
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
                    onKeyDown={handleProductSearchKeyDown}
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                  />
                  {/* Dropdown List */}
                  {showProductDropdown && productSearch && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredProducts.length > 0 ? (
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
                                  <div className="text-sm font-medium text-gray-900 dark:text-white dark:text-white">
                                    {product.product_name}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    Code: {product.item_code || 'N/A'} | Stock: {product.quantity} | GST: {product.gst_percentage}%
                                  </div>
                                </div>
                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-600">
                                  ₹{Number(product.rate).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          ))}
                          {/* Create New Product Option */}
                          <div
                            onClick={handleCreateNewProduct}
                            className="px-3 py-2 cursor-pointer bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 border-t-2 border-green-300 dark:border-green-700"
                          >
                            <div className="flex items-center gap-2">
                              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              <div>
                                <div className="text-sm font-semibold text-green-700 dark:text-green-400">
                                  Create New Product:  &quot;{productSearch}&quot;
                                </div>
                                <div className="text-xs text-green-600 dark:text-green-500">
                                  Click to add as new product to this bill
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div
                          onClick={handleCreateNewProduct}
                          className="px-3 py-3 cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20"
                        >
                          <div className="flex items-center gap-2 justify-center">
                            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <div className="text-sm font-semibold text-green-700 dark:text-green-400">
                              Create New Product: &quot;{productSearch}&quot;
                            </div>
                          </div>
                          <div className="text-xs text-center text-gray-500 dark:text-gray-400 mt-1">
                            Product not found. Click to create and add to bill.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="w-[80px]">
                  <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-0.5">
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
                      // Check stock availability
                      if (!isNewProduct && Boolean(currentItem.product_id) && availableStock === 0) {
                        setStockWarning('🚫 OUT OF STOCK - Cannot add this item!')
                      } else if (!isNewProduct && Boolean(currentItem.product_id) && qty > availableStock) {
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
                <div className="w-[90px]">
                  <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-0.5">Rate</label>
                  <input
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
                <div className="w-[70px]">
                  <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-0.5">GST%</label>
                  <input
                    ref={gstInputRef}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    value={currentItem.gst_percentage || ''}
                    onChange={(e) =>
                      setCurrentItem({ ...currentItem, gst_percentage: parseFloat(e.target.value) || 0 })
                    }
                    onKeyDown={(e) => handleKeyPress(e, 'gst')}
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                    title="Enter GST %"
                  />
                </div>
                <div className="w-[70px]">
                  <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-0.5">Disc%</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    value={discountPercentage || ''}
                    onChange={(e) => setDiscountPercentage(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                    title="Discount %"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={addItem}
                    disabled={!isNewProduct && Boolean(currentItem.product_id) && availableStock === 0}
                    className={`px-3 py-1 rounded transition font-medium text-xs whitespace-nowrap ${
                      !isNewProduct && currentItem.product_id && availableStock === 0
                        ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                    title={!isNewProduct && currentItem.product_id && availableStock === 0 ? 'Out of stock' : 'Add item'}
                  >
                    {!isNewProduct && currentItem.product_id && availableStock === 0 ? 'Out' : '+ Add'}
                  </button>
                </div>
              </div>

              {/* Stock Warning and Calculated Amounts */}
              {(stockWarning || (!isNewProduct && Boolean(currentItem.product_id) && availableStock > 0)) && (
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex-1">
                    {stockWarning && (
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">{stockWarning}</p>
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
            <div className="overflow-x-auto overflow-y-auto" style={{ height: '280px' }}>
              <table className="w-full border-collapse min-w-[900px]">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10 border-b border-gray-300 dark:border-gray-600">
                  <tr>
                    <th className="px-1 py-1 text-left text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-8">
                      #
                    </th>
                    <th className="px-1 py-1 text-left text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-20">
                      Code
                    </th>
                    <th className="px-1 py-1 text-left text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700">
                      Product Name
                    </th>
                    <th className="px-1 py-1 text-left text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-12">
                      Unit
                    </th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-16">
                      Qty
                    </th>
                    <th className="px-1 py-1 text-right text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-20">
                      Rate
                    </th>
                    {hasGSTItems() && (
                      <>
                        <th className="px-1 py-1 text-center text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-14">
                          GST%
                        </th>
                        <th className="px-1 py-1 text-right text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-20">
                          GST
                        </th>
                      </>
                    )}
                    <th className="px-1 py-1 text-right text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase border-r border-gray-200 dark:border-gray-700 w-24">
                      Total
                    </th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase w-10">

                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={hasGSTItems() ? 10 : 8} className="px-2 py-12 text-center text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex flex-col items-center gap-1">
                          <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                          <p className="text-sm font-medium text-gray-400 dark:text-gray-500">No items added</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">Scan barcode or select product</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => {
                      // Check if this item's GST status differs from the first item
                      const firstItemHasGST = items.length > 0 && items[0].gst_percentage > 0
                      const currentItemHasGST = item.gst_percentage > 0
                      const isDifferentFromFirst = index > 0 && firstItemHasGST !== currentItemHasGST

                      return (
                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-600 dark:border-gray-700">
                          <td className="px-1 py-0.5 text-xs text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-600 font-medium text-center">
                            {index + 1}
                          </td>
                          <td className="px-1 py-0.5 text-[10px] text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-600 font-mono">
                            {item.item_code || '-'}
                          </td>
                          <td className="px-1 py-0.5 text-xs border-r border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-1">
                              <span className={`font-bold ${
                                isDifferentFromFirst
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-gray-900 dark:text-white'
                              }`}>
                                {item.product_name}
                              </span>
                              {item.limitedByStock && (
                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 border border-orange-300 dark:border-orange-700">
                                  Limited
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-1 py-0.5 text-[10px] text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 text-center">
                            {item.unit || 'pcs'}
                          </td>
                          <td className="px-1 py-0.5 text-xs border-r border-gray-200 dark:border-gray-700">
                            <input
                              type="number"
                              min="1"
                              title="Quantity"
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 1)}
                              className="w-full px-1 py-0.5 text-center border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700 font-medium text-xs"
                            />
                          </td>
                          <td className="px-1 py-0.5 text-xs text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 text-right font-semibold">
                            ₹{Number(item.rate).toFixed(2)}
                          </td>
                          {hasGSTItems() && (
                            <>
                              <td className="px-1 py-0.5 text-xs border-r border-gray-200 dark:border-gray-700 text-center">
                                <span className={`inline-block px-1 py-0.5 rounded text-[9px] font-semibold ${
                                  item.gst_percentage > 0
                                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                }`}>
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
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Section - Totals & Actions */}
          <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 p-2">
              {/* Summary Cards - Left Side */}
              <div className="lg:col-span-3 grid grid-cols-2 gap-2">
                <div className="bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
                  <div className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">Total Items</div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white dark:text-white">{items.length}</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
                  <div className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">Total Qty</div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white dark:text-white">
                    {items.reduce((sum, item) => sum + item.quantity, 0)}
                  </div>
                </div>
              </div>

              {/* Billing Summary - Middle */}
              <div className="lg:col-span-5 bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">Subtotal:</span>
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">₹{calculateSubtotal().toFixed(2)}</span>
                  </div>
                  {hasGSTItems() && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">Total GST:</span>
                      <span className="text-xs font-semibold text-gray-900 dark:text-white">₹{calculateTotalGST().toFixed(2)}</span>
                    </div>
                  )}
                  {discountPercentage > 0 && (
                    <div className="flex justify-between items-center border-t border-gray-300 dark:border-gray-600 pt-1">
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">Discount ({discountPercentage}%):</span>
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">- ₹{getDiscountAmount().toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-t border-gray-400 dark:border-gray-600 pt-1 mt-1">
                    <span className="text-sm text-gray-900 dark:text-white font-bold">Grand Total:</span>
                    <span className="text-lg font-bold text-green-700 dark:text-green-400">₹{calculateGrandTotal().toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Actions - Right Side */}
              <div className="lg:col-span-4 flex flex-col md:flex-row items-stretch md:items-center gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded hover:bg-green-700 dark:hover:bg-green-800 transition disabled:bg-gray-400 dark:disabled:bg-gray-600 font-bold text-sm shadow-md hover:shadow-lg"
                >
                  {loading ? 'Processing...' : 'Print Bill'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/billing')}
                  className="flex-1 px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white rounded hover:bg-gray-600 dark:hover:bg-gray-700 transition font-semibold text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Print Confirmation Modal */}
        {showPrintConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
                  <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Print Bill?</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Do you want to print this bill now?
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={confirmPrintBill}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 transition font-semibold disabled:bg-gray-400 dark:disabled:bg-gray-600"
                >
                  {loading ? 'Processing...' : 'Yes, Print Now'}
                </button>
                <button
                  onClick={() => setShowPrintConfirm(false)}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-gray-500 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-600 dark:hover:bg-gray-700 transition font-semibold disabled:bg-gray-400 dark:disabled:bg-gray-600"
                >
                  No, Cancel
                </button>
                <button
                  onClick={() => {
                    setShowPrintConfirm(false)
                    setShowPreview(true)
                  }}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition font-semibold disabled:bg-gray-400 dark:disabled:bg-gray-600"
                >
                  Preview Bill
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bill Preview Modal - Professional Software Theme */}
        {showPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Bill Preview</h3>
                    <p className="text-sm text-blue-100">Review before printing</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Bill Content */}
              <div className="flex-1 overflow-y-auto p-8 bg-gray-50 dark:bg-gray-900">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 border-gray-200 dark:border-gray-700 p-8 max-w-3xl mx-auto">
                  {/* Business Header */}
                  <div className="border-b-2 border-gray-300 dark:border-gray-600 pb-6 mb-6">
                    <div className="text-center">
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{client?.client_name || 'Business Name'}</h1>
                      {client?.address && <p className="text-sm text-gray-600 dark:text-gray-400">{client.address}</p>}
                      {client?.phone && <p className="text-sm text-gray-600 dark:text-gray-400">Ph: {client.phone}</p>}
                      {client?.email && <p className="text-sm text-gray-600 dark:text-gray-400">{client.email}</p>}
                      {client?.gstin && <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-2">GSTIN: {client.gstin}</p>}
                    </div>
                  </div>

                  {/* Bill Info Grid */}
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Bill Number</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">#{nextBillNumber}</p>
                      </div>
                    </div>
                    <div>
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Date</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatDate(billDate)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold uppercase mb-2">Customer Details</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Name:</p>
                        <p className="font-semibold text-gray-900 dark:text-white">{formData.customer_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Phone:</p>
                        <p className="font-semibold text-gray-900 dark:text-white">{formData.customer_phone}</p>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="mb-6">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                          <th className="text-left py-3 px-2 text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">#</th>
                          <th className="text-left py-3 px-2 text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Product</th>
                          <th className="text-center py-3 px-2 text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Qty</th>
                          <th className="text-right py-3 px-2 text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Rate</th>
                          {hasGSTItems() && (
                            <>
                              <th className="text-center py-3 px-2 text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">GST%</th>
                              <th className="text-right py-3 px-2 text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">GST</th>
                            </>
                          )}
                          <th className="text-right py-3 px-2 text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => (
                          <tr key={index} className="border-b border-gray-200 dark:border-gray-700">
                            <td className="py-3 px-2 text-sm text-gray-600 dark:text-gray-400">{index + 1}</td>
                            <td className="py-3 px-2">
                              <p className="font-semibold text-gray-900 dark:text-white">{item.product_name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{item.unit}</p>
                            </td>
                            <td className="py-3 px-2 text-center font-medium text-gray-900 dark:text-white">{item.quantity}</td>
                            <td className="py-3 px-2 text-right font-medium text-gray-900 dark:text-white">₹{item.rate.toFixed(2)}</td>
                            {hasGSTItems() && (
                              <>
                                <td className="py-3 px-2 text-center text-sm text-gray-700 dark:text-gray-300">{item.gst_percentage}%</td>
                                <td className="py-3 px-2 text-right font-medium text-gray-700 dark:text-gray-300">₹{item.gst_amount.toFixed(2)}</td>
                              </>
                            )}
                            <td className="py-3 px-2 text-right font-bold text-gray-900 dark:text-white">₹{item.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals Section */}
                  <div className="flex justify-end">
                    <div className="w-80">
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Subtotal:</span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">₹{calculateSubtotal().toFixed(2)}</span>
                        </div>
                        {hasGSTItems() && (
                          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total GST:</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">₹{calculateTotalGST().toFixed(2)}</span>
                          </div>
                        )}
                        {getDiscountAmount() > 0 && (
                          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                            <span className="text-sm font-medium text-red-600 dark:text-red-400">Discount:</span>
                            <span className="text-sm font-semibold text-red-600 dark:text-red-400">- ₹{getDiscountAmount().toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between py-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg px-4 border-2 border-green-400 dark:border-green-700">
                          <span className="text-base font-bold text-green-800 dark:text-green-400">Grand Total:</span>
                          <span className="text-2xl font-bold text-green-700 dark:text-green-400">₹{calculateGrandTotal().toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                        Payment: {
                          formData.payment_type === 'cash' ? 'Cash' :
                          formData.payment_type === 'upi' ? 'UPI' :
                          formData.payment_type === 'card' ? 'Card' :
                          paymentTypes.find(pt => pt.payment_type_id === formData.payment_type)?.payment_name || 'N/A'
                        }
                      </div>
                    </div>
                  </div>

                  {/* Bill Type Badge */}
                  <div className="mt-6 text-center">
                    <span className={`inline-block px-4 py-2 rounded-lg text-sm font-bold ${
                      hasGSTItems()
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
                    }`}>
                      {getBillType()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="bg-gray-100 dark:bg-gray-900 px-6 py-4 flex items-center justify-between border-t border-gray-300 dark:border-gray-700">
                <button
                  onClick={() => setShowPreview(false)}
                  className="px-6 py-2.5 bg-gray-500 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-600 dark:hover:bg-gray-700 transition font-semibold"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowPreview(false)
                    setShowPrintConfirm(true)
                  }}
                  className="px-8 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-700 dark:to-emerald-700 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 dark:hover:from-green-800 dark:hover:to-emerald-800 transition font-bold shadow-lg"
                >
                  Proceed to Print
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                  <svg className="h-10 w-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Success!</h3>
                <p className="text-base text-gray-700 dark:text-gray-300 mb-6">
                  {successMessage}
                </p>
                <button
                  onClick={handleSuccessClose}
                  className="w-full px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition font-semibold text-lg"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
