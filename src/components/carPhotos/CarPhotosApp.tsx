"use client";

import { useEffect, useRef, useState } from "react";
import { CAR_PHOTO_FIELD_PREFIX, CAR_PHOTO_SLOTS } from "@/lib/carPhotoSlots";

interface Photo {
  blob: Blob;
  previewUrl: string;
}

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

// Phone photos are 4-12MB; the server works at 1568px anyway, so shrink before uploading.
const UPLOAD_MAX_EDGE = 1568;

function shrinkPhoto(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not read that photo"))),
        "image/jpeg",
        0.88
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo - use a JPG or PNG."));
    };
    img.src = url;
  });
}

export function CarPhotosApp() {
  const [name, setName] = useState("");
  const [photos, setPhotos] = useState<Record<string, Photo>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const photosRef = useRef(photos);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      for (const p of Object.values(photosRef.current)) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  const count = Object.keys(photos).length;

  async function handlePick(key: string, file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const blob = await shrinkPhoto(file);
      setPhotos((prev) => {
        if (prev[key]) URL.revokeObjectURL(prev[key].previewUrl);
        return { ...prev, [key]: { blob, previewUrl: URL.createObjectURL(blob) } };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that photo.");
    }
  }

  function handleRemove(key: string) {
    setPhotos((prev) => {
      if (prev[key]) URL.revokeObjectURL(prev[key].previewUrl);
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleMakePdf() {
    setError(null);
    setNotice(null);
    setIsBusy(true);
    try {
      const formData = new FormData();
      formData.set("name", name);
      for (const slot of CAR_PHOTO_SLOTS) {
        const photo = photos[slot.key];
        if (photo) {
          formData.set(`${CAR_PHOTO_FIELD_PREFIX}${slot.key}`, photo.blob, `${slot.key}.jpg`);
        }
      }

      const res = await fetch("/api/car-photos/pdf", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not make the PDF - try again.");
      }

      const platesFound = JSON.parse(res.headers.get("X-Plates-Found") ?? "{}") as Record<string, number>;
      const missed = CAR_PHOTO_SLOTS.filter(
        (s) => s.expectsPlate && photos[s.key] && !platesFound[s.key]
      ).map((s) => s.label);

      const blob = await res.blob();
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
          ? `PDF downloaded. No number plate was found in: ${missed.join(", ")}. Open the PDF and check those pages before sending.`
          : "PDF downloaded. Number plates are blacked out."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make the PDF - try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-5">
      <div className="mb-4 rounded-[10px] border border-line bg-panel p-4">
        <p className="text-sm text-muted">
          Add the car photos following the guide below. The system blacks out every number plate and
          puts the photos into one PDF in this order, one photo per page. Photos are not saved.
        </p>
        <div className="mt-3 max-w-sm">
          <label className={LABEL}>Car plate / name (for the file name)</label>
          <input
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. WWT7595"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CAR_PHOTO_SLOTS.map((slot, i) => {
          const photo = photos[slot.key];
          return (
            <div key={slot.key} className="rounded-[10px] border border-line bg-panel p-2">
              <label className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-[7px] border border-dashed border-line bg-panel-raised hover:border-amber">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.previewUrl} alt={slot.label} className="h-full w-full object-cover" />
                ) : (
                  <span className="px-2 text-center text-xs text-muted">
                    <span className="block text-2xl leading-none text-amber">+</span>
                    {slot.hint}
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void handlePick(slot.key, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm text-fg">
                  <span className="mr-1.5 font-mono text-muted">{i + 1}</span>
                  {slot.label}
                </span>
                {photo && (
                  <button
                    onClick={() => handleRemove(slot.key)}
                    className="text-xs text-muted hover:text-danger hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleMakePdf}
          disabled={count === 0 || isBusy}
          className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-50"
        >
          {isBusy ? "Hiding plates & making PDF…" : "Hide plates & make PDF"}
        </button>
        <span className="text-xs text-muted">
          {count} of {CAR_PHOTO_SLOTS.length} photos added
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {notice && <p className="mt-3 text-sm text-fg">{notice}</p>}
    </div>
  );
}
