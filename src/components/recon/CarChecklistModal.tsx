"use client";

import { useEffect, useMemo, useState } from "react";
import { addConditionMedia, removeConditionMedia, setConditionItem } from "@/app/recon/actions";
import { getSignedUrls, uploadReconMediaFile } from "@/lib/storage";
import { CONDITION_TYPES, type ReconMediaRow, type ReconTaskRow } from "@/lib/recon";
import type { StockBoardVehicle } from "@/lib/stockBoard";

interface Props {
  vehicles: StockBoardVehicle[];
  /** Every car's condition-checklist rows - filtered to the chosen car here. */
  items: ReconTaskRow[];
  /** Photos/videos attached to checklist items (any car) - matched to items here. */
  media: ReconMediaRow[];
  /** Skip the car picker and open straight onto this car. */
  initialVehicleId?: string;
  onClose: () => void;
}

const FIELD_NO_MB =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const MAX_FILE_MB = 50;

export function CarChecklistModal({ vehicles, items, media, initialVehicleId, onClose }: Props) {
  const [vehicleId, setVehicleId] = useState<string | null>(initialVehicleId ?? null);
  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [busyType, setBusyType] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;

  const itemByType = useMemo(() => {
    const map = new Map<string, ReconTaskRow>();
    for (const it of items) {
      if (it.stock_board_vehicle_id === vehicleId && it.condition_type) map.set(it.condition_type, it);
    }
    return map;
  }, [items, vehicleId]);

  const mediaByTask = useMemo(() => {
    const map = new Map<string, ReconMediaRow[]>();
    for (const m of media) {
      const list = map.get(m.recon_task_id) ?? [];
      list.push(m);
      map.set(m.recon_task_id, list);
    }
    return map;
  }, [media]);

  // Signed links for whatever's attached to this car's items - fetched once per new file.
  const pathsForCar = useMemo(() => {
    const paths: string[] = [];
    for (const it of itemByType.values()) {
      for (const m of mediaByTask.get(it.id) ?? []) paths.push(m.file_path);
    }
    return paths;
  }, [itemByType, mediaByTask]);

  useEffect(() => {
    const missing = pathsForCar.filter((p) => !signedUrls[p]);
    if (missing.length === 0) return;
    let cancelled = false;
    getSignedUrls(missing).then((urls) => {
      if (!cancelled) setSignedUrls((prev) => ({ ...prev, ...urls }));
    });
    return () => {
      cancelled = true;
    };
  }, [pathsForCar, signedUrls]);

  const q = search.trim().toLowerCase();
  const suggestions = q ? vehicles.filter((v) => v.vin.toLowerCase().includes(q)) : vehicles;

  const doneCount = CONDITION_TYPES.filter((t) => itemByType.get(t)?.status === "done").length;
  const pendingCount = CONDITION_TYPES.filter((t) => itemByType.get(t)?.status === "pending").length;

  async function mark(conditionType: string, status: "pending" | "done") {
    if (!vehicle) return;
    setBusyType(conditionType);
    setError(null);
    try {
      const existing = itemByType.get(conditionType);
      const remark = remarkDrafts[conditionType] ?? existing?.remark ?? "";
      await setConditionItem(vehicle.id, vehicle.vin, vehicle.vehicle, conditionType, status, remark);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save - try again.");
    } finally {
      setBusyType(null);
    }
  }

  async function attachFiles(conditionType: string, files: FileList | null) {
    if (!vehicle || !files || files.length === 0) return;
    setUploadingType(conditionType);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const isPhoto = file.type.startsWith("image/");
        if (!isVideo && !isPhoto) throw new Error(`${file.name} isn't a photo or video.`);
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          throw new Error(`${file.name} is over ${MAX_FILE_MB} MB - record a shorter clip or lower the quality.`);
        }
        const path = await uploadReconMediaFile(vehicle.id, conditionType, file);
        await addConditionMedia(vehicle.id, vehicle.vin, vehicle.vehicle, conditionType, path, isVideo ? "video" : "photo");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload - try again.");
    } finally {
      setUploadingType(null);
    }
  }

  async function removeMedia(mediaId: string) {
    if (!confirm("Remove this photo/video?")) return;
    setError(null);
    try {
      await removeConditionMedia(mediaId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove - try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[10px] border border-line bg-panel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-fg">Car checklist</h3>
          <button onClick={onClose} className="text-sm text-muted hover:text-fg">
            Close
          </button>
        </div>

        {vehicle ? (
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <div className="inline-flex items-center rounded-md border-2 border-[#1a1d21] bg-[#f2f1ec] px-3 py-0.5 font-mono text-sm font-bold tracking-wide text-[#14171a]">
                {vehicle.vin}
              </div>
              <div className="mt-1 text-sm text-fg">{vehicle.vehicle}</div>
            </div>
            {!initialVehicleId && (
              <button onClick={() => setVehicleId(null)} className="text-xs text-amber hover:underline">
                Change car
              </button>
            )}
          </div>
        ) : (
          <div className="relative mb-4">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
              Which car?
            </label>
            <input
              className={FIELD_NO_MB}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search number plate…"
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="mt-1 max-h-64 w-full overflow-y-auto rounded-[7px] border border-line bg-panel-raised shadow-lg">
                {suggestions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setVehicleId(v.id);
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
        )}

        {vehicle && (
          <>
            <p className="mb-3 text-xs text-muted">
              {doneCount} done · {pendingCount} pending · {CONDITION_TYPES.length - doneCount - pendingCount} not
              checked yet. Anything marked Pending goes onto a runner&apos;s to-do list. Found a problem? Add a photo
              or video to that item.
            </p>
            <div className="divide-y divide-line rounded-[10px] border border-line">
              {CONDITION_TYPES.map((type) => {
                const row = itemByType.get(type);
                const busy = busyType === type;
                const attachments = row ? (mediaByTask.get(row.id) ?? []) : [];
                return (
                  <div key={type} className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{type}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => mark(type, "pending")}
                          disabled={busy}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50 ${
                            row?.status === "pending"
                              ? "border-danger bg-danger text-[#0d0f12]"
                              : "border-line text-muted hover:border-danger hover:text-danger"
                          }`}
                        >
                          Pending
                        </button>
                        <button
                          onClick={() => mark(type, "done")}
                          disabled={busy}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50 ${
                            row?.status === "done"
                              ? "border-success bg-success text-[#0d0f12]"
                              : "border-line text-muted hover:border-success hover:text-success"
                          }`}
                        >
                          Done
                        </button>
                      </div>
                    </div>
                    <input
                      className="mt-2 w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1 text-xs text-fg outline-none focus:border-amber"
                      value={remarkDrafts[type] ?? row?.remark ?? ""}
                      onChange={(e) => setRemarkDrafts((d) => ({ ...d, [type]: e.target.value }))}
                      placeholder="Remark (saved when you tap Pending / Done)"
                    />

                    {attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {attachments.map((m) => {
                          const url = signedUrls[m.file_path];
                          return (
                            <div key={m.id} className="relative">
                              {!url ? (
                                <div className="flex h-16 w-16 items-center justify-center rounded-[6px] bg-panel-raised text-[10px] text-muted">
                                  …
                                </div>
                              ) : m.media_type === "photo" ? (
                                <a href={url} target="_blank" rel="noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL thumbnail */}
                                  <img src={url} alt={`${type} photo`} className="h-16 w-16 rounded-[6px] object-cover" />
                                </a>
                              ) : (
                                <video src={url} controls preload="metadata" className="h-16 w-24 rounded-[6px] bg-black" />
                              )}
                              <button
                                onClick={() => removeMedia(m.id)}
                                title={`Added by ${m.uploaded_by_name} - remove`}
                                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-panel text-[11px] text-muted shadow ring-1 ring-line hover:text-danger"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-line bg-panel-raised px-2.5 py-1 text-xs text-fg hover:border-amber">
                      {uploadingType === type ? "Uploading…" : "📷 Add photo / video"}
                      <input
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        disabled={uploadingType !== null}
                        className="hidden"
                        onChange={(e) => {
                          attachFiles(type, e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>

                    {row && (
                      <p className="mt-1 text-[11px] text-muted">
                        {row.status === "done"
                          ? `Done${row.completed_by_name ? ` by ${row.completed_by_name}` : ""}`
                          : `Pending${row.runner_name ? ` - ${row.runner_name}` : " - unassigned"}`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {error && <p className="mt-3 text-xs text-danger">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
