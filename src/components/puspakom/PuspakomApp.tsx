"use client";

import { useMemo, useState } from "react";
import type { StockBoardVehicle } from "@/lib/stockBoard";
import type { PuspakomBookingRow } from "@/lib/puspakomBookings";
import { completePuspakomBooking, removePuspakomBooking } from "@/app/puspakom/actions";
import { malaysiaDateParts, malaysiaTodayIso } from "@/lib/timezone";
import { AddPuspakomModal } from "./AddPuspakomModal";

interface Props {
  role: string;
  /** Every non-sold Stock Board car - passed through to the "+ Add booking" plate picker. */
  vehicles: StockBoardVehicle[];
  bookings: PuspakomBookingRow[];
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weeks of "YYYY-MM-DD" cells (null = padding outside the month) for a calendar grid - built in UTC to avoid local-timezone day drift. */
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

export function PuspakomApp({ role, vehicles, bookings }: Props) {
  const { year: todayYear, month: todayMonth } = malaysiaDateParts();
  const todayIso = malaysiaTodayIso();

  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);
  const [addingBooking, setAddingBooking] = useState(false);
  const [selected, setSelected] = useState<PuspakomBookingRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, PuspakomBookingRow[]>();
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

  function fmtTime(time: string | null): string {
    if (!time) return "";
    const [h, m] = time.split(":");
    const hour = Number(h);
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}:${m} ${period}`;
  }

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

  async function handleComplete(booking: PuspakomBookingRow) {
    setBusyId(booking.id);
    try {
      await completePuspakomBooking(booking.id);
      setSelected(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update - try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(booking: PuspakomBookingRow) {
    if (!confirm(`Delete this booking for ${booking.no_plate}? This cannot be undone.`)) return;
    setBusyId(booking.id);
    try {
      await removePuspakomBooking(booking.id);
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
            <span className="h-2.5 w-2.5 rounded-full bg-danger" /> Not yet inspected
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-success" /> Completed
          </span>
          <button
            onClick={() => setAddingBooking(true)}
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
                    <div className={`mb-1 text-[11px] ${isToday ? "font-bold text-amber" : "text-muted"}`}>
                      {Number(dateIso.slice(-2))}
                    </div>
                    <div className="space-y-1">
                      {dayBookings.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => setSelected(b)}
                          className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold ${
                            b.status === "completed" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
                          }`}
                        >
                          {b.appointment_time ? `${fmtTime(b.appointment_time)} ` : ""}
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
            className="w-full max-w-[380px] rounded-[10px] border border-line bg-panel p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 inline-flex items-center rounded-md border-2 border-[#1a1d21] bg-[#f2f1ec] px-3 py-0.5 font-mono text-sm font-bold tracking-wide text-[#14171a]">
              {selected.no_plate}
            </div>
            <div className="font-display mt-2 text-base font-semibold text-fg">{selected.vehicle}</div>
            {selected.company && <div className="text-sm text-muted">{selected.company}</div>}
            <div className="mt-1 text-sm text-muted">
              {new Date(selected.appointment_date + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              {selected.appointment_time && ` · ${fmtTime(selected.appointment_time)}`}
              {selected.branch && ` · ${selected.branch}`}
            </div>
            <div className="mt-2 text-xs text-muted">
              Booked by {selected.created_by_name}
              {selected.status === "completed" && selected.completed_by_name
                ? ` · Completed by ${selected.completed_by_name}`
                : ""}
            </div>
            <span
              className={`mt-3 inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                selected.status === "completed" ? "border-success text-success" : "border-danger text-danger"
              }`}
            >
              {selected.status === "completed" ? "Completed" : "Not yet inspected"}
            </span>

            <div className="mt-4 flex justify-end gap-2.5">
              <button
                onClick={() => setSelected(null)}
                className="rounded-[7px] border border-line bg-panel-raised px-4 py-2 text-sm text-fg hover:border-amber"
              >
                Close
              </button>
              {role === "admin" && (
                <button
                  onClick={() => handleDelete(selected)}
                  disabled={busyId === selected.id}
                  className="rounded-[7px] border border-line px-4 py-2 text-sm text-muted hover:border-danger hover:text-danger disabled:opacity-50"
                >
                  {busyId === selected.id ? "…" : "Delete"}
                </button>
              )}
              {selected.status === "scheduled" && (
                <button
                  onClick={() => handleComplete(selected)}
                  disabled={busyId === selected.id}
                  className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-50"
                >
                  {busyId === selected.id ? "…" : "Mark complete"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {addingBooking && (
        <AddPuspakomModal
          vehicles={vehicles}
          onClose={() => setAddingBooking(false)}
          onSaved={() => setAddingBooking(false)}
        />
      )}
    </div>
  );
}
