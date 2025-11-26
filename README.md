# Banking Concurrency System

A robust banking system implementing optimistic locking for concurrent transaction handling, built with TypeScript, Node.js, Express, and PostgreSQL.

## 🎯 Project Overview

This system demonstrates professional handling of concurrent financial transactions using:

- **Optimistic Locking** with version-based conflict detection
- **Event Sourcing Ligero** for complete audit trails
- **CQRS** pattern (separated Commands and Queries)
- **Idempotency** support to prevent duplicate transactions
- **Exponential Backoff** retry strategy with jitter
- **Type-Safe** implementation with TypeScript strict mode

### Key Features

✅ **Concurrent Transaction Handling** - Multiple clients can operate simultaneously without data corruption  
✅ **Automatic Conflict Resolution** - Smart retry logic handles race conditions  
✅ **Balance Integrity** - Mathematical correctness guaranteed through optimistic locking  
✅ **Complete Audit Trail** - Event Sourcing tracks every state change  
✅ **Time Travel Queries** - Historical balance reconstruction at any point in time  
✅ **Production-Ready Patterns** - Repository, Service Layer, Dependency Injection

## Technical Reasoning

📖 **[Complete Technical Reasoning & Design Decisions →](docs/technical-reasoning.md)**

---

## 🏗️ Architecture

### 3-Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│         PRESENTATION LAYER (Express REST API)       │
│  Controllers + Routes + Validation Middleware       │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│           BUSINESS LOGIC LAYER (Services)           │
│  • TransactionService (Commands - Write)            │
│  • AccountQueryService (Queries - Read)             │
│  • Retry Logic + Validation + Orchestration         │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│        DATA ACCESS LAYER (Repository + DB)          │
│  • AccountRepository (SQL Queries)                  │
│  • TransactionHelper (Transaction Management)       │
│  • PostgreSQL 15+ (ACID Guarantees)                 │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ LTS
- **PostgreSQL** 15+ (or Docker)
- **npm** or **yarn**

### Installation

```bash
# Clone repository
git clone <repository-url>
cd banking-concurrency

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings
```

### Database Setup

#### Option A: Using Docker (Recommended)

```bash
# Start PostgreSQL container
docker run --name banking-db \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=secret123 \
  -e POSTGRES_DB=banking \
  -p 5433:5432 \
  -d postgres:15-alpine

# Apply schema
docker exec -i banking-db psql -U admin -d banking < database/init.sql

# Load seed data
docker exec -i banking-db psql -U admin -d banking < database/seed.sql
```

#### Option B: Local PostgreSQL

```bash
# Create database
createdb banking -U postgres

# Apply schema
psql -U postgres -d banking -f database/init.sql

# Load seed data
psql -U postgres -d banking -f database/seed.sql
```

### Running the Application

```bash
# Development mode (with hot-reload)
npm run dev

# Production mode
npm run build
npm start
```

Server will start on `http://localhost:3000`

---

## 🧪 Testing

### Unit Tests

```bash
# Run all tests with coverage
npm test

# Watch mode
npm run test:watch
```

### Concurrency Test

**Important:** The concurrency test requires the server to be running.

**Terminal 1 - Start server:**

```bash
npm run dev
```

Wait for: `✅ Server running on port 3000`

**Terminal 2 - Run test:**

```bash
# Build test files
npm run test:concurrency:build

# Execute test
npm run test:concurrency:run
```

#### Expected Output

```
═══════════════════════════════════════════════════════════
📊 TEST RESULTS
═══════════════════════════════════════════════════════════

Operations:
  Total:      50
  Successful: 50 (100.0%)
  Failed:     0

Concurrency Handling:
  Total retries:             29
  Operations with retries:   15
  Retry rate:                30.0%

Performance:
  Duration:       1.22s
  Throughput:     40.98 ops/s

Balance Verification:
  Balance matches:       ✅ YES

═══════════════════════════════════════════════════════════

✅ TEST PASSED: All verifications successful!
```

#### Test Configuration

Edit `.env` to adjust test parameters:

```env
TEST_NUM_WORKERS=10              # Number of concurrent clients
TEST_OPERATIONS_PER_WORKER=5     # Operations per client
MAX_RETRIES=5                    # Retry attempts on conflicts
```

---

## 📡 API Documentation

See [api.md](docs/api.md) to get more information about API Documentation

---

## ⚙️ Configuration

All configuration is externalized via `.env`:

### Server

```env
NODE_ENV=development          # development | production
PORT=3000                     # Server port
```

### Database

```env
DB_HOST=localhost
DB_PORT=5433
DB_NAME=banking
DB_USER=admin
DB_PASSWORD=secret123

DB_POOL_MAX=20               # Max connections
DB_POOL_MIN=2                # Min connections
```

### Retry Logic

```env
MAX_RETRIES=5                # Max retry attempts on conflicts
RETRY_BASE_DELAY=50          # Base delay (ms) for exponential backoff
RETRY_MAX_DELAY=1000         # Maximum delay between retries
```

### Transaction Limits

```env
MAX_DEPOSIT_AMOUNT=1000000   # Maximum single deposit
MAX_WITHDRAW_AMOUNT=500000   # Maximum single withdrawal
```

### Logging

```env
LOG_LEVEL=info               # debug | info | warn | error
LOG_SQL_QUERIES=false        # Log all SQL queries
```

---

## 🔒 Concurrency Strategy

### Optimistic Locking

Each account has a `version` column that increments on every update:

```sql
UPDATE accounts
SET balance = balance + $1, version = version + 1
WHERE id = $2 AND version = $3;  -- Only succeeds if version matches
```

**Conflict Detection:** If another transaction updated the account first, the version won't match and the query returns 0 rows → `ConcurrencyConflictError`

