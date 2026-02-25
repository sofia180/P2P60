import { readFile } from "node:fs/promises";
import { db } from "./index.js";

const main = async () => {
  const schema = await readFile(new URL("./schema.sql", import.meta.url), "utf-8");
  const statements = schema
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await db.query(stmt);
  }
  console.log("Database migrated");
  process.exit(0);
};

main().catch((error) => {
  console.error("Migration failed", error);
  process.exit(1);
});
