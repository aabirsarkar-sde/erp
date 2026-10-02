import { PublicShell } from "@/components/ui/public-shell";
import { PublicComplaintForm } from "@/components/helpdesk/public-complaint-form";

export const metadata = { title: "Register a complaint" };

export default async function PublicComplaint({ searchParams }: { searchParams: Promise<{ plant?: string }> }) {
  const { plant } = await searchParams;
  return (
    <PublicShell title="Register a service complaint">
      <PublicComplaintForm plantNo={plant} />
      <p className="mt-4 text-center text-xs text-slate-500">Already registered? <a href="/complaint/status" className="text-brand-700 underline">Check your complaint status</a></p>
    </PublicShell>
  );
}
