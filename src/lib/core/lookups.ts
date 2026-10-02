import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, teams, users, customers } from "@/db";

/** dropdown data shared by both products: active zones, active users, customers */
export async function lookups() {
  const [t, u, c] = await Promise.all([
    db.select({ id: teams.id, name: teams.name, location: teams.location }).from(teams).where(eq(teams.active, true)).orderBy(asc(teams.id)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name)),
    db.select({ id: customers.id, name: customers.name, city: customers.city }).from(customers).orderBy(asc(customers.name)),
  ]);
  return { teams: t, users: u, customers: c };
}
