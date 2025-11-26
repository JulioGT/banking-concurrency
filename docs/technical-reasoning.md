# Technical Reasoning & Design Decisions

This document explains the key technical decisions made in the Banking Concurrency System, including the reasoning behind each choice, alternatives considered, and tradeoffs.

---

## 🔒 Decision 1: Optimistic Locking vs Pessimistic Locking

### Decision
Use **optimistic locking with version-based concurrency control**

### Reasoning
- ✅ **High throughput:** No locks held = no waiting, better performance under load
- ✅ **No deadlocks:** Impossible by design (no lock acquisition order issues)
- ✅ **Horizontal scalability:** Works across multiple application servers without distributed lock coordination
- ✅ **Industry proven:** Used by Stripe, PayPal, and major payment processors
- ⚠️ **Tradeoff:** Requires retry logic on conflicts (acceptable with exponential backoff)

### Alternatives Considered
- ❌ **Pessimistic locking (`SELECT FOR UPDATE`):** Lower throughput, deadlock risk, doesn't scale horizontally
- ❌ **Distributed locks (Redis):** Additional infrastructure complexity, single point of failure
- ❌ **SERIALIZABLE isolation level:** Severe performance penalty, excessive transaction aborts

### Implementation
```sql
UPDATE accounts
SET balance = balance + $1, version = version + 1
WHERE id = $2 AND version = $3;  -- Only succeeds if version matches
```

Location: `src/repositories/AccountRepository.ts:66-72`

---

## 💻 Decision 2: TypeScript over JavaScript

### Decision
**TypeScript with strict mode enabled** (`tsconfig.json`)

### Reasoning
- ✅ **Type safety for financial calculations:** Prevents runtime errors with monetary operations
- ✅ **Better IDE support:** IntelliSense catches errors during development
- ✅ **Refactoring confidence:** Compile-time checks prevent breaking changes
- ✅ **Self-documenting code:** Interfaces serve as living documentation
- ✅ **Required for requirements:** Project specification calls for TypeScript

### Tradeoffs
- ⚠️ Additional build step required
- ⚠️ Learning curve for developers unfamiliar with TypeScript

### Configuration
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

---

## 💰 Decision 3: PostgreSQL NUMERIC vs DECIMAL/FLOAT

### Decision
Use PostgreSQL **`NUMERIC(15,2)`** type for all monetary values

### Reasoning
- ✅ **Exact decimal arithmetic:** No floating-point rounding errors
- ✅ **Financial compliance:** Required for banking applications (PCI-DSS, SOC 2)
- ✅ **Predictable rounding:** Banker's rounding built-in
- ✅ **Precision guarantees:** 15 digits total, 2 decimal places

### Problem Avoided
```javascript
// JavaScript floating point (WRONG for money)
console.log(0.1 + 0.2);  // 0.30000000000000004 ❌

// PostgreSQL NUMERIC (CORRECT for money)
SELECT 0.1 + 0.2;  -- 0.30 ✅
```

### Database Schema
```sql
CREATE TABLE accounts (
  balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  CONSTRAINT check_balance_non_negative CHECK (balance >= 0)
);
```

Location: `database/init.sql:15`

---

## 📊 Decision 4: Event Sourcing Lite (Balance Snapshots)

### Decision
Store **`balance_after`** snapshot in each transaction record

### Reasoning
- ✅ **O(1) balance queries:** Direct lookup instead of summing all transactions
- ✅ **Time travel capability:** Reconstruct balance at any historical date
- ✅ **Complete audit trail:** Every balance change is permanently recorded
- ✅ **Regulatory compliance:** Required for financial audits and investigations
- ✅ **Debugging aid:** Can verify balance calculation correctness

### Tradeoffs
- ⚠️ Slight storage overhead (8 bytes per transaction)
- ⚠️ Must maintain consistency between `balance` and `balance_after`

### Performance Comparison
```sql
-- Without snapshots: O(n) - must sum all transactions
SELECT SUM(amount) FROM transactions WHERE account_id = $1;

-- With snapshots: O(1) - direct lookup with index
SELECT balance_after FROM transactions
WHERE account_id = $1 AND created_at <= $2
ORDER BY created_at DESC LIMIT 1;
```

### Implementation
Location: `src/repositories/AccountRepository.ts:278-299`

---

## 🔐 Decision 5: READ COMMITTED Isolation Level

### Decision
Use **`READ COMMITTED`** isolation level for deposit/withdraw operations

