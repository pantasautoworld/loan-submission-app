"use client";

import { useState } from "react";
import {
  recordCombinedDocument,
  removeDocument,
  savePerson,
} from "@/app/submissions/[id]/edit/actions";
import { uploadSubmissionFile } from "@/lib/storage";
import { UploadBox } from "@/components/UploadBox";
import type { DocType, DocumentRow, PersonFields, PersonRole, PersonRow } from "@/lib/types";

type IncomeRole = "hirer" | "guarantor1" | "guarantor2";

interface Props {
  submissionId: string;
  documents: DocumentRow[];
  showGuarantor2: boolean;
  persons: PersonRow[];
  onPersonExtracted: (role: PersonRole, fields: PersonFields) => void;
  /** Admin-only: shows the payslip template upload used to auto-generate a payslip. */
  allowTemplateUpload?: boolean;
}

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

const SECTIONS: {
  role: IncomeRole;
  label: string;
  payslipDoc: DocType;
  templateDoc: DocType;
  epfDoc: DocType;
  staffTagDoc: DocType;
}[] = [
  {
    role: "hirer",
    label: "Hirer",
    payslipDoc: "hirer_payslip",
    templateDoc: "hirer_payslip_template",
    epfDoc: "hirer_epf",
    staffTagDoc: "hirer_staff_tag",
  },
  {
    role: "guarantor1",
    label: "Guarantor 1",
    payslipDoc: "guarantor1_payslip",
    templateDoc: "guarantor1_payslip_template",
    epfDoc: "guarantor1_epf",
    staffTagDoc: "guarantor1_staff_tag",
  },
  {
    role: "guarantor2",
    label: "Guarantor 2",
    payslipDoc: "guarantor2_payslip",
    templateDoc: "guarantor2_payslip_template",
    epfDoc: "guarantor2_epf",
    staffTagDoc: "guarantor2_staff_tag",
  },
];

interface CompanyDetails {
  company_name: string;
  company_registration: string;
  company_address: string;
}

