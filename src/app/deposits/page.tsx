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
  // Sold cars are excluded - the plate lookup for "+ Add deposit" also refuses them
  // (see logDepositPaymentByPlate), this just keeps a sold car's card from lingering
  // in the display list here too.
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
