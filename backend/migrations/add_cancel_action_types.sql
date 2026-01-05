-- Add CANCEL and other missing action types to audit_log constraint
-- This fixes the "CANCEL" action type error when cancelling bills

-- Drop the existing constraint
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_type_check;

-- Recreate with all action types including CANCEL, EXCHANGE, and PRINT_BILL
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_type_check
CHECK (action_type IN (
    'LOGIN', 'LOGOUT', 'FAILED_LOGIN',
    'CREATE', 'UPDATE', 'DELETE', 'VIEW',
    'PRINT', 'EXPORT',
    'GRANT_PERMISSION', 'REVOKE_PERMISSION', 'BULK_UPDATE_PERMISSIONS',
    'CLIENT_CREATE', 'CLIENT_UPDATE', 'CLIENT_DELETE',
    'USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'USER_ACTIVATE', 'USER_DEACTIVATE',
    'BILL_CREATE', 'BILL_UPDATE', 'BILL_DELETE', 'BILL_PRINT', 'BILL_EXCHANGE', 'BILL_CANCEL',
    'PAYMENT_CREATE', 'PAYMENT_UPDATE', 'PAYMENT_DELETE',
    'STOCK_CREATE', 'STOCK_UPDATE', 'STOCK_DELETE', 'STOCK_IMPORT',
    'CUSTOMER_CREATE', 'CUSTOMER_UPDATE', 'CUSTOMER_DELETE',
    'REPORT_GENERATE', 'REPORT_EXPORT',
    'SETTINGS_UPDATE', 'CONFIG_UPDATE',
    -- Generic action types used in code
    'CANCEL', 'EXCHANGE', 'PRINT_BILL', 'PRINT_LABELS'
));

-- Verify the constraint was added
SELECT 'Constraint updated successfully' as status;
