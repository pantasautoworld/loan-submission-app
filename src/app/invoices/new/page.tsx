import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { NewInvoiceForm } from "@/components/invoices/NewInvoiceForm";

export default async function NewInvoicePage() {
  const { profile } = await requireStaff();

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Claim Invoices", "New Invoice"]} />
      <NewInvoiceForm staffName={profile.full_name} />
    </>
  );
}
