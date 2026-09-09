import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { fetchStockBoardVehicles } from "@/lib/stockBoard";
import { fetchVocDocuments } from "@/lib/vocDocuments";
import { VocApp } from "@/components/voc/VocApp";

export default async function VocPage() {
  const { profile, supabase } = await requireStaff();

  const [vehicles, documents] = await Promise.all([
    fetchStockBoardVehicles(),
    fetchVocDocuments(supabase),
  ]);

  return (
    <>
      <TopNav
        staffName={profile.full_name}
        role={profile.role}
        breadcrumb={["Vehicle Ownership Certificate (VOC)"]}
      />
      <VocApp vehicles={vehicles.filter((v) => v.status !== "sold")} documents={documents} />
    </>
  );
}
