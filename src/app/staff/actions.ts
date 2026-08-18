"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";

/** Same internal-email scheme as the login flow - see src/app/login/actions.ts. */
function emailForUsername(username: string): string {
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${normalized}@stockboard.pantas.internal`;
}

export async function createStaff(fields: {
  full_name: string;
  username: string;
  password: string;
  role: "admin" | "sales";
  avatar_path?: string;
}) {
  await requireAdmin();
  const admin = createAdminClient();

  const username = fields.username.trim();
  if (!fields.full_name.trim() || !username || !fields.password) {
    throw new Error("Full name, username, and password are required.");
  }
  if (fields.password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: emailForUsername(username),
    password: fields.password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(
      createErr?.message?.includes("already been registered")
        ? "That username is already taken."
        : createErr?.message ?? "Could not create the account."
    );
  }

  // A DB trigger (handle_new_user) already inserted a bare {id, full_name} row for
  // this new auth user - upsert (not insert) so this fills in the rest without
  // colliding with it on the id primary key.
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: fields.full_name.trim(),
    role: fields.role,
    username,
    avatar_path: fields.avatar_path ?? null,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error("Could not set up the staff profile.");
  }

  revalidatePath("/staff");
}

export async function resetStaffPassword(profileId: string, newPassword: string) {
  await requireAdmin();
  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(profileId, { password: newPassword });
  if (error) throw new Error("Could not reset the password.");
  revalidatePath("/staff");
}

export async function updateStaffPhoto(profileId: string, avatarPath: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: avatarPath })
    .eq("id", profileId);
  if (error) throw new Error("Could not update the photo.");
  revalidatePath("/staff");
  revalidatePath("/");
}

export async function updateStaffRole(profileId: string, role: "admin" | "sales") {
  const { profile, supabase } = await requireAdmin();
  if (profileId === profile.id && role !== "admin") {
    throw new Error("You can't remove your own admin access.");
  }
  const { error } = await supabase.from("profiles").update({ role }).eq("id", profileId);
  if (error) throw new Error("Could not update the role.");
  revalidatePath("/staff");
}

export async function deleteStaff(profileId: string) {
  const { profile } = await requireAdmin();
  if (profileId === profile.id) {
    throw new Error("You can't delete your own account.");
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error) throw new Error("Could not delete the account.");
  revalidatePath("/staff");
}
