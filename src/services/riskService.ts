import { Db } from "../db/index.js";
import { config } from "../config.js";

export const flagUser = async (db: Db, userId: string, reason: string) => {
  await db.query("INSERT INTO risk_flags (user_id, reason) VALUES ($1,$2)", [userId, reason]);
  const count = await db.query("SELECT COUNT(*)::int AS c FROM risk_flags WHERE user_id=$1 AND status='open'", [userId]);
  if (count.rows[0]?.c >= config.autoBlockThreshold) {
    await db.query("UPDATE users SET status='blocked' WHERE id=$1", [userId]);
  }
};
