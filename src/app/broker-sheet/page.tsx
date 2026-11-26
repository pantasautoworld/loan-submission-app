import { requireAdmin } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { loadBrokerSheetConfig, loadLuluchatPdfLinks } from "@/lib/brokerSheet";
import { fetchStockBoardVehicles } from "@/lib/stockBoard";
import { plateKey, type BrokerRow } from "@/lib/brokerSheetShared";
import { BrokerSheetAdmin, type AdminCar } from "@/components/brokerSheet/BrokerSheetAdmin";

export default async function BrokerSheetPage() {
  const { profile, supabase } = await requireAdmin();

  const [{ data: brokers }, config, { data: values }, vehicles, pdfLinks] = await Promise.all([
    supabase.from("brokers").select("*").order("created_at"),
    loadBrokerSheetConfig(supabase),
    supabase.from("broker_sheet_values").select("column_id, vehicle_id, value"),
    fetchStockBoardVehicles().catch(() => null),
    loadLuluchatPdfLinks(supabase).catch(() => new Map<string, string>()),
  ]);

  const cars: AdminCar[] = (vehicles ?? [])
    .filter((v) => v && v.status !== "sold" && (v.vin || v.vehicle))
    .map((v) => ({
      id: v.id,
      plate: v.vin ?? "",
      vehicle: v.vehicle ?? "",
      status: v.status,
      loan: v.price ?? "",
      deposit: v.deposit ?? "",
      pdf: pdfLinks.get(plateKey(v.vin ?? "")) ?? "",
    }))
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
