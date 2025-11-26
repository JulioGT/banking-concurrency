export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InsufficientFundsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientFundsError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AccountNotFoundError extends Error {
  constructor(accountId: string) {
    super(`Account not found: ${accountId}`);
    this.name = 'AccountNotFoundError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConcurrencyConflictError extends Error {
  constructor(message: string = 'Concurrency conflict detected') {
    super(message);
    this.name = 'ConcurrencyConflictError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class DuplicateTransactionError extends Error {
  constructor(idempotencyKey: string) {
    super(`Duplicate transaction detected: ${idempotencyKey}`);
    this.name = 'DuplicateTransactionError';
    Error.captureStackTrace(this, this.constructor);
  }
}
