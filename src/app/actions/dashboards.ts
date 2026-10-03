"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db, dashboards } from "@/db";
import { requireUser, type CurrentUser } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { parseWidgets } from "@/lib/crm/dashboards";
import { W_CHARTS, W_GROUPS, W_METRICS, W_RANGES, STARTER, newWidgetId, type Widget } from "@/lib/crm/dashboards-meta";

const MAX_BOARDS = 8, MAX_WIDGETS = 16;

async function me() { const u = await requireUser(); requireDept(u, "crm"); return u; }
async function mine(u: CurrentUser, id: number) {
  const d = await db.query.dashboards.findFirst({ where: and(eq(dashboards.id, id), eq(dashboards.userId, u.id)) });
  if (!d) throw new Error("You can only change your own dashboards.");
  return d;
}
const save = async (id: number, widgets: Widget[]) => { await db.update(dashboards).set({ widgets: JSON.stringify(widgets) }).where(eq(dashboards.id, id)); revalidatePath("/dashboards"); };

export async function createDashboard(fd: FormData) {
  const u = await me();
  const name = String(fd.get("name") ?? "").trim().slice(0, 60) || "My dashboard";
  const count = (await db.select({ id: dashboards.id }).from(dashboards).where(eq(dashboards.userId, u.id))).length;
  if (count >= MAX_BOARDS) throw new Error(`You can keep up to ${MAX_BOARDS} dashboards.`);
  const pick = String(fd.get("starter") ?? "");
  const tpl = pick === "1" ? STARTER.find((x) => x.name === "Sales overview") : STARTER.find((x) => x.name === pick);
  const widgets = tpl ? tpl.widgets.map((w) => ({ ...w, id: newWidgetId() })) : [];
  const [d] = await db.insert(dashboards).values({ userId: u.id, name, widgets: JSON.stringify(widgets), sortOrder: count }).returning();
  revalidatePath("/dashboards");
  redirect(`/dashboards?d=${d!.id}${tpl ? "" : "&edit=1"}`);
}

/** copy a board someone shared into my own list */
export async function copyDashboard(id: number) {
  const u = await me();
  const src = await db.query.dashboards.findFirst({ where: and(eq(dashboards.id, id), or(eq(dashboards.userId, u.id), eq(dashboards.shared, true))) });
  if (!src) throw new Error("Not found");
  const [d] = await db.insert(dashboards).values({ userId: u.id, name: `${src.name} (copy)`.slice(0, 60), widgets: src.widgets, sortOrder: 99 }).returning();
  revalidatePath("/dashboards");
  redirect(`/dashboards?d=${d!.id}`);
}

export async function renameDashboard(id: number, fd: FormData) {
  const u = await me(); await mine(u, id);
  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  if (name) await db.update(dashboards).set({ name }).where(eq(dashboards.id, id));
  revalidatePath("/dashboards");
}

export async function shareDashboard(id: number, shared: boolean) {
  const u = await me(); await mine(u, id);
  await db.update(dashboards).set({ shared }).where(eq(dashboards.id, id));
  revalidatePath("/dashboards");
}

export async function deleteDashboard(id: number) {
  const u = await me(); await mine(u, id);
  await db.delete(dashboards).where(eq(dashboards.id, id));
  revalidatePath("/dashboards");
  redirect("/dashboards");
}

const widgetSchema = z.object({
  title: z.string().trim().max(60).optional(),
  metric: z.enum(Object.keys(W_METRICS) as [keyof typeof W_METRICS]),
  groupBy: z.enum(Object.keys(W_GROUPS) as [keyof typeof W_GROUPS]),
  chart: z.enum(Object.keys(W_CHARTS) as [keyof typeof W_CHARTS]),
  range: z.enum(Object.keys(W_RANGES) as [keyof typeof W_RANGES]),
  size: z.enum(["half", "full"]).default("half"),
});

export async function addWidget(id: number, _p: { error?: string; ok?: number } | undefined, fd: FormData) {
  const u = await me(); const d = await mine(u, id);
  const p = widgetSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Pick a measure, grouping, chart and period." };
  const list = parseWidgets(d.widgets);
  if (list.length >= MAX_WIDGETS) return { error: `Up to ${MAX_WIDGETS} charts per dashboard.` };
  const w = p.data;
  // a "big number" is always a total; a line chart is always by month
  const groupBy = w.chart === "number" ? "none" : w.chart === "line" ? "month" : w.groupBy;
  list.push({ id: newWidgetId(), title: w.title || `${W_METRICS[w.metric].label}${groupBy !== "none" ? ` by ${W_GROUPS[groupBy].toLowerCase()}` : ""}`, metric: w.metric, groupBy, chart: w.chart, range: w.range, size: w.chart === "number" ? undefined : w.size });
  await save(id, list);
  return { ok: Date.now() };
}

export async function removeWidget(id: number, wid: string) {
  const u = await me(); const d = await mine(u, id);
  await save(id, parseWidgets(d.widgets).filter((w) => w.id !== wid));
}

export async function moveWidget(id: number, wid: string, dir: -1 | 1) {
  const u = await me(); const d = await mine(u, id);
  const list = parseWidgets(d.widgets);
  const i = list.findIndex((w) => w.id === wid), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  await save(id, list);
}
