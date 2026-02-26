import { newDb } from "pg-mem";
import { Db } from "../src/db/index.js";
import { readFile } from "node:fs/promises";

export const createTestDb = async (): Promise<Db> => {
  const mem = newDb();
  const adapter = mem.adapters.createPg();
  const pool = new adapter.Pool();

  const schema = await readFile(new URL("../src/db/schema.sql", import.meta.url), "utf-8");
  const statements = schema
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }

  const db: Db = {
    query: async (sql, params) => {
      const result = await pool.query(sql, params);
      return { rows: result.rows };
    },
    transaction: async (fn) => {
      await pool.query("BEGIN");
      try {
        const result = await fn(db);
        await pool.query("COMMIT");
        return result;
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    },
  };

  return db;
};
