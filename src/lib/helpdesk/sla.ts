import "server-only";
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";

export type Sla = { response: number[]; resolution: number[] }; // hours, indexed by priority 0..3
const DEFAULT_SLA: Sla = { response: [24, 8, 4, 2], resolution: [120, 72, 24, 8] };

export async function getSla(): Promise<Sla> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, "sla") });
  if (!row) return DEFAULT_SLA;
  try {
    const v = JSON.parse(row.value) as Sla;
    if (v.response?.length === 4 && v.resolution?.length === 4) return v;
  } catch {}
  return DEFAULT_SLA;
}

export async function saveSla(v: Sla) {
  await db.insert(settings).values({ key: "sla", value: JSON.stringify(v) }).onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(v) } });
}
