import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role")
    .eq("id", user.id)
    .single();

  return {
    supabase,
    user,
    profile: profile ?? { id: user.id, full_name: user.email ?? "Staff", phone: "", role: "sales" },
  };
}

/** Same as requireStaff, but redirects non-admins away - use for admin-only pages/actions. */
export async function requireAdmin() {
  const result = await requireStaff();
  if (result.profile.role !== "admin") redirect("/submissions");
  return result;
}
