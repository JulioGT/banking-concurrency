import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000'),
  },

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'banking',
    user: process.env.DB_USER || 'j2g',
    password: process.env.DB_PASSWORD || '',

    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      idleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
    },
  },

  retry: {
    maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
    baseDelay: parseInt(process.env.RETRY_BASE_DELAY || '50'),
    maxDelay: parseInt(process.env.RETRY_MAX_DELAY || '1000'),
  },

  limits: {
    maxDepositAmount: parseFloat(process.env.MAX_DEPOSIT_AMOUNT || '1000000'),
    maxWithdrawAmount: parseFloat(process.env.MAX_WITHDRAW_AMOUNT || '500000'),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    logSqlQueries: process.env.LOG_SQL_QUERIES === 'true',
  },

  pagination: {
    defaultLimit: parseInt(process.env.DEFAULT_PAGE_LIMIT || '100'),
    maxLimit: parseInt(process.env.MAX_PAGE_LIMIT || '1000'),
  },

  testing: {
    accountId: process.env.TEST_ACCOUNT_ID || '123e4567-e89b-12d3-a456-426614174000',
    numWorkers: parseInt(process.env.TEST_NUM_WORKERS || '50'),
    operationsPerWorker: parseInt(process.env.TEST_OPERATIONS_PER_WORKER || '10'),
  },
};

export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.database.host) {
    errors.push('DB_HOST is required');
  }

  if (!config.database.name) {
    errors.push('DB_NAME is required');
  }

  if (!config.database.user) {
    errors.push('DB_USER is required');
  }

  if (!config.database.password) {
    errors.push('DB_PASSWORD is required');
  }

  if (config.retry.maxRetries < 1 || config.retry.maxRetries > 10) {
    errors.push('MAX_RETRIES must be between 1 and 10');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  if (config.limits.maxDepositAmount <= 0) {
    errors.push('MAX_DEPOSIT_AMOUNT must be positive');
  }

  if (config.limits.maxWithdrawAmount <= 0) {
    errors.push('MAX_WITHDRAW_AMOUNT must be positive');
  }

  if (config.pagination.defaultLimit < 1) {
    errors.push('DEFAULT_PAGE_LIMIT must be at least 1');
  }

  if (config.pagination.maxLimit < config.pagination.defaultLimit) {
    errors.push('MAX_PAGE_LIMIT must be >= DEFAULT_PAGE_LIMIT');
  }

  if (errors.length > 0) {
    throw new Error(
      `❌ Configuration validation failed:\n${errors.map((e) => `  • ${e}`).join('\n')}`
    );
  }

  console.log('✅ Configuration validated successfully');
}
