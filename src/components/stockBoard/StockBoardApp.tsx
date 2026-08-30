"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteVehicle,
  fetchPhoto,
  refreshStockBoardVehicles,
  type StockBoardVehicle,
} from "@/lib/stockBoard";
import type { PuspakomType } from "@/lib/puspakomBookings";
import { CarModal } from "./CarModal";

const STATUS_LABEL: Record<string, string> = {
  prep: "Loan Submission",
  available: "Available",
  reserved: "Loan Approved",
  sold: "Sold",
};
const STATUS_BG: Record<string, string> = {
  prep: "bg-status-prep",
  available: "bg-status-available",
  reserved: "bg-status-reserved",
  sold: "bg-status-sold",
};

interface Props {
  staffName: string;
  role: string;
  staffNames: string[];
  /** Sum of approved deposit payments per car, keyed by Stock Board vehicle id. */
  depositTotals: Record<string, number>;
  /** Completed inspection type(s) per Stock Board vehicle id - shows a ✅ B5 / ✅ B7 tag beside the plate. */
  puspakomCompletedTypes: Record<string, PuspakomType[]>;
}

function fmtMoney(n: string | number | undefined): string {
  if (n === undefined || n === null || n === "") return "—";
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString() : "—";
}
function fmtDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}
function fmtDateShort(isoDate: string | undefined): string {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function agingInfo(approvalDate: string): { text: string; level: "" | "warm" | "hot" } {
  const approved = new Date(approvalDate + "T00:00:00");
  const days = Math.max(0, Math.floor((Date.now() - approved.getTime()) / 86400000));
  const text = days === 0 ? "Approved today" : days === 1 ? "1 day ago" : `${days} days ago`;
  const level = days >= 14 ? "hot" : days >= 7 ? "warm" : "";
  return { text, level };
}

const AGING_CLASS: Record<string, string> = {
  hot: "border-status-sold text-status-sold",
  warm: "border-status-reserved text-status-reserved",
  "": "border-line text-muted",
};

export function StockBoardApp({ staffName, role, staffNames, depositTotals, puspakomCompletedTypes }: Props) {
  const [vehicles, setVehicles] = useState<StockBoardVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [depositFilter, setDepositFilter] = useState<"" | "pending" | "fully_paid" | "received">("");
  const [sortBy, setSortBy] = useState<"recent" | "submittedBy">("recent");
  // undefined = modal closed, null = add mode, a vehicle = edit mode
  const [modalVehicle, setModalVehicle] = useState<StockBoardVehicle | null | undefined>(undefined);
  const [photoCache, setPhotoCache] = useState<Record<string, string | null>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await refreshStockBoardVehicles();
      setVehicles(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the Stock Board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStockBoardVehicles()
      .then((list) => {
        setVehicles(list);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the Stock Board"))
      .finally(() => setLoading(false));

    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    vehicles.forEach((v) => {
      if (photoCache[v.id] !== undefined) return;
      fetchPhoto(v.id)
        .then((url) => setPhotoCache((c) => ({ ...c, [v.id]: url })))
        .catch(() => setPhotoCache((c) => ({ ...c, [v.id]: null })));
    });
    // photoCache intentionally excluded - it's the read cache being filled here, not a trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles]);

  const stats = useMemo(() => {
    const s = { prep: 0, available: 0, reserved: 0, sold: 0 };
    vehicles.forEach((v) => {
      if (v.status in s) s[v.status as keyof typeof s]++;
    });
    return s;
  }, [vehicles]);

  const submittedByOptions = useMemo(() => {
    const fromVehicles = vehicles.map((v) => v.submittedBy).filter((n): n is string => !!n);
    return Array.from(new Set([...staffNames, ...fromVehicles])).sort((a, b) => a.localeCompare(b));
  }, [vehicles, staffNames]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = vehicles.filter((v) => {
      if (statusFilter && v.status !== statusFilter) return false;
      if (staffFilter && v.submittedBy !== staffFilter) return false;
      if (depositFilter === "received") {
        if ((depositTotals[v.id] ?? 0) <= 0) return false; // no approved payment yet
      } else if (depositFilter) {
        const required = Number(v.deposit) || 0;
        if (required <= 0) return false; // no deposit set - not applicable either way
        const collected = depositTotals[v.id] ?? 0;
        const fullyPaid = collected >= required;
        if (depositFilter === "fully_paid" && !fullyPaid) return false;
        // "Pending" matches the card's tag - only once a first payment has landed.
        if (depositFilter === "pending" && (fullyPaid || collected <= 0)) return false;
      }
      if (!q) return true;
      return `${v.vehicle} ${v.vin}`.toLowerCase().includes(q);
    });

    if (sortBy === "submittedBy") {
      return list.sort((a, b) => {
        const byStaff = (a.submittedBy || "￿").localeCompare(b.submittedBy || "￿");
        if (byStaff !== 0) return byStaff;
        return (
          new Date(b.updatedAt || b.addedAt || 0).getTime() -
          new Date(a.updatedAt || a.addedAt || 0).getTime()
        );
      });
    }

    return list.sort(
      (a, b) =>
        new Date(b.updatedAt || b.addedAt || 0).getTime() -
        new Date(a.updatedAt || a.addedAt || 0).getTime()
    );
  }, [vehicles, search, statusFilter, staffFilter, depositFilter, depositTotals, sortBy]);

  async function handleDelete(v: StockBoardVehicle) {
    if (!confirm(`Delete "${v.vehicle}" from the Stock Board?`)) return;
    setDeletingId(v.id);
    try {
      await deleteVehicle(v.id, staffName);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete - try again.");
    } finally {
      setDeletingId(null);
    }
  }

  const depositReceivedCount = useMemo(
    () => vehicles.filter((v) => (depositTotals[v.id] ?? 0) > 0).length,
    [vehicles, depositTotals]
  );

  const statCards = [
    {
      label: "Total stock",
      value: stats.available + stats.reserved + stats.prep,
      key: "",
      type: "status" as const,
    },
    { label: "Available", value: stats.available, key: "available", type: "status" as const },
    { label: "Loan approved", value: stats.reserved, key: "reserved", type: "status" as const },
    { label: "Deposit received", value: depositReceivedCount, key: "received", type: "deposit" as const },
    { label: "Loan submission", value: stats.prep, key: "prep", type: "status" as const },
    { label: "Sold", value: stats.sold, key: "sold", type: "status" as const },
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-5">
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((s) => {
          const isActive = s.type === "deposit" ? depositFilter === s.key : statusFilter === s.key;
          return (
            <button
              key={s.label}
              onClick={() => {
                if (s.type === "deposit") {
                  setDepositFilter(s.key as "" | "pending" | "fully_paid" | "received");
                } else {
                  setStatusFilter(s.key);
                  if (s.key === "") setDepositFilter("");
                }
              }}
              className={`rounded-[10px] border px-4 py-3 text-left transition-colors ${
                isActive ? "border-amber bg-panel-raised" : "border-line bg-panel hover:border-amber"
              }`}
            >
              <div className="font-display text-2xl font-bold text-fg">{s.value}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted">{s.label}</div>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search make, model, plate no…"
          className="max-w-[240px] rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
        />
        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
        >
          <option value="">All staff</option>
          {submittedByOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "recent" | "submittedBy")}
          className="rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
        >
          <option value="recent">Sort: Most recent</option>
          <option value="submittedBy">Sort: Staff submitted</option>
        </select>
        <select
          value={depositFilter}
          onChange={(e) => setDepositFilter(e.target.value as "" | "pending" | "fully_paid" | "received")}
          className="rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
        >
          <option value="">All deposits</option>
          <option value="pending">Deposit pending</option>
          <option value="fully_paid">Fully deposited</option>
        </select>
        <div className="flex-1" />
        {error && <span className="text-xs text-danger">{error}</span>}
        <button
          onClick={() => setModalVehicle(null)}
          className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110"
        >
          + Add car
        </button>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-muted">Loading Stock Board…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-[10px] border border-line bg-panel py-16 text-center text-sm text-muted">
          No cars match yet.{vehicles.length === 0 && " Add your first one to get the board moving."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v) => {
            const photo = photoCache[v.id];
            const aging = v.status === "reserved" && v.approvalDate ? agingInfo(v.approvalDate) : null;
            const showSubmittedBy =
              (v.status === "prep" || v.status === "reserved" || v.status === "sold") && v.submittedBy;
            const depositRequired = Number(v.deposit) || 0;
            const depositCollected = depositTotals[v.id] ?? 0;
            const depositFullyPaid = depositRequired > 0 && depositCollected >= depositRequired;
            // Only shown once the first payment has actually landed - a car that
            // simply has a deposit requirement set with nothing paid yet stays tag-free.
            const depositPending = depositRequired > 0 && depositCollected > 0 && !depositFullyPaid;

            return (
              <div key={v.id} className="flex flex-col overflow-hidden rounded-[10px] border border-line bg-panel">
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-line bg-panel-raised">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data-URL photo from Firebase, not a static asset
                    <img src={photo} alt={v.vehicle} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted">{photo === null ? "No photo" : "Loading…"}</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  {v.vin && (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <div className="inline-flex w-fit items-center rounded-md border-2 border-[#1a1d21] bg-[#f2f1ec] px-3.5 py-1 font-mono text-base font-bold tracking-wide text-[#14171a]">
                        {v.vin}
                      </div>
                      {(puspakomCompletedTypes[v.id] ?? []).map((type) => (
                        <span
                          key={type}
                          className="rounded-full border border-success px-2.5 py-0.5 text-[11px] font-semibold text-success"
                        >
                          ✅ {type}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="font-display mb-1 text-base font-semibold text-fg">{v.vehicle}</div>
                  <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span
                      className={`rounded-r-md py-1 pl-3 pr-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#0d0f12] ${
                        STATUS_BG[v.status] ?? "bg-line"
                      }`}
                    >
                      {STATUS_LABEL[v.status] ?? v.status}
                    </span>
                    {depositFullyPaid && (
                      <span className="rounded-full border border-status-deposit-paid px-2.5 py-0.5 text-[11px] font-semibold text-status-deposit-paid">
                        Fully deposited
                      </span>
                    )}
                    {depositPending && (
                      <span className="rounded-full border border-amber px-2.5 py-0.5 text-[11px] font-semibold text-amber">
                        Deposit pending
                      </span>
                    )}
                    {v.company && (
                      <span className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted">
                        {v.company}
                      </span>
                    )}
                    {aging && (
                      <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${AGING_CLASS[aging.level]}`}>
                        Approved {fmtDateShort(v.approvalDate)} · {aging.text}
                      </span>
                    )}
                    {showSubmittedBy && (
                      <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-muted">
                        Submitted by {v.submittedBy}
                        {v.submissionDate ? ` on ${fmtDateShort(v.submissionDate)}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3.5 text-sm">
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide text-muted">ELK Loan Amount</span>
                      <span className="font-mono text-base font-semibold text-fg">{fmtMoney(v.price)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide text-muted">Monthly Installment</span>
                      <span className="font-mono text-base font-semibold text-fg">{fmtMoney(v.cost)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide text-muted">Deposit Required</span>
                      <span className="font-mono text-base font-semibold text-fg">{fmtMoney(v.deposit)}</span>
                    </div>
                    {Number(v.deposit) > 0 && (
                      <div>
                        <span className="block text-[10px] uppercase tracking-wide text-muted">Deposit Collected</span>
                        <span
                          className={`font-mono text-base font-semibold ${
                            (depositTotals[v.id] ?? 0) >= Number(v.deposit) ? "text-success" : "text-fg"
                          }`}
                        >
                          {fmtMoney(depositTotals[v.id] ?? 0)}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide text-muted">Tahun</span>
                      <span className="font-mono text-base font-semibold text-fg">{v.tahun || "—"}</span>
                    </div>
                  </div>
                  {v.notes && <div className="mt-2.5 text-sm italic text-muted">&quot;{v.notes}&quot;</div>}
                  <div className="mt-2.5 border-t border-dashed border-line pt-2 text-[11px] text-muted">
                    Added by {v.addedBy || "—"} · {fmtDate(v.addedAt)}
                    {v.updatedBy ? `  |  Updated by ${v.updatedBy} · ${fmtDate(v.updatedAt)}` : ""}
                  </div>
                  <div className="mt-3.5 flex gap-2">
                    <button
                      onClick={() => setModalVehicle(v)}
                      className="rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:border-amber hover:text-fg"
                    >
                      Edit
                    </button>
                    {role === "admin" && (
                      <button
                        onClick={() => handleDelete(v)}
                        disabled={deletingId === v.id}
                        className="rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:border-danger hover:text-danger disabled:opacity-50"
                      >
                        {deletingId === v.id ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalVehicle !== undefined && (
        <CarModal
          vehicle={modalVehicle}
          staffNames={staffNames}
          actorName={staffName}
          onClose={() => setModalVehicle(undefined)}
          onSaved={() => {
            setModalVehicle(undefined);
            load();
          }}
        />
      )}
    </div>
  );
}
