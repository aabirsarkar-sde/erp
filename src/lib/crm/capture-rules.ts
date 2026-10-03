// Address helpers for email capture — pure, unit tested.
export const addr = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
export const domainOf = (e: string) => e.split("@")[1] ?? "";

/** "[OPP-123]" in the subject or "sales+123@" in the address sends the mail to that opportunity */
export function forcedLead(subject: string, to: string) {
  const m = subject.match(/\[OPP-?(\d{1,7})\]/i) ?? to.match(/\+(\d{1,7})@/);
  return m ? Number(m[1]) : null;
}
