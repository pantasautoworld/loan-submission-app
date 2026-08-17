"use client";

import { useState } from "react";
import Link from "next/link";
import { getSignedUrl } from "@/lib/storage";
import { fetchStockBoardVehicles, findById, markLoanSubmitted } from "@/lib/stockBoard";
import type { PersonRow, SignerRole } from "@/lib/types";

interface Props {
  submissionId: string;
  dealer: { name: string; phone: string };
  hasGuarantor2: boolean;
  signers: { role: SignerRole; label: string }[];
  persons: PersonRow[];
  stockBoardVehicleId: string | null;
  isAdmin: boolean;
}

export function GenerateStep({
  submissionId,
  dealer,
  hasGuarantor2,
  signers,
  persons,
  stockBoardVehicleId,
  isAdmin,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [boardNotice, setBoardNotice] = useState<string | null>(null);

  const unsigned = signers.filter(
    (s) => !persons.find((p) => p.role === s.role)?.signature_path
  );

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate document");
      const { data: signed } = await getSignedUrl(data.pdf_path);
      if (!signed) throw new Error("Could not create a download link");
      setDownloadUrl(signed.signedUrl);

      if (stockBoardVehicleId) {
        try {
          const vehicles = await fetchStockBoardVehicles();
          const vehicle = findById(stockBoardVehicleId, vehicles);
          if (vehicle) {
            const result = await markLoanSubmitted(vehicle._key, dealer.name);
            setBoardNotice(
              result.ok
                ? "Stock Board updated: Available → Loan Submission."
                : `Stock Board not updated: ${result.reason}`
            );
          }
        } catch {
          setBoardNotice("Stock Board not updated (could not reach it).");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate document");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-fg">Generate packet</h3>
      <p className="text-sm text-muted">
        Compiles {hasGuarantor2 ? "ELK pg1–pg5" : "ELK pg1–pg4"} into a single signed PDF.
      </p>

      {unsigned.length > 0 && (
        <p className="rounded-[7px] border border-amber-dim bg-amber-dim/30 px-3 py-2 text-sm text-amber">
          Waiting on signature(s): {unsigned.map((s) => s.label).join(", ")}
        </p>
      )}

      {error && (
        <p className="rounded-[7px] border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        disabled={busy || unsigned.length > 0}
        onClick={generate}
        className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-40"
      >
        {busy ? "Generating…" : "Generate PDF"}
      </button>

      {downloadUrl && (
        <>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-sm font-medium text-amber hover:underline"
          >
            Download generated packet
          </a>
          {isAdmin && (
            <Link
              href={`/submissions/${submissionId}/income`}
              className="block text-sm font-medium text-amber hover:underline"
            >
              Continue to Income Documents →
            </Link>
          )}
        </>
      )}

      {boardNotice && <p className="text-xs text-muted">{boardNotice}</p>}
    </div>
  );
}
