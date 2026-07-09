import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditBillPriceDialog from '@/components/audit/EditBillPriceDialog';
import { updateBillFromAudit } from '@/services/billingService';

vi.mock('@/services/billingService', () => ({
  updateBillFromAudit: vi.fn(() => Promise.resolve({ success: true, message: 'ok', bill: {}, scope: 'audit_only' })),
}));
vi.mock('@/utils/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The dialog reads the client's currency via useCurrency → ClientContext;
// tests render it without a ClientProvider, so stub the hook.
vi.mock('@/lib/useCurrency', () => ({
  useCurrency: () => ({
    symbol: '₹',
    locale: 'en-IN',
    code: 'INR',
    taxLabel: 'GST',
    format: (n: number | string | null | undefined) =>
      `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  }),
}));

const sampleBill = {
  bill_id: 'bill-1',
  bill_number: 1001,
  customer_name: 'Acme Corp',
  items: [
    { product_id: 'p1', product_name: 'Widget', rate: 100, quantity: 2, discount: 0, tax_percent: 18 },
  ],
  gst_percentage: 18,
  payment_type: 'cash',
  subtotal: 200,
};

/** Render in correction mode: owner/manager opens the bill, then clicks "Correct prices". */
function renderEditing(props: Record<string, unknown> = {}) {
  const utils = render(
    <EditBillPriceDialog open bill={sampleBill as any} canCorrect onClose={vi.fn()} onSaved={vi.fn()} {...props} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /correct prices/i }));
  return utils;
}

describe('EditBillPriceDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens read-only: inputs disabled, no Save, until "Correct prices" is clicked', () => {
    render(<EditBillPriceDialog open bill={sampleBill as any} canCorrect onClose={vi.fn()} onSaved={vi.fn()} />);
    const rateInput = screen.getByLabelText(/rate.*widget/i) as HTMLInputElement;
    expect(rateInput.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /save audit note/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /correct prices/i }));
    expect((screen.getByLabelText(/rate.*widget/i) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: /save audit note/i })).toBeInTheDocument();
  });

  it('hides the correction entry point entirely when canCorrect is false', () => {
    render(<EditBillPriceDialog open bill={sampleBill as any} canCorrect={false} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /correct prices/i })).not.toBeInTheDocument();
    expect((screen.getByLabelText(/rate.*widget/i) as HTMLInputElement).disabled).toBe(true);
  });

  it('recomputes total when rate changes in correction mode', () => {
    renderEditing();
    fireEvent.change(screen.getByLabelText(/rate.*widget/i), { target: { value: '150' } });
    // line total: 150 * 2 = 300, +18% tax = 354
    expect(screen.getByTestId('bill-total').textContent).toContain('354');
  });

  it('saves directly as an audit note (no scope choice) on Save click after a value changes', async () => {
    const onSaved = vi.fn();
    renderEditing({ onSaved });
    fireEvent.change(screen.getByLabelText(/rate.*widget/i), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /save audit note/i }));

    expect(screen.queryByText(/how should this be saved/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/apply to bill/i)).not.toBeInTheDocument();

    await waitFor(() => expect(updateBillFromAudit).toHaveBeenCalledTimes(1));
    expect(updateBillFromAudit).toHaveBeenCalledWith('bill-1', expect.objectContaining({ items: expect.any(Array) }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('seeds inputs from audit_overrides when the bill already has one', () => {
    const billWithOverride = {
      ...sampleBill,
      audit_overrides: [
        { product_id: 'p1', product_name: 'Widget', rate: 99, quantity: 2, discount: 0, tax_percent: 18 },
      ],
    };
    render(<EditBillPriceDialog open bill={billWithOverride as any} canCorrect onClose={vi.fn()} onSaved={vi.fn()} />);
    const rateInput = screen.getByLabelText(/rate.*widget/i) as HTMLInputElement;
    // Should seed from audit_overrides (99), not from items (100)
    expect(rateInput.value).toBe('99');
    expect(screen.getByText(/resuming a prior audit note/i)).toBeInTheDocument();
  });

  it('disables Save when no values have changed', () => {
    renderEditing();
    const saveBtn = screen.getByRole('button', { name: /save audit note/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('shows the original value as a hint under each input', () => {
    render(<EditBillPriceDialog open bill={sampleBill as any} canCorrect onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getAllByText(/was:\s*100/i).length).toBeGreaterThan(0);
  });
});
