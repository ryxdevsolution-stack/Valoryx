import api from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────

export interface ShopSettings {
  shop_name: string
  address1: string
  address2: string
  phone: string
  upi_id: string
  gst_number: string
  receipt_footer: string
  logo_url: string
  points_per_100: number
  // Apparel label defaults — filled onto hang-tags when per-SKU fields are blank
  label_importer_name?: string
  label_importer_address?: string
  label_origin_country?: string
  label_care_phone?: string
  label_care_email?: string
}

export interface ShopSettingsResponse {
  success: boolean
  data: ShopSettings
}

export interface ShopSettingsUpdatePayload {
  shop_name?: string
  address1?: string
  address2?: string
  phone?: string
  upi_id?: string
  gst_number?: string
  receipt_footer?: string
  points_per_100?: number
  label_importer_name?: string
  label_importer_address?: string
  label_origin_country?: string
  label_care_phone?: string
  label_care_email?: string
}

export interface ShopSettingsUpdateResponse {
  success: boolean
  message: string
  data: ShopSettings
}

// ─── API calls ───────────────────────────────────────────────────────

export async function getShopSettings(): Promise<ShopSettings> {
  const { data } = await api.get<ShopSettingsResponse>('/shop-settings')
  return data.data
}

export async function updateShopSettings(
  payload: ShopSettingsUpdatePayload
): Promise<ShopSettings> {
  const { data } = await api.put<ShopSettingsUpdateResponse>(
    '/shop-settings',
    payload
  )
  return data.data
}
