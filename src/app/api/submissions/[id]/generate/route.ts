import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchSubmissionDocData } from "@/lib/pdf/fetchDocData";
import { buildWorkbookBuffer } from "@/lib/pdf/buildWorkbook";
import { convertXlsxToPdf } from "@/lib/convertToPdf";
import { mergePdfPacketWithAttachments, type Attachment } from "@/lib/pdf/mergeDocuments";
import { withTimeout } from "@/lib/withTimeout";
import { notifyTelegram } from "@/lib/telegram";
import type { SignerRole } from "@/lib/formTemplate";
import type { DocType, DocumentRow } from "@/lib/types";

const DOWNLOAD_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 30_000;

// Final packet order: ELK submission form, then the checklist attachments in
// this exact sequence. Licenses and IC backs are optional ("if have"); everything
// else here is required for a complete submission. Income documents (payslip/EPF)
// are handled separately - see /api/submissions/[id]/generate-income - and are
// never part of this packet.
const ATTACHMENT_ORDER: { docType: DocType; required: boolean }[] = [
  { docType: "car_voc", required: true },
  { docType: "hirer_ic", required: true },
  { docType: "hirer_ic_back", required: false },
  { docType: "hirer_license", required: false },
  { docType: "hirer_license_back", required: false },
  { docType: "guarantor1_ic", required: true },
  { docType: "guarantor1_ic_back", required: false },
  { docType: "guarantor1_license", required: false },
  { docType: "guarantor1_license_back", required: false },
  { docType: "guarantor2_ic", required: false }, // required: true only when guarantor2 exists, checked below
  { docType: "guarantor2_ic_back", required: false },
  { docType: "guarantor2_license", required: false },
  { docType: "guarantor2_license_back", required: false },
  { docType: "tnb_bill", required: true },
];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: submissionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { doc, guarantor2Present, signatures } = await fetchSubmissionDocData(
      supabase,
      submissionId
    );

    const requiredSigners: SignerRole[] = guarantor2Present
      ? ["hirer", "guarantor1", "guarantor2"]
      : ["hirer", "guarantor1"];
    const missingSignatures = requiredSigners.filter((r) => !signatures[r]);
    if (missingSignatures.length > 0) {
      return NextResponse.json(
        { error: `Missing signature(s): ${missingSignatures.join(", ")}` },
        { status: 400 }
      );
    }

    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("*")
      .eq("submission_id", submissionId);
    if (docsError) throw new Error(docsError.message);

    const docsByType = Object.fromEntries(
      ((documents ?? []) as DocumentRow[]).map((d) => [d.doc_type, d])
    ) as Partial<Record<DocType, DocumentRow>>;

    const missingDocs = ATTACHMENT_ORDER.filter(
      ({ docType, required }) =>
        (required || (docType === "guarantor2_ic" && guarantor2Present)) && !docsByType[docType]
    ).map((d) => d.docType);
    if (missingDocs.length > 0) {
      return NextResponse.json(
        { error: `Missing document(s): ${missingDocs.join(", ")}` },
        { status: 400 }
      );
    }

    const signatureDownloads = await Promise.all(
      requiredSigners.map(async (role) => {
        const path = signatures[role]!;
        const { data, error } = await withTimeout(
          supabase.storage.from("submission-files").download(path),
          DOWNLOAD_TIMEOUT_MS,
          `Downloading ${role} signature`
        );
        if (error || !data) throw new Error(`Could not load ${role} signature: ${error?.message}`);
        return [role, Buffer.from(await data.arrayBuffer())] as const;
      })
    );
    const signatureImages: Partial<Record<SignerRole, Buffer>> = Object.fromEntries(
      signatureDownloads
    );

    const xlsxBuffer = await buildWorkbookBuffer(doc, guarantor2Present, signatureImages);
    const elkPacketPdf = await convertXlsxToPdf(xlsxBuffer);

    const attachmentDownloads = await Promise.all(
      ATTACHMENT_ORDER.filter(({ docType }) => docsByType[docType]).map(async ({ docType }) => {
        const record = docsByType[docType]!;
        const { data, error } = await withTimeout(
          supabase.storage.from("submission-files").download(record.file_path),
          DOWNLOAD_TIMEOUT_MS,
          `Downloading ${docType}`
        );
        if (error || !data) throw new Error(`Could not load ${docType}: ${error?.message}`);
        const extension = record.file_path.split(".").pop() || "jpg";
        const attachment: Attachment = { bytes: Buffer.from(await data.arrayBuffer()), extension };
        return attachment;
      })
    );
    const attachments: Attachment[] = attachmentDownloads;

    const combinedPdf = await mergePdfPacketWithAttachments(elkPacketPdf, attachments);

    const pdfPath = `${submissionId}/packet-${Date.now()}.pdf`;
    const { error: uploadError } = await withTimeout(
      supabase.storage
        .from("submission-files")
        .upload(pdfPath, combinedPdf, { contentType: "application/pdf", upsert: true }),
      UPLOAD_TIMEOUT_MS,
      "Uploading generated packet"
    );
    if (uploadError) throw new Error(uploadError.message);

    const { error: insertError } = await supabase.from("generated_documents").insert({
      submission_id: submissionId,
      guarantor_count: guarantor2Present ? 2 : 1,
      pdf_path: pdfPath,
      kind: "main",
    });
    if (insertError) throw new Error(insertError.message);

    // Only the first generation should notify Telegram - a later regenerate (e.g.
    // after fixing a document) already has status "generated" going in, so this
    // stays a one-time "packet generated" ping rather than firing on every retry.
    const { data: beforeGenerate } = await supabase
      .from("submissions")
      .select("status")
      .eq("id", submissionId)
      .single();
    const alreadyGenerated = beforeGenerate?.status === "generated";

    await supabase.from("submissions").update({ status: "generated" }).eq("id", submissionId);

    if (!alreadyGenerated) {
      void notifyTelegram(
        `📄 <b>Submission generated</b>\n` +
          `Hirer: ${doc.hirer.name || "-"}\n` +
          `Vehicle: ${doc.vehicle.plateNo || "-"} ${doc.vehicle.model || ""}`.trim()
      );
    }

    return NextResponse.json({ pdf_path: pdfPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
