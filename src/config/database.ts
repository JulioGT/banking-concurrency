import { Pool } from 'pg';
import { config } from './app';

/**
 * Connection Pool to PostgreSQL
 * Reuse conections for better performance
 */
export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: config.database.pool.max,
  min: config.database.pool.min,
  idleTimeoutMillis: config.database.pool.idleTimeout,
  connectionTimeoutMillis: config.database.pool.connectionTimeout,
});

pool.on('connect', () => {
  if (config.logging.level === 'debug') {
    console.log('🔌 Database connection established');
  }
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

export async function testConnection(): Promise<void> {
  try {
    const client = await pool.connect();

    if (config.logging.logSqlQueries) {
      console.log('📊 Executing: SELECT NOW()');
    }

    const result = await client.query('SELECT NOW()');
    client.release();

    console.log('✅ Database connection test successful');
    if (config.logging.level === 'debug') {
      console.log(`   Server time: ${result.rows[0].now}`);
    }
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    throw error;
  }
}

/**
 * Close all conections of the pool - graceful shutdown
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('👋 Database connection pool closed');
}
