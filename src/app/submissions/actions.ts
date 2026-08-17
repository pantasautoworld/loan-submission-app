"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
