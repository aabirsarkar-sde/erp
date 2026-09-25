import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const g = globalThis as unknown as { __db?: ReturnType<typeof createDb> };

function createDb() {
  const client = createClient({
    url: process.env.DATABASE_URL || "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return drizzle(client, { schema });
}

export const db = g.__db ?? createDb();
if (process.env.NODE_ENV !== "production") g.__db = db;
export * from "./schema";
