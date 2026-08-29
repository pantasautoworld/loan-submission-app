"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { notifyTelegram } from "@/lib/telegram";

/**
 * Admin-only: records that this submission was reviewed and actually sent to
 * the credit company. This is what assigns the ticket number (a DB trigger
 * fires the moment submitted_at is first set - see the
 * move_ticket_no_to_submitted_action migration) and sends the one-time
 * Telegram notification, so regenerating the packet afterwards never
 * re-triggers either.
 */
export async function markSubmitted(submissionId: string) {
  const { supabase } = await requireAdmin();

  // .is("submitted_at", null) guards against a double-click (or a race) firing
  // a second notification - if the row was already submitted, this matches
  // zero rows and `updated` comes back null.
  const { data: updated, error } = await supabase
    .from("submissions")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", submissionId)
    .is("submitted_at", null)
    .select("no_plate, model, ticket_no")
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (updated) {
    const { data: hirer } = await supabase
      .from("persons")
      .select("name")
      .eq("submission_id", submissionId)
      .eq("role", "hirer")
      .maybeSingle();

    void notifyTelegram(
      `✅ <b>Submission submitted to credit company</b>\n` +
        `Ticket: ${updated.ticket_no ?? "-"}\n` +
        `Hirer: ${hirer?.name || "-"}\n` +
        `Vehicle: ${updated.no_plate || "-"} ${updated.model || ""}`.trim()
    );
  }

  revalidatePath("/submissions");
  revalidatePath("/");
}

/**
 * Admin-only: reverses an accidental "Submitted" click. Clears submitted_at;
 * the release_submission_ticket_no trigger branch clears ticket_no and, if
 * no newer submission has taken a later number since, decrements the
 * year-month counter so the number is reused rather than wasted.
 */
export async function undoSubmitted(submissionId: string) {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("submissions")
    .update({ submitted_at: null })
    .eq("id", submissionId)
    .not("submitted_at", "is", null);
  if (error) throw new Error(error.message);

  revalidatePath("/submissions");
  revalidatePath("/");
}

export async function deleteSubmission(submissionId: string) {
  const supabase = await createClient();

  // best-effort: clean up every file uploaded under this submission (IC/license
  // scans, signatures, generated PDFs) - not covered by the DB's cascade delete.
  const { data: files } = await supabase.storage.from("submission-files").list(submissionId);
  if (files && files.length > 0) {
    const paths = files.map((f) => `${submissionId}/${f.name}`);
    await supabase.storage.from("submission-files").remove(paths);
  }

  const { error } = await supabase.from("submissions").delete().eq("id", submissionId);
  if (error) throw new Error(error.message);

  revalidatePath("/submissions");
}
