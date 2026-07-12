import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import BarcodeScannerModal from '@/components/billing/BarcodeScannerModal'
import { useMobileDetect } from '@/hooks/useMobileDetect'
import { getAddedByLabel, setAddedByLabel } from '@/utils/addedByLabel'
import { focusRowById } from '@/utils/focusRow'
import { useCurrency } from '@/lib/useCurrency'
import { useClient } from '@/contexts/ClientContext'
import { generateSupplierStatementPDF } from '@/lib/supplierPdfService'
import { generateDeliveryTaxInvoicePDF } from '@/lib/deliveryInvoicePdfService'
import { encodeDeliveryNotes, decodeDeliveryNotes } from '@/lib/deliveryNotesEncoding'
import { getShopSettings } from '@/services/shopSettingsService'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  supplier_id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  state: string | null
  gst_number: string | null
  transport_fee: number
  payment_terms: string | null
  notes: string | null
  bank_account_name: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_ifsc_code: string | null
  is_active: boolean
  created_at: string
}

interface DeliveryItem {
  id?: string
  product_id?: string | null
  product_name: string
  category: string
  quantity: number
  cost_price: string
  selling_price: string
  mrp: string
  purchase_discount_percentage: string
  selling_discount_percentage: string
  unit: string
  barcode: string
  item_code: string
  gst_percentage: string
  hsn_code: string
}

interface DeliveryPayment {
  payment_id: string
  delivery_id: string
  amount: number
  payment_date: string | null
  notes: string | null
  recorded_by?: string | null
  created_at?: string
}

interface Delivery {
  delivery_id: string
  supplier_id: string
  supplier_name?: string
  branch_id: string | null
  invoice_number: string | null
  delivery_date: string | null
  transport_fee: number
  notes: string | null
  status: 'draft' | 'confirmed' | 'completed'
  completed_by?: string | null
  completed_by_name?: string | null
  confirmed_by_name?: string | null
  products_confirmed: boolean
  confirmed_at: string | null
  delivery_note_filename: string | null
  has_delivery_note: boolean
  delivery_note_type: string | null
  completed_at: string | null
  added_by_label?: string | null
  items: DeliveryItem[]
  paid_amount?: number
  payments?: DeliveryPayment[]
  created_at: string
}

const EMPTY_SUPPLIER: Omit<Supplier, 'supplier_id' | 'is_active' | 'created_at'> = {
  name: '', contact_person: '', phone: '', email: '', address: '', state: '',
  gst_number: '', transport_fee: 0, payment_terms: '', notes: null,
  bank_account_name: '', bank_name: '', bank_account_number: '', bank_ifsc_code: '',
}

const EMPTY_ITEM: DeliveryItem = {
  product_name: '', category: '', quantity: 1, cost_price: '',
  selling_price: '', mrp: '', purchase_discount_percentage: '', selling_discount_percentage: '',
  unit: 'pcs', barcode: '',
  item_code: '', gst_percentage: '', hsn_code: '',
}

