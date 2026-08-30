import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { fetchStockBoardVehicles } from "@/lib/stockBoard";
import { fetchCarDeposits, getReceiptSignedUrl } from "@/lib/depositPayments";
import { DepositPaymentApp } from "@/components/deposits/DepositPaymentApp";

export default async function DepositsPage() {
  const { profile, supabase } = await requireStaff();

  const [vehicles, deposits] = await Promise.all([
    fetchStockBoardVehicles(),
    fetchCarDeposits(supabase),
  ]);
  // Keep showing a car after its first payment moves it to "deposit_paid" - staff still
  // need to log further payments (e.g. balance) against it, not just the very first one.
  const approvedCars = vehicles.filter((v) => v.status === "reserved" || v.status === "deposit_paid");

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
        approvedCars={approvedCars}
        deposits={depositsWithReceiptUrls}
      />
    </>
  );
}
