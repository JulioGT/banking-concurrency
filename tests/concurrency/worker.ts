import { parentPort, workerData } from 'worker_threads';
import fetch from 'node-fetch';

/**
 * Executes concurrent operatinos
 * Each worker simulates a client doing multiple operations
 */

interface WorkerData {
  workerId: number;
  serverUrl: string;
  accountId: string;
  operations: number;
}

interface OperationResult {
  workerId: number;
  operationNumber: number;
  type: 'deposit' | 'withdraw';
  amount: number;
  success: boolean;
  retries: number;
  duration: number;
  error?: string;
}

const data: WorkerData = workerData;

async function performOperation(operationNumber: number): Promise<OperationResult> {
  const startTime = Date.now();

  const isDeposit = operationNumber % 2 === 0;
  const type = isDeposit ? 'deposit' : 'withdraw';
  const amount = Math.floor(Math.random() * 50) + 10;

  const endpoint = `${data.serverUrl}/accounts/${data.accountId}/${type}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount }),
    });

    const result: any = await response.json();
    const duration = Date.now() - startTime;

    if (response.ok && result.success) {
      return {
        workerId: data.workerId,
        operationNumber,
        type,
        amount: isDeposit ? amount : -amount,
        success: true,
        retries: result.data?.retries || 0,
        duration,
      };
    } else {
      return {
        workerId: data.workerId,
        operationNumber,
        type,
        amount: isDeposit ? amount : -amount,
        success: false,
        retries: 0,
        duration,
        error: result.error || result.message || 'Unknown error',
      };
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;

    return {
      workerId: data.workerId,
      operationNumber,
      type,
      amount: isDeposit ? amount : -amount,
      success: false,
      retries: 0,
      duration,
      error: error.message,
    };
  }
}

async function runWorker() {
  const results: OperationResult[] = [];

  console.log(`[Worker ${data.workerId}] Starting ${data.operations} operations...`);

  for (let i = 0; i < data.operations; i++) {
    const result = await performOperation(i + 1);
    results.push(result);

    if ((i + 1) % 5 === 0) {
      console.log(`[Worker ${data.workerId}] Progress: ${i + 1}/${data.operations} operations`);
    }
  }

  console.log(`[Worker ${data.workerId}] Completed all operations`);

  parentPort?.postMessage({
    workerId: data.workerId,
    results,
  });
}

runWorker().catch((error) => {
  console.error(`[Worker ${data.workerId}] Fatal error:`, error);
  process.exit(1);
});
