import { Db } from "../db/index.js";
import { HttpError } from "../utils/errors.js";
import { config } from "../config.js";

export const createOrder = async (db: Db, data: {
  userId: string;
  side: "buy" | "sell";
  baseCurrency: string;
  quoteCurrency: string;
  price: number;
  amount: number;
  minLimit: number;
  maxLimit: number;
  paymentMethod?: string;
}) => {
  if (data.amount < config.minTradeAmount) throw new HttpError(400, "Amount below minimum");
  if (data.amount > config.maxTradeAmount) throw new HttpError(400, "Amount above maximum");
  const result = await db.query(
    `INSERT INTO orders (user_id, side, base_currency, quote_currency, price, amount, min_limit, max_limit, payment_method)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      data.userId,
      data.side,
      data.baseCurrency,
      data.quoteCurrency,
      data.price,
      data.amount,
      data.minLimit,
      data.maxLimit,
      data.paymentMethod ?? null,
    ]
  );
  return result.rows[0];
};

export const listActiveOrders = async (db: Db, filters: { side?: string; baseCurrency?: string; quoteCurrency?: string }) => {
  const conditions: string[] = ["status='active'"];
  const params: any[] = [];
  if (filters.side) {
    params.push(filters.side);
    conditions.push(`side=$${params.length}`);
  }
  if (filters.baseCurrency) {
    params.push(filters.baseCurrency);
    conditions.push(`base_currency=$${params.length}`);
  }
  if (filters.quoteCurrency) {
    params.push(filters.quoteCurrency);
    conditions.push(`quote_currency=$${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await db.query(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT 50`, params);
  return result.rows;
};

export const closeOrder = async (db: Db, orderId: string, userId: string) => {
  const result = await db.query("UPDATE orders SET status='closed' WHERE id=$1 AND user_id=$2 RETURNING *", [orderId, userId]);
  if (!result.rows[0]) throw new HttpError(404, "Order not found");
  return result.rows[0];
};
