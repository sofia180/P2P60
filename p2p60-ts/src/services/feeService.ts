import { config } from "../config.js";

export const calculateFee = (amount: number, isMaker: boolean) => {
  const pct = isMaker ? config.makerFeePct : config.takerFeePct;
  return Number((amount * pct).toFixed(8));
};
