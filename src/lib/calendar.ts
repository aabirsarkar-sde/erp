import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, calendarTokens } from "@/db";

export async function getOrCreateCalendarToken(userId: number, regenerate = false) {
  const row = await db.query.calendarTokens.findFirst({ where: eq(calendarTokens.userId, userId) });
  if (row && !regenerate) return row.token;
  const token = randomBytes(18).toString("base64url");
  if (row) await db.update(calendarTokens).set({ token }).where(eq(calendarTokens.userId, userId));
  else await db.insert(calendarTokens).values({ userId, token });
  return token;
}

