"use client";

import { useState } from "react";
import { createReconTask } from "@/app/recon/actions";
import { CONDITION_TYPES, RECON_LOCATIONS, type TaskKind } from "@/lib/recon";
import type { StockBoardVehicle } from "@/lib/stockBoard";

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber mb-3";
const FIELD_NO_MB =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

interface Props {
  vehicles: StockBoardVehicle[];
  /** Omit when the caller is a runner adding their own task - runner_id gets forced server-side either way. */
  runners?: { id: string; full_name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

export function AddReconTaskModal({ vehicles, runners, onClose, onSaved }: Props) {
  const [plate, setPlate] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [taskKind, setTaskKind] = useState<TaskKind>("condition");
  const [conditionType, setConditionType] = useState<string>(CONDITION_TYPES[0]);
  const [location, setLocation] = useState<string>(RECON_LOCATIONS[0]);
  const [runnerId, setRunnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const plateQuery = plate.trim().toLowerCase();
  const suggestions = plateQuery
    ? vehicles.filter((v) => v.vin.toLowerCase().includes(plateQuery))
    : vehicles;
  const matched = vehicles.find((v) => v.vin.toLowerCase() === plate.trim().toLowerCase());

  async function handleSave() {
    if (!matched) {
      setError("Pick a car from the list.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("stockBoardVehicleId", matched.id);
      formData.set("noPlate", matched.vin);
      formData.set("vehicle", matched.vehicle);
      formData.set("taskKind", taskKind);
      if (taskKind === "condition") {
        formData.set("conditionType", conditionType);
      } else {
        formData.set("location", location);
      }
      if (runners) {
        const runner = runners.find((r) => r.id === runnerId);
        formData.set("runnerId", runnerId);
        formData.set("runnerName", runner?.full_name ?? "");
      }
      formData.set("dueDate", dueDate);
      formData.set("remark", remark);
      await createReconTask(formData);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save - try again.");
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
      <div className="w-full max-w-[420px] rounded-[10px] border border-line bg-panel p-6">
        <h3 className="font-display mb-4 text-lg font-semibold text-fg">Add task</h3>

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
                  onClick={() => {
                    setPlate(v.vin);
                    setShowSuggestions(false);
                  }}
                  className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-panel"
                >
                  <span className="font-mono font-semibold text-fg">{v.vin}</span>
                  <span className="ml-2 text-xs text-muted">{v.vehicle}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <label className={LABEL}>Task type</label>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setTaskKind("condition")}
            className={`flex-1 rounded-[7px] border px-3 py-1.5 text-sm ${
              taskKind === "condition" ? "border-amber bg-amber-dim/30 text-amber" : "border-line text-muted"
            }`}
          >
            Condition work
          </button>
          <button
            type="button"
            onClick={() => setTaskKind("transport_to")}
            className={`flex-1 rounded-[7px] border px-3 py-1.5 text-sm ${
              taskKind !== "condition" ? "border-amber bg-amber-dim/30 text-amber" : "border-line text-muted"
            }`}
          >
            Transport
          </button>
        </div>

        {taskKind === "condition" ? (
          <>
            <label className={LABEL}>Condition</label>
            <select className={FIELD} value={conditionType} onChange={(e) => setConditionType(e.target.value)}>
              {CONDITION_TYPES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label className={LABEL}>Direction</label>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setTaskKind("transport_to")}
                className={`flex-1 rounded-[7px] border px-3 py-1.5 text-sm ${
                  taskKind === "transport_to" ? "border-amber bg-amber-dim/30 text-amber" : "border-line text-muted"
                }`}
              >
                Send to
              </button>
              <button
                type="button"
                onClick={() => setTaskKind("transport_from")}
                className={`flex-1 rounded-[7px] border px-3 py-1.5 text-sm ${
                  taskKind === "transport_from" ? "border-amber bg-amber-dim/30 text-amber" : "border-line text-muted"
                }`}
              >
                Return from
              </button>
            </div>
            <label className={LABEL}>Location</label>
            <select className={FIELD} value={location} onChange={(e) => setLocation(e.target.value)}>
              {RECON_LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </>
        )}

        {runners && (
          <>
            <label className={LABEL}>Runner</label>
            <select className={FIELD} value={runnerId} onChange={(e) => setRunnerId(e.target.value)}>
              <option value="">Unassigned</option>
              {runners.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </>
        )}

        <label className={LABEL}>Due date (optional - leave blank for &quot;whenever free&quot;)</label>
        <input
          type="date"
          className={FIELD}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />

        <label className={LABEL}>Remark</label>
        <textarea
          className={FIELD}
          rows={2}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="Optional note"
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
