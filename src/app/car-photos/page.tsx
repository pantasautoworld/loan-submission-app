import { requireSalesStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { CarPhotosApp } from "@/components/carPhotos/CarPhotosApp";

export default async function CarPhotosPage() {
  const { profile } = await requireSalesStaff();

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Car Photos"]} />
      <CarPhotosApp />
    </>
  );
}
