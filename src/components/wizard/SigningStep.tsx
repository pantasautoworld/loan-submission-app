"use client";

import { useEffect, useRef, useState } from "react";
import { recordSignature } from "@/app/submissions/[id]/edit/actions";
import { uploadSubmissionFile, getSignedUrl } from "@/lib/storage";
import type { PersonRow, SignerRole } from "@/lib/types";

interface SignerSpec {
  role: SignerRole;
  label: string;
  defaultName: string;
}

interface Props {
  submissionId: string;
  signers: SignerSpec[];
  persons: PersonRow[];
  onAllSigned?: () => void;
  onSigned?: (role: SignerRole, fields: Record<string, string>) => void;
}

export function SigningStep({ submissionId, signers, persons, onAllSigned, onSigned }: Props) {
  const signedRoles = new Set(persons.filter((p) => p.signature_path).map((p) => p.role));

  useEffect(() => {
    if (signers.every((s) => signedRoles.has(s.role))) onAllSigned?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persons]);

  return (
    <div className="space-y-6">
      <h3 className="font-medium text-fg">Signing</h3>
      <p className="text-sm text-muted">
        Hand the device to each signer in turn and have them draw their own signature with a
        finger, stylus, or mouse — this must be done by the actual person, not filled in on
        their behalf.
      </p>

      {signers.map((s) => {
        const person = persons.find((p) => p.role === s.role);
        if (person?.signature_path) {
          return <SignedPanel key={s.role} label={s.label} person={person} />;
        }
        return (
          <SignPanel
            key={s.role}
            submissionId={submissionId}
            role={s.role}
            label={s.label}
            defaultName={s.defaultName}
            onSigned={onSigned}
          />
        );
      })}
    </div>
  );
}

function SignedPanel({ label, person }: { label: string; person: PersonRow }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!person.signature_path) return;
    getSignedUrl(person.signature_path).then(({ data }) => {
      if (data) setUrl(data.signedUrl);
    });
  }, [person.signature_path]);

  return (
    <div className="rounded-[10px] border border-success/40 bg-success/10 p-3">
      <p className="text-sm font-medium text-success">
        {label}: signed as &ldquo;{person.signed_name}&rdquo;
      </p>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="signature" className="mt-2 h-16 rounded bg-white" />
      )}
    </div>
  );
}

function SignPanel({
  submissionId,
  role,
  label,
  defaultName,
  onSigned,
}: {
  submissionId: string;
  role: SignerRole;
  label: string;
  defaultName: string;
  onSigned?: (role: SignerRole, fields: Record<string, string>) => void;
}) {
  const [hasDrawn, setHasDrawn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    lastPoint.current = pointFromEvent(e);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const point = pointFromEvent(e);
    if (!ctx || !lastPoint.current) return;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    if (!hasDrawn) setHasDrawn(true);
  }

  function stopDrawing() {
    isDrawing.current = false;
    lastPoint.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  async function adopt() {
    if (!hasDrawn) return;
    setSaving(true);
    setError(null);
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas not ready");
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Could not save the drawn signature");
      const file = new File([blob], `${role}-signature.png`, { type: "image/png" });
      const path = await uploadSubmissionFile(submissionId, `${role}-signature`, file);
      await recordSignature(submissionId, role, {
        signature_path: path,
        signed_name: defaultName,
      });
      onSigned?.(role, {
        signature_path: path,
        signed_name: defaultName,
        signed_at: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save signature");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[10px] border border-line bg-panel-raised/40 p-4">
      <p className="text-sm font-medium text-fg">{label}</p>

      <div>
        <label className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted">
          <span>Draw your signature below</span>
          <button
            type="button"
            onClick={clearCanvas}
            className="text-amber normal-case hover:underline disabled:text-muted/50"
            disabled={!hasDrawn}
          >
            Clear
          </button>
        </label>
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="w-full touch-none rounded-[7px] border border-line bg-white"
          style={{ aspectRatio: "600 / 180" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
        />
        {!hasDrawn && (
          <p className="mt-1 text-xs text-muted">
            Sign with a finger, stylus, or mouse inside the box above.
          </p>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        type="button"
        disabled={!hasDrawn || saving}
        onClick={adopt}
        className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-40"
      >
        {saving ? "Saving…" : "Adopt signature"}
      </button>
    </div>
  );
}
