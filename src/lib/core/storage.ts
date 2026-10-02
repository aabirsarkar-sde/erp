import "server-only";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production), otherwise ./uploads on disk.
const LOCAL_DIR = path.join(process.cwd(), "uploads");
export const MAX_UPLOAD = 15 * 1024 * 1024;

export async function saveFile(file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${safe}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const r = await put(`tickets/${key}`, file, { access: "public", contentType: file.type || undefined });
    return r.url;
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
  return fetch(key);
}
