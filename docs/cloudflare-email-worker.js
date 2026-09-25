// Free email-to-ticket using Cloudflare Email Routing + an Email Worker.
// 1. Add your domain to Cloudflare (free) and enable Email Routing.
// 2. Create a Worker with this code; `npm i postal-mime` in the worker project.
// 3. Set worker secrets: APP_URL (e.g. https://raybon-erp.vercel.app) and INBOUND_EMAIL_SECRET (same as the app).
// 4. In Email Routing, route support@yourdomain.com → "Send to Worker" → this worker.
import PostalMime from "postal-mime";

const b64 = (buf) => {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

export default {
  async email(message, env) {
    const parsed = await PostalMime.parse(message.raw);
    const from = parsed.from?.name ? `${parsed.from.name} <${parsed.from.address}>` : parsed.from?.address || message.from;
    const res = await fetch(`${env.APP_URL}/api/inbound-email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-inbound-secret": env.INBOUND_EMAIL_SECRET },
      body: JSON.stringify({
        from,
        subject: parsed.subject,
        text: parsed.text || "",
        attachments: (parsed.attachments || []).map((a) => ({ filename: a.filename, contentType: a.mimeType, content: b64(a.content) })),
      }),
    });
    if (!res.ok) message.setReject(`Ticket system error ${res.status}`);
  },
};
