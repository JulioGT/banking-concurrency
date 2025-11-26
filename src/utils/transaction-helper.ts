/**
 * HANDLES ALL THE TRANSACTIONS
 */

import { Pool, PoolClient } from 'pg';
import { config } from '../config/app';

export type IsolationLevel =
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

export class TransactionHelper {
  constructor(private pool: Pool) {}

  /**
   * Execute code inside a transaction
   *
   * @param callback - Función que recibe el client y ejecuta queries
   * @param isolationLevel - Isolation level (default: READ COMMITTED)
   * @returns Callback result
   *
   * @example
   *
   * const result = await txHelper.executeInTransaction(
   *   async (client) => {
   *     const account = await client.query('SELECT * FROM accounts WHERE id = $1', [id]);
   *     await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [100, id]);
   *     return account.rows[0];
   *   },
   *   'READ COMMITTED'
   * );
   *
   */
  async executeInTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    isolationLevel: IsolationLevel = 'READ COMMITTED'
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`);

      if (config.logging.logSqlQueries) {
        console.log(`📊 BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
      }

      const result = await callback(client);
      await client.query('COMMIT');

      if (config.logging.logSqlQueries) {
        console.log('✅ COMMIT');
      }

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (config.logging.logSqlQueries) {
        console.log('❌ ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries in one transaction (alternative helper)
   * Useful when you need to execute simple queries without complex logic
   *
   * @param queries - Array of queries
   * @param isolationLevel - Isolation level
   * @returns Result Array
   *
   * @example
   *
   * const results = await txHelper.executeQueries([
   *   { text: 'UPDATE accounts SET balance = balance + $1 WHERE id = $2', values: [100, id1] },
   *   { text: 'UPDATE accounts SET balance = balance - $1 WHERE id = $2', values: [100, id2] },
   * ]);
   *
   */
  async executeQueries<T>(
    queries: Array<{ text: string; values?: any[] }>,
    isolationLevel: IsolationLevel = 'READ COMMITTED'
  ): Promise<T[]> {
    return this.executeInTransaction(async (client) => {
      const results: T[] = [];

      for (const query of queries) {
        if (config.logging.logSqlQueries) {
          console.log(`📊 Executing: ${query.text}`);
          console.log(`   Values: ${JSON.stringify(query.values)}`);
        }

        const result = await client.query(query.text, query.values);
        results.push(result.rows as T);
      }

      return results;
    }, isolationLevel);
  }
}
