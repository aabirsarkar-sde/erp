import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { appUrl } from "@/lib/core/mail";

// Signed, expiring download links for sales collateral, so a case study can go out on WhatsApp
// without making the file store public. Only documents marked as collateral can be shared.
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me-dev-secret-change-me");

export async function shareLink(docId: number, days = 30) {
  const t = await new SignJWT({ d: docId, t: "share" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${days}d`).sign(secret());
  return `${appUrl()}/s/${t}`;
}
export async function readShare(token: string): Promise<number | null> {
  try { const { payload } = await jwtVerify(token, secret()); return payload.t === "share" ? Number(payload.d) : null; } catch { return null; }
}
