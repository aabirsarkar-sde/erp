"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, users, teams, teamMembers } from "@/db";
import { requireAdmin } from "@/lib/auth";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const done = () => revalidatePath("/settings");

export async function createTeam(fd: FormData) {
  await requireAdmin();
  const location = s(fd, "location");
  if (!location) return;
  await db.insert(teams).values({ name: `Support Team: ${location}`, location });
  done();
}

export async function toggleTeam(id: number, active: boolean) {
  await requireAdmin();
  await db.update(teams).set({ active }).where(eq(teams.id, id));
  done();
}

export async function toggleMember(teamId: number, userId: number, on: boolean) {
  await requireAdmin();
  if (on) await db.insert(teamMembers).values({ teamId, userId }).onConflictDoNothing();
  else await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  done();
}

export async function createUser(_p: { error?: string; ok?: string } | undefined, fd: FormData) {
  await requireAdmin();
  const name = s(fd, "name"), email = s(fd, "email").toLowerCase(), password = s(fd, "password");
  const role = (["admin", "manager", "agent"].includes(s(fd, "role")) ? s(fd, "role") : "agent") as "admin" | "manager" | "agent";
  if (!name || !email || password.length < 6) return { error: "Name, email and a 6+ character password are required." };
  const exists = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (exists) return { error: "A user with this email already exists." };
  await db.insert(users).values({ name, email, role, phone: s(fd, "phone") || null, passwordHash: bcrypt.hashSync(password, 10) });
  done();
  return { ok: `${name} added.` };
}

export async function updateUser(id: number, fd: FormData) {
  const me = await requireAdmin();
  const role = s(fd, "role") as "admin" | "manager" | "agent";
  const active = fd.get("active") === "on";
  const password = s(fd, "password");
  await db
    .update(users)
    .set({
      role: id === me.id ? "admin" : role,
      active: id === me.id ? true : active,
      ...(password.length >= 6 ? { passwordHash: bcrypt.hashSync(password, 10) } : {}),
    })
    .where(eq(users.id, id));
  done();
}

export async function updateSla(fd: FormData) {
  await requireAdmin();
  const { saveSla } = await import("@/lib/sla");
  const n = (k: string, d: number) => {
    const v = Number(fd.get(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  await saveSla({
    response: [0, 1, 2, 3].map((p) => n(`response_${p}`, 24)),
    resolution: [0, 1, 2, 3].map((p) => n(`resolution_${p}`, 72)),
  });
  done();
}

export async function setAutoTriage(on: boolean) {
  await requireAdmin();
  const { settings } = await import("@/db");
  await db.insert(settings).values({ key: "ai_auto_triage", value: on ? "on" : "off" }).onConflictDoUpdate({ target: settings.key, set: { value: on ? "on" : "off" } });
  done();
}
