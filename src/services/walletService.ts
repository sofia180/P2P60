import { Db } from "../db/index.js";
import { HttpError } from "../utils/errors.js";

export const ensureWallet = async (db: Db, userId: string, currency: string) => {
  const existing = await db.query("SELECT * FROM wallets WHERE user_id=$1 AND currency=$2", [userId, currency]);
  if (existing.rows[0]) return existing.rows[0];
  const result = await db.query(
    "INSERT INTO wallets (user_id, currency) VALUES ($1, $2) RETURNING *",
    [userId, currency]
  );
  return result.rows[0];
};

export const adjustBalance = async (db: Db, walletId: string, amount: number, type: string, direction: "debit" | "credit", refType?: string, refId?: string) => {
  if (direction === "debit") {
    await db.query("UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id=$2", [amount, walletId]);
  } else {
    await db.query("UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id=$2", [amount, walletId]);
  }
  await db.query(
    "INSERT INTO ledger_entries (wallet_id, type, amount, direction, ref_type, ref_id) VALUES ($1,$2,$3,$4,$5,$6)",
    [walletId, type, amount, direction, refType ?? null, refId ?? null]
  );
};

export const lockFunds = async (db: Db, walletId: string, amount: number, refType: string, refId: string) => {
  const rows = await db.query("SELECT balance, locked FROM wallets WHERE id=$1 FOR UPDATE", [walletId]);
  const wallet = rows.rows[0];
  if (!wallet) throw new HttpError(404, "Wallet not found");
  if (Number(wallet.balance) < amount) throw new HttpError(400, "Insufficient balance");
  await db.query("UPDATE wallets SET balance = balance - $1, locked = locked + $1, updated_at = NOW() WHERE id=$2", [amount, walletId]);
  await db.query(
    "INSERT INTO ledger_entries (wallet_id, type, amount, direction, ref_type, ref_id) VALUES ($1,$2,$3,$4,$5,$6)",
    [walletId, "ESCROW_LOCK", amount, "debit", refType, refId]
  );
};

export const releaseFunds = async (db: Db, walletId: string, amount: number, refType: string, refId: string) => {
  await db.query("UPDATE wallets SET locked = locked - $1, updated_at = NOW() WHERE id=$2", [amount, walletId]);
  await db.query(
    "INSERT INTO ledger_entries (wallet_id, type, amount, direction, ref_type, ref_id) VALUES ($1,$2,$3,$4,$5,$6)",
    [walletId, "ESCROW_RELEASE", amount, "credit", refType, refId]
  );
};
