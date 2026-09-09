"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { normalizePlate } from "@/lib/vocDocuments";

export async function saveVocDocument(formData: FormData) {
  const { profile, supabase } = await requireStaff();
  const noPlate = normalizePlate(String(formData.get("plate") ?? ""));
  const filePath = String(formData.get("filePath") ?? "").trim();
  if (!noPlate) throw new Error("Enter a plate number.");
  if (!filePath) throw new Error("Upload a file first.");

  const { data: existing } = await supabase
    .from("voc_documents")
    .select("file_path")
    .eq("no_plate", noPlate)
    .maybeSingle();

  const { error } = await supabase.from("voc_documents").upsert(
    {
      no_plate: noPlate,
      file_path: filePath,
      uploaded_by: profile.id,
      uploaded_by_name: profile.full_name || "Staff",
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: "no_plate" }
  );
  if (error) throw new Error(error.message);

  if (existing?.file_path && existing.file_path !== filePath) {
    // best-effort - replacing a VOC shouldn't fail just because the old file's cleanup did
    await supabase.storage.from("submission-files").remove([existing.file_path]);
  }
  revalidatePath("/voc");
}

export async function deleteVocDocument(id: string, filePath: string) {
  const { supabase } = await requireStaff();
  const { error } = await supabase.from("voc_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.storage.from("submission-files").remove([filePath]);
  revalidatePath("/voc");
}
