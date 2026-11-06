"use server";

import { requireSalesStaff } from "@/lib/auth";
import { fetchQuickReplyJobs, type QuickReplyJobRow } from "@/lib/quickReplyJobs";

export async function queueQuickReply(input: {
  plate: string;
  shortcut: string;
  message: string;
  filePath: string;
}): Promise<void> {
  const { profile, supabase } = await requireSalesStaff();
  const shortcut = input.shortcut.trim();
  const message = input.message.trim();
  if (!shortcut) throw new Error("Enter the shortcut name.");
  if (!message) throw new Error("Enter the message.");
  if (!input.filePath.startsWith("quickreply/")) throw new Error("Upload the PDF first.");

  const { error } = await supabase.from("luluchat_quick_reply_jobs").insert({
    plate: input.plate.trim().toUpperCase(),
    shortcut,
    message,
    file_path: input.filePath,
    created_by_name: profile.full_name || "Staff",
  });
  if (error) throw new Error(error.message);
}

export async function listQuickReplyJobs(): Promise<QuickReplyJobRow[]> {
  const { supabase } = await requireSalesStaff();
  return fetchQuickReplyJobs(supabase);
}
