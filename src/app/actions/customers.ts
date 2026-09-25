"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, customers, contacts } from "@/db";
import { requireUser } from "@/lib/auth";

const s = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v || null;
};
const custFields = (fd: FormData) => ({ city: s(fd, "city"), address: s(fd, "address"), email: s(fd, "email"), phone: s(fd, "phone"), gstin: s(fd, "gstin"), notes: s(fd, "notes") });

export async function createCustomer(fd: FormData) {
  await requireUser();
  const name = s(fd, "name");
  if (!name) return;
  const [c] = await db.insert(customers).values({ name, ...custFields(fd) }).returning();
  revalidatePath("/customers");
  redirect(`/customers/${c!.id}`);
}

export async function updateCustomer(id: number, fd: FormData) {
  await requireUser();
  const name = s(fd, "name");
  if (!name) return;
  await db.update(customers).set({ name, ...custFields(fd) }).where(eq(customers.id, id));
  revalidatePath(`/customers/${id}`);
}

export async function addContact(customerId: number, fd: FormData) {
  await requireUser();
  const name = s(fd, "name");
  if (!name) return;
  await db.insert(contacts).values({ name, customerId, designation: s(fd, "designation"), email: s(fd, "email"), phone: s(fd, "phone") });
  revalidatePath(`/customers/${customerId}`);
}

export async function deleteContact(customerId: number, id: number) {
  await requireUser();
  await db.delete(contacts).where(eq(contacts.id, id));
  revalidatePath(`/customers/${customerId}`);
}
