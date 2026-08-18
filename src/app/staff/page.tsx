import { requireAdmin } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { StaffManager } from "@/components/staff/StaffManager";

export default async function StaffPage() {
  const { supabase, profile } = await requireAdmin();

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, username, role")
    .order("full_name");

  return (
    <div className="flex flex-1 flex-col">
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Manage Staff"]} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-6">
        <h1 className="font-display text-xl text-fg">Manage Staff</h1>
        <StaffManager staff={staff ?? []} currentProfileId={profile.id} />
      </main>
    </div>
  );
}
