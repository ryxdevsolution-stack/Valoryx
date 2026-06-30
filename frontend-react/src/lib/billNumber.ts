/**
 * Format a bill's human-facing number.
 *
 * Offline desktop installs stamp each bill with a short device code so numbers
 * never collide across devices after sync (e.g. "A7K2-101"). Online/web bills
 * have no prefix and show the plain number ("101").
 *
 * Prefers the backend-computed `bill_no_display`; falls back to composing it
 * from `bill_prefix` + `bill_number` for older payloads.
 */
export interface BillNumberFields {
  bill_number?: number | string | null;
  bill_prefix?: string | null;
  bill_no_display?: string | null;
}

export function formatBillNo(bill: BillNumberFields | null | undefined): string {
  if (!bill) return '';
  if (bill.bill_no_display) return bill.bill_no_display;
  const num = bill.bill_number;
  if (num === null || num === undefined || num === '') return '';
  return bill.bill_prefix ? `${bill.bill_prefix}-${num}` : String(num);
}
