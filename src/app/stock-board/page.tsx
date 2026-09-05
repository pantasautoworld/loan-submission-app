import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { fetchApprovedDepositTotals } from "@/lib/depositPayments";
import { fetchCompletedPuspakomVehicleIds } from "@/lib/puspakomBookings";
import { StockBoardApp } from "@/components/stockBoard/StockBoardApp";

export default async function StockBoardPage() {
  const { profile, supabase } = await requireStaff();

  const [{ data: staff }, depositTotals, puspakomCompletedIds] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("is_active", true).order("full_name"),
    fetchApprovedDepositTotals(supabase),
    fetchCompletedPuspakomVehicleIds(supabase),
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
        puspakomCompletedIds={puspakomCompletedIds}
      />
    </>
  );
}
