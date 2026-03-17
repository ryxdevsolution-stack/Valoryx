import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraftBill } from '@/hooks/useDraftBill'

const DRAFT_KEY = 'billing_draft'

// Minimal tab with one item — satisfies the saveDraft hasContent guard
function makeTab(overrides = {}) {
  return {
    id: '1',
    customer_name: 'Alice',
    customer_phone: '9999999999',
    customer_gstin: '',
    payment_splits: [],
    items: [
      {
        product_id: 'p1',
        product_name: 'Widget',
        item_code: 'W1',
        hsn_code: '1234',
        unit: 'pcs',
        quantity: 2,
        rate: 100,
        gst_percentage: 18,
        gst_amount: 36,
        amount: 236,
      },
    ],
    discountPercentage: 0,
    amountReceived: 0,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

// ── 1. saveDraft persists to localStorage ─────────────────────────────────────
describe('saveDraft', () => {
  it('saves bill tabs to localStorage when tabs have content', () => {
    const { result } = renderHook(() => useDraftBill())
    const tabs = [makeTab()]

    act(() => {
      result.current.saveDraft(tabs, '1')
    })

    const raw = localStorage.getItem(DRAFT_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.billTabs).toHaveLength(1)
    expect(parsed.billTabs[0].items).toHaveLength(1)
    expect(parsed.activeTabId).toBe('1')
  })

  it('does NOT save when all tabs are empty (no items, no customer)', () => {
    const { result } = renderHook(() => useDraftBill())
    const emptyTab = {
      id: '1',
      customer_name: '',
      customer_phone: '',
      customer_gstin: '',
      payment_splits: [],
      items: [],
      discountPercentage: 0,
      amountReceived: 0,
    }

    act(() => {
      result.current.saveDraft([emptyTab], '1')
    })

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })
})

// ── 2. loadDraft restores from localStorage ───────────────────────────────────
it('loadDraft returns the saved draft on mount', () => {
  const draft = {
    billTabs: [makeTab()],
    activeTabId: '1',
    savedAt: new Date().toISOString(),
  }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))

  const { result } = renderHook(() => useDraftBill())
  const loaded = result.current.loadDraft()

  expect(loaded).not.toBeNull()
  expect(loaded!.billTabs[0].customer_name).toBe('Alice')
  expect(loaded!.activeTabId).toBe('1')
})

// ── 3. clearDraft removes the localStorage key ────────────────────────────────
it('clearDraft removes billing_draft from localStorage', () => {
  const { result } = renderHook(() => useDraftBill())

  act(() => {
    result.current.saveDraft([makeTab()], '1')
  })
  expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()

  act(() => {
    result.current.clearDraft()
  })
  expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
})

// ── 4. Corrupted localStorage doesn't crash ───────────────────────────────────
it('loadDraft returns null and does not throw when localStorage contains invalid JSON', () => {
  localStorage.setItem(DRAFT_KEY, 'not-valid-json{{{{')

  const { result } = renderHook(() => useDraftBill())

  expect(() => result.current.loadDraft()).not.toThrow()
  expect(result.current.loadDraft()).toBeNull()
})

// ── 5. Empty localStorage returns null ────────────────────────────────────────
it('loadDraft returns null when no draft key exists', () => {
  const { result } = renderHook(() => useDraftBill())
  expect(result.current.loadDraft()).toBeNull()
})

// ── 6. hasDraft returns correct boolean ───────────────────────────────────────
it('hasDraft returns false before saving and true after', () => {
  const { result } = renderHook(() => useDraftBill())

  expect(result.current.hasDraft()).toBe(false)

  act(() => {
    result.current.saveDraft([makeTab()], '1')
  })

  expect(result.current.hasDraft()).toBe(true)
})

// ── 7. Large drafts persist all items correctly ───────────────────────────────
it('saves and restores a draft with 50 line items', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({
    product_id: `p${i}`,
    product_name: `Product ${i}`,
    item_code: `C${i}`,
    hsn_code: '0000',
    unit: 'pcs',
    quantity: i + 1,
    rate: 100,
    gst_percentage: 18,
    gst_amount: 18 * (i + 1),
    amount: 118 * (i + 1),
  }))

  const tab = makeTab({ items })
  const { result } = renderHook(() => useDraftBill())

  act(() => {
    result.current.saveDraft([tab], '1')
  })

  const loaded = result.current.loadDraft()
  expect(loaded!.billTabs[0].items).toHaveLength(50)
  expect(loaded!.billTabs[0].items[49].product_name).toBe('Product 49')
})
