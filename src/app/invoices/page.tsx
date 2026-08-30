import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { fetchClaimInvoices } from "@/lib/claimInvoices";
import { InvoiceApp } from "@/components/invoices/InvoiceApp";

export default async function InvoicesPage() {
  const { profile, supabase } = await requireStaff();
  const invoices = await fetchClaimInvoices(supabase);

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Claim Invoices"]} />
      <InvoiceApp role={profile.role} invoices={invoices} />
    </>
  );
}
