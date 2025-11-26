"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const node_fetch_1 = __importDefault(require("node-fetch"));
const data = worker_threads_1.workerData;
async function performOperation(operationNumber) {
    const startTime = Date.now();
    const isDeposit = operationNumber % 2 === 0;
    const type = isDeposit ? 'deposit' : 'withdraw';
    const amount = Math.floor(Math.random() * 50) + 10;
    const endpoint = `${data.serverUrl}/accounts/${data.accountId}/${type}`;
    try {
        const response = await (0, node_fetch_1.default)(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ amount }),
        });
        const result = await response.json();
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
        }
        else {
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
    }
    catch (error) {
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
    const results = [];
    console.log(`[Worker ${data.workerId}] Starting ${data.operations} operations...`);
    for (let i = 0; i < data.operations; i++) {
        const result = await performOperation(i + 1);
        results.push(result);
        if ((i + 1) % 5 === 0) {
            console.log(`[Worker ${data.workerId}] Progress: ${i + 1}/${data.operations} operations`);
        }
    }
    console.log(`[Worker ${data.workerId}] Completed all operations`);
    worker_threads_1.parentPort?.postMessage({
        workerId: data.workerId,
        results,
    });
}
runWorker().catch((error) => {
    console.error(`[Worker ${data.workerId}] Fatal error:`, error);
    process.exit(1);
});
//# sourceMappingURL=worker.js.map