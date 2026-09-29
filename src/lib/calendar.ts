import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, calendarTokens } from "@/db";

// Resolve the `who` calendar filter to a user id (null = everyone, no scoping).
// A malformed value (e.g. ?who=abc) must never disable scoping: fall back to the current user.
// Valid integers (including 0 and negatives) are passed through unchanged.
export function resolveWho(raw: string | undefined, meId: number): number | null {
  if (raw === undefined) return meId;
  const t = raw.trim();
  if (t === "") return meId;
  if (t === "all") return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : meId;
}

// The scoping decisions the calendar page makes for a given `who` param.
// `who === null` means "everyone" (no scoping); otherwise every filter is scoped to that user id.
export type CalendarScope = {
  who: number | null;
  events: { userId: number } | null;
  activities: { userId: number } | undefined;
  tickets: { assigneeId: number } | undefined;
};

export function calendarScope(raw: string | undefined, meId: number): CalendarScope {
  const who = resolveWho(raw, meId);
  const scoped = who !== null;
  return {
    who,
    events: scoped ? { userId: who } : null,
    activities: scoped ? { userId: who } : undefined,
    tickets: scoped && raw !== undefined ? { assigneeId: who } : undefined,
  };
}

export async function getOrCreateCalendarToken(userId: number, regenerate = false) {
  const row = await db.query.calendarTokens.findFirst({ where: eq(calendarTokens.userId, userId) });
  if (row && !regenerate) return row.token;
  const token = randomBytes(18).toString("base64url");
  if (row) await db.update(calendarTokens).set({ token }).where(eq(calendarTokens.userId, userId));
  else await db.insert(calendarTokens).values({ userId, token });
  return token;
}

