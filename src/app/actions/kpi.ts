"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, kpiDefs, kpiTargets, kpiValues, KPI_PERIODS } from "@/db";
import { requireAdmin, requireUser } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { KPI_METRICS } from "@/lib/crm/kpi-meta";
import { canEditKpiValue } from "@/lib/crm/kpi";

const done = () => { revalidatePath("/kpi"); revalidatePath("/kpi/setup"); revalidatePath("/calendar"); revalidatePath("/"); };

const defSchema = z.object({
  name: z.string().trim().min(2, "Give the KPI a name").max(80),
  kind: z.enum(["kpi", "kra"]),
  period: z.enum(KPI_PERIODS),
  metric: z.string().refine((m) => m in KPI_METRICS, "Pick what to measure"),
  target: z.coerce.number().min(0).max(1e12),
  sortOrder: z.coerce.number().int().default(0),
});

export async function saveKpiDef(id: number | null, _p: { error?: string; ok?: boolean } | undefined, fd: FormData) {
  await requireAdmin();
  const p = defSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form" };
  if (id) await db.update(kpiDefs).set(p.data).where(eq(kpiDefs.id, id));
  else await db.insert(kpiDefs).values(p.data);
  done();
  return { ok: true };
}

export async function toggleKpiDef(id: number, active: boolean) {
  await requireAdmin();
  await db.update(kpiDefs).set({ active }).where(eq(kpiDefs.id, id));
  done();
}

export async function deleteKpiDef(id: number) {
  await requireAdmin();
  await db.delete(kpiDefs).where(eq(kpiDefs.id, id));
  done();
}

/** per-person target; blank clears the override (back to the default target), 0 = not applicable */
export async function setKpiTarget(kpiId: number, userId: number, raw: string) {
  await requireAdmin();
  const v = raw.trim();
  if (v === "") await db.delete(kpiTargets).where(and(eq(kpiTargets.kpiId, kpiId), eq(kpiTargets.userId, userId)));
  else {
    const target = Math.max(0, Number(v) || 0);
    await db.insert(kpiTargets).values({ kpiId, userId, target }).onConflictDoUpdate({ target: [kpiTargets.kpiId, kpiTargets.userId], set: { target } });
  }
  done();
}

/** achieved figure for a hand-entered KPI */
export async function setKpiValue(kpiId: number, userId: number, period: string, raw: string, note?: string) {
  const me = await requireUser();
  requireDept(me, "crm");
  if (!canEditKpiValue(me, userId)) throw new Error("Only the sales head can enter this.");
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(period)) throw new Error("Bad period");
  const value = Number(raw.replace(/[,₹\s]/g, "")) || 0;
  await db.insert(kpiValues).values({ kpiId, userId, period, value, note: note?.trim() || null, enteredById: me.id })
    .onConflictDoUpdate({ target: [kpiValues.kpiId, kpiValues.userId, kpiValues.period], set: { value, note: note?.trim() || null, enteredById: me.id, updatedAt: new Date() } });
  done();
}
