"use client";

import { useState } from "react";
import { logDepositPaymentByPlate } from "@/app/deposits/actions";
import { DEPOSIT_METHODS, type DepositMethod } from "@/lib/depositPayments";

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber mb-3";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

/** The standalone "+ Add deposit" entry point - staff type the plate directly, looked up server-side. */
export function AddDepositModal({ onClose, onSaved }: Props) {
  const [plate, setPlate] = useState("");
  const [note, setNote] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [method, setMethod] = useState<DepositMethod | "">("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
    setError(null);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("plate", plate.trim());
      formData.set("note", note.trim());
      formData.set("receiptNumber", receiptNumber.trim());
      formData.set("method", method);
      formData.set("amount", amount);
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
        <input
          className={FIELD}
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          placeholder="e.g. VAJ7259"
        />

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

        <label className={LABEL}>Amount (RM)</label>
        <input
          type="number"
          className={FIELD}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <label className={LABEL}>Receipt (if have)</label>
        <input
          type="file"
          accept="image/*,.pdf"
          className={FIELD}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

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
