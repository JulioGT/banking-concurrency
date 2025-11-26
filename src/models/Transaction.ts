export type TransactionType = 'deposit' | 'withdraw';

export interface Transaction {
  id: string;
  account_id: string;
  amount: number;
  type: TransactionType;
  balance_after: number;
  idempotency_key?: string;
  created_at: Date;
}

export interface CreateTransactionDTO {
  account_id: string;
  amount: number;
  type: TransactionType;
  balance_after: number;
  idempotency_key?: string;
}
