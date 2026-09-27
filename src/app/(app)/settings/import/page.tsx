import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Importer } from "@/components/importer";
import { IconBack } from "@/components/icons";

export const metadata = { title: "Import from Odoo" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/settings" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><IconBack className="size-4" />Settings</Link>
      <PageHeader title="Import from Odoo" subtitle="Bring over contacts, opportunities and tickets from the old system. Do contacts first." />
      <Importer />
    </div>
  );
}
