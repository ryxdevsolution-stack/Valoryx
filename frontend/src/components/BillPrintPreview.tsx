'use client'

import { useRef, useEffect, useState } from 'react'
import NextImage from 'next/image'
import { printBill, downloadPdf, shareWhatsApp, BillData, ClientInfo } from '@/lib/webPrintService'

// Extended types for component props (extends imported types)
interface BillDataExtended extends BillData {
  cgst?: number
  sgst?: number
  igst?: number
  customer_gstin?: string
  gst_percentage?: number
  discount_percentage?: number
  discount_amount?: number
  negotiable_amount?: number
}

interface ClientInfoExtended extends ClientInfo {
  logo_url?: string
}

interface BillPrintPreviewProps {
  bill: BillDataExtended
  clientInfo: ClientInfoExtended
  onClose: () => void
  autoPrint?: boolean
}

export default function BillPrintPreview({ bill, clientInfo, onClose, autoPrint = false }: BillPrintPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const hasAutoPrinted = useRef(false)
  const [printError, setPrintError] = useState<string | null>(null)

  // Provide default values if clientInfo is undefined
  const safeClientInfo: ClientInfoExtended = clientInfo || {
    client_name: 'Business Name',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    logo_url: ''
  }

  // Handle print via browser
  const handlePrint = () => {
    const result = printBill(bill as BillData, safeClientInfo as ClientInfo, false)
    if (result.success) {
      setPrintError(null)
      onClose()
    } else {
      setPrintError(result.message || 'Print failed')
    }
  }

  // Auto-print immediately when component mounts (if enabled)
  useEffect(() => {
    if (autoPrint && !hasAutoPrinted.current) {
      hasAutoPrinted.current = true
      handlePrint()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const seconds = date.getSeconds().toString().padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = (hours % 12 || 12).toString().padStart(2, '0')
    return `${displayHours}:${minutes}:${seconds} ${ampm}`
  }

  const totalQuantity = bill.items.reduce((sum, item) => sum + Number(item.quantity), 0)
  const totalItems = bill.items.length

  return (
    <div className="bill-print-modal-wrapper">
      {/* Screen Overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 print:hidden">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          <div className="sticky top-0 bg-indigo-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <h2 className="font-semibold">Bill Preview</h2>
                <p className="text-xs text-indigo-200">Review before printing</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-indigo-700 rounded transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-auto bg-gray-50 p-6">
            <div className="bg-white shadow-lg" style={{ maxWidth: '76mm', width: '76mm', margin: '0 auto' }}>
              <div ref={printRef} className="bill-receipt">
              {/* Star border top */}
              <div className="text-center" style={{ fontSize: '10px', letterSpacing: '-1px' }}>
                ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
              </div>

              {/* Header */}
              <div className="text-center" style={{ marginTop: '3mm', marginBottom: '3mm' }}>
                {safeClientInfo.logo_url && (
                  <div style={{ margin: '0 auto 2mm', width: '20mm', height: '20mm', position: 'relative' }}>
                    <NextImage
                      src={safeClientInfo.logo_url}
                      alt={safeClientInfo.client_name}
                      fill
                      style={{ objectFit: 'contain' }}
                      unoptimized
                    />
                  </div>
                )}
                <div style={{ fontSize: '14pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2mm', color: '#000000' }}>
                  {safeClientInfo.client_name}
                </div>
                {safeClientInfo.address && (
                  <div style={{ fontSize: '8pt', lineHeight: '1.3', marginBottom: '1mm', whiteSpace: 'pre-wrap', fontWeight: '600' }}>
                    {safeClientInfo.address}
                  </div>
                )}
                <div style={{ fontSize: '8pt', lineHeight: '1.3', fontWeight: '600' }}>
                  {safeClientInfo.gstin && <div>GSTIN: {safeClientInfo.gstin}</div>}
                </div>
                <div style={{ fontSize: '10pt', fontWeight: 'bold', marginTop: '2mm', textTransform: 'uppercase', color: '#000000', letterSpacing: '0.5px' }}>
                  {bill.type === 'gst' ? 'TAX INVOICE' : 'CASH BILL'}
                </div>
              </div>

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

              {/* Bill Info */}
              <div style={{ fontSize: '8pt', marginBottom: '2mm' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5mm' }}>
                  <span>Bill No: {bill.bill_number}</span>
                  <span><strong>Date: {formatDate(bill.created_at)}</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Time: {formatTime(bill.created_at)}</span>
                  <span>Mode: {bill.type === 'gst' ? 'GST' : 'NON-GST'}</span>
                </div>
                {bill.customer_name && (
                  <div style={{ marginTop: '2mm', borderTop: '1px solid #ccc', paddingTop: '1mm' }}>
                    <div><strong>Customer:</strong> {bill.customer_name}</div>
                    {bill.type === 'gst' && bill.customer_gstin && <div><strong>GSTIN:</strong> {bill.customer_gstin}</div>}
                  </div>
                )}
              </div>

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

              {/* Items Header */}
              <div style={{ fontSize: '9pt', display: 'flex', justifyContent: 'space-between', marginBottom: '1mm', fontWeight: 'bold', flexWrap: 'nowrap', color: '#000000' }}>
                <span style={{ flex: '1', minWidth: '0', overflow: 'hidden', fontWeight: 'bold' }}>Item</span>
                <span style={{ width: '6mm', textAlign: 'center', flexShrink: 0, fontWeight: 'bold' }}>Qty</span>
                <span style={{ width: '10mm', textAlign: 'right', flexShrink: 0, fontWeight: 'bold' }}>MRP</span>
                <span style={{ width: '10mm', textAlign: 'right', flexShrink: 0, fontWeight: 'bold' }}>Rate</span>
                <span style={{ width: '12mm', textAlign: 'right', flexShrink: 0, fontWeight: 'bold' }}>Amt</span>
              </div>

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '1mm 0' }}></div>

              {/* Items */}
              {bill.items.map((item, index) => (
                <div key={index} style={{ marginBottom: '2mm' }}>
                  <div style={{ fontSize: '10pt', fontWeight: 'bold', textTransform: 'capitalize', marginBottom: '0.5mm', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#000000' }}>
                    {item.product_name.length > 24 ? item.product_name.substring(0, 22) + '..' : item.product_name}
                  </div>
                  <div style={{ fontSize: '9pt', display: 'flex', justifyContent: 'space-between', flexWrap: 'nowrap', color: '#000000' }}>
                    <span style={{ flex: '1', minWidth: '0' }}></span>
                    <span style={{ width: '6mm', textAlign: 'center', flexShrink: 0, fontWeight: '600' }}>{item.quantity}</span>
                    <span style={{ width: '10mm', textAlign: 'right', flexShrink: 0, fontWeight: '600' }}>
                      {item.mrp ? Math.round(Number(item.mrp)) : '-'}
                    </span>
                    <span style={{ width: '10mm', textAlign: 'right', flexShrink: 0, fontWeight: '600' }}>{Math.round(Number(item.rate))}</span>
                    <span style={{ width: '12mm', textAlign: 'right', fontWeight: 'bold', flexShrink: 0 }}>{Math.round(Number(item.amount))}</span>
                  </div>
                </div>
              ))}

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

              {/* Items summary */}
              <div style={{ fontSize: '8pt', display: 'flex', justifyContent: 'space-between', marginBottom: '1mm' }}>
                <span>Items: {totalItems}   Qty: {totalQuantity}</span>
              </div>

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

              {/* Subtotal, GST, and Discount */}
              <div style={{ fontSize: '9pt', marginBottom: '2mm', paddingLeft: '1mm', paddingRight: '1mm' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1mm' }}>
                  <span style={{ fontWeight: '600' }}>Sub Total</span>
                  <span style={{ fontWeight: 'bold' }}>₹{Number(bill?.subtotal ?? 0).toFixed(2)}</span>
                </div>

                {bill.type === 'gst' && bill.gst_amount && Number(bill.gst_amount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1mm' }}>
                    <span style={{ fontWeight: '600' }}>GST ({bill.gst_percentage}%)</span>
                    <span style={{ fontWeight: 'bold' }}>₹{Number(bill.gst_amount).toFixed(2)}</span>
                  </div>
                )}

                {bill.negotiable_amount && Number(bill.negotiable_amount) > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1mm' }}>
                    <span style={{ fontWeight: '600', color: '#2e7d32' }}>Negotiated Price</span>
                    <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>₹{Number(bill.negotiable_amount).toFixed(2)}</span>
                  </div>
                ) : bill.discount_amount && Number(bill.discount_amount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1mm' }}>
                    <span style={{ fontWeight: '600' }}>Discount ({bill.discount_percentage}%)</span>
                    <span style={{ fontWeight: 'bold', color: '#d32f2f' }}>-₹{Number(bill.discount_amount).toFixed(2)}</span>
                  </div>
                )}

              </div>

              {/* Grand Total */}
              <div style={{ borderTop: '3px solid #000', borderBottom: '3px solid #000', padding: '3mm 1mm', marginBottom: '2mm', background: '#f0f0f0' }}>
                <div style={{ fontSize: '12pt', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', letterSpacing: '0.3px', color: '#000000' }}>
                  <span style={{ fontWeight: 'bold' }}>GRAND TOTAL</span>
                  <span style={{ fontSize: '14pt', fontWeight: 'bold' }}>₹{(() => {
                    const baseAmount = Number(bill.type === 'gst' ? bill.final_amount : bill.total_amount);
                    const discountAmt = bill.discount_amount && Number(bill.discount_amount) > 0 ? Number(bill.discount_amount) : 0;
                    const negotiableAmt = bill.negotiable_amount && Number(bill.negotiable_amount) > 0 ? Number(bill.negotiable_amount) : 0;

                    // If negotiable amount exists, use it directly (it's the final price after negotiation)
                    if (negotiableAmt > 0) {
                      return Math.round(negotiableAmt);
                    }

                    // Otherwise subtract discount from base amount
                    return Math.round(baseAmount - discountAmt);
                  })()}</span>
                </div>
              </div>

              {/* GST Breakdown for Tax Invoice - Compact */}
              {bill.type === 'gst' && bill.items.some(item => Number(item.gst_percentage) > 0) && (
                <>
                  <div style={{ fontSize: '8pt', marginTop: '1mm' }}>
                    {(() => {
                      const gstGroups = bill.items.reduce((acc, item) => {
                        const gstRate = Number(item.gst_percentage) || 0
                        if (gstRate > 0) {
                          if (!acc[gstRate]) acc[gstRate] = { taxable: 0 }
                          acc[gstRate].taxable += Number(item.amount) || 0
                        }
                        return acc
                      }, {} as Record<number, { taxable: number }>)

                      let totalGst = 0
                      const parts = Object.entries(gstGroups).map(([rate, data]) => {
                        const gstRate = parseFloat(rate)
                        const gstAmt = (data.taxable * gstRate) / 100
                        totalGst += gstAmt
                        return `${gstRate}%: ₹${gstAmt.toFixed(2)}`
                      })

                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>GST ({parts.join(', ')})</span>
                          <span><strong>₹{totalGst.toFixed(2)}</strong></span>
                        </div>
                      )
                    })()}
                  </div>
                </>
              )}

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

              {/* Payment Info */}
              <div style={{ fontSize: '8pt', marginBottom: '2mm', paddingLeft: '1mm', paddingRight: '1mm' }}>
                <div style={{ textAlign: 'center', marginBottom: '1mm' }}><strong>Payment Mode:</strong></div>
                {(() => {
                  try {
                    // Try to parse as JSON (split payment)
                    const payments = JSON.parse(bill.payment_type)
                    if (Array.isArray(payments) && payments.length > 0) {
                      return payments.map((payment: any, index: number) => (
                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '3mm', paddingRight: '3mm', marginBottom: '0.5mm' }}>
                          <span>{payment.payment_type}</span>
                          <span>₹{parseFloat(payment.amount).toFixed(2)}</span>
                        </div>
                      ))
                    }
                  } catch {
                    // If not JSON, display as plain text
                    return (
                      <div style={{ textAlign: 'center' }}>
                        {bill.payment_type}
                      </div>
                    )
                  }
                })()}
              </div>

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

              {/* Footer */}
              <div style={{ textAlign: 'center', marginTop: '3mm' }}>
                {/* Today's Savings - Shows MRP savings + Negotiation savings */}
                {(() => {
                  const mrpSavings = bill.items.reduce((sum, item) => {
                    const mrpAmt = Number(item.mrp) ? Number(item.mrp) * Number(item.quantity) : 0
                    const rateAmt = Number(item.rate) * Number(item.quantity)
                    return sum + Math.max(0, mrpAmt - rateAmt)
                  }, 0)

                  // Calculate negotiation savings if applicable
                  const negotiationSavings = bill.discount_amount && Number(bill.discount_amount) > 0 ? Number(bill.discount_amount) : 0
                  const totalSavings = mrpSavings + negotiationSavings

                  return totalSavings > 0 && (
                    <div style={{
                      border: '2px solid #000',
                      padding: '2mm',
                      marginBottom: '3mm',
                      background: '#ffffff'
                    }}>
                      <div style={{
                        fontSize: '9pt',
                        fontWeight: 'bold',
                        marginBottom: '1mm',
                        letterSpacing: '0.5px'
                      }}>
                        TODAY&apos;S SAVINGS
                      </div>
                      <div style={{
                        fontSize: '16pt',
                        fontWeight: 'bold',
                        letterSpacing: '1px'
                      }}>
                        ₹{totalSavings.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '6pt', marginTop: '1mm', fontStyle: 'italic' }}>
                        {mrpSavings > 0 && negotiationSavings > 0 ? 'You saved on MRP + Negotiation!' :
                         mrpSavings > 0 ? 'You saved on MRP!' : 'You saved through negotiation!'}
                      </div>
                    </div>
                  )
                })()}
                {/* No Exchange Policy */}
                <div style={{
                  fontSize: '9pt',
                  fontWeight: 'bold',
                  marginBottom: '2mm',
                  padding: '1.5mm 0',
                  borderTop: '1px dashed #000',
                  borderBottom: '1px dashed #000'
                }}>
                  Sorry, No Exchange / No Refund
                </div>
                <div style={{ fontSize: '9pt', fontWeight: 'bold', letterSpacing: '1px' }}>
                  ★★★ THANK YOU VISIT AGAIN ★★★
                </div>
              </div>

              {/* Star border bottom */}
              <div className="text-center" style={{ fontSize: '10px', letterSpacing: '-1px', marginTop: '2mm' }}>
                ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
              </div>
              </div>
            </div>
          </div>

          {/* Print Button - Fixed at bottom */}
          <div className="border-t border-gray-200 p-4 bg-white print:hidden">
            {/* Error Display */}
            {printError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{printError}</span>
                </div>
              </div>
            )}

            {/* Print Options */}
            <div className="space-y-2">
              {/* Primary: Browser Print */}
              <button
                type="button"
                onClick={handlePrint}
                className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>Print Bill</span>
              </button>

              {/* Secondary Options Row */}
              <div className="grid grid-cols-2 gap-2">
                {/* Download/Save as PDF */}
                <button
                  type="button"
                  onClick={() => {
                    const result = downloadPdf(bill as BillData, safeClientInfo as ClientInfo, false)
                    if (result.success) {
                      setPrintError(null)
                    } else {
                      setPrintError(result.message)
                    }
                  }}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Save PDF
                </button>

                {/* Share via WhatsApp */}
                <button
                  type="button"
                  onClick={() => {
                    const result = shareWhatsApp(bill as BillData, safeClientInfo as ClientInfo)
                    if (!result.success) {
                      setPrintError(result.message)
                    }
                  }}
                  className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Screen preview styling - Optimized for 80mm thermal printers */}
      <style dangerouslySetInnerHTML={{__html: `
        .bill-receipt {
          font-family: 'Courier New', Courier, monospace;
          max-width: 76mm;
          width: 76mm;
          margin: 0 auto;
          background: white;
          color: #000000;
          line-height: 1.4;
          padding: 2mm;
          box-sizing: border-box;
          font-weight: 600;
          -webkit-font-smoothing: none;
          -moz-osx-font-smoothing: unset;
          text-rendering: geometricPrecision;
          overflow-x: hidden;
        }

        .bill-receipt * {
          color: #000000 !important;
          box-sizing: border-box;
          font-weight: 600 !important;
        }

        .bill-receipt strong,
        .bill-receipt b {
          font-weight: 700 !important;
        }

        .bill-receipt table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        /* Ensure all text elements are clearly visible */
        .bill-receipt div,
        .bill-receipt span,
        .bill-receipt p {
          color: #000000 !important;
          font-weight: 600 !important;
        }

        @media print {
          @page {
            size: 80mm auto;
            margin: 0mm 1.5mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            box-sizing: border-box !important;
          }
          .bill-receipt {
            width: 77mm !important;
            max-width: 77mm !important;
            margin: 0 auto !important;
            padding: 1mm !important;
            box-sizing: border-box !important;
            font-weight: 700 !important;
            color: #000000 !important;
            overflow-x: hidden !important;
            line-height: 1.2 !important;
            font-family: 'Courier New', Courier, monospace !important;
            -webkit-font-smoothing: none !important;
            -moz-osx-font-smoothing: unset !important;
            text-rendering: geometricPrecision !important;
          }
          .bill-receipt * {
            color: #000000 !important;
            font-weight: 700 !important;
            -webkit-font-smoothing: none !important;
          }
          .bill-receipt strong,
          .bill-receipt b {
            font-weight: 900 !important;
          }
          .bill-receipt div,
          .bill-receipt span,
          .bill-receipt p {
            color: #000000 !important;
            font-weight: 700 !important;
          }
        }

        /* Screen-only preview enhancements */
        @media screen {
          .bill-receipt {
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            border: 1px solid #e5e7eb;
          }
        }
      `}} />
    </div>
  )
}
