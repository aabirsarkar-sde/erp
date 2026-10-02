import "server-only";
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";

export type Company = { name: string; address: string; gstin: string; phone: string; email: string; website: string; bank: string };
const DEFAULT_COMPANY: Company = {
  name: "Zero Discharge Systems Pvt. Ltd.",
  address: "Vadodara, Gujarat, India",
  gstin: "",
  phone: "",
  email: "",
  website: "",
  bank: "",
};

export async function getCompany(): Promise<Company> {
  const r = await db.query.settings.findFirst({ where: eq(settings.key, "company") });
  if (!r) return DEFAULT_COMPANY;
  try { return { ...DEFAULT_COMPANY, ...JSON.parse(r.value) }; } catch { return DEFAULT_COMPANY; }
}

export async function saveCompany(c: Company) {
  const value = JSON.stringify(c);
  await db.insert(settings).values({ key: "company", value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}
