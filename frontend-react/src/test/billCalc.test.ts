import { describe, it, expect } from 'vitest';
import { calcLine, calcBillTotals, netCost } from '@/utils/billCalc';

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

describe('netCost (purchase/supplier discount)', () => {
  it('reduces the gross cost by the purchase discount %', () => {
    // ₹100 list cost with a 10% supplier discount → effective ₹90
    expect(netCost(100, 10)).toBe(90);
  });

  it('returns the gross cost unchanged when discount is 0', () => {
    expect(netCost(250, 0)).toBe(250);
  });

  it('returns undefined when no gross cost is known', () => {
    expect(netCost(undefined)).toBeUndefined();
    expect(netCost(null)).toBeUndefined();
  });

  it('clamps a discount above 100 to 100 (cost floors at 0)', () => {
    expect(netCost(100, 150)).toBe(0);
  });

  it('clamps a negative discount to 0', () => {
    expect(netCost(100, -20)).toBe(100);
  });
});

describe('customer discount on a bill line (off rate, before GST)', () => {
  it('matches the CreateBill line math: discounted taxable then GST', () => {
    // A product with a 10% customer discount pre-fills the line. Rate ₹100, qty 2, GST 18%.
    const line = calcLine({ rate: 100, quantity: 2, discount: 10, tax_percent: 18 });
    expect(line.line_taxable).toBeCloseTo(180, 2);     // 200 - 10%
    expect(line.line_tax_amount).toBeCloseTo(32.4, 2); // 18% of 180
    expect(line.line_total).toBeCloseTo(212.4, 2);     // 180 + 32.4
  });
});
