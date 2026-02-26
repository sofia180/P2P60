import { Db } from "../db/index.js";
import { getBankProvider } from "./bank/index.js";

export const createDeposit = async (db: Db, userId: string, amount: number, currency: string, accountId: string) => {
  const provider = getBankProvider();
  const response = await provider.initiateDeposit({ userId, amount, currency, accountId });
  const result = await db.query(
    "INSERT INTO bank_transfers (user_id, type, amount, currency, status, provider_ref) VALUES ($1,'deposit',$2,$3,$4,$5) RETURNING *",
    [userId, amount, currency, response.status, response.providerRef]
  );
  return result.rows[0];
};

export const createWithdrawal = async (db: Db, userId: string, amount: number, currency: string, accountId: string) => {
  const provider = getBankProvider();
  const response = await provider.initiateWithdrawal({ userId, amount, currency, accountId });
  const result = await db.query(
    "INSERT INTO bank_transfers (user_id, type, amount, currency, status, provider_ref) VALUES ($1,'withdraw',$2,$3,$4,$5) RETURNING *",
    [userId, amount, currency, response.status, response.providerRef]
  );
  return result.rows[0];
};
