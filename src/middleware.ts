import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { editionHasCrm, editionHasHd } from "@/lib/edition";

// routes that open without signing in
const PUBLIC = /^\/(login|complaint|feedback|api\/cron|api\/inbound-email|api\/calendar|manifest\.webmanifest|icon\.svg|brand-icon\.svg|favicon\.ico)(\/|$|\?)/;
// routes that belong to one product only — the other deployment answers 404
const HD_ONLY = /^\/(tickets|helpdesk|plants|reports|complaint|feedback|api\/cron\/escalate|api\/inbound-email|api\/tickets|api\/export\/(tickets|helpdesk)|print\/(tickets|helpdesk))(\/|$)/;
const CRM_ONLY = /^\/(crm|activities|quotations|sales-reports|calendar\/activity|api\/export\/sales|print\/(sales|quotations))(\/|$)/;

export async function middleware(req: NextRequest) {
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
