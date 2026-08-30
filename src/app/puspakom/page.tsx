import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { fetchStockBoardVehicles } from "@/lib/stockBoard";
import { fetchPuspakomBookings } from "@/lib/puspakomBookings";
import { PuspakomApp } from "@/components/puspakom/PuspakomApp";

export default async function PuspakomPage() {
  const { profile, supabase } = await requireStaff();

  const [allVehicles, bookings] = await Promise.all([
    fetchStockBoardVehicles(),
    fetchPuspakomBookings(supabase),
  ]);
  const vehicles = allVehicles.filter((v) => v.status !== "sold");

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Puspakom Booking"]} />
      <PuspakomApp role={profile.role} vehicles={vehicles} bookings={bookings} />
    </>
  );
}
