"use client";

import { useState, useTransition } from "react";
import type { StockBoardVehicle } from "@/lib/stockBoard";
import type { CarDepositRow, DepositPaymentRow } from "@/lib/depositPayments";
import { updateSigningDate } from "@/app/deposits/actions";
import { AddPaymentModal } from "./AddPaymentModal";

type PaymentWithUrl = DepositPaymentRow & { receiptUrl: string | null };
type DepositWithUrls = CarDepositRow & { payments: PaymentWithUrl[] };

interface Props {
  staffName: string;
  approvedCars: StockBoardVehicle[];
  deposits: DepositWithUrls[];
}

function fmtMoney(n: number | string | undefined): string {
  if (n === undefined || n === null || n === "") return "—";
  const num = Number(n);
  return Number.isFinite(num) ? `RM${num.toLocaleString()}` : "—";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const STATUS_STYLE: Record<string, string> = {
  pending: "border-line text-muted",
  approved: "border-success text-success",
  rejected: "border-danger text-danger",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

function SigningDateInput({ deposit }: { deposit: DepositWithUrls }) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(deposit.signing_date ?? "");

  function handleChange(next: string) {
    setValue(next);
    startTransition(() => {
      updateSigningDate(deposit.id, next).catch(() => {});
    });
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-muted">Signing date</span>
      <input
        type="date"
        value={value}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-[7px] border border-line bg-panel-raised px-2 py-1 text-sm text-fg outline-none focus:border-amber disabled:opacity-50"
      />
    </div>
  );
}

export function DepositPaymentApp({ approvedCars, deposits }: Props) {
  const [modalCar, setModalCar] = useState<StockBoardVehicle | null>(null);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filteredCars = q
    ? approvedCars.filter((car) => `${car.vin} ${car.vehicle}`.toLowerCase().includes(q))
    : approvedCars;

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-5">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search number plate…"
        className="mb-4 max-w-[240px] rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
      />

      {filteredCars.length === 0 ? (
        <div className="rounded-[10px] border border-line bg-panel py-16 text-center text-sm text-muted">
          {approvedCars.length === 0
            ? "No cars are currently Loan Approved."
            : "No Loan Approved car matches that plate."}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCars.map((car) => {
            const deposit = deposits.find((d) => d.stock_board_vehicle_id === car.id);
            const payments = deposit?.payments ?? [];
            const collected = payments
              .filter((p) => p.status === "approved")
              .reduce((sum, p) => sum + p.amount, 0);

            return (
              <div key={car.id} className="rounded-[10px] border border-line bg-panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 inline-flex w-fit items-center rounded-md border-2 border-[#1a1d21] bg-[#f2f1ec] px-3 py-0.5 font-mono text-sm font-bold tracking-wide text-[#14171a]">
                      {car.vin}
                    </div>
                    <div className="font-display text-base font-semibold text-fg">{car.vehicle}</div>
                    <div className="text-sm text-muted">
                      Collected {fmtMoney(collected)} of {fmtMoney(car.deposit)} required
                    </div>
                  </div>
                  <button
                    onClick={() => setModalCar(car)}
                    className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110"
                  >
                    + Add payment
                  </button>
                </div>

                {payments.length > 0 && (
                  <div className="mt-4 divide-y divide-line border-t border-line">
                    {payments.map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                        <div>
                          <span className="font-mono font-semibold text-fg">{fmtMoney(p.amount)}</span>
                          {p.method && <span className="ml-2 text-muted">{p.method}</span>}
                          {p.note && <span className="ml-2 text-muted italic">{p.note}</span>}
                          <div className="text-[11px] text-muted">
                            By {p.uploaded_by_name} · {fmtDate(p.uploaded_at)}
                            {p.status !== "pending" && p.approved_by_name
                              ? ` · ${STATUS_LABEL[p.status]} by ${p.approved_by_name}`
                              : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.receiptUrl && (
                            <a
                              href={p.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted underline hover:text-fg"
                            >
                              Receipt
                            </a>
                          )}
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[p.status] ?? "border-line text-muted"}`}
                          >
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {deposit && payments.length > 0 && <SigningDateInput deposit={deposit} />}
              </div>
            );
          })}
        </div>
      )}

      {modalCar && (
        <AddPaymentModal
          stockBoardVehicleId={modalCar.id}
          noPlate={modalCar.vin}
          vehicle={modalCar.vehicle}
          onClose={() => setModalCar(null)}
          onSaved={() => setModalCar(null)}
        />
      )}
    </div>
  );
}
