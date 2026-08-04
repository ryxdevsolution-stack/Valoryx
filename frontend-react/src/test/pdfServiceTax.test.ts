import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateBillPDF } from '@/lib/pdfService'

vi.mock('@/components/ToastContainer', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

/**
 * Capture the HTML that generateBillPDF hands to the popup window.
 * The function emits via Blob -> createObjectURL -> window.open, so we
 * intercept the Blob rather than change the production signature.
 */
async function renderPdfHtml(bill: any): Promise<string> {
  let captured = ''
  const origCreate = URL.createObjectURL
  // jsdom Blob supports .text()
  ;(URL as any).createObjectURL = (blob: Blob) => {
    ;(blob as any).__captured = true
    return 'blob:mock'
  }
  const blobSpy = vi.spyOn(globalThis, 'Blob').mockImplementation(((parts: any[]) => {
    captured = String(parts[0])
    return { size: 0, type: 'text/html' } as any
  }) as any)
  const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as any)
  ;(URL as any).revokeObjectURL = vi.fn()

  await generateBillPDF(bill, { client_name: 'Test Company' } as any)

  blobSpy.mockRestore()
  openSpy.mockRestore()
  ;(URL as any).createObjectURL = origCreate
  return captured
}

const GST_BILL = {
  bill_number: 48,
  customer_name: 'Walk-In',
  items: [{
    product_id: 'p1', product_name: 'External Hard Drive 1Tb', unit: 'pcs',
    quantity: 3, rate: 4500, gst_percentage: 18, gst_amount: 1701, amount: 11151,
  }],
  subtotal: 9450,
  discount_percentage: 0,
  discount_amount: 0,
  gst_amount: 1701,
  final_amount: 11151,
  total_amount: 11151,
  payment_type: '[]',
  created_at: '2026-08-03T17:06:00',
  type: 'gst' as const,
  cgst: 0,
  sgst: 0,
  igst: 0,
  user_name: 'Admin',
}

describe('PDF tax breakdown', () => {
  beforeEach(() => vi.clearAllMocks())

  it('splits gst_amount when cgst/sgst are absent from the API', async () => {
    // The regression: cgst/sgst only exist on the CREATE response. A bill
    // loaded from the list/detail API has neither, and the PDF printed
    // "CGST 0.00 / SGST 0.00" on a bill that plainly had ₹1701 of tax —
    // while the thermal receipt showed it correctly.
    const html = await renderPdfHtml(GST_BILL)

    expect(html).toContain('CGST')
    expect(html).toMatch(/850\.50/)
    expect(html).not.toMatch(/CGST<\/td><td class="tot-val">[^<]*0\.00</)
  })

  it('prefers an explicit tax_breakdown over the split', async () => {
    const html = await renderPdfHtml({
      ...GST_BILL,
      tax_breakdown: [{ name: 'VAT', amount: 1701 }],
    })

    expect(html).toContain('VAT')
    expect(html).toMatch(/1,?701\.00/)
  })

  it('still honours real cgst/sgst values when the API does supply them', async () => {
    const html = await renderPdfHtml({ ...GST_BILL, cgst: 900, sgst: 801 })

    expect(html).toMatch(/900\.00/)
    expect(html).toMatch(/801\.00/)
  })
})
