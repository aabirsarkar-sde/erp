import { PublicShell } from "@/components/ui/public-shell";
import { EnquiryForm } from "@/components/crm/enquiry-form";

export const metadata = { title: "Contact sales" };

// Public enquiry form. Link to it from the website, or embed it:
//   <iframe src="https://<crm>/enquiry?embed=1" style="width:100%;height:720px;border:0"></iframe>
export default async function PublicEnquiry({ searchParams }: { searchParams: Promise<{ embed?: string; product?: string }> }) {
  const sp = await searchParams;
  if (sp.embed) return <main className="bg-transparent p-2"><EnquiryForm product={sp.product} /></main>;
  return <PublicShell title="Talk to our sales team"><EnquiryForm product={sp.product} /></PublicShell>;
}
