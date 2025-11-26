-- ═══════════════════════════════════════════════════════════
-- SEED DATA: Test data for development
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- Insert test account with fixed id
-- ───────────────────────────────────────────────────────────
INSERT INTO accounts (id, balance, version, created_at, updated_at)
VALUES (
    '123e4567-e89b-12d3-a456-426614174000',
    1000.00,
    0,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────
-- Insert example transactions
-- ───────────────────────────────────────────────────────────
INSERT INTO transactions (account_id, amount, type, balance_after, created_at)
VALUES 
    ('123e4567-e89b-12d3-a456-426614174000', 1000.00, 'deposit', 1000.00, NOW() - INTERVAL '30 days'),
    ('123e4567-e89b-12d3-a456-426614174000', -200.00, 'withdraw', 800.00, NOW() - INTERVAL '20 days'),
    ('123e4567-e89b-12d3-a456-426614174000', 500.00, 'deposit', 1300.00, NOW() - INTERVAL '10 days'),
    ('123e4567-e89b-12d3-a456-426614174000', -300.00, 'withdraw', 1000.00, NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────
-- Verification
-- ───────────────────────────────────────────────────────────

-- Verify account created
SELECT 
    id, 
    balance, 
    version, 
    created_at 
FROM accounts 
WHERE id = '123e4567-e89b-12d3-a456-426614174000';

-- Verify transactions
SELECT 
    id,
    amount,
    type,
    balance_after,
    created_at
FROM transactions
WHERE account_id = '123e4567-e89b-12d3-a456-426614174000'
ORDER BY created_at ASC;

-- Show summary
SELECT 
    COUNT(*) as total_accounts,
    SUM(balance) as total_balance
FROM accounts;

SELECT 
    COUNT(*) as total_transactions,
    COUNT(CASE WHEN type = 'deposit' THEN 1 END) as deposits,
    COUNT(CASE WHEN type = 'withdraw' THEN 1 END) as withdrawals
FROM transactions;