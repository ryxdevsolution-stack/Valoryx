import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditBillPriceDialog from '@/components/audit/EditBillPriceDialog';

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

describe('EditBillPriceDialog', () => {
  it('renders line items and recomputes total when rate changes', () => {
    render(<EditBillPriceDialog open bill={sampleBill as any} onClose={vi.fn()} onSaved={vi.fn()} />);
    const rateInput = screen.getByLabelText(/rate.*widget/i) as HTMLInputElement;
    expect(rateInput.value).toBe('100');

    fireEvent.change(rateInput, { target: { value: '150' } });

    // line total: 150 * 2 = 300, +18% tax = 354
    expect(screen.getByTestId('bill-total').textContent).toContain('354');
  });

  it('opens SaveScopeDialog on Save click after a value changes', () => {
    render(<EditBillPriceDialog open bill={sampleBill as any} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/rate.*widget/i), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(screen.getByText(/how should this be saved/i)).toBeInTheDocument();
    expect(screen.getByText(/save as audit note/i)).toBeInTheDocument();
    expect(screen.getByText(/apply to bill/i)).toBeInTheDocument();
  });

  it('seeds inputs from audit_overrides when the bill already has one', () => {
    const billWithOverride = {
      ...sampleBill,
      audit_overrides: [
        { product_id: 'p1', product_name: 'Widget', rate: 99, quantity: 2, discount: 0, tax_percent: 18 },
      ],
    };
    render(<EditBillPriceDialog open bill={billWithOverride as any} onClose={vi.fn()} onSaved={vi.fn()} />);
    const rateInput = screen.getByLabelText(/rate.*widget/i) as HTMLInputElement;
    // Should seed from audit_overrides (99), not from items (100)
    expect(rateInput.value).toBe('99');
    // And show the resume-banner
    expect(screen.getByText(/resuming a prior audit note/i)).toBeInTheDocument();
  });

  it('disables Save when no values have changed', () => {
    render(<EditBillPriceDialog open bill={sampleBill as any} onClose={vi.fn()} onSaved={vi.fn()} />);
    const saveBtn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('shows the original value as a hint under each input', () => {
    render(<EditBillPriceDialog open bill={sampleBill as any} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getAllByText(/was:\s*100/i).length).toBeGreaterThan(0);
  });
});
