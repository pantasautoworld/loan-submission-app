"use client";

import { useState } from "react";
import type { StockBoardVehicle } from "@/lib/stockBoard";
import type { PuspakomBookingRow } from "@/lib/puspakomBookings";
import { completePuspakomBooking, removePuspakomBooking } from "@/app/puspakom/actions";
import { AddPuspakomModal } from "./AddPuspakomModal";

interface Props {
  role: string;
  /** Every non-sold Stock Board car - cross-referenced against `bookings` to render each tracked car's history. */
  vehicles: StockBoardVehicle[];
  bookings: PuspakomBookingRow[];
}

function fmtDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: "border-line text-muted",
  completed: "border-success text-success",
};
const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
};

export function PuspakomApp({ role, vehicles, bookings }: Props) {
  const [addingBooking, setAddingBooking] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleComplete(booking: PuspakomBookingRow) {
    setCompletingId(booking.id);
    try {
      await completePuspakomBooking(booking.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update - try again.");
    } finally {
      setCompletingId(null);
    }
  }

  async function handleDelete(booking: PuspakomBookingRow) {
    if (!confirm(`Delete this booking for ${booking.no_plate}? This cannot be undone.`)) return;
    setDeletingId(booking.id);
    try {
      await removePuspakomBooking(booking.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete - try again.");
    } finally {
      setDeletingId(null);
    }
  }

  // Every car with at least one booking logged - most recently booked first.
  const trackedCars = vehicles
    .filter((v) => bookings.some((b) => b.stock_board_vehicle_id === v.id))
    .sort((a, b) => {
      const latest = (id: string) =>
        bookings
          .filter((bk) => bk.stock_board_vehicle_id === id)
          .reduce((max, bk) => (bk.created_at > max ? bk.created_at : max), "");
      return latest(b.id).localeCompare(latest(a.id));
    });

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-5">
      <div className="mb-4">
        <button
          onClick={() => setAddingBooking(true)}
          className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110"
        >
          + Add booking
        </button>
      </div>

      {trackedCars.length === 0 ? (
        <div className="rounded-[10px] border border-line bg-panel py-16 text-center text-sm text-muted">
          No Puspakom bookings logged yet. Use &quot;+ Add booking&quot; to log one.
        </div>
      ) : (
        <div className="space-y-4">
          {trackedCars.map((car) => {
            const carBookings = bookings
              .filter((b) => b.stock_board_vehicle_id === car.id)
              .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date));

            return (
              <div key={car.id} className="rounded-[10px] border border-line bg-panel p-5">
                <div>
                  <div className="mb-1 inline-flex w-fit items-center rounded-md border-2 border-[#1a1d21] bg-[#f2f1ec] px-3 py-0.5 font-mono text-sm font-bold tracking-wide text-[#14171a]">
                    {car.vin}
                  </div>
                  <div className="font-display text-base font-semibold text-fg">{car.vehicle}</div>
                </div>

                <div className="mt-4 divide-y divide-line border-t border-line">
                  {carBookings.map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <div>
                        <span className="rounded border border-line px-1.5 py-0.5 font-mono text-xs font-semibold text-fg">
                          {b.inspection_type}
                        </span>
                        <span className="ml-2 font-semibold text-fg">{fmtDate(b.appointment_date)}</span>
                        {b.branch && <span className="ml-2 text-muted">{b.branch}</span>}
                        <div className="text-[11px] text-muted">
                          Booked by {b.created_by_name}
                          {b.status === "completed" && b.completed_by_name
                            ? ` · Completed by ${b.completed_by_name}`
                            : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[b.status] ?? "border-line text-muted"}`}
                        >
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                        {b.status === "scheduled" && (
                          <button
                            onClick={() => handleComplete(b)}
                            disabled={completingId === b.id}
                            className="text-xs text-success hover:underline disabled:opacity-50"
                          >
                            {completingId === b.id ? "…" : "Mark complete"}
                          </button>
                        )}
                        {role === "admin" && (
                          <button
                            onClick={() => handleDelete(b)}
                            disabled={deletingId === b.id}
                            className="text-xs text-muted hover:text-danger hover:underline disabled:opacity-50"
                          >
                            {deletingId === b.id ? "Deleting…" : "Delete"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
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
