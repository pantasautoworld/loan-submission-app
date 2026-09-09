"use client";

import { useMemo, useState } from "react";
import { saveVocDocument, deleteVocDocument } from "@/app/voc/actions";
import { uploadVocFile, getSignedUrl } from "@/lib/storage";
import { normalizePlate, type VocDocumentRow } from "@/lib/vocDocuments";
import type { StockBoardVehicle } from "@/lib/stockBoard";

interface Props {
  vehicles: StockBoardVehicle[];
  documents: VocDocumentRow[];
}

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function VocApp({ vehicles, documents }: Props) {
  const [plate, setPlate] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const vehicleByPlate = useMemo(() => {
    const map = new Map<string, StockBoardVehicle>();
    for (const v of vehicles) map.set(normalizePlate(v.vin), v);
    return map;
  }, [vehicles]);

  const plateQuery = plate.trim().toLowerCase();
  const suggestions = plateQuery
    ? vehicles.filter((v) => v.vin.toLowerCase().includes(plateQuery))
    : vehicles;

  const q = search.trim().toLowerCase();
  const filteredDocs = q ? documents.filter((d) => d.no_plate.toLowerCase().includes(q)) : documents;

  async function handleUpload() {
    if (!plate.trim()) {
      setError("Enter a plate number.");
      return;
    }
    if (!file) {
      setError("Choose the VOC file.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const filePath = await uploadVocFile(plate, file);
      const formData = new FormData();
      formData.set("plate", plate);
      formData.set("filePath", filePath);
      await saveVocDocument(formData);
      setPlate("");
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload - try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleView(doc: VocDocumentRow) {
    const { data, error: signError } = await getSignedUrl(doc.file_path);
    if (signError || !data) {
      alert("Could not open the file.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function handleDelete(doc: VocDocumentRow) {
    if (!confirm(`Delete the VOC on file for ${doc.no_plate}?`)) return;
    setBusyId(doc.id);
    try {
      await deleteVocDocument(doc.id, doc.file_path);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete - try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] px-6 py-5">
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-fg">Vehicle Ownership Certificate (VOC)</h2>
        <p className="text-sm text-muted">
          Upload every car&apos;s VOC here once. When a Loan Submission&apos;s Attachments tab has this
          plate typed in, the matching VOC attaches automatically - no need to upload it again there.
        </p>
      </div>

      <div className="mb-6 rounded-[10px] border border-line bg-panel p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Add / Replace VOC</p>
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="relative w-48">
            <label className={LABEL}>No Plate</label>
            <input
              className={FIELD}
              value={plate}
              onChange={(e) => {
                setPlate(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="e.g. VAJ7259"
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[7px] border border-line bg-panel-raised shadow-lg">
                {suggestions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setPlate(v.vin);
                      setShowSuggestions(false);
                    }}
                    className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-panel"
                  >
                    <span className="font-mono font-semibold text-fg">{v.vin}</span>
                    <span className="ml-2 text-xs text-muted">{v.vehicle}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className={LABEL}>VOC File</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-xs text-muted file:mr-2 file:rounded-[6px] file:border file:border-line file:bg-panel-raised file:px-2 file:py-1.5 file:text-xs file:text-fg"
            />
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={isSaving}
            className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-50"
          >
            {isSaving ? "Uploading…" : "Upload"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search number plate…"
        className="mb-3 max-w-[240px] rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
      />

      {filteredDocs.length === 0 ? (
        <div className="rounded-[10px] border border-line bg-panel py-12 text-center text-sm text-muted">
          {documents.length === 0 ? "No VOCs on file yet." : "No VOCs match that plate."}
        </div>
      ) : (
        <div className="divide-y divide-line rounded-[10px] border border-line bg-panel">
          {filteredDocs.map((doc) => {
            const vehicle = vehicleByPlate.get(doc.no_plate);
            return (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center rounded-md border-2 border-[#1a1d21] bg-[#f2f1ec] px-2.5 py-0.5 font-mono text-xs font-bold tracking-wide text-[#14171a]">
                    {doc.no_plate}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-fg">{vehicle?.vehicle ?? "-"}</div>
                    <div className="text-xs text-muted">
                      Uploaded by {doc.uploaded_by_name} · {fmtDate(doc.uploaded_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleView(doc)} className="text-xs text-amber hover:underline">
                    View
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={busyId === doc.id}
                    className="text-xs text-muted hover:text-danger hover:underline disabled:opacity-50"
                  >
                    {busyId === doc.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
