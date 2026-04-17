import { useState, useEffect, useCallback } from 'react'
import { useClient } from '@/contexts/ClientContext'
import DashboardLayout from '@/components/DashboardLayout'
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Save,
  Store,
  X,
  Lock,
} from 'lucide-react'
import { getShopSettings, updateShopSettings } from '@/services/shopSettingsService'
import type { ShopSettings } from '@/services/shopSettingsService'
import { useMobileDetect } from '@/hooks/useMobileDetect'
import bluetoothPrinterService from '@/services/bluetoothPrinterService'
import { QRCodeSVG } from 'qrcode.react'

const RECEIPT_FOOTER_MAX = 60

interface FormState {
  shop_name: string
  address1: string
  address2: string
  phone: string
  gst_number: string
  upi_id: string
  receipt_footer: string
  points_per_100: string
  // Apparel label defaults (v13)
  label_importer_name: string
  label_importer_address: string
  label_origin_country: string
  label_care_phone: string
  label_care_email: string
}

const EMPTY_FORM: FormState = {
  shop_name: '',
  address1: '',
  address2: '',
  phone: '',
  gst_number: '',
  upi_id: '',
  receipt_footer: '',
  points_per_100: '0',
  label_importer_name: '',
  label_importer_address: '',
  label_origin_country: 'India',
  label_care_phone: '',
  label_care_email: '',
}

function settingsToForm(s: ShopSettings): FormState {
  return {
    shop_name: s.shop_name || '',
    address1: s.address1 || '',
    address2: s.address2 || '',
    phone: s.phone || '',
    gst_number: s.gst_number || '',
    upi_id: s.upi_id || '',
    receipt_footer: s.receipt_footer || '',
    points_per_100: String(s.points_per_100 || 0),
    label_importer_name: s.label_importer_name || '',
    label_importer_address: s.label_importer_address || '',
    label_origin_country: s.label_origin_country || 'India',
    label_care_phone: s.label_care_phone || '',
    label_care_email: s.label_care_email || '',
  }
}

// ─── Receipt Preview Component ─────────────────────────────────────

