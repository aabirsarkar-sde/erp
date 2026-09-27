"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, plants } from "@/db";
import { requireUser } from "@/lib/auth";

const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? "").trim(); return v || null; };

export async function savePlant(id: number | null, _p: { error?: string; ok?: boolean } | undefined, fd: FormData) {
  const me = await requireUser();
  if (me.role === "agent") return { error: "Only managers can edit plants." };
  const plantNo = s(fd, "plantNo")?.toUpperCase(), name = s(fd, "name");
  if (!plantNo || !name) return { error: "Plant number and name are required." };
  const dupe = await db.query.plants.findFirst({ where: eq(plants.plantNo, plantNo) });
  if (dupe && dupe.id !== id) return { error: `${plantNo} already exists.` };
  const data = { plantNo, name, customerId: Number(fd.get("customerId")) || null, teamId: Number(fd.get("teamId")) || null, city: s(fd, "city"), state: s(fd, "state"), capacity: s(fd, "capacity"), technology: s(fd, "technology"), active: id ? fd.get("active") === "on" : true };
  if (id) await db.update(plants).set(data).where(eq(plants.id, id));
  else await db.insert(plants).values(data);
  revalidatePath("/plants");
  return { ok: true };
}
