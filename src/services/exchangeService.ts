import { config } from "../config.js";

export type ExchangeTradeResult = {
  ok: boolean;
  reference?: string;
  provider?: string;
  error?: string;
};

export const executeExternalTrade = async (payload: {
  orderId: string;
  side: "BUY" | "SELL";
  asset: string;
  amount: number;
  currency: string;
}) => {
  if (!config.exchangeProvider || config.exchangeProvider === "none") {
    return { ok: true, reference: "LOCAL_SIM", provider: "local" } satisfies ExchangeTradeResult;
  }

  // Placeholder for real integration (Binance/OKX).
  // Here you would sign requests and call the provider API.
  // Example:
  // - Binance P2P: https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search
  // - OKX P2P: https://www.okx.com/docs-v5/en/#trading-account-rest-api
  // Use config.exchangeApiKey / exchangeApiSecret for auth.

  return {
    ok: true,
    reference: `${config.exchangeProvider.toUpperCase()}-SIM-${payload.orderId}`,
    provider: config.exchangeProvider,
  } satisfies ExchangeTradeResult;
};

