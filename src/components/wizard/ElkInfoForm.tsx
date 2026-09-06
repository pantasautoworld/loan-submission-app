"use client";

import { useState } from "react";
import { savePerson } from "@/app/submissions/[id]/edit/actions";
import type { PersonFields, PersonRole, PersonRow } from "@/lib/types";

type ElkRole = "hirer" | "guarantor1" | "guarantor2";

interface Props {
  submissionId: string;
  showGuarantor2: boolean;
  persons: PersonRow[];
  onPersonExtracted: (role: PersonRole, fields: PersonFields) => void;
}

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

const SECTIONS: { role: ElkRole; label: string }[] = [
  { role: "hirer", label: "Hirer" },
  { role: "guarantor1", label: "Guarantor 1" },
  { role: "guarantor2", label: "Guarantor 2" },
];

export function ElkInfoForm({ submissionId, showGuarantor2, persons, onPersonExtracted }: Props) {
  const byRole = Object.fromEntries(persons.map((p) => [p.role, p])) as Partial<
    Record<ElkRole, PersonRow>
  >;

  const [oldIc, setOldIc] = useState<Record<ElkRole, string>>({
    hirer: byRole.hirer?.old_ic ?? "",
    guarantor1: byRole.guarantor1?.old_ic ?? "",
    guarantor2: byRole.guarantor2?.old_ic ?? "",
  });
  const [epfNo, setEpfNo] = useState<Record<ElkRole, string>>({
    hirer: byRole.hirer?.epf_no ?? "",
    guarantor1: byRole.guarantor1?.epf_no ?? "",
    guarantor2: byRole.guarantor2?.epf_no ?? "",
  });
  const [tnbAccountNo, setTnbAccountNo] = useState(byRole.hirer?.tnb_account_no ?? "");

  async function saveField(role: PersonRole, field: string, value: string) {
    await savePerson(submissionId, role, { [field]: value });
    onPersonExtracted(role, { [field]: value });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-fg">ELK Info</h3>
        <p className="text-sm text-muted">
          Old IC numbers are auto-filled from each person&apos;s IC (Back) scan in Attachments
          (if printed there); EPF/KWSP numbers are auto-filled from the EPF statement in Income
          Documents; the TNB account number is auto-filled from the TNB / Electricity Bill in
          Attachments. All fields can be corrected manually below.
        </p>
      </div>

      <div className="rounded-[10px] border border-line bg-panel-raised/40 p-4">
        <label className={LABEL}>TNB Account Number</label>
        <input
          className={FIELD}
          value={tnbAccountNo}
          onChange={(e) => setTnbAccountNo(e.target.value)}
          onBlur={() => saveField("hirer", "tnb_account_no", tnbAccountNo)}
          placeholder="Not detected - type manually"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.filter((s) => s.role !== "guarantor2" || showGuarantor2).map((s) => (
          <div
            key={s.role}
            className="space-y-3 rounded-[10px] border border-line bg-panel-raised/40 p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {s.label}
            </p>
            <div>
              <label className={LABEL}>Old IC</label>
              <input
                className={FIELD}
                value={oldIc[s.role]}
                onChange={(e) => setOldIc((v) => ({ ...v, [s.role]: e.target.value }))}
                onBlur={() => saveField(s.role, "old_ic", oldIc[s.role])}
                placeholder="Not detected - type manually if have"
              />
            </div>
            <div>
              <label className={LABEL}>EPF / KWSP Account Number</label>
              <input
                className={FIELD}
                value={epfNo[s.role]}
                onChange={(e) => setEpfNo((v) => ({ ...v, [s.role]: e.target.value }))}
                onBlur={() => saveField(s.role, "epf_no", epfNo[s.role])}
                placeholder="Not detected - type manually if have"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
