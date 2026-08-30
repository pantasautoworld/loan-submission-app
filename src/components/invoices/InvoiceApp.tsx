"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClaimInvoiceRow } from "@/lib/claimInvoices";
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
      <div className="mb-4">
        <Link
          href="/invoices/new"
          className="inline-block rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110"
        >
          + New invoice
        </Link>
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
                <th className="px-3 py-2.5">Agent</th>
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
                  <td className="px-3 py-2.5 text-muted">{inv.agent_name}</td>
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
