# API Documentation

Complete API reference for Banking Concurrency System.

## Base URL

```
http://localhost:3000
```

## Authentication

_None required for v1.0 (add authentication in production)_

## Response Format

All responses follow this structure:

**Success:**

```json
{
  "success": true,
  "data": {
    /* response data */
  }
}
```

**Error:**

```json
{
  "success": false,
  "error": "ErrorType",
  "message": "Human-readable error message"
}
```

## Status Codes

- `200` - Success
- `201` - Created (new transaction)
- `400` - Bad Request (validation error, insufficient funds)
- `404` - Not Found (account doesn't exist)
- `409` - Conflict (duplicate transaction)
- `500` - Internal Server Error
- `503` - Service Unavailable (database down)

### Endpoints

#### Health Check

```http
GET /health
```

**Response:**

```json
{
  "success": true,
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-11-25T10:00:00.000Z",
  "config": {
    "maxRetries": 5,
    "maxDepositAmount": 1000000,
    "maxWithdrawAmount": 500000
  }
}
```

---

#### Get Balance

```http
GET /accounts/:id/balance
```

**Response:**

```json
{
  "success": true,
  "data": {
    "accountId": "123e4567-e89b-12d3-a456-426614174000",
    "balance": 1000.0
  }
}
```

---

#### Get Account Details

```http
GET /accounts/:id
```

**Response:**

```json
{
  "success": true,
  "data": {
    "account": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "balance": 1000.0,
      "version": 5,
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-11-25T10:00:00.000Z"
    },
    "recentTransactions": [
      {
        "id": "...",
        "amount": 100.0,
        "type": "deposit",
        "balance_after": 1100.0,
        "created_at": "2025-11-25T09:00:00.000Z"
      }
    ]
  }
}
```

---

#### Deposit

```http
POST /accounts/:id/deposit
Content-Type: application/json

{
  "amount": 100.00,
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000"  // optional
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "...",
      "accountId": "123e4567-e89b-12d3-a456-426614174000",
      "amount": 100.0,
      "type": "deposit",
      "balanceAfter": 1100.0,
      "createdAt": "2025-11-25T10:00:00.000Z"
    },
    "newBalance": 1100.0,
    "isDuplicate": false,
    "retries": 2
  }
}
```

---

#### Withdraw

```http
POST /accounts/:id/withdraw
Content-Type: application/json

{
  "amount": 50.00,
  "idempotencyKey": "7c9e6679-7425-40de-944b-e07fc1f90ae7"  // optional
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "...",
      "accountId": "123e4567-e89b-12d3-a456-426614174000",
      "amount": -50.0,
      "type": "withdraw",
      "balanceAfter": 1050.0,
      "createdAt": "2025-11-25T10:00:00.000Z"
    },
    "newBalance": 1050.0,
    "isDuplicate": false,
    "retries": 0
  }
}
```

**Error Response (Insufficient Funds):**

```json
{
  "success": false,
  "error": "Insufficient Funds",
  "message": "Insufficient funds. Current balance: 100, attempted withdrawal: 500"
}
```

---

#### Get Transaction History

```http
GET /accounts/:id/transactions?limit=50&offset=0
```

**Response:**

```json
{
  "success": true,
  "data": {
    "accountId": "123e4567-e89b-12d3-a456-426614174000",
    "transactions": [
      {
        "id": "...",
        "account_id": "...",
        "amount": 100.0,
        "type": "deposit",
        "balance_after": 1100.0,
        "created_at": "2025-11-25T10:00:00.000Z"
      }
    ],
    "pagination": {
      "limit": 50,
      "offset": 0,
      "count": 10
    }
  }
}
```

---

#### Generate Statement

```http
GET /accounts/:id/statement?startDate=2025-01-01&endDate=2025-12-31
```

**Response:**

```json
{
  "success": true,
  "data": {
    "account": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "balance": 1500.0,
      "created_at": "2025-01-01T00:00:00.000Z"
    },
    "period": {
      "startDate": "2025-01-01T00:00:00.000Z",
      "endDate": "2025-12-31T23:59:59.999Z"
    },
    "initialBalance": 1000.0,
    "finalBalance": 1500.0,
    "transactions": [
      /* ... */
    ],
    "summary": {
      "totalDeposits": 2000.0,
      "totalWithdrawals": 1500.0,
      "transactionCount": 25
    }
  }
}
```
