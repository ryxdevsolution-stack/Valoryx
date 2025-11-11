'use client'

import { useEffect, useState, useRef } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { TableSkeleton } from '@/components/SkeletonLoader'
import { useData } from '@/contexts/DataContext'

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
  const [uploadProgress, setUploadProgress] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [formData, setFormData] = useState({
    product_name: '',
    quantity: 0,
    rate: 0,
    cost_price: 0,
    mrp: 0,
    pricing: 0,
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
    try {
      const response = await api.post('/stock', formData)
      alert('Stock added successfully!')
      setShowAddForm(false)

      // Optimistic update - add new stock to list without refetching
      const newStock = response.data.product

      // Ensure is_low_stock is set
      if (!newStock.hasOwnProperty('is_low_stock')) {
        newStock.is_low_stock = newStock.quantity <= (newStock.low_stock_alert || 10)
      }

      setStocks(prev => [newStock, ...prev])

      setFormData({
        product_name: '',
        quantity: 0,
        rate: 0,
        cost_price: 0,
        mrp: 0,
        pricing: 0,
        category: '',
        unit: 'pcs',
        low_stock_alert: 10,
        item_code: '',
        barcode: '',
        gst_percentage: 0,
        hsn_code: '',
      })
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to add stock')
    }
  }

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return

    try {
      await api.delete(`/stock/${productId}`)
      alert('Product deleted successfully!')

      // Optimistic update - remove from list without refetching
      setStocks(prev => prev.filter(stock => stock.product_id !== productId))
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete product')
      // Revert optimistic update on error
      fetchStocks()
    }
  }

  const isLowStock = (stock: Stock) => {
    // Fallback calculation if is_low_stock is undefined
    return stock.is_low_stock ?? (stock.quantity <= stock.low_stock_alert)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      setUploadProgress(true)
      setImportResult(null)

      const response = await api.post('/stock/bulk-import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      setImportResult(response.data.summary)
      alert(response.data.message)
      // Only refetch for bulk import since we don't have all new items in response
      fetchStocks()
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to import file')
    } finally {
      setUploadProgress(false)
      event.target.value = ''
    }
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
      alert(error.response?.data?.error || 'Failed to download template')
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
      alert(error.response?.data?.error || 'Failed to export stock')
    }
  }

  const lowStockCount = stocks.filter(isLowStock).length

  return (
    <DashboardLayout>
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
            onClick={() => setShowBulkImport(!showBulkImport)}
            className="px-6 py-3 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-800 dark:hover:bg-green-600 transition font-medium"
          >
            📥 Bulk Import
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-800 dark:hover:bg-blue-600 transition font-medium"
          >
            {showAddForm ? 'Cancel' : '+ Add Stock'}
          </button>
        </div>
      </div>

      {/* Add Stock Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Add New Stock</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })
                  }
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
                    setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })
                  }
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
                    setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="Purchase/manufacturing cost"
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
                    setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="Maximum Retail Price"
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
                    setFormData({ ...formData, pricing: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="Stock pricing"
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
                  Barcode
                </label>
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) =>
                    setFormData({ ...formData, barcode: e.target.value })
                  }
                  placeholder="e.g., 8901234567890"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  GST Percentage
                </label>
                <select
                  value={formData.gst_percentage}
                  onChange={(e) =>
                    setFormData({ ...formData, gst_percentage: parseFloat(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={0}>0% (Non-GST)</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18%</option>
                  <option value={28}>28%</option>
                </select>
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
                className="px-6 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition"
              >
                Add Stock
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-6 py-2 bg-gray-600 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition"
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
            <h3 className="font-semibold text-green-900 dark:text-green-300 mb-3">📤 Step 2: Upload Filled File</h3>
            <p className="text-sm text-green-700 dark:text-green-400 mb-3">
              Fill the template with your data and upload (CSV, XLSX, or XLS)
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={uploadProgress}
              className="block w-full text-sm text-gray-900 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer bg-white dark:bg-gray-700 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700"
            />
            {uploadProgress && (
              <p className="mt-2 text-sm text-green-600 dark:text-green-400">Uploading and processing file...</p>
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
              <li>• Optional columns: category, unit, low_stock_alert</li>
              <li>• If product exists, quantity will be <strong>added</strong> (not replaced)</li>
              <li>• Negative values are not allowed</li>
              <li>• Maximum file size: 5MB</li>
            </ul>
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
              {stocks.map((stock) => (
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
                    <button
                      onClick={() => handleDelete(stock.product_id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  )
}
