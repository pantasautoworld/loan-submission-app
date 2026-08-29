"use client";

import { useTransition } from "react";
import { undoSubmitted } from "@/app/submissions/actions";

export function UndoSubmitButton({
  submissionId,
  label,
  ticketNo,
}: {
  submissionId: string;
  label: string;
  ticketNo: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const ok = confirm(
      `Undo "Submitted" for "${label}"?\n\n` +
        `This removes ticket number ${ticketNo ?? "-"} - a new one will be assigned ` +
        `the next time it's marked Submitted.`
    );
    if (!ok) return;

    startTransition(async () => {
      try {
        await undoSubmitted(submissionId);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to undo");
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-[11px] text-muted hover:text-danger hover:underline disabled:opacity-50"
    >
      {isPending ? "…" : "Undo"}
    </button>
  );
}
