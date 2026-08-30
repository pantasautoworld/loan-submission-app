"use client";

import { useState } from "react";
import { logPuspakomBooking } from "@/app/puspakom/actions";
import { malaysiaTodayIso } from "@/lib/timezone";
import { PUSPAKOM_TYPES, type PuspakomType } from "@/lib/puspakomBookings";
import type { StockBoardVehicle } from "@/lib/stockBoard";

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber mb-3";
const FIELD_NO_MB =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

interface Props {
  vehicles: StockBoardVehicle[];
  onClose: () => void;
  onSaved: () => void;
}

export function AddPuspakomModal({ vehicles, onClose, onSaved }: Props) {
  const [plate, setPlate] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [branch, setBranch] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(malaysiaTodayIso());
  const [inspectionType, setInspectionType] = useState<PuspakomType | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function handleSelectPlate(v: StockBoardVehicle) {
    setPlate(v.vin);
    setShowSuggestions(false);
  }

  const plateQuery = plate.trim().toLowerCase();
  const suggestions = plateQuery
    ? vehicles.filter((v) => v.vin.toLowerCase().includes(plateQuery))
    : vehicles;

  async function handleSave() {
    if (!plate.trim()) {
      setError("Enter a plate number.");
      return;
    }
    if (!appointmentDate) {
      setError("Pick an appointment date.");
      return;
    }
    if (!inspectionType) {
      setError("Select an inspection type.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("plate", plate.trim());
      formData.set("branch", branch.trim());
      formData.set("appointmentDate", appointmentDate);
      formData.set("inspectionType", inspectionType);
      await logPuspakomBooking(formData);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save - try again.");
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
      <div className="w-full max-w-[420px] rounded-[10px] border border-line bg-panel p-6">
        <h3 className="font-display mb-4 text-lg font-semibold text-fg">Add Puspakom booking</h3>

        <label className={LABEL}>No Plate</label>
        <div className="relative mb-3">
          <input
            className={FIELD_NO_MB}
            value={plate}
            onChange={(e) => {
              setPlate(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="e.g. VAJ7259"
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[7px] border border-line bg-panel-raised shadow-lg">
              {suggestions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectPlate(v)}
                  className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-panel"
                >
                  <span className="font-mono font-semibold text-fg">{v.vin}</span>
                  <span className="ml-2 text-xs text-muted">{v.vehicle}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <label className={LABEL}>Inspection type</label>
        <select
          className={FIELD}
          value={inspectionType}
          onChange={(e) => setInspectionType(e.target.value as PuspakomType | "")}
        >
          <option value="">Select type…</option>
          {PUSPAKOM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className={LABEL}>Puspakom branch</label>
        <input
          className={FIELD}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="Optional"
        />

        <label className={LABEL}>Appointment date</label>
        <input
          type="date"
          className={FIELD}
          value={appointmentDate}
          onChange={(e) => setAppointmentDate(e.target.value)}
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
