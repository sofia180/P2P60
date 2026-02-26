import { BankProvider } from "./provider.js";

export const mockBankProvider: BankProvider = {
  async initiateDeposit() {
    return { providerRef: `mock-dep-${Date.now()}`, status: "pending" };
  },
  async initiateWithdrawal() {
    return { providerRef: `mock-wd-${Date.now()}`, status: "pending" };
  },
};
