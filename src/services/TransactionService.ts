import { Pool } from 'pg';
import { config } from '../config/app';
import { isValidUUID } from '../utils/validation';
import { Transaction } from '../models/Transaction';
import { TransactionHelper } from '../utils/transaction-helper';
import { AccountRepository } from '../repositories/AccountRepository';
import {
  ValidationError,
  AccountNotFoundError,
  InsufficientFundsError,
  ConcurrencyConflictError,
} from '../utils/errors';

export interface TransactionResult {
  success: boolean;
  transaction: Transaction;
  newBalance: number;
  isDuplicate: boolean;
  retries: number;
}

export class TransactionService {
  private txHelper: TransactionHelper;
  private repository: AccountRepository;

  constructor(pool: Pool) {
    this.txHelper = new TransactionHelper(pool);
    this.repository = new AccountRepository();
  }

  async deposit(
    accountId: string,
    amount: number,
    idempotencyKey?: string,
    maxRetries?: number
  ): Promise<TransactionResult> {
    if (idempotencyKey && !isValidUUID(idempotencyKey)) {
      throw new ValidationError('idempotencyKey must be a valid UUID');
    }
    const retries = maxRetries ?? config.retry.maxRetries;

    if (amount <= 0) {
      throw new ValidationError('Deposit amount must be positive');
    }

    if (amount > config.limits.maxDepositAmount) {
      throw new ValidationError(
        `Deposit amount exceeds maximum limit: ${config.limits.maxDepositAmount.toLocaleString()}`
      );
    }

    let retriesCount = 0;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await this.txHelper.executeInTransaction(async (client) => {
          if (idempotencyKey) {
            const existing = await this.repository.findTransactionByIdempotencyKey(
              client,
              idempotencyKey
            );

            if (existing) {
              console.log(`⚠️  [Deposit] Idempotent request detected for key: ${idempotencyKey}`);
              return {
                transaction: existing,
                newBalance: existing.balance_after,
                isDuplicate: true,
              };
            }
          }

          const account = await this.repository.findById(client, accountId);
          if (!account) {
            throw new AccountNotFoundError(accountId);
          }

          const updatedAccount = await this.repository.updateBalance(
            client,
            accountId,
            amount,
            account.version
          );

          const transaction = await this.repository.createTransaction(client, {
            account_id: accountId,
            amount: amount,
            type: 'deposit',
            balance_after: updatedAccount.balance,
            idempotency_key: idempotencyKey,
          });

          return {
            transaction,
            newBalance: updatedAccount.balance,
            isDuplicate: false,
          };
        }, 'READ COMMITTED');

        return {
          success: true,
          transaction: result.transaction,
          newBalance: result.newBalance,
          isDuplicate: result.isDuplicate || false,
          retries: retriesCount,
        };
      } catch (error) {
        if (error instanceof ConcurrencyConflictError && attempt < retries - 1) {
          retriesCount++;

          console.log(
            `⚠️  [Deposit] Retry ${retriesCount}/${retries} for account ${accountId} (attempt ${attempt + 1})`
          );

          const exponentialDelay = Math.pow(2, attempt) * config.retry.baseDelay;
          const jitter = Math.random() * config.retry.baseDelay;
          const totalDelay = Math.min(exponentialDelay + jitter, config.retry.maxDelay);

          console.log(`   Waiting ${totalDelay.toFixed(0)}ms before retry...`);

          await this.sleep(totalDelay);
          continue;
        }

        throw error;
      }
    }

    throw new Error(`Max retries (${retries}) exceeded for deposit on account ${accountId}`);
  }

  /**
   * Withdraw amount for an account
   *
   * @param accountId - Account UUID
   * @param amount - Withdrawal amount (positivo)
   * @param idempotencyKey - Optional, to prvent dups
   * @param maxRetries - Maximum retries number (default from config
   * @returns Transaction information
   *
   * @throws ValidationError if amunt is invalid
   * @throws AccountNotFoundError if account does not exit
   * @throws InsufficientFundsError if there are no balance
   */
  async withdraw(
    accountId: string,
    amount: number,
    idempotencyKey?: string,
    maxRetries?: number
  ): Promise<TransactionResult> {
    const retries = maxRetries ?? config.retry.maxRetries;

    if (amount <= 0) {
      throw new ValidationError('Withdrawal amount must be positive');
    }

    if (amount > config.limits.maxWithdrawAmount) {
      throw new ValidationError(
        `Withdrawal amount exceeds maximum limit: $${config.limits.maxWithdrawAmount.toLocaleString()}`
      );
    }

    let retriesCount = 0;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await this.txHelper.executeInTransaction(async (client) => {
          if (idempotencyKey) {
            const existing = await this.repository.findTransactionByIdempotencyKey(
              client,
              idempotencyKey
            );

            if (existing) {
              console.log(`⚠️  [Withdraw] Idempotent request detected for key: ${idempotencyKey}`);
              return {
                transaction: existing,
                newBalance: existing.balance_after,
                isDuplicate: true,
              };
            }
          }

          // Read current account
          const account = await this.repository.findById(client, accountId);
          if (!account) {
            throw new AccountNotFoundError(accountId);
          }

          //Update with balance validation
          const updatedAccount = await this.repository.updateBalanceWithCheck(
            client,
            accountId,
            -amount,
            account.version,
            0
          );

          //Register transaction
          const transaction = await this.repository.createTransaction(client, {
            account_id: accountId,
            amount: -amount,
            type: 'withdraw',
            balance_after: updatedAccount.balance,
            idempotency_key: idempotencyKey,
          });

          return {
            transaction,
            newBalance: updatedAccount.balance,
            isDuplicate: false,
          };
        }, 'READ COMMITTED');

        //SUCCESS
        return {
          success: true,
          transaction: result.transaction,
          newBalance: result.newBalance,
          isDuplicate: result.isDuplicate || false,
          retries: retriesCount,
        };
      } catch (error) {
        if (error instanceof InsufficientFundsError) {
          throw error;
        }

        if (error instanceof ConcurrencyConflictError && attempt < retries - 1) {
          retriesCount++;
          console.log(
            `⚠️  [Withdraw] Retry ${retriesCount}/${retries} for account ${accountId} (attempt ${attempt + 1})`
          );
          const exponentialDelay = Math.pow(2, attempt) * config.retry.baseDelay;
          const jitter = Math.random() * config.retry.baseDelay;
          const totalDelay = Math.min(exponentialDelay + jitter, config.retry.maxDelay);

          await this.sleep(totalDelay);
          continue;
        }

        throw error;
      }
    }

    throw new Error(`Max retries (${retries}) exceeded for withdrawal on account ${accountId}`);
  }

  /**
   * Sleep helper for retry logic
   * @param ms - Miliseconds to wait
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
