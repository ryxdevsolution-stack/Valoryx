-- Create expense table with UUID for client_id to match client_entry table
CREATE TABLE IF NOT EXISTS expense (
    expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES client_entry(client_id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    expense_date DATE NOT NULL,
    payment_method VARCHAR(50),
    receipt_url VARCHAR(500),
    notes TEXT,
    extra_data JSONB,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for expense table
CREATE INDEX IF NOT EXISTS idx_expense_client_id ON expense(client_id);
CREATE INDEX IF NOT EXISTS idx_expense_date ON expense(expense_date);
CREATE INDEX IF NOT EXISTS idx_expense_created_at ON expense(created_at);
CREATE INDEX IF NOT EXISTS idx_expense_client_date ON expense(client_id, expense_date);

-- Create expense_summary table with UUID for client_id
CREATE TABLE IF NOT EXISTS expense_summary (
    summary_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES client_entry(client_id) ON DELETE CASCADE,
    period_type VARCHAR(20) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_expenses NUMERIC(12, 2) DEFAULT 0,
    category_breakdown JSONB,
    expense_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for expense_summary table
CREATE INDEX IF NOT EXISTS idx_expense_summary_client_id ON expense_summary(client_id);
CREATE INDEX IF NOT EXISTS idx_expense_summary_period_start ON expense_summary(period_start);
CREATE INDEX IF NOT EXISTS idx_expense_summary_client_period ON expense_summary(client_id, period_type, period_start);

-- Create unique constraint to prevent duplicate summaries
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_summary_unique
ON expense_summary(client_id, period_type, period_start, period_end);

-- Add comments
COMMENT ON TABLE expense IS 'Stores individual expense records for tracking business expenses';
COMMENT ON TABLE expense_summary IS 'Pre-calculated expense summaries for faster reporting by time period';
COMMENT ON COLUMN expense.category IS 'Expense category: Rent, Utilities, Salary, Supplies, Maintenance, Transportation, Marketing, Other';
COMMENT ON COLUMN expense.payment_method IS 'Payment method: cash, bank_transfer, card, upi';
COMMENT ON COLUMN expense_summary.period_type IS 'Time period type: day, week, month, year';
