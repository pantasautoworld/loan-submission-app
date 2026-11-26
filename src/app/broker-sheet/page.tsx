import { requireAdmin } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { loadBrokerSheetConfig } from "@/lib/brokerSheet";
import { fetchStockBoardVehicles } from "@/lib/stockBoard";
import type { BrokerRow } from "@/lib/brokerSheetShared";
import { BrokerSheetAdmin, type AdminCar } from "@/components/brokerSheet/BrokerSheetAdmin";

export default async function BrokerSheetPage() {
  const { profile, supabase } = await requireAdmin();

  const [{ data: brokers }, config, { data: values }, vehicles] = await Promise.all([
    supabase.from("brokers").select("*").order("created_at"),
    loadBrokerSheetConfig(supabase),
    supabase.from("broker_sheet_values").select("column_id, vehicle_id, value"),
    fetchStockBoardVehicles().catch(() => null),
  ]);

  const cars: AdminCar[] = (vehicles ?? [])
    .filter((v) => v && v.status !== "sold" && (v.vin || v.vehicle))
    .map((v) => ({ id: v.id, plate: v.vin ?? "", vehicle: v.vehicle ?? "", status: v.status }))
    .sort((a, b) => a.vehicle.localeCompare(b.vehicle));

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Broker Sheet"]} />
      <BrokerSheetAdmin
        brokers={(brokers ?? []) as BrokerRow[]}
        settings={config.settings}
        columns={config.columns}
        values={values ?? []}
        cars={cars}
        stockBoardError={vehicles === null}
      />
    </>
  );
}
