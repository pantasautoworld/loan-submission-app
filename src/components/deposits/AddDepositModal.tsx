"use client";

import { useState } from "react";
import { logDepositPaymentByPlate } from "@/app/deposits/actions";
import { DEPOSIT_METHODS, type DepositMethod } from "@/lib/depositPayments";
import { malaysiaTodayIso } from "@/lib/timezone";
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

/** The standalone "+ Add deposit" entry point - staff type the plate directly, looked up server-side. */
export function AddDepositModal({ vehicles, onClose, onSaved }: Props) {
  const [plate, setPlate] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [note, setNote] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [method, setMethod] = useState<DepositMethod | "">("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(malaysiaTodayIso());
  const [file, setFile] = useState<File | null>(null);
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
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!method) {
      setError("Select a deposit method.");
      return;
    }
    if (!paymentDate) {
      setError("Pick the payment date.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("plate", plate.trim());
      formData.set("note", note.trim());
      formData.set("receiptNumber", receiptNumber.trim());
      formData.set("method", method);
      formData.set("amount", amount);
      formData.set("paymentDate", paymentDate);
      if (file) formData.set("receipt", file);
      await logDepositPaymentByPlate(formData);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save - try again.");
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
      <div className="w-full max-w-[420px] rounded-[10px] border border-line bg-panel p-6">
        <h3 className="font-display mb-4 text-lg font-semibold text-fg">Add deposit</h3>

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

        <label className={LABEL}>Deposit method</label>
        <select
          className={FIELD}
          value={method}
          onChange={(e) => setMethod(e.target.value as DepositMethod | "")}
        >
          <option value="">Select method…</option>
          {DEPOSIT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={LABEL}>Amount (RM)</label>
            <input
              type="number"
              className={FIELD}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Payment date</label>
            <input
              type="date"
              className={FIELD}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
        </div>

        <label className={LABEL}>Receipt (if have)</label>
        <div className="mb-3">
          <div className="flex gap-2">
            <label className="flex flex-1 cursor-pointer items-center justify-center rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg hover:border-amber">
              📷 Take photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex flex-1 cursor-pointer items-center justify-center rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg hover:border-amber">
              Choose file
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {file && <p className="mt-1.5 truncate text-xs text-muted">Selected: {file.name}</p>}
        </div>

        <label className={LABEL}>Receipt No. (if have)</label>
        <input
          className={FIELD}
          value={receiptNumber}
          onChange={(e) => setReceiptNumber(e.target.value)}
        />

        <label className={LABEL}>Note</label>
        <textarea
          className={FIELD}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
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
