import accountRoutes from './routes/accounts';
import { config, validateConfig } from './config/app';
import { errorHandler } from './middleware/errorHandler';
import express, { Application, Request, Response } from 'express';
import { pool, testConnection, closePool } from './config/database';

const app: Application = express();

app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (config.logging.level === 'debug') {
  app.use((req: Request, _res: Response, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
  });
}

app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Banking Concurrency System',
    version: '1.0.0',
    status: 'running',
    environment: config.server.env,
    endpoints: {
      health: '/health',
      accounts: '/accounts',
    },
  });
});

app.get('/health', async (_req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();

    res.status(200).json({
      success: true,
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      config: {
        maxRetries: config.retry.maxRetries,
        maxDepositAmount: config.limits.maxDepositAmount,
        maxWithdrawAmount: config.limits.maxWithdrawAmount,
        environment: config.server.env,
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      database: 'disconnected',
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/accounts', accountRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    avaliableEndpoints: ['/', '/health'],
  });
});

app.use(errorHandler);

async function startServer() {
  try {
    console.log('🔍 Validating configuration...');
    validateConfig();

    console.log('🔌 Testing database connection...');
    await testConnection();

    app.listen(config.server.port, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🚀 Banking Concurrency System');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`✅ Server running on port ${config.server.port}`);
      console.log(`✅ Environment: ${config.server.env}`);
      console.log(`✅ Max retries: ${config.retry.maxRetries}`);
      console.log(`✅ Max deposit: $${config.limits.maxDepositAmount.toLocaleString()}`);
      console.log(`✅ Max withdraw: $${config.limits.maxWithdrawAmount.toLocaleString()}`);
      console.log('');
      console.log('📡 Available endpoints:');
      console.log(`   • http://localhost:${config.server.port}/`);
      console.log(`   • http://localhost:${config.server.port}/health`);
      console.log('═══════════════════════════════════════════════════════════');
      console.log('');
      console.log('💡 Press Ctrl+C to stop the server');
      console.log('');
    });
  } catch (error) {
    console.log('❌ Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('');
  console.log('📦 SIGTERM received, shutting down gracefully...');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('');
  console.log('📦 SIGINT received, shutting down gracefully...');
  await closePool();
  process.exit(0);
});

startServer();
