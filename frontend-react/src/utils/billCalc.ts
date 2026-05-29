export interface LineInput {
  rate: number;
  quantity: number;
  discount: number;       // percentage 0-100
  tax_percent: number;    // percentage 0-100
}

export interface LineTotals extends LineInput {
  line_subtotal: number;
  line_discount_amount: number;
  line_taxable: number;
  line_tax_amount: number;
  line_total: number;
}

export interface BillTotals {
  bill_subtotal: number;
  bill_discount: number;
  bill_tax: number;
  bill_total: number;
}

/**
 * Net cost after a supplier/purchase discount, for profit display only.
 * The gross cost is kept on the product master; this derives the effective cost.
 * Returns undefined when no gross cost is known. Discount is clamped to 0-100.
 */
export function netCost(grossCost: number | null | undefined, purchaseDiscountPct: number = 0): number | undefined {
  if (grossCost == null || Number.isNaN(Number(grossCost))) return undefined;
  const disc = Math.min(Math.max(purchaseDiscountPct || 0, 0), 100);
  return Number((Number(grossCost) * (1 - disc / 100)).toFixed(2));
}

export function calcLine(input: LineInput): LineTotals {
  const line_subtotal = (input.rate || 0) * (input.quantity || 0);
  const line_discount_amount = line_subtotal * ((input.discount || 0) / 100);
  const line_taxable = line_subtotal - line_discount_amount;
  const line_tax_amount = line_taxable * ((input.tax_percent || 0) / 100);
  const line_total = line_taxable + line_tax_amount;
  return {
    ...input,
    line_subtotal,
    line_discount_amount,
    line_taxable,
    line_tax_amount,
    line_total,
  };
}

export function calcBillTotals(lines: LineInput[]): BillTotals {
  return lines.reduce<BillTotals>(
    (acc, line) => {
      const t = calcLine(line);
      return {
        bill_subtotal: acc.bill_subtotal + t.line_subtotal,
        bill_discount: acc.bill_discount + t.line_discount_amount,
        bill_tax: acc.bill_tax + t.line_tax_amount,
        bill_total: acc.bill_total + t.line_total,
      };
    },
    { bill_subtotal: 0, bill_discount: 0, bill_tax: 0, bill_total: 0 },
  );
}
