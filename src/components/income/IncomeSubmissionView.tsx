"use client";

import { useState } from "react";
import { IncomeDocumentsForm } from "@/components/wizard/IncomeDocumentsForm";
import { getSignedUrl } from "@/lib/storage";
import type { DocumentRow, PersonFields, PersonRole, PersonRow } from "@/lib/types";

interface Props {
  submissionId: string;
  persons: PersonRow[];
  documents: DocumentRow[];
  hasGuarantor2Initially: boolean;
}

export function IncomeSubmissionView({
  submissionId,
  persons: initialPersons,
  documents,
  hasGuarantor2Initially,
}: Props) {
  const [persons, setPersons] = useState(initialPersons);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  function updatePersonFields(role: PersonRole, fields: PersonFields) {
    setPersons((prev) => prev.map((p) => (p.role === role ? { ...p, ...fields } : p)));
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/generate-income`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate income packet");
      const { data: signed } = await getSignedUrl(data.pdf_path);
      if (!signed) throw new Error("Could not create a download link");
      setDownloadUrl(signed.signedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate income packet");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <IncomeDocumentsForm
        submissionId={submissionId}
        documents={documents}
        showGuarantor2={hasGuarantor2Initially}
        persons={persons}
        onPersonExtracted={updatePersonFields}
        allowTemplateUpload
      />

      <div className="space-y-4 rounded-[10px] border border-line bg-panel p-6">
        <h3 className="font-medium text-fg">Generate Income Packet</h3>
        <p className="text-sm text-muted">
          Compiles each person&apos;s payslip (uploaded or auto-generated) and EPF/KWSP statement
          into a single combined PDF, separate from the main application packet.
        </p>

        {error && (
          <p className="rounded-[7px] border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          disabled={busy}
          onClick={generate}
          className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate Income PDF"}
        </button>

        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-sm font-medium text-amber hover:underline"
          >
            Download income packet
          </a>
        )}
      </div>
    </div>
  );
}