export function IncomeDocumentsForm({
  submissionId,
  documents,
  showGuarantor2,
  persons,
  onPersonExtracted,
  allowTemplateUpload,
}: Props) {
  const [uploaded, setUploaded] = useState<Set<DocType>>(
    new Set(documents.map((d) => d.doc_type))
  );
  const [busy, setBusy] = useState<DocType | null>(null);
  const [scanError, setScanError] = useState<Partial<Record<DocType, string>>>({});

  const byRole = Object.fromEntries(persons.map((p) => [p.role, p])) as Partial<
    Record<IncomeRole, PersonRow>
  >;

  const [noPayslip, setNoPayslip] = useState<Record<IncomeRole, boolean>>({
    hirer: byRole.hirer?.no_payslip ?? false,
    guarantor1: byRole.guarantor1?.no_payslip ?? false,
    guarantor2: byRole.guarantor2?.no_payslip ?? false,
  });

  const [company, setCompany] = useState<Record<IncomeRole, CompanyDetails>>({
    hirer: {
      company_name: byRole.hirer?.company_name ?? "",
      company_registration: byRole.hirer?.company_registration ?? "",
      company_address: byRole.hirer?.company_address ?? "",
    },
    guarantor1: {
      company_name: byRole.guarantor1?.company_name ?? "",
      company_registration: byRole.guarantor1?.company_registration ?? "",
      company_address: byRole.guarantor1?.company_address ?? "",
    },
    guarantor2: {
      company_name: byRole.guarantor2?.company_name ?? "",
      company_registration: byRole.guarantor2?.company_registration ?? "",
      company_address: byRole.guarantor2?.company_address ?? "",
    },
  });

  function setCompanyField(role: IncomeRole, key: keyof CompanyDetails, value: string) {
    setCompany((c) => ({ ...c, [role]: { ...c[role], [key]: value } }));
  }

  async function saveCompanyField(role: IncomeRole, key: keyof CompanyDetails, value: string) {
    await savePerson(submissionId, role, { [key]: value });
    onPersonExtracted(role, { [key]: value });
  }

  async function toggleNoPayslip(role: IncomeRole, checked: boolean) {
    setNoPayslip((s) => ({ ...s, [role]: checked }));
    await savePerson(submissionId, role, { no_payslip: checked });
    onPersonExtracted(role, { no_payslip: checked });
  }

  async function handleUpload(docType: DocType, files: File[]) {
    if (files.length === 0) return;
    setBusy(docType);
    setScanError((e) => ({ ...e, [docType]: undefined }));
    try {
      const paths = await Promise.all(
        files.map((file) => uploadSubmissionFile(submissionId, docType, file))
      );
      await recordCombinedDocument(submissionId, docType, paths);
      setUploaded((s) => new Set(s).add(docType));
    } catch (err) {
      setScanError((e) => ({
        ...e,
        [docType]: err instanceof Error ? err.message : "Upload failed",
      }));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(docType: DocType) {
    setBusy(docType);
    setScanError((e) => ({ ...e, [docType]: undefined }));
    try {
      await removeDocument(submissionId, docType);
      setUploaded((s) => {
        const next = new Set(s);
        next.delete(docType);
        return next;
      });
    } catch (err) {
      setScanError((e) => ({
        ...e,
        [docType]: err instanceof Error ? err.message : "Delete failed",
      }));
    } finally {
      setBusy(null);
    }
  }

  function box(
    docType: DocType,
    label: string,
    opts?: { required?: boolean; hint?: string; accept?: string; multiple?: boolean }
  ) {
    return (
      <div>
        <UploadBox
          label={label}
          required={opts?.required}
          hint={opts?.hint}
          uploaded={uploaded.has(docType)}
          busy={busy === docType}
          accept={opts?.accept ?? "image/*,application/pdf"}
          multiple={opts?.multiple}
          onSelect={(file) => handleUpload(docType, [file])}
          onSelectMultiple={opts?.multiple ? (files) => handleUpload(docType, files) : undefined}
          onDelete={() => handleDelete(docType)}
        />
        {scanError[docType] && <p className="mt-1 text-xs text-danger">{scanError[docType]}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-fg">Income Documents</h3>
        <p className="text-sm text-muted">
          Latest 3 months&apos; payslips (required) and EPF/KWSP statement (if have) for each
          person. If someone doesn&apos;t have a payslip, tick the box below their upload boxes and
          fill in their employer&apos;s details instead
          {allowTemplateUpload
            ? " — then upload a blank payslip Excel template so the system can generate their 3 months' payslips automatically."
            : "; an admin will generate their payslip from those details separately."}
        </p>
      </div>

      {SECTIONS.filter((s) => s.role !== "guarantor2" || showGuarantor2).map((s) => {
        const details = company[s.role];
        const skipped = noPayslip[s.role];

        return (
          <div
            key={s.role}
            className="space-y-3 rounded-[10px] border border-line bg-panel-raised/40 p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {s.label}
            </p>

            {!skipped &&
              box(s.payslipDoc, `${s.label} Payslip (3 Months)`, {
                required: true,
                multiple: true,
                hint: "select all 3 months at once, or upload one at a time",
              })}
            {!skipped && box(s.epfDoc, `${s.label} EPF / KWSP`, { hint: "if have" })}
            {box(s.staffTagDoc, `${s.label} Signage / Staff Tag`, { hint: "if have" })}

            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={skipped}
                onChange={(e) => toggleNoPayslip(s.role, e.target.checked)}
              />
              {s.label} doesn&apos;t have a payslip
            </label>

            {skipped && (
              <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL}>Company Name</label>
                  <input
                    className={FIELD}
                    value={details.company_name}
                    onChange={(e) => setCompanyField(s.role, "company_name", e.target.value)}
                    onBlur={() =>
                      saveCompanyField(s.role, "company_name", details.company_name)
                    }
                  />
                </div>
                <div>
                  <label className={LABEL}>Company Registration (if have)</label>
                  <input
                    className={FIELD}
                    value={details.company_registration}
                    onChange={(e) =>
                      setCompanyField(s.role, "company_registration", e.target.value)
                    }
                    onBlur={() =>
                      saveCompanyField(
                        s.role,
                        "company_registration",
                        details.company_registration
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL}>Company Address</label>
                  <input
                    className={FIELD}
                    value={details.company_address}
                    onChange={(e) => setCompanyField(s.role, "company_address", e.target.value)}
                    onBlur={() =>
                      saveCompanyField(s.role, "company_address", details.company_address)
                    }
                  />
                </div>
                {allowTemplateUpload ? (
                  <>
                    <div className="sm:col-span-2">
                      {box(s.templateDoc, `${s.label} Payslip Template (Excel)`, {
                        required: true,
                        hint: "blank .xlsx format used to generate the payslip",
                        accept: ".xlsx",
                      })}
                    </div>
                    <p className="text-xs text-muted sm:col-span-2">
                      A 3-month payslip will be generated automatically from this template using
                      the name and company details above.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted sm:col-span-2">
                    An admin will upload a payslip template and generate this person&apos;s
                    payslip from these details.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
