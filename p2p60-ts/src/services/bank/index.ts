import { config } from "../../config.js";
import { BankProvider } from "./provider.js";
import { mockBankProvider } from "./mockBank.js";

export const getBankProvider = (): BankProvider => {
  switch (config.bankProvider) {
    case "mock":
    default:
      return mockBankProvider;
  }
};
