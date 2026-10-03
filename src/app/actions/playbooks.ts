"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, playbooks } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { parseSteps } from "@/lib/crm/playbook-meta";

async function manager() {
  const me = await requireUser();
  requireDept(me, "crm");
  if (me.role !== "admin" && me.crmAccess !== "all") throw new Error("Only sales managers can change playbooks.");
  return me;
}

export async function savePlaybook(id: number | null, _p: { ok?: number; error?: string } | undefined, fd: FormData) {
  await manager();
  const name = String(fd.get("name") ?? "").trim();
  const steps = parseSteps(String(fd.get("steps") ?? "[]"));
  if (name.length < 2) return { error: "Name the playbook" };
  if (!steps.length) return { error: "Add at least one step" };
  const trigger = fd.get("trigger") === "stage" ? "stage" : "created";
  const stageId = trigger === "stage" ? Number(fd.get("stageId")) || null : null;
  if (trigger === "stage" && !stageId) return { error: "Pick the stage" };
  const v = { name: name.slice(0, 80), trigger: trigger as "stage" | "created", stageId, matchProduct: String(fd.get("matchProduct") ?? "").trim() || null, matchSegment: String(fd.get("matchSegment") ?? "").trim() || null, steps: JSON.stringify(steps) };
  if (id) await db.update(playbooks).set(v).where(eq(playbooks.id, id));
  else await db.insert(playbooks).values(v);
  revalidatePath("/playbooks");
  return { ok: Date.now() };
}

export async function togglePlaybook(id: number, active: boolean) {
  await manager();
  await db.update(playbooks).set({ active }).where(eq(playbooks.id, id));
  revalidatePath("/playbooks");
}

export async function deletePlaybook(id: number) {
  await manager();
  await db.delete(playbooks).where(eq(playbooks.id, id));
  revalidatePath("/playbooks");
}
