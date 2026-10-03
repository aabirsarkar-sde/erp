// Click-to-chat / dial links — safe to use in client components.
/** WhatsApp click-to-chat link (Indian numbers without a country code get +91) */
export function waLink(phone: string | null | undefined, text: string) {
  let p = (phone ?? "").replace(/[^\d]/g, "");
  if (p.length === 10) p = `91${p}`;
  else if (p.length === 11 && p.startsWith("0")) p = `91${p.slice(1)}`;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
export const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
