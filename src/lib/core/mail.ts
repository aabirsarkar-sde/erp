import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// Any free SMTP works: Gmail (app password), Brevo (300/day free), Zoho, etc.
// Without SMTP_HOST, emails are printed to the server console instead of sent.
let transport: Transporter | null = null;
function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

export type Mail = { to: string; subject: string; text: string; replyTo?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] };

export async function sendMail(m: Mail): Promise<{ sent: boolean; error?: string }> {
  const t = getTransport();
  const from = process.env.MAIL_FROM || "Raybon Support <support@example.com>";
  const replyTo = m.replyTo || process.env.SUPPORT_EMAIL || undefined;
  if (!t) {
    console.log(`\n📧 [email not configured — would send]\n  to: ${m.to}\n  subject: ${m.subject}\n  ${m.text.replace(/\n/g, "\n  ")}\n`);
    return { sent: false, error: "SMTP not configured" };
  }
  try {
    await t.sendMail({ from, replyTo, to: m.to, subject: m.subject, text: m.text, attachments: m.attachments });
    return { sent: true };
  } catch (e) {
    console.error("sendMail failed", e);
    return { sent: false, error: (e as Error).message };
  }
}

export const mailEnabled = () => !!process.env.SMTP_HOST;
