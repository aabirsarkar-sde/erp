import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const g = globalThis as unknown as { __db?: ReturnType<typeof createDb> };

function createDb() {
  const client = createClient({
    url: process.env.DATABASE_URL || "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  // local SQLite file: WAL lets reads and writes overlap (several server workers share the file).
  // Turso in production handles this itself.
  if ((process.env.DATABASE_URL || "file:").startsWith("file:")) {
    void client.execute("PRAGMA journal_mode=WAL").catch(() => {});
    void client.execute("PRAGMA busy_timeout=5000").catch(() => {});
  }
  return drizzle(client, { schema });
}

export const db = g.__db ?? createDb();
if (process.env.NODE_ENV !== "production") g.__db = db;
export * from "./schema";
