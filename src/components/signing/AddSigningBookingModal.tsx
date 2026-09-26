"use client";

import { useState } from "react";
import { logSigningBooking } from "@/app/signing/actions";
import { findLatestClaimInvoiceByPlate } from "@/lib/signingBookings";
import { createClient } from "@/lib/supabase/client";
import { malaysiaTodayIso } from "@/lib/timezone";
import type { StockBoardVehicle } from "@/lib/stockBoard";

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber mb-3";
const FIELD_NO_MB =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

interface Props {
  vehicles: StockBoardVehicle[];
  runners: { id: string; full_name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

export function AddSigningBookingModal({ vehicles, runners, onClose, onSaved }: Props) {
  const [plate, setPlate] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [claimInvoiceId, setClaimInvoiceId] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [financier, setFinancier] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [tenureMonths, setTenureMonths] = useState("");
  const [monthlyInstallment, setMonthlyInstallment] = useState("");
  const [retentionAmount, setRetentionAmount] = useState("0");
  const [appointmentDate, setAppointmentDate] = useState(malaysiaTodayIso());
  const [appointmentTime, setAppointmentTime] = useState("");
  const [runnerId, setRunnerId] = useState("");
  const [autoFillNotice, setAutoFillNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const matched = vehicles.find((v) => v.vin.toLowerCase() === plate.trim().toLowerCase());
  const plateQuery = plate.trim().toLowerCase();
  const suggestions = plateQuery
    ? vehicles.filter((v) => v.vin.toLowerCase().includes(plateQuery))
    : vehicles;

  async function handleSelectPlate(v: StockBoardVehicle) {
    setPlate(v.vin);
    setShowSuggestions(false);
    try {
      const supabase = createClient();
      const match = await findLatestClaimInvoiceByPlate(supabase, v.vin);
      if (match) {
        setClaimInvoiceId(match.claimInvoiceId);
        setBuyerName(match.buyerName);
        setFinancier(match.financier);
        setLoanAmount(match.loanAmount ? String(match.loanAmount) : "");
        setAutoFillNotice("Auto-filled from that plate's claim invoice.");
      } else {
        setClaimInvoiceId(null);
        setAutoFillNotice("No claim invoice found for this plate - fill in manually.");
      }
    } catch {
      setAutoFillNotice(null);
    }
  }

  async function handleSave() {
    if (!matched) {
      setError("Pick a car from the list.");
      return;
    }
    if (!appointmentDate) {
      setError("Pick an appointment date.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("stockBoardVehicleId", matched.id);
      formData.set("noPlate", matched.vin);
      formData.set("vehicle", matched.vehicle);
      if (claimInvoiceId) formData.set("claimInvoiceId", claimInvoiceId);
      formData.set("buyerName", buyerName);
      formData.set("financier", financier);
      formData.set("loanAmount", loanAmount);
      formData.set("interestRate", interestRate);
      formData.set("tenureMonths", tenureMonths);
      formData.set("monthlyInstallment", monthlyInstallment);
      formData.set("retentionAmount", retentionAmount);
      formData.set("appointmentDate", appointmentDate);
      formData.set("appointmentTime", appointmentTime);
      const runner = runners.find((r) => r.id === runnerId);
      formData.set("runnerId", runnerId);
      formData.set("runnerName", runner?.full_name ?? "");
      await logSigningBooking(formData);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save - try again.");
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
      <div className="max-h-[90vh] w-full max-w-[440px] overflow-y-auto rounded-[10px] border border-line bg-panel p-6">
        <h3 className="font-display mb-4 text-lg font-semibold text-fg">Add signing booking</h3>

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
        {autoFillNotice && <p className="mb-3 text-xs text-muted">{autoFillNotice}</p>}

        <label className={LABEL}>Buyer Name</label>
        <input className={FIELD} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />

        <label className={LABEL}>Financier</label>
        <input className={FIELD} value={financier} onChange={(e) => setFinancier(e.target.value)} />

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={LABEL}>Loan Amount (RM)</label>
            <input className={FIELD} value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Interest Rate (%)</label>
            <input className={FIELD} value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Tenure (months)</label>
            <input className={FIELD} value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Monthly Installment (RM)</label>
            <input
              className={FIELD}
              value={monthlyInstallment}
              onChange={(e) => setMonthlyInstallment(e.target.value)}
            />
          </div>
        </div>
        <label className={LABEL}>Retention (RM)</label>
        <input className={FIELD} value={retentionAmount} onChange={(e) => setRetentionAmount(e.target.value)} />

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={LABEL}>Appointment date</label>
            <input
              type="date"
              className={FIELD}
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Time</label>
            <input
              type="time"
              className={FIELD}
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
            />
          </div>
        </div>

        <label className={LABEL}>Runner (brings the car for inspection)</label>
        <select className={FIELD} value={runnerId} onChange={(e) => setRunnerId(e.target.value)}>
          <option value="">Unassigned</option>
          {runners.map((r) => (
            <option key={r.id} value={r.id}>
              {r.full_name}
            </option>
          ))}
        </select>

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
