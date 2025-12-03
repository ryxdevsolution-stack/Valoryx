'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
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
  discount_percentage?: number
  amount_received?: number
  subtotal?: number
  gst_percentage?: number
  gst_amount?: number
  final_amount?: number
  total_amount?: number
  status?: string
}

export default function EditBillPage() {
  const params = useParams()
  const router = useRouter()
  const { fetchProducts } = useData()
  const { client } = useClient()
  const productSearchRef = useRef<HTMLInputElement>(null)
  const quantityInputRef = useRef<HTMLInputElement>(null)

  const billId = params.billId as string
  const paymentTypes = ['Cash', 'Card', 'UPI', 'Net Banking', 'Cheque', 'Credit', 'Wallet', 'Other']

  const [bill, setBill] = useState<Bill | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Bill editing state
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerGSTIN, setCustomerGSTIN] = useState('')
  const [items, setItems] = useState<BillItem[]>([])
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([])
  const [discountPercentage, setDiscountPercentage] = useState(0)
  const [amountReceived, setAmountReceived] = useState(0)

  // Product selection state
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [selectedProductIndex, setSelectedProductIndex] = useState(0)
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

  // Payment split state
  const [paymentType, setPaymentType] = useState('')
  const [paymentAmount, setPaymentAmount] = useState<number | string>('')


  const loadBillData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await api.get(`/billing/${billId}`)
      const billData = response.data.bill

      // Check if bill is cancelled
      if (billData.status === 'cancelled') {
        alert('Cannot edit a cancelled bill')
        router.push('/billing')
        return
      }

      setBill(billData)
      setCustomerName(billData.customer_name || '')
      setCustomerPhone(billData.customer_phone || '')
      setCustomerGSTIN(billData.customer_gstin || '')
      setItems(billData.items || [])
      setDiscountPercentage(billData.discount_percentage || 0)
      setAmountReceived(billData.amount_received || 0)

      // Parse payment splits
      if (billData.payment_type) {
        try {
          const splits = typeof billData.payment_type === 'string' && billData.payment_type.startsWith('[')
            ? JSON.parse(billData.payment_type)
            : [{ PAYMENT_TYPE: billData.payment_type, AMOUNT: billData.final_amount || billData.total_amount }]

          setPaymentSplits(splits.map((s: any) => ({
            payment_type: s.PAYMENT_TYPE || s.payment_type,
            amount: parseFloat(s.AMOUNT || s.amount)
          })))
        } catch (e) {
          setPaymentSplits([{ payment_type: billData.payment_type, amount: billData.final_amount || billData.total_amount }])
        }
      }
    } catch (error: any) {
      console.error('Failed to load bill:', error)
      alert('Failed to load bill details')
      router.push('/billing')
    } finally {
      setLoading(false)
    }
  }, [billId, router])

  const loadProducts = useCallback(async () => {
    try {
      const fetchedProducts = await fetchProducts()
      setProducts(fetchedProducts)
    } catch (error) {
      console.error('Failed to load products:', error)
    }
  }, [fetchProducts])

  useEffect(() => {
    loadBillData()
    loadProducts()
  }, [loadBillData, loadProducts])

  const filteredProducts = products.filter(
    (p) =>
      p.product_name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.item_code && p.item_code.toLowerCase().includes(productSearch.toLowerCase()))
  )

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
    setTimeout(() => quantityInputRef.current?.focus(), 100)
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

  const handleAddItem = () => {
    if (!currentItem.product_id) {
      alert('Please select a product')
      return
    }

    const calculatedItem = calculateItemTotals(currentItem)
    setItems([...items, calculatedItem])

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

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
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

  const hasGSTItems = () => items.some(item => item.gst_percentage > 0)

  const getSubtotal = () => items.reduce((sum, item) => sum + (item.quantity * item.rate), 0)

  const getGSTAmount = () => items.reduce((sum, item) => sum + item.gst_amount, 0)

  const getDiscountAmount = () => (getSubtotal() * discountPercentage) / 100

  const getGrandTotal = () => {
    if (hasGSTItems()) {
      return getSubtotal() - getDiscountAmount() + getGSTAmount()
    }
    return getSubtotal() - getDiscountAmount()
  }

  const getTotalPaymentSplits = () => paymentSplits.reduce((sum, split) => sum + split.amount, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (items.length === 0) {
      alert('Please add at least one item')
      return
    }

    if (paymentSplits.length === 0) {
      alert('Please add at least one payment method')
      return
    }

    const totalSplits = getTotalPaymentSplits()
    const grandTotal = getGrandTotal()

    if (Math.abs(totalSplits - grandTotal) > 0.01) {
      alert(`Payment splits total (₹${totalSplits.toFixed(2)}) must equal bill total (₹${grandTotal.toFixed(2)})`)
      return
    }

    if (!confirm('Are you sure you want to update this bill?')) {
      return
    }

    try {
      setSaving(true)

      const paymentData = JSON.stringify(paymentSplits.map(split => ({
        PAYMENT_TYPE: split.payment_type,
        AMOUNT: split.amount
      })))

      const response = await api.put(`/billing/${billId}`, {
        customer_name: customerName || 'Walk-in Customer',
        customer_phone: customerPhone || '',
        customer_gstin: customerGSTIN || '',
        items: items,
        payment_type: paymentData,
        amount_received: amountReceived,
        discount_percentage: discountPercentage,
        subtotal: getSubtotal(),
        gst_percentage: hasGSTItems() ? items[0]?.gst_percentage || 0 : 0,
        total_amount: getGrandTotal(),
      })

      alert('Bill updated successfully!')

      // Fetch updated bill and print directly
      const billDetailsResponse = await api.get(`/billing/${billId}`)
      const billData = billDetailsResponse.data.bill

      // Directly print the bill
      const printResponse = await api.post('/billing/print', {
        bill: {
          bill_number: billData.bill_number,
          customer_name: billData.customer_name,
          customer_phone: billData.customer_phone,
          items: billData.items,
          subtotal: billData.subtotal,
          discount_percentage: billData.discount_percentage,
          discount_amount: billData.discount_amount,
          gst_amount: billData.gst_amount,
          final_amount: billData.final_amount,
          total_amount: billData.total_amount,
          payment_type: billData.payment_type,
          created_at: billData.created_at,
          type: billData.type,
          cgst: billData.cgst,
          sgst: billData.sgst,
          igst: billData.igst
        },
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
        router.push('/billing')
      } else {
        throw new Error(printResponse.data.error || 'Print failed')
      }
    } catch (error: any) {
      console.error('Failed to update bill:', error)
      alert(error.response?.data?.error || 'Failed to update bill')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    if (confirm('Are you sure you want to cancel? All changes will be lost.')) {
      router.push('/billing')
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
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
            <p className="text-red-600">Bill not found</p>
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
      <div className="p-4 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Edit Bill #{bill.bill_number}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Bill ID: {bill.bill_id}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column - Customer & Items */}
          <div className="lg:col-span-2 space-y-4">
            {/* Customer Details */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Customer Details</h2>
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="Phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="GSTIN"
                  value={customerGSTIN}
                  onChange={(e) => setCustomerGSTIN(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Add Product */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Add Product</h2>
              <div className="space-y-3">
                {/* Product Search */}
                <div className="relative">
                  <input
                    ref={productSearchRef}
                    type="text"
                    placeholder="Search product..."
                    value={currentItem.product_id ? currentItem.product_name : productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value)
                      setShowProductDropdown(true)
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  {showProductDropdown && productSearch && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {filteredProducts.length > 0 ? (
                        filteredProducts.map((product, index) => (
                          <div
                            key={product.product_id}
                            onClick={() => handleProductSelect(product)}
                            className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            {product.product_name} - {product.item_code}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-gray-500">No products found</div>
                      )}
                    </div>
                  )}
                </div>

                {currentItem.product_id && (
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      ref={quantityInputRef}
                      type="number"
                      placeholder="Qty"
                      value={currentItem.quantity}
                      onChange={(e) => setCurrentItem({ ...currentItem, quantity: Number(e.target.value) })}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <input
                      type="number"
                      placeholder="Rate"
                      value={currentItem.rate}
                      onChange={(e) => setCurrentItem({ ...currentItem, rate: Number(e.target.value) })}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <input
                      type="number"
                      placeholder="GST %"
                      value={currentItem.gst_percentage}
                      onChange={(e) => setCurrentItem({ ...currentItem, gst_percentage: Number(e.target.value) })}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      onClick={handleAddItem}
                      className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Items List */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                Items ({items.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 text-sm font-semibold text-gray-900 dark:text-white">Product</th>
                      <th className="text-right py-2 text-sm font-semibold text-gray-900 dark:text-white">Qty</th>
                      <th className="text-right py-2 text-sm font-semibold text-gray-900 dark:text-white">Rate</th>
                      <th className="text-right py-2 text-sm font-semibold text-gray-900 dark:text-white">GST%</th>
                      <th className="text-right py-2 text-sm font-semibold text-gray-900 dark:text-white">Amount</th>
                      <th className="text-center py-2 text-sm font-semibold text-gray-900 dark:text-white">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index} className="border-b border-gray-100 dark:border-gray-700">
                        <td className="py-2 text-sm text-gray-900 dark:text-white">{item.product_name}</td>
                        <td className="py-2 text-sm text-right text-gray-900 dark:text-white">{item.quantity}</td>
                        <td className="py-2 text-sm text-right text-gray-900 dark:text-white">₹{item.rate.toFixed(2)}</td>
                        <td className="py-2 text-sm text-right text-gray-900 dark:text-white">{item.gst_percentage}%</td>
                        <td className="py-2 text-sm text-right font-semibold text-gray-900 dark:text-white">₹{item.amount.toFixed(2)}</td>
                        <td className="py-2 text-center">
                          <button
                            onClick={() => handleRemoveItem(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column - Payment & Summary */}
          <div className="space-y-4">
            {/* Payment Splits */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Payment Methods</h2>
              <div className="space-y-2 mb-3">
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select Payment Type</option>
                  {paymentTypes.map(pt => (
                    <option key={pt} value={pt}>{pt}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Amount"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <button
                  onClick={handleAddPaymentSplit}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                >
                  Add Payment
                </button>
              </div>

              <div className="space-y-2">
                {paymentSplits.map((split, index) => (
                  <div key={index} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 rounded">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{split.payment_type}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">₹{split.amount.toFixed(2)}</span>
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
            </div>

            {/* Bill Summary */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Bill Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-900 dark:text-white">
                  <span>Subtotal:</span>
                  <span>₹{getSubtotal().toFixed(2)}</span>
                </div>
                {hasGSTItems() && (
                  <div className="flex justify-between text-gray-900 dark:text-white">
                    <span>GST:</span>
                    <span>₹{getGSTAmount().toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-gray-900 dark:text-white">
                  <span>Discount:</span>
                  <input
                    type="number"
                    value={discountPercentage}
                    onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                    className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-right"
                    placeholder="%"
                  />
                </div>
                {discountPercentage > 0 && (
                  <div className="flex justify-between text-gray-900 dark:text-white">
                    <span>Discount Amount:</span>
                    <span>-₹{getDiscountAmount().toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2 text-gray-900 dark:text-white">
                  <span>Grand Total:</span>
                  <span>₹{getGrandTotal().toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-blue-600 dark:text-blue-400 font-semibold">
                  <span>Payments Total:</span>
                  <span>₹{getTotalPaymentSplits().toFixed(2)}</span>
                </div>
                {Math.abs(getTotalPaymentSplits() - getGrandTotal()) > 0.01 && (
                  <div className="flex justify-between text-red-600 font-semibold">
                    <span>Balance:</span>
                    <span>₹{(getGrandTotal() - getTotalPaymentSplits()).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </DashboardLayout>
  )
}