function ReceiptPreview({ form }: { form: FormState }) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Store className="w-4 h-4" />
        Receipt Preview
      </h3>

      {/* Thermal receipt simulation */}
      <div className="mx-auto max-w-[220px] bg-white border border-dashed border-gray-300 rounded-lg p-4 font-mono text-[11px] leading-relaxed text-gray-800 shadow-inner">
        {/* Shop name */}
        <p className="text-center font-bold text-[13px] break-words">
          {form.shop_name || 'Shop Name'}
        </p>

        {/* Address */}
        {(form.address1 || form.address2) && (
          <div className="text-center text-[10px] mt-0.5 break-words">
            {form.address1 && <p>{form.address1}</p>}
            {form.address2 && <p>{form.address2}</p>}
          </div>
        )}

        {/* Phone */}
        {form.phone && (
          <p className="text-center text-[10px] mt-0.5">
            Tel: {form.phone}
          </p>
        )}

        {/* GST */}
        {form.gst_number && (
          <p className="text-center text-[10px] mt-0.5">
            GSTIN: {form.gst_number}
          </p>
        )}

        {/* Divider */}
        <p className="text-center my-1.5 text-gray-400 select-none" aria-hidden="true">
          {'- '.repeat(14)}
        </p>

        {/* Date/time + bill no */}
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>{dateStr}</span>
          <span>{timeStr}</span>
        </div>
        <p className="text-[10px] text-gray-500 mb-1">Bill#: INV-0001</p>

        {/* Divider */}
        <p className="text-center text-gray-400 select-none" aria-hidden="true">
          {'- '.repeat(14)}
        </p>

        {/* Sample items */}
        <div className="space-y-0.5 my-1">
          <div className="flex justify-between">
            <span>Sample Item 1</span>
            <span>250.00</span>
          </div>
          <div className="flex justify-between">
            <span>Sample Item 2</span>
            <span>150.00</span>
          </div>
        </div>

        {/* Divider */}
        <p className="text-center text-gray-400 select-none" aria-hidden="true">
          {'- '.repeat(14)}
        </p>

        {/* Total */}
        <div className="flex justify-between font-bold text-[12px]">
          <span>TOTAL</span>
          <span>400.00</span>
        </div>

        {/* UPI QR Code */}
        {form.upi_id && (
          <>
            <p className="text-center my-1.5 text-gray-400 select-none" aria-hidden="true">
              {'- '.repeat(14)}
            </p>
            <p className="text-center text-[10px] font-bold mb-1">Scan to Pay</p>
            <div className="flex justify-center my-1">
              <QRCodeSVG
                value={`upi://pay?pa=${form.upi_id}&pn=${encodeURIComponent(form.shop_name || 'Shop')}`}
                size={80}
                level="M"
              />
            </div>
            <p className="text-center text-[9px] text-gray-500">
              UPI: {form.upi_id}
            </p>
          </>
        )}

        {/* Footer */}
        {form.receipt_footer && (
          <>
            <p className="text-center my-1.5 text-gray-400 select-none" aria-hidden="true">
              {'- '.repeat(14)}
            </p>
            <p className="text-center text-[10px] italic break-words">
              {form.receipt_footer}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function ShopSettingsPage() {
  const { user } = useClient()

  const { isMobile, supportsWebBluetooth } = useMobileDetect()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Bluetooth printer state
  const [btConnected, setBtConnected] = useState(false)
  const [btDeviceName, setBtDeviceName] = useState<string | null>(null)
  const [btLoading, setBtLoading] = useState<'idle' | 'searching' | 'connecting' | 'printing'>('idle')
  const [btError, setBtError] = useState<string | null>(null)

  const canEdit = user?.role === 'owner' || user?.role === 'manager' || user?.role === 'admin' || user?.role === 'super admin'

  // ─── Fetch settings on mount ────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setFetchError(null)
        const settings = await getShopSettings()
        if (!cancelled) {
          setForm(settingsToForm(settings))
        }
      } catch (err: any) {
        if (!cancelled) {
          setFetchError(err.response?.data?.error || 'Failed to load shop settings')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ─── Handlers ───────────────────────────────────────────────────

  const handleChange = useCallback(
    (field: keyof FormState) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = e.target.value
        // Enforce receipt_footer max length
        if (field === 'receipt_footer' && value.length > RECEIPT_FOOTER_MAX) return
        setForm((prev) => ({ ...prev, [field]: value }))
      },
    []
  )

  const handleSave = async () => {
    if (!canEdit) return

    // Basic validation
    if (!form.shop_name.trim()) {
      setMessage({ type: 'error', text: 'Shop name is required' })
      return
    }
    if (!form.address1.trim()) {
      setMessage({ type: 'error', text: 'Address line 1 is required' })
      return
    }
    if (!form.phone.trim()) {
      setMessage({ type: 'error', text: 'Phone number is required' })
      return
    }

    try {
      setSaving(true)
      const updated = await updateShopSettings({
        shop_name: form.shop_name.trim(),
        address1: form.address1.trim(),
        address2: form.address2.trim(),
        phone: form.phone.trim(),
        gst_number: form.gst_number.trim(),
        upi_id: form.upi_id.trim(),
        receipt_footer: form.receipt_footer.trim(),
        points_per_100: parseInt(form.points_per_100) || 0,
        label_importer_name: form.label_importer_name.trim(),
        label_importer_address: form.label_importer_address.trim(),
        label_origin_country: form.label_origin_country.trim() || 'India',
        label_care_phone: form.label_care_phone.trim(),
        label_care_email: form.label_care_email.trim(),
      })
      setForm(settingsToForm(updated))
      setMessage({ type: 'success', text: 'Shop settings saved successfully' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save shop settings' })
    } finally {
      setSaving(false)
    }
  }

  // ─── Input helper ───────────────────────────────────────────────

  const inputClasses =
    'w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent outline-none transition-shadow disabled:opacity-60 disabled:cursor-not-allowed'

  const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

  // ─── Loading state ──────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    )
  }

  // ─── Fetch error state ──────────────────────────────────────────

  if (fetchError) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
            <p className="text-gray-600 dark:text-gray-400">{fetchError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-xl hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="h-[calc(100dvh-4rem)] md:h-screen flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:py-4 flex-shrink-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Store className="w-6 h-6" />
              Shop Settings
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Configure your shop display and receipt settings
            </p>
          </div>
          {!canEdit && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs font-medium">
              <Lock className="w-3.5 h-3.5" />
              View only
            </div>
          )}
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`flex items-center gap-3 p-4 rounded-xl mx-4 mb-4 flex-shrink-0 ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            )}
            <p
              className={
                message.type === 'success'
                  ? 'text-green-700 dark:text-green-300 text-sm'
                  : 'text-red-700 dark:text-red-300 text-sm'
              }
            >
              {message.text}
            </p>
            <button type="button" onClick={() => setMessage(null)} className="ml-auto" aria-label="Dismiss">
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
            </button>
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 px-3 sm:px-4 pb-4 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
          {/* Left Column — Form */}
          <div
            className="lg:col-span-2 space-y-6 lg:overflow-y-auto lg:pr-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* Shop Information Card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                Shop Information
              </h3>

              <div className="space-y-4">
                {/* Shop Name */}
                <div>
                  <label htmlFor="shop_name" className={labelClasses}>
                    Shop Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="shop_name"
                    type="text"
                    value={form.shop_name}
                    onChange={handleChange('shop_name')}
                    disabled={!canEdit}
                    placeholder="Your shop name"
                    className={inputClasses}
                    required
                  />
                </div>

                {/* Address Line 1 */}
                <div>
                  <label htmlFor="address1" className={labelClasses}>
                    Address Line 1 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="address1"
                    type="text"
                    value={form.address1}
                    onChange={handleChange('address1')}
                    disabled={!canEdit}
                    placeholder="Street address, building number"
                    className={inputClasses}
                    required
                  />
                </div>

                {/* Address Line 2 */}
                <div>
                  <label htmlFor="address2" className={labelClasses}>
                    Address Line 2
                  </label>
                  <input
                    id="address2"
                    type="text"
                    value={form.address2}
                    onChange={handleChange('address2')}
                    disabled={!canEdit}
                    placeholder="City, state, pincode"
                    className={inputClasses}
                  />
                </div>

                {/* Phone Number */}
                <div>
                  <label htmlFor="phone" className={labelClasses}>
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange('phone')}
                    disabled={!canEdit}
                    placeholder="+91 98765 43210"
                    className={inputClasses}
                    required
                  />
                </div>

                {/* GST Number + UPI ID — side by side on desktop */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="gst_number" className={labelClasses}>
                      GST Number
                    </label>
                    <input
                      id="gst_number"
                      type="text"
                      value={form.gst_number}
                      onChange={handleChange('gst_number')}
                      disabled={!canEdit}
                      placeholder="22AAAAA0000A1Z5"
                      className={inputClasses}
                    />
                  </div>

                  <div>
                    <label htmlFor="upi_id" className={labelClasses}>
                      UPI ID
                    </label>
                    <input
                      id="upi_id"
                      type="text"
                      value={form.upi_id}
                      onChange={handleChange('upi_id')}
                      disabled={!canEdit}
                      placeholder="yourshop@upi"
                      className={inputClasses}
                    />
                  </div>
                </div>

                {/* Receipt Footer */}
                <div>
                  <label htmlFor="receipt_footer" className={labelClasses}>
                    Receipt Footer
                  </label>
                  <textarea
                    id="receipt_footer"
                    value={form.receipt_footer}
                    onChange={handleChange('receipt_footer')}
                    disabled={!canEdit}
                    placeholder="Thank you for visiting!"
                    rows={2}
                    maxLength={RECEIPT_FOOTER_MAX}
                    className={`${inputClasses} resize-none`}
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">
                    {form.receipt_footer.length}/{RECEIPT_FOOTER_MAX}
                  </p>
                </div>
              </div>

              {/* Apparel Label Defaults */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Apparel Label Defaults</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Used on 50×100mm hang-tags when a product doesn't set its own importer / care details. Legal Metrology compliance is your responsibility — verify these match your import paperwork.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="label_importer_name" className={labelClasses}>Importer / Marketed By</label>
                    <input
                      id="label_importer_name"
                      type="text"
                      value={form.label_importer_name}
                      onChange={handleChange('label_importer_name')}
                      disabled={!canEdit}
                      placeholder="e.g. Valoryx Retail Pvt Ltd"
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label htmlFor="label_origin_country" className={labelClasses}>Country of Origin</label>
                    <input
                      id="label_origin_country"
                      type="text"
                      value={form.label_origin_country}
                      onChange={handleChange('label_origin_country')}
                      disabled={!canEdit}
                      placeholder="India"
                      className={inputClasses}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="label_importer_address" className={labelClasses}>Importer Address</label>
                    <textarea
                      id="label_importer_address"
                      value={form.label_importer_address}
                      onChange={handleChange('label_importer_address')}
                      disabled={!canEdit}
                      placeholder="City, PIN code"
                      rows={2}
                      className={`${inputClasses} resize-none`}
                    />
                  </div>
                  <div>
                    <label htmlFor="label_care_phone" className={labelClasses}>Consumer Care Phone</label>
                    <input
                      id="label_care_phone"
                      type="tel"
                      value={form.label_care_phone}
                      onChange={handleChange('label_care_phone')}
                      disabled={!canEdit}
                      placeholder="1800-123-456"
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label htmlFor="label_care_email" className={labelClasses}>Consumer Care Email</label>
                    <input
                      id="label_care_email"
                      type="email"
                      value={form.label_care_email}
                      onChange={handleChange('label_care_email')}
                      disabled={!canEdit}
                      placeholder="care@yourshop.in"
                      className={inputClasses}
                    />
                  </div>
                </div>
              </div>

              {/* Loyalty Points */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Loyalty Points</h3>
                <div>
                  <label htmlFor="points_per_100" className={labelClasses}>
                    Points per ₹100 spent
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="points_per_100"
                      type="number"
                      min="0"
                      max="100"
                      value={form.points_per_100}
                      onChange={handleChange('points_per_100')}
                      disabled={!canEdit}
                      placeholder="0"
                      className={`${inputClasses} w-32`}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {parseInt(form.points_per_100) > 0
                        ? `Customer earns ${form.points_per_100} point${parseInt(form.points_per_100) !== 1 ? 's' : ''} for every ₹100 spent`
                        : 'Set to 0 to disable loyalty points'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              {canEdit && (
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bluetooth Printer Section (mobile only) */}
          {supportsWebBluetooth && (
            <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Bluetooth Printer</h3>

              {/* Connection Status */}
              <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${btConnected ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {btConnected ? `Connected to ${btDeviceName || 'Printer'}` : 'No printer connected'}
                  </p>
                  {btConnected && bluetoothPrinterService.connectedDevice?.id && (
                    <p className="text-xs text-gray-500 font-mono truncate">{bluetoothPrinterService.connectedDevice.id}</p>
                  )}
                </div>
              </div>

              {/* Error */}
              {btError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  {btError}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={btLoading !== 'idle'}
                  onClick={async () => {
                    setBtError(null)
                    setBtLoading('searching')
                    try {
                      const device = await bluetoothPrinterService.requestDevice()
                      if (!device) { setBtLoading('idle'); return }
                      setBtLoading('connecting')
                      const ok = await bluetoothPrinterService.connect(device)
                      if (ok) {
                        setBtConnected(true)
                        setBtDeviceName(device.name || 'Printer')
                      } else {
                        setBtError('Failed to connect to printer')
                      }
                    } catch (err) {
                      setBtError((err as Error).message || 'Pairing cancelled')
                    }
                    setBtLoading('idle')
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-90 disabled:opacity-50 transition"
                >
                  {btLoading === 'searching' ? 'Searching...' : btLoading === 'connecting' ? 'Connecting...' : 'Pair Printer'}
                </button>

                {btConnected && (
                  <>
                    <button
                      type="button"
                      disabled={btLoading !== 'idle'}
                      onClick={async () => {
                        setBtLoading('printing')
                        try {
                          await bluetoothPrinterService.printReceipt({
                            shopName: form.shop_name || 'Test Shop',
                            address1: form.address1 || '123 Test St',
                            phone: form.phone || '0000000000',
                            gstNumber: form.gst_number,
                            billNumber: 'TEST',
                            date: new Date().toLocaleDateString('en-IN'),
                            time: new Date().toLocaleTimeString('en-IN', { hour12: true }),
                            paymentMethod: 'Cash',
                            items: [{ name: 'Test Item', quantity: 1, rate: 100, amount: 100 }],
                            subtotal: 100,
                            grandTotal: 100,
                            footerText: form.receipt_footer || 'Thank you!',
                          })
                        } catch (err) {
                          setBtError('Test print failed: ' + (err as Error).message)
                        }
                        setBtLoading('idle')
                      }}
                      className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      {btLoading === 'printing' ? 'Printing...' : 'Test Print'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await bluetoothPrinterService.disconnect()
                        setBtConnected(false)
                        setBtDeviceName(null)
                      }}
                      className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>

              {!bluetoothPrinterService.isSupported() && (
                <p className="mt-3 text-xs text-gray-500">Bluetooth printing requires Chrome or Edge on Android.</p>
              )}
            </div>
          )}

          {/* Right Column — Receipt Preview */}
          <div
            className="lg:col-span-1 lg:overflow-y-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="sticky top-0">
              <ReceiptPreview form={form} />
            </div>
          </div>
        </div>
      </div>

      {/* Hide scrollbar CSS */}
      <style>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </DashboardLayout>
  )
}