const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  confirmed: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  completed: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', confirmed: 'Confirmed', completed: 'Completed',
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { symbol: cur, taxLabel } = useCurrency()
  const { client } = useClient()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [tab, setTab] = useState<'suppliers' | 'deliveries'>('suppliers')

  // ── suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [suppLoading, setSuppLoading] = useState(false)
  const [suppSearch, setSuppSearch] = useState('')
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [suppForm, setSuppForm] = useState({ ...EMPTY_SUPPLIER })
  const [suppSaving, setSuppSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // ── supplier detail drawer state
  const [supplierDetail, setSupplierDetail] = useState<Supplier | null>(null)
  const [supplierDeliveries, setSupplierDeliveries] = useState<Delivery[]>([])
  const [supplierDelLoading, setSupplierDelLoading] = useState(false)

  // ── deliveries state
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [delLoading, setDelLoading] = useState(false)
  const [delSearch, setDelSearch] = useState('')
  const [delStatusFilter, setDelStatusFilter] = useState('')
  const [showNewDelivery, setShowNewDelivery] = useState(false)
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null)
  const [loadingDelivery, setLoadingDelivery] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // ── delivery wizard state
  const [step, setStep] = useState(1)   // 1=details 2=products 3=confirm+upload
  const [delAddedByLabel, setDelAddedByLabel] = useState<string>(() => getAddedByLabel())
  const [delForm, setDelForm] = useState({
    supplier_id: '', branch_id: '', invoice_number: '',
    delivery_date: '', transport_fee: '', notes: '',
    // Logistics fields — packed into `notes` on save, see lib/deliveryNotesEncoding.ts
    buyer_order_no: '', buyer_order_date: '',
    dispatched_through: '', destination: '',
    vehicle_no: '', lr_rr_no: '',
  })
  const [delItems, setDelItems] = useState<DeliveryItem[]>([{ ...EMPTY_ITEM }])
  const [currentDeliveryId, setCurrentDeliveryId] = useState<string | null>(null)
  const [productsConfirmed, setProductsConfirmed] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [initialPaymentAmount, setInitialPaymentAmount] = useState('')
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const csvInputRef   = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── record payment modal state (opened from delivery detail OR supplier drawer)
  const [paymentTarget, setPaymentTarget] = useState<{ delivery_id: string; label: string; balance: number } | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)

  // ── barcode scanner state (for delivery item entry)
  const [showScanner, setShowScanner]       = useState(false)
  const [scanningRowIdx, setScanningRowIdx] = useState<number | null>(null)
  const { isMobile, supportsCamera } = useMobileDetect()

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ msg, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // Cancel any pending toast timer on unmount
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])

  // ─── Fetch suppliers ──────────────────────────────────────────────────────
  const fetchSuppliers = useCallback(async () => {
    setSuppLoading(true)
    try {
      const res = await api.get('/suppliers/')
      setSuppliers(res.data.data || [])
    } catch {
      showToast('Failed to load suppliers', 'error')
    } finally {
      setSuppLoading(false)
    }
  }, [])

  // ─── Fetch deliveries ─────────────────────────────────────────────────────
  const fetchDeliveries = useCallback(async () => {
    setDelLoading(true)
    try {
      const params: Record<string, string> = {}
      if (delStatusFilter) params.status = delStatusFilter
      const res = await api.get('/suppliers/deliveries', { params })
      setDeliveries(res.data.data || [])
    } catch {
      showToast('Failed to load deliveries', 'error')
    } finally {
      setDelLoading(false)
    }
  }, [delStatusFilter])

  useEffect(() => { fetchSuppliers() }, [fetchSuppliers])
  useEffect(() => { if (tab === 'deliveries') fetchDeliveries() }, [tab, fetchDeliveries])

  // ─── Supplier detail drawer ───────────────────────────────────────────────
  const openSupplierDetail = useCallback(async (supplier: Supplier) => {
    setSupplierDetail(supplier)
    setSupplierDelLoading(true)
    try {
      const res = await api.get('/suppliers/deliveries', { params: { supplier_id: supplier.supplier_id } })
      setSupplierDeliveries(res.data.data || [])
    } catch {
      showToast('Failed to load deliveries', 'error')
    } finally {
      setSupplierDelLoading(false)
    }
  }, [showToast])

  const closeSupplierDetail = useCallback(() => {
    setSupplierDetail(null)
    setSupplierDeliveries([])
  }, [])

  function downloadSupplierStatement() {
    if (!supplierDetail) return
    generateSupplierStatementPDF({
      client: {
        client_name: client?.client_name || 'Business',
        address: client?.address,
        phone: client?.phone,
        email: client?.email,
        gstin: client?.gstin,
      },
      supplier: {
        name: supplierDetail.name,
        contact_person: supplierDetail.contact_person,
        phone: supplierDetail.phone,
        email: supplierDetail.email,
        address: supplierDetail.address,
        state: supplierDetail.state,
        gst_number: supplierDetail.gst_number,
      },
      deliveries: supplierDeliveryTotals,
      totalAmount: supplierGrandTotal,
      paidAmount: supplierPaidTotal,
      balanceDue: supplierBalanceTotal,
    })
  }

  const supplierDeliveryTotals = useMemo(() =>
    supplierDeliveries.map(d => {
      const total = d.items.reduce((sum, item) => sum + (parseFloat(String(item.cost_price)) || 0) * item.quantity, 0)
      const paid = d.paid_amount || 0
      return { ...d, total, paid, balance: Math.max(total - paid, 0) }
    }), [supplierDeliveries])

  const supplierGrandTotal = useMemo(() =>
    supplierDeliveryTotals.reduce((sum, d) => sum + d.total, 0), [supplierDeliveryTotals])

  const supplierPaidTotal = useMemo(() =>
    supplierDeliveryTotals.reduce((sum, d) => sum + d.paid, 0), [supplierDeliveryTotals])

  const supplierBalanceTotal = useMemo(() =>
    supplierDeliveryTotals.reduce((sum, d) => sum + d.balance, 0), [supplierDeliveryTotals])

  // Deep-link focus: scroll to and highlight the supplier card or delivery row
  // matching ?focus=<id> (with optional ?tab=deliveries for delivery deep-links).
  // Two-pass approach:
  //   Pass 1 – URL has ?focus + ?tab=deliveries → switch tab to 'deliveries' so fetch fires.
  //            The URL params are kept so Pass 2 can complete the focus.
  //   Pass 2 – deliveries are now loaded → focus the row and clear the URL params.
  useEffect(() => {
    const focus = searchParams.get('focus')
    if (!focus) return

    const tabParam = searchParams.get('tab')
    const targetTab: 'suppliers' | 'deliveries' = tabParam === 'deliveries' ? 'deliveries' : 'suppliers'

    if (targetTab === 'deliveries') {
      // Switch to deliveries tab to trigger fetch (if not already there)
      if (tab !== 'deliveries') { setTab('deliveries'); return }
      // Wait until deliveries are loaded
      if (!deliveries || deliveries.length === 0) return
      focusRowById(focus)
    } else {
      if (!suppliers || suppliers.length === 0) return
      setTab('suppliers')
      focusRowById(focus)
    }

    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    next.delete('tab')
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true })
  }, [suppliers, deliveries, tab, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Filtered lists ───────────────────────────────────────────────────────
  const filteredSuppliers = useMemo(() =>
    suppliers.filter(s =>
      s.name.toLowerCase().includes(suppSearch.toLowerCase()) ||
      (s.contact_person || '').toLowerCase().includes(suppSearch.toLowerCase()) ||
      (s.phone || '').includes(suppSearch)
    ), [suppliers, suppSearch])

  const filteredDeliveries = useMemo(() =>
    deliveries.filter(d => {
      const q = delSearch.toLowerCase()
      return (d.supplier_name || '').toLowerCase().includes(q) ||
        (d.invoice_number || '').toLowerCase().includes(q)
    }), [deliveries, delSearch])

  const wizardTotalCost = useMemo(() =>
    delItems.reduce((sum, item) => sum + (parseFloat(item.cost_price) || 0) * item.quantity, 0),
    [delItems])

  // ─── Supplier form ────────────────────────────────────────────────────────
  function openAddSupplier() {
    setEditingSupplier(null)
    setSuppForm({ ...EMPTY_SUPPLIER })
    setShowSupplierModal(true)
  }

  function openEditSupplier(s: Supplier) {
    setEditingSupplier(s)
    setSuppForm({
      name: s.name, contact_person: s.contact_person || '', phone: s.phone || '',
      email: s.email || '', address: s.address || '', state: s.state || '', gst_number: s.gst_number || '',
      transport_fee: s.transport_fee, payment_terms: s.payment_terms || '',
      notes: s.notes || '',
      bank_account_name: s.bank_account_name || '', bank_name: s.bank_name || '',
      bank_account_number: s.bank_account_number || '', bank_ifsc_code: s.bank_ifsc_code || '',
    })
    setShowSupplierModal(true)
  }

  async function saveSupplier() {
    if (!suppForm.name.trim()) { showToast('Supplier name is required', 'error'); return }
    setSuppSaving(true)
    try {
      if (editingSupplier) {
        const res = await api.put(`/suppliers/${editingSupplier.supplier_id}`, suppForm)
        showToast('Supplier updated')
        // Keep the open drawer (if any) in sync — it holds its own copy of the
        // supplier fetched when it was opened, so a plain fetchSuppliers() below
        // wouldn't refresh it and PDFs would still use stale field values.
        if (supplierDetail?.supplier_id === editingSupplier.supplier_id) {
          setSupplierDetail(res.data.data)
        }
      } else {
        await api.post('/suppliers/', suppForm)
        showToast('Supplier added')
      }
      setShowSupplierModal(false)
      fetchSuppliers()
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to save supplier', 'error')
    } finally {
      setSuppSaving(false)
    }
  }

  async function deleteSupplier(supplier_id: string) {
    try {
      await api.delete(`/suppliers/${supplier_id}`)
      showToast('Supplier removed')
      setDeleteConfirm(null)
      fetchSuppliers()
    } catch {
      showToast('Failed to remove supplier', 'error')
    }
  }

  // ─── Delivery wizard ──────────────────────────────────────────────────────
  function openNewDelivery() {
    setStep(1)
    setDelForm({
      supplier_id: '', branch_id: '', invoice_number: '', delivery_date: '', transport_fee: '', notes: '',
      buyer_order_no: '', buyer_order_date: '', dispatched_through: '', destination: '', vehicle_no: '', lr_rr_no: '',
    })
    setDelItems([{ ...EMPTY_ITEM }])
    setCurrentDeliveryId(null)
    setProductsConfirmed(false)
    setUploadedFile(null)
    setUploadPreview(null)
    setInitialPaymentAmount('')
    setShowNewDelivery(true)
  }

  function closeWizard() {
    setShowNewDelivery(false)
    setCurrentDeliveryId(null)
    setInitialPaymentAmount('')
  }

  function continueDraft(delivery: Delivery) {
    setCurrentDeliveryId(delivery.delivery_id)
    const logistics = decodeDeliveryNotes(delivery.notes)
    setDelForm({
      supplier_id:    delivery.supplier_id,
      branch_id:      delivery.branch_id || '',
      invoice_number: delivery.invoice_number || '',
      delivery_date:  delivery.delivery_date || '',
      transport_fee:  delivery.transport_fee ? String(delivery.transport_fee) : '',
      notes:          logistics.text,
      buyer_order_no:     logistics.buyer_order_no || '',
      buyer_order_date:   logistics.buyer_order_date || '',
      dispatched_through: logistics.dispatched_through || '',
      destination:        logistics.destination || '',
      vehicle_no:         logistics.vehicle_no || '',
      lr_rr_no:           logistics.lr_rr_no || '',
    })
    const hasItems = delivery.items && delivery.items.length > 0
    setDelItems(hasItems
      ? delivery.items.map(i => ({
          ...EMPTY_ITEM,
          ...i,
          cost_price:    i.cost_price    ? String(i.cost_price)    : '',
          selling_price: i.selling_price ? String(i.selling_price) : '',
          mrp:           i.mrp           ? String(i.mrp)           : '',
          purchase_discount_percentage: i.purchase_discount_percentage ? String(i.purchase_discount_percentage) : '',
          selling_discount_percentage:  i.selling_discount_percentage  ? String(i.selling_discount_percentage)  : '',
          gst_percentage: i.gst_percentage ? String(i.gst_percentage) : '',
        }))
      : [{ ...EMPTY_ITEM }]
    )
    setProductsConfirmed(delivery.products_confirmed || false)
    setUploadedFile(null)
    setUploadPreview(null)
    setInitialPaymentAmount('')
    // Resume at the right step: has items → step 3, else → step 2
    setStep(hasItems ? 3 : 2)
    setActiveDelivery(null)
    setShowNewDelivery(true)
  }

  function addItem() {
    setDelItems(prev => [...prev, { ...EMPTY_ITEM }])
  }

  function removeItem(idx: number) {
    setDelItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof DeliveryItem, value: string | number) {
    setDelItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  async function saveStep1() {
    if (!delForm.supplier_id) { showToast('Select a supplier', 'error'); return }
    if (!delAddedByLabel.trim()) { showToast('Please enter your name in "Added By"', 'error'); return }
    setSavingDraft(true)
    try {
      const payload = {
        supplier_id:    delForm.supplier_id,
        branch_id:      delForm.branch_id || null,
        invoice_number: delForm.invoice_number || null,
        delivery_date:  delForm.delivery_date || null,
        transport_fee:  parseFloat(delForm.transport_fee) || 0,
        notes:          encodeDeliveryNotes({
          text: delForm.notes,
          buyer_order_no: delForm.buyer_order_no,
          buyer_order_date: delForm.buyer_order_date,
          dispatched_through: delForm.dispatched_through,
          destination: delForm.destination,
          vehicle_no: delForm.vehicle_no,
          lr_rr_no: delForm.lr_rr_no,
        }) || null,
        added_by_label: delAddedByLabel.trim(),
      }
      if (currentDeliveryId) {
        // Updating an existing draft
        await api.put(`/suppliers/deliveries/${currentDeliveryId}`, payload)
      } else {
        // Creating a new draft
        const res = await api.post('/suppliers/deliveries', { ...payload, items: [] })
        setCurrentDeliveryId(res.data.data.delivery_id)
        setAddedByLabel(delAddedByLabel)
      }
      setStep(2)
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to save delivery', 'error')
    } finally {
      setSavingDraft(false)
    }
  }

  async function saveStep2() {
    const validItems = delItems.filter(i => i.product_name.trim())
    if (validItems.length === 0) { showToast('Add at least one product', 'error'); return }
    const hasQty = validItems.every(i => i.quantity > 0)
    if (!hasQty) { showToast('All quantities must be greater than 0', 'error'); return }

    setSavingDraft(true)
    try {
      await api.put(`/suppliers/deliveries/${currentDeliveryId}`, {
        items: validItems.map(i => ({
          ...i,
          quantity:       Number(i.quantity),
          cost_price:     i.cost_price    ? parseFloat(i.cost_price)    : null,
          selling_price:  i.selling_price ? parseFloat(i.selling_price) : null,
          mrp:            i.mrp           ? parseFloat(i.mrp)           : null,
          purchase_discount_percentage: i.purchase_discount_percentage ? parseFloat(i.purchase_discount_percentage) : 0,
          selling_discount_percentage:  i.selling_discount_percentage  ? parseFloat(i.selling_discount_percentage)  : 0,
          gst_percentage: i.gst_percentage ? parseFloat(i.gst_percentage) : 0,
        })),
      })
      setStep(3)
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to save products', 'error')
    } finally {
      setSavingDraft(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFile(file)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = ev => setUploadPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setUploadPreview(null)
    }
  }

  async function uploadNote() {
    if (!uploadedFile || !currentDeliveryId) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', uploadedFile)
      await api.post(`/suppliers/deliveries/${currentDeliveryId}/upload-note`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      showToast('Delivery note uploaded')
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  async function confirmProducts() {
    if (!currentDeliveryId) return
    try {
      await api.post(`/suppliers/deliveries/${currentDeliveryId}/confirm-products`)
      setProductsConfirmed(true)
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to confirm', 'error')
    }
  }

  async function completeDelivery() {
    if (!currentDeliveryId) return
    if (!productsConfirmed) { showToast('Confirm all products are available first', 'error'); return }
    const plannedPayment = parseFloat(initialPaymentAmount) || 0
    if (plannedPayment > 0 && wizardTotalCost > 0 && plannedPayment > wizardTotalCost + 0.009) {
      showToast(`Amount paid cannot exceed the total purchase value (${cur}${wizardTotalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, 'error')
      return
    }

    setCompleting(true)
    try {
      // Upload note if a file was selected (optional)
      if (uploadedFile) await uploadNote()
      // Confirm if not done
      if (!productsConfirmed) await confirmProducts()

      const res = await api.post(`/suppliers/deliveries/${currentDeliveryId}/complete`)

      const initialPayment = parseFloat(initialPaymentAmount) || 0
      if (initialPayment > 0) {
        await api.post(`/suppliers/deliveries/${currentDeliveryId}/payments`, {
          amount: initialPayment,
          payment_date: new Date().toISOString().slice(0, 10),
          notes: 'Initial payment',
        })
      }

      showToast(res.data.message || 'Delivery completed. Stock updated!')
      closeWizard()
      fetchDeliveries()
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to complete delivery', 'error')
    } finally {
      setCompleting(false)
    }
  }

  // ─── Barcode scan handler ─────────────────────────────────────────────────
  async function handleBarcodeScan(barcode: string) {
    setShowScanner(false)
    if (scanningRowIdx === null) return
    try {
      const res = await api.get(`/stock/lookup/${encodeURIComponent(barcode)}`)
      const p = res.data
      // Auto-fill the row with existing product data
      setDelItems(prev => prev.map((item, i) => i === scanningRowIdx ? {
        ...item,
        product_name:   p.product_name  || item.product_name,
        product_id:     p.product_id    || item.product_id,
        cost_price:     p.cost_price != null ? String(p.cost_price)   : item.cost_price,
        selling_price:  p.rate      != null ? String(p.rate)          : item.selling_price,
        mrp:            p.mrp       != null ? String(p.mrp)           : item.mrp,
        purchase_discount_percentage: p.purchase_discount_percentage != null ? String(p.purchase_discount_percentage) : item.purchase_discount_percentage,
        selling_discount_percentage:  p.selling_discount_percentage  != null ? String(p.selling_discount_percentage)  : item.selling_discount_percentage,
        unit:           p.unit          || item.unit,
        category:       p.category      || item.category,
        barcode:        barcode,
        gst_percentage: p.gst_percentage != null ? String(p.gst_percentage) : item.gst_percentage,
        hsn_code:       p.hsn_code      || item.hsn_code,
      } : item))
      showToast(`Found: ${p.product_name}`)
    } catch {
      // Product not in stock yet — just fill the barcode, staff enters the rest
      setDelItems(prev => prev.map((item, i) => i === scanningRowIdx ? { ...item, barcode } : item))
      showToast('New product — fill in the details', 'error')
    }
    setScanningRowIdx(null)
  }

  // ─── CSV import ───────────────────────────────────────────────────────────
  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) { showToast('CSV has no data rows', 'error'); return }

      // Detect header row — normalize to lowercase
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''))
      const idx = (names: string[]) => names.map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1

      const nameIdx   = idx(['product_name','name','item','product'])
      const qtyIdx    = idx(['quantity','qty','received_qty'])
      const costIdx   = idx(['cost_price','cost','purchase_price','unit_price','price'])
      const sellIdx   = idx(['selling_price','sell_price','sale_price','mrp'])
      const purchDiscIdx = idx(['purchase_discount_percentage','purchase_discount','purchase_disc'])
      const sellDiscIdx  = idx(['selling_discount_percentage','customer_discount','selling_discount','customer_disc'])
      const barcodeIdx= idx(['barcode','ean','upc','code'])
      const unitIdx   = idx(['unit','uom'])
      const catIdx    = idx(['category','cat'])

      if (nameIdx === -1) { showToast('CSV must have a "product_name" or "name" column', 'error'); return }

      const parsed: DeliveryItem[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
        const name = cols[nameIdx]?.trim()
        if (!name) continue
        parsed.push({
          ...EMPTY_ITEM,
          product_name:  name,
          quantity:      qtyIdx   >= 0 ? (parseInt(cols[qtyIdx])   || 1)    : 1,
          cost_price:    costIdx  >= 0 ? (cols[costIdx]  || '')             : '',
          selling_price: sellIdx  >= 0 ? (cols[sellIdx]  || '')             : '',
          purchase_discount_percentage: purchDiscIdx >= 0 ? (cols[purchDiscIdx] || '') : '',
          selling_discount_percentage:  sellDiscIdx  >= 0 ? (cols[sellDiscIdx]  || '') : '',
          unit:          unitIdx  >= 0 ? (cols[unitIdx]  || 'pcs')          : 'pcs',
          category:      catIdx   >= 0 ? (cols[catIdx]   || '')             : '',
          barcode:       barcodeIdx >= 0 ? (cols[barcodeIdx] || '')         : '',
        })
      }

      if (parsed.length === 0) { showToast('No valid rows found in CSV', 'error'); return }
      setDelItems(parsed)
      showToast(`Imported ${parsed.length} products from CSV`)
    }
    reader.readAsText(file)
    // Reset input so same file can be re-imported
    e.target.value = ''
  }

  // ─── View delivery detail ─────────────────────────────────────────────────
  async function openDelivery(delivery_id: string) {
    setLoadingDelivery(true)
    try {
      const res = await api.get(`/suppliers/deliveries/${delivery_id}`)
      setActiveDelivery(res.data.data)
    } catch {
      showToast('Failed to load delivery details', 'error')
    } finally {
      setLoadingDelivery(false)
    }
  }

  function openPaymentModal(delivery_id: string, label: string, balance: number) {
    setPaymentAmount('')
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentNotes('')
    setPaymentTarget({ delivery_id, label, balance })
  }

  async function recordPayment() {
    if (!paymentTarget) return
    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0) { showToast('Enter a valid payment amount', 'error'); return }
    if (paymentTarget.balance > 0 && amount > paymentTarget.balance + 0.009) {
      showToast(`Amount exceeds balance due (${cur}${paymentTarget.balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, 'error')
      return
    }

    setSavingPayment(true)
    try {
      await api.post(`/suppliers/deliveries/${paymentTarget.delivery_id}/payments`, {
        amount,
        payment_date: paymentDate || new Date().toISOString().slice(0, 10),
        notes: paymentNotes.trim() || null,
      })
      showToast('Payment recorded')
      const paidDeliveryId = paymentTarget.delivery_id
      setPaymentTarget(null)
      if (activeDelivery?.delivery_id === paidDeliveryId) await openDelivery(paidDeliveryId)
      fetchDeliveries()
      if (supplierDetail) await openSupplierDetail(supplierDetail)
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to record payment', 'error')
    } finally {
      setSavingPayment(false)
    }
  }

  async function deletePayment(payment_id: string) {
    if (!activeDelivery) return
    if (!window.confirm('Remove this payment? The balance due will increase.')) return
    try {
      await api.delete(`/suppliers/deliveries/${activeDelivery.delivery_id}/payments/${payment_id}`)
      showToast('Payment removed')
      await openDelivery(activeDelivery.delivery_id)
      fetchDeliveries()
      if (supplierDetail) await openSupplierDetail(supplierDetail)
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to remove payment', 'error')
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Suppliers</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage vendors and track incoming stock deliveries</p>
          </div>
          {tab === 'suppliers' ? (
            <button onClick={openAddSupplier}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              + Add Supplier
            </button>
          ) : (
            <button onClick={openNewDelivery}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              + New Delivery
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {(['suppliers', 'deliveries'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── SUPPLIERS TAB ── */}
        {tab === 'suppliers' && (
          <div className="space-y-4">
            <input
              value={suppSearch} onChange={e => setSuppSearch(e.target.value)}
              placeholder="Search by name, contact, phone…"
              className="w-full max-w-sm px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {suppLoading ? (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500">Loading suppliers…</div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                </div>
                <p className="text-gray-700 dark:text-gray-300 font-medium">No suppliers yet</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Add your first vendor to start tracking deliveries</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSuppliers.map(s => (
                  <div key={s.supplier_id} data-focus-id={s.supplier_id} onClick={() => openSupplierDetail(s)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all group cursor-pointer">

                    {/* Card header */}
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white truncate leading-tight">{s.name}</p>
                            {s.contact_person && <p className="text-xs text-gray-500 dark:text-gray-400">{s.contact_person}</p>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); openEditSupplier(s) }} title="Edit"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={e => { e.stopPropagation(); setDeleteConfirm(s.supplier_id) }} title="Remove"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Contact details */}
                    <div className="space-y-2">
                      {s.phone && (
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                          </svg>
                          <span>{s.phone}</span>
                        </div>
                      )}
                      {s.email && (
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          <span className="truncate">{s.email}</span>
                        </div>
                      )}
                      {s.address && (
                        <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                          <span className="line-clamp-2 leading-relaxed">{s.address}</span>
                        </div>
                      )}
                    </div>

                    {/* Footer tags */}
                    {(s.gst_number || s.payment_terms || s.transport_fee > 0) && (
                      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-1.5">
                        {s.gst_number && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-mono">
                            {taxLabel} {s.gst_number}
                          </span>
                        )}
                        {s.payment_terms && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                            {s.payment_terms}
                          </span>
                        )}
                        {s.transport_fee > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {cur}{s.transport_fee.toLocaleString()} transport
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DELIVERIES TAB ── */}
        {tab === 'deliveries' && (
          <div className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <input
                value={delSearch} onChange={e => setDelSearch(e.target.value)}
                placeholder="Search supplier, invoice…"
                className="flex-1 min-w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select value={delStatusFilter} onChange={e => setDelStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            {delLoading ? (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading deliveries…</div>
            ) : filteredDeliveries.length === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                <p className="text-lg">No deliveries yet</p>
                <p className="text-sm mt-1">Record a new delivery to update stock automatically</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Supplier</th>
                      <th className="px-4 py-3 text-left">Invoice</th>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Items</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Payment</th>
                      <th className="px-4 py-3 text-left">Note</th>
                      <th className="px-4 py-3 text-left">Added By</th>
                      <th className="px-4 py-3 text-left"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredDeliveries.map(d => (
                      <tr key={d.delivery_id} data-focus-id={d.delivery_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{d.supplier_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{d.invoice_number || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{d.delivery_date || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{d.items.length} item{d.items.length !== 1 ? 's' : ''}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[d.status]}`}>
                            {STATUS_LABEL[d.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const total = d.items.reduce((sum, item) => sum + (parseFloat(String(item.cost_price)) || 0) * item.quantity, 0)
                            if (total <= 0) return <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                            const paid = d.paid_amount || 0
                            const balance = Math.max(total - paid, 0)
                            if (balance <= 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">Paid</span>
                            if (paid > 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">Partial · {cur}{balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })} due</span>
                            return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">Unpaid</span>
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {d.has_delivery_note ? (
                            <span className="text-green-600 dark:text-green-400 text-xs">✓ Uploaded</span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                          {d.added_by_label || d.completed_by_name || d.confirmed_by_name || <span className="text-gray-400 dark:text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => openDelivery(d.delivery_id)}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-medium">
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SUPPLIER ADD/EDIT MODAL ── */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <button onClick={() => setShowSupplierModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-5">

              {/* Section: Basic */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Vendor Details</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Supplier Name <span className="text-red-400">*</span></label>
                    <input value={suppForm.name} onChange={e => setSuppForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. ABC Distributors"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Person</label>
                      <input value={suppForm.contact_person || ''} onChange={e => setSuppForm(f => ({ ...f, contact_person: e.target.value }))}
                        placeholder="Name"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                      <input value={suppForm.phone || ''} onChange={e => setSuppForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="+91 98765 43210"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                    <input type="email" value={suppForm.email || ''} onChange={e => setSuppForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="supplier@email.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 dark:border-gray-700" />

              {/* Section: Address */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Address</p>
                <textarea value={suppForm.address || ''} onChange={e => setSuppForm(f => ({ ...f, address: e.target.value }))}
                  rows={3} placeholder="Street, City, PIN"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">State</label>
                  <input value={suppForm.state || ''} onChange={e => setSuppForm(f => ({ ...f, state: e.target.value }))}
                    placeholder="e.g. Tamil Nadu"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 dark:border-gray-700" />

              {/* Section: Financial */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Financial</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{taxLabel} Number</label>
                    <input value={suppForm.gst_number || ''} onChange={e => setSuppForm(f => ({ ...f, gst_number: e.target.value.toUpperCase() }))}
                      placeholder="22AAAAA0000A1Z5"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Terms</label>
                    <input value={suppForm.payment_terms || ''} onChange={e => setSuppForm(f => ({ ...f, payment_terms: e.target.value }))}
                      placeholder="COD / Net 30 / Advance"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Default Transport Fee ({cur})</label>
                    <input type="number" min="0" step="0.01"
                      value={suppForm.transport_fee} onChange={e => setSuppForm(f => ({ ...f, transport_fee: parseFloat(e.target.value) || 0 }))}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 dark:border-gray-700" />

              {/* Section: Bank Details */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Bank Details <span className="normal-case font-normal text-gray-400">(for invoice PDF)</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">A/c Holder's Name</label>
                    <input value={suppForm.bank_account_name || ''} onChange={e => setSuppForm(f => ({ ...f, bank_account_name: e.target.value }))}
                      placeholder="As per bank records"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Bank Name</label>
                    <input value={suppForm.bank_name || ''} onChange={e => setSuppForm(f => ({ ...f, bank_name: e.target.value }))}
                      placeholder="e.g. Indian Overseas Bank"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">A/c No.</label>
                    <input value={suppForm.bank_account_number || ''} onChange={e => setSuppForm(f => ({ ...f, bank_account_number: e.target.value }))}
                      placeholder="Account number"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Branch &amp; IFSC Code</label>
                    <input value={suppForm.bank_ifsc_code || ''} onChange={e => setSuppForm(f => ({ ...f, bank_ifsc_code: e.target.value.toUpperCase() }))}
                      placeholder="e.g. R.S. Puram & IOBA0000079"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 dark:border-gray-700" />

              {/* Section: Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Notes</label>
                <textarea value={suppForm.notes || ''} onChange={e => setSuppForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Delivery schedule, minimum order, special instructions…"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl">
              <button onClick={() => setShowSupplierModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
              <button onClick={saveSupplier} disabled={suppSaving}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {suppSaving ? 'Saving…' : editingSupplier ? 'Update' : 'Add Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <p className="font-semibold text-gray-900 dark:text-white">Remove this supplier?</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Their delivery history will be preserved.</p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button onClick={() => deleteSupplier(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW DELIVERY WIZARD ── */}
      {showNewDelivery && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

            {/* Wizard header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Delivery</h2>
                <button onClick={closeWizard} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
              </div>
              {/* Step indicator */}
              <div className="flex items-center gap-2">
                {[
                  { n: 1, label: 'Supplier & Details' },
                  { n: 2, label: 'Products' },
                  { n: 3, label: 'Confirm & Upload' },
                ].map(({ n, label }) => (
                  <div key={n} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      step > n ? 'bg-green-500 text-white' :
                      step === n ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>{step > n ? '✓' : n}</div>
                    <span className={`text-xs ${step === n ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{label}</span>
                    {n < 3 && <div className="w-6 h-px bg-gray-200 dark:bg-gray-700" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">

              {/* ── STEP 1: Supplier & Details ── */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Supplier *</label>
                      <select value={delForm.supplier_id} onChange={e => setDelForm(f => ({ ...f, supplier_id: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Select a supplier…</option>
                        {suppliers.map(s => (
                          <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Invoice Number</label>
                      <input value={delForm.invoice_number} onChange={e => setDelForm(f => ({ ...f, invoice_number: e.target.value }))}
                        placeholder="INV-2024-001"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery Date</label>
                      <input type="date" value={delForm.delivery_date} onChange={e => setDelForm(f => ({ ...f, delivery_date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Transport Fee ({cur})</label>
                      <input type="number" min="0" step="0.01"
                        value={delForm.transport_fee} onChange={e => setDelForm(f => ({ ...f, transport_fee: e.target.value }))}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
                      <textarea value={delForm.notes} onChange={e => setDelForm(f => ({ ...f, notes: e.target.value }))}
                        rows={2} placeholder="Any notes for this delivery…"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    </div>

                    {/* Invoice/logistics fields — shown on the Tax Invoice PDF; stored inside Notes */}
                    <div className="col-span-2 border-t border-gray-100 dark:border-gray-700 pt-4">
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Invoice Details (optional)</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Buyer's Order No.</label>
                          <input value={delForm.buyer_order_no} onChange={e => setDelForm(f => ({ ...f, buyer_order_no: e.target.value }))}
                            placeholder="PO number"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Order Dated</label>
                          <input type="date" value={delForm.buyer_order_date} onChange={e => setDelForm(f => ({ ...f, buyer_order_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Dispatched Through</label>
                          <input value={delForm.dispatched_through} onChange={e => setDelForm(f => ({ ...f, dispatched_through: e.target.value }))}
                            placeholder="e.g. Tempo, Courier"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Destination</label>
                          <input value={delForm.destination} onChange={e => setDelForm(f => ({ ...f, destination: e.target.value }))}
                            placeholder="Drop location"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Motor Vehicle No.</label>
                          <input value={delForm.vehicle_no} onChange={e => setDelForm(f => ({ ...f, vehicle_no: e.target.value }))}
                            placeholder="e.g. TN66AB7031"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Bill of Lading/LR-RR No.</label>
                          <input value={delForm.lr_rr_no} onChange={e => setDelForm(f => ({ ...f, lr_rr_no: e.target.value }))}
                            placeholder="LR/RR number"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Added By *</label>
                      <input
                        type="text"
                        required
                        value={delAddedByLabel}
                        onChange={e => setDelAddedByLabel(e.target.value)}
                        placeholder="Your name (e.g., Ramesh)"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Who is creating this delivery</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 2: Products ── */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex-1">Add products. Scan barcodes to auto-fill from stock, or import via CSV.</p>
                    <div className="flex items-center gap-2">
                      {/* CSV import */}
                      <button type="button" onClick={() => csvInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                        Import CSV
                      </button>
                      <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
                      <button type="button" onClick={addItem}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium">
                        + Add Row
                      </button>
                    </div>
                  </div>

                  {/* CSV format hint */}
                  <p className="text-xs text-gray-400 dark:text-gray-500">CSV columns: <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">product_name, quantity, cost_price, selling_price, barcode, unit, category</span></p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 uppercase">
                          {['Product Name *', 'Qty *', 'Cost Price', 'Selling Price', 'Purchase Disc %', 'Customer Disc %', 'Unit', 'Category', 'Barcode', ''].map(h => (
                            <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap border-b border-gray-200 dark:border-gray-700">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {delItems.map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                            <td className="px-2 py-1.5">
                              <input value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)}
                                placeholder="Product name"
                                className="w-36 px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                                className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" min="0" step="0.01" value={item.cost_price} onChange={e => updateItem(idx, 'cost_price', e.target.value)}
                                placeholder={`${cur}0`}
                                className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" min="0" step="0.01" value={item.selling_price} onChange={e => updateItem(idx, 'selling_price', e.target.value)}
                                placeholder={`${cur}0`}
                                className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" min="0" max="100" step="0.01" value={item.purchase_discount_percentage} onChange={e => updateItem(idx, 'purchase_discount_percentage', e.target.value)}
                                placeholder="0%" title="Supplier discount — profit calc only"
                                className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" min="0" max="100" step="0.01" value={item.selling_discount_percentage} onChange={e => updateItem(idx, 'selling_discount_percentage', e.target.value)}
                                placeholder="0%" title="Customer discount — auto-fills the bill line"
                                className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-2 py-1.5">
                              <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                                className="w-16 px-1 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-xs focus:outline-none">
                                {['pcs', 'kg', 'gm', 'ltr', 'ml', 'box', 'pkt', 'doz'].map(u => (
                                  <option key={u} value={u}>{u}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <input value={item.category} onChange={e => updateItem(idx, 'category', e.target.value)}
                                placeholder="Category"
                                className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <input value={item.barcode} onChange={e => updateItem(idx, 'barcode', e.target.value)}
                                  placeholder="Barcode"
                                  className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                {/* Scan button — mobile only (same pattern as CreateBill) */}
                                {isMobile && supportsCamera && (
                                  <button type="button"
                                    onClick={() => { setScanningRowIdx(idx); setShowScanner(true) }}
                                    title="Scan barcode"
                                    className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1M4 12H3M21 12h-1M12 19v1M6.343 6.343l-.707-.707M18.364 18.364l-.707-.707M18.364 5.636l-.707.707M6.343 17.657l-.707.707"/>
                                      <rect x="7" y="7" width="10" height="10" rx="1"/>
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              {delItems.length > 1 && (
                                <button type="button" onClick={() => removeItem(idx)}
                                  className="text-red-400 hover:text-red-600 text-base leading-none">×</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={addItem}
                    className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 text-gray-400 hover:text-blue-600 rounded-lg text-sm transition-colors">
                    + Add Product
                  </button>
                </div>
              )}

              {/* ── STEP 3: Confirm & Upload ── */}
              {step === 3 && (
                <div className="space-y-6">

                  {/* Product summary */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Products to be added to stock ({delItems.filter(i => i.product_name).length} items)</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {delItems.filter(i => i.product_name).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                          <span>{item.product_name}</span>
                          <span className="font-medium">{item.quantity} {item.unit}</span>
                        </div>
                      ))}
                    </div>
                    {wizardTotalCost > 0 && (
                      <div className="flex justify-between text-sm font-semibold text-gray-900 dark:text-white border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
                        <span>Total Purchase Value</span>
                        <span>{cur}{wizardTotalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>

                  {/* Optional payment to supplier */}
                  {wizardTotalCost > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Amount Paid Now ({cur}) — optional</label>
                      <input type="number" min="0" step="0.01" max={wizardTotalCost}
                        value={initialPaymentAmount} onChange={e => setInitialPaymentAmount(e.target.value)}
                        placeholder="0 — pay the balance later"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Leave blank if paying the full amount later. You can record the balance payment anytime from the delivery's detail view.</p>
                    </div>
                  )}

                  {/* Product confirmation checkbox */}
                  <div className={`border-2 rounded-xl p-4 transition-colors ${productsConfirmed ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={productsConfirmed}
                        onChange={async e => {
                          setProductsConfirmed(e.target.checked)
                          if (e.target.checked && currentDeliveryId) await confirmProducts()
                        }}
                        className="mt-0.5 w-4 h-4 accent-green-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                        <span className="font-medium">I confirm all products listed above are physically available</span> and ready to be added to inventory.
                      </span>
                    </label>
                  </div>

                  {/* Delivery note upload — optional */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Delivery Note
                        <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-1.5">optional — image or PDF, max 10 MB</span>
                      </p>
                      {uploadedFile && (
                        <button type="button" onClick={() => { setUploadedFile(null); setUploadPreview(null) }}
                          className="text-xs text-red-400 hover:text-red-600">Remove</button>
                      )}
                    </div>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                        uploadedFile
                          ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-900/20'
                      }`}>
                      {uploadedFile ? (
                        <div className="flex items-center gap-3 justify-center">
                          {uploadPreview ? (
                            <img src={uploadPreview} alt="Delivery note" className="h-16 w-16 rounded-lg object-cover border border-green-200" />
                          ) : (
                            <div className="h-12 w-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                            </div>
                          )}
                          <div className="text-left">
                            <p className="text-sm font-medium text-green-700 dark:text-green-400">{uploadedFile.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">Click to replace</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 py-2">
                          <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Upload delivery note</p>
                          <p className="text-xs text-gray-400">JPG, PNG, JPEG, PDF · max 10 MB</p>
                        </div>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*,.pdf"
                      onChange={handleFileChange} className="hidden" />
                  </div>
                </div>
              )}
            </div>

            {/* Wizard footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl">
              {step > 1 ? (
                <button onClick={() => setStep(s => s - 1)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  ← Back
                </button>
              ) : (
                <button onClick={closeWizard}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  Cancel
                </button>
              )}
              <div className="flex-1" />
              {step === 1 && (
                <button onClick={saveStep1} disabled={savingDraft}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  {savingDraft ? 'Saving…' : 'Next: Add Products →'}
                </button>
              )}
              {step === 2 && (
                <button onClick={saveStep2} disabled={savingDraft}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  {savingDraft ? 'Saving…' : 'Next: Confirm & Upload →'}
                </button>
              )}
              {step === 3 && (
                <button
                  onClick={completeDelivery}
                  disabled={completing || !productsConfirmed}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
                  {completing ? 'Completing…' : '✓ Complete & Update Stock'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SUPPLIER DETAIL DRAWER ── */}
      {supplierDetail && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={closeSupplierDetail}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate">{supplierDetail.name}</h2>
                  {supplierDetail.contact_person && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{supplierDetail.contact_person}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={downloadSupplierStatement}
                  title="Download PDF statement"
                  className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={closeSupplierDetail}
                  className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-medium">Total Deliveries</p>
                <p className="text-sm text-gray-800 dark:text-gray-200 font-semibold">{supplierDeliveries.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-medium">Total Amount</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {cur}{supplierGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-medium">Paid Amount</p>
                <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                  {cur}{supplierPaidTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-medium">Balance Due</p>
                <p className={`text-sm font-semibold ${supplierBalanceTotal > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                  {cur}{supplierBalanceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Delivery list */}
            <div className="px-5 py-4 flex-1 overflow-y-auto">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">Delivery History</h3>

              {supplierDelLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600 dark:border-gray-400"></div>
                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading deliveries…</span>
                </div>
              ) : supplierDeliveryTotals.length === 0 ? (
                <div className="text-center py-6 text-gray-400 dark:text-gray-500">
                  <p className="text-sm">No deliveries yet for this supplier</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {supplierDeliveryTotals.map(d => (
                    <div
                      key={d.delivery_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openDelivery(d.delivery_id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDelivery(d.delivery_id) } }}
                      className="w-full px-3 py-2.5 flex items-center justify-between text-left rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {d.invoice_number ? `Invoice #${d.invoice_number}` : 'Delivery'}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[d.status]}`}>
                            {STATUS_LABEL[d.status]}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {d.delivery_date
                            ? new Date(d.delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                          {' · '}{d.items.length} item{d.items.length !== 1 ? 's' : ''}
                        </p>
                        {d.total > 0 && (
                          <p className={`text-[10px] mt-0.5 font-medium ${d.balance <= 0 ? 'text-green-600 dark:text-green-400' : d.paid > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                            {d.balance <= 0
                              ? 'Paid'
                              : d.paid > 0
                                ? `Paid ${cur}${d.paid.toLocaleString('en-IN', { maximumFractionDigits: 0 })} · ${cur}${d.balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })} due`
                                : `${cur}${d.balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })} due`}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {cur}{d.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {d.balance > 0 && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              openPaymentModal(d.delivery_id, d.invoice_number ? `Invoice #${d.invoice_number}` : 'Delivery', d.balance)
                            }}
                            className="text-[10px] px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DELIVERY DETAIL MODAL ── */}
      {(loadingDelivery || activeDelivery) && (() => {
        if (!activeDelivery) {
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl p-16 flex flex-col items-center justify-center gap-3">
                <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading delivery…</p>
              </div>
            </div>
          )
        }
        const supplierDetail = suppliers.find(s => s.supplier_id === activeDelivery.supplier_id)
        const totalCost = activeDelivery.items.reduce((sum, item) => {
          const cost = parseFloat(String(item.cost_price)) || 0
          return sum + cost * item.quantity
        }, 0)
        const paidAmount = activeDelivery.paid_amount || 0
        const balanceDue = Math.max(totalCost - paidAmount, 0)
        const deliveryLogistics = decodeDeliveryNotes(activeDelivery.notes)
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {activeDelivery.invoice_number ? `Invoice #${activeDelivery.invoice_number}` : 'Delivery'}
                      </h2>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[activeDelivery.status]}`}>
                        {STATUS_LABEL[activeDelivery.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {/* Supplier icon */}
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                      <span className="font-medium text-gray-700 dark:text-gray-300">{activeDelivery.supplier_name || '—'}</span>
                    </div>
                  </div>
                  <button onClick={() => setActiveDelivery(null)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* Meta grid */}
                <div className="grid grid-cols-3 gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Delivery Date</p>
                    <p className="font-medium text-gray-800 dark:text-gray-200">
                      {activeDelivery.delivery_date
                        ? new Date(activeDelivery.delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Invoice</p>
                    <p className="font-medium text-gray-800 dark:text-gray-200 font-mono">{activeDelivery.invoice_number || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Transport Fee</p>
                    <p className="font-medium text-gray-800 dark:text-gray-200">
                      {activeDelivery.transport_fee > 0 ? `${cur}${activeDelivery.transport_fee.toLocaleString()}` : '—'}
                    </p>
                  </div>
                  {totalCost > 0 && (
                    <div className="col-span-3 border-t border-gray-200 dark:border-gray-700 pt-3 mt-1">
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Total Purchase Value</p>
                      <p className="font-semibold text-gray-900 dark:text-white text-base">{cur}{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                  )}
                </div>

                {/* Supplier address (if available) */}
                {supplierDetail?.address && (
                  <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300 bg-blue-50/60 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3">
                    <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    <span className="leading-relaxed">{supplierDetail.address}</span>
                  </div>
                )}

                {/* Notes */}
                {deliveryLogistics.text && (
                  <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{deliveryLogistics.text}</p>
                  </div>
                )}

                {/* Payments */}
                {totalCost > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Payments</p>
                      {balanceDue > 0 && (
                        <button type="button"
                          onClick={() => openPaymentModal(activeDelivery.delivery_id, activeDelivery.invoice_number ? `Invoice #${activeDelivery.invoice_number}` : 'Delivery', balanceDue)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
                          + Record Payment
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 text-sm mb-2">
                      <div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Paid</p>
                        <p className="font-semibold text-green-600 dark:text-green-400">{cur}{paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Balance Due</p>
                        <p className={`font-semibold ${balanceDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                          {cur}{balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    {activeDelivery.payments && activeDelivery.payments.length > 0 && (
                      <div className="space-y-1">
                        {activeDelivery.payments.map(p => (
                          <div key={p.payment_id} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 px-1 group">
                            <span>
                              {p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                              {p.notes ? ` · ${p.notes}` : ''}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="font-medium text-gray-800 dark:text-gray-200">{cur}{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <button type="button" title="Remove payment"
                                onClick={() => deletePayment(p.payment_id)}
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Products table */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Products ({activeDelivery.items.length})
                  </p>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                          <tr>
                            <th className="px-3 py-2.5 text-left font-medium">Product</th>
                            <th className="px-3 py-2.5 text-left font-medium">Category</th>
                            <th className="px-3 py-2.5 text-left font-medium">Barcode</th>
                            <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                            <th className="px-3 py-2.5 text-right font-medium">Cost</th>
                            <th className="px-3 py-2.5 text-right font-medium">Selling</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {activeDelivery.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/50">
                              <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{item.product_name}</td>
                              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{item.category || '—'}</td>
                              <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono">{item.barcode || '—'}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-right">{item.quantity} {item.unit}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-right">
                                {item.cost_price ? `${cur}${parseFloat(String(item.cost_price)).toFixed(2)}` : '—'}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {item.selling_price
                                  ? <span className="text-green-700 dark:text-green-400 font-medium">{cur}{parseFloat(String(item.selling_price)).toFixed(2)}</span>
                                  : <span className="text-gray-400">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Confirmation + completed status */}
                <div className="space-y-2">
                  {activeDelivery.products_confirmed && (
                    <div className="flex items-center gap-2 text-xs bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2.5">
                      <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-green-700 dark:text-green-400 font-medium">Products confirmed</span>
                      {activeDelivery.confirmed_at && (
                        <span className="text-green-500 ml-auto">{new Date(activeDelivery.confirmed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>
                  )}
                  {activeDelivery.status === 'completed' && activeDelivery.completed_at && (
                    <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2.5">
                      <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                      <span className="text-blue-700 dark:text-blue-400 font-medium">Stock updated</span>
                      <span className="text-blue-500 ml-auto">{new Date(activeDelivery.completed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                </div>

              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl">
                {/* Delivery note pill */}
                {activeDelivery.has_delivery_note ? (
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    {activeDelivery.delivery_note_type === 'pdf' ? (
                      <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                    )}
                    <span className="truncate max-w-[160px]">{activeDelivery.delivery_note_filename}</span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500">No delivery note</span>
                )}

                <div className="flex gap-2">
                  {supplierDetail && (
                    <button type="button"
                      onClick={async () => {
                        let upi_id: string | null = null
                        try {
                          upi_id = (await getShopSettings()).upi_id || null
                        } catch {
                          upi_id = null
                        }
                        generateDeliveryTaxInvoicePDF({
                          upi_id,
                          client: {
                            client_name: client?.client_name || 'Business',
                            address: client?.address,
                            phone: client?.phone,
                            email: client?.email,
                            gstin: client?.gstin,
                          },
                          supplier: {
                            name: supplierDetail.name,
                            address: supplierDetail.address,
                            state: supplierDetail.state,
                            gst_number: supplierDetail.gst_number,
                            email: supplierDetail.email,
                            phone: supplierDetail.phone,
                            payment_terms: supplierDetail.payment_terms,
                            bank_account_name: supplierDetail.bank_account_name,
                            bank_name: supplierDetail.bank_name,
                            bank_account_number: supplierDetail.bank_account_number,
                            bank_ifsc_code: supplierDetail.bank_ifsc_code,
                          },
                          invoice_number: activeDelivery.invoice_number,
                          delivery_date: activeDelivery.delivery_date,
                          notes: deliveryLogistics.text,
                          buyer_order_no: deliveryLogistics.buyer_order_no,
                          buyer_order_date: deliveryLogistics.buyer_order_date,
                          dispatched_through: deliveryLogistics.dispatched_through,
                          destination: deliveryLogistics.destination,
                          vehicle_no: deliveryLogistics.vehicle_no,
                          lr_rr_no: deliveryLogistics.lr_rr_no,
                          items: activeDelivery.items,
                        })
                      }}
                      className="flex items-center gap-1.5 px-4 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download PDF
                    </button>
                  )}
                  {activeDelivery.status === 'draft' && (
                    <button type="button"
                      onClick={() => continueDraft(activeDelivery)}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
                      </svg>
                      Continue
                    </button>
                  )}
                  <button onClick={() => setActiveDelivery(null)}
                    className="px-4 py-1.5 bg-gray-900 dark:bg-white hover:bg-gray-700 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg text-xs font-medium transition-colors">
                    Close
                  </button>
                </div>
              </div>

            </div>
          </div>
        )
      })()}

      {/* ── RECORD PAYMENT MODAL ── */}
      {paymentTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Record Payment</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {paymentTarget.label}
                  {paymentTarget.balance > 0 && (
                    <> · <span className="text-amber-600 dark:text-amber-400 font-medium">{cur}{paymentTarget.balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} due</span></>
                  )}
                </p>
              </div>
              <button onClick={() => setPaymentTarget(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Amount ({cur}) *</label>
                <input type="number" min="0.01" step="0.01" autoFocus
                  max={paymentTarget.balance > 0 ? paymentTarget.balance : undefined}
                  value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {paymentTarget.balance > 0 && (
                  <button type="button"
                    onClick={() => setPaymentAmount(String(paymentTarget.balance.toFixed(2)))}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mt-1">
                    Pay full balance ({cur}{paymentTarget.balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
                <input value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Paid via UPI"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl">
              <button onClick={() => setPaymentTarget(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
              <button onClick={recordPayment} disabled={savingPayment}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {savingPayment ? 'Saving…' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode scanner modal — for delivery item entry */}
      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => { setShowScanner(false); setScanningRowIdx(null) }}
        onScan={handleBarcodeScan}
      />
    </DashboardLayout>
  )
}
