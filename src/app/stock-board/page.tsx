import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { fetchApprovedDepositTotals } from "@/lib/depositPayments";
import { fetchLatestPuspakomStatusByVehicle } from "@/lib/puspakomBookings";
import { StockBoardApp } from "@/components/stockBoard/StockBoardApp";

export default async function StockBoardPage() {
  const { profile, supabase } = await requireStaff();

  const [{ data: staff }, depositTotals, puspakomStatusByVehicle] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("is_active", true).order("full_name"),
    fetchApprovedDepositTotals(supabase),
    fetchLatestPuspakomStatusByVehicle(supabase),
  ]);
  const staffNames = (staff ?? []).map((s) => s.full_name).filter((name): name is string => !!name);

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Stock Board"]} />
      <StockBoardApp
        staffName={profile.full_name}
        role={profile.role}
        staffNames={staffNames}
        depositTotals={depositTotals}
        puspakomStatusByVehicle={puspakomStatusByVehicle}
      />
    </>
  );
}
