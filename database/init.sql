-- ═══════════════════════════════════════════════════════════
-- SCHEMA: Banking Concurrency System
-- Versión: 1.0.0
-- ═══════════════════════════════════════════════════════════

-- Enable extension for UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ───────────────────────────────────────────────────────────
-- TABLE: accounts
-- Propósito: Store current balance accounts
-- ───────────────────────────────────────────────────────────
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Constraint: Balance never negative
    CONSTRAINT check_balance_non_negative CHECK (balance >= 0)
);

-- Comments for reference/documentation 
COMMENT ON TABLE accounts IS 'Bank accounts with optimistic locking';
COMMENT ON COLUMN accounts.balance IS 'Current balance (decimal presition for finance)';
COMMENT ON COLUMN accounts.version IS 'Optimistic version locking (incremented after each update)';

CREATE INDEX idx_accounts_id ON accounts(id);

-- ───────────────────────────────────────────────────────────
-- TABLE: transactions
-- Propósito: Complete transaction history (Light Event Sourcing)
-- ───────────────────────────────────────────────────────────
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    type VARCHAR(20) NOT NULL,
    balance_after NUMERIC(15, 2) NOT NULL,
    idempotency_key UUID UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Constraint: valid types
    CONSTRAINT check_transaction_type CHECK (type IN ('deposit', 'withdraw'))
);

COMMENT ON TABLE transactions IS 'Historial completo de transacciones (auditoría)';
COMMENT ON COLUMN transactions.amount IS 'Monto de la transacción (positivo para deposit, negativo para withdraw)';
COMMENT ON COLUMN transactions.balance_after IS 'Balance después de esta transacción (para Event Sourcing Ligero)';
COMMENT ON COLUMN transactions.idempotency_key IS 'Key para prevenir transacciones duplicadas';

CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_account_created ON transactions(account_id, created_at DESC);
CREATE INDEX idx_transactions_idempotency ON transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ───────────────────────────────────────────────────────────
-- TRIGGER: Auto-update updated_at
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════

SELECT 
    tablename, 
    schemaname 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('accounts', 'transactions');


SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('accounts'::regclass, 'transactions'::regclass)
ORDER BY table_name, constraint_name;