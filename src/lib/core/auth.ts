import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { SESSION_COOKIE, verifySession } from "@/lib/core/session";
import { editionHasCrm, editionHasHd } from "@/lib/core/edition";

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await verifySession(token);
  if (!s) return null;
  const u = await db.query.users.findFirst({ where: eq(users.id, s.uid) });
  if (!u || !u.active) return null;
  const { passwordHash: _ph, ...safe } = u;
  // this deployment is one product: switch off the other department's access entirely
  return { ...safe, crmAccess: editionHasCrm ? safe.crmAccess : ("none" as const), hdAccess: editionHasHd ? safe.hdAccess : ("none" as const) };
});

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
