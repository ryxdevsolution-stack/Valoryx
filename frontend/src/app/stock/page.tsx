'use client'

import { useEffect, useState, useRef } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { TableSkeleton } from '@/components/SkeletonLoader'
import { useData } from '@/contexts/DataContext'
import BulkStockOrderModal from '@/components/BulkStockOrderModal'
import BulkStockOrderList from '@/components/BulkStockOrderList'
import ReceiveStockModal from '@/components/ReceiveStockModal'

interface Stock {
  product_id: string
  product_name: string
  quantity: number
  rate: number | string
  cost_price?: number | string | null
  mrp?: number | string | null
  pricing?: number | string | null
  category: string
  unit: string
  low_stock_alert: number
  item_code: string
  barcode: string
  gst_percentage: number | string
  hsn_code: string
  is_low_stock: boolean
  created_at: string
  updated_at?: string
  client_id: string
}

export default function StockManagementPage() {
  const { fetchProducts } = useData()
  const [stocks, setStocks] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'reading' | 'uploading' | 'processing' | 'complete' | 'error'>('idle')
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  const [importResult, setImportResult] = useState<any>(null)
  const [importResults, setImportResults] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'low-stock' | 'in-stock'>('all')
  const [unitFilter, setUnitFilter] = useState<string>('all')

  // Bulk order states
  const [showBulkOrderModal, setShowBulkOrderModal] = useState(false)
  const [showBulkOrderList, setShowBulkOrderList] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)

  // Barcode printing state
  const [printingLabels, setPrintingLabels] = useState<string | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 2000)
  }

  const [formData, setFormData] = useState({
    product_name: '',
    quantity: '' as number | string,
    rate: '' as number | string,
    cost_price: '' as number | string,
    mrp: '' as number | string,
    pricing: '' as number | string,
    category: '',
    unit: 'pcs',
    low_stock_alert: 10,
    item_code: '',
    barcode: '',
    gst_percentage: 0,
    hsn_code: '',
  })

  // Track initialization to prevent duplicate calls in React Strict Mode
  const hasInitialized = useRef(false)

  useEffect(() => {
    // Prevent duplicate initialization in React Strict Mode
    if (hasInitialized.current) return
    hasInitialized.current = true

    fetchStocks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Use DataContext to fetch stocks (cached, prevents duplicate API calls)
  const fetchStocks = async () => {
    try {
      setLoading(true)
      const stockData = await fetchProducts()

      // Transform Product[] to Stock[] with required fields
      const transformedStocks: Stock[] = stockData.map((product: any): Stock => ({
        product_id: product.product_id || '',
        product_name: product.product_name || '',
        quantity: product.quantity || product.available_quantity || 0,
        rate: product.rate || 0,
        cost_price: product.cost_price ?? null,
        mrp: product.mrp ?? null,
        category: product.category || '',
        unit: product.unit || 'pcs',
        low_stock_alert: product.low_stock_alert || 10,
        item_code: product.item_code || '',
        barcode: product.barcode || '',
        gst_percentage: product.gst_percentage || 0,
        hsn_code: product.hsn_code || '',
        is_low_stock: product.is_low_stock ?? false,
        created_at: product.created_at || new Date().toISOString(),
        updated_at: product.updated_at,
        client_id: product.client_id || ''
      }))

      // Sort: Low stock items first, then regular stock
      const sortedStocks = transformedStocks.sort((a, b) => {
        if (a.is_low_stock && !b.is_low_stock) return -1
        if (!a.is_low_stock && b.is_low_stock) return 1
        return 0
      })

      setStocks(sortedStocks)
    } catch (error) {
      console.error('Failed to fetch stocks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (editingId) {
        // Update existing stock
        const response = await api.put(`/stock/${editingId}`, formData)
        showToast('Stock updated successfully!', 'success')
        setShowAddForm(false)
        setEditingId(null)

        // Optimistic update - update the stock in the list
        const updatedStock = response.data.product

        // Ensure is_low_stock is set
        if (!updatedStock.hasOwnProperty('is_low_stock')) {
          updatedStock.is_low_stock = updatedStock.quantity <= (updatedStock.low_stock_alert || 10)
        }

        setStocks(prev => prev.map(stock =>
          stock.product_id === editingId ? updatedStock : stock
        ))
      } else {
        // Add new stock
        const response = await api.post('/stock', formData)
        showToast('Stock added successfully!', 'success')
        setShowAddForm(false)

        // Optimistic update - add new stock to list without refetching
        const newStock = response.data.product

        // Ensure is_low_stock is set
        if (!newStock.hasOwnProperty('is_low_stock')) {
          newStock.is_low_stock = newStock.quantity <= (newStock.low_stock_alert || 10)
        }

        setStocks(prev => [newStock, ...prev])
      }

      // Reset form
      setFormData({
        product_name: '',
        quantity: '',
        rate: '',
        cost_price: '',
        mrp: '',
        pricing: '',
        category: '',
        unit: 'pcs',
        low_stock_alert: 10,
        item_code: '',
        barcode: '',
        gst_percentage: 0,
        hsn_code: '',
      })
    } catch (error: any) {
      showToast(error.response?.data?.error || `Failed to ${editingId ? 'update' : 'add'} stock`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (stock: Stock) => {
    setEditingId(stock.product_id)
    setFormData({
      product_name: stock.product_name,
      quantity: stock.quantity,
      rate: Number(stock.rate),
      cost_price: stock.cost_price ? Number(stock.cost_price) : 0,
      mrp: stock.mrp ? Number(stock.mrp) : 0,
      pricing: stock.pricing ? Number(stock.pricing) : 0,
      category: stock.category || '',
      unit: stock.unit,
      low_stock_alert: stock.low_stock_alert,
      item_code: stock.item_code || '',
      barcode: stock.barcode || '',
      gst_percentage: Number(stock.gst_percentage),
      hsn_code: stock.hsn_code || '',
    })
    setShowAddForm(true)
    setShowBulkImport(false)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setShowAddForm(false)
    setFormData({
      product_name: '',
      quantity: '',
      rate: '',
      cost_price: '',
      mrp: '',
      pricing: '',
      category: '',
      unit: 'pcs',
      low_stock_alert: 10,
      item_code: '',
      barcode: '',
      gst_percentage: 0,
      hsn_code: '',
    })
  }

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return

    try {
      await api.delete(`/stock/${productId}`)
      showToast('Product deleted successfully!', 'success')

      // Optimistic update - remove from list without refetching
      setStocks(prev => prev.filter(stock => stock.product_id !== productId))
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to delete product', 'error')
      // Revert optimistic update on error
      fetchStocks()
    }
  }

  const isLowStock = (stock: Stock) => {
    // Fallback calculation if is_low_stock is undefined
    return stock.is_low_stock ?? (stock.quantity <= stock.low_stock_alert)
  }

  // Get unique categories and units for filters
  const uniqueCategories = Array.from(new Set(stocks.map(s => s.category).filter(Boolean)))
  const uniqueUnits = Array.from(new Set(stocks.map(s => s.unit).filter(Boolean)))

  // Filter stocks based on search and filters
  const filteredStocks = stocks.filter((stock) => {
    // Search filter (product name, item code, barcode)
    const searchLower = searchQuery.toLowerCase().trim()
    const matchesSearch = searchLower === '' ||
      stock.product_name.toLowerCase().includes(searchLower) ||
      stock.item_code?.toLowerCase().includes(searchLower) ||
      stock.barcode?.toLowerCase().includes(searchLower)

    // Category filter
    const matchesCategory = categoryFilter === 'all' || stock.category === categoryFilter

    // Status filter
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'low-stock' && isLowStock(stock)) ||
      (statusFilter === 'in-stock' && !isLowStock(stock))

    // Unit filter
    const matchesUnit = unitFilter === 'all' || stock.unit === unitFilter

    return matchesSearch && matchesCategory && matchesStatus && matchesUnit
  })

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    setUploadFiles(fileArray)
    setImportResults([])
    setImportResult(null)

    const results: any[] = []

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i]
      setCurrentFileIndex(i)
      setUploadStatus('reading')
      setUploadProgress(10)

      const formData = new FormData()
      formData.append('file', file)

      try {
        // Reading phase (optimized from 300ms)
        await new Promise(resolve => setTimeout(resolve, 50))
        setUploadStatus('uploading')
        setUploadProgress(30)

        const response = await api.post('/stock/bulk-import', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = progressEvent.total
              ? Math.round((progressEvent.loaded * 40) / progressEvent.total) + 30
              : 50
            setUploadProgress(Math.min(percentCompleted, 70))
          },
        })

        setUploadStatus('processing')
        setUploadProgress(85)
        await new Promise(resolve => setTimeout(resolve, 100))

        setUploadProgress(100)
        setUploadStatus('complete')

        results.push({
          fileName: file.name,
          success: true,
          summary: response.data.summary,
          message: response.data.message
        })

        if (i === fileArray.length - 1) {
          showToast(`Successfully imported ${fileArray.length} file(s)!`, 'success')
        }
      } catch (error: any) {
        setUploadStatus('error')
        results.push({
          fileName: file.name,
          success: false,
          error: error.response?.data?.error || 'Failed to import file'
        })
        showToast(`Error importing ${file.name}: ${error.response?.data?.error || 'Failed'}`, 'error')
      }

      // Small delay between files (optimized from 500ms)
      if (i < fileArray.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    setImportResults(results)

    // Calculate combined summary
    const combinedSummary = results.reduce((acc, r) => {
      if (r.success && r.summary) {
        acc.total_rows += r.summary.total_rows || 0
        acc.created_count += r.summary.created_count || 0
        acc.updated_count += r.summary.updated_count || 0
        acc.error_count += r.summary.error_count || 0
        if (r.summary.errors) acc.errors.push(...r.summary.errors)
      }
      return acc
    }, { total_rows: 0, created_count: 0, updated_count: 0, error_count: 0, errors: [] as string[] })

    setImportResult(combinedSummary)

    // Reset after delay
    setTimeout(() => {
      setUploadStatus('idle')
      setUploadProgress(0)
      setUploadFiles([])
      setCurrentFileIndex(0)
    }, 2000)

    fetchStocks()
    event.target.value = ''
  }

  const downloadTemplate = async (format: 'csv' | 'xlsx') => {
    try {
      const response = await api.post('/stock/download-template',
        { format },
        { responseType: 'blob' }
      )

      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stock_import_template.${format === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      console.error('Download error:', error)
      showToast(error.response?.data?.error || 'Failed to download template', 'error')
    }
  }

  const exportStock = async (format: 'csv' | 'xlsx') => {
    try {
      const response = await api.post('/stock/bulk-export',
        { format },
        { responseType: 'blob' }
      )

      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stock_export.${format === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      console.error('Export error:', error)
      showToast(error.response?.data?.error || 'Failed to export stock', 'error')
    }
  }

  const handleReceiveOrder = (order: any) => {
    setSelectedOrder(order)
    setShowBulkOrderList(false)
    setShowReceiveModal(true)
  }

  const handleOrderSuccess = () => {
    showToast('Order saved successfully!', 'success')
    fetchStocks()
  }

  const handleReceiveSuccess = () => {
    showToast('Items received and added to stock!', 'success')
    setShowReceiveModal(false)
    setSelectedOrder(null)
    fetchStocks()
  }

  const handlePrintBarcode = async (stock: Stock) => {
    if (printingLabels) return // Prevent multiple prints

    setPrintingLabels(stock.product_id)
    try {
      let itemCode = stock.item_code

      // If no item_code, update the product to generate one
      if (!itemCode) {
        showToast('Generating item code...', 'success')
        const updateResponse = await api.put(`/stock/${stock.product_id}`, {
          product_name: stock.product_name,
          quantity: stock.quantity,
          rate: stock.rate,
          // Don't send item_code - backend will auto-generate
        })
        itemCode = updateResponse.data.product?.item_code
        if (!itemCode) {
          throw new Error('Failed to generate item code')
        }
        // Refresh stock list to get updated item_code
        fetchStocks()
      }

      const response = await api.post('/billing/print-labels', {
        items: [{
          item_code: itemCode,
          product_name: stock.product_name,
          rate: Number(stock.rate),
          mrp: stock.mrp ? Number(stock.mrp) : Number(stock.rate),
          quantity: stock.quantity // Print labels based on stock quantity
        }]
      })

      if (response.data.success) {
        showToast(`${response.data.total_labels} barcode labels printed!`, 'success')
      } else {
        throw new Error(response.data.error || 'Failed to print labels')
      }
    } catch (error: any) {
      console.error('Failed to print barcode labels:', error)
      showToast(error.response?.data?.error || error.message || 'Failed to print barcode labels', 'error')
    } finally {
      setPrintingLabels(null)
    }
  }

  const lowStockCount = stocks.filter(isLowStock).length

  return (
    <DashboardLayout>
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-lg shadow-2xl border ${
            toast.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/90 border-green-500 text-green-800 dark:text-green-100'
              : 'bg-red-50 dark:bg-red-900/90 border-red-500 text-red-800 dark:text-red-100'
          }`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
            }`}>
              <span className="text-white text-xl">
                {toast.type === 'success' ? '✓' : '✕'}
              </span>
            </div>
            <div>
              <p className="font-semibold text-lg">{toast.type === 'success' ? 'Success' : 'Error'}</p>
              <p className="text-sm opacity-90">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast({ show: false, message: '', type: 'success' })}
              className="ml-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Blinking Low Stock Alert at Top */}
      {lowStockCount > 0 && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-500 rounded-lg p-4 animate-pulse shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center animate-bounce">
                <span className="text-2xl text-white">⚠️</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-red-800 dark:text-red-200">
                  Low Stock Alert!
                </h3>
                <p className="text-red-700 dark:text-red-300 font-medium">
                  {lowStockCount} product(s) running low on stock
                </p>
              </div>
            </div>
            <div className="text-4xl font-bold text-red-600 dark:text-red-400 animate-pulse">
              {lowStockCount}
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Stock Management</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Manage your inventory and track stock levels</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowBulkOrderList(true)}
            className="px-6 py-3 bg-purple-600 dark:bg-purple-700 text-white rounded-lg hover:bg-purple-800 dark:hover:bg-purple-600 transition font-medium"
          >
            📦 View Orders
          </button>
          <button
            onClick={() => setShowBulkOrderModal(true)}
            className="px-6 py-3 bg-orange-600 dark:bg-orange-700 text-white rounded-lg hover:bg-orange-800 dark:hover:bg-orange-600 transition font-medium"
          >
            📋 Bulk Order
          </button>
          <button
            onClick={() => setShowBulkImport(!showBulkImport)}
            className="px-6 py-3 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-800 dark:hover:bg-green-600 transition font-medium"
          >
            📥 Bulk Import
          </button>
          <button
            onClick={() => {
              if (showAddForm) {
                handleCancelEdit()
              } else {
                setShowAddForm(true)
                setShowBulkImport(false)
              }
            }}
            className="px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-800 dark:hover:bg-blue-600 transition font-medium"
          >
            {showAddForm ? 'Cancel' : '+ Add Stock'}
          </button>
        </div>
      </div>

      {/* Add/Edit Stock Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {editingId ? 'Edit Stock' : 'Add New Stock'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Barcode *
                </label>
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) =>
                    setFormData({ ...formData, barcode: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                    }
                  }}
                  placeholder="Scan or enter barcode"
                  autoFocus
                  className="w-full px-4 py-2 border border-cyan-500 dark:border-cyan-400 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent font-mono text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.product_name}
                  onChange={(e) =>
                    setFormData({ ...formData, product_name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Quantity *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: e.target.value === '' ? '' : parseInt(e.target.value) })
                  }
                  placeholder="0"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Selling Price (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.rate}
                  onChange={(e) =>
                    setFormData({ ...formData, rate: e.target.value === '' ? '' : parseFloat(e.target.value) })
                  }
                  placeholder="0"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Cost Price (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.cost_price}
                  onChange={(e) =>
                    setFormData({ ...formData, cost_price: e.target.value === '' ? '' : parseFloat(e.target.value) })
                  }
                  placeholder="0"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">For profit calculation</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  MRP (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.mrp}
                  onChange={(e) =>
                    setFormData({ ...formData, mrp: e.target.value === '' ? '' : parseFloat(e.target.value) })
                  }
                  placeholder="0"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Shown on print, not in billing</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Pricing (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.pricing}
                  onChange={(e) =>
                    setFormData({ ...formData, pricing: e.target.value === '' ? '' : parseFloat(e.target.value) })
                  }
                  placeholder="0"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Pricing from stock updation</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Category
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Unit
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) =>
                    setFormData({ ...formData, unit: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="pcs">Pieces</option>
                  <option value="kg">Kilograms</option>
                  <option value="ltr">Liters</option>
                  <option value="box">Box</option>
                  <option value="dozen">Dozen</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Low Stock Alert
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.low_stock_alert}
                  onChange={(e) =>
                    setFormData({ ...formData, low_stock_alert: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Item Code (SKU)
                </label>
                <input
                  type="text"
                  value={formData.item_code}
                  onChange={(e) =>
                    setFormData({ ...formData, item_code: e.target.value })
                  }
                  placeholder="Auto-generated if left blank"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave blank to auto-generate based on product name</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  GST Percentage
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.gst_percentage}
                  onChange={(e) =>
                    setFormData({ ...formData, gst_percentage: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Common: 0%, 5%, 12%, 18%, 28%</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  HSN/SAC Code
                </label>
                <input
                  type="text"
                  value={formData.hsn_code}
                  onChange={(e) =>
                    setFormData({ ...formData, hsn_code: e.target.value })
                  }
                  placeholder="e.g., 8471"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={submitting}
                className={`px-6 py-2 text-white rounded-lg transition flex items-center gap-2 ${
                  submitting
                    ? 'bg-green-400 dark:bg-green-600 cursor-not-allowed'
                    : 'bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-600'
                }`}
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {editingId ? 'Updating...' : 'Adding...'}
                  </>
                ) : (
                  editingId ? 'Update Stock' : 'Add Stock'
                )}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={submitting}
                className="px-6 py-2 bg-gray-600 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Import Section */}
      {showBulkImport && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Bulk Import Stock</h2>

          {/* Download Templates */}
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-3">📄 Step 1: Download Template</h3>
            <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">
              Download a template file with the correct format
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => downloadTemplate('csv')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-800 dark:hover:bg-blue-600 transition text-sm"
              >
                Download CSV Template
              </button>
              <button
                onClick={() => downloadTemplate('xlsx')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-800 dark:hover:bg-blue-600 transition text-sm"
              >
                Download Excel Template
              </button>
            </div>
          </div>

          {/* Upload File */}
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
            <h3 className="font-semibold text-green-900 dark:text-green-300 mb-3">📤 Step 2: Upload Filled File(s)</h3>
            <p className="text-sm text-green-700 dark:text-green-400 mb-3">
              Fill the template with your data and upload (CSV, XLSX, or XLS) - Multiple files supported!
            </p>

            {uploadStatus === 'idle' ? (
              <div className="relative">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  multiple
                  className="block w-full text-sm text-gray-900 dark:text-gray-300 border-2 border-dashed border-green-400 dark:border-green-600 rounded-lg cursor-pointer bg-white dark:bg-gray-700 focus:outline-none file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700 p-4 hover:border-green-500 transition-all"
                />
                <p className="text-xs text-green-600 dark:text-green-400 mt-2 text-center">
                  Drag & drop or click to select files (supports multiple files)
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Progress Container */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-green-200 dark:border-green-700">
                  {/* File Info */}
                  {uploadFiles.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {uploadFiles.length > 1
                            ? `File ${currentFileIndex + 1} of ${uploadFiles.length}`
                            : 'Uploading file'
                          }
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {uploadFiles[currentFileIndex]?.name}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Animated Progress Bar */}
                  <div className="relative h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
                    <div
                      className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ease-out ${
                        uploadStatus === 'error'
                          ? 'bg-red-500'
                          : uploadStatus === 'complete'
                            ? 'bg-green-500'
                            : 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500'
                      }`}
                      style={{ width: `${uploadProgress}%` }}
                    >
                      {uploadStatus !== 'error' && uploadStatus !== 'complete' && (
                        <div className="absolute inset-0 bg-white/30 animate-pulse"></div>
                      )}
                    </div>
                    {/* Shimmer effect */}
                    {uploadStatus !== 'error' && uploadStatus !== 'complete' && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
                    )}
                  </div>

                  {/* Progress Percentage */}
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-2xl font-bold ${
                      uploadStatus === 'error' ? 'text-red-500' :
                      uploadStatus === 'complete' ? 'text-green-500' :
                      'text-blue-600 dark:text-blue-400'
                    }`}>
                      {uploadProgress}%
                    </span>
                  </div>

                  {/* Status Steps */}
                  <div className="flex items-center justify-between">
                    {[
                      { key: 'reading', label: 'Reading', icon: '📖' },
                      { key: 'uploading', label: 'Uploading', icon: '📤' },
                      { key: 'processing', label: 'Processing', icon: '⚙️' },
                      { key: 'complete', label: 'Complete', icon: '✅' }
                    ].map((step, idx) => {
                      const steps = ['reading', 'uploading', 'processing', 'complete']
                      const currentIdx = steps.indexOf(uploadStatus)
                      const stepIdx = steps.indexOf(step.key)
                      const isActive = step.key === uploadStatus
                      const isCompleted = stepIdx < currentIdx || uploadStatus === 'complete'
                      const isError = uploadStatus === 'error'

                      return (
                        <div key={step.key} className="flex flex-col items-center">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${
                            isError ? 'bg-red-100 dark:bg-red-900/50 text-red-500' :
                            isCompleted ? 'bg-green-100 dark:bg-green-900/50 text-green-600 scale-110' :
                            isActive ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 animate-bounce' :
                            'bg-gray-100 dark:bg-gray-700 text-gray-400'
                          }`}>
                            {isError && stepIdx >= currentIdx ? '❌' : isCompleted ? '✓' : step.icon}
                          </div>
                          <span className={`text-xs mt-1 font-medium ${
                            isError ? 'text-red-500' :
                            isCompleted ? 'text-green-600 dark:text-green-400' :
                            isActive ? 'text-blue-600 dark:text-blue-400' :
                            'text-gray-400'
                          }`}>
                            {step.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Status Message */}
                  <div className="mt-4 text-center">
                    <p className={`text-sm font-medium ${
                      uploadStatus === 'error' ? 'text-red-600 dark:text-red-400' :
                      uploadStatus === 'complete' ? 'text-green-600 dark:text-green-400' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {uploadStatus === 'reading' && '📖 Reading file contents...'}
                      {uploadStatus === 'uploading' && '📤 Uploading to server...'}
                      {uploadStatus === 'processing' && '⚙️ Processing stock data...'}
                      {uploadStatus === 'complete' && '✅ Import completed successfully!'}
                      {uploadStatus === 'error' && '❌ An error occurred during import'}
                    </p>
                  </div>
                </div>

                {/* Multi-file progress */}
                {uploadFiles.length > 1 && (
                  <div className="flex gap-2 justify-center flex-wrap">
                    {uploadFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                          idx < currentFileIndex
                            ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                            : idx === currentFileIndex
                              ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 animate-pulse'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                        }`}
                      >
                        {idx < currentFileIndex ? '✓' : idx === currentFileIndex ? '⏳' : '○'} {file.name.slice(0, 15)}{file.name.length > 15 ? '...' : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Import Result */}
          {importResult && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">📊 Import Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{importResult.total_rows}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Rows</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{importResult.created_count}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Created</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{importResult.updated_count}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Updated</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importResult.error_count}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Errors</p>
                </div>
              </div>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="mt-3">
                  <p className="font-semibold text-red-800 dark:text-red-300 mb-2">Errors:</p>
                  <ul className="text-sm text-red-700 dark:text-red-400 space-y-1">
                    {importResult.errors.map((error: string, index: number) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Export Options */}
          <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg">
            <h3 className="font-semibold text-purple-900 dark:text-purple-300 mb-3">📥 Export Current Stock</h3>
            <p className="text-sm text-purple-700 dark:text-purple-400 mb-3">
              Download all current stock data
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => exportStock('csv')}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm"
              >
                Export as CSV
              </button>
              <button
                onClick={() => exportStock('xlsx')}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm"
              >
                Export as Excel
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-2">ℹ️ Important Notes</h3>
            <ul className="text-sm text-yellow-800 dark:text-yellow-400 space-y-1">
              <li>• Required columns: <strong>product_name, quantity, rate</strong></li>
              <li>• Optional columns: category, unit, low_stock_alert, item_code, barcode, gst_percentage, hsn_code, pricing</li>
              <li>• If product exists, quantity will be <strong>added</strong> (not replaced)</li>
              <li>• Negative values are not allowed</li>
              <li>• Maximum file size: 5MB</li>
            </ul>
          </div>
        </div>
      )}

      {/* Search and Filter Bar */}
      {!loading && stocks.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by product name, item code, or barcode..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition min-w-[140px]"
              >
                <option value="all">All Categories</option>
                {uniqueCategories.sort().map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'low-stock' | 'in-stock')}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition min-w-[140px]"
              >
                <option value="all">All Status</option>
                <option value="low-stock">🚨 Low Stock</option>
                <option value="in-stock">✓ In Stock</option>
              </select>

              {/* Unit Filter */}
              <select
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition min-w-[120px]"
              >
                <option value="all">All Units</option>
                {uniqueUnits.sort().map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>

              {/* Clear Filters Button */}
              {(searchQuery || categoryFilter !== 'all' || statusFilter !== 'all' || unitFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setCategoryFilter('all')
                    setStatusFilter('all')
                    setUnitFilter('all')
                  }}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Results Count */}
          <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            Showing <span className="font-semibold text-gray-900 dark:text-white">{filteredStocks.length}</span> of {stocks.length} products
          </div>
        </div>
      )}

      {/* Stock Table */}
      {loading ? (
        <TableSkeleton rows={10} />
      ) : stocks.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-lg">No stock items found</p>
          <p className="text-gray-400 dark:text-gray-500 mt-2">Add your first stock item to get started</p>
        </div>
      ) : filteredStocks.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 p-12 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg font-semibold">No products match your filters</p>
          <p className="text-gray-400 dark:text-gray-500 mt-2">Try adjusting your search or filters</p>
          <button
            onClick={() => {
              setSearchQuery('')
              setCategoryFilter('all')
              setStatusFilter('all')
              setUnitFilter('all')
            }}
            className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Product Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Unit
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredStocks.map((stock) => (
                <tr
                  key={stock.product_id}
                  className={`transition ${
                    isLowStock(stock)
                      ? 'low-stock-row border-l-4 border-red-500 dark:border-red-600 hover:bg-red-100 dark:hover:bg-red-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      {isLowStock(stock) && (
                        <span className="text-red-500 dark:text-red-400 animate-bounce text-xl">⚠️</span>
                      )}
                      <span className={`font-medium ${
                        isLowStock(stock) ? 'text-red-900 dark:text-red-300 font-bold' : 'text-gray-900 dark:text-white'
                      }`}>
                        {stock.product_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {stock.category || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`font-bold text-xl ${
                        isLowStock(stock) ? 'text-red-600 dark:text-red-400 low-stock-quantity' : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {stock.quantity}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {stock.unit}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    ₹{Number(stock.rate).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {isLowStock(stock) ? (
                      <span className="low-stock-badge px-3 py-1.5 rounded-full text-xs font-bold bg-red-500 dark:bg-red-600 text-white shadow-lg">
                        🚨 LOW STOCK
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-700">
                        ✓ In Stock
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-3">
                      <button
                        onClick={() => handlePrintBarcode(stock)}
                        disabled={printingLabels === stock.product_id}
                        className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-medium disabled:opacity-50 disabled:cursor-wait flex items-center gap-1"
                        title={`Print ${stock.quantity} barcode labels`}
                      >
                        {printingLabels === stock.product_id ? (
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                          </svg>
                        )}
                        Barcode
                      </button>
                      <button
                        onClick={() => handleEdit(stock)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(stock.product_id)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Stock Order Modals */}
      <BulkStockOrderModal
        isOpen={showBulkOrderModal}
        onClose={() => setShowBulkOrderModal(false)}
        onSuccess={handleOrderSuccess}
      />

      <BulkStockOrderList
        isOpen={showBulkOrderList}
        onClose={() => setShowBulkOrderList(false)}
        onReceive={handleReceiveOrder}
      />

      <ReceiveStockModal
        isOpen={showReceiveModal}
        onClose={() => {
          setShowReceiveModal(false)
          setSelectedOrder(null)
        }}
        order={selectedOrder}
        onSuccess={handleReceiveSuccess}
      />
    </DashboardLayout>
  )
}
