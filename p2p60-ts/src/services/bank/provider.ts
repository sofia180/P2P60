export type BankTransferRequest = {
  userId: string;
  amount: number;
  currency: string;
  accountId: string;
};

export type BankTransferResponse = {
  providerRef: string;
  status: "pending" | "completed" | "failed";
};

export interface BankProvider {
  initiateDeposit(req: BankTransferRequest): Promise<BankTransferResponse>;
  initiateWithdrawal(req: BankTransferRequest): Promise<BankTransferResponse>;
}
