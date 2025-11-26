import { Pool } from 'pg';
import { config } from '../config/app';
import { Transaction } from '../models/Transaction';
import { AccountNotFoundError } from '../utils/errors';
import { TransactionHelper } from '../utils/transaction-helper';
import { AccountRepository } from '../repositories/AccountRepository';

/**
 * Account with recent transactions
 */
export interface AccountWithTransactions {
  account: {
    id: string;
    balance: number;
    version: number;
    created_at: Date;
    updated_at: Date;
  };
  recentTransactions: Array<{
    id: string;
    amount: number;
    type: string;
    balance_after: number;
    created_at: Date;
  }>;
}

/**
 * Account status
 */
export interface AccountStatement {
  account: {
    id: string;
    balance: number;
    created_at: Date;
  };
  period: {
    startDate: Date;
    endDate: Date;
  };
  initialBalance: number;
  finalBalance: number;
  transactions: Array<{
    id: string;
    amount: number;
    type: string;
    balance_after: number;
    created_at: Date;
  }>;
  summary: {
    totalDeposits: number;
    totalWithdrawals: number;
    transactionCount: number;
  };
}

/**
 * Service Queries
 * Separación CQRS: Commands (TransactionService) vs Queries (este)
 */
export class AccountQueryService {
  private txHelper: TransactionHelper;
  private repository: AccountRepository;

  constructor(private pool: Pool) {
    this.txHelper = new TransactionHelper(pool);
    this.repository = new AccountRepository();
  }

  /**
   * Get current account current balance
   *
   * @param accountId - Account UUID
   * @returns current balance
   * @throws AccountNotFoundError if account is not found
   */
  async getBalance(accountId: string): Promise<number> {
    const client = await this.pool.connect();

    try {
      const result = await client.query('SELECT balance FROM accounts WHERE id = $1', [accountId]);

      if (result.rows.length === 0) {
        throw new AccountNotFoundError(accountId);
      }

      return parseFloat(result.rows[0].balance);
    } finally {
      client.release();
    }
  }

  /**
   * Get complete information account
   * Uses REPEATABLE READ for a consistant snapshot
   *
   * @param accountId - Account UUID
   * @param limit - Transaction amount limit (default: 5)
   * @returns AccountWithTransactions
   * @throws AccountNotFoundError if the account is not found
   */
  async getAccount(accountId: string, limit: number = 5): Promise<AccountWithTransactions> {
    return await this.txHelper.executeInTransaction(async (client) => {
      const account = await this.repository.findById(client, accountId);

      if (!account) {
        throw new AccountNotFoundError(accountId);
      }

      const recentTransactions = await this.repository.getTransactionHistory(
        client,
        accountId,
        limit,
        0
      );

      return {
        account: {
          id: account.id,
          balance: account.balance,
          version: account.version,
          created_at: account.created_at,
          updated_at: account.updated_at,
        },
        recentTransactions: recentTransactions.map((tx) => ({
          id: tx.id,
          amount: tx.amount,
          type: tx.type,
          balance_after: tx.balance_after,
          created_at: tx.created_at,
        })),
      };
    }, 'REPEATABLE READ');
  }

  /**
   * Get paginated transaction history
   *
   * @param accountId - Account UUID
   * @param limit - Maximum amount of results
   * @param offset - Offset for pagination
   * @returns Transaction Array
   * @throws AccountNotFoundError if the account does not exist
   */
  async getTransactionHistory(
    accountId: string,
    limit?: number,
    offset?: number
  ): Promise<Transaction[]> {
    const client = await this.pool.connect();

    try {
      const accountCheck = await client.query('SELECT id FROM accounts WHERE id = $1', [accountId]);

      if (accountCheck.rows.length === 0) {
        throw new AccountNotFoundError(accountId);
      }

      const finalLimit = limit ?? config.pagination.defaultLimit;
      const finalOffset = offset ?? 0;

      if (finalLimit > config.pagination.maxLimit) {
        throw new Error(`Limit cannot exceed ${config.pagination.maxLimit}`);
      }

      return await this.repository.getTransactionHistory(
        client,
        accountId,
        finalLimit,
        finalOffset
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get balance in an specific date
   * Uses Event Sourcing Light with balance_after
   *
   * @param accountId - Account UUID
   * @param targetDate - Target date
   * @returns Balance on date
   * @throws AccountNotFoundError if the account does not exist
   */
  async getBalanceAtDate(accountId: string, targetDate: Date): Promise<number> {
    const client = await this.pool.connect();

    try {
      const accountCheck = await client.query('SELECT id FROM accounts WHERE id = $1', [accountId]);

      if (accountCheck.rows.length === 0) {
        throw new AccountNotFoundError(accountId);
      }

      return await this.repository.getBalanceAtDate(client, accountId, targetDate);
    } finally {
      client.release();
    }
  }

  /**
   * Generate account status in a period
   * Uses REPEATABLE READ for consistant snapshot
   *
   * @param accountId - Account UUID
   * @param startDate
   * @param endDate
   * @returns Complete AccountStatement
   * @throws AccountNotFoundError if the account does not exist
   */
  async generateStatement(
    accountId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AccountStatement> {
    return await this.txHelper.executeInTransaction(async (client) => {
      const account = await this.repository.findById(client, accountId);

      if (!account) {
        throw new AccountNotFoundError(accountId);
      }

      const initialBalance = await this.repository.getBalanceAtDate(client, accountId, startDate);
      const transactions = await client.query(
        `SELECT id, amount, type, balance_after, created_at
           FROM transactions
           WHERE account_id = $1 
             AND created_at >= $2 
             AND created_at <= $3
           ORDER BY created_at ASC`,
        [accountId, startDate, endDate]
      );

      const txList = transactions.rows.map((tx) => ({
        id: tx.id,
        amount: parseFloat(tx.amount),
        type: tx.type,
        balance_after: parseFloat(tx.balance_after),
        created_at: tx.created_at,
      }));

      const totalDeposits = txList
        .filter((tx) => tx.type === 'deposit')
        .reduce((sum, tx) => sum + tx.amount, 0);

      const totalWithdrawals = txList
        .filter((tx) => tx.type === 'withdraw')
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      let finalBalance: number;

      if (txList.length > 0) {
        finalBalance = txList[txList.length - 1].balance_after;
      } else {
        finalBalance = initialBalance;
      }

      return {
        account: {
          id: account.id,
          balance: account.balance,
          created_at: account.created_at,
        },
        period: {
          startDate,
          endDate,
        },
        initialBalance,
        finalBalance,
        transactions: txList,
        summary: {
          totalDeposits,
          totalWithdrawals,
          transactionCount: txList.length,
        },
      };
    }, 'REPEATABLE READ');
  }
}
