import { describe, it, expect } from 'vitest';
import { calcLine, calcBillTotals } from '@/utils/billCalc';

describe('calcLine', () => {
  it('computes subtotal, tax, and total for a simple line', () => {
    const result = calcLine({ rate: 100, quantity: 2, discount: 0, tax_percent: 18 });
    expect(result.line_subtotal).toBe(200);
    expect(result.line_discount_amount).toBe(0);
    expect(result.line_taxable).toBe(200);
    expect(result.line_tax_amount).toBe(36);
    expect(result.line_total).toBe(236);
  });

  it('applies percentage discount before tax', () => {
    const result = calcLine({ rate: 100, quantity: 1, discount: 10, tax_percent: 18 });
    expect(result.line_subtotal).toBe(100);
    expect(result.line_discount_amount).toBe(10);
    expect(result.line_taxable).toBe(90);
    expect(result.line_tax_amount).toBeCloseTo(16.2, 2);
    expect(result.line_total).toBeCloseTo(106.2, 2);
  });

  it('handles zero quantity', () => {
    const result = calcLine({ rate: 100, quantity: 0, discount: 0, tax_percent: 18 });
    expect(result.line_total).toBe(0);
  });

  it('handles missing/undefined fields gracefully', () => {
    const result = calcLine({ rate: 100, quantity: 1, discount: undefined as any, tax_percent: undefined as any });
    expect(result.line_subtotal).toBe(100);
    expect(result.line_total).toBe(100);
  });
});

describe('calcBillTotals', () => {
  it('aggregates multiple lines', () => {
    const totals = calcBillTotals([
      { rate: 100, quantity: 2, discount: 0, tax_percent: 18 },
      { rate: 50, quantity: 1, discount: 0, tax_percent: 18 },
    ]);
    expect(totals.bill_subtotal).toBe(250);
    expect(totals.bill_tax).toBeCloseTo(45, 2);
    expect(totals.bill_total).toBeCloseTo(295, 2);
  });

  it('returns zeros for an empty bill', () => {
    const totals = calcBillTotals([]);
    expect(totals.bill_subtotal).toBe(0);
    expect(totals.bill_total).toBe(0);
  });
});
