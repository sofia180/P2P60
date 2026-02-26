import pg from "pg";
import { config } from "../config.js";

export type QueryResult<T> = { rows: T[] };

export interface Db {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

export const createDb = (connectionString: string): Db => {
  const pool = new pg.Pool({ connectionString });

  const query: Db["query"] = async (sql, params) => {
    const result = await pool.query(sql, params);
    return { rows: result.rows };
  };

  const transaction: Db["transaction"] = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb: Db = {
        query: async (sql, params) => {
          const result = await client.query(sql, params);
          return { rows: result.rows };
        },
        transaction: async (innerFn) => innerFn(txDb),
      };
      const result = await fn(txDb);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  return { query, transaction };
};

export const db = createDb(config.databaseUrl);
