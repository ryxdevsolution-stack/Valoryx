

import { useState, useEffect, useRef, useCallback } from 'react'
import api from '@/lib/api'
import { X, Upload, Plus, Trash2, FileSpreadsheet, Package, ChevronDown, ChevronUp, Camera, Loader2 } from 'lucide-react'
import Tesseract from 'tesseract.js'
import BarcodeScannerOverlay from '@/components/BarcodeScannerOverlay'
import { useMobileDetect } from '@/hooks/useMobileDetect'
import { toast } from '@/utils/toast'
import { getAddedByLabel, setAddedByLabel } from '@/utils/addedByLabel'

interface OrderItem {
  item_id?: string
  product_id?: string
  product_name: string
  category: string
  quantity_ordered: number
  quantity_received?: number
  unit: string
  cost_price: number | string
  selling_price: number | string
  mrp?: number | string
  purchase_discount_percentage?: number | string
  selling_discount_percentage?: number | string
  barcode?: string
  item_code?: string
  gst_percentage?: number
  hsn_code?: string
  notes?: string
}

interface BulkOrder {
  order_id?: string
  order_number?: string
  supplier_name: string
  supplier_contact: string
  expected_delivery_date: string
  status?: string
  notes: string
  items: OrderItem[]
  order_date?: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingOrder?: BulkOrder | null
  onReceive?: (order: BulkOrder) => void
}

