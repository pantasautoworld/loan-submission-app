import { requireSalesStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { fetchApprovedDepositTotals } from "@/lib/depositPayments";
import { fetchLatestPuspakomStatusByVehicle } from "@/lib/puspakomBookings";
import { fetchCarLocations, fetchPendingTaskCountsByVehicle } from "@/lib/recon";
import { StockBoardApp } from "@/components/stockBoard/StockBoardApp";

export default async function StockBoardPage() {
  const { profile, supabase } = await requireSalesStaff();

  const [{ data: staff }, depositTotals, puspakomStatusByVehicle, carLocations, pendingTaskCounts] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("is_active", true).order("full_name"),
      fetchApprovedDepositTotals(supabase),
      fetchLatestPuspakomStatusByVehicle(supabase),
      fetchCarLocations(supabase),
      fetchPendingTaskCountsByVehicle(supabase),
    ]);
  const staffNames = (staff ?? []).map((s) => s.full_name).filter((name): name is string => !!name);
  const locationByVehicle = Object.fromEntries(carLocations.map((l) => [l.stock_board_vehicle_id, l.location]));

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Stock Board"]} />
      <StockBoardApp
        staffName={profile.full_name}
        role={profile.role}
        staffNames={staffNames}
        depositTotals={depositTotals}
        puspakomStatusByVehicle={puspakomStatusByVehicle}
        locationByVehicle={locationByVehicle}
        pendingTaskCounts={pendingTaskCounts}
      />
    </>
  );
}
