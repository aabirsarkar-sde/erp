import "server-only";
import { asc, isNotNull } from "drizzle-orm";
import { db, tagDefs, leads } from "@/db";
import { tagList, type TagDef } from "./meta";

export const getTagDefs = (): Promise<TagDef[]> => db.select({ name: tagDefs.name, group: tagDefs.group, color: tagDefs.color }).from(tagDefs).orderBy(asc(tagDefs.group), asc(tagDefs.name));

/** every label in use or defined — for the picker's suggestions */
export async function tagSuggestions() {
  const [defs, used] = await Promise.all([getTagDefs(), db.selectDistinct({ t: leads.tags }).from(leads).where(isNotNull(leads.tags))]);
  const names = new Map(defs.map((d) => [d.name.toLowerCase(), d]));
  for (const r of used) for (const t of tagList(r.t)) if (!names.has(t.toLowerCase())) names.set(t.toLowerCase(), { name: t, group: /^OR FY/i.test(t) ? "Order" : "Other", color: /^OR FY/i.test(t) ? "emerald" : "slate" });
  return [...names.values()];
}
