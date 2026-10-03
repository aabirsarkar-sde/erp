import { requireUser } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { aiEnabled } from "@/lib/ai/client";
import { PageHeader } from "@/components/ui/ui";
import { EnquiryPaste } from "@/components/crm/enquiry-paste";

export const metadata = { title: "New enquiry from WhatsApp" };

// Android "Share → Raybon Sales CRM" lands here (manifest share_target) with the shared text.
export default async function ShareTarget({ searchParams }: { searchParams: Promise<{ title?: string; text?: string; url?: string }> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const sp = await searchParams;
  const text = [sp.title, sp.text, sp.url].filter(Boolean).join("\n");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New enquiry" subtitle="Shared from WhatsApp — check it and add it to the Enquiries inbox" />
      <div className="card p-4"><EnquiryPaste initial={text} ai={aiEnabled()} /></div>
    </div>
  );
}
