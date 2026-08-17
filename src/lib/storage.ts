import { createClient } from "@/lib/supabase/client";

export async function uploadSubmissionFile(
  submissionId: string,
  key: string,
  file: File
): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "bin";
  const path = `${submissionId}/${key}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("submission-files")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);
  return path;
}

export function getSignedUrl(path: string) {
  const supabase = createClient();
  return supabase.storage.from("submission-files").createSignedUrl(path, 60 * 60);
}
