import { Db } from "../db/index.js";

export const submitKyc = async (db: Db, userId: string, payload: any) => {
  const result = await db.query(
    "INSERT INTO kyc_requests (user_id, payload, status) VALUES ($1,$2,'pending') RETURNING *",
    [userId, payload]
  );
  await db.query("UPDATE users SET kyc_status='pending' WHERE id=$1", [userId]);
  return result.rows[0];
};
