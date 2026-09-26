import { requireSalesStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { fetchStockBoardVehicles } from "@/lib/stockBoard";
import { fetchSigningBookings } from "@/lib/signingBookings";
import { fetchRunnerProfiles } from "@/lib/recon";
import { SigningApp } from "@/components/signing/SigningApp";

export default async function SigningPage() {
  const { profile, supabase } = await requireSalesStaff();

  const [allVehicles, bookings, runners] = await Promise.all([
    fetchStockBoardVehicles(),
    fetchSigningBookings(supabase),
    fetchRunnerProfiles(supabase),
  ]);
  const vehicles = allVehicles.filter((v) => v.status !== "sold");

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Signing Booking"]} />
      <SigningApp vehicles={vehicles} bookings={bookings} runners={runners} />
    </>
  );
}
