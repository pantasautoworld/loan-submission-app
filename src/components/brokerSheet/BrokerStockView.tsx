"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrokerSheetData } from "@/lib/brokerSheetShared";

const REFRESH_MS = 60_000;

function fmtCell(value: string, numeric: boolean): string {
  if (!numeric || value === "") return value || "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-MY", { maximumFractionDigits: 2 }) : value;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
}

/** Read-only stock list for an outside broker: cards on a phone, a table on a wider screen. Refreshes itself every minute. */
export function BrokerStockView({
  sheet,
  brokerName,
  excelPath,
}: {
  sheet: BrokerSheetData;
  brokerName: string;
  excelPath: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? sheet.rows.filter((r) => r.some((cell) => cell.toLowerCase().includes(q))) : sheet.rows;
  }, [search, sheet.rows]);

  async function copyExcelLink() {
    const link = `${window.location.origin}${excelPath}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Excel link:", link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const [first, ...rest] = sheet.columns;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-fg">{sheet.title}</h1>
          <p className="text-xs text-muted">
            For {brokerName} · {sheet.rows.length} cars · updated {fmtTime(sheet.generatedAt)} (refreshes every minute)
          </p>
        </div>
        <button
          onClick={copyExcelLink}
          className="rounded-[7px] border border-line bg-panel-raised px-3 py-1.5 text-sm text-fg hover:border-amber"
        >
          {copied ? "Excel link copied ✓" : "Copy Excel link"}
        </button>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search plate, model…"
        className="mb-4 w-full rounded-[7px] border border-line bg-panel-raised px-3 py-2 text-sm text-fg outline-none focus:border-amber"
      />

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">No cars match.</p>
      ) : (
        <>
          {/* Phone: one card per car */}
          <div className="grid gap-3 md:hidden">
            {rows.map((r, i) => (
              <div key={i} className="rounded-[10px] border border-line bg-panel p-3">
                {first && <div className="mb-2 font-mono text-base font-bold text-fg">{fmtCell(r[0], first.numeric)}</div>}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  {rest.map((c, j) => (
                    <div key={j} className="contents">
                      <dt className="text-muted">{c.label}</dt>
                      <dd className={`text-fg ${c.numeric ? "font-mono" : ""}`}>{fmtCell(r[j + 1], c.numeric)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          {/* Wider screens: a table */}
          <div className="hidden overflow-x-auto rounded-[10px] border border-line md:block">
            <table className="w-full text-sm">
              <thead className="bg-panel-raised text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  {sheet.columns.map((c, j) => (
                    <th key={j} className={`px-3 py-2 font-medium ${c.numeric ? "text-right" : ""}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-line bg-panel">
                    {sheet.columns.map((c, j) => (
                      <td key={j} className={`px-3 py-2 text-fg ${c.numeric ? "text-right font-mono" : ""} ${j === 0 ? "font-mono font-semibold" : ""}`}>
                        {fmtCell(r[j], c.numeric)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
