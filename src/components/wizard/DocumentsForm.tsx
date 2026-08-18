"use client";

import { useEffect, useMemo, useState } from "react";
import {
  recordDocument,
  removeDocument,
  savePerson,
  updateVehiclePartial,
} from "@/app/submissions/[id]/edit/actions";
import { uploadSubmissionFile } from "@/lib/storage";
import { UploadBox } from "@/components/UploadBox";
import {
  fetchStockBoardVehicles,
  findByPlate,
  splitVehicleYearAndModel,
  type StockBoardVehicle,
} from "@/lib/stockBoard";
import type { DocType, DocumentRow, PersonRole } from "@/lib/types";

interface VehicleFields {
  no_plate: string;
  stock_board_vehicle_id: string | null;
  model: string;
  year_made: number | null;
  finance_loan: number | null;
  tenure_year: number | null;
}

interface Props {
  submissionId: string;
  documents: DocumentRow[];
  showGuarantor2: boolean;
  onToggleGuarantor2: (enabled: boolean) => void;
  noPlate?: string;
  hirerPhone?: string;
  guarantor1Relationship?: string;
  guarantor2Relationship?: string;
  /** Current saved name/NRIC per role - used to show a persistent warning (not just a
   * one-time toast) whenever an IC is uploaded but the name or NRIC still ended up
   * blank, however that happened. */
  hirerName?: string;
  hirerNric?: string;
  guarantor1Name?: string;
  guarantor1Nric?: string;
  guarantor2Name?: string;
  guarantor2Nric?: string;
  /** Called after IC/bill OCR updates a person's fields, so the wizard's in-memory data stays in sync. */
  onPersonExtracted: (role: PersonRole, fields: Record<string, string>) => void;
  /** Called after the VOC scan detects/matches a plate, so the Vehicle tab stays in sync. */
  onVehicleExtracted: (fields: Partial<VehicleFields>) => void;
}

// doc types that trigger OCR extraction when uploaded here, and which person role they update
const IC_ROLES: Partial<Record<DocType, PersonRole>> = {
  hirer_ic: "hirer",
  guarantor1_ic: "guarantor1",
  guarantor2_ic: "guarantor2",
};

// where staff should go to key in Name/NRIC manually if the scan can't read it
const IC_TAB_LABELS: Partial<Record<DocType, string>> = {
  hirer_ic: "Hirer Info",
  guarantor1_ic: "Guarantor Info",
  guarantor2_ic: "Guarantor 2",
};

const RELATIONSHIP_OPTIONS = [
  "BROTHER IN LAW",
  "BROTHER",
  "SISTER",
  "SISTER IN LAW",
  "MOTHER IN LAW",
  "MOTHER",
  "FATHER",
  "FATHER IN LAW",
  "WIFE",
  "HUSBAND",
  "COUSIN",
  "GRANDFATHER",
  "GRANDMOTHER",
  "FIANCE",
  "FRIEND",
  "COLLEAGUE",
  "AUNTY",
  "UNCLE",
  "NIECE",
  "NEPHEW",
  "SON IN LAW",
  "DAUGHTER IN LAW",
  "SON",
  "DAUGHTER",
  "RELATIVE",
  "EMPLOYEE",
  "EMPLOYER",
  "STEP FATHER",
  "STEP MOTHER",
  "STEP SISTER",
  "STEP BROTHER",
];

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

