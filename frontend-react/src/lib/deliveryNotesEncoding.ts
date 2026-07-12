/**
 * Packs the delivery wizard's logistics fields (Buyer's Order No., Dispatched
 * through, Destination, Vehicle No., LR-RR No.) into the existing
 * `SupplierDelivery.notes` text column — no new database columns.
 *
 * When any logistics field is set, `notes` stores a JSON envelope tagged with
 * `__valoryx_delivery_meta` instead of plain text. `decodeDeliveryNotes` checks
 * for that tag before treating the string as JSON, so older deliveries with
 * plain free-text notes (or notes that just happen to start with "{") are
 * never misread — they fall through to `{ text: raw }` unchanged.
 */

export interface DeliveryLogisticsFields {
  text: string
  buyer_order_no?: string
  buyer_order_date?: string
  dispatched_through?: string
  destination?: string
  vehicle_no?: string
  lr_rr_no?: string
}

const ENVELOPE_TAG = '__valoryx_delivery_meta'

export function encodeDeliveryNotes(fields: DeliveryLogisticsFields): string {
  const hasLogistics = !!(
    fields.buyer_order_no || fields.buyer_order_date || fields.dispatched_through ||
    fields.destination || fields.vehicle_no || fields.lr_rr_no
  )
  if (!hasLogistics) return fields.text || ''
  return JSON.stringify({
    [ENVELOPE_TAG]: true,
    text: fields.text || '',
    buyer_order_no: fields.buyer_order_no || '',
    buyer_order_date: fields.buyer_order_date || '',
    dispatched_through: fields.dispatched_through || '',
    destination: fields.destination || '',
    vehicle_no: fields.vehicle_no || '',
    lr_rr_no: fields.lr_rr_no || '',
  })
}

export function decodeDeliveryNotes(raw: string | null | undefined): DeliveryLogisticsFields {
  const empty: DeliveryLogisticsFields = { text: '' }
  if (!raw) return empty
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && parsed[ENVELOPE_TAG]) {
        return {
          text: parsed.text || '',
          buyer_order_no: parsed.buyer_order_no || '',
          buyer_order_date: parsed.buyer_order_date || '',
          dispatched_through: parsed.dispatched_through || '',
          destination: parsed.destination || '',
          vehicle_no: parsed.vehicle_no || '',
          lr_rr_no: parsed.lr_rr_no || '',
        }
      }
    } catch {
      /* not a logistics envelope — fall through to plain text */
    }
  }
  return { text: raw }
}
