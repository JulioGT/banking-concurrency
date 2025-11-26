/**
 * ACCOUNT MAIN INTERFACE
 */

export interface Account {
  id: string;
  balance: number;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface updateBalanceDTO {
  accountId: string;
  amount: number;
  expectedVersion: number;
}
