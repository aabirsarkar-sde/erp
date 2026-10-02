import { requireUser } from "@/lib/core/auth";
import { createCustomer } from "@/app/actions/customers";
import { PageHeader } from "@/components/ui/ui";
import { CustomerFields } from "@/components/workspace/customer-fields";

export const metadata = { title: "New customer" };

export default async function NewCustomer() {
  await requireUser();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New customer" />
      <form action={createCustomer} className="card space-y-5 p-5">
        <CustomerFields />
        <div className="flex justify-end"><button className="btn-primary">Create customer</button></div>
      </form>
    </div>
  );
}
