import { requireUser } from "@/lib/core/auth";
import { lookups } from "@/lib/core/lookups";
import { createQuotation } from "@/app/actions/quotations";
import { PageHeader, Field } from "@/components/ui/ui";

export const metadata = { title: "New quotation" };

export default async function NewQuotation({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  await requireUser();
  const [{ customer }, lk] = await Promise.all([searchParams, lookups()]);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="New quotation" subtitle="Tip: create quotations from an opportunity so they're linked to the deal." />
      <form action={createQuotation} className="card space-y-4 p-5">
        <Field label="Customer">
          <select name="customerId" defaultValue={customer ?? ""} className="input" required>
            <option value="">— Select customer —</option>
            {lk.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <button className="btn-primary w-full">Create draft</button>
      </form>
    </div>
  );
}
