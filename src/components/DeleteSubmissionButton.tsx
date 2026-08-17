"use client";

import { useTransition } from "react";
import { deleteSubmission } from "@/app/submissions/actions";

export function DeleteSubmissionButton({
  submissionId,
  label,
}: {
  submissionId: string;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const ok = confirm(
      `Delete the submission for "${label}"?\n\nThis permanently removes all its documents, signatures, and generated PDFs. This cannot be undone.`
    );
    if (!ok) return;

    startTransition(async () => {
      try {
        await deleteSubmission(submissionId);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete submission");
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-xs text-muted hover:text-danger hover:underline disabled:opacity-50"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
