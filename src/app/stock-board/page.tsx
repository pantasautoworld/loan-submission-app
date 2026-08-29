import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { StockBoardApp } from "@/components/stockBoard/StockBoardApp";

export default async function StockBoardPage() {
  const { profile, supabase } = await requireStaff();

  const { data: staff } = await supabase
    .from("profiles")
    .select("full_name")
    .order("full_name");
  const staffNames = (staff ?? []).map((s) => s.full_name).filter((name): name is string => !!name);

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Stock Board"]} />
      <StockBoardApp staffName={profile.full_name} role={profile.role} staffNames={staffNames} />
    </>
  );
}
