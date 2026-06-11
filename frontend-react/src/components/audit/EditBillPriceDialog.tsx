import { useState, useMemo, useEffect, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { calcLine, calcBillTotals, LineInput } from '@/utils/billCalc';
import { updateBillFromAudit } from '@/services/billingService';
import { toast } from '@/utils/toast';

interface BillItemInput extends LineInput {
  product_id: string;
  product_name: string;
}

type RawItem = Record<string, unknown>;

interface BillItem {
  product_id: string;
  product_name: string;
  rate: number | string;
  quantity: number | string;
  discount?: number;
  tax_percent?: number;
}

interface Bill {
  bill_id: string;
  bill_number: number;
  customer_name: string;
  items: BillItem[];
  audit_overrides?: BillItem[] | null;
  gst_percentage: number;
  payment_type: string;
  subtotal: number | string;
  status?: string;
}

interface Props {
  open: boolean;
  bill: Bill | null;
  /** Whether the current user may record a correction (owner/manager). When false,
   *  the dialog is a pure read-only bill detail with no way to enter edit mode. */
  canCorrect: boolean;
  onClose: () => void;
  /**
   * Fired after a successful save. Receives the updated bill from the server response,
   * so the parent can patch its local list in place without a refetch.
   */
  onSaved: (updatedBill: Record<string, unknown>) => void;
}

export default function EditBillPriceDialog({ open, bill, canCorrect, onClose, onSaved }: Props) {
  const [items, setItems] = useState<BillItemInput[]>([]);
  const [originalItems, setOriginalItems] = useState<BillItemInput[]>([]);
  const [saving, setSaving] = useState(false);
  // The dialog opens as a read-only bill detail; owner/manager can flip into
  // correction mode. This keeps the edit affordance one deliberate step removed.
  const [editing, setEditing] = useState(false);
  // Preserve the full raw items (item_code, hsn_code, mrp, unit, etc.) so we don't drop them on save
  const rawItemsRef = useRef<RawItem[]>([]);

  useEffect(() => {
    // Every time a (new) bill is opened, start in read-only view mode.
    setEditing(false);
    if (!bill) {
      setItems([]); setOriginalItems([]); rawItemsRef.current = [];
      return;
    }
    // Seed editable rows from audit_overrides if present (resume the prior audit note),
    // otherwise from the actual bill items. Raw item shape (item_code, hsn_code, etc.)
    // is always preserved from the original `items` so we don't drop data on apply.
    const seedSource = (bill.audit_overrides && bill.audit_overrides.length > 0)
      ? bill.audit_overrides
      : bill.items;
    rawItemsRef.current = bill.items.map(i => ({ ...(i as unknown as RawItem) }));
    const seeded = seedSource.map(i => ({
      product_id: i.product_id,
      product_name: i.product_name,
      rate: Number(i.rate),
      quantity: Number(i.quantity),
      discount: Number(i.discount ?? 0),
      tax_percent: Number(i.tax_percent ?? bill.gst_percentage ?? 0),
    }));
    setItems(seeded);
    setOriginalItems(seeded.map(s => ({ ...s })));
  }, [bill]);

  const totals = useMemo(() => calcBillTotals(items), [items]);
  const originalTotals = useMemo(() => calcBillTotals(originalItems), [originalItems]);
  const hasChanges = useMemo(
    () => items.some((it, i) => {
      const o = originalItems[i];
      if (!o) return false;
      return it.rate !== o.rate || it.quantity !== o.quantity ||
             it.discount !== o.discount || it.tax_percent !== o.tax_percent;
    }),
    [items, originalItems],
  );

  const setField = (idx: number, field: keyof LineInput, value: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const handleSave = async () => {
    if (!bill) return;
    setSaving(true);
    try {
      // Merge user edits back into the full item shape the backend expects.
      // Preserves item_code, hsn_code, mrp, unit, etc. from the original item
      // and recomputes amount + gst_amount from the new rate/qty/tax.
      const mergedItems = items.map((edited, idx) => {
        const raw = rawItemsRef.current[idx] || {};
        const line = calcLine(edited);
        return {
          ...raw,
          product_id: edited.product_id,
          product_name: edited.product_name,
          rate: edited.rate,
          quantity: edited.quantity,
          discount: edited.discount,
          tax_percent: edited.tax_percent,
          gst_percentage: edited.tax_percent,
          gst_amount: Number(line.line_tax_amount.toFixed(2)),
          amount: Number(line.line_total.toFixed(2)),
        };
      });
      const payload = {
        items: mergedItems,
        subtotal: Number(totals.bill_subtotal.toFixed(2)),
        gst_percentage: bill.gst_percentage,
        gst_amount: Number(totals.bill_tax.toFixed(2)),
        final_amount: Number(totals.bill_total.toFixed(2)),
        total_amount: Number(totals.bill_total.toFixed(2)),
        payment_type: bill.payment_type,
      };
      const result = await updateBillFromAudit(bill.bill_id, payload as never);
      toast.success(`Audit note saved for Bill #${bill.bill_number}. Bill itself unchanged.`);
      onSaved(result.bill);
      onClose();
    } catch (e: unknown) {
      // Axios errors carry the backend's JSON in e.response.data — surface that message
      const err = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to update bill';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !bill) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div role="dialog" aria-modal="true" className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editing ? 'Record audit correction' : 'Bill detail'} — Bill #{bill.bill_number}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {editing
                ? `${bill.customer_name} · saved as an audit note — the original bill, prints & reports stay unchanged`
                : `${bill.customer_name} · view only`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {canCorrect && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={bill.status === 'cancelled'}
                aria-label="Correct prices"
                title={bill.status === 'cancelled' ? 'Cancelled bills cannot be corrected' : 'Record an audit correction — saved as a note, does not change the bill'}
                className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-500 dark:hover:text-blue-400 dark:hover:bg-gray-700"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700" aria-label="Close">✕</button>
          </div>
        </div>

        {bill.audit_overrides && bill.audit_overrides.length > 0 && (
          <div className="mt-3 rounded border border-blue-400/40 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-200">
            Resuming a prior audit note. The bill itself still reads from the original line items —
            your correction is recorded alongside it, never applied over it.
          </div>
        )}

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2">Item</th>
              <th className="pb-2">Rate</th>
              <th className="pb-2">Qty</th>
              <th className="pb-2">Disc %</th>
              <th className="pb-2">Tax %</th>
              <th className="pb-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const t = calcLine(item);
              const orig = originalItems[idx];
              const origLine = orig ? calcLine(orig) : null;
              const inputCls = (changed: boolean, w: string) =>
                `${w} rounded border px-2 py-1 text-gray-900 bg-white dark:text-white dark:bg-gray-700 disabled:bg-gray-100 disabled:text-gray-600 disabled:cursor-default dark:disabled:bg-gray-800/60 dark:disabled:text-gray-300 ${
                  changed
                    ? 'border-amber-500 dark:border-amber-400 ring-1 ring-amber-500/40'
                    : 'border-gray-300 dark:border-gray-600'
                }`;
              const HintRow = ({ value }: { value: number }) => (
                <div className="mt-0.5 text-[10px] leading-none text-gray-500 dark:text-gray-400">
                  was: {value}
                </div>
              );
              return (
                <tr key={item.product_id} className="border-t border-gray-200 dark:border-gray-700 align-top">
                  <td className="py-3 text-gray-900 dark:text-white">{item.product_name}</td>
                  <td className="py-3">
                    <input
                      type="number"
                      step="0.01"
                      aria-label={`Rate for ${item.product_name}`}
                      value={item.rate}
                      disabled={!editing}
                      onChange={e => setField(idx, 'rate', Number(e.target.value))}
                      className={inputCls(!!orig && item.rate !== orig.rate, 'w-24')}
                    />
                    {orig && <HintRow value={orig.rate} />}
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      step="1"
                      aria-label={`Quantity for ${item.product_name}`}
                      value={item.quantity}
                      disabled={!editing}
                      onChange={e => setField(idx, 'quantity', Number(e.target.value))}
                      className={inputCls(!!orig && item.quantity !== orig.quantity, 'w-20')}
                    />
                    {orig && <HintRow value={orig.quantity} />}
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      step="0.01"
                      aria-label={`Discount for ${item.product_name}`}
                      value={item.discount}
                      disabled={!editing}
                      onChange={e => setField(idx, 'discount', Number(e.target.value))}
                      className={inputCls(!!orig && item.discount !== orig.discount, 'w-20')}
                    />
                    {orig && <HintRow value={orig.discount} />}
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      step="0.01"
                      aria-label={`Tax for ${item.product_name}`}
                      value={item.tax_percent}
                      disabled={!editing}
                      onChange={e => setField(idx, 'tax_percent', Number(e.target.value))}
                      className={inputCls(!!orig && item.tax_percent !== orig.tax_percent, 'w-20')}
                    />
                    {orig && <HintRow value={orig.tax_percent} />}
                  </td>
                  <td className="py-3 text-right">
                    <div className="font-medium text-gray-900 dark:text-white">{t.line_total.toFixed(2)}</div>
                    {origLine && origLine.line_total !== t.line_total && (
                      <div className="mt-0.5 text-[10px] leading-none text-gray-500 dark:text-gray-400">
                        was: {origLine.line_total.toFixed(2)}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4 text-right">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Subtotal: {totals.bill_subtotal.toFixed(2)}
            {hasChanges && (
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                (was: {originalTotals.bill_subtotal.toFixed(2)})
              </span>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Tax: {totals.bill_tax.toFixed(2)}
            {hasChanges && (
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                (was: {originalTotals.bill_tax.toFixed(2)})
              </span>
            )}
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-white" data-testid="bill-total">
            Total: ₹{totals.bill_total.toFixed(2)}
            {hasChanges && (
              <span className="ml-2 text-sm font-normal text-amber-600 dark:text-amber-400">
                (was: ₹{originalTotals.bill_total.toFixed(2)})
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => { setItems(originalItems.map(s => ({ ...s }))); setEditing(false); }}
                disabled={saving}
                className="rounded border px-4 py-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !hasChanges}
                title={!hasChanges ? 'Change at least one value to save' : 'Save audit note'}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save audit note'}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className="rounded border px-4 py-2">Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
