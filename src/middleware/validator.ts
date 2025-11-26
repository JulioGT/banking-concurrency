import { config } from '../config/app';
import { ValidationError } from '../utils/errors';
import { Request, Response, NextFunction } from 'express';

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Middleware: Validate accountId
 */
export function validateAccountId(req: Request, _res: Response, next: NextFunction) {
  const { id } = req.params;

  if (!id) {
    return next(new ValidationError('Account ID is required'));
  }

  if (!isValidUUID(id)) {
    return next(new ValidationError('Account ID must be a valid UUID'));
  }

  next();
}

/**
 * Middleware: Validate body
 */
export function validateBody(req: Request, _res: Response, next: NextFunction) {
  const { amount, idempotencyKey } = req.body;

  if (amount === undefined || amount === null) {
    return next(new ValidationError('Amount is required'));
  }

  const numAmount = parseFloat(amount);

  if (isNaN(numAmount)) {
    return next(new ValidationError('Amount must be a valid number'));
  }

  if (numAmount <= 0) {
    return next(new ValidationError('Amount must be positive'));
  }

  if (numAmount > config.limits.maxWithdrawAmount) {
    return next(
      new ValidationError(
        `Amount exceeds maximum withdrawal limit: $${config.limits.maxWithdrawAmount.toLocaleString()}`
      )
    );
  }

  // Validate idempotencyKey (optional, but must be valid UUID)
  if (idempotencyKey && !isValidUUID(idempotencyKey)) {
    return next(new ValidationError('idempotencyKey must be a valid UUID'));
  }

  req.body.amount = numAmount;

  next();
}

/**
 * Middleware: Validar pagination query params
 */
export function validatePaginationQuery(req: Request, _res: Response, next: NextFunction) {
  const limit = parseInt(req.query.limit as string) || config.pagination.defaultLimit;
  const offset = parseInt(req.query.offset as string) || 0;

  if (limit < 1) {
    return next(new ValidationError('Limit must be at least 1'));
  }

  if (limit > config.pagination.maxLimit) {
    return next(new ValidationError(`Limit cannot exceed ${config.pagination.maxLimit}`));
  }

  if (offset < 0) {
    return next(new ValidationError('Offset must be non-negative'));
  }

  req.query.limit = limit.toString();
  req.query.offset = offset.toString();

  next();
}

/**
 * Middleware: Validar date query params
 */
export function validateStatementQuery(req: Request, _res: Response, next: NextFunction) {
  const { startDate, endDate } = req.query;

  if (startDate) {
    const start = new Date(startDate as string);

    if (isNaN(start.getTime())) {
      return next(new ValidationError('startDate must be a valid ISO 8601 date'));
    }
  }

  if (endDate) {
    const end = new Date(endDate as string);

    if (isNaN(end.getTime())) {
      return next(new ValidationError('endDate must be a valid ISO 8601 date'));
    }
  }

  if (startDate && endDate) {
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (start > end) {
      return next(new ValidationError('startDate must be before endDate'));
    }
  }

  next();
}
