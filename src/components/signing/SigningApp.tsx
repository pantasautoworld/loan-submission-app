"use client";

import { useMemo, useState } from "react";
import type { StockBoardVehicle } from "@/lib/stockBoard";
import type { SigningBookingRow } from "@/lib/signingBookings";
import { assignSigningRunner, removeSigningBooking } from "@/app/signing/actions";
import { malaysiaDateParts, malaysiaTodayIso } from "@/lib/timezone";
import { AddSigningBookingModal } from "./AddSigningBookingModal";

interface Props {
  vehicles: StockBoardVehicle[];
  bookings: SigningBookingRow[];
  runners: { id: string; full_name: string }[];
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthGrid(year: number, month: number): (string | null)[][] {
  const startWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function fmtMoney(n: number | null): string {
  if (n === null || n === undefined) return "-";
  return `RM${n.toLocaleString()}`;
}

export function SigningApp({ vehicles, bookings, runners }: Props) {
  const { year: todayYear, month: todayMonth } = malaysiaDateParts();
  const todayIso = malaysiaTodayIso();

  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<SigningBookingRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, SigningBookingRow[]>();
    for (const b of bookings) {
      const list = map.get(b.appointment_date) ?? [];
      list.push(b);
      map.set(b.appointment_date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.appointment_time ?? "99:99").localeCompare(b.appointment_time ?? "99:99"));
    }
    return map;
  }, [bookings]);

  const weeks = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthLabel = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  function goToMonth(delta: number) {
    const d = new Date(Date.UTC(viewYear, viewMonth - 1 + delta, 1));
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth() + 1);
  }

  async function handleReassign(booking: SigningBookingRow, runnerId: string) {
    setBusyId(booking.id);
    try {
      const runner = runners.find((r) => r.id === runnerId);
      await assignSigningRunner(booking.id, runnerId, runner?.full_name ?? "");
      setSelected((s) => (s ? { ...s, runner_id: runnerId || null, runner_name: runner?.full_name ?? "" } : s));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not reassign - try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(booking: SigningBookingRow) {
    if (!confirm(`Delete this signing booking for ${booking.no_plate}?`)) return;
    setBusyId(booking.id);
    try {
      await removeSigningBooking(booking.id);
      setSelected(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete - try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToMonth(-1)}
            className="rounded-[7px] border border-line bg-panel-raised px-3 py-1.5 text-sm text-fg hover:border-amber"
          >
            ←
          </button>
          <h2 className="font-display min-w-[170px] text-center text-lg font-semibold text-fg">{monthLabel}</h2>
          <button
            onClick={() => goToMonth(1)}
            className="rounded-[7px] border border-line bg-panel-raised px-3 py-1.5 text-sm text-fg hover:border-amber"
          >
            →
          </button>
          <button
            onClick={() => {
              setViewYear(todayYear);
              setViewMonth(todayMonth);
            }}
            className="rounded-[7px] border border-line bg-panel-raised px-3 py-1.5 text-xs text-muted hover:border-amber"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-danger" /> Scheduled
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-success" /> Completed
          </span>
          <button
            onClick={() => setAdding(true)}
            className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110"
          >
            + Add booking
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[10px] border border-line bg-line">
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            className="bg-panel-raised px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            {d}
          </div>
        ))}
        {weeks.flatMap((week, wi) =>
          week.map((dateIso, di) => {
            const dayBookings = dateIso ? (bookingsByDate.get(dateIso) ?? []) : [];
            const isToday = dateIso === todayIso;
            return (
              <div key={`${wi}-${di}`} className={`min-h-[92px] p-1.5 ${dateIso ? "bg-panel" : "bg-panel/40"}`}>
                {dateIso && (
                  <>
                    <span className={`mb-1 block text-[11px] ${isToday ? "font-bold text-amber" : "text-muted"}`}>
                      {Number(dateIso.slice(-2))}
                    </span>
                    <div className="space-y-1">
                      {dayBookings.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => setSelected(b)}
                          className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold ${
                            b.status === "completed" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
                          }`}
                        >
                          {b.appointment_time ? `${b.appointment_time.slice(0, 5)} ` : ""}
                          {b.no_plate}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-[420px] rounded-[10px] border border-line bg-panel p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 inline-flex items-center rounded-md border-2 border-[#1a1d21] bg-[#f2f1ec] px-3 py-0.5 font-mono text-sm font-bold tracking-wide text-[#14171a]">
              {selected.no_plate}
            </div>
            <div className="font-display mt-2 text-base font-semibold text-fg">{selected.vehicle}</div>
            <div className="mt-1 text-sm text-muted">{selected.buyer_name}</div>
            <div className="mt-1 text-sm text-muted">
              {new Date(selected.appointment_date + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              {selected.appointment_time && ` · ${selected.appointment_time.slice(0, 5)}`}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-muted">
              <span>Financier: {selected.financier || "-"}</span>
              <span>Loan: {fmtMoney(selected.loan_amount)}</span>
              <span>Retention: {fmtMoney(selected.retention_amount)}</span>
            </div>

            <label className="mb-1 mt-3 block text-[11px] font-medium uppercase tracking-wide text-muted">
              Runner
            </label>
            <select
              value={selected.runner_id ?? ""}
              disabled={busyId === selected.id}
              onChange={(e) => handleReassign(selected, e.target.value)}
              className="w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber disabled:opacity-50"
            >
              <option value="">Unassigned</option>
              {runners.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>

            <span
              className={`mt-3 inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                selected.status === "completed" ? "border-success text-success" : "border-danger text-danger"
              }`}
            >
              {selected.status === "completed" ? "Completed" : "Scheduled"}
              {selected.status === "completed" && selected.completed_by_name
                ? ` by ${selected.completed_by_name}`
                : ""}
            </span>
            {!selected.photo_path && selected.status !== "completed" && (
              <p className="mt-1 text-xs text-muted">Waiting on the runner&apos;s photo before this can be completed.</p>
            )}

            <div className="mt-4 flex justify-end gap-2.5">
              <button
                onClick={() => setSelected(null)}
                className="rounded-[7px] border border-line bg-panel-raised px-4 py-2 text-sm text-fg hover:border-amber"
              >
                Close
              </button>
              <button
                onClick={() => handleDelete(selected)}
                disabled={busyId === selected.id}
                className="rounded-[7px] border border-line px-4 py-2 text-sm text-muted hover:border-danger hover:text-danger disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <AddSigningBookingModal
          vehicles={vehicles}
          onClose={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      )}
    </div>
  );
}
