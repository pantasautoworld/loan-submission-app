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

export async function uploadVocFile(plate: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "bin";
  const normalized = plate.trim().toUpperCase().replace(/\s+/g, "");
  const path = `voc/${normalized}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("submission-files")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);
  return path;
}

export async function uploadSigningPhotoFile(bookingId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `signing/${bookingId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("submission-files")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);
  return path;
}

/** Photo/video evidence on a car's condition checklist item - lives under recon/{vehicleId}/. */
export async function uploadReconMediaFile(vehicleId: string, conditionType: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || (file.type.startsWith("video/") ? "mp4" : "jpg");
  const slug = conditionType.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const path = `recon/${vehicleId}/${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;

  const { error } = await supabase.storage
    .from("submission-files")
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) throw new Error(error.message);
  return path;
}

/** Signed URLs for several files at once - keyed by path so callers can look each one up. */
export async function getSignedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const supabase = createClient();
  const { data, error } = await supabase.storage.from("submission-files").createSignedUrls(paths, 60 * 60);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const row of data) {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  }
  return map;
}

export function getSignedUrl(path: string) {
  const supabase = createClient();
  return supabase.storage.from("submission-files").createSignedUrl(path, 60 * 60);
}

/** Staff avatar photos live in a separate public bucket - no signed URL needed to display them. */
export async function uploadStaffPhoto(key: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${key}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("staff-photos")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);
  return path;
}
