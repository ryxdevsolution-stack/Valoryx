import { useMemo, memo } from 'react'
import { QRCodeSVG } from 'qrcode.react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UpiQrCodeProps {
  upiId: string
  shopName: string
  amount: number
  size?: number // default 200
}

// ---------------------------------------------------------------------------
// UPI URI builder
// ---------------------------------------------------------------------------

function buildUpiUri(upiId: string, shopName: string, amount: number): string {
  const params = new URLSearchParams({
    pa: upiId,
    pn: shopName,
    am: amount.toFixed(2),
    cu: 'INR',
  })
  return `upi://pay?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Component (client-side QR generation — no external API calls)
// ---------------------------------------------------------------------------

function UpiQrCodeInner({ upiId, shopName, amount, size = 200 }: UpiQrCodeProps) {
  const upiUri = useMemo(
    () => buildUpiUri(upiId, shopName, amount),
    [upiId, shopName, amount],
  )

  if (!upiId) {
    return null
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
        Scan to Pay
      </p>

      {/* Amount */}
      <p className="text-2xl font-bold text-gray-900 dark:text-white">
        ₹{amount.toFixed(2)}
      </p>

      {/* QR Code — generated entirely client-side */}
      <div className="rounded-lg bg-white p-3">
        <QRCodeSVG
          value={upiUri}
          size={size}
          level="M"
          includeMargin={false}
        />
      </div>

      {/* UPI ID */}
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {upiId}
      </p>
    </div>
  )
}

const UpiQrCode = memo(UpiQrCodeInner)
export default UpiQrCode
