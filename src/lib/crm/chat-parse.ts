// Pull contact details out of a pasted WhatsApp chat without AI — pure, unit tested.
export type ParsedChat = { name: string | null; company: string | null; phone: string | null; email: string | null; city: string | null; product: string | null; summary: string };

/** no-AI fallback: phone / email / "[time] Name:" sender from a WhatsApp export */
export function parseChatBasic(text: string): ParsedChat {
  const phone = text.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/)?.[0] ?? null;
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null;
  const sender = text.match(/^\[?[\d/.,:\s-]+(?:[ap]m)?\]?\s*-?\s*([^:\n]{2,40}):/im)?.[1]?.trim() ?? null;
  const firstLine = text.split("\n").map((l) => l.replace(/^\[?[\d/.,:\s-]+(?:[ap]m)?\]?\s*-?\s*[^:\n]{2,40}:\s*/i, "").trim()).find((l) => l.length > 3) ?? "";
  return { name: sender && !/^\+?\d/.test(sender) ? sender : null, company: null, phone: phone ?? (sender && /^\+?\d/.test(sender) ? sender : null), email, city: null, product: null, summary: firstLine.slice(0, 200) || "WhatsApp enquiry" };
}

