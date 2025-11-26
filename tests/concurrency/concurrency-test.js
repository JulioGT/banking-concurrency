"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const worker_threads_1 = require("worker_threads");
const app_1 = require("../../src/config/app");
const testConfig = {
    numWorkers: app_1.config.testing.numWorkers,
    operationsPerWorker: app_1.config.testing.operationsPerWorker,
    serverUrl: `http://localhost:${app_1.config.server.port}`,
    accountId: app_1.config.testing.accountId,
};
/**
 * Get account current balanace
 */
async function getBalance(accountId) {
    try {
        const response = await (0, node_fetch_1.default)(`${testConfig.serverUrl}/accounts/${accountId}/balance`);
        if (!response.ok) {
            throw new Error(`Failed to get balance: ${response.statusText}`);
        }
        const result = await response.json();
        return result.data.balance;
    }
    catch (error) {
        console.error('❌ Error getting balance:', error.message);
        throw error;
    }
}
/**
 * Calculate test metrics
 */
function calculateMetrics(results, initialBalance, finalBalance, duration) {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const withRetries = successful.filter((r) => r.retries > 0);
    const durations = results.map((r) => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const totalRetries = successful.reduce((sum, r) => sum + r.retries, 0);
    const totalDeposits = successful
        .filter((r) => r.type === 'deposit')
        .reduce((sum, r) => sum + r.amount, 0);
    const totalWithdrawals = successful
        .filter((r) => r.type === 'withdraw')
        .reduce((sum, r) => sum + Math.abs(r.amount), 0);
    const expectedBalance = initialBalance + totalDeposits - totalWithdrawals;
    const throughput = (results.length / duration) * 1000;
    return {
        totalOperations: results.length,
        successfulOperations: successful.length,
        failedOperations: failed.length,
        totalRetries,
        avgDuration: Math.round(avgDuration),
        minDuration,
        maxDuration,
        operationsWithRetries: withRetries.length,
        retryRate: (withRetries.length / successful.length) * 100,
        successRate: (successful.length / results.length) * 100,
        throughput: Math.round(throughput * 100) / 100,
        totalDeposits,
        totalWithdrawals,
        expectedBalance,
        actualBalance: finalBalance,
        balanceMatch: Math.abs(expectedBalance - finalBalance) < 0.01,
    };
}
/**
 * Ejecutar test de concurrencia
 */
async function runConcurrencyTest() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🧪 CONCURRENCY TEST');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Workers: ${testConfig.numWorkers}`);
    console.log(`Operations per worker: ${testConfig.operationsPerWorker}`);
    console.log(`Total operations: ${testConfig.numWorkers * testConfig.operationsPerWorker}`);
    console.log(`Account ID: ${testConfig.accountId}`);
    console.log(`Server URL: ${testConfig.serverUrl}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    try {
        const healthCheck = await (0, node_fetch_1.default)(`${testConfig.serverUrl}/health`);
        if (!healthCheck.ok) {
            throw new Error('Server is not healthy');
        }
        console.log('✅ Server is running and healthy');
    }
    catch (error) {
        console.error('❌ Server is not responding. Please start the server first.');
        console.error('   Run: npm run dev');
        process.exit(1);
    }
    console.log('');
    console.log('📊 Getting initial balance...');
    const initialBalance = await getBalance(testConfig.accountId);
    console.log(`   Initial balance: $${initialBalance.toFixed(2)}`);
    console.log('');
    console.log('🚀 Starting workers...');
    const startTime = Date.now();
    const workers = [];
    const allResults = [];
    const workerPromises = Array.from({ length: testConfig.numWorkers }, (_, i) => {
        return new Promise((resolve, reject) => {
            const worker = new worker_threads_1.Worker(path.join(__dirname, 'worker.js'), {
                workerData: {
                    workerId: i + 1,
                    serverUrl: testConfig.serverUrl,
                    accountId: testConfig.accountId,
                    operations: testConfig.operationsPerWorker,
                },
            });
            workers.push(worker);
            worker.on('message', (message) => {
                allResults.push(...message.results);
                resolve();
            });
            worker.on('error', (error) => {
                console.error(`❌ Worker ${i + 1} error:`, error);
                reject(error);
            });
            worker.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker ${i + 1} exited with code ${code}`));
                }
            });
        });
    });
    await Promise.all(workerPromises);
    const duration = Date.now() - startTime;
    console.log('');
    console.log('✅ All workers completed');
    console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log('');
    console.log('📊 Getting final balance...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const finalBalance = await getBalance(testConfig.accountId);
    console.log(`   Final balance: $${finalBalance.toFixed(2)}`);
    console.log('');
    console.log('📈 Calculating metrics...');
    const metrics = calculateMetrics(allResults, initialBalance, finalBalance, duration);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Operations:');
    console.log(`  Total:      ${metrics.totalOperations}`);
    console.log(`  Successful: ${metrics.successfulOperations} (${metrics.successRate.toFixed(1)}%)`);
    console.log(`  Failed:     ${metrics.failedOperations}`);
    console.log('');
    console.log('Concurrency Handling:');
    console.log(`  Total retries:             ${metrics.totalRetries}`);
    console.log(`  Operations with retries:   ${metrics.operationsWithRetries}`);
    console.log(`  Retry rate:                ${metrics.retryRate.toFixed(1)}%`);
    console.log('');
    console.log('Performance:');
    console.log(`  Duration:       ${(duration / 1000).toFixed(2)}s`);
    console.log(`  Throughput:     ${metrics.throughput} ops/s`);
    console.log(`  Avg duration:   ${metrics.avgDuration}ms`);
    console.log(`  Min duration:   ${metrics.minDuration}ms`);
    console.log(`  Max duration:   ${metrics.maxDuration}ms`);
    console.log('');
    console.log('Balance Verification:');
    console.log(`  Initial balance:       $${initialBalance.toFixed(2)}`);
    console.log(`  Total deposits:        $${metrics.totalDeposits.toFixed(2)}`);
    console.log(`  Total withdrawals:     $${metrics.totalWithdrawals.toFixed(2)}`);
    console.log(`  Expected final:        $${metrics.expectedBalance.toFixed(2)}`);
    console.log(`  Actual final:          $${metrics.actualBalance.toFixed(2)}`);
    console.log(`  Balance matches:       ${metrics.balanceMatch ? '✅ YES' : '❌ NO'}`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    if (!metrics.balanceMatch) {
        console.error('❌ TEST FAILED: Balance does not match!');
        console.error(`   Difference: $${Math.abs(metrics.expectedBalance - metrics.actualBalance).toFixed(2)}`);
        process.exit(1);
    }
    if (metrics.successRate < 95) {
        console.error('❌ TEST FAILED: Success rate too low!');
        process.exit(1);
    }
    console.log('✅ TEST PASSED: All verifications successful!');
    console.log('');
}
runConcurrencyTest().catch((error) => {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
});
//# sourceMappingURL=concurrency-test.js.map