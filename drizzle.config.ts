import "dotenv/config";
import { defineConfig } from "drizzle-kit";
const url = process.env.DATABASE_URL || "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;
export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "turso",
  dbCredentials: authToken ? { url, authToken } : { url },
});
