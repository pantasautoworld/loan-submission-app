"use client";

import { useState, useTransition } from "react";
import { savePerson } from "@/app/submissions/[id]/edit/actions";
import type { PersonRole, PersonRow } from "@/lib/types";

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

interface Props {
  submissionId: string;
  role: PersonRole;
  title: string;
  initial?: PersonRow;
  /** Hides the Address field entirely - guarantors' printed address is always "SAME AS HIRER" (see fetchDocData.ts), so there's nothing for them to fill in here. */
  hideAddress?: boolean;
  /** Show relationship-to-hirer field (guarantors/references). */
  withRelationship?: boolean;
  /** Only show Name/IC/Address/Phone - hides Poskod/State/Race/Bumi/Email/Marital/Job/Employer/Office fields. */
  simple?: boolean;
  /** Hides the Phone field (it's edited elsewhere, e.g. the Attachments tab). */
  hidePhone?: boolean;
  /** Combined with hidePhone: also forces the saved phone to blank (guarantors don't collect one at all). */
  blankPhoneOnSave?: boolean;
  onSaved?: (fields: Record<string, string>) => void;
}

export function PersonForm({
  submissionId,
  role,
  title,
  initial,
  hideAddress,
  withRelationship,
  simple,
  hidePhone,
  blankPhoneOnSave,
  onSaved,
}: Props) {
  const [fields, setFields] = useState({
    name: initial?.name ?? "",
    nric: initial?.nric ?? "",
    address: initial?.address ?? "",
    poskod: initial?.poskod ?? "",
    state: initial?.state ?? "",
    phone: initial?.phone ?? "",
    race: initial?.race ?? "",
    bumi: initial?.bumi ?? "",
    marital_status: initial?.marital_status ?? "",
    job_position: initial?.job_position ?? "",
    employer: initial?.employer ?? "",
    office_address: initial?.office_address ?? "",
    office_phone: initial?.office_phone ?? "",
    email: initial?.email ?? "",
    relationship_to_hirer: initial?.relationship_to_hirer ?? "",
  });
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof typeof fields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function save() {
    const toSave = {
      ...fields,
      ...(blankPhoneOnSave ? { phone: "" } : {}),
    };
    startTransition(async () => {
      await savePerson(submissionId, role, toSave);
      onSaved?.(toSave);
    });
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-fg">{title}</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Name</label>
          <input className={FIELD} value={fields.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>IC / NRIC</label>
          <input className={FIELD} value={fields.nric} onChange={(e) => set("nric", e.target.value)} />
        </div>

        {!hideAddress && (
          <div className="col-span-2">
            <label className={LABEL}>Address</label>
            <textarea
              className={FIELD}
              rows={2}
              value={fields.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>
        )}

        {!hidePhone && (
          <div>
            <label className={LABEL}>Phone</label>
            <input
              className={FIELD}
              value={fields.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
        )}

        {!simple && (
          <>
            <div>
              <label className={LABEL}>Poskod</label>
              <input
                className={FIELD}
                value={fields.poskod}
                onChange={(e) => set("poskod", e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>State</label>
              <input className={FIELD} value={fields.state} onChange={(e) => set("state", e.target.value)} />
            </div>

            <div>
              <label className={LABEL}>Email</label>
              <input className={FIELD} value={fields.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Race</label>
              <input className={FIELD} value={fields.race} onChange={(e) => set("race", e.target.value)} />
            </div>

            <div>
              <label className={LABEL}>Bumi (1 / Non bumi -1)</label>
              <input className={FIELD} value={fields.bumi} onChange={(e) => set("bumi", e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Marital Status</label>
              <select
                className={FIELD}
                value={fields.marital_status}
                onChange={(e) => set("marital_status", e.target.value)}
              >
                <option value=""></option>
                <option value="SINGLE">SINGLE</option>
                <option value="MARRIED">MARRIED</option>
              </select>
            </div>

            <div>
              <label className={LABEL}>Job Position</label>
              <input
                className={FIELD}
                value={fields.job_position}
                onChange={(e) => set("job_position", e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Employer</label>
              <input
                className={FIELD}
                value={fields.employer}
                onChange={(e) => set("employer", e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL}>Office Phone</label>
              <input
                className={FIELD}
                value={fields.office_phone}
                onChange={(e) => set("office_phone", e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className={LABEL}>Office Address</label>
              <input
                className={FIELD}
                value={fields.office_address}
                onChange={(e) => set("office_address", e.target.value)}
              />
            </div>
          </>
        )}

        {withRelationship && (
          <div className="col-span-2">
            <label className={LABEL}>Relationship with hirer</label>
            <input
              className={FIELD}
              value={fields.relationship_to_hirer}
              onChange={(e) => set("relationship_to_hirer", e.target.value)}
            />
          </div>
        )}
      </div>

      <button
        onClick={save}
        disabled={isPending}
        className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save & Continue"}
      </button>
    </div>
  );
}
