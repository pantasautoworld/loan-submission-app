import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchSubmissionDocData } from "@/lib/pdf/fetchDocData";
import { buildPayslipBuffer } from "@/lib/pdf/buildPayslip";
import { convertXlsxToPdf } from "@/lib/convertToPdf";
import { combineAttachments, type Attachment } from "@/lib/pdf/mergeDocuments";
import { withTimeout } from "@/lib/withTimeout";
import type { DocType, DocumentRow } from "@/lib/types";

const DOWNLOAD_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 30_000;

type IncomeRole = "hirer" | "guarantor1" | "guarantor2";

const INCOME_SLOTS: {
  role: IncomeRole;
  payslipDoc: DocType;
  templateDoc: DocType;
  epfDoc: DocType;
  staffTagDoc: DocType;
}[] = [
  {
    role: "hirer",
    payslipDoc: "hirer_payslip",
    templateDoc: "hirer_payslip_template",
    epfDoc: "hirer_epf",
    staffTagDoc: "hirer_staff_tag",
  },
  {
    role: "guarantor1",
    payslipDoc: "guarantor1_payslip",
    templateDoc: "guarantor1_payslip_template",
    epfDoc: "guarantor1_epf",
    staffTagDoc: "guarantor1_staff_tag",
  },
  {
    role: "guarantor2",
    payslipDoc: "guarantor2_payslip",
    templateDoc: "guarantor2_payslip_template",
    epfDoc: "guarantor2_epf",
    staffTagDoc: "guarantor2_staff_tag",
  },
];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: submissionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can generate the income packet." },
      { status: 403 }
    );
  }

  try {
    const { data: submission, error: subErr } = await supabase
      .from("submissions")
      .select("status")
      .eq("id", submissionId)
      .single();
    if (subErr || !submission) throw new Error(subErr?.message ?? "Submission not found");
    if (submission.status !== "generated") {
      return NextResponse.json(
        { error: "Generate the main application packet first." },
        { status: 400 }
      );
    }

    const { guarantor2Present, payslipInfo } = await fetchSubmissionDocData(supabase, submissionId);

    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("*")
      .eq("submission_id", submissionId);
    if (docsError) throw new Error(docsError.message);

    const docsByType = Object.fromEntries(
      ((documents ?? []) as DocumentRow[]).map((d) => [d.doc_type, d])
    ) as Partial<Record<DocType, DocumentRow>>;

    const activeSlots = INCOME_SLOTS.filter((s) => s.role !== "guarantor2" || guarantor2Present);

    const missingDocs = activeSlots
      .map((slot) => {
        const info = payslipInfo[slot.role];
        const neededDoc = info?.noPayslip ? slot.templateDoc : slot.payslipDoc;
        return docsByType[neededDoc] ? null : neededDoc;
      })
      .filter((d): d is DocType => d !== null);
    if (missingDocs.length > 0) {
      return NextResponse.json(
        { error: `Missing document(s): ${missingDocs.join(", ")}` },
        { status: 400 }
      );
    }

    async function downloadFile(path: string, label: string): Promise<Buffer> {
      const { data, error } = await withTimeout(
        supabase.storage.from("submission-files").download(path),
        DOWNLOAD_TIMEOUT_MS,
        `Downloading ${label}`
      );
      if (error || !data) throw new Error(`Could not load ${label}: ${error?.message}`);
      return Buffer.from(await data.arrayBuffer());
    }

    const attachmentGroups = await Promise.all(
      activeSlots.map(async (slot): Promise<Attachment[]> => {
        const group: Attachment[] = [];
        const info = payslipInfo[slot.role];

        if (info?.noPayslip) {
          const record = docsByType[slot.templateDoc]!;
          const templateBuffer = await downloadFile(record.file_path, slot.templateDoc);
          const filledXlsx = await buildPayslipBuffer(templateBuffer, {
            name: info.name,
            nric: info.nric,
            companyName: info.companyName,
            companyRegistration: info.companyRegistration,
            companyAddress: info.companyAddress,
          });
          const payslipPdf = await convertXlsxToPdf(filledXlsx);
          group.push({ bytes: payslipPdf, extension: "pdf" });
        } else {
          const record = docsByType[slot.payslipDoc]!;
          const bytes = await downloadFile(record.file_path, slot.payslipDoc);
          group.push({ bytes, extension: record.file_path.split(".").pop() || "jpg" });
        }

        const epfRecord = info?.noPayslip ? undefined : docsByType[slot.epfDoc];
        if (epfRecord) {
          const bytes = await downloadFile(epfRecord.file_path, slot.epfDoc);
          group.push({ bytes, extension: epfRecord.file_path.split(".").pop() || "jpg" });
        }

        const staffTagRecord = docsByType[slot.staffTagDoc];
        if (staffTagRecord) {
          const bytes = await downloadFile(staffTagRecord.file_path, slot.staffTagDoc);
          group.push({ bytes, extension: staffTagRecord.file_path.split(".").pop() || "jpg" });
        }

        return group;
      })
    );
    const attachments = attachmentGroups.flat();

    const combinedPdf = await combineAttachments(attachments);

    const pdfPath = `${submissionId}/income-packet-${Date.now()}.pdf`;
    const { error: uploadError } = await withTimeout(
      supabase.storage
        .from("submission-files")
        .upload(pdfPath, combinedPdf, { contentType: "application/pdf", upsert: true }),
      UPLOAD_TIMEOUT_MS,
      "Uploading income packet"
    );
    if (uploadError) throw new Error(uploadError.message);

    const { error: insertError } = await supabase.from("generated_documents").insert({
      submission_id: submissionId,
      guarantor_count: guarantor2Present ? 2 : 1,
      pdf_path: pdfPath,
      kind: "income",
    });
    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({ pdf_path: pdfPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate income packet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
