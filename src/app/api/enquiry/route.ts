import { createEnquiry } from "@/lib/crm/enquiries";

// For the company website's own contact form: POST JSON or form fields
//   name, company, email, phone, city, product, message   (+ an empty "website" field as a bot trap)
// Optional header x-enquiry-key = ENQUIRY_API_KEY if you want to lock it to your site's server.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-enquiry-key" };
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

const hits = new Map<string, number[]>();
export async function POST(req: Request) {
  const key = process.env.ENQUIRY_API_KEY;
  if (key && req.headers.get("x-enquiry-key") !== key) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  const now = Date.now(), arr = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (arr.length >= 20) return Response.json({ error: "too many requests" }, { status: 429, headers: CORS });
  arr.push(now); hits.set(ip, arr);
  let d: Record<string, string> = {};
  try {
    d = (req.headers.get("content-type") ?? "").includes("json") ? await req.json() : Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]));
  } catch { return Response.json({ error: "invalid body" }, { status: 400, headers: CORS }); }
  if (d.website) return Response.json({ ok: true }, { headers: CORS });
  if (!d.name || (!d.email && !d.phone)) return Response.json({ error: "name and email or phone are required" }, { status: 400, headers: CORS });
  const r = await createEnquiry({ source: "website", name: d.name, company: d.company, email: d.email, phone: d.phone, city: d.city, product: d.product, message: d.message, subject: d.subject ?? (d.product ? `Enquiry: ${d.product}` : "Website enquiry") });
  return Response.json({ ok: true, id: r.id }, { headers: CORS });
}
