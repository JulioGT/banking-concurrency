import { Request, Response, NextFunction } from 'express';
import {
  ValidationError,
  InsufficientFundsError,
  AccountNotFoundError,
  ConcurrencyConflictError,
  DuplicateTransactionError,
} from '../utils/errors';

/**
 * Grobal Error handler
 * Captures all the errors and gives the right format
 */
export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('❌ Error caught by global handler:', {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });

  if (error instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: error.message,
    });
  }

  if (error instanceof InsufficientFundsError) {
    return res.status(400).json({
      success: false,
      error: 'Insufficient Funds',
      message: error.message,
    });
  }

  if (error instanceof AccountNotFoundError) {
    return res.status(404).json({
      success: false,
      error: 'Account Not Found',
      message: error.message,
    });
  }

  if (error instanceof DuplicateTransactionError) {
    return res.status(409).json({
      success: false,
      error: 'Duplicate Transaction',
      message: error.message,
    });
  }

  if (error instanceof ConcurrencyConflictError) {
    return res.status(500).json({
      success: false,
      error: 'Concurrency Conflict',
      message: 'Operation failed after multiple retries. Please try again.',
    });
  }

  return res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message:
      process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
  });
}
