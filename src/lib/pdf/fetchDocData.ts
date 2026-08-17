import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonData, SubmissionDocData } from "@/lib/formTemplate";
import type { PersonRow } from "@/lib/types";

function splitAddress(address: string, poskod: string, state: string) {
  const trimmed = (address ?? "").trim();
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length > 1) {
    return { address1: lines[0], address2: lines.slice(1).join(", ") };
  }
  const line2 = [poskod, state].filter(Boolean).join(" ");
  return { address1: trimmed, address2: line2 };
}

function toPersonData(
  p: PersonRow | undefined,
  addressOverride?: { address1: string; address2: string }
): PersonData {
  const { address1, address2 } =
    addressOverride ?? splitAddress(p?.address ?? "", p?.poskod ?? "", p?.state ?? "");
  return {
    name: p?.name ?? "",
    nric: p?.nric ?? "",
    address1,
    address2,
    phone: p?.phone ?? "",
    officePhone: p?.office_phone ?? "",
    jobPosition: p?.job_position ?? "",
    email: p?.email ?? "",
    maritalStatus: p?.marital_status ?? "",
    relationshipToHirer: p?.relationship_to_hirer ?? "",
  };
}

export interface PayslipInfo {
  name: string;
  nric: string;
  noPayslip: boolean;
  companyName: string;
  companyRegistration: string;
  companyAddress: string;
}

export interface FetchedDocData {
  doc: SubmissionDocData;
  guarantor2Present: boolean;
  signatures: Partial<Record<"hirer" | "guarantor1" | "guarantor2", string>>;
  payslipInfo: Partial<Record<"hirer" | "guarantor1" | "guarantor2", PayslipInfo>>;
}

export async function fetchSubmissionDocData(
  supabase: SupabaseClient,
  submissionId: string
): Promise<FetchedDocData> {
  const { data: submission, error: subErr } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (subErr || !submission) throw new Error(subErr?.message ?? "Submission not found");

  const { data: persons, error: personsErr } = await supabase
    .from("persons")
    .select("*")
    .eq("submission_id", submissionId);
  if (personsErr) throw new Error(personsErr.message);

  const byRole = Object.fromEntries(
    ((persons ?? []) as PersonRow[]).map((p) => [p.role, p])
  ) as Record<string, PersonRow>;

  // Dealer Contact on the printed form is always William, regardless of which
  // staff member actually created the submission.
  const dealerName = "WILLIAM";
  const dealerPhone = "0162209393";

  const guarantor2Present = !!byRole.guarantor2;

  // Match the original file's date style, e.g. 7/08/2026
  const now = new Date();
  const date = `${now.getDate()}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  // Guarantors never get their own printed address - the form just prints "SAME AS
  // HIRER" in that field (see PersonForm's locked address box), matching how staff
  // fill this in on paper rather than repeating the hirer's full address twice.
  const hirer = toPersonData(byRole.hirer);
  const sameAsHirer = { address1: "SAME AS HIRER", address2: "" };

  const doc: SubmissionDocData = {
    dealer: { name: dealerName, phone: dealerPhone },
    vehicle: {
      plateNo: submission.no_plate ?? "",
      model: submission.model ?? "",
      yearMade: submission.year_made ?? "",
      financeLoan: submission.finance_loan ?? "",
      tenureYears: submission.tenure_year ?? "",
    },
    hirer,
    guarantor1: toPersonData(byRole.guarantor1, sameAsHirer),
    guarantor2: guarantor2Present ? toPersonData(byRole.guarantor2, sameAsHirer) : undefined,
    date,
  };

  const signatures: FetchedDocData["signatures"] = {};
  if (byRole.hirer?.signature_path) signatures.hirer = byRole.hirer.signature_path;
  if (byRole.guarantor1?.signature_path) signatures.guarantor1 = byRole.guarantor1.signature_path;
  if (byRole.guarantor2?.signature_path) signatures.guarantor2 = byRole.guarantor2.signature_path;

  function toPayslipInfo(p: PersonRow | undefined): PayslipInfo | undefined {
    if (!p) return undefined;
    return {
      name: p.name ?? "",
      nric: p.nric ?? "",
      noPayslip: p.no_payslip ?? false,
      companyName: p.company_name ?? "",
      companyRegistration: p.company_registration ?? "",
      companyAddress: p.company_address ?? "",
    };
  }
  const payslipInfo: FetchedDocData["payslipInfo"] = {
    hirer: toPayslipInfo(byRole.hirer),
    guarantor1: toPayslipInfo(byRole.guarantor1),
    guarantor2: toPayslipInfo(byRole.guarantor2),
  };

  return { doc, guarantor2Present, signatures, payslipInfo };
}
