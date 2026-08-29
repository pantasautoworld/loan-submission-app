"use client";

import { useEffect, useState } from "react";
import { compressImage } from "@/lib/compressImage";
import {
  deletePhoto,
  fetchPhoto,
  findById,
  refreshStockBoardVehicles,
  saveVehicle,
  setPhoto,
  type SaveVehicleInput,
  type StockBoardVehicle,
} from "@/lib/stockBoard";
import { malaysiaTodayIso } from "@/lib/timezone";

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber mb-3";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

const STATUS_OPTIONS: { value: StockBoardVehicle["status"]; label: string }[] = [
  { value: "prep", label: "Loan Submission" },
  { value: "available", label: "Available" },
  { value: "reserved", label: "Loan Approved" },
  { value: "sold", label: "Sold" },
];

interface Props {
  /** null = add a new car, a vehicle = edit it. */
  vehicle: StockBoardVehicle | null;
  staffNames: string[];
  actorName: string;
  onClose: () => void;
  onSaved: () => void;
}

export function CarModal({ vehicle, staffNames, actorName, onClose, onSaved }: Props) {
  const [vehicleText, setVehicleText] = useState(vehicle?.vehicle ?? "");
  const [vin, setVin] = useState(vehicle?.vin ?? "");
  const [price, setPrice] = useState(vehicle?.price ?? "");
  const [cost, setCost] = useState(vehicle?.cost ?? "");
  const [deposit, setDeposit] = useState(vehicle?.deposit ?? "");
  const [tahun, setTahun] = useState(vehicle?.tahun ?? "");
  const [status, setStatus] = useState<StockBoardVehicle["status"]>(vehicle?.status ?? "prep");
  const [notes, setNotes] = useState(vehicle?.notes ?? "");
  const [submittedBy, setSubmittedBy] = useState(vehicle?.submittedBy ?? "");
  const [submissionDate, setSubmissionDate] = useState(vehicle?.submissionDate ?? "");
  const [approvalDate, setApprovalDate] = useState(vehicle?.approvalDate ?? "");
  const [soldDate, setSoldDate] = useState(vehicle?.soldDate ?? "");

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(!!vehicle);
  const [pendingPhotoAction, setPendingPhotoAction] = useState<"set" | "remove" | null>(null);
  const [pendingPhotoData, setPendingPhotoData] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!vehicle) return;
    fetchPhoto(vehicle.id)
      .then(setPhotoUrl)
      .catch(() => setPhotoUrl(null))
      .finally(() => setPhotoLoading(false));
  }, [vehicle]);

  // The `vehicle` prop is a snapshot from the list's last poll (up to 8s stale, or
  // older still if this car changed - e.g. via the Telegram approval webhook - while
  // this modal happened to be open). Re-fetch the live record on open so Save can't
  // clobber a field someone else just changed with what this snapshot still shows.
  useEffect(() => {
    if (!vehicle) return;
    refreshStockBoardVehicles()
      .then((list) => {
        const fresh = findById(vehicle.id, list);
        if (!fresh) return;
        setVehicleText(fresh.vehicle);
        setVin(fresh.vin);
        setPrice(fresh.price);
        setCost(fresh.cost);
        setDeposit(fresh.deposit);
        setTahun(fresh.tahun);
        setStatus(fresh.status);
        setNotes(fresh.notes);
        setSubmittedBy(fresh.submittedBy ?? "");
        setSubmissionDate(fresh.submissionDate ?? "");
        setApprovalDate(fresh.approvalDate ?? "");
        setSoldDate(fresh.soldDate ?? "");
      })
      .catch(() => {}); // best-effort - fall back to the snapshot already shown
  }, [vehicle]);

  function handleStatusChange(next: StockBoardVehicle["status"]) {
    setStatus(next);
    if ((next === "prep" || next === "reserved" || next === "sold") && !submissionDate) {
      setSubmissionDate(malaysiaTodayIso());
    }
    if (next === "reserved" && !approvalDate) setApprovalDate(malaysiaTodayIso());
    if (next === "sold" && !soldDate) setSoldDate(malaysiaTodayIso());
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    try {
      const dataUrl = await compressImage(file);
      setPendingPhotoAction("set");
      setPendingPhotoData(dataUrl);
      setPhotoUrl(dataUrl);
    } catch {
      setPhotoError("Could not read that image, try another.");
    }
  }

  function handlePhotoRemove() {
    setPendingPhotoAction("remove");
    setPendingPhotoData(null);
    setPhotoUrl(null);
  }

  async function handleSave() {
    if (!vehicleText.trim()) {
      setError("Car (make, model, year) is required.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const input: SaveVehicleInput = {
        vehicle: vehicleText.trim(),
        vin: vin.trim(),
        price,
        cost,
        deposit,
        tahun,
        status,
        notes: notes.trim(),
      };
      if (status === "prep" || status === "reserved" || status === "sold") {
        input.submittedBy = submittedBy;
        input.submissionDate = submissionDate;
      }
      if (status === "reserved") input.approvalDate = approvalDate;
      if (status === "sold") input.soldDate = soldDate;

      const savedId = await saveVehicle(input, vehicle?.id ?? null, actorName);

      if (pendingPhotoAction === "set" && pendingPhotoData) {
        await setPhoto(savedId, pendingPhotoData).catch(() => {});
      } else if (pendingPhotoAction === "remove") {
        await deletePhoto(savedId).catch(() => {});
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save - try again.");
      setIsSaving(false);
    }
  }

  const submittedByOptions = submittedBy && !staffNames.includes(submittedBy)
    ? [submittedBy, ...staffNames]
    : staffNames;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
      <div className="max-h-[88vh] w-full max-w-[460px] overflow-y-auto rounded-[10px] border border-line bg-panel p-6">
        <h3 className="font-display mb-4 text-lg font-semibold text-fg">
          {vehicle ? "Edit car" : "Add car"}
        </h3>

        <div className="mb-4">
          <div className="mb-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-panel-raised">
            {photoLoading ? (
              <span className="text-xs text-muted">Loading…</span>
            ) : photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not a static asset
              <img src={photoUrl} alt="Car" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-muted">No photo yet</span>
            )}
          </div>
          <div className="flex gap-2">
            <label className="cursor-pointer rounded-[7px] border border-line bg-panel-raised px-3 py-1.5 text-sm text-fg hover:border-amber">
              Choose photo
              <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
            </label>
            {photoUrl && (
              <button
                type="button"
                onClick={handlePhotoRemove}
                className="rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:border-amber hover:text-fg"
              >
                Remove photo
              </button>
            )}
          </div>
          {photoError && <p className="mt-1 text-xs text-danger">{photoError}</p>}
        </div>

        <label className={LABEL}>No Plate</label>
        <input className={FIELD} value={vin} onChange={(e) => setVin(e.target.value)} />

        <label className={LABEL}>Car (Make, Model, Year)</label>
        <input
          className={FIELD}
          value={vehicleText}
          onChange={(e) => setVehicleText(e.target.value)}
          placeholder="e.g. 2022 Toyota Camry"
        />

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={LABEL}>ELK Loan Amount</label>
            <input type="number" className={FIELD} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Monthly Installment</label>
            <input type="number" className={FIELD} value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        </div>

        <label className={LABEL}>Deposit Required</label>
        <input type="number" className={FIELD} value={deposit} onChange={(e) => setDeposit(e.target.value)} />

        <label className={LABEL}>Tahun</label>
        <input type="number" className={FIELD} value={tahun} onChange={(e) => setTahun(e.target.value)} />

        <label className={LABEL}>Status</label>
        <select
          className={FIELD}
          value={status}
          onChange={(e) => handleStatusChange(e.target.value as StockBoardVehicle["status"])}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {(status === "prep" || status === "reserved" || status === "sold") && (
          <>
            <label className={LABEL}>Submitted by</label>
            <select className={FIELD} value={submittedBy} onChange={(e) => setSubmittedBy(e.target.value)}>
              <option value="">Select staff…</option>
              {submittedByOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <label className={LABEL}>Submission date</label>
            <input
              type="date"
              className={FIELD}
              value={submissionDate}
              onChange={(e) => setSubmissionDate(e.target.value)}
            />
          </>
        )}

        {status === "reserved" && (
          <>
            <label className={LABEL}>Approval date</label>
            <input
              type="date"
              className={FIELD}
              value={approvalDate}
              onChange={(e) => setApprovalDate(e.target.value)}
            />
          </>
        )}

        {status === "sold" && (
          <>
            <label className={LABEL}>Sold date</label>
            <input type="date" className={FIELD} value={soldDate} onChange={(e) => setSoldDate(e.target.value)} />
          </>
        )}

        <label className={LABEL}>Notes</label>
        <textarea
          className={FIELD}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        <div className="mt-2 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[7px] border border-line bg-panel-raised px-4 py-2 text-sm text-fg hover:border-amber"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
