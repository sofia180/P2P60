import bcrypt from "bcryptjs";
import { Db } from "../db/index.js";
import { HttpError } from "../utils/errors.js";

export const createUser = async (db: Db, data: { email?: string; phone?: string; password?: string; tgId?: number }) => {
  const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : null;
  const result = await db.query<{ id: string }>(
    `INSERT INTO users (email, phone, password_hash, tg_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [data.email ?? null, data.phone ?? null, passwordHash, data.tgId ?? null]
  );
  const userId = result.rows[0].id;
  await db.query("INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)", [userId, data.email ?? data.phone ?? "New user"]);
  return userId;
};

export const findUserByEmail = async (db: Db, email: string) => {
  const result = await db.query("SELECT * FROM users WHERE email=$1", [email]);
  return result.rows[0] ?? null;
};

export const findUserByTelegramId = async (db: Db, tgId: number) => {
  const result = await db.query("SELECT * FROM users WHERE tg_id=$1", [tgId]);
  return result.rows[0] ?? null;
};

export const ensureTelegramUser = async (db: Db, tgId: number, displayName: string) => {
  let user = await findUserByTelegramId(db, tgId);
  if (user) return user;
  const userId = await createUser(db, { tgId });
  await db.query("UPDATE profiles SET display_name=$1 WHERE user_id=$2", [displayName, userId]);
  const result = await db.query("SELECT * FROM users WHERE id=$1", [userId]);
  return result.rows[0];
};

export const verifyPassword = async (password: string, hash: string | null) => {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
};

export const requireActiveUser = (user: any) => {
  if (!user) throw new HttpError(404, "User not found");
  if (user.status !== "active") throw new HttpError(403, "User blocked or inactive");
};