export default function BulkStockOrderModal({ isOpen, onClose, onSuccess, existingOrder, onReceive }: Props) {
  const [activeTab, setActiveTab] = useState<'create' | 'orders'>('create')
  const [submitting, setSubmitting] = useState(false)
  const [addedByLabel, setAddedByLabelState] = useState<string>(() => getAddedByLabel())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState<BulkOrder>({
    supplier_name: '',
    supplier_contact: '',
    expected_delivery_date: '',
    notes: '',
    items: []
  })

  const imageInputRef = useRef<HTMLInputElement>(null)
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [showCameraCapture, setShowCameraCapture] = useState(false)
  const cameraVideoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  // Barcode scanner state (mobile-only, per item row)
  const [showItemScanner, setShowItemScanner] = useState(false)
  const [scanningItemIdx, setScanningItemIdx] = useState<number | null>(null)
  const { isMobile, supportsCamera } = useMobileDetect()

  // Orders list state
  const [orders, setOrders] = useState<BulkOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [orderFilter, setOrderFilter] = useState('all')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  useEffect(() => {
    if (existingOrder) {
      setFormData(existingOrder)
      setActiveTab('create')
    } else {
      setFormData({
        supplier_name: '',
        supplier_contact: '',
        expected_delivery_date: '',
        notes: '',
        items: []
      })
    }
  }, [existingOrder, isOpen])

  const fetchOrders = useCallback(async () => {
    try {
      setLoadingOrders(true)
      const params = orderFilter !== 'all' ? { status: orderFilter } : {}
      const response = await api.get('/bulk-orders', { params })
      setOrders(response.data.orders || [])
    } catch (error) {
      console.error('Failed to fetch orders:', error)
    } finally {
      setLoadingOrders(false)
    }
  }, [orderFilter])

  useEffect(() => {
    if (isOpen && activeTab === 'orders') {
      fetchOrders()
    }
  }, [isOpen, activeTab, fetchOrders])

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_name: '',
          category: '',
          quantity_ordered: 1,
          unit: 'pcs',
          cost_price: '',
          selling_price: '',
          mrp: '',
          purchase_discount_percentage: '',
          selling_discount_percentage: '',
          gst_percentage: 0,
        }
      ]
    }))
  }

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }))
  }

  const updateItem = (index: number, field: keyof OrderItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  // CSV Import handler
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return

      const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
      if (lines.length < 2) {
        toast.error('CSV file must have at least a header row and one data row')
        return
      }

      // Parse header to find column indices
      const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''))
      const nameIdx = header.findIndex(h => h.includes('name') || h.includes('product') || h.includes('item') || h.includes('description'))
      const qtyIdx = header.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('count'))
      const priceIdx = header.findIndex(h => h.includes('price') || h.includes('cost') || h.includes('rate') || h.includes('amount'))

      if (nameIdx === -1) {
        toast.error('CSV must have a column with "name", "product", or "item" in the header')
        return
      }

      const newItems: OrderItem[] = []
      for (let i = 1; i < lines.length; i++) {
        // Handle quoted CSV fields
        const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(c => c.replace(/"/g, '').trim()) || lines[i].split(',').map(c => c.trim())

        const name = cols[nameIdx]?.trim()
        if (!name) continue

        const qty = qtyIdx !== -1 ? (parseInt(cols[qtyIdx]) || 1) : 1
        const price = priceIdx !== -1 ? (parseFloat(cols[priceIdx]) || 0) : 0

        newItems.push({
          product_name: name,
          category: '',
          quantity_ordered: qty,
          unit: 'pcs',
          cost_price: price || '',
          selling_price: '',
          mrp: '',
          gst_percentage: 0,
        })
      }

      if (newItems.length === 0) {
        toast.error('No valid items found in the CSV file')
        return
      }

      setFormData(prev => ({
        ...prev,
        items: [...prev.items, ...newItems]
      }))

      toast.success(`${newItems.length} items imported successfully!`)
    }

    reader.readAsText(file)
    // Reset file input so same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // OCR: Extract items from bill image/PDF
  const openCameraForScan = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      cameraStreamRef.current = stream
      setShowCameraCapture(true)
      // Wait for video element to mount, then attach stream
      requestAnimationFrame(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream
          cameraVideoRef.current.play()
        }
      })
    } catch {
      // Camera not available — fall back to file picker
      imageInputRef.current?.click()
    }
  }

  const capturePhotoAndOCR = async () => {
    const video = cameraVideoRef.current
    if (!video) return

    // Draw current frame to canvas
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)

    // Stop camera
    cameraStreamRef.current?.getTracks().forEach(t => t.stop())
    cameraStreamRef.current = null
    setShowCameraCapture(false)

    // Convert to blob and run OCR
    canvas.toBlob(async (blob) => {
      if (!blob) return
      setOcrProcessing(true)
      setOcrProgress(0)
      try {
        const result = await Tesseract.recognize(blob, 'eng+hin', {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setOcrProgress(Math.round(m.progress * 100))
            }
          }
        })
        processOcrText(result.data.text)
      } catch {
        toast.error('Failed to process the captured image. Try again with better lighting.')
      } finally {
        setOcrProcessing(false)
        setOcrProgress(0)
      }
    }, 'image/jpeg', 0.9)
  }

  const closeCameraCapture = () => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop())
    cameraStreamRef.current = null
    setShowCameraCapture(false)
  }

  const processOcrText = (text: string) => {
    if (!text.trim()) {
      toast.error('Could not extract any text from the image. Try a clearer photo.')
      return
    }
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3)
    const newItems: OrderItem[] = []
    for (const line of lines) {
      const lower = line.toLowerCase()
      if (lower.includes('total') || lower.includes('subtotal') || lower.includes('grand') ||
          lower.includes('gst') || lower.includes('cgst') || lower.includes('sgst') ||
          lower.includes('invoice') || lower.includes('bill no') || lower.includes('date') ||
          lower.includes('phone') || lower.includes('address') || lower.includes('thank') ||
          lower.includes('tax') || lower.includes('discount') || lower.includes('amount') ||
          lower.includes('sr.') || lower.includes('s.no') || lower.includes('sl.') ||
          lower.includes('description') || lower.includes('particulars') || lower.includes('hsn') ||
          /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(line)) {
        continue
      }
      const numbers = line.match(/[\d,]+\.?\d*/g)?.map(n => parseFloat(n.replace(/,/g, ''))).filter(n => !isNaN(n) && n > 0) || []
      const nameMatch = line.match(/^[^\d]*[a-zA-Z\u0900-\u097F][\w\s\u0900-\u097F./-]*/)?.[0]?.trim()
      if (!nameMatch || nameMatch.length < 2) continue
      const name = nameMatch.replace(/^[\d.)\-\s]+/, '').trim()
      if (name.length < 2) continue
      let qty = 1
      let price = 0
      if (numbers.length >= 2) {
        const lastNum = numbers[numbers.length - 1]
        const secondLast = numbers[numbers.length - 2]
        if (secondLast <= 999 && secondLast === Math.floor(secondLast)) {
          qty = secondLast
          price = lastNum
        } else {
          price = lastNum
        }
      } else if (numbers.length === 1) {
        price = numbers[0]
      }
      newItems.push({
        product_name: name, category: '', quantity_ordered: qty, unit: 'pcs',
        cost_price: price || '', selling_price: '', mrp: '', gst_percentage: 0,
      })
    }
    if (newItems.length === 0) {
      toast.error('Could not identify product items from the image. Try a clearer photo or use CSV import.')
    } else {
      setFormData(prev => ({ ...prev, items: [...prev.items, ...newItems] }))
      toast.success(`${newItems.length} items extracted from bill image! Please review the names, quantities and prices.`)
    }
  }

  const handleImageImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type === 'application/pdf') {
      toast.warning('PDF support: For best results, take a photo/screenshot of the bill and upload the image instead.')
      if (imageInputRef.current) imageInputRef.current.value = ''
      return
    }

    setOcrProcessing(true)
    setOcrProgress(0)
    try {
      const result = await Tesseract.recognize(file, 'eng+hin', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100))
          }
        }
      })
      processOcrText(result.data.text)
    } catch {
      toast.error('Failed to process the image. Try a clearer photo.')
    } finally {
      setOcrProcessing(false)
      setOcrProgress(0)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.items.length === 0) {
      toast.error('Please add at least one item to the order')
      return
    }

    // Validate items have names
    const invalidItems = formData.items.filter(item => !item.product_name.trim())
    if (invalidItems.length > 0) {
      toast.error('All items must have a product name')
      return
    }

    if (!addedByLabel.trim()) {
      toast.error('Please enter your name in "Added By"')
      return
    }

    setSubmitting(true)
    try {
      if (existingOrder?.order_id) {
        await api.put(`/bulk-orders/${existingOrder.order_id}`, { ...formData, added_by_label: addedByLabel.trim() })
      } else {
        await api.post('/bulk-orders', { ...formData, added_by_label: addedByLabel.trim() })
        setAddedByLabel(addedByLabel)
      }
      onSuccess()
      // Switch to orders tab to see the created order
      setActiveTab('orders')
      fetchOrders()
      // Reset form
      setFormData({
        supplier_name: '',
        supplier_contact: '',
        expected_delivery_date: '',
        notes: '',
        items: []
      })
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save order')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('Delete this order?')) return
    try {
      await api.delete(`/bulk-orders/${orderId}`)
      fetchOrders()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete order')
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300',
      partial: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300',
      received: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300',
      cancelled: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300',
    }
    return styles[status] || styles.pending
  }

  const totalCost = formData.items.reduce((sum, item) => sum + (Number(item.cost_price) || 0) * (item.quantity_ordered || 0), 0)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-xl max-w-5xl w-full max-h-[95vh] sm:max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header with Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between px-5 pt-4 pb-0">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition ${
                  activeTab === 'create'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Plus className="w-4 h-4 inline mr-1.5" />
                {existingOrder ? 'Edit Order' : 'New Order'}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition ${
                  activeTab === 'orders'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Package className="w-4 h-4 inline mr-1.5" />
                View Orders
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'create' ? (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-5">
              {/* Supplier Info — Compact Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Supplier Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.supplier_name}
                    onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                    placeholder="Supplier name"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contact</label>
                  <input
                    type="text"
                    value={formData.supplier_contact}
                    onChange={(e) => setFormData({ ...formData, supplier_contact: e.target.value })}
                    placeholder="Phone / email"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Expected Delivery</label>
                  <input
                    type="date"
                    value={formData.expected_delivery_date}
                    onChange={(e) => setFormData({ ...formData, expected_delivery_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Optional notes"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Added By *</label>
                  <input
                    type="text"
                    required
                    value={addedByLabel}
                    onChange={(e) => setAddedByLabelState(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Items Header with Import + Add */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Items {formData.items.length > 0 && <span className="text-gray-400 font-normal">({formData.items.length})</span>}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileImport}
                    className="hidden"
                  />
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleImageImport}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={openCameraForScan}
                    disabled={ocrProcessing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition border border-purple-200 dark:border-purple-800 disabled:opacity-50"
                  >
                    {ocrProcessing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Scanning {ocrProgress}%
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        Scan Bill
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition border border-blue-200 dark:border-blue-800"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import CSV
                  </button>
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Item
                  </button>
                </div>
              </div>

              {/* CSV Format Hint */}
              {formData.items.length === 0 && (
                <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600">
                  <FileSpreadsheet className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No items yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    <span className="text-purple-500 font-medium">Scan Bill</span> — photo/screenshot of supplier bill
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    <span className="text-blue-500 font-medium">Import CSV</span> — columns: Name, Quantity, Price
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">or click "Add Item" to enter manually</p>
                </div>
              )}

              {/* Items Table — Compact, scrollable on mobile */}
              {formData.items.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase w-8">#</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Product Name *</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase w-20">Qty *</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase w-24">Cost ₹</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase w-24">Sell ₹</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase w-24">MRP ₹</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase w-20" title="Supplier discount — profit calc only">Purch Disc %</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase w-20" title="Customer discount — auto-fills the bill line">Cust Disc %</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase w-28">Barcode</th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {formData.items.map((item, index) => (
                          <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-3 py-1.5 text-xs text-gray-400">{index + 1}</td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                required
                                value={item.product_name}
                                onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                                placeholder="Product name"
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                required
                                min="1"
                                value={item.quantity_ordered}
                                onChange={(e) => updateItem(index, 'quantity_ordered', parseInt(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.01"
                                value={item.cost_price}
                                onChange={(e) => updateItem(index, 'cost_price', e.target.value)}
                                placeholder="0.00"
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.01"
                                value={item.selling_price}
                                onChange={(e) => updateItem(index, 'selling_price', e.target.value)}
                                placeholder="Later"
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 placeholder:text-gray-300 dark:placeholder:text-gray-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.01"
                                value={item.mrp}
                                onChange={(e) => updateItem(index, 'mrp', e.target.value)}
                                placeholder="Later"
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 placeholder:text-gray-300 dark:placeholder:text-gray-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={item.purchase_discount_percentage ?? ''}
                                onChange={(e) => updateItem(index, 'purchase_discount_percentage', e.target.value)}
                                placeholder="0%"
                                title="Supplier discount — profit calc only"
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 placeholder:text-gray-300 dark:placeholder:text-gray-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={item.selling_discount_percentage ?? ''}
                                onChange={(e) => updateItem(index, 'selling_discount_percentage', e.target.value)}
                                placeholder="0%"
                                title="Customer discount — auto-fills the bill line"
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 placeholder:text-gray-300 dark:placeholder:text-gray-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={item.barcode || ''}
                                  onChange={(e) => updateItem(index, 'barcode', e.target.value)}
                                  placeholder="Barcode"
                                  className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500"
                                />
                                {isMobile && supportsCamera && (
                                  <button
                                    type="button"
                                    onClick={() => { setScanningItemIdx(index); setShowItemScanner(true) }}
                                    title="Scan barcode"
                                    className="flex-shrink-0 p-1.5 text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/30 rounded"
                                  >
                                    <Camera className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              <button
                                type="button"
                                onClick={() => removeItem(index)}
                                className="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile card list */}
                  <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
                    {formData.items.map((item, index) => (
                      <div key={index} className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">Item {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1 text-red-400 hover:text-red-600 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          required
                          value={item.product_name}
                          onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                          placeholder="Product name *"
                          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1">Qty *</label>
                            <input
                              type="number"
                              required
                              min="1"
                              value={item.quantity_ordered}
                              onChange={(e) => updateItem(index, 'quantity_ordered', parseInt(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1">Cost ₹</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.cost_price}
                              onChange={(e) => updateItem(index, 'cost_price', e.target.value)}
                              placeholder="0"
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1">Sell ₹</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.selling_price}
                              onChange={(e) => updateItem(index, 'selling_price', e.target.value)}
                              placeholder="Later"
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 placeholder:text-gray-300 dark:placeholder:text-gray-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1" title="Supplier discount — profit calc only">Purch Disc %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={item.purchase_discount_percentage ?? ''}
                              onChange={(e) => updateItem(index, 'purchase_discount_percentage', e.target.value)}
                              placeholder="0%"
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 placeholder:text-gray-300 dark:placeholder:text-gray-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1" title="Customer discount — auto-fills the bill line">Cust Disc %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={item.selling_discount_percentage ?? ''}
                              onChange={(e) => updateItem(index, 'selling_discount_percentage', e.target.value)}
                              placeholder="0%"
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 placeholder:text-gray-300 dark:placeholder:text-gray-500"
                            />
                          </div>
                        </div>
                        {/* Barcode field (mobile card) */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.barcode || ''}
                            onChange={(e) => updateItem(index, 'barcode', e.target.value)}
                            placeholder="Barcode (optional)"
                            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-1 focus:ring-blue-500"
                          />
                          {supportsCamera && (
                            <button
                              type="button"
                              onClick={() => { setScanningItemIdx(index); setShowItemScanner(true) }}
                              title="Scan barcode"
                              className="flex-shrink-0 p-2.5 text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition"
                            >
                              <Camera className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary Row */}
                  <div className="bg-gray-50 dark:bg-gray-700 px-3 py-2 flex justify-between items-center text-xs border-t border-gray-200 dark:border-gray-600">
                    <span className="text-gray-500 dark:text-gray-400">
                      {formData.items.length} items • {formData.items.reduce((s, i) => s + (i.quantity_ordered || 0), 0)} total qty
                    </span>
                    {totalCost > 0 && (
                      <span className="font-semibold text-gray-900 dark:text-white">
                        Est. Cost: ₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex gap-3 flex-shrink-0 bg-gray-50 dark:bg-gray-800">
              <button
                type="submit"
                disabled={submitting || formData.items.length === 0}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
              >
                {submitting ? 'Saving...' : existingOrder ? 'Update Order' : 'Create Order'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition text-sm"
              >
                Close
              </button>
            </div>
          </form>
        ) : (
          /* Orders Tab */
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Filter Tabs */}
            <div className="px-5 py-3 flex gap-1.5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              {[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'partial', label: 'Partial' },
                { value: 'received', label: 'Received' },
              ].map(tab => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setOrderFilter(tab.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                    orderFilter === tab.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Orders List */}
            <div className="flex-1 overflow-y-auto p-5">
              {loadingOrders ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No orders found</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Create your first order
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map(order => (
                    <div key={order.order_id} data-focus-id={order.order_id} className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                      {/* Order Header */}
                      <button
                        type="button"
                        onClick={() => setExpandedOrder(expandedOrder === order.order_id ? null : order.order_id!)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition text-left"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{order.order_number}</span>
                            <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadge(order.status || 'pending')}`}>
                              {(order.status || 'pending').toUpperCase()}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {order.supplier_name} • {order.items?.length || 0} items
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400 hidden sm:inline">
                            {order.order_date ? new Date(order.order_date).toLocaleDateString('en-IN') : ''}
                          </span>
                          {expandedOrder === order.order_id
                            ? <ChevronUp className="w-4 h-4 text-gray-400" />
                            : <ChevronDown className="w-4 h-4 text-gray-400" />
                          }
                        </div>
                      </button>

                      {/* Expanded Details */}
                      {expandedOrder === order.order_id && (
                        <div className="border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
                          {/* Items Table */}
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">
                                  <th className="px-4 py-2 text-left">Product</th>
                                  <th className="px-4 py-2 text-left">Ordered</th>
                                  <th className="px-4 py-2 text-left">Received</th>
                                  <th className="px-4 py-2 text-left">Cost</th>
                                  <th className="px-4 py-2 text-left">Sell</th>
                                  <th className="px-4 py-2 text-left">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-600">
                                {order.items?.map((item: any, i: number) => (
                                  <tr key={item.item_id || i} className="text-xs">
                                    <td className="px-4 py-2 text-gray-900 dark:text-white">{item.product_name}</td>
                                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{item.quantity_ordered} {item.unit}</td>
                                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{item.quantity_received || 0}</td>
                                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{item.cost_price ? `₹${item.cost_price}` : '—'}</td>
                                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{item.selling_price ? `₹${item.selling_price}` : '—'}</td>
                                    <td className="px-4 py-2">
                                      {(item.quantity_received || 0) >= item.quantity_ordered ? (
                                        <span className="text-green-600 dark:text-green-400 text-[10px] font-medium">Complete</span>
                                      ) : (item.quantity_received || 0) > 0 ? (
                                        <span className="text-blue-600 dark:text-blue-400 text-[10px] font-medium">Partial</span>
                                      ) : (
                                        <span className="text-gray-400 text-[10px]">Pending</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Actions */}
                          <div className="px-4 py-2.5 flex gap-2 border-t border-gray-200 dark:border-gray-600">
                            {order.status !== 'received' && onReceive && (
                              <button
                                type="button"
                                onClick={() => onReceive(order)}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
                              >
                                Receive Items
                              </button>
                            )}
                            {order.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteOrder(order.order_id!)}
                                className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Barcode scanner overlay (mobile-only, per item) */}
      {/* Camera capture overlay for bill scanning */}
      {showCameraCapture && (
        <div className="fixed inset-0 bg-black z-[200] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black/90 z-10 flex-shrink-0">
            <span className="text-white font-semibold text-base">Capture Supplier Bill</span>
            <button
              type="button"
              onClick={closeCameraCapture}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={cameraVideoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[85%] max-w-sm aspect-[3/4] border-2 border-white/40 rounded-xl" />
            </div>
            <p className="absolute bottom-24 left-0 right-0 text-center text-white text-sm font-medium bg-black/50 mx-auto w-fit px-4 py-1.5 rounded-full">
              Position the bill inside the frame
            </p>
          </div>
          <div className="flex justify-center py-5 bg-black/90 z-10 flex-shrink-0">
            <button
              type="button"
              onClick={capturePhotoAndOCR}
              className="w-16 h-16 rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform"
            >
              <div className="w-14 h-14 rounded-full border-4 border-black/20" />
            </button>
          </div>
        </div>
      )}

      {showItemScanner && scanningItemIdx !== null && (
        <BarcodeScannerOverlay
          onScan={(barcode) => {
            updateItem(scanningItemIdx, 'barcode', barcode)
            setShowItemScanner(false)
            setScanningItemIdx(null)
          }}
          onClose={() => {
            setShowItemScanner(false)
            setScanningItemIdx(null)
          }}
        />
      )}
    </div>
  )
}
