"use client";

import { useMemo, useState, useTransition } from "react";
import type { StockBoardVehicle } from "@/lib/stockBoard";
import {
  summarizeApprovedDepositsForMonth,
  type CarDepositRow,
  type DepositPaymentRow,
} from "@/lib/depositPayments";
import { malaysiaDateParts } from "@/lib/timezone";
import {
  approveDepositPayment,
  deleteDepositPayment,
  rejectDepositPayment,
  updateSigningDate,
} from "@/app/deposits/actions";
import { AddPaymentModal } from "./AddPaymentModal";
import { AddDepositModal } from "./AddDepositModal";

type PaymentWithUrl = DepositPaymentRow & { receiptUrl: string | null };
type DepositWithUrls = CarDepositRow & { payments: PaymentWithUrl[] };

interface Props {
  staffName: string;
  role: string;
  /** Every non-sold Stock Board car - cross-referenced against `deposits` to render each tracked car's details. */
  vehicles: StockBoardVehicle[];
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

const monthOptions = (() => {
  const { year: curYear, month: curMonth } = malaysiaDateParts();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(curYear, curMonth - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    return {
      value: `${y}-${String(m).padStart(2, "0")}`,
      label: d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });
})();

export function DepositPaymentApp({ role, vehicles, deposits }: Props) {
  const [modalCar, setModalCar] = useState<StockBoardVehicle | null>(null);
  const [addingDeposit, setAddingDeposit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryMonth, setSummaryMonth] = useState(monthOptions[0].value);

  // Shared with the downloadable PDF (see /api/deposits/summary-pdf) so the two never drift apart.
  const monthlySummary = useMemo(
    () => summarizeApprovedDepositsForMonth(deposits, summaryMonth),
    [deposits, summaryMonth]
  );

  async function handleDelete(payment: PaymentWithUrl) {
    if (!confirm(`Delete this ${fmtMoney(payment.amount)} payment? This cannot be undone.`)) return;
    setDeletingId(payment.id);
    try {
      await deleteDepositPayment(payment.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete - try again.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleResolve(payment: PaymentWithUrl, decision: "approved" | "rejected") {
    setResolvingId(payment.id);
    try {
      await (decision === "approved" ? approveDepositPayment : rejectDepositPayment)(payment.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update - try again.");
    } finally {
      setResolvingId(null);
    }
  }

  // Every car with at least one payment logged - pending ones show up here too now,
  // not just approved, so admin can approve/reject straight from the website.
  const trackedCars = vehicles
    .filter((v) => deposits.some((d) => d.stock_board_vehicle_id === v.id && d.payments.length > 0))
    .sort((a, b) => {
      const da = deposits.find((d) => d.stock_board_vehicle_id === a.id);
      const db = deposits.find((d) => d.stock_board_vehicle_id === b.id);
      const latest = (d: DepositWithUrls | undefined) =>
        d?.payments[0]?.uploaded_at ?? d?.created_at ?? "";
      return latest(db).localeCompare(latest(da));
    });

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-5">
      <div className="mb-4 flex flex-wrap gap-2.5">
        <button
          onClick={() => setAddingDeposit(true)}
          className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110"
        >
          + Add deposit
        </button>
        <button
          onClick={() => setShowSummary((v) => !v)}
          className="rounded-[7px] border border-line bg-panel-raised px-4 py-2 text-sm text-fg hover:border-amber"
        >
          {showSummary ? "Hide monthly summary" : "Monthly summary"}
        </button>
      </div>

      {showSummary && (
        <div className="mb-4 rounded-[10px] border border-line bg-panel p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-fg">Monthly summary</h3>
            <div className="flex items-center gap-2">
              <select
                value={summaryMonth}
                onChange={(e) => setSummaryMonth(e.target.value)}
                className="rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
              >
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <a
                href={`/api/deposits/summary-pdf?month=${summaryMonth}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-[7px] border border-line bg-panel-raised px-3 py-1.5 text-sm text-fg hover:border-amber"
              >
                Download PDF
              </a>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-[7px] border border-line bg-panel-raised px-3 py-2.5">
              <div className="font-display text-xl font-bold text-fg">{fmtMoney(monthlySummary.total)}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Collected</div>
            </div>
            <div className="rounded-[7px] border border-line bg-panel-raised px-3 py-2.5">
              <div className="font-display text-xl font-bold text-fg">{monthlySummary.rows.length}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Approved payments</div>
            </div>
            <div className="rounded-[7px] border border-line bg-panel-raised px-3 py-2.5">
              <div className="font-display text-xl font-bold text-fg">{monthlySummary.carCount}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Cars</div>
            </div>
            <div className="rounded-[7px] border border-line bg-panel-raised px-3 py-2.5">
              <div className="font-display text-xl font-bold text-fg">{monthlySummary.pendingCount}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Still pending</div>
            </div>
          </div>

          {monthlySummary.byMethod.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {monthlySummary.byMethod.map(([method, amount]) => (
                <div
                  key={method}
                  className="flex items-center gap-1.5 rounded-full border border-line bg-panel-raised px-3 py-1 text-xs"
                >
                  <span className="text-muted">{method}</span>
                  <span className="font-mono font-semibold text-fg">{fmtMoney(amount)}</span>
                </div>
              ))}
            </div>
          )}

          {monthlySummary.rows.length === 0 ? (
            <p className="text-sm text-muted">No approved deposits logged this month.</p>
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {monthlySummary.rows.map((r) => (
                <div key={r.paymentId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <span className="font-mono font-semibold text-fg">{r.plate}</span>
                    <span className="ml-2 text-muted">{r.vehicle}</span>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <span className="font-mono text-sm font-semibold text-fg">{fmtMoney(r.amount)}</span>
                    <span className="ml-2">
                      {r.method || "—"} · {fmtDate(r.uploadedAt)} · Submitted by {r.uploadedBy}
                      {r.approvedBy ? ` · Approved by ${r.approvedBy}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {trackedCars.length === 0 ? (
        <div className="rounded-[10px] border border-line bg-panel py-16 text-center text-sm text-muted">
          No deposits logged yet. Use &quot;+ Add deposit&quot; to log one.
        </div>
      ) : (
        <div className="space-y-4">
          {trackedCars.map((car) => {
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
                          {p.receipt_number && (
                            <span className="ml-2 font-mono text-muted">#{p.receipt_number}</span>
                          )}
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
                          {role === "admin" && p.status === "pending" && (
                            <>
                              <button
                                onClick={() => handleResolve(p, "approved")}
                                disabled={resolvingId === p.id}
                                className="text-xs text-success hover:underline disabled:opacity-50"
                              >
                                {resolvingId === p.id ? "…" : "Approve"}
                              </button>
                              <button
                                onClick={() => handleResolve(p, "rejected")}
                                disabled={resolvingId === p.id}
                                className="text-xs text-danger hover:underline disabled:opacity-50"
                              >
                                {resolvingId === p.id ? "…" : "Reject"}
                              </button>
                            </>
                          )}
                          {role === "admin" && (
                            <button
                              onClick={() => handleDelete(p)}
                              disabled={deletingId === p.id}
                              className="text-xs text-muted hover:text-danger hover:underline disabled:opacity-50"
                            >
                              {deletingId === p.id ? "Deleting…" : "Delete"}
                            </button>
                          )}
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

      {addingDeposit && (
        <AddDepositModal
          vehicles={vehicles}
          onClose={() => setAddingDeposit(false)}
          onSaved={() => setAddingDeposit(false)}
        />
      )}
    </div>
  );
}
