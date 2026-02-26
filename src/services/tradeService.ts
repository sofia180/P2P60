import { Db } from "../db/index.js";
import { HttpError } from "../utils/errors.js";
import { lockFunds, releaseFunds, ensureWallet, adjustBalance } from "./walletService.js";
import { calculateFee } from "./feeService.js";

const getOrder = async (db: Db, orderId: string) => {
  const result = await db.query("SELECT * FROM orders WHERE id=$1", [orderId]);
  return result.rows[0];
};

export const createOfferAndTrade = async (db: Db, data: { orderId: string; userId: string; amount: number }) => {
  return db.transaction(async (tx) => {
    const order = await getOrder(tx, data.orderId);
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status !== "active") throw new HttpError(400, "Order not active");

    if (data.amount < Number(order.min_limit) || data.amount > Number(order.max_limit)) {
      throw new HttpError(400, "Amount outside limits");
    }

    const offerResult = await tx.query(
      `INSERT INTO offers (order_id, user_id, amount, price)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [order.id, data.userId, data.amount, order.price]
    );
    const offer = offerResult.rows[0];

    const isSellOrder = order.side === "sell";
    const sellerId = isSellOrder ? order.user_id : data.userId;
    const buyerId = isSellOrder ? data.userId : order.user_id;

    const sellerWallet = await ensureWallet(tx, sellerId, order.base_currency);

    const feeAmount = calculateFee(data.amount, false);

    await lockFunds(tx, sellerWallet.id, data.amount, "trade", offer.id);

    const tradeResult = await tx.query(
      `INSERT INTO trades (order_id, offer_id, buyer_id, seller_id, base_currency, quote_currency, amount, price, fee_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [order.id, offer.id, buyerId, sellerId, order.base_currency, order.quote_currency, data.amount, order.price, feeAmount]
    );

    const trade = tradeResult.rows[0];
    await tx.query(
      "INSERT INTO escrow_locks (trade_id, wallet_id, locked_amount) VALUES ($1,$2,$3)",
      [trade.id, sellerWallet.id, data.amount]
    );

    await tx.query(
      "UPDATE orders SET filled = filled + $1, status = CASE WHEN filled + $1 >= amount THEN 'filled' ELSE status END WHERE id=$2",
      [data.amount, order.id]
    );

    return { trade, offer };
  });
};

export const confirmPayment = async (db: Db, tradeId: string, userId: string) => {
  const trade = (await db.query("SELECT * FROM trades WHERE id=$1", [tradeId])).rows[0];
  if (!trade) throw new HttpError(404, "Trade not found");
  if (trade.buyer_id !== userId) throw new HttpError(403, "Only buyer can confirm payment");
  if (trade.status !== "locked") throw new HttpError(400, "Trade not in locked state");
  await db.query("UPDATE trades SET status='buyer_confirmed' WHERE id=$1", [tradeId]);
  return { ok: true };
};

export const releaseEscrow = async (db: Db, tradeId: string, userId: string) => {
  return db.transaction(async (tx) => {
    const trade = (await tx.query("SELECT * FROM trades WHERE id=$1 FOR UPDATE", [tradeId])).rows[0];
    if (!trade) throw new HttpError(404, "Trade not found");
    if (trade.seller_id !== userId) throw new HttpError(403, "Only seller can release");
    if (trade.status !== "buyer_confirmed") throw new HttpError(400, "Buyer not confirmed");

    const escrow = (await tx.query("SELECT * FROM escrow_locks WHERE trade_id=$1", [tradeId])).rows[0];
    if (!escrow) throw new HttpError(404, "Escrow not found");

    const buyerWallet = await ensureWallet(tx, trade.buyer_id, trade.base_currency);
    await releaseFunds(tx, escrow.wallet_id, Number(escrow.locked_amount), "trade", trade.id);
    await adjustBalance(tx, buyerWallet.id, Number(escrow.locked_amount) - Number(trade.fee_amount), "ESCROW_RELEASE", "credit", "trade", trade.id);

    await tx.query("UPDATE escrow_locks SET status='released' WHERE id=$1", [escrow.id]);
    await tx.query("UPDATE trades SET status='released' WHERE id=$1", [trade.id]);

    return { ok: true };
  });
};

export const openDispute = async (db: Db, tradeId: string, userId: string, reason?: string) => {
  return db.transaction(async (tx) => {
    const trade = (await tx.query("SELECT * FROM trades WHERE id=$1 FOR UPDATE", [tradeId])).rows[0];
    if (!trade) throw new HttpError(404, "Trade not found");
    if (trade.status === "released") throw new HttpError(400, "Trade already released");
    await tx.query("INSERT INTO disputes (trade_id, opened_by, reason) VALUES ($1,$2,$3)", [tradeId, userId, reason ?? null]);
    await tx.query("UPDATE trades SET status='dispute' WHERE id=$1", [tradeId]);
    return { ok: true };
  });
};
