"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStockBoardLogin, type StockBoardStaffAccount } from "@/lib/stockBoardAuth";

/** Stable internal email Supabase Auth needs per Stock Board username - never shown to staff. */
function emailForUsername(username: string): string {
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${normalized}@stockboard.pantas.internal`;
}

export async function login(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    redirect(`/login?error=${encodeURIComponent("Enter your username and password.")}`);
  }

  let account: StockBoardStaffAccount | null;
  try {
    account = await verifyStockBoardLogin(username, password);
  } catch {
    redirect(
      `/login?error=${encodeURIComponent("Could not reach Stock Board to sign in. Try again.")}`
    );
  }

  if (!account) {
    redirect(`/login?error=${encodeURIComponent("Incorrect username or password.")}`);
  }

  const email = emailForUsername(account.username);
  const role = account.role === "admin" ? "admin" : "sales";
  const admin = createAdminClient();
  const supabase = await createClient();

  // Uses the admin client, not the not-yet-authenticated `supabase` client - profiles'
  // RLS only allows reads from the `authenticated` role, and at this point in the flow
  // (before signInWithPassword below) we're still anon.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .ilike("stockboard_username", account.username)
    .maybeSingle();

  if (existingProfile) {
    const { error: updateErr } = await admin.auth.admin.updateUserById(existingProfile.id, {
      password,
    });
    if (updateErr) {
      redirect(`/login?error=${encodeURIComponent("Could not sign in. Try again.")}`);
    }
    await admin
      .from("profiles")
      .update({ full_name: account.name, role })
      .eq("id", existingProfile.id);
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      redirect(`/login?error=${encodeURIComponent("Could not create your account. Try again.")}`);
    }
    // A DB trigger (handle_new_user) already inserted a bare {id, full_name} row for
    // this new auth user - upsert (not insert) so this fills in the rest without
    // colliding with it on the id primary key.
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: created.user.id,
      full_name: account.name,
      role,
      stockboard_username: account.username,
    });
    if (profileErr) {
      redirect(`/login?error=${encodeURIComponent("Could not set up your account. Try again.")}`);
    }
  }

  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    redirect(`/login?error=${encodeURIComponent(signInErr.message)}`);
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
