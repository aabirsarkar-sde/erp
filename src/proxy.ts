import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/core/session";
import { editionHasCrm, editionHasHd } from "@/lib/core/edition";

// routes that open without signing in
const PUBLIC = /^\/(login|complaint|feedback|enquiry|s|api\/cron|api\/inbound-email|api\/enquiry|api\/graph|api\/calendar|manifest\.webmanifest|brand-icon\.svg|favicon\.ico)(\/|$|\?)/;
// routes that belong to one product only — the other deployment answers 404
const HD_ONLY = /^\/(tickets|helpdesk|plants|reports|complaint|feedback|api\/cron\/escalate|api\/tickets|api\/export\/(tickets|helpdesk)|print\/(tickets|helpdesk))(\/|$)/;
const CRM_ONLY = /^\/(crm|activities|quotations|sales-reports|daily-report|kpi|dashboards|enquiries|enquiry|templates|playbooks|forecast|calendar\/activity|api\/cron\/(daily-report|nudges)|api\/enquiry|api\/export\/sales|print\/(sales|quotations))(\/|$)/;

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if ((!editionHasHd && HD_ONLY.test(path)) || (!editionHasCrm && CRM_ONLY.test(path))) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (PUBLIC.test(path)) return NextResponse.next();
  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
