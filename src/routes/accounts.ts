import { Router } from 'express';
import { pool } from '../config/database';
import { TransactionService } from '../services/TransactionService';
import { AccountController } from '../controllers/AccountController';
import { AccountQueryService } from '../services/AccountQueryService';
import {
  validateBody,
  validateAccountId,
  validateStatementQuery,
  validatePaginationQuery,
} from '../middleware/validator';

const router = Router();
const transactionService = new TransactionService(pool);
const queryService = new AccountQueryService(pool);
const accountController = new AccountController(transactionService, queryService);

router.get('/:id', validateAccountId, (req, res, next) =>
  accountController.getAccount(req, res, next)
);

router.get('/:id/balance', validateAccountId, async (req, res, next) =>
  accountController.getBalance(req, res, next)
);

router.get(
  '/:id/transactions',
  validateAccountId,
  validatePaginationQuery,
  async (req, res, next) => accountController.getTransactionHistory(req, res, next)
);

router.get('/:id/statement', validateAccountId, validateStatementQuery, async (req, res, next) =>
  accountController.generateStatement(req, res, next)
);

router.post('/:id/deposit', validateAccountId, validateBody, async (req, res, next) =>
  accountController.deposit(req, res, next)
);

router.post('/:id/withdraw', validateAccountId, validateBody, async (req, res, next) =>
  accountController.withdraw(req, res, next)
);

export default router;
