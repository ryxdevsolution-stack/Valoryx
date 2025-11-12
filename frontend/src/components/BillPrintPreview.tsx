'use client'

import { useRef, useEffect } from 'react'
import { useReactToPrint } from 'react-to-print'

interface BillItem {
  product_name: string
  quantity: number
  rate: number
  gst_percentage?: number
  amount: number
  item_code?: string
  mrp?: number
  cost_price?: number
}

interface BillData {
  bill_number: number
  customer_name?: string
  customer_phone?: string
  items: BillItem[]
  subtotal: number
  discount_percentage?: number
  discount_amount?: number
  gst_amount?: number
  final_amount: number
  total_amount: number
  payment_type: string
  created_at: string
  type: 'gst' | 'non-gst'
  cgst?: number
  sgst?: number
  igst?: number
}

interface ClientInfo {
  client_name: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
  logo_url?: string
}

interface BillPrintPreviewProps {
  bill: BillData
  clientInfo: ClientInfo
  onClose: () => void
  autoPrint?: boolean
}

export default function BillPrintPreview({ bill, clientInfo, onClose, autoPrint = false }: BillPrintPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const hasAutoPrinted = useRef(false)

  // Provide default values if clientInfo is undefined
  const safeClientInfo: ClientInfo = clientInfo || {
    client_name: 'Business Name',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    logo_url: ''
  }

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Bill_${bill.bill_number}`,
    pageStyle: `
      @page {
        size: 80mm auto;
        margin: 0mm;
      }
      @media print {
        html, body {
          width: 80mm;
          margin: 0;
          padding: 0;
          background: white;
        }
        body {
          width: 80mm !important;
          min-height: auto !important;
        }
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
      }
    `,
    onBeforePrint: () => {
      console.log('Starting print...')
      return Promise.resolve()
    },
    onAfterPrint: () => {
      console.log('Print completed')
    },
  })

  // Auto-trigger print when component mounts
  useEffect(() => {
    if (autoPrint && !hasAutoPrinted.current) {
      hasAutoPrinted.current = true
      // Small delay to ensure the component is fully rendered
      const timer = setTimeout(() => {
        handlePrint()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [autoPrint])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const day = date.getDate().toString().padStart(2, '0')
    const month = date.getMonth() + 1
    const year = date.getFullYear()
    return `${day}-${month.toString().padStart(2, '0')}-${year}`
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).toUpperCase()
  }

  const totalQuantity = bill.items.reduce((sum, item) => sum + item.quantity, 0)
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
            <div className="bg-white shadow-lg" style={{ maxWidth: '80mm', margin: '0 auto' }}>
              <div ref={printRef} className="bill-receipt">
              {/* Star border top */}
              <div className="text-center" style={{ fontSize: '10px', letterSpacing: '-1px' }}>
                ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
              </div>

              {/* Header */}
              <div className="text-center" style={{ marginTop: '3mm', marginBottom: '3mm' }}>
                {safeClientInfo.logo_url && (
                  <div style={{ margin: '0 auto 2mm', width: '20mm', height: '20mm' }}>
                    <img
                      src={safeClientInfo.logo_url}
                      alt={safeClientInfo.client_name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                )}
                <div style={{ fontSize: '12pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1mm' }}>
                  {safeClientInfo.client_name}
                </div>
                {safeClientInfo.address && (
                  <div style={{ fontSize: '7pt', lineHeight: '1.2', marginBottom: '1mm', whiteSpace: 'pre-wrap' }}>
                    {safeClientInfo.address}
                  </div>
                )}
                <div style={{ fontSize: '7pt', lineHeight: '1.3' }}>
                  {safeClientInfo.phone && <div>Ph: {safeClientInfo.phone}</div>}
                  {safeClientInfo.gstin && <div>GSTIN: {safeClientInfo.gstin}</div>}
                </div>
                <div style={{ fontSize: '9pt', fontWeight: 'bold', marginTop: '2mm', textTransform: 'uppercase' }}>
                  {bill.type === 'gst' ? 'TAX INVOICE' : 'CASH BILL'}
                </div>
              </div>

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

              {/* Bill Info */}
              <div style={{ fontSize: '7pt', marginBottom: '2mm' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5mm' }}>
                  <span>Bill No  : {bill.bill_number}</span>
                  <span><strong>Date  : {formatDate(bill.created_at)}</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Time : {formatTime(bill.created_at)}</span>
                  <span>Mode : {bill.type === 'gst' ? 'GST' : 'NON-GST'}</span>
                </div>
                {bill.customer_name && (
                  <div style={{ marginTop: '2mm', borderTop: '1px solid #ccc', paddingTop: '1mm' }}>
                    <div><strong>Customer:</strong> {bill.customer_name}</div>
                    {bill.customer_phone && <div><strong>Phone:</strong> {bill.customer_phone}</div>}
                  </div>
                )}
              </div>

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

              {/* Items Header */}
              <div style={{ fontSize: '7pt', display: 'flex', justifyContent: 'space-between', marginBottom: '1mm', fontWeight: 'bold' }}>
                <span style={{ flex: '1', minWidth: '0' }}>Description</span>
                <span style={{ width: '8mm', textAlign: 'center' }}>Qty</span>
                <span style={{ width: '13mm', textAlign: 'right' }}>MRP</span>
                <span style={{ width: '13mm', textAlign: 'right' }}>Price</span>
                <span style={{ width: '15mm', textAlign: 'right' }}>Amt</span>
              </div>

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '1mm 0' }}></div>

              {/* Items */}
              {bill.items.map((item, index) => (
                <div key={index} style={{ marginBottom: '2mm' }}>
                  <div style={{ fontSize: '8pt', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.5mm' }}>
                    {item.product_name}
                  </div>
                  <div style={{ fontSize: '7pt', display: 'flex', justifyContent: 'space-between', paddingLeft: '5mm' }}>
                    <span style={{ flex: '1' }}></span>
                    <span style={{ width: '8mm', textAlign: 'center' }}>{item.quantity}</span>
                    <span style={{ width: '13mm', textAlign: 'right' }}>
                      {item.mrp ? parseFloat(String(item.mrp)).toFixed(2) : '-'}
                    </span>
                    <span style={{ width: '13mm', textAlign: 'right' }}>{parseFloat(String(item.rate)).toFixed(2)}</span>
                    <span style={{ width: '15mm', textAlign: 'right', fontWeight: 'bold' }}>{item.amount.toFixed(2)}</span>
                  </div>
                </div>
              ))}

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

              {/* Items summary */}
              <div style={{ fontSize: '7pt', display: 'flex', justifyContent: 'space-between', marginBottom: '2mm' }}>
                <span>Items :{totalItems}  Total Qty : {totalQuantity}</span>
                <span style={{ fontWeight: 'bold' }}>{(bill?.subtotal ?? 0).toFixed(2)}</span>
              </div>

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

              {/* Subtotal and discount */}
              <div style={{ fontSize: '7pt', marginBottom: '2mm' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5mm' }}>
                  <span>Sub Total :</span>
                  <span>{(bill?.subtotal ?? 0).toFixed(2)}</span>
                </div>

                {bill.discount_amount && bill.discount_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5mm' }}>
                    <span>Discount{bill.discount_percentage ? ` (${bill.discount_percentage}%)` : ''} :</span>
                    <span>-{bill.discount_amount.toFixed(2)}</span>
                  </div>
                )}

                {(() => {
                  const totalAmount = bill.type === 'gst' ? bill.final_amount : bill.total_amount
                  const roundOff = Math.round(totalAmount) - totalAmount
                  return roundOff !== 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1mm' }}>
                      <span>Round Off :</span>
                      <span>{roundOff > 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
                    </div>
                  )
                })()}
              </div>

              {/* Grand Total */}
              <div style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', padding: '2mm 0', marginBottom: '2mm' }}>
                <div style={{ fontSize: '11pt', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', fontStyle: 'italic' }}>
                  <span>GRAND TOTAL :</span>
                  <span>{Math.round(bill.type === 'gst' ? bill.final_amount : bill.total_amount).toFixed(2)}</span>
                </div>
              </div>

              {/* GST Breakdown for Tax Invoice */}
              {bill.type === 'gst' && bill.gst_amount && bill.gst_amount > 0 && (
                <>
                  {/* Dashed line */}
                  <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

                  {/* Tax breakdown table */}
                  <div style={{ fontSize: '6pt', marginBottom: '2mm' }}>
                    {/* Header row with underlines */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', paddingBottom: '0.5mm', borderBottom: '1px solid #000', marginBottom: '1mm' }}>
                      <div style={{ width: '15mm', textAlign: 'center' }}>Tax%</div>
                      <div style={{ width: '18mm', textAlign: 'right' }}>Taxable<br/>CGST%</div>
                      <div style={{ width: '18mm', textAlign: 'right' }}>CGSTAmt<br/>SGST%</div>
                      <div style={{ width: '15mm', textAlign: 'right' }}>SGSTAmt<br/>Tnk</div>
                    </div>

                    {/* Group items by GST rate */}
                    {Object.entries(
                      bill.items.reduce((acc, item) => {
                        const gstRate = item.gst_percentage || 0
                        if (!acc[gstRate]) {
                          acc[gstRate] = { taxable: 0 }
                        }
                        acc[gstRate].taxable += item.amount
                        return acc
                      }, {} as Record<number, { taxable: number }>)
                    ).map(([rate, data]) => {
                      const gstRate = parseFloat(rate)
                      const halfRate = gstRate / 2
                      const cgstAmount = (data.taxable * halfRate) / 100
                      const sgstAmount = (data.taxable * halfRate) / 100

                      return (
                        <div key={rate} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5mm' }}>
                          <div style={{ width: '15mm', textAlign: 'center' }}>{gstRate}%</div>
                          <div style={{ width: '18mm', textAlign: 'right' }}>{data.taxable.toFixed(2)}<br/>{halfRate.toFixed(2)}%</div>
                          <div style={{ width: '18mm', textAlign: 'right' }}>{cgstAmount.toFixed(2)}<br/>{halfRate.toFixed(2)}%</div>
                          <div style={{ width: '15mm', textAlign: 'right' }}>{sgstAmount.toFixed(2)}<br/>{(cgstAmount + sgstAmount).toFixed(2)}</div>
                        </div>
                      )
                    })}

                    {/* Total row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', paddingTop: '1mm', borderTop: '1px solid #000', marginTop: '1mm' }}>
                      <div style={{ width: '15mm', textAlign: 'center' }}></div>
                      <div style={{ width: '18mm', textAlign: 'right' }}>{(bill?.subtotal ?? 0).toFixed(2)}</div>
                      <div style={{ width: '18mm', textAlign: 'right' }}>{(bill.gst_amount / 2).toFixed(2)}</div>
                      <div style={{ width: '15mm', textAlign: 'right' }}>{(bill.gst_amount / 2).toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Total tax line */}
                  <div style={{ fontSize: '7pt', textAlign: 'right', marginBottom: '2mm' }}>
                    <strong>{bill.gst_amount.toFixed(2)}</strong>
                  </div>
                </>
              )}

              {/* Dashed line */}
              <div style={{ borderBottom: '2px dashed #000', margin: '2mm 0' }}></div>

              {/* Payment Info */}
              <div style={{ fontSize: '7pt', marginBottom: '2mm' }}>
                <div style={{ textAlign: 'center', marginBottom: '1mm' }}><strong>Payment Mode:</strong></div>
                {(() => {
                  try {
                    // Try to parse as JSON (split payment)
                    const payments = JSON.parse(bill.payment_type)
                    if (Array.isArray(payments) && payments.length > 0) {
                      return payments.map((payment: any, index: number) => (
                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '5mm', paddingRight: '5mm', marginBottom: '0.5mm' }}>
                          <span>{payment.payment_type}</span>
                          <span>₹{parseFloat(payment.amount).toFixed(2)}</span>
                        </div>
                      ))
                    }
                  } catch (e) {
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
                {/* Savings Section - Made bigger and more prominent */}
                {(() => {
                  const totalSavings = bill.items.reduce((sum, item) => {
                    const mrpAmount = item.mrp ? item.mrp * item.quantity : 0
                    const actualAmount = item.rate * item.quantity
                    return sum + (mrpAmount - actualAmount)
                  }, 0)

                  return totalSavings > 0 && (
                    <div style={{
                      border: '3px double #000',
                      padding: '3mm 2mm',
                      marginBottom: '3mm',
                      background: '#f9f9f9'
                    }}>
                      <div style={{
                        fontSize: '9pt',
                        fontWeight: 'bold',
                        marginBottom: '1mm',
                        letterSpacing: '0.5px'
                      }}>
                        🎉 TODAY&apos;S SAVINGS 🎉
                      </div>
                      <div style={{
                        fontSize: '16pt',
                        fontWeight: 'bold',
                        letterSpacing: '1px'
                      }}>
                        ₹{totalSavings.toFixed(2)}
                      </div>
                      <div style={{
                        fontSize: '6pt',
                        marginTop: '1mm',
                        fontStyle: 'italic'
                      }}>
                        You saved compared to MRP!
                      </div>
                    </div>
                  )
                })()}
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
            <button
              type="button"
              onClick={handlePrint}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Proceed to Print
            </button>
          </div>
        </div>
      </div>

      {/* Screen preview styling */}
      <style dangerouslySetInnerHTML={{__html: `
        .bill-receipt {
          font-family: 'Courier New', monospace;
          max-width: 80mm;
          width: 80mm;
          margin: 0 auto;
          background: white;
          color: black;
          line-height: 1.4;
          padding: 5mm;
          box-sizing: border-box;
        }

        .bill-receipt table {
          width: 100%;
          border-collapse: collapse;
        }

        @media print {
          .bill-receipt {
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 5mm !important;
            box-sizing: border-box !important;
          }
        }
      `}} />
    </div>
  )
}