### Reasoning
- ✅ **Prevents dirty reads:** Won't see uncommitted changes from other transactions
- ✅ **Good performance:** Minimal locking overhead
- ✅ **Compatible with optimistic locking:** Version check handles concurrency conflicts
- ✅ **PostgreSQL default:** Well-tested and widely understood
- ✅ **Sufficient guarantees:** Combined with optimistic locking, provides strong consistency

### Why Not Higher Isolation Levels?
- ❌ **`REPEATABLE READ`:** Unnecessary overhead, optimistic locking already handles race conditions
- ❌ **`SERIALIZABLE`:** Too restrictive, severe performance penalty (10-100x slower)

### Exception: Read Operations
Use **`REPEATABLE READ`** for queries requiring consistent snapshots:
- Account details with recent transactions
- Statement generation (date range reports)

### Configuration
```typescript
await txHelper.executeInTransaction(async (client) => {
  // Transaction logic
}, 'READ COMMITTED');  // Explicit isolation level
```

Location: `src/services/TransactionService.ts:98`

Documentation: `docs/isolation-levels.md`

---

## 🔑 Decision 6: Optional Idempotency Keys

### Decision
Support **optional client-provided idempotency keys** (UUID format)

### Reasoning
- ✅ **Network failure safety:** Clients can safely retry after timeouts
- ✅ **Webhook compatibility:** External systems (Stripe, PayPal) can retry without duplicates
- ✅ **Industry standard:** Matches Stripe, PayPal, Square, AWS APIs
- ✅ **Zero overhead when unused:** Optional parameter, no performance impact
- ✅ **Production requirement:** Critical for real-world financial APIs

### Use Cases
1. **Network timeouts:** Client retries failed request with same key
2. **Webhook retries:** Payment processor retries notification
3. **User double-clicks:** Prevents duplicate charges from UI
4. **Batch processing:** Script restart doesn't create duplicates

### Implementation
```sql
CREATE TABLE transactions (
  idempotency_key UUID UNIQUE,  -- Database-level uniqueness
  ...
);

CREATE INDEX idx_transactions_idempotency
ON transactions(idempotency_key)
WHERE idempotency_key IS NOT NULL;
```

**Logic:** Check for existing transaction before creating new one

Location: `src/services/TransactionService.ts:57-71`

---

## 🏗️ Decision 7: Repository Pattern

### Decision
Separate **data access layer** (Repository) from **business logic** (Service)

### Reasoning
- ✅ **Testability:** Can mock repository in service tests
- ✅ **Single Responsibility Principle:** Repository = SQL, Service = business logic
- ✅ **Maintainability:** Database changes isolated to one layer
- ✅ **SOLID principles:** Dependency inversion (depend on abstractions)
- ✅ **Code organization:** Clear boundaries between layers

### Architecture
```
Controller → Service → Repository → Database
  (HTTP)    (Logic)    (SQL)       (PostgreSQL)
```

### Example
```typescript
// Repository: Pure data access
class AccountRepository {
  async findById(client: PoolClient, id: string): Promise<Account> {
    const result = await client.query('SELECT * FROM accounts WHERE id = $1', [id]);
    return result.rows[0];
  }
}

// Service: Business logic
class TransactionService {
  async deposit(accountId: string, amount: number) {
    // Validation, retry logic, transaction orchestration
    const account = await this.repository.findById(client, accountId);
    // ... business logic
  }
}
```

Locations:
- Repository: `src/repositories/AccountRepository.ts`
- Service: `src/services/TransactionService.ts`

---

## ⏱️ Decision 8: Exponential Backoff with Jitter

### Decision
Retry failed operations with formula: **`delay = min(2^attempt × 50ms + random(0-50ms), 1000ms)`**

### Reasoning
- ✅ **Prevents thundering herd:** Jitter randomizes retry timing to avoid collisions
- ✅ **Adaptive backoff:** Gives time for conflicting transactions to complete
- ✅ **Bounded delays:** Max 1000ms prevents indefinite waits
- ✅ **Industry standard:** Used by AWS SDK, Google Cloud, Stripe

### Formula Breakdown
```typescript
// Base delay: doubles each attempt
const exponentialDelay = Math.pow(2, attempt) * 50;  // 50ms → 100ms → 200ms → 400ms

// Jitter: random 0-50ms to spread out retries
const jitter = Math.random() * 50;

// Cap at 1000ms to prevent excessive waits
const totalDelay = Math.min(exponentialDelay + jitter, 1000);
```

