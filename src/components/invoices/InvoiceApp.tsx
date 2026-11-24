"use client";

import { useState } from "react";
import Link from "next/link";
import { CLAIM_COMPANY_NAMES, type ClaimInvoiceRow } from "@/lib/claimInvoices";
import { malaysiaTodayIso } from "@/lib/timezone";
import { removeInvoice } from "@/app/invoices/actions";

interface Props {
  role: string;
  invoices: ClaimInvoiceRow[];
}

function fmtMoney(n: number): string {
  return `RM${n.toLocaleString()}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function InvoiceApp({ role, invoices }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [month, setMonth] = useState(malaysiaTodayIso().slice(0, 7));

  const summaryHref = (format: "pdf" | "xlsx") => {
    const q = new URLSearchParams({ format });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return `/api/invoices/summary?${q.toString()}`;
  };

  const monthHref = (format: "pdf" | "xlsx") => `/api/invoices/summary?format=${format}&month=${month}`;

  async function handleDelete(invoice: ClaimInvoiceRow) {
    if (!confirm(`Delete invoice ${invoice.invoice_no}? This cannot be undone.`)) return;
    setDeletingId(invoice.id);
    try {
      await removeInvoice(invoice.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete - try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Link
          href="/invoices/new"
          className="inline-block rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110"
        >
          + New invoice
        </Link>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
            />
          </div>
          {month && (
            <>
              <a
                href={monthHref("pdf")}
                className="rounded-[7px] bg-amber px-3 py-2 text-sm font-semibold text-amber-fg hover:brightness-110"
              >
                Month PDF
              </a>
              <a
                href={monthHref("xlsx")}
                className="rounded-[7px] bg-amber px-3 py-2 text-sm font-semibold text-amber-fg hover:brightness-110"
              >
                Month Excel
              </a>
            </>
          )}
          <span className="mx-1 hidden h-8 w-px bg-line sm:block" />
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Delivery from</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">to</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
            />
          </div>
          <a
            href={summaryHref("pdf")}
            className="rounded-[7px] border border-amber px-3 py-2 text-sm font-semibold text-amber hover:bg-panel-raised"
          >
            Summary PDF
          </a>
          <a
            href={summaryHref("xlsx")}
            className="rounded-[7px] border border-amber px-3 py-2 text-sm font-semibold text-amber hover:bg-panel-raised"
          >
            Summary Excel
          </a>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-[10px] border border-line bg-panel py-16 text-center text-sm text-muted">
          No invoices generated yet. Use &quot;+ New invoice&quot; to scan a grant and create one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2.5">Invoice No</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Buyer</th>
                <th className="px-3 py-2.5">Vehicle</th>
                <th className="px-3 py-2.5">Selling Price</th>
                <th className="px-3 py-2.5">Loan Amount (RM)</th>
                <th className="px-3 py-2.5">Agent</th>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5 font-mono text-fg">{inv.invoice_no}</td>
                  <td className="px-3 py-2.5 text-muted">{fmtDate(inv.invoice_date)}</td>
                  <td className="px-3 py-2.5 text-fg">{inv.buyer_name}</td>
                  <td className="px-3 py-2.5 text-muted">
                    {inv.vehicle_no} {inv.model && `· ${inv.model}`}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-fg">{fmtMoney(inv.selling_price)}</td>
                  <td className="px-3 py-2.5 font-mono text-fg">{fmtMoney(inv.loan_amount)}</td>
                  <td className="px-3 py-2.5 text-muted">{inv.agent_name}</td>
                  <td className="px-3 py-2.5 text-muted">{CLAIM_COMPANY_NAMES[inv.company] ?? inv.company}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-3">
                      <a
                        href={`/api/invoices/${inv.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-amber hover:underline"
                      >
                        Download PDF
                      </a>
                      <a
                        href={`/api/invoices/${inv.id}/checklist`}
                        className="text-xs text-amber hover:underline"
                      >
                        Download Checklist
                      </a>
                      {role === "admin" && (
                        <button
                          onClick={() => handleDelete(inv)}
                          disabled={deletingId === inv.id}
                          className="text-xs text-muted hover:text-danger hover:underline disabled:opacity-50"
                        >
                          {deletingId === inv.id ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
