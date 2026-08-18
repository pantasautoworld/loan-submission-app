"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Stable internal email Supabase Auth needs per username - never shown to staff.
 * Keeps the original domain suffix (a holdover from the removed Stock Board login
 * integration) so existing accounts' auth.users.email keeps matching - it's purely
 * an internal implementation detail, never surfaced anywhere in the UI.
 */
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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: emailForUsername(username),
    password,
  });
  if (error) {
    console.error("[login] signInWithPassword failed:", error);
    redirect(`/login?error=${encodeURIComponent("Incorrect username or password.")}`);
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
