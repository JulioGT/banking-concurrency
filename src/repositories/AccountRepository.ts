import { PoolClient } from 'pg';
import { config } from '../config/app';
import { Account } from '../models/Account';
import { Transaction, CreateTransactionDTO } from '../models/Transaction';
import {
  ConcurrencyConflictError,
  AccountNotFoundError,
  InsufficientFundsError,
} from '../utils/errors';

export class AccountRepository {
  /**
   * Get account by ID
   *
   * @param client
   * @param accountId
   * @returns Account o null si no existe
   */
  async findById(client: PoolClient, accountId: string): Promise<Account | null> {
    if (config.logging.logSqlQueries) {
      console.log(`📊 [Repository] SELECT account WHERE id = ${accountId}`);
    }

    const result = await client.query(
      'SELECT id, balance, version, created_at, updated_at FROM accounts WHERE id = $1',
      [accountId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      balance: parseFloat(row.balance),
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Updated balance sith optimistic locking
   *
   * @param client
   * @param accountId - UUID
   * @param amount - positivo o negativo
   * @param expectedVersion - Version (optimistic locking)
   * @returns Account updated
   * @throws ConcurrencyConflictError if version is wrong
   */
  async updateBalance(
    client: PoolClient,
    accountId: string,
    amount: number,
    expectedVersion: number
  ): Promise<Account> {
    if (config.logging.logSqlQueries) {
      console.log(
        `📊 [Repository] UPDATE account ${accountId} SET balance = balance + ${amount} WHERE version = ${expectedVersion}`
      );
    }

    const result = await client.query(
      `UPDATE accounts
      SET balance = balance + $1, version = version + 1
      WHERE id = $2 AND version = $3
      RETURNING id, balance, version, created_at, updated_at`,
      [amount, accountId, expectedVersion]
    );

    if (result.rowCount === 0) {
      throw new ConcurrencyConflictError(
        `Optimistic locking conflict for account ${accountId} at version ${expectedVersion}`
      );
    }

    const row = result.rows[0];
    return {
      id: row.id,
      balance: row.balance,
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Update balance with verification (for withdraw)
   *
   * @param client
   * @param accountId - UUID
   * @param amount - negativo para withdraw
   * @param expectedVersion - Version expected
   * @param minBalance - Minimum Balance allowed (0)
   * @returns Account updated
   * @throws ConcurrencyConflictError if version is not accurate
   * @throws InsufficientFundsError si el balance is less than the minimum
   */
  async updateBalanceWithCheck(
    client: PoolClient,
    accountId: string,
    amount: number,
    expectedVersion: number,
    minBalance: number = 0
  ): Promise<Account> {
    if (config.logging.logSqlQueries) {
      console.log(
        `📊 [Repository] UPDATE account ${accountId} SET balance = balance + ${amount} WHERE version = ${expectedVersion} AND balance >= ${Math.abs(amount)}`
      );
    }

    const result = await client.query(
      `UPDATE accounts
      SET balance = balance + $1, version = version + 1
      WHERE id = $2 AND version = $3 AND (balance + $1) >= $4
      RETURNING id, balance, version, created_at, updated_at`,
      [amount, accountId, expectedVersion, minBalance]
    );

    if (result.rowCount === 0) {
      const checkResult = await client.query(
        'SELECT balance, version FROM accounts WHERE id = $1',
        [accountId]
      );

      if (checkResult.rows.length === 0) {
        throw new AccountNotFoundError(accountId);
      }

      const currentAccount = checkResult.rows[0];
      const currentBalance = parseFloat(currentAccount.balance);

      if (currentAccount.version !== expectedVersion) {
        throw new ConcurrencyConflictError(
          `Optimistic locking conflict for account ${accountId} at version ${expectedVersion}`
        );
      }

      throw new InsufficientFundsError(
        `Insufficient funds. Current balance: ${currentBalance}, attempted withdrawal: ${Math.abs(amount)}`
      );
    }
    const row = result.rows[0];

    return {
      id: row.id,
      balance: parseFloat(row.balance),
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Create a new row (Event Sourcing Light)
   *
   * @param client
   * @param dto - Transaction data
   * @returns Transaction created
   */
  async createTransaction(client: PoolClient, dto: CreateTransactionDTO): Promise<Transaction> {
    if (config.logging.logSqlQueries) {
      console.log(
        `📊 [Repository] INSERT INTO transactions (account_id: ${dto.account_id}, amount: ${dto.amount}, type: ${dto.type})`
      );
    }

    const result = await client.query(
      `INSERT INTO transactions (account_id, amount, type, balance_after, idempotency_key)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, account_id, amount, type, balance_after, idempotency_key, created_at`,
      [dto.account_id, dto.amount, dto.type, dto.balance_after, dto.idempotency_key || null]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      account_id: row.account_id,
      amount: parseFloat(row.amount),
      type: row.type,
      balance_after: parseFloat(row.balance_after),
      idempotency_key: row.idempotency_key,
      created_at: row.created_at,
    };
  }

  /**
   * Find transactin by idempotency_key (prevent dups)
   *
   * @param client
   * @param idempotencyKey - UUID
   * @returns Transaction if exists, or null
   */
  async findTransactionByIdempotencyKey(
    client: PoolClient,
    idempotencyKey: string
  ): Promise<Transaction | null> {
    if (config.logging.logSqlQueries) {
      console.log(`📊 [Repository] SELECT transaction WHERE idempotency_key = ${idempotencyKey}`);
    }

    const result = await client.query(
      `SELECT id, account_id, amount, type, balance_after, idempotency_key, created_at
      FROM transactions
      WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      account_id: row.account_id,
      amount: parseFloat(row.amount),
      type: row.type,
      balance_after: parseFloat(row.balance_after),
      idempotency_key: row.idempotency_key,
      created_at: row.created_at,
    };
  }

  /**
   * Get the Transactions history
   *
   * @param client
   * @param accountId - UUID
   * @param limit - Maximun amount of results
   * @param offset - Offset for pagination
   * @returns Transactions Array
   */
  async getTransactionHistory(
    client: PoolClient,
    accountId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<Transaction[]> {
    if (config.logging.logSqlQueries) {
      console.log(
        `📊 [Repository] SELECT transactions WHERE account_id = ${accountId} LIMIT ${limit} OFFSET ${offset}`
      );
    }

    const result = await client.query(
      `SELECT id, account_id, amount, type, balance_after, idempotency_key, created_at
       FROM transactions
       WHERE account_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [accountId, limit, offset]
    );

    return result.rows.map((row) => ({
      id: row.id,
      account_id: row.account_id,
      amount: parseFloat(row.amount),
      type: row.type,
      balance_after: parseFloat(row.balance_after),
      idempotency_key: row.idempotency_key,
      created_at: row.created_at,
    }));
  }

  /**
   * Get account balance in an specific date (Time Travel)
   *
   * @param client
   * @param accountId - UUID
   * @param targetDate
   * @returns Balance in that date (0 if there are not any transactions)
   */
  async getBalanceAtDate(client: PoolClient, accountId: string, targetDate: Date): Promise<number> {
    if (config.logging.logSqlQueries) {
      console.log(
        `📊 [Repository] SELECT balance_after WHERE account_id = ${accountId} AND created_at <= ${targetDate}`
      );
    }

    const result = await client.query(
      `SELECT balance_after
       FROM transactions
       WHERE account_id = $1 AND created_at <= $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [accountId, targetDate]
    );

    if (result.rows.length === 0) {
      return 0;
    }

    return parseFloat(result.rows[0].balance_after);
  }
}
