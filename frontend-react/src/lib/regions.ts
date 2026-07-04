// Regional presets for the setup wizard and settings.
// India ships with the GST (CGST+SGST) preset; other countries pre-fill a sensible
// currency/locale and a starter tax config the user can edit.

import type { TaxConfig } from '@/contexts/ClientContext'

export interface CountryPreset {
  code: string          // ISO-3166 alpha-2
  name: string
  currency_code: string // ISO-4217
  currency_symbol: string
  locale: string
  tax: TaxConfig
}

export const GST_CONFIG: TaxConfig = {
  name: 'GST',
  mode: 'split',
  default_rate: 18,
  inclusive: false,
  components: [
    { name: 'CGST', ratio: 0.5 },
    { name: 'SGST', ratio: 0.5 },
  ],
}

const singleTax = (name: string, rate: number): TaxConfig => ({
  name,
  mode: 'single',
  default_rate: rate,
  inclusive: false,
  components: [{ name, ratio: 1 }],
})

const noTax: TaxConfig = { name: 'None', mode: 'none', default_rate: 0, inclusive: false, components: [] }

// Curated list — extend freely. India first since it's the default market.
export const COUNTRY_PRESETS: CountryPreset[] = [
  { code: 'IN', name: 'India',                currency_code: 'INR', currency_symbol: '₹',   locale: 'en-IN', tax: GST_CONFIG },
  { code: 'AE', name: 'United Arab Emirates', currency_code: 'AED', currency_symbol: 'د.إ', locale: 'en-AE', tax: singleTax('VAT', 5) },
  { code: 'SA', name: 'Saudi Arabia',         currency_code: 'SAR', currency_symbol: '﷼',   locale: 'en-SA', tax: singleTax('VAT', 15) },
  { code: 'GB', name: 'United Kingdom',       currency_code: 'GBP', currency_symbol: '£',   locale: 'en-GB', tax: singleTax('VAT', 20) },
  { code: 'US', name: 'United States',        currency_code: 'USD', currency_symbol: '$',   locale: 'en-US', tax: singleTax('Sales Tax', 0) },
  { code: 'SG', name: 'Singapore',            currency_code: 'SGD', currency_symbol: 'S$',  locale: 'en-SG', tax: singleTax('GST', 9) },
  { code: 'MY', name: 'Malaysia',             currency_code: 'MYR', currency_symbol: 'RM',  locale: 'en-MY', tax: singleTax('SST', 6) },
  { code: 'AU', name: 'Australia',            currency_code: 'AUD', currency_symbol: 'A$',  locale: 'en-AU', tax: singleTax('GST', 10) },
  { code: 'CA', name: 'Canada',               currency_code: 'CAD', currency_symbol: 'C$',  locale: 'en-CA', tax: singleTax('Sales Tax', 0) },
  { code: 'OTHER', name: 'Other / Not listed', currency_code: 'USD', currency_symbol: '$',  locale: 'en-US', tax: noTax },
]

export function presetForCountry(code?: string): CountryPreset {
  return COUNTRY_PRESETS.find(c => c.code === code) || COUNTRY_PRESETS[0]
}

// Maps common IANA timezones to a supported country code. SUGGEST-ONLY: used to
// pre-select the setup wizard's country so most users don't have to change it.
// The user always sees the dropdown and can override; changing the OS timezone
// later never affects the saved region (it's chosen once, then read-only).
const TIMEZONE_COUNTRY: Record<string, string> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA',
  'Europe/London': 'GB',
  'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
  'America/Detroit': 'US', 'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/Montreal': 'CA',
}

/**
 * Best-effort guess of the business country from the device's IANA timezone.
 * Returns a supported COUNTRY_PRESETS code, or null when it can't tell (caller
 * keeps its own default). Works fully offline — no network/geo-IP.
 */
export function detectCountryFromTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return null
    if (TIMEZONE_COUNTRY[tz]) return TIMEZONE_COUNTRY[tz]
    if (tz.startsWith('Australia/')) return 'AU'   // any AU city
    return null
  } catch {
    return null
  }
}

// Common currency symbols, used when a client_entry has a code but no explicit symbol.
export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹', USD: '$', AED: 'د.إ', SAR: '﷼', GBP: '£', EUR: '€',
  SGD: 'S$', MYR: 'RM', AUD: 'A$', CAD: 'C$',
}
