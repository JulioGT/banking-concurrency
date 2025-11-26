import { config } from '../config/app';
import { Request, Response, NextFunction } from 'express';
import { TransactionService } from '../services/TransactionService';
import { AccountQueryService } from '../services/AccountQueryService';
import { AccountNotFoundError, InsufficientFundsError, ValidationError } from '../utils/errors';

/**
 * ACCOUNT CONTROLLER
 * Handles HTTP requests and responses for account operations
 */
export class AccountController {
  constructor(
    private transactionService: TransactionService,
    private queryService: AccountQueryService
  ) {}

  /**
   * GET /accounts/:id
   * Get complete account information with recent transactions
   */
  async getAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await this.queryService.getAccount(id, 5);

      res.json({
        success: true,
        data: {
          account: {
            id: result.account.id,
            balance: result.account.balance,
            version: result.account.version,
            created_at: result.account.created_at,
            updated_at: result.account.updated_at,
          },
          recentTransactions: result.recentTransactions.map((tx) => ({
            id: tx.id,
            amount: tx.amount,
            type: tx.type,
            balance_after: tx.balance_after,
            created_at: tx.created_at,
          })),
        },
      });
    } catch (error: any) {
      console.error('❌ Error getting account:', error);

      if (error instanceof AccountNotFoundError) {
        return res.json({
          success: false,
          error: 'Account not found',
          message: error.message,
        }) as any;
      }

      next(error);
    }
  }

  /**
   * GET /accounts/:id/balance
   * get current account balance
   */
  async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const balance = await this.queryService.getBalance(id);

      res.json({
        success: true,
        data: {
          accountId: id,
          balance: balance,
        },
      });
    } catch (error: any) {
      console.error('❌ Error getting balance:', error);

      if (error instanceof AccountNotFoundError) {
        return res.status(404).json({
          success: true,
          error: 'Account not found',
          message: error.message,
        }) as any;
      }

      next(error);
    }
  }

  /**
   * GET /accounts/:id/transactions
   * Get paginated transaction history
   */
  async getTransactionHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

      const transactions = await this.queryService.getTransactionHistory(id, limit, offset);

      res.json({
        success: true,
        data: {
          accountId: id,
          transactions,
          pagination: {
            limit: limit ?? config.pagination.defaultLimit,
            offset: offset ?? 0,
            count: transactions.length,
          },
        },
      });
    } catch (error: any) {
      console.error('❌ Error getting transaction history:', error);

      if (error instanceof AccountNotFoundError) {
        return res.status(404).json({
          success: false,
          error: 'Account Not Found',
          message: error.message,
        }) as any;
      }

      next(error);
    }
  }

  /**
   * GET /accounts/:id/statement
   * Generate account statement for a date range
   */
  async generateStatement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const THIRTY_DAYS_IN_MS = 30 * 24 * 60 * 60 * 1000;
      const { id } = req.params;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - THIRTY_DAYS_IN_MS);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const statement = await this.queryService.generateStatement(id, startDate, endDate);

      res.json({
        success: true,
        data: statement,
      });
    } catch (error: any) {
      console.error('❌ Error generating statement:', error);

      if (error instanceof AccountNotFoundError) {
        return res.status(404).json({
          success: false,
          error: 'Account Not Found',
          message: error.message,
        }) as any;
      }

      next(error);
    }
  }

  /**
   * POST /accounts/:id/deposit
   * Deposit amount into account
   */
  async deposit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { amount, idempotencyKey } = req.body;

      const result = await this.transactionService.deposit(id, amount, idempotencyKey);

      res.status(result.isDuplicate ? 200 : 201).json({
        success: true,
        data: {
          transaction: {
            id: result.transaction.id,
            accountId: result.transaction.account_id,
            amount: result.transaction.amount,
            type: result.transaction.type,
            balanceAfter: result.transaction.balance_after,
            createdAt: result.transaction.created_at,
          },
          newBalance: result.newBalance,
          isDuplicate: result.isDuplicate,
          retries: result.retries,
        },
      });
    } catch (error: any) {
      console.error('❌ Error processing deposit:', error);

      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: error.message,
        }) as any;
      }

      if (error instanceof AccountNotFoundError) {
        return res.status(404).json({
          success: false,
          error: 'Account Not Found',
          message: error.message,
        }) as any;
      }

      next(error);
    }
  }

  /**
   * POST /accounts/:id/withdraw
   * Withdraw amount from account
   */
  async withdraw(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { amount, idempotencyKey } = req.body;

      const result = await this.transactionService.withdraw(id, amount, idempotencyKey);

      res.status(result.isDuplicate ? 200 : 201).json({
        success: true,
        data: {
          transaction: {
            id: result.transaction.id,
            accountId: result.transaction.account_id,
            amount: result.transaction.amount,
            type: result.transaction.type,
            balanceAfter: result.transaction.balance_after,
            createdAt: result.transaction.created_at,
          },
          newBalance: result.newBalance,
          isDuplicate: result.isDuplicate,
          retries: result.retries,
        },
      });
    } catch (error: any) {
      console.error('❌ Error processing withdrawal:', error);

      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: error.message,
        }) as any;
      }

      if (error instanceof InsufficientFundsError) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient Funds',
          message: error.message,
        }) as any;
      }

      if (error instanceof AccountNotFoundError) {
        return res.status(404).json({
          success: false,
          error: 'Account Not Found',
          message: error.message,
        }) as any;
      }

      next(error);
    }
  }
}
