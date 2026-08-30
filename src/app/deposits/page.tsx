import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { fetchStockBoardVehicles } from "@/lib/stockBoard";
import { fetchCarDeposits, getReceiptSignedUrl } from "@/lib/depositPayments";
import { DepositPaymentApp } from "@/components/deposits/DepositPaymentApp";

export default async function DepositsPage() {
  const { profile, supabase } = await requireStaff();

  const [allVehicles, deposits] = await Promise.all([
    fetchStockBoardVehicles(),
    fetchCarDeposits(supabase),
  ]);
  // Sold cars are excluded entirely - not addable, not searchable for deposit purposes.
  // Everything else (approved/tracked/default-view logic) is computed client-side in
  // DepositPaymentApp, since it needs to react live to what staff type into search.
  const vehicles = allVehicles.filter((v) => v.status !== "sold");

  const depositsWithReceiptUrls = await Promise.all(
    deposits.map(async (d) => ({
      ...d,
      payments: await Promise.all(
        d.payments.map(async (p) => ({
          ...p,
          receiptUrl: p.receipt_path ? await getReceiptSignedUrl(supabase, p.receipt_path) : null,
        }))
      ),
    }))
  );

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Deposit Payment"]} />
      <DepositPaymentApp
        staffName={profile.full_name}
        role={profile.role}
        vehicles={vehicles}
        deposits={depositsWithReceiptUrls}
      />
    </>
  );
}
