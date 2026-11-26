import { requireSalesStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { StockBoardApp } from "@/components/stockBoard/StockBoardApp";

/**
 * Stock Board (Cash) - Sunshine Autoworld's stock. A separate board with its own car list, photos
 * and activity log (Firebase "stockboard_cash"); nothing here touches the main Stock Board, and the
 * loan wizard, deposits, Puspakom, recon and the Broker Sheet don't see these cars.
 */
export default async function CashStockBoardPage() {
  const { profile, supabase } = await requireSalesStaff();
  const { data: staff } = await supabase.from("profiles").select("full_name").eq("is_active", true).order("full_name");
  const staffNames = (staff ?? []).map((s) => s.full_name).filter((name): name is string => !!name);

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Stock Board (Cash)"]} />
      <StockBoardApp
        board="cash"
        role={profile.role}
        staffNames={staffNames}
        depositTotals={{}}
        forfeitedTotals={{}}
        puspakomStatusByVehicle={{}}
        locationByVehicle={{}}
        pendingTaskCounts={{}}
      />
    </>
  );
}
