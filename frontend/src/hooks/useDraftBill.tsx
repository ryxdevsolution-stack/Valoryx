import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface BillItem {
  product_id: string
  product_name: string
  item_code: string
  hsn_code: string
  unit: string
  quantity: number
  rate: number
  gst_percentage: number
  gst_amount: number
  amount: number
  cost_price?: number
  mrp?: number
}

interface PaymentSplit {
  payment_type: string
  amount: number
}

interface BillTab {
  id: string
  customer_name: string
  customer_phone: string
  customer_gstin: string
  payment_splits: PaymentSplit[]
  items: BillItem[]
  discountPercentage: number
  amountReceived: number
}

interface DraftBill {
  billTabs: BillTab[]
  activeTabId: string
  savedAt: string
}

const DRAFT_KEY = 'billing_draft'
const AUTO_SAVE_INTERVAL = 1500 // Auto-save every 1.5 seconds (optimized from 3s)

export function useDraftBill() {
  const router = useRouter()
  const autoSaveTimer = useRef<NodeJS.Timeout>()
  const hasUnsavedChanges = useRef(false)

  // Load draft from localStorage
  const loadDraft = useCallback((): DraftBill | null => {
    try {
      const draftJson = localStorage.getItem(DRAFT_KEY)
      if (draftJson) {
        const draft = JSON.parse(draftJson)
        return draft
      }
    } catch (error) {
      console.error('Error loading draft:', error)
    }
    return null
  }, [])

  // Save draft to localStorage
  const saveDraft = useCallback((billTabs: BillTab[], activeTabId: string) => {
    try {
      // Only save if there are items or customer details
      const hasContent = billTabs.some(
        tab =>
          tab.items.length > 0 ||
          tab.customer_name.trim() !== '' ||
          tab.customer_phone.trim() !== ''
      )

      if (hasContent) {
        const draft: DraftBill = {
          billTabs,
          activeTabId,
          savedAt: new Date().toISOString(),
        }
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
        hasUnsavedChanges.current = false
        return true
      }
    } catch (error) {
      console.error('Error saving draft:', error)
    }
    return false
  }, [])

  // Auto-save draft
  const autoSaveDraft = useCallback((billTabs: BillTab[], activeTabId: string) => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
    }

    hasUnsavedChanges.current = true

    autoSaveTimer.current = setTimeout(() => {
      saveDraft(billTabs, activeTabId)
    }, AUTO_SAVE_INTERVAL)
  }, [saveDraft])

  // Clear draft
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY)
      hasUnsavedChanges.current = false
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }
    } catch (error) {
      console.error('Error clearing draft:', error)
    }
  }, [])

  // Check if draft exists
  const hasDraft = useCallback((): boolean => {
    return loadDraft() !== null
  }, [loadDraft])

  // Get draft age in minutes
  const getDraftAge = useCallback((): number | null => {
    const draft = loadDraft()
    if (!draft) return null

    const savedAt = new Date(draft.savedAt)
    const now = new Date()
    const ageInMinutes = Math.floor((now.getTime() - savedAt.getTime()) / 60000)
    return ageInMinutes
  }, [loadDraft])

  // Prompt user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }
    }
  }, [])

  return {
    loadDraft,
    saveDraft,
    autoSaveDraft,
    clearDraft,
    hasDraft,
    getDraftAge,
  }
}
