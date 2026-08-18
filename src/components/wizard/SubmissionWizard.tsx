"use client";

import { useMemo, useState } from "react";
import { PersonForm } from "./PersonForm";
import { VehicleForm } from "./VehicleForm";
import { DocumentsForm } from "./DocumentsForm";
import { IncomeDocumentsForm } from "./IncomeDocumentsForm";
import { SigningStep } from "./SigningStep";
import { GenerateStep } from "./GenerateStep";
import { removePerson } from "@/app/submissions/[id]/edit/actions";
import type { PersonRow, PersonRole, PersonFields, SubmissionRow, DocumentRow } from "@/lib/types";

const STEPS = [
  "documents",
  "income",
  "vehicle",
  "hirer",
  "guarantor1",
  "guarantor2",
  "signing",
  "generate",
] as const;
type Step = (typeof STEPS)[number];

const STEP_META: Record<Step, { title: string; subtitle: string }> = {
  vehicle: { title: "Vehicle Info", subtitle: "Car Info & Financing" },
  hirer: { title: "Hirer Info", subtitle: "Personal Info & Address" },
  guarantor1: { title: "Guarantor Info", subtitle: "Guarantor 1 Details" },
  guarantor2: { title: "Guarantor 2", subtitle: "2nd Guarantor Details" },
  documents: { title: "Attachments", subtitle: "Hirer & Guarantor Documents" },
  income: { title: "Income Documents", subtitle: "Payslips & EPF/KWSP" },
  signing: { title: "Signing", subtitle: "E-Signature" },
  generate: { title: "Generate", subtitle: "Compile & Download" },
};

interface Props {
  submission: SubmissionRow;
  persons: PersonRow[];
  documents: DocumentRow[];
  dealer: { name: string; phone: string };
  isAdmin: boolean;
}

