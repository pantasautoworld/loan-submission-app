"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CAR_PHOTO_FIELD_PREFIX,
  MAX_CAR_PHOTOS,
  carPhotoGuideAt,
} from "@/lib/carPhotoSlots";
import { convertToJpeg } from "@/lib/clientPhoto";
import { uploadQuickReplyPdf } from "@/lib/storage";
import { buildQuickReplyDraft, type QuickReplyJobRow } from "@/lib/quickReplyJobs";
import type { StockBoardVehicle } from "@/lib/stockBoard";
import { listQuickReplyJobs, queueQuickReply } from "@/app/car-photos/actions";

interface Photo {
  id: string;
  fileName: string;
  blob: Blob;
  previewUrl: string;
}

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name);
}

interface Props {
  vehicles: StockBoardVehicle[];
  initialJobs: QuickReplyJobRow[];
  /** Plates already saved in LuluChat (normalised) - get a tick in the picker. */
  sentPlates: string[];
}

function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/s+/g, "");
}

const JOB_LABEL: Record<QuickReplyJobRow["status"], string> = {
  queued: "Waiting for the robot…",
  running: "Sending to LuluChat…",
  done: "Done - quick reply is in LuluChat",
  failed: "Failed",
};

export function CarPhotosApp({ vehicles, initialJobs, sentPlates }: Props) {
  const [name, setName] = useState("");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [message, setMessage] = useState("");
  const [jobs, setJobs] = useState<QuickReplyJobRow[]>(initialJobs);
  const [isSending, setIsSending] = useState(false);
  const [showPlateList, setShowPlateList] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [converting, setConverting] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const photosRef = useRef(photos);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const hasActiveJob = jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!hasActiveJob) return;
    const timer = setInterval(() => {
      listQuickReplyJobs()
        .then(setJobs)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [hasActiveJob]);

  useEffect(() => {
    return () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  async function addFiles(fileList: FileList | File[]) {
    setError(null);
    setNotice(null);
    const all = Array.from(fileList);
    const files = all
      .filter(isImageFile)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const problems: string[] = [];
    if (files.length < all.length) {
      problems.push(`${all.length - files.length} file(s) skipped - not a photo.`);
    }

    const room = MAX_CAR_PHOTOS - photosRef.current.length;
    if (files.length > room) {
      problems.push(`Only ${MAX_CAR_PHOTOS} photos fit in one PDF - the extra ${files.length - room} were not added.`);
      files.length = Math.max(room, 0);
    }

    setConverting((n) => n + files.length);
    for (const file of files) {
      try {
        const blob = await convertToJpeg(file);
        const photo: Photo = {
          id: crypto.randomUUID(),
          fileName: file.name,
          blob,
          previewUrl: URL.createObjectURL(blob),
        };
        setPhotos((prev) => [...prev, photo]);
        setPdfBlob(null);
      } catch (err) {
        problems.push(`${file.name}: ${err instanceof Error ? err.message : "could not be read"}`);
      } finally {
        setConverting((n) => n - 1);
      }
    }
    if (problems.length > 0) setError(problems.join(" "));
  }

  function handleRemove(id: string) {
    setPdfBlob(null);
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function handleMove(index: number, by: number) {
    setPdfBlob(null);
    setPhotos((prev) => {
      const target = index + by;
      if (target < 0 || target >= prev.length) return prev;
      return arrayMove(prev, index, target);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPdfBlob(null);
    setPhotos((prev) => {
      const from = prev.findIndex((p) => p.id === active.id);
      const to = prev.findIndex((p) => p.id === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  }

  function handleClear() {
    for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    setPhotos([]);
    setPdfBlob(null);
    setNotice(null);
    setError(null);
  }

  function handlePlateChange(value: string) {
    setName(value);
    const match = vehicles.find((v) => normalizePlate(v.vin ?? "") === normalizePlate(value));
    if (match) {
      const draft = buildQuickReplyDraft(match);
      setShortcut(draft.shortcut);
      setMessage(draft.message);
    }
  }

  async function handleSendToLuluChat() {
    if (!pdfBlob) return;
    setSendError(null);
    setIsSending(true);
    try {
      const filePath = await uploadQuickReplyPdf(name, pdfBlob);
      await queueQuickReply({ plate: name, shortcut, message, filePath });
      const sentShortcut = shortcut;
      setJobs(await listQuickReplyJobs());

      // start a clean page for the next car - progress stays visible under "Recent LuluChat sends"
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
      setPhotos([]);
      setPdfBlob(null);
      setName("");
      setShortcut("");
      setMessage("");
      setError(null);
      setNotice(`Sent to LuluChat: ${sentShortcut}. Ready for the next car.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send - try again.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleMakePdf() {
    setError(null);
    setNotice(null);
    setIsBusy(true);
    try {
      const formData = new FormData();
      formData.set("name", name);
      photos.forEach((photo, i) => {
        formData.set(`${CAR_PHOTO_FIELD_PREFIX}${i}`, photo.blob, `photo-${i + 1}.jpg`);
      });

      const res = await fetch("/api/car-photos/pdf", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not make the PDF - try again.");
      }

      const platesFound = JSON.parse(res.headers.get("X-Plates-Found") ?? "[]") as number[];
      const missed = photos
        .map((_, i) => i)
        .filter((i) => carPhotoGuideAt(i).expectsPlate && !platesFound[i])
        .map((i) => `${i + 1} (${carPhotoGuideAt(i).label})`);

      const blob = await res.blob();
      setPdfBlob(blob);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Car-Photos-${name.replace(/[^A-Za-z0-9]/g, "") || "car"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setNotice(
        missed.length > 0
          ? `PDF downloaded. No number plate was found on page: ${missed.join(", ")}. Open the PDF and check those pages before sending.`
          : "PDF downloaded. Number plates are blacked out."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make the PDF - try again.");
    } finally {
      setIsBusy(false);
    }
  }

  // plates already saved in LuluChat: loaded from the database, plus any that finished while this page was open
  const sentSet = new Set([
    ...sentPlates,
    ...jobs.filter((j) => j.status === "done").map((j) => normalizePlate(j.plate)),
  ]);
  const plateQuery = name.trim().toLowerCase();
  const plateMatches = vehicles
    .filter(
      (v) =>
        !plateQuery ||
        (v.vin ?? "").toLowerCase().includes(plateQuery) ||
        (v.vehicle ?? "").toLowerCase().includes(plateQuery)
    )
    .slice(0, 60);

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-5">
      <div className="mb-4 rounded-[10px] border border-line bg-panel p-4">
        <p className="text-sm text-muted">
          Add all the car photos at once (HEIC is converted to JPEG automatically). Drag the photos
          into the guide order below - the system then blacks out every number plate and makes one PDF,
          one photo per page. Photos are not saved.
        </p>
        <div className="relative mt-3 max-w-sm">
          <label className={LABEL}>Car plate (pick from the Stock Board)</label>
          <input
            className={FIELD}
            value={name}
            onChange={(e) => {
              handlePlateChange(e.target.value);
              setShowPlateList(true);
            }}
            onFocus={() => setShowPlateList(true)}
            onBlur={() => setShowPlateList(false)}
            placeholder="e.g. WWT7595"
            autoComplete="off"
          />
          {showPlateList && plateMatches.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-[7px] border border-line bg-panel shadow-lg">
              {plateMatches.map((v) => {
                const sent = sentSet.has(normalizePlate(v.vin ?? ""));
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      // mousedown, not click: the input's blur would close the list before a click lands
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handlePlateChange(v.vin);
                        setShowPlateList(false);
                      }}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-panel-raised"
                    >
                      <span className="font-mono text-fg">{v.vin}</span>
                      {sent && (
                        <span
                          className="font-semibold text-status-reserved"
                          title="Already saved in LuluChat"
                          aria-label="Already saved in LuluChat"
                        >
                          ✓
                        </span>
                      )}
                      <span className="min-w-0 truncate text-muted">{v.vehicle}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsOver(false);
          if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
        }}
        className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-[10px] border border-dashed px-4 py-8 text-center transition-colors hover:border-amber ${
          isOver ? "border-amber bg-panel-raised" : "border-line bg-panel"
        }`}
      >
        <span className="text-sm font-medium text-fg">Choose photos, or drop them here</span>
        <span className="mt-1 text-xs text-muted">
          Select all of them in one go - JPG, PNG or HEIC
        </span>
        <input
          type="file"
          multiple
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {converting > 0 && (
        <p className="mb-3 text-sm text-muted">Converting photos… {converting} left</p>
      )}

      {photos.length > 0 && (
        <>
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((photo, i) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    index={i}
                    isLast={i === photos.length - 1}
                    onMove={handleMove}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleMakePdf}
              disabled={isBusy || converting > 0}
              className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-50"
            >
              {isBusy ? "Hiding plates & making PDF…" : "Hide plates & make PDF"}
            </button>
            <button
              onClick={handleClear}
              disabled={isBusy}
              className="text-sm text-muted hover:text-danger hover:underline disabled:opacity-50"
            >
              Clear all
            </button>
            <span className="text-xs text-muted">{photos.length} photos</span>
          </div>
        </>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {notice && <p className="mt-3 text-sm text-fg">{notice}</p>}

      {pdfBlob && (
        <div className="mt-5 rounded-[10px] border border-line bg-panel p-4">
          <h2 className="font-medium text-fg">Send to LuluChat</h2>
          <p className="mt-1 text-sm text-muted">
            Creates a quick reply with this PDF in LuluChat. If one with the same shortcut already
            exists it is replaced.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={LABEL}>Shortcut</label>
              <input className={FIELD} value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Message</label>
              <textarea
                className={`${FIELD} min-h-[88px]`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={handleSendToLuluChat}
            disabled={isSending || !shortcut.trim() || !message.trim()}
            className="mt-3 rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-50"
          >
            {isSending ? "Sending…" : "Send to LuluChat"}
          </button>
          {sendError && <p className="mt-2 text-sm text-danger">{sendError}</p>}
        </div>
      )}

      {jobs.length > 0 && (
        <div className="mt-5 rounded-[10px] border border-line bg-panel p-4">
          <h2 className="font-medium text-fg">Recent LuluChat sends</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {jobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="min-w-0 truncate text-fg" title={job.shortcut}>
                  {job.shortcut}
                </span>
                <span
                  className={
                    job.status === "failed"
                      ? "text-danger"
                      : job.status === "done"
                        ? "text-status-reserved"
                        : "text-muted"
                  }
                >
                  {JOB_LABEL[job.status]}
                  {job.status === "failed" && job.error ? `: ${job.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PhotoCard({
  photo,
  index,
  isLast,
  onMove,
  onRemove,
}: {
  photo: Photo;
  index: number;
  isLast: boolean;
  onMove: (index: number, by: number) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
  });
  const guide = carPhotoGuideAt(index);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="rounded-[10px] border border-line bg-panel p-2"
    >
      <div
        {...attributes}
        {...listeners}
        className="relative aspect-[4/3] cursor-grab touch-manipulation overflow-hidden rounded-[7px] bg-panel-raised active:cursor-grabbing"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.previewUrl}
          alt={guide.label}
          draggable={false}
          className="h-full w-full object-cover"
        />
        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">
          {index + 1}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-1">
        <span className="min-w-0 truncate text-sm text-fg" title={photo.fileName}>
          {guide.label}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs">
          <button
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label="Move earlier"
            className="rounded px-1.5 py-0.5 text-muted hover:text-amber disabled:opacity-30"
          >
            ◀
          </button>
          <button
            onClick={() => onMove(index, 1)}
            disabled={isLast}
            aria-label="Move later"
            className="rounded px-1.5 py-0.5 text-muted hover:text-amber disabled:opacity-30"
          >
            ▶
          </button>
          <button
            onClick={() => onRemove(photo.id)}
            aria-label="Remove photo"
            className="rounded px-1.5 py-0.5 text-muted hover:text-danger"
          >
            ✕
          </button>
        </span>
      </div>
    </div>
  );
}
