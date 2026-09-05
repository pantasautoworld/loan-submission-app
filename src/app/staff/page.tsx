import { requireAdmin } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { StaffManager } from "@/components/staff/StaffManager";

export default async function StaffPage() {
  const { supabase, profile } = await requireAdmin();

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, username, role, avatar_path, is_active")
    .order("full_name");

  const staffWithPhotos = (staff ?? []).map((s) => ({
    ...s,
    photoUrl: s.avatar_path
      ? supabase.storage.from("staff-photos").getPublicUrl(s.avatar_path).data.publicUrl
      : null,
  }));

  return (
    <div className="flex flex-1 flex-col">
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Manage Staff"]} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-6">
        <h1 className="font-display text-xl text-fg">Manage Staff</h1>
        <StaffManager staff={staffWithPhotos} currentProfileId={profile.id} />
      </main>
    </div>
  );
}