### Retry Schedule
| Attempt | Base Delay | Jitter Range | Total Range |
|---------|-----------|--------------|-------------|
| 1 | 50ms | 0-50ms | 50-100ms |
| 2 | 100ms | 0-50ms | 100-150ms |
| 3 | 200ms | 0-50ms | 200-250ms |
| 4 | 400ms | 0-50ms | 400-450ms |
| 5+ | 1000ms | 0-50ms | 1000-1050ms |

### Configuration
```env
MAX_RETRIES=5
RETRY_BASE_DELAY=50
RETRY_MAX_DELAY=1000
```

Location: `src/services/TransactionService.ts:115-122`

---

## 🔄 Decision 9: CQRS Pattern (Simplified)

### Decision
Separate **read operations** (Queries) from **write operations** (Commands)

### Reasoning
- ✅ **Clarity:** Clear separation of concerns
- ✅ **Optimization:** Different requirements for reads vs writes
- ✅ **Scalability:** Can scale reads and writes independently
- ✅ **Testability:** Easier to test in isolation
- ✅ **Future-proofing:** Can add read replicas for queries later

### Implementation
```typescript
// Commands: Write operations with optimistic locking
class TransactionService {
  async deposit(accountId: string, amount: number) { ... }
  async withdraw(accountId: string, amount: number) { ... }
}

// Queries: Read operations, often with REPEATABLE READ
class AccountQueryService {
  async getBalance(accountId: string) { ... }
  async getTransactionHistory(accountId: string) { ... }
  async generateStatement(accountId: string, startDate: Date, endDate: Date) { ... }
}
```

### Benefits Realized
- Read queries use simpler logic (no version checks)
- Write operations focused on consistency guarantees
- Can add caching to read operations without affecting writes
- Clear API boundaries

Locations:
- Commands: `src/services/TransactionService.ts`
- Queries: `src/services/AccountQueryService.ts`

---

## 🎯 Decision 10: Controller Layer Pattern

### Decision
Separate **HTTP handling** (Controller) from **routing** (Routes)

### Reasoning
- ✅ **Single Responsibility:** Routes define endpoints, Controllers handle HTTP logic
- ✅ **Testability:** Can unit test controllers without Express
- ✅ **Maintainability:** HTTP response logic isolated from routing configuration
- ✅ **Dependency Injection:** Controllers receive services via constructor

### Architecture
```
Routes (routing) → Controller (HTTP) → Service (business) → Repository (data)
```

### Example
```typescript
// Route: Just defines the endpoint
router.post('/:id/deposit', validateAccountId, validateBody,
  (req, res, next) => accountController.deposit(req, res, next)
);

// Controller: Handles HTTP logic
class AccountController {
  async deposit(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { amount, idempotencyKey } = req.body;
    const result = await this.transactionService.deposit(id, amount, idempotencyKey);
    res.status(result.isDuplicate ? 200 : 201).json({ success: true, data: result });
  }
}
```

Locations:
- Routes: `src/routes/accounts.ts`
- Controller: `src/controllers/AccountController.ts`

---

## 🔓 Decision 11: No Authentication in v1.0

### Decision
**No authentication or authorization** in current version

### Reasoning
- ⚠️ **Prototype/demonstration focus:** Showcasing concurrency handling patterns
- ⚠️ **Explicitly documented:** README clearly states "add authentication in production"
- ⚠️ **Scope management:** Keeps focus on core concurrency problem
- ❌ **NOT production-ready:** Must add auth before real deployment

### Required for Production
Before deploying to production, implement:

1. **Authentication:**
   - JWT tokens or OAuth2
   - Session management
   - Token refresh mechanism

2. **Authorization:**
   - Role-Based Access Control (RBAC)
   - Account ownership validation
   - Permission checks per endpoint

3. **Security Hardening:**
   - Rate limiting (per user/IP)
   - TLS/HTTPS encryption
   - CORS configuration
   - Security headers (helmet.js)
   - Input sanitization

4. **Audit Logging:**
   - Who performed the action
   - When it occurred
   - Source IP address
   - User agent

### Current State
API documentation explicitly warns: `Authentication: None required for v1.0 (add authentication in production)`

Location: `docs/api.md:13`

---

## 🗄️ Decision 12: PostgreSQL Connection Pooling

### Decision
Use **connection pooling** with 2-20 connections (configurable)

### Reasoning
- ✅ **Performance:** Reusing connections avoids overhead of creating new ones
- ✅ **Resource management:** Limits concurrent database connections
- ✅ **Scalability:** Can tune pool size based on load
- ✅ **Connection reuse:** Reduces PostgreSQL connection overhead

