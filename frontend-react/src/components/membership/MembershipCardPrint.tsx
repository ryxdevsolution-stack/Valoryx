import { forwardRef, useRef, ReactNode, CSSProperties } from 'react'
import { useReactToPrint } from 'react-to-print'
import { QRCodeSVG } from 'qrcode.react'
import { Printer } from 'lucide-react'

// ── Shared printable membership card (front + back) ──────────────────────────
// One source of truth for the physical card, used by the Tiers tab (template)
// and the member CardView (real member). Styles are INLINE on purpose: the
// print runs in an isolated iframe, so we don't rely on the app's Tailwind
// stylesheet being copied — the card is self-contained and prints identically.

export interface PrintableCardData {
  shopName: string
  tierName: string
  /** Hex accent for the card gradient (tier color). */
  accentColor: string
  memberName: string
  cardNumber: string
  description?: string | null
  /** Value encoded in the QR (usually the membership number). */
  qrValue: string
  /** Back-of-card benefit bullet lines. Empty/omitted → no back face. */
  benefits?: string[]
  shopPhone?: string | null
}

/**
 * Derive the back-of-card benefit lines from a tier's reward settings.
 * `currencySymbol` is threaded in from the parent component (via useCurrency)
 * so a non-India client sees their own currency on printed cards.
 */
export function tierBenefitLines(tier: {
  discount_percentage?: number | null
  points_per_100?: number | null
  redemption_rate?: number | null
  monthly_negotiable_budget?: number | null
  negotiable_budget_period?: 'monthly' | 'yearly'
} | null | undefined, currencySymbol = '₹'): string[] {
  if (!tier) return []
  const lines: string[] = []
  if (tier.discount_percentage != null) lines.push(`${tier.discount_percentage}% member discount on every bill`)
  if (tier.points_per_100 != null) lines.push(`Earn ${tier.points_per_100} point${Number(tier.points_per_100) === 1 ? '' : 's'} per ${currencySymbol}100 spent`)
  if (tier.redemption_rate != null) lines.push(`Redeem points as money off — 1 pt = ${currencySymbol}${tier.redemption_rate}`)
  if (tier.monthly_negotiable_budget != null) lines.push(`${currencySymbol}${tier.monthly_negotiable_budget} negotiation allowance per ${tier.negotiable_budget_period === 'yearly' ? 'year' : 'month'}`)
  return lines
}

// CR80 / ISO-7810 ID-1 — the standard credit/loyalty card size.
const CARD_W = '85.6mm'
const CARD_H = '54mm'
const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif'

// Print on the user's normal paper (auto), but render each face at true
// physical size and force colors on so gradients/QR/stripe survive.
const CARD_PAGE_STYLE = `
  @page { size: auto; margin: 12mm; }
  @media print {
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`

const labelStyle: CSSProperties = {
  fontFamily: FONT,
  fontSize: '6pt',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#9ca3af',
  marginBottom: '1.5mm',
}

function FrontFace({ data, accent }: { data: PrintableCardData; accent: string }) {
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: '3mm',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
        fontFamily: FONT,
        background: `linear-gradient(135deg, ${accent}, ${accent}99 55%, ${accent}dd)`,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      <div style={{ position: 'absolute', top: '-12mm', right: '-10mm', width: '30mm', height: '30mm', borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
      <div style={{ position: 'absolute', bottom: '-14mm', left: '-8mm', width: '28mm', height: '28mm', borderRadius: '50%', background: 'rgba(0,0,0,0.10)' }} />
      <div style={{ position: 'relative', height: '100%', padding: '4mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '2mm' }}>
          <span style={{ fontSize: '9pt', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.shopName}</span>
          <span style={{ flexShrink: 0, fontSize: '7pt', fontWeight: 700, padding: '1mm 2.5mm', borderRadius: '10mm', background: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{data.tierName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '3mm' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '10pt', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.memberName}</div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9pt', letterSpacing: '0.18em', opacity: 0.95 }}>{data.cardNumber}</div>
            {data.description && (
              <div style={{ fontSize: '6.5pt', opacity: 0.8, marginTop: '0.5mm', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.description}</div>
            )}
          </div>
          <div style={{ background: '#ffffff', padding: '1mm', borderRadius: '1.5mm', flexShrink: 0, lineHeight: 0 }}>
            <QRCodeSVG value={data.qrValue} size={56} level="M" />
          </div>
        </div>
      </div>
    </div>
  )
}

function BackFace({ data, accent }: { data: PrintableCardData; accent: string }) {
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: '3mm',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
        fontFamily: FONT,
        color: '#374151',
        background: '#f3f4f6',
        border: '0.3mm solid #e5e7eb',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      {/* magnetic stripe */}
      <div style={{ height: '9mm', marginTop: '3mm', background: accent, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
      <div style={{ padding: '3mm 4mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 'calc(100% - 12mm)', boxSizing: 'border-box' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '6.5pt', lineHeight: 1.5 }}>
          {(data.benefits ?? []).map((b, i) => (
            <li key={i}>• {b}</li>
          ))}
        </ul>
        <div style={{ borderTop: '0.3mm solid #d1d5db', paddingTop: '1.5mm' }}>
          <div style={{ fontSize: '6.5pt', fontWeight: 600 }}>{data.shopName}{data.shopPhone ? ` · ${data.shopPhone}` : ''}</div>
          <div style={{ fontSize: '5.5pt', color: '#9ca3af', marginTop: '0.3mm' }}>
            Property of {data.shopName}. Present at billing to use benefits. Not transferable.
          </div>
        </div>
      </div>
    </div>
  )
}

/** Full printable: front + (optional) back, centered at true size on the page. */
export const PrintableMembershipCard = forwardRef<HTMLDivElement, { data: PrintableCardData }>(
  function PrintableMembershipCard({ data }, ref) {
    const accent = data.accentColor || '#2563eb'
    const hasBack = (data.benefits?.length ?? 0) > 0
    return (
      <div ref={ref} style={{ width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10mm', padding: '4mm' }}>
        <div>
          <div style={labelStyle}>Front</div>
          <FrontFace data={data} accent={accent} />
        </div>
        {hasBack && (
          <div>
            <div style={labelStyle}>Back</div>
            <BackFace data={data} accent={accent} />
          </div>
        )}
      </div>
    )
  },
)

// ── Print trigger button (icon or full button) ───────────────────────────────

interface MembershipCardPrintButtonProps {
  data: PrintableCardData
  /** 'icon' for compact toolbars (Tiers grid), 'button' for panels (CardView). */
  variant?: 'icon' | 'button'
  className?: string
  children?: ReactNode
}

export function MembershipCardPrintButton({
  data,
  variant = 'button',
  className,
  children,
}: MembershipCardPrintButtonProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const print = useReactToPrint({
    contentRef: cardRef,
    pageStyle: CARD_PAGE_STYLE,
    documentTitle: `${data.cardNumber || 'membership'}-card`,
  })

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => print()}
          title="Print card"
          aria-label={`Print ${data.tierName} card`}
          className={
            className ??
            'p-1.5 rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors'
          }
        >
          <Printer className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => print()}
          className={
            className ??
            'flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
          }
        >
          <Printer className="w-4 h-4" />
          {children ?? 'Print card'}
        </button>
      )}

      {/* Off-screen instance that react-to-print clones into its print iframe. */}
      <div aria-hidden="true" style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }}>
        <PrintableMembershipCard ref={cardRef} data={data} />
      </div>
    </>
  )
}
