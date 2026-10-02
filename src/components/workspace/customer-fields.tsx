import { Field } from "@/components/ui/ui";
type C = { name?: string; city?: string | null; address?: string | null; email?: string | null; phone?: string | null; gstin?: string | null; notes?: string | null };
export function CustomerFields({ c = {} }: { c?: C }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Company name *" className="sm:col-span-2"><input name="name" required defaultValue={c.name} className="input" /></Field>
      <Field label="City"><input name="city" defaultValue={c.city ?? ""} className="input" /></Field>
      <Field label="GSTIN"><input name="gstin" defaultValue={c.gstin ?? ""} className="input" /></Field>
      <Field label="Phone"><input name="phone" type="tel" defaultValue={c.phone ?? ""} className="input" /></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={c.email ?? ""} className="input" /></Field>
      <Field label="Address" className="sm:col-span-2"><textarea name="address" rows={2} defaultValue={c.address ?? ""} className="input" /></Field>
      <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={2} defaultValue={c.notes ?? ""} className="input" placeholder="Plant capacity, technology installed, AMC status…" /></Field>
    </div>
  );
}
