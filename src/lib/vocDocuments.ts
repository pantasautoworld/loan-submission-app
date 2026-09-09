import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s+/g, "");
}

export interface VocDocumentRow {
  id: string;
  no_plate: string;
  file_path: string;
  uploaded_by: string | null;
  uploaded_by_name: string;
  uploaded_at: string;
}

export async function fetchVocDocuments(supabase: SupabaseClient): Promise<VocDocumentRow[]> {
  const { data, error } = await supabase
    .from("voc_documents")
    .select("*")
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as VocDocumentRow[];
}
