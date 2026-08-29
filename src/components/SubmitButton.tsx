"use client";

import { useTransition } from "react";
import { markSubmitted } from "@/app/submissions/actions";

export function SubmitButton({ submissionId, label }: { submissionId: string; label: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const ok = confirm(
      `Mark "${label}" as submitted to the credit company?\n\nThis assigns its ticket number and can't be undone from here.`
    );
    if (!ok) return;

    startTransition(async () => {
      try {
        await markSubmitted(submissionId);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to mark as submitted");
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded-[6px] bg-success/15 px-2.5 py-1 text-xs font-semibold text-success hover:bg-success/25 disabled:opacity-50"
    >
      {isPending ? "Submitting…" : "Submitted"}
    </button>
  );
}
