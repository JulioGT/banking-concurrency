import { Pool, PoolClient } from 'pg';
import { TransactionHelper } from '../../src/utils/transaction-helper';

jest.mock('pg', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient),
  };

  return { Pool: jest.fn(() => mockPool) };
});

describe('TransactionHelper', () => {
  let pool: Pool;
  let helper: TransactionHelper;
  let mockClient: jest.Mocked<PoolClient>;

  beforeEach(() => {
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
      connect: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    } as any;

    pool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    } as any;

    helper = new TransactionHelper(pool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeInTransaction', () => {
    it('must execute BEGIN, callback and COMMIT in a successful transaction', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      const result = await helper.executeInTransaction(callback, 'READ COMMITTED');

      expect(pool.connect).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenNthCalledWith(
        1,
        'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED'
      );
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenNthCalledWith(2, 'COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');
    });

    it('must execute ROLLBACK if the callback fails', async () => {
      const error = new Error('Test error');
      const callback = jest.fn().mockRejectedValue(error);

      await expect(helper.executeInTransaction(callback, 'READ COMMITTED')).rejects.toThrow(
        'Test error'
      );

      expect(mockClient.query).toHaveBeenNthCalledWith(
        1,
        'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED'
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('must clerar the client even if the COMMIT fails', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'COMMIT') {
          throw new Error('Commit failed');
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const callback = jest.fn().mockResolvedValue('result');

      await expect(helper.executeInTransaction(callback, 'READ COMMITTED')).rejects.toThrow(
        'Commit failed'
      );

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('must use READ COMMITTED by default', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      await helper.executeInTransaction(callback);
      expect(mockClient.query).toHaveBeenNthCalledWith(
        1,
        'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED'
      );
    });

    it('must support different isolation levels', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      await helper.executeInTransaction(callback, 'SERIALIZABLE');
      expect(mockClient.query).toHaveBeenNthCalledWith(
        1,
        'BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE'
      );
    });

    it('must support REPEATABLE READ', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      await helper.executeInTransaction(callback, 'REPEATABLE READ');
      expect(mockClient.query).toHaveBeenNthCalledWith(
        1,
        'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ'
      );
    });
  });

  describe('executeQueries', () => {
    it('must execute multiple queries in a transaction', async () => {
      const mockQuery = mockClient.query as jest.Mock;

      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ updated: true }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const queries = [
        { text: 'SELECT * FROM accounts WHERE id = $1', values: ['123'] },
        { text: 'UPDATE accounts SET balance = $1 WHERE id = $2', values: [1000, '123'] },
      ];
      const results = await helper.executeQueries(queries);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual([{ id: 1 }]);
      expect(results[1]).toEqual([{ updated: true }]);
      expect(mockClient.query).toHaveBeenNthCalledWith(
        1,
        'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED'
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
    });

    it('must ROLLBACK if any query fails', async () => {
      const mockQuery = mockClient.query as jest.Mock;

      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 } as any)
        .mockRejectedValueOnce(new Error('Update failed'));

      const queries = [
        { text: 'SELECT * FROM accounts WHERE id = $1', values: ['123'] },
        { text: 'UPDATE accounts SET balance = $1 WHERE id = $2', values: [1000, '123'] },
      ];
      await expect(helper.executeQueries(queries)).rejects.toThrow('Update failed');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