export function DocumentsForm({
  submissionId,
  documents,
  showGuarantor2,
  onToggleGuarantor2,
  noPlate,
  hirerPhone,
  guarantor1Relationship,
  guarantor2Relationship,
  hirerName,
  hirerNric,
  guarantor1Name,
  guarantor1Nric,
  guarantor2Name,
  guarantor2Nric,
  onPersonExtracted,
  onVehicleExtracted,
}: Props) {
  const [uploaded, setUploaded] = useState<Set<DocType>>(
    new Set(documents.map((d) => d.doc_type))
  );
  const [busy, setBusy] = useState<DocType | null>(null);
  const [scanError, setScanError] = useState<Partial<Record<DocType, string>>>({});
  const [vocNotice, setVocNotice] = useState<string | null>(null);

  const [hirerPhoneValue, setHirerPhoneValue] = useState(hirerPhone ?? "");
  const [guarantor1RelValue, setGuarantor1RelValue] = useState(guarantor1Relationship ?? "");
  const [guarantor2RelValue, setGuarantor2RelValue] = useState(guarantor2Relationship ?? "");

  const [plateValue, setPlateValue] = useState(noPlate ?? "");
  const [boardVehicles, setBoardVehicles] = useState<StockBoardVehicle[]>([]);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);

  useEffect(() => {
    fetchStockBoardVehicles()
      .then(setBoardVehicles)
      .catch((err) => setBoardError(err instanceof Error ? err.message : "Failed to load Stock Board"))
      .finally(() => setBoardLoading(false));
  }, []);

  const plateMatch = useMemo(() => findByPlate(plateValue, boardVehicles), [plateValue, boardVehicles]);

  async function savePersonField(role: PersonRole, field: string, value: string) {
    await savePerson(submissionId, role, { [field]: value });
    onPersonExtracted(role, { [field]: value });
  }

  async function savePlate() {
    const plate = plateValue.trim().toUpperCase();
    await updateVehiclePartial(submissionId, { no_plate: plate });
    onVehicleExtracted({ no_plate: plate });
  }

  async function applyStockBoardMatch() {
    if (!plateMatch) return;
    const { yearMade, model } = splitVehicleYearAndModel(plateMatch.vehicle);
    const vehicleFields: Partial<VehicleFields> = {
      no_plate: plateValue.trim().toUpperCase(),
      stock_board_vehicle_id: plateMatch.id,
      model,
      year_made: yearMade,
      finance_loan: plateMatch.price ? Number(plateMatch.price) : null,
      tenure_year: plateMatch.tahun ? Number(plateMatch.tahun) : null,
    };
    await updateVehiclePartial(submissionId, vehicleFields);
    onVehicleExtracted(vehicleFields);
    setVocNotice(`Matched Stock Board: ${plateMatch.vehicle}.`);
  }

  async function handleUpload(docType: DocType, file: File) {
    setBusy(docType);
    setScanError((e) => ({ ...e, [docType]: undefined }));
    try {
      const path = await uploadSubmissionFile(submissionId, docType, file);
      await recordDocument(submissionId, docType, path);
      setUploaded((s) => new Set(s).add(docType));

      const icRole = IC_ROLES[docType];
      if (icRole) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/extract/ic", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Scan failed");
        const fields: Record<string, string> = {};
        if (data.name) fields.name = data.name;
        if (data.nric) fields.nric = data.nric;
        if (Object.keys(fields).length > 0) {
          await savePerson(submissionId, icRole, fields);
          onPersonExtracted(icRole, fields);
        }
        const tabLabel = IC_TAB_LABELS[docType] ?? "Hirer/Guarantor Info";
        if (!data.name && !data.nric) {
          setScanError((e) => ({
            ...e,
            [docType]: `Could not read the IC - please key in Name & NRIC manually at ${tabLabel}.`,
          }));
        } else if (!data.nric) {
          setScanError((e) => ({
            ...e,
            [docType]: `Could not read the NRIC clearly - please key it in manually at ${tabLabel}.`,
          }));
        } else if (!data.name) {
          setScanError((e) => ({
            ...e,
            [docType]: `Could not read the Name clearly - please key it in manually at ${tabLabel}.`,
          }));
        }
      } else if (docType === "tnb_bill") {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/extract/bill", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Scan failed");
        if (data.address) {
          await savePerson(submissionId, "hirer", { address: data.address });
          onPersonExtracted("hirer", { address: data.address });
        }
      } else if (docType === "car_voc") {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/extract/voc", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Scan failed");
        const plateNo = (data.plateNo || "").trim().toUpperCase();
        if (plateNo) {
          setPlateValue(plateNo);
          const vehicleFields: Partial<VehicleFields> = { no_plate: plateNo };
          try {
            const freshBoardVehicles = await fetchStockBoardVehicles();
            const match = findByPlate(plateNo, freshBoardVehicles);
            if (match) {
              const { yearMade, model } = splitVehicleYearAndModel(match.vehicle);
              vehicleFields.stock_board_vehicle_id = match.id;
              vehicleFields.model = model;
              if (yearMade) vehicleFields.year_made = yearMade;
              if (match.price) vehicleFields.finance_loan = Number(match.price);
              if (match.tahun) vehicleFields.tenure_year = Number(match.tahun);
              setVocNotice(`Detected plate ${plateNo} - matched on Stock Board.`);
            } else {
              setVocNotice(`Detected plate ${plateNo} - no Stock Board match, fill the rest manually.`);
            }
          } catch {
            setVocNotice(`Detected plate ${plateNo} (Stock Board lookup failed).`);
          }
          await updateVehiclePartial(submissionId, vehicleFields);
          onVehicleExtracted(vehicleFields);
        } else {
          setVocNotice("Could not confidently read the plate - please enter No Plate manually.");
        }
      }
    } catch (err) {
      setScanError((e) => ({
        ...e,
        [docType]: err instanceof Error ? err.message : "Scan failed",
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
      if (docType === "car_voc") setVocNotice(null);
    } catch (err) {
      setScanError((e) => ({
        ...e,
        [docType]: err instanceof Error ? err.message : "Delete failed",
      }));
    } finally {
      setBusy(null);
    }
  }

  const NAME_BY_ROLE: Partial<Record<PersonRole, string | undefined>> = {
    hirer: hirerName,
    guarantor1: guarantor1Name,
    guarantor2: guarantor2Name,
  };
  const NRIC_BY_ROLE: Partial<Record<PersonRole, string | undefined>> = {
    hirer: hirerNric,
    guarantor1: guarantor1Nric,
    guarantor2: guarantor2Nric,
  };

  /**
   * Derived from the actual saved person data rather than the one-time upload
   * response, so this keeps showing (surviving re-renders, navigating away and
   * back, etc.) for as long as an IC is uploaded but its name/NRIC is still
   * blank - not just in the instant right after the scan runs.
   */
  function persistentIcWarning(docType: DocType): string | null {
    const role = IC_ROLES[docType];
    if (!role || !uploaded.has(docType)) return null;
    const name = (NAME_BY_ROLE[role] ?? "").trim();
    const nric = (NRIC_BY_ROLE[role] ?? "").trim();
    const tabLabel = IC_TAB_LABELS[docType] ?? "Hirer/Guarantor Info";
    if (!name && !nric) return `Name & NRIC still missing - please key them in manually at ${tabLabel}.`;
    if (!nric) return `NRIC still missing - please key it in manually at ${tabLabel}.`;
    if (!name) return `Name still missing - please key it in manually at ${tabLabel}.`;
    return null;
  }

  function box(docType: DocType, label: string, opts?: { required?: boolean; hint?: string }) {
    const warning = scanError[docType] ?? persistentIcWarning(docType);
    return (
      <div>
        <UploadBox
          label={label}
          required={opts?.required}
          hint={opts?.hint}
          uploaded={uploaded.has(docType)}
          busy={busy === docType}
          accept="image/*,application/pdf"
          onSelect={(file) => handleUpload(docType, file)}
          onDelete={() => handleDelete(docType)}
        />
        {warning && <p className="mt-1 text-xs text-danger">{warning}</p>}
        {docType === "car_voc" && vocNotice && (
          <p className="mt-1 text-xs text-muted">{vocNotice}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-fg">Attachments</h3>
        <p className="text-sm text-muted">
          Uploading the Car VOC auto-fills No Plate (and Car Model/Finance Loan/Tenure if it
          matches the Stock Board). An IC photo auto-fills that person&apos;s Name/NRIC; the TNB
          bill auto-fills the Hirer&apos;s Address.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showGuarantor2}
          onChange={(e) => onToggleGuarantor2(e.target.checked)}
        />
        This submission has a 2nd guarantor
      </label>

      <div className="rounded-[10px] border border-line bg-panel-raised/40 p-4 space-y-3">
        {box("car_voc", "Car VOC", { required: true, hint: "auto-fills No Plate" })}

        <div className="border-t border-line pt-3">
          <label className={LABEL}>Detected No Plate</label>
          <div className="flex gap-2">
            <input
              className={FIELD}
              value={plateValue}
              onChange={(e) => setPlateValue(e.target.value)}
              onBlur={savePlate}
              placeholder="Not detected - type manually"
            />
            <button
              type="button"
              disabled={!plateMatch}
              onClick={applyStockBoardMatch}
              className="whitespace-nowrap rounded-[7px] border border-line px-3 py-1.5 text-sm text-fg hover:border-amber disabled:opacity-40"
            >
              {plateMatch ? "Find at Stock Board" : boardLoading ? "Loading Stock Board…" : "No match"}
            </button>
          </div>
          {boardError && <p className="mt-1 text-xs text-danger">Stock Board: {boardError}</p>}
          {plateMatch && (
            <p className="mt-1 text-xs text-muted">
              Stock Board: {plateMatch.vehicle} · Finance RM{plateMatch.price} · {plateMatch.tahun}yr ·{" "}
              <span className="capitalize">{plateMatch.status}</span>
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4 rounded-[10px] border border-line bg-panel-raised/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Hirer</p>
          {box("hirer_ic", "Hirer IC", { required: true, hint: "auto-fills Name/NRIC" })}
          {box("hirer_ic_back", "Hirer IC (Back)", { hint: "if have" })}
          {box("hirer_license", "Hirer License Front", { hint: "if have" })}
          {box("hirer_license_back", "Hirer License Back", { hint: "if have" })}
        </div>
        <div className="space-y-4 rounded-[10px] border border-line bg-panel-raised/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Guarantor
          </p>
          {box("guarantor1_ic", "Guarantor 1 IC", { required: true, hint: "auto-fills Name/NRIC" })}
          {box("guarantor1_ic_back", "Guarantor 1 IC (Back)", { hint: "if have" })}
          {box("guarantor1_license", "Guarantor 1 License Front", { hint: "if have" })}
          {box("guarantor1_license_back", "Guarantor 1 License Back", { hint: "if have" })}
          {showGuarantor2 && (
            <>
              {box("guarantor2_ic", "Guarantor 2 IC", { required: true, hint: "if have" })}
              {box("guarantor2_ic_back", "Guarantor 2 IC (Back)", { hint: "if have" })}
              {box("guarantor2_license", "Guarantor 2 License Front", { hint: "if have" })}
              {box("guarantor2_license_back", "Guarantor 2 License Back", { hint: "if have" })}
            </>
          )}
        </div>
      </div>

      <div className="rounded-[10px] border border-line bg-panel-raised/40 p-4 space-y-4">
        {box("tnb_bill", "TNB / Electricity Bill", { required: true, hint: "auto-fills Hirer Address" })}

        <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Hirer Phone</label>
            <input
              className={FIELD}
              value={hirerPhoneValue}
              onChange={(e) => setHirerPhoneValue(e.target.value)}
              onBlur={() => savePersonField("hirer", "phone", hirerPhoneValue)}
            />
          </div>
          <div>
            <label className={LABEL}>Guarantor 1 Relationship with hirer</label>
            <input
              className={FIELD}
              value={guarantor1RelValue}
              onChange={(e) => setGuarantor1RelValue(e.target.value)}
              onBlur={() =>
                savePersonField("guarantor1", "relationship_to_hirer", guarantor1RelValue)
              }
              list="relationship-options"
              placeholder="Type to search…"
            />
          </div>
          {showGuarantor2 && (
            <div>
              <label className={LABEL}>Guarantor 2 Relationship with hirer</label>
              <input
                className={FIELD}
                value={guarantor2RelValue}
                onChange={(e) => setGuarantor2RelValue(e.target.value)}
                onBlur={() =>
                  savePersonField("guarantor2", "relationship_to_hirer", guarantor2RelValue)
                }
                list="relationship-options"
                placeholder="Type to search…"
              />
            </div>
          )}
        </div>
      </div>

      <datalist id="relationship-options">
        {RELATIONSHIP_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}
