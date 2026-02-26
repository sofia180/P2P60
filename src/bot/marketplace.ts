import crypto from "node:crypto";
import { fetchRates } from "../services/rateService.js";
import { calculateFee } from "../services/feeService.js";
import { executeExternalTrade } from "../services/exchangeService.js";

export type OrderType = "BUY" | "SELL";
export type OrderStatus = "OPEN" | "FILLED" | "CANCELLED";

export type Order = {
  id: string;
  user_id: string;
  username: string;
  type: OrderType;
  asset: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  price?: number;
  isMarketMaker?: boolean;
};

type TradeResult = {
  order: Order;
  filledAmount: number;
  fee: number;
  netAmount: number;
  instant: boolean;
  externalRef?: string;
};

const userOrders: Order[] = [];
let marketOrders: Order[] = [];

const marketMakers = [
  { id: "mm-alpha", username: "MM_ALPHA" },
  { id: "mm-beta", username: "MM_BETA" },
];

const buildId = () => crypto.randomUUID().slice(0, 8);

const randomSpread = () => 0.01 + Math.random() * 0.01;

const priceFor = (mid: number | null, side: OrderType) => {
  if (!mid) return null;
  const spread = randomSpread();
  return side === "BUY" ? mid * (1 - spread) : mid * (1 + spread);
};

const seedMarketMakers = async () => {
  try {
    const rates = await fetchRates();
    const assets = [
      { asset: "BTC", mid: rates.btc_usd, amount: 2 },
      { asset: "ETH", mid: rates.eth_usd, amount: 50 },
      { asset: "USDT", mid: rates.usdt_usd ?? 1, amount: 50_000 },
      { asset: "USDC", mid: rates.usdc_usd ?? 1, amount: 50_000 },
    ];

    const next: Order[] = [];
    for (const mm of marketMakers) {
      for (const item of assets) {
        const buyPrice = priceFor(item.mid, "BUY");
        const sellPrice = priceFor(item.mid, "SELL");
        next.push({
          id: `MM-${mm.id}-${item.asset}-BUY`,
          user_id: mm.id,
          username: mm.username,
          type: "BUY",
          asset: item.asset,
          amount: item.amount,
          currency: "USD",
          price: buyPrice ?? undefined,
          status: "OPEN",
          isMarketMaker: true,
        });
        next.push({
          id: `MM-${mm.id}-${item.asset}-SELL`,
          user_id: mm.id,
          username: mm.username,
          type: "SELL",
          asset: item.asset,
          amount: item.amount,
          currency: "USD",
          price: sellPrice ?? undefined,
          status: "OPEN",
          isMarketMaker: true,
        });
      }
    }
    marketOrders = next;
  } catch {
    // If rate provider is unavailable, keep previous snapshot.
  }
};

export const initMarketMakers = async () => {
  await seedMarketMakers();
  setInterval(seedMarketMakers, 60_000);
};

export const createUserOrder = (payload: {
  user_id: string;
  username: string;
  type: OrderType;
  asset: string;
  amount: number;
  currency: string;
}) => {
  const order: Order = {
    id: `U-${buildId()}`,
    status: "OPEN",
    ...payload,
  };
  userOrders.push(order);
  return order;
};

export const listOrders = () => {
  return [...marketOrders, ...userOrders].filter((o) => o.status === "OPEN");
};

export const listUserOrders = (userId: string) => {
  return userOrders.filter((o) => o.user_id === userId);
};

export const findOrder = (id: string) => {
  return [...marketOrders, ...userOrders].find((o) => o.id === id);
};

export const tradeOrder = async (order: Order, takerId: string, amount?: number): Promise<TradeResult> => {
  if (order.user_id === takerId) {
    throw new Error("Нельзя торговать своим ордером");
  }
  const filledAmount = amount && amount > 0 && amount < order.amount ? amount : order.amount;
  const fee = calculateFee(filledAmount, false);
  const netAmount = Number((filledAmount - fee).toFixed(8));

  if (order.isMarketMaker) {
    return { order, filledAmount, fee, netAmount, instant: true };
  }

  if (filledAmount >= order.amount) {
    order.status = "FILLED";
  } else {
    order.amount = Number((order.amount - filledAmount).toFixed(8));
  }

  const external = await executeExternalTrade({
    orderId: order.id,
    side: order.type,
    asset: order.asset,
    amount: filledAmount,
    currency: order.currency,
  });

  return {
    order,
    filledAmount,
    fee,
    netAmount,
    instant: false,
    externalRef: external.reference,
  };
};

