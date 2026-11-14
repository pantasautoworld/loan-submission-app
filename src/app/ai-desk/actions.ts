"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

/** Admin-only. Marks an AI draft approved / edited / rejected. Nothing is sent to the customer yet. */
export async function reviewDraft(
  draftId: string,
  decision: "approved" | "edited" | "rejected",
  finalText?: string
) {
  const { supabase, user } = await requireAdmin();

  const { error } = await supabase
    .from("ai_drafts")
    .update({
      status: decision,
      final_text: decision === "rejected" ? null : (finalText ?? null),
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("status", "pending"); // a draft can only be reviewed once
  if (error) throw new Error(error.message);

  revalidatePath("/ai-desk");
}

/** Admin-only kill switch: when off, no new drafts are created and nothing auto-sends. */
export async function setAiEnabled(enabled: boolean) {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("ai_settings")
    .update({ value: enabled ? "true" : "false" })
    .eq("key", "ai_enabled");
  if (error) throw new Error(error.message);

  revalidatePath("/ai-desk");
}
