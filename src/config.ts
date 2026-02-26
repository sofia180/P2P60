import dotenv from "dotenv";

dotenv.config();

const getEnv = (key: string, fallback?: string) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
};

export const config = {
  env: getEnv("NODE_ENV", "development"),
  port: Number(getEnv("PORT", "3000")),
  botToken: getEnv("BOT_TOKEN", ""),
  webAppUrl: getEnv("WEBAPP_URL", ""),
  jwtSecret: getEnv("JWT_SECRET"),
  jwtRefreshSecret: getEnv("JWT_REFRESH_SECRET"),
  redisUrl: getEnv("REDIS_URL"),
  databaseUrl: getEnv("DATABASE_URL"),
  exchangeProvider: getEnv("EXCHANGE_PROVIDER", "none"),
  exchangeApiKey: getEnv("EXCHANGE_API_KEY", ""),
  exchangeApiSecret: getEnv("EXCHANGE_API_SECRET", ""),
  bankProvider: getEnv("BANK_PROVIDER", "mock"),
  webhookBaseUrl: getEnv("WEBHOOK_BASE_URL", "http://localhost:3000"),
  makerFeePct: Number(getEnv("MAKER_FEE_PCT", "0.001")),
  takerFeePct: Number(getEnv("TAKER_FEE_PCT", "0.002")),
  minTradeAmount: Number(getEnv("MIN_TRADE_AMOUNT", "10")),
  maxTradeAmount: Number(getEnv("MAX_TRADE_AMOUNT", "100000")),
  twofaIssuer: getEnv("TWOFA_ISSUER", "P2P60"),
  autoBlockThreshold: Number(getEnv("AUTO_BLOCK_THRESHOLD", "3")),
};
