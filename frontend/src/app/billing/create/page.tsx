'use client'

import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { useRouter } from 'next/navigation'

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
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [billNumberCreated, setBillNumberCreated] = useState<number | null>(null)

  useEffect(() => {
    fetchProducts()
    fetchPaymentTypes()
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
  }, [])

  const fetchProducts = async () => {
    try {
      const response = await api.get('/stock')
      setProducts(response.data.stock || [])
    } catch (error) {
      console.error('Failed to fetch products:', error)
    }
  }

  const fetchPaymentTypes = async () => {
    try {
      const response = await api.get('/payment/list')
      setPaymentTypes(response.data.payment_types || [])
    } catch (error) {
      console.error('Failed to fetch payment types:', error)
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
    return calculateSubtotal() + calculateTotalGST()
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
          <div className="mb-3 bg-amber-50 border-l-4 border-amber-500 p-3 rounded">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-800">
                  {getMixedGSTWarning()?.message}
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-700">
                  You can add GST% manually in the product selection row below.
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Single Container - Bill Info, Customer Info & Barcode */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Bill Number and Date Header */}
            <div className="grid grid-cols-2 gap-6 p-4 border-b border-gray-200">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 dark:text-gray-500 mb-1.5 font-medium">Bill Number</span>
                <span className="text-2xl font-bold text-gray-900 dark:text-gray-900">
                  #{nextBillNumber || '...'}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-gray-500 dark:text-gray-500 mb-1.5 font-medium">Date</span>
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-900">
                  {formatDate(billDate)}
                </span>
              </div>
            </div>

            {/* Customer Info & Barcode Section */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 md:p-4">
              {/* Customer Name */}
              <div className="md:col-span-3">
                <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-700 mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter customer name"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                />
              </div>

              {/* Phone */}
              <div className="md:col-span-2">
                <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-700 mb-1">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Mobile number"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                />
              </div>

              {/* Payment Type - Dropdown */}
              <div className="md:col-span-2">
                <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-700 mb-1">
                  Payment <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.payment_type}
                  onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                >
                  <option value="">Select Payment</option>
                  {paymentTypes.map((pt) => (
                    <option key={pt.payment_type_id} value={pt.payment_type_id}>
                      {pt.payment_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Barcode Scanner */}
              <div className="md:col-span-5">
                <label className="block text-xs md:text-sm font-medium text-blue-700 dark:text-blue-700 mb-1">
                  Barcode Scanner (F2)
                </label>
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeScanned}
                  placeholder="Scan or type item code and press Enter..."
                  className="w-full px-3 py-2 border-2 border-blue-400 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50 font-mono text-sm md:text-base text-gray-900"
                />
              </div>
            </div>

            {/* Manual Product Selection Row */}
            <div className={`border-t border-gray-200 p-3 md:p-4 ${isNewProduct ? 'bg-green-50' : 'bg-gray-50'}`}>
              {isNewProduct && (
                <div className="mb-2 flex items-center gap-2 text-green-700 dark:text-green-700">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-semibold">Creating New Product - Enter details below</span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-4 relative product-search-container">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-700 mb-1">Search Product</label>
                  <input
                    ref={productSearchRef}
                    type="text"
                    placeholder="Type to search product by name, code, or barcode..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value)
                      setShowProductDropdown(true)
                      setSelectedProductIndex(0)
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    onKeyDown={handleProductSearchKeyDown}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                  {/* Dropdown List */}
                  {showProductDropdown && productSearch && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredProducts.length > 0 ? (
                        <>
                          {filteredProducts.map((product, index) => (
                            <div
                              key={product.product_id}
                              onClick={() => handleProductSelect(product)}
                              className={`px-3 py-2 cursor-pointer border-b border-gray-100 ${
                                index === selectedProductIndex
                                  ? 'bg-blue-100'
                                  : 'hover:bg-blue-50'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="text-sm font-medium text-gray-900 dark:text-gray-900">
                                    {product.product_name}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-500">
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
                            className="px-3 py-2 cursor-pointer bg-green-50 hover:bg-green-100 border-t-2 border-green-300"
                          >
                            <div className="flex items-center gap-2">
                              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              <div>
                                <div className="text-sm font-semibold text-green-700 dark:text-green-700">
                                  Create New Product:  &quot;{productSearch}&quot;
                                </div>
                                <div className="text-xs text-green-600 dark:text-green-600">
                                  Click to add as new product to this bill
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div
                          onClick={handleCreateNewProduct}
                          className="px-3 py-3 cursor-pointer hover:bg-green-50"
                        >
                          <div className="flex items-center gap-2 justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <div className="text-sm font-semibold text-green-700 dark:text-green-700">
                              Create New Product: &quot;{productSearch}&quot;
                            </div>
                          </div>
                          <div className="text-xs text-center text-gray-500 dark:text-gray-500 mt-1">
                            Product not found. Click to create and add to bill.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-700 mb-1">
                    Quantity
                    {!isNewProduct && Boolean(currentItem.product_id) && availableStock === 0 && (
                      <span className="ml-2 text-xs text-red-600 font-bold">
                        (OUT OF STOCK!)
                      </span>
                    )}
                    {!isNewProduct && Boolean(currentItem.product_id) && availableStock > 0 && (
                      <span className="ml-2 text-xs text-blue-600 font-normal">
                        (Available: {availableStock})
                      </span>
                    )}
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
                    className={`w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                      !isNewProduct && currentItem.product_id && availableStock === 0
                        ? 'bg-red-50 border-red-500 cursor-not-allowed'
                        : stockWarning
                        ? 'bg-white border-red-500'
                        : 'bg-white border-gray-300'
                    }`}
                  />
                  {stockWarning && (
                    <p className="mt-1 text-xs text-red-600 font-medium">{stockWarning}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-700 mb-1">Rate</label>
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
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    title="Enter rate. Press Enter to move to GST field."
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-700 mb-1">GST%</label>
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
                    className="w-full px-2 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    title="Enter GST percentage (0-100). Press Enter to add item."
                  />
                </div>
                <div className="md:col-span-3">
                  <button
                    type="button"
                    onClick={addItem}
                    disabled={!isNewProduct && currentItem.product_id && availableStock === 0}
                    className={`w-full px-4 py-2 rounded transition font-medium text-sm md:text-base ${
                      !isNewProduct && currentItem.product_id && availableStock === 0
                        ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                    title={!isNewProduct && currentItem.product_id && availableStock === 0 ? 'Product out of stock' : 'Add item to bill'}
                  >
                    {!isNewProduct && currentItem.product_id && availableStock === 0 ? '🚫 Out of Stock' : '+ Add Item'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="overflow-x-auto overflow-y-auto" style={{ height: '340px' }}>
              <table className="w-full border-collapse min-w-[900px]">
                <thead className="bg-gray-50 sticky top-0 z-10 border-b-2 border-gray-300">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-700 uppercase border-r border-gray-200 w-12">
                      #
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-700 uppercase border-r border-gray-200 w-24">
                      Code
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-700 uppercase border-r border-gray-200">
                      Product Name
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-700 uppercase border-r border-gray-200 w-16">
                      Unit
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-700 uppercase border-r border-gray-200 w-20">
                      Qty
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-700 uppercase border-r border-gray-200 w-24">
                      Rate
                    </th>
                    {hasGSTItems() && (
                      <>
                        <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-700 uppercase border-r border-gray-200 w-20">
                          GST%
                        </th>
                        <th className="px-2 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-700 uppercase border-r border-gray-200 w-24">
                          GST Amt
                        </th>
                      </>
                    )}
                    <th className="px-2 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-700 uppercase border-r border-gray-200 w-28">
                      Total
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-700 uppercase w-16">

                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={hasGSTItems() ? 10 : 8} className="px-3 py-16 text-center text-gray-400 border-b border-gray-200">
                        <div className="flex flex-col items-center gap-2">
                          <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                          <p className="text-lg font-medium text-gray-400">No items added</p>
                          <p className="text-sm text-gray-400">Scan barcode or select product to add items</p>
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
                        <tr key={index} className="hover:bg-gray-50 transition-colors border-b border-gray-200">
                          <td className="px-2 py-1.5 text-sm text-gray-700 dark:text-gray-700 border-r border-gray-200 font-medium text-center">
                            {index + 1}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-600 border-r border-gray-200 font-mono">
                            {item.item_code || '-'}
                          </td>
                          <td className="px-2 py-1.5 text-sm border-r border-gray-200">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${
                                isDifferentFromFirst
                                  ? 'text-red-600 dark:text-red-600'
                                  : 'text-gray-900 dark:text-gray-900'
                              }`}>
                                {item.product_name}
                              </span>
                              {item.limitedByStock && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
                                  Limited Stock
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-600 border-r border-gray-200 text-center">
                            {item.unit || 'pcs'}
                          </td>
                          <td className="px-2 py-1.5 text-sm border-r border-gray-200">
                            <input
                              type="number"
                              min="1"
                              title="Quantity"
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 1)}
                              className="w-full px-2 py-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white font-medium text-sm"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-sm text-gray-900 dark:text-gray-900 border-r border-gray-200 text-right font-semibold">
                            ₹{Number(item.rate).toFixed(2)}
                          </td>
                          {hasGSTItems() && (
                            <>
                              <td className="px-2 py-1.5 text-sm border-r border-gray-200 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                  item.gst_percentage > 0
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {item.gst_percentage}%
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-sm text-gray-900 dark:text-gray-900 border-r border-gray-200 text-right font-medium">
                                ₹{item.gst_amount.toFixed(2)}
                              </td>
                            </>
                          )}
                          <td className="px-2 py-1.5 text-sm text-gray-900 dark:text-gray-900 border-r border-gray-200 text-right font-bold">
                            ₹{item.amount.toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 text-sm text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition"
                              title="Delete item"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 p-2">
              {/* Summary Cards */}
              <div className="lg:col-span-7 grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-blue-50 rounded p-2 border border-blue-200">
                  <div className="text-xs text-blue-700 dark:text-blue-700 font-medium">Total Items</div>
                  <div className="text-lg font-bold text-blue-900 dark:text-blue-900">{items.length}</div>
                </div>
                <div className="bg-purple-50 rounded p-2 border border-purple-200">
                  <div className="text-xs text-purple-700 dark:text-purple-700 font-medium">Total Qty</div>
                  <div className="text-lg font-bold text-purple-900 dark:text-purple-900">
                    {items.reduce((sum, item) => sum + item.quantity, 0)}
                  </div>
                </div>
                <div className="bg-orange-50 rounded p-2 border border-orange-200">
                  <div className="text-xs text-orange-700 dark:text-orange-700 font-medium">Subtotal</div>
                  <div className="text-base font-bold text-orange-900 dark:text-orange-900">₹{calculateSubtotal().toFixed(2)}</div>
                </div>
                <div className="bg-indigo-50 rounded p-2 border border-indigo-200">
                  <div className="text-xs text-indigo-700 dark:text-indigo-700 font-medium">Total GST</div>
                  <div className="text-base font-bold text-indigo-900 dark:text-indigo-900">₹{calculateTotalGST().toFixed(2)}</div>
                </div>
              </div>

              {/* Grand Total & Actions */}
              <div className="lg:col-span-5 flex flex-col md:flex-row items-stretch md:items-center gap-2">
                <div className="flex-1 bg-gradient-to-r from-green-50 to-emerald-50 rounded p-2 border-2 border-green-300">
                  <div className="text-xs text-green-700 dark:text-green-700 font-semibold">Grand Total</div>
                  <div className="text-xl font-bold text-green-700 dark:text-green-700">₹{calculateGrandTotal().toFixed(2)}</div>
                </div>
                <div className="flex md:flex-col gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 md:flex-none px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:bg-gray-400 font-bold text-sm shadow-lg hover:shadow-xl"
                  >
                    {loading ? 'Processing...' : 'Print Bill'}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/billing')}
                    className="flex-1 md:flex-none px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition font-semibold text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Print Confirmation Modal */}
        {showPrintConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
                  <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Print Bill?</h3>
                <p className="text-sm text-gray-600">
                  Do you want to print this bill now?
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={confirmPrintBill}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold disabled:bg-gray-400"
                >
                  {loading ? 'Processing...' : 'Yes, Print Now'}
                </button>
                <button
                  onClick={() => setShowPrintConfirm(false)}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-semibold disabled:bg-gray-400"
                >
                  No, Cancel
                </button>
                <button
                  onClick={() => {
                    setShowPrintConfirm(false)
                    // TODO: Implement preview functionality
                    alert('Preview feature coming soon!')
                  }}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold disabled:bg-gray-400"
                >
                  Preview Bill
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                  <svg className="h-10 w-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Success!</h3>
                <p className="text-base text-gray-700 mb-6">
                  {successMessage}
                </p>
                <button
                  onClick={handleSuccessClose}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold text-lg"
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
