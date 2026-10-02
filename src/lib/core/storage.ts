import "server-only";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Files (photos, PDFs, signatures) live outside the database: in a *private* Vercel Blob store in
// production (BLOB_READ_WRITE_TOKEN or the store's BLOB_STORE_ID connection), otherwise ./uploads on disk.
// Nothing is reachable by URL alone: downloads go through our routes, which check the user's access.
const blobEnabled = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const LOCAL_DIR = path.join(process.cwd(), "uploads");
export const MAX_UPLOAD = 15 * 1024 * 1024;

export async function saveFile(file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${safe}`;
  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    const r = await put(`files/${key}`, file, { access: "private", contentType: file.type || undefined });
    return `blob:${r.pathname}`;
  }
  const full = path.join(LOCAL_DIR, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));
  return `local:${key}`;
}

export async function readFileByKey(key: string): Promise<Buffer | Response> {
  if (key.startsWith("local:")) {
    const rel = key.slice(6);
    const full = path.join(LOCAL_DIR, rel);
    if (!full.startsWith(LOCAL_DIR)) throw new Error("bad key");
    return readFile(full);
  }
  if (key.startsWith("blob:")) {
    const { get } = await import("@vercel/blob");
    const r = await get(key.slice(5), { access: "private" });
    if (!r || !r.stream) throw new Error("file not found");
    return new Response(r.stream);
  }
  return fetch(key); // files saved before the switch to private storage (public URLs)
}
