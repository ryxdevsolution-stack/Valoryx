'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { useData } from '@/contexts/DataContext'
import { useClient } from '@/contexts/ClientContext'
import BillPrintPreview from '@/components/BillPrintPreview'
import { RefreshCw, ArrowRight, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

interface Product {
  product_id: string
  product_name: string
  rate: number | string
  quantity: number
  item_code: string
  gst_percentage: number | string
  hsn_code: string
  unit: string
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
}

interface PaymentSplit {
  payment_type: string
  amount: number
}

interface Bill {
  bill_id: string
  bill_number: number
  type: 'gst' | 'non_gst'
  customer_name: string
  customer_phone: string
  customer_gstin: string
  items: BillItem[]
  payment_type: string
  final_amount?: number
  total_amount?: number
}

interface ReturnItem extends BillItem {
  return_quantity: number
  selected: boolean
}

export default function ExchangeBillPage() {
  const params = useParams()
  const router = useRouter()
  const { fetchProducts } = useData()
  const { client } = useClient()
  const productSearchRef = useRef<HTMLInputElement>(null)

  const billId = params.billId as string
  const paymentTypes = ['Cash', 'Card', 'UPI', 'Net Banking', 'Cheque', 'Credit', 'Wallet', 'Other']

  const [bill, setBill] = useState<Bill | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  // Return/Exchange state
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  const [newItems, setNewItems] = useState<BillItem[]>([])

  // Product selection state for new items
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [currentItem, setCurrentItem] = useState({
    product_id: '',
    product_name: '',
    item_code: '',
    hsn_code: '',
    unit: '',
    quantity: 1,
    rate: 0,
    gst_percentage: 0,
    gst_amount: 0,
    amount: 0,
    cost_price: 0,
    mrp: 0,
  })

  // Payment state
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([])
  const [paymentType, setPaymentType] = useState('')
  const [paymentAmount, setPaymentAmount] = useState<number | string>('')

  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [exchangeResult, setExchangeResult] = useState<any>(null)
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [billForPrint, setBillForPrint] = useState<any>(null)

  useEffect(() => {
    loadBillData()
    loadProducts()
  }, [billId])

  const loadBillData = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/billing/${billId}`)
      const billData = response.data.bill

      setBill(billData)

      // Initialize return items with all original items
      const items: ReturnItem[] = billData.items.map((item: BillItem) => ({
        ...item,
        return_quantity: 0,
        selected: false
      }))
      setReturnItems(items)
    } catch (error: any) {
      console.error('Failed to load bill:', error)
      alert('Failed to load bill details')
      router.push('/billing')
    } finally {
      setLoading(false)
    }
  }

  const loadProducts = async () => {
    try {
      const fetchedProducts = await fetchProducts()
      setProducts(fetchedProducts)
    } catch (error) {
      console.error('Failed to load products:', error)
    }
  }

  const filteredProducts = products.filter(
    (p) =>
      p.product_name?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.item_code?.toLowerCase().includes(productSearch.toLowerCase())
  )

  const handleReturnItemSelect = (index: number) => {
    const updated = [...returnItems]
    updated[index].selected = !updated[index].selected
    if (updated[index].selected && updated[index].return_quantity === 0) {
      updated[index].return_quantity = updated[index].quantity
    } else if (!updated[index].selected) {
      updated[index].return_quantity = 0
    }
    setReturnItems(updated)
  }

  const handleReturnQuantityChange = (index: number, qty: number) => {
    const updated = [...returnItems]
    const maxQty = updated[index].quantity
    updated[index].return_quantity = Math.min(Math.max(0, qty), maxQty)
    setReturnItems(updated)
  }

  const handleProductSelect = (product: Product) => {
    setCurrentItem({
      product_id: product.product_id,
      product_name: product.product_name,
      item_code: product.item_code,
      hsn_code: product.hsn_code,
      unit: product.unit,
      quantity: 1,
      rate: Number(product.rate),
      gst_percentage: Number(product.gst_percentage),
      gst_amount: 0,
      amount: 0,
      cost_price: Number(product.cost_price || 0),
      mrp: Number(product.mrp || 0),
    })
    setProductSearch('')
    setShowProductDropdown(false)
  }

  const calculateItemTotals = (item: typeof currentItem) => {
    const baseAmount = item.quantity * item.rate
    const gstAmount = (baseAmount * item.gst_percentage) / 100
    const totalAmount = baseAmount + gstAmount

    return {
      ...item,
      gst_amount: gstAmount,
      amount: totalAmount,
    }
  }

  const handleAddNewItem = () => {
    if (!currentItem.product_id) {
      alert('Please select a product')
      return
    }

    const calculatedItem = calculateItemTotals(currentItem)
    setNewItems([...newItems, calculatedItem])

    setCurrentItem({
      product_id: '',
      product_name: '',
      item_code: '',
      hsn_code: '',
      unit: '',
      quantity: 1,
      rate: 0,
      gst_percentage: 0,
      gst_amount: 0,
      amount: 0,
      cost_price: 0,
      mrp: 0,
    })
    setProductSearch('')
    productSearchRef.current?.focus()
  }

  const handleRemoveNewItem = (index: number) => {
    setNewItems(newItems.filter((_, i) => i !== index))
  }

  const handleAddPaymentSplit = () => {
    if (!paymentType) {
      alert('Please select a payment type')
      return
    }
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      alert('Please enter a valid amount')
      return
    }

    setPaymentSplits([...paymentSplits, {
      payment_type: paymentType,
      amount: Number(paymentAmount)
    }])
    setPaymentType('')
    setPaymentAmount('')
  }

  const handleRemovePaymentSplit = (index: number) => {
    setPaymentSplits(paymentSplits.filter((_, i) => i !== index))
  }

  const getSelectedReturnItems = () => returnItems.filter(item => item.selected && item.return_quantity > 0)

  const getReturnAmount = () => {
    return getSelectedReturnItems().reduce((sum, item) => {
      const itemRate = item.amount / item.quantity
      return sum + (itemRate * item.return_quantity)
    }, 0)
  }

  const getNewItemsAmount = () => newItems.reduce((sum, item) => sum + item.amount, 0)

  const getDifference = () => getNewItemsAmount() - getReturnAmount()

  const getTotalPaymentSplits = () => paymentSplits.reduce((sum, split) => sum + split.amount, 0)

  const handleProcessExchange = async () => {
    const selectedItems = getSelectedReturnItems()

    if (selectedItems.length === 0) {
      alert('Please select at least one item to return')
      return
    }

    if (newItems.length === 0) {
      alert('Please add at least one new item for exchange')
      return
    }

    const difference = getDifference()

    // Only require payment if customer owes money
    if (difference > 0 && paymentSplits.length === 0) {
      alert('Please add payment method for the balance amount')
      return
    }

    if (difference > 0 && Math.abs(getTotalPaymentSplits() - difference) > 0.01) {
      alert(`Payment amount (₹${getTotalPaymentSplits().toFixed(2)}) must equal balance due (₹${difference.toFixed(2)})`)
      return
    }

    if (!confirm('Are you sure you want to process this exchange?')) {
      return
    }

    try {
      setProcessing(true)

      // Prepare returned items
      const returnedItems = selectedItems.map(item => {
        const perUnitGst = item.gst_amount / item.quantity
        const perUnitAmount = item.amount / item.quantity

        return {
          product_id: item.product_id,
          product_name: item.product_name,
          item_code: item.item_code,
          hsn_code: item.hsn_code,
          unit: item.unit,
          quantity: item.return_quantity,
          rate: Number(item.rate),
          gst_percentage: Number(item.gst_percentage),
          gst_amount: Number((perUnitGst * item.return_quantity).toFixed(2)),
          amount: Number((perUnitAmount * item.return_quantity).toFixed(2)),
          cost_price: item.cost_price ? Number(item.cost_price) : 0,
          mrp: item.mrp ? Number(item.mrp) : 0
        }
      })

      const paymentData = JSON.stringify(paymentSplits.map(split => ({
        PAYMENT_TYPE: split.payment_type,
        AMOUNT: split.amount
      })))

      const difference = getDifference()
      const amountReceived = difference > 0 ? getTotalPaymentSplits() : 0

      // Ensure new items have proper numeric values
      const formattedNewItems = newItems.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        item_code: item.item_code,
        hsn_code: item.hsn_code,
        unit: item.unit,
        quantity: Number(item.quantity),
        rate: Number(item.rate),
        gst_percentage: Number(item.gst_percentage),
        gst_amount: Number(item.gst_amount.toFixed(2)),
        amount: Number(item.amount.toFixed(2)),
        cost_price: item.cost_price ? Number(item.cost_price) : 0,
        mrp: item.mrp ? Number(item.mrp) : 0
      }))

      const requestBody = {
        returned_items: returnedItems,
        new_items: formattedNewItems,
        payment_type: paymentData,
        amount_received: amountReceived,
        customer_name: bill?.customer_name,
        customer_phone: bill?.customer_phone,
        customer_gstin: bill?.customer_gstin
      }

      console.log('Sending exchange request:', requestBody)
      console.log('Returned items:', returnedItems)
      console.log('New items:', newItems)
      console.log('Payment data:', paymentData)

      const response = await api.post(`/billing/exchange/${billId}`, requestBody)

      setExchangeResult(response.data)
      setShowSuccessModal(true)

      // Fetch the new exchange bill for printing
      const newBillId = response.data.exchange_bill_id
      const billDetailsResponse = await api.get(`/billing/${newBillId}`)
      setBillForPrint(billDetailsResponse.data.bill)
    } catch (error: any) {
      console.error('Failed to process exchange:', error)
      console.error('Error response:', error.response?.data)
      console.error('Error status:', error.response?.status)
      console.error('Full error:', error)

      const errorMessage = error.response?.data?.error ||
                          error.response?.data?.message ||
                          error.message ||
                          'Failed to process exchange. Please check the console for details.'

      alert(errorMessage)
    } finally {
      setProcessing(false)
    }
  }

  const handlePrintAndClose = () => {
    setShowSuccessModal(false)
    setShowPrintPreview(true)
  }

  const handleCloseExchange = () => {
    router.push('/billing')
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading bill details...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!bill) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <XCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <p className="text-red-600 text-lg font-semibold mb-2">Bill not found</p>
            <button
              onClick={() => router.push('/billing')}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Back to Bills
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="p-2 sm:p-4 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-3 sm:mb-4">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
              Exchange Bill #{bill.bill_number}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            Original Bill ID: {bill.bill_id} | Customer: {bill.customer_name}
          </p>
        </div>

        {/* Exchange Flow Indicator */}
        <div className="mb-4 sm:mb-6 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 p-3 sm:p-4 rounded-lg border-2 border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            <div className="text-center flex-1">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-600 text-white rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2 font-bold text-sm">
                1
              </div>
              <p className="text-[10px] sm:text-xs font-semibold text-gray-700 dark:text-gray-300 hidden sm:block">Select Returns</p>
              <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 sm:hidden">Returns</p>
            </div>
            <ArrowRight className="w-4 h-4 sm:w-6 sm:h-6 text-orange-600 mx-1 sm:mx-2" />
            <div className="text-center flex-1">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-600 text-white rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2 font-bold text-sm">
                2
              </div>
              <p className="text-[10px] sm:text-xs font-semibold text-gray-700 dark:text-gray-300 hidden sm:block">Add New Items</p>
              <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 sm:hidden">New Items</p>
            </div>
            <ArrowRight className="w-4 h-4 sm:w-6 sm:h-6 text-orange-600 mx-1 sm:mx-2" />
            <div className="text-center flex-1">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-600 text-white rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2 font-bold text-sm">
                3
              </div>
              <p className="text-[10px] sm:text-xs font-semibold text-gray-700 dark:text-gray-300 hidden sm:block">Process Exchange</p>
              <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 sm:hidden">Process</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {/* Left Column - Return Items */}
          <div className="space-y-3 sm:space-y-4">
            {/* Step 1: Select Items to Return */}
            <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg shadow border-2 border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-xs sm:text-sm">
                  1
                </div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Items to Return</h2>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-2 sm:mb-3">
                Select items from the original bill that you want to return
              </p>

              <div className="space-y-2">
                {returnItems.map((item, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border-2 transition ${
                      item.selected
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => handleReturnItemSelect(index)}
                        className="mt-1 w-4 h-4 text-red-600 rounded focus:ring-red-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white text-xs sm:text-sm truncate">
                              {item.product_name}
                            </p>
                            <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">
                              {item.item_code} | ₹{item.rate.toFixed(2)}
                            </p>
                          </div>
                          <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap">
                            ₹{item.amount.toFixed(2)}
                          </p>
                        </div>

                        {item.selected && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <label className="text-[10px] sm:text-xs font-medium text-gray-700 dark:text-gray-300">
                              Qty:
                            </label>
                            <input
                              type="number"
                              min="1"
                              max={item.quantity}
                              value={item.return_quantity}
                              onChange={(e) => handleReturnQuantityChange(index, Number(e.target.value))}
                              className="w-16 sm:w-20 px-2 py-1 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <span className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">
                              of {item.quantity}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm font-semibold text-red-900 dark:text-red-200">
                    Return Amount:
                  </span>
                  <span className="text-base sm:text-lg font-bold text-red-900 dark:text-red-200">
                    ₹{getReturnAmount().toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - New Items */}
          <div className="space-y-3 sm:space-y-4">
            {/* Step 2: Add New Items */}
            <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg shadow border-2 border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-xs sm:text-sm">
                  2
                </div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Exchange With</h2>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-2 sm:mb-3">
                Add new items for exchange
              </p>

              {/* Product Search */}
              <div className="relative mb-3">
                <input
                  ref={productSearchRef}
                  type="text"
                  placeholder="Search products..."
                  value={currentItem.product_id ? currentItem.product_name : productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value)
                    setShowProductDropdown(true)
                  }}
                  onFocus={() => setShowProductDropdown(true)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                {showProductDropdown && productSearch && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-auto">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((product) => (
                        <div
                          key={product.product_id}
                          onClick={() => handleProductSelect(product)}
                          className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                        >
                          <p className="font-medium text-gray-900 dark:text-white">{product.product_name}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{product.item_code} - ₹{Number(product.rate).toFixed(2)}</p>
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-500">No products found</div>
                    )}
                  </div>
                )}
              </div>

              {currentItem.product_id && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <input
                    type="number"
                    placeholder="Qty"
                    value={currentItem.quantity}
                    onChange={(e) => setCurrentItem({ ...currentItem, quantity: Number(e.target.value) })}
                    className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Rate"
                    value={currentItem.rate}
                    onChange={(e) => setCurrentItem({ ...currentItem, rate: Number(e.target.value) })}
                    className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <input
                    type="number"
                    placeholder="GST %"
                    value={currentItem.gst_percentage}
                    onChange={(e) => setCurrentItem({ ...currentItem, gst_percentage: Number(e.target.value) })}
                    className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <button
                    onClick={handleAddNewItem}
                    className="px-2 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm font-medium"
                  >
                    Add
                  </button>
                </div>
              )}

              {/* New Items List */}
              <div className="space-y-2">
                {newItems.map((item, index) => (
                  <div key={index} className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">
                          {item.product_name}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Qty: {item.quantity} × ₹{item.rate.toFixed(2)} | GST: {item.gst_percentage}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          ₹{item.amount.toFixed(2)}
                        </p>
                        <button
                          onClick={() => handleRemoveNewItem(index)}
                          className="text-xs text-red-600 hover:text-red-700 mt-1"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {newItems.length === 0 && (
                  <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                    No items added yet
                  </div>
                )}
              </div>

              <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm font-semibold text-green-900 dark:text-green-200">
                    New Items Amount:
                  </span>
                  <span className="text-base sm:text-lg font-bold text-green-900 dark:text-green-200">
                    ₹{getNewItemsAmount().toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Exchange Summary & Payment */}
        <div className="mt-3 sm:mt-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 p-3 sm:p-6 rounded-lg border-2 border-orange-200 dark:border-orange-800">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-orange-600 text-white rounded-full flex items-center justify-center font-bold text-xs sm:text-sm">
              3
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Exchange Summary</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Summary */}
            <div>
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between py-1.5 sm:py-2 border-b border-orange-200 dark:border-orange-800">
                  <span className="text-gray-700 dark:text-gray-300">Returned Value:</span>
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    - ₹{getReturnAmount().toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 sm:py-2 border-b border-orange-200 dark:border-orange-800">
                  <span className="text-gray-700 dark:text-gray-300">New Items Value:</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    + ₹{getNewItemsAmount().toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-2 sm:py-3 border-t-2 border-orange-300 dark:border-orange-700">
                  <span className="font-bold text-gray-900 dark:text-white">Difference:</span>
                  <span className={`font-bold text-base sm:text-lg ${getDifference() >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {getDifference() >= 0 ? '+' : ''}₹{getDifference().toFixed(2)}
                  </span>
                </div>
              </div>

              {getDifference() > 0 && (
                <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-200">
                      Customer Owes: ₹{getDifference().toFixed(2)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-300 mt-1">
                      Please collect payment
                    </p>
                  </div>
                </div>
              )}

              {getDifference() < 0 && (
                <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-200">
                      Refund Due: ₹{Math.abs(getDifference()).toFixed(2)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-300 mt-1">
                      Refund to customer
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Collection (only if difference > 0) */}
            {getDifference() > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Collect Payment</h3>
                <div className="space-y-2">
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">Select Payment Type</option>
                    {paymentTypes.map(pt => (
                      <option key={pt} value={pt}>{pt}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Amount"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    <button
                      onClick={handleAddPaymentSplit}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-medium"
                    >
                      Add
                    </button>
                  </div>

                  <div className="space-y-1 mt-2">
                    {paymentSplits.map((split, index) => (
                      <div key={index} className="flex justify-between items-center bg-white dark:bg-gray-700 p-2 rounded text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">{split.payment_type}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white">₹{split.amount.toFixed(2)}</span>
                          <button
                            onClick={() => handleRemovePaymentSplit(index)}
                            className="text-red-600 hover:text-red-700 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {paymentSplits.length > 0 && (
                    <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded">
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="text-gray-700 dark:text-gray-300">Total Collected:</span>
                        <span className={`${Math.abs(getTotalPaymentSplits() - getDifference()) < 0.01 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          ₹{getTotalPaymentSplits().toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Process Button */}
          <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={handleCloseExchange}
              className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-semibold text-sm sm:text-base"
            >
              Cancel Exchange
            </button>
            <button
              onClick={handleProcessExchange}
              disabled={processing || getSelectedReturnItems().length === 0 || newItems.length === 0}
              className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              {processing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white"></div>
                  <span className="hidden sm:inline">Processing...</span>
                  <span className="sm:hidden">Processing</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Process Exchange</span>
                  <span className="sm:hidden">Process</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && exchangeResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center">
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Exchange Successful!
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Exchange bill has been created successfully
              </p>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4 text-left">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Original Bill:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      #{bill.bill_number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">New Bill:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      #{exchangeResult.exchange_bill_number}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                    <span className="text-gray-600 dark:text-gray-400">Returned:</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      ₹{exchangeResult.returned_amount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">New Items:</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      ₹{exchangeResult.new_amount}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t-2 border-gray-300 dark:border-gray-600">
                    <span className="font-bold text-gray-900 dark:text-white">Difference:</span>
                    <span className={`font-bold ${exchangeResult.difference >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {exchangeResult.difference >= 0 ? '+' : ''}₹{Math.abs(exchangeResult.difference).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCloseExchange}
                  className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition"
                >
                  Close
                </button>
                <button
                  onClick={handlePrintAndClose}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Print Bill
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Preview Modal */}
      {showPrintPreview && billForPrint && client && (
        <BillPrintPreview
          bill={billForPrint}
          clientInfo={client}
          onClose={() => {
            setShowPrintPreview(false)
            router.push('/billing')
          }}
        />
      )}
    </DashboardLayout>
  )
}