export function SubmissionWizard({
  submission,
  persons: initialPersons,
  documents,
  dealer,
  isAdmin,
}: Props) {
  const [persons, setPersons] = useState(initialPersons);
  const [step, setStep] = useState<Step>("documents");
  const [vehicle, setVehicle] = useState({
    no_plate: submission.no_plate,
    model: submission.model,
    year_made: submission.year_made,
    finance_loan: submission.finance_loan,
    tenure_year: submission.tenure_year,
    stock_board_vehicle_id: submission.stock_board_vehicle_id,
  });
  const [hasGuarantor2, setHasGuarantor2] = useState(() =>
    initialPersons.some((p) => p.role === "guarantor2")
  );

  function updateVehicleFields(fields: Partial<typeof vehicle>) {
    setVehicle((v) => ({ ...v, ...fields }));
  }

  const byRole = useMemo(
    () => Object.fromEntries(persons.map((p) => [p.role, p])) as Record<string, PersonRow>,
    [persons]
  );

  function updatePersonFields(role: PersonRole, fields: PersonFields) {
    setPersons((prev) => {
      const existing = prev.find((p) => p.role === role);
      if (existing) {
        return prev.map((p) => (p.role === role ? { ...p, ...fields } : p));
      }
      const stub: PersonRow = {
        id: `pending-${role}`,
        submission_id: submission.id,
        role,
        name: "",
        nric: "",
        dob: null,
        age: null,
        sex: "",
        race: "",
        bumi: "",
        address: "",
        poskod: "",
        state: "",
        marital_status: "",
        phone: "",
        job_position: "",
        employer: "",
        office_address: "",
        office_phone: "",
        email: "",
        relationship_to_hirer: "",
        no_payslip: false,
        company_name: "",
        company_registration: "",
        company_address: "",
        signature_path: null,
        signed_name: null,
        signed_at: null,
        ...fields,
      };
      return [...prev, stub];
    });
  }

  async function toggleGuarantor2(enabled: boolean) {
    if (!enabled) {
      await removePerson(submission.id, "guarantor2");
      setPersons((p) => p.filter((x) => x.role !== "guarantor2"));
    }
    setHasGuarantor2(enabled);
  }

  const signers = [
    { role: "hirer" as const, label: "Hirer", defaultName: byRole.hirer?.name ?? "" },
    { role: "guarantor1" as const, label: "Guarantor 1", defaultName: byRole.guarantor1?.name ?? "" },
    ...(hasGuarantor2
      ? [{ role: "guarantor2" as const, label: "Guarantor 2", defaultName: byRole.guarantor2?.name ?? "" }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <nav className="flex flex-shrink-0 gap-1 overflow-x-auto rounded-[10px] border border-line bg-panel p-2 md:w-56 md:flex-col md:overflow-visible">
        {STEPS.map((s) => {
          const active = step === s;
          const meta = STEP_META[s];
          return (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`min-w-[140px] rounded-[7px] border-l-2 px-3 py-2.5 text-left transition-colors md:min-w-0 ${
                active ? "border-amber bg-panel-raised" : "border-transparent hover:bg-panel-raised/60"
              }`}
            >
              <p
                className={`font-display text-xs ${active ? "text-amber" : "text-muted"}`}
              >
                {meta.title}
              </p>
              <p className="mt-0.5 text-xs normal-case text-muted">{meta.subtitle}</p>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1 rounded-[10px] border border-line bg-panel p-6">
        {step === "vehicle" && (
          <VehicleForm
            submissionId={submission.id}
            submission={{ ...submission, ...vehicle }}
            onVehicleFieldsChange={updateVehicleFields}
            onSaved={() => setStep("hirer")}
          />
        )}

        {step === "hirer" && (
          <PersonForm
            submissionId={submission.id}
            role="hirer"
            title="Hirer"
            initial={byRole.hirer}
            simple
            hidePhone
            onSaved={(fields) => {
              updatePersonFields("hirer", fields);
              setStep("guarantor1");
            }}
          />
        )}

        {step === "guarantor1" && (
          <PersonForm
            submissionId={submission.id}
            role="guarantor1"
            title="Guarantor 1"
            initial={byRole.guarantor1}
            simple
            hidePhone
            blankPhoneOnSave
            hideAddress
            onSaved={(fields) => {
              updatePersonFields("guarantor1", fields);
              setStep(hasGuarantor2 ? "guarantor2" : "signing");
            }}
          />
        )}

        {step === "guarantor2" && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hasGuarantor2}
                onChange={(e) => toggleGuarantor2(e.target.checked)}
              />
              This submission has a 2nd guarantor
            </label>
            {hasGuarantor2 && (
              <PersonForm
                submissionId={submission.id}
                role="guarantor2"
                title="Guarantor 2"
                initial={byRole.guarantor2}
                simple
                hidePhone
                blankPhoneOnSave
                hideAddress
                onSaved={(fields) => {
                  updatePersonFields("guarantor2", fields);
                  setStep("signing");
                }}
              />
            )}
          </div>
        )}

        {step === "documents" && (
          <DocumentsForm
            submissionId={submission.id}
            documents={documents}
            showGuarantor2={hasGuarantor2}
            onToggleGuarantor2={toggleGuarantor2}
            noPlate={vehicle.no_plate ?? ""}
            hirerPhone={byRole.hirer?.phone ?? ""}
            guarantor1Relationship={byRole.guarantor1?.relationship_to_hirer ?? ""}
            guarantor2Relationship={byRole.guarantor2?.relationship_to_hirer ?? ""}
            hirerName={byRole.hirer?.name ?? ""}
            hirerNric={byRole.hirer?.nric ?? ""}
            guarantor1Name={byRole.guarantor1?.name ?? ""}
            guarantor1Nric={byRole.guarantor1?.nric ?? ""}
            guarantor2Name={byRole.guarantor2?.name ?? ""}
            guarantor2Nric={byRole.guarantor2?.nric ?? ""}
            onPersonExtracted={updatePersonFields}
            onVehicleExtracted={updateVehicleFields}
          />
        )}

        {step === "income" && (
          <IncomeDocumentsForm
            submissionId={submission.id}
            documents={documents}
            showGuarantor2={hasGuarantor2}
            persons={persons}
            onPersonExtracted={updatePersonFields}
          />
        )}

        {step === "signing" && (
          <SigningStep
            submissionId={submission.id}
            signers={signers}
            persons={persons}
            onSigned={updatePersonFields}
          />
        )}

        {step === "generate" && (
          <GenerateStep
            submissionId={submission.id}
            dealer={dealer}
            hasGuarantor2={hasGuarantor2}
            signers={signers}
            persons={persons}
            stockBoardVehicleId={vehicle.stock_board_vehicle_id}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </div>
  );
}
