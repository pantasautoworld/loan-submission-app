import { requireSalesStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { fetchStockBoardVehicles } from "@/lib/stockBoard";
import { fetchQuickReplyJobs } from "@/lib/quickReplyJobs";
import { CarPhotosApp } from "@/components/carPhotos/CarPhotosApp";

export default async function CarPhotosPage() {
  const { profile, supabase } = await requireSalesStaff();

  const [vehicles, jobs] = await Promise.all([
    fetchStockBoardVehicles(),
    fetchQuickReplyJobs(supabase),
  ]);

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Car Photos"]} />
      <CarPhotosApp
        vehicles={vehicles.filter((v) => v.status !== "sold")}
        initialJobs={jobs}
      />
    </>
  );
}
