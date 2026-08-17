"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { combineAttachments } from "@/lib/pdf/mergeDocuments";
import type { PersonRole, SignerRole, DocType, PersonFields } from "@/lib/types";

export async function savePerson(submissionId: string, role: PersonRole, fields: PersonFields) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("persons")
    .upsert(
      { submission_id: submissionId, role, ...fields },
      { onConflict: "submission_id,role" }
    );
  if (error) throw new Error(error.message);
  revalidatePath(`/submissions/${submissionId}/edit`);
}

export async function removePerson(submissionId: string, role: PersonRole) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("persons")
    .delete()
    .eq("submission_id", submissionId)
    .eq("role", role);
  if (error) throw new Error(error.message);
  revalidatePath(`/submissions/${submissionId}/edit`);
}

export async function saveVehicle(
  submissionId: string,
  fields: {
    stock_board_vehicle_id: string | null;
    no_plate: string;
    model: string;
    year_made: number | null;
    finance_loan: number | null;
    tenure_year: number | null;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase.from("submissions").update(fields).eq("id", submissionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/submissions/${submissionId}/edit`);
}

/** Partial update - only touches the columns provided, unlike saveVehicle's full replace. */
export async function updateVehiclePartial(
  submissionId: string,
  fields: Partial<{
    stock_board_vehicle_id: string | null;
    no_plate: string;
    model: string;
    year_made: number | null;
    finance_loan: number | null;
    tenure_year: number | null;
  }>
) {
  const supabase = await createClient();
  const { error } = await supabase.from("submissions").update(fields).eq("id", submissionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/submissions/${submissionId}/edit`);
}

export async function recordDocument(submissionId: string, docType: DocType, filePath: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .upsert(
      { submission_id: submissionId, doc_type: docType, file_path: filePath },
      { onConflict: "submission_id,doc_type" }
    );
  if (error) throw new Error(error.message);
  revalidatePath(`/submissions/${submissionId}/edit`);
}

/**
 * Records one or more freshly-uploaded files under a single doc_type slot. A single
 * file behaves like recordDocument. Multiple files (e.g. 3 separate payslip photos,
 * one per month) are merged into one combined PDF first, since every doc_type still
 * maps to exactly one document row/file elsewhere in the app (generation, deletion).
 */
export async function recordCombinedDocument(
  submissionId: string,
  docType: DocType,
  filePaths: string[]
) {
  const supabase = await createClient();

  if (filePaths.length <= 1) {
    const filePath = filePaths[0];
    if (!filePath) return;
    const { error } = await supabase
      .from("documents")
      .upsert(
        { submission_id: submissionId, doc_type: docType, file_path: filePath },
        { onConflict: "submission_id,doc_type" }
      );
    if (error) throw new Error(error.message);
    revalidatePath(`/submissions/${submissionId}/edit`);
    return;
  }

  const downloads = await Promise.all(
    filePaths.map(async (path) => {
      const { data, error } = await supabase.storage.from("submission-files").download(path);
      if (error || !data) throw new Error(`Could not load ${path}: ${error?.message}`);
      const extension = path.split(".").pop() || "jpg";
      return { bytes: Buffer.from(await data.arrayBuffer()), extension };
    })
  );

  const combined = await combineAttachments(downloads);
  const combinedPath = `${submissionId}/${docType}-${Date.now()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("submission-files")
    .upload(combinedPath, combined, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { error: recordError } = await supabase
    .from("documents")
    .upsert(
      { submission_id: submissionId, doc_type: docType, file_path: combinedPath },
      { onConflict: "submission_id,doc_type" }
    );
  if (recordError) throw new Error(recordError.message);

  // Best-effort cleanup of the individual page uploads now that they're merged into one file.
  await supabase.storage.from("submission-files").remove(filePaths);

  revalidatePath(`/submissions/${submissionId}/edit`);
}

export async function removeDocument(submissionId: string, docType: DocType) {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("documents")
    .select("file_path")
    .eq("submission_id", submissionId)
    .eq("doc_type", docType)
    .maybeSingle();

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("submission_id", submissionId)
    .eq("doc_type", docType);
  if (error) throw new Error(error.message);

  if (existing?.file_path) {
    // best-effort - a failed storage cleanup shouldn't block the document being un-attached
    await supabase.storage.from("submission-files").remove([existing.file_path]);
  }

  revalidatePath(`/submissions/${submissionId}/edit`);
}

export async function recordSignature(
  submissionId: string,
  role: SignerRole,
  fields: { signature_path: string; signed_name: string }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("persons")
    .upsert(
      {
        submission_id: submissionId,
        role,
        ...fields,
        signed_at: new Date().toISOString(),
      },
      { onConflict: "submission_id,role" }
    );
  if (error) throw new Error(error.message);
  revalidatePath(`/submissions/${submissionId}/edit`);
}