### Configuration
```env
DB_POOL_MAX=20          # Maximum connections
DB_POOL_MIN=2           # Keep-alive connections
DB_POOL_IDLE_TIMEOUT=30000      # 30 seconds
DB_CONNECTION_TIMEOUT=2000      # 2 seconds
```

### Why These Values?
- **Min 2:** Keeps connections warm for fast response
- **Max 20:** Prevents overwhelming database (typical PostgreSQL max = 100)
- **Idle timeout 30s:** Releases unused connections
- **Connect timeout 2s:** Fails fast if database unreachable

### Pool Usage Pattern
```typescript
const client = await pool.connect();  // Get connection from pool
try {
  await client.query('BEGIN');
  // ... queries
  await client.query('COMMIT');
} finally {
  client.release();  // Return connection to pool
}
```

Location: `src/config/database.ts:8-18`

---

## 📏 Decision 13: Transaction Limits

### Decision
Enforce **maximum transaction amounts** at multiple layers

### Limits
```env
MAX_DEPOSIT_AMOUNT=1000000    # $1,000,000
MAX_WITHDRAW_AMOUNT=500000    # $500,000
```

### Reasoning
- ✅ **Fraud prevention:** Limits damage from compromised accounts
- ✅ **Risk management:** Prevents large unauthorized transfers
- ✅ **Regulatory compliance:** AML (Anti-Money Laundering) requirements
- ✅ **Configurable:** Can adjust based on account type/risk profile

### Enforcement Layers
1. **Middleware validation** (`validator.ts:50-56`)
2. **Service layer validation** (`TransactionService.ts:46-50`)
3. **Business logic checks**

### Future Enhancement
Support per-account limits based on:
- Account verification level
- Transaction history
- Risk score
- Account age

---

## 🧪 Decision 14: Concurrency Testing Strategy

### Decision
Use **Worker Threads** for true parallel execution in tests

### Reasoning
- ✅ **Real parallelism:** Worker Threads run on separate CPU cores
- ✅ **Simulates production:** Multiple clients accessing API simultaneously
- ✅ **Validates concurrency handling:** Proves optimistic locking works under load
- ✅ **Configurable load:** Can adjust workers and operations per worker

### Test Configuration
```env
TEST_NUM_WORKERS=50             # Concurrent clients
TEST_OPERATIONS_PER_WORKER=10   # Operations per client
# Total: 500 concurrent operations
```

### Validation Metrics
```
✅ Success rate > 95%
✅ Balance integrity (expected === actual)
✅ Retry statistics (confirms conflict detection)
✅ Performance metrics (throughput, latency)
```

### Why Not Just Promises?
```javascript
// Promise.all() - NOT true parallelism (single-threaded)
await Promise.all(operations.map(op => doOperation()));

// Worker Threads - TRUE parallelism (multi-threaded)
const workers = Array.from({ length: 50 }, () => new Worker('worker.js'));
```

Location: `tests/concurrency/concurrency-test.ts`

---

## 📝 Summary Table

| Decision | Choice | Key Benefit | Tradeoff |
|----------|--------|-------------|----------|
| Concurrency Control | Optimistic Locking | High throughput | Requires retries |
| Language | TypeScript | Type safety | Build step |
| Money Storage | NUMERIC(15,2) | Exact arithmetic | Slight overhead |
| Audit Trail | Balance snapshots | O(1) queries | Storage overhead |
| Isolation Level | READ COMMITTED | Performance | Non-repeatable reads (handled by version check) |
| Idempotency | Optional UUID keys | Network safety | None (optional) |
| Architecture | Repository Pattern | Testability | More files |
| Retry Strategy | Exponential + Jitter | Avoid collisions | Increased latency |
| Read/Write | CQRS (simplified) | Optimization | Two service classes |
| HTTP Layer | Controller Pattern | Clean separation | Additional abstraction |
| Auth | None (v1.0) | Focus on core logic | NOT production-ready |
| Connections | Pool (2-20) | Resource efficiency | Configuration complexity |
| Testing | Worker Threads | True parallelism | OS-dependent |

---

## 🔗 References

- **Optimistic Locking:** "Designing Data-Intensive Applications" by Martin Kleppmann
- **Idempotency:** Stripe API Documentation (https://stripe.com/docs/api/idempotent_requests)
- **CQRS Pattern:** Microsoft Azure Architecture Center
- **Exponential Backoff:** AWS Architecture Blog
- **PostgreSQL Isolation:** PostgreSQL Documentation Chapter 13

---

**Document Version:** 1.0
**Last Updated:** 2025-11-26
**Author:** Julio González
