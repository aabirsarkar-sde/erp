"use server";
import { BRAND, editionHasCrm, editionHasHd } from "@/lib/core/edition";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { SESSION_COOKIE, signSession } from "@/lib/core/session";

export async function login(_prev: { error?: string } | undefined, fd: FormData) {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const u = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!u || !u.active || !bcrypt.compareSync(password, u.passwordHash)) return { error: "Wrong email or password." };
  const canUse = u.role === "admin" || (editionHasCrm && u.crmAccess !== "none") || (editionHasHd && u.hdAccess !== "none");
  if (!canUse) return { error: `Your account doesn't have access to ${BRAND.name}.` };
  (await cookies()).set(SESSION_COOKIE, await signSession({ uid: u.id, role: u.role }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
