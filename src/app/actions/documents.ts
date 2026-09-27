"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, documents, docFolders } from "@/db";
import { requireUser } from "@/lib/auth";
import { saveFile, MAX_UPLOAD } from "@/lib/storage";

export async function uploadDocuments(_p: { ok?: boolean; error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose at least one file." };
  const big = files.find((f) => f.size > MAX_UPLOAD);
  if (big) return { error: `${big.name} is larger than ${MAX_UPLOAD / 1024 / 1024} MB.` };
  const folderId = Number(fd.get("folderId")) || null;
  const customerId = Number(fd.get("customerId")) || null;
  const description = String(fd.get("description") ?? "").trim() || null;
  for (const f of files) {
    const storageKey = await saveFile(f);
    await db.insert(documents).values({ name: f.name, mime: f.type || "application/octet-stream", size: f.size, storageKey, folderId, customerId, description, uploadedById: me.id });
  }
  revalidatePath("/documents");
  if (customerId) revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function updateDocument(id: number, fd: FormData) {
  await requireUser();
  const name = String(fd.get("name") ?? "").trim();
  await db.update(documents).set({
    ...(name ? { name } : {}),
    folderId: Number(fd.get("folderId")) || null,
    customerId: Number(fd.get("customerId")) || null,
    description: String(fd.get("description") ?? "").trim() || null,
  }).where(eq(documents.id, id));
  revalidatePath("/documents");
}

export async function deleteDocument(id: number) {
  const me = await requireUser();
  const d = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!d || (d.uploadedById !== me.id && me.role !== "admin")) return;
  await db.delete(documents).where(eq(documents.id, id));
  revalidatePath("/documents");
}

export async function createFolder(fd: FormData) {
  await requireUser();
  const name = String(fd.get("name") ?? "").trim();
  if (name) await db.insert(docFolders).values({ name });
  revalidatePath("/documents");
}
