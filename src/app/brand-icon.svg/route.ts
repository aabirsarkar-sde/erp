import { EDITION } from "@/lib/core/edition";

// app icon: water drop for the helpdesk / combined app, a rising chart in a drop for the CRM
export function GET() {
  const svg = EDITION === "crm"
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2752c4"/><path d="M14 44l11-11 8 7 17-18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 22h10v10" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0d857e"/><path d="M32 12c-8 11-14 18-14 26a14 14 0 0 0 28 0c0-8-6-15-14-26z" fill="#fff"/></svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
