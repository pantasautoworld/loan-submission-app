"use client";

import { useId, useState } from "react";

interface Props {
  label: string;
  required?: boolean;
  hint?: string;
  uploaded?: boolean;
  busy?: boolean;
  accept?: string;
  /** Lets the picker/drop accept more than one file at once - use with onSelectMultiple. */
  multiple?: boolean;
  onSelect: (file: File) => void;
  /** Called instead of onSelect when multiple is true and more than one file is picked/dropped. */
  onSelectMultiple?: (files: File[]) => void;
  /** Shows a delete button next to the box once uploaded, e.g. to remove a wrong file. */
  onDelete?: () => void;
}

export function UploadBox({
  label,
  required,
  hint,
  uploaded,
  busy,
  accept,
  multiple,
  onSelect,
  onSelectMultiple,
  onDelete,
}: Props) {
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (multiple && onSelectMultiple) {
      onSelectMultiple(Array.from(files));
    } else if (files[0]) {
      onSelect(files[0]);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted"
      >
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
        {hint && (
          <span className="ml-2 text-[11px] font-normal normal-case text-muted">({hint})</span>
        )}
      </label>
      <div className="flex items-stretch gap-2">
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-1 cursor-pointer items-center gap-3 rounded-[7px] border border-dashed px-3 py-2.5 transition-colors ${
            dragOver
              ? "border-amber bg-amber-dim/30"
              : uploaded
                ? "border-success/50 bg-success/10"
                : "border-line bg-panel-raised hover:border-amber/60"
          }`}
        >
          <span
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[6px] ${
              uploaded ? "bg-success/20 text-success" : "bg-panel text-muted"
            }`}
          >
            {uploaded ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.6 3.6 6.7-6.7a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M10 3a1 1 0 011 1v7.6l2.3-2.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L9 11.6V4a1 1 0 011-1z" />
                <path d="M4 15a1 1 0 011 1v1a1 1 0 001 1h8a1 1 0 001-1v-1a1 1 0 112 0v1a3 3 0 01-3 3H6a3 3 0 01-3-3v-1a1 1 0 011-1z" />
              </svg>
            )}
          </span>
          <span className="text-sm text-muted">
            {busy ? (
              "Uploading…"
            ) : dragOver ? (
              <span className="font-medium text-amber">Drop file here</span>
            ) : (
              <>
                {uploaded ? "Uploaded — " : "Drag & drop or "}
                <span className="font-medium text-amber">
                  {uploaded ? "Replace file" : "click to upload"}
                </span>
              </>
            )}
          </span>
          <input
            id={inputId}
            type="file"
            accept={accept}
            multiple={multiple}
            disabled={busy}
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {uploaded && onDelete && (
          <button
            type="button"
            title="Delete uploaded file"
            disabled={busy}
            onClick={onDelete}
            className="flex w-9 flex-shrink-0 items-center justify-center rounded-[7px] border border-line text-muted transition-colors hover:border-danger hover:bg-danger/10 hover:text-danger disabled:opacity-40"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M8 2a1 1 0 00-1 1v1H4a1 1 0 000 2h.5l.7 10.1A2 2 0 007.2 18h5.6a2 2 0 002-1.9L15.5 6h.5a1 1 0 100-2h-3V3a1 1 0 00-1-1H8zm1 2h2V4H9v0zM7.9 7a.75.75 0 01.75.75l.3 7a.75.75 0 01-1.5.06l-.3-7A.75.75 0 017.9 7zm4.2 0a.75.75 0 01.75.7l-.3 7a.75.75 0 01-1.5-.06l.3-7a.75.75 0 01.75-.64z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
