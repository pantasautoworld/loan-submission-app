"use client";

import { useState } from "react";
import { editPuspakomBooking } from "@/app/puspakom/actions";
import type { PuspakomBookingRow } from "@/lib/puspakomBookings";

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber mb-3";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

interface Props {
  booking: PuspakomBookingRow;
  onClose: () => void;
  onSaved: () => void;
}

export function EditPuspakomModal({ booking, onClose, onSaved }: Props) {
  const [branch, setBranch] = useState(booking.branch);
  const [company, setCompany] = useState(booking.company);
  const [appointmentDate, setAppointmentDate] = useState(booking.appointment_date);
  const [appointmentTime, setAppointmentTime] = useState(booking.appointment_time?.slice(0, 5) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!appointmentDate) {
      setError("Pick an appointment date.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("branch", branch.trim());
      formData.set("company", company.trim());
      formData.set("appointmentDate", appointmentDate);
      formData.set("appointmentTime", appointmentTime);
      await editPuspakomBooking(booking.id, formData);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save - try again.");
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5" onClick={onClose}>
      <div
        className="w-full max-w-[420px] rounded-[10px] border border-line bg-panel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display mb-4 text-lg font-semibold text-fg">Edit booking</h3>

        <div className="mb-3 inline-flex items-center rounded-md border-2 border-[#1a1d21] bg-[#f2f1ec] px-3 py-0.5 font-mono text-sm font-bold tracking-wide text-[#14171a]">
          {booking.no_plate}
        </div>

        <label className={LABEL}>Company</label>
        <input
          className={FIELD}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="e.g. ELK-DESA"
        />

        <label className={LABEL}>Puspakom branch</label>
        <input
          className={FIELD}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="Optional"
        />

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