**Retry Logic:** Automatic exponential backoff with jitter (configurable, default 5 attempts)

### Why Optimistic Locking?

✅ **High Throughput** - No blocking, no waiting for locks  
✅ **No Deadlocks** - Impossible by design  
✅ **Horizontal Scalability** - Works across multiple servers  
✅ **Industry Standard** - Used by Stripe, PayPal, major payment processors

### Alternatives Considered

❌ **Pessimistic Locking (FOR UPDATE)** - Lower throughput, deadlock risk  
❌ **Distributed Locks (Redis)** - Additional infrastructure, single point of failure  
❌ **Serializable Isolation** - Severe performance impact

---

## 📊 Lightweight Event Sourcing

Every transaction stores `balance_after` for complete audit trail:

```sql
CREATE TABLE transactions (
  id UUID,
  amount NUMERIC(15,2),
  balance_after NUMERIC(15,2),  -- Balance snapshot after this transaction
  created_at TIMESTAMP
);
```

### Benefits

✅ **Time Travel** - Reconstruct balance at any historical date  
✅ **Audit Trail** - Complete transaction history  
✅ **Debugging** - Compare expected vs actual balance  
✅ **Compliance** - Regulatory requirements for financial systems

### Example: Historical Balance Query

```sql
SELECT balance_after
FROM transactions
WHERE account_id = $1 AND created_at <= '2025-01-15'
ORDER BY created_at DESC
LIMIT 1;
```

O(1) with index vs O(n) summing all transactions.

---

## 🔑 Idempotency

Clients can provide an `idempotencyKey` (UUID) to make operations idempotent:

```typescript
POST /accounts/:id/deposit
{
  "amount": 100,
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000"
}
```

**First Request:** Processes normally  
**Duplicate Request (same key):** Returns existing transaction, balance unchanged

### Why Idempotency?

✅ **Network Failures** - Safe to retry after timeout  
✅ **Prevent Double Charges** - Critical in financial systems  
✅ **API Best Practice** - Standard in Stripe, PayPal, Adyen

- https://stripe.com/docs/api/idempotent_requests
- https://developer.paypal.com/api/rest/requests/
- https://cloud.google.com/apis/design/design_patterns#request_duplication
- Python: https://github.com/stripe/stripe-python
- Node.js: https://github.com/stripe/stripe-node
- Ruby: https://github.com/stripe/stripe-ruby

---

## 🛠️ Development

### Project Structure

```
banking-concurrency/
├── src/
│   ├── config/
│   │   ├── app.ts                 # Centralized configuration
│   │   └── database.ts            # PostgreSQL connection pool
│   ├── models/
│   │   ├── Account.ts             # Account interface
│   │   └── Transaction.ts         # Transaction interface
│   ├── utils/
│   │   ├── errors.ts              # Custom error classes
│   │   └── transaction-helper.ts  # Transaction management
│   ├── repositories/
│   │   └── AccountRepository.ts   # SQL queries
│   ├── services/
│   │   ├── TransactionService.ts  # Commands (write)
│   │   └── AccountQueryService.ts # Queries (read)
│   ├── controllers/
│   │   └── AccountController.ts   # HTTP handlers
│   ├── middleware/
│   │   ├── validator.ts           # Request validation
│   │   └── errorHandler.ts        # Global error handler
│   ├── routes/
│   │   └── accounts.ts            # Route definitions
│   └── index.ts                   # Entry point
├── tests/
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   └── concurrency/               # Concurrency tests
│       ├── concurrency-test.ts
│       └── worker.ts
├── database/
│   ├── init.sql                   # Database schema
│   └── seed.sql                   # Seed data
└── docs/
    ├── api.md                     # Complete API reference
    ├── isolation-levels.md        # Database isolation levels
    └── technical-reasoning.md     # Design decisions & justifications
```

### Code Quality

```bash
# Linting
npm run lint

# Format code
npm run format

# Type checking
npx tsc --noEmit
```

### Scripts

```bash
npm run dev              # Development server with hot-reload
npm run build            # Compile TypeScript
npm start                # Run compiled production code
npm test                 # Run unit tests
npm run test:watch       # Unit tests in watch mode
npm run lint             # ESLint
npm run format           # Prettier
npm run clean            # Remove dist/
```

---

## 🚀 Production Considerations

### Database

- **Connection Pooling:** Configured for optimal performance (max: 20, min: 2)
- **Indexes:** All queries use indexed columns for O(1) lookups
- **Constraints:** CHECK constraints enforce business rules at DB level
- **Backups:** Implement regular backups (pg_dump recommended)

### Monitoring

- **Logs:** Structured logging with configurable levels
- **Metrics:** Track retry rate, throughput, error rates
- **Alerts:** Set up alerts for high retry rates or errors

### Scaling

- **Horizontal:** Optimistic locking works across multiple instances
- **Vertical:** Increase DB_POOL_MAX for higher throughput
- **Database:** PostgreSQL read replicas for read-heavy workloads

---

## 📚 Technical Decisions

### Why TypeScript?

✅ Type safety prevents runtime errors in financial calculations  
✅ IntelliSense improves developer productivity  
✅ Refactoring is safer with compile-time checks

### Why PostgreSQL?

✅ ACID guarantees  
✅ NUMERIC type for precise decimal arithmetic  
✅ 4 isolation levels for flexibility  
✅ Industry standard for financial systems

### Why Optimistic Locking?

✅ Higher throughput than pessimistic locking  
✅ No deadlock risk  
✅ Scales horizontally  
✅ Used by Stripe, PayPal, major payment processors

---

**Technologies Used:**

- TypeScript 5.3+
- Node.js 20 LTS
- Express 4.18
- PostgreSQL 15
- Jest 29
- Docker

---

Made with ❤️ and attention to detail
