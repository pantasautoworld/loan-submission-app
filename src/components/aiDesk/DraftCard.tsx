"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { reviewDraft } from "@/app/ai-desk/actions";

interface Props {
  draftId: string;
  conversationId: string;
  channelLabel: string;
  needsHuman: boolean;
  contactLabel: string;
  customerMessage: string;
  intent: string;
  draftText: string;
  suggestedQuickReply: string | null;
}

export function DraftCard({
  draftId,
  conversationId,
  channelLabel,
  needsHuman,
  contactLabel,
  customerMessage,
  intent,
  draftText,
  suggestedQuickReply,
}: Props) {
  const [text, setText] = useState(draftText);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "approved" | "edited" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        await reviewDraft(draftId, decision, text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  const changed = text.trim() !== draftText.trim();

  return (
    <div className="space-y-3 rounded-[10px] border border-line bg-panel p-4">
      <div className="flex items-center justify-between text-xs text-muted">
        <Link href={`/ai-desk/history/${conversationId}`} className="font-medium text-fg hover:text-amber">
          {contactLabel}
        </Link>
        <span className="flex items-center gap-2">
          {needsHuman && (
            <span className="rounded bg-panel-raised px-2 py-0.5 font-medium text-danger">
              Needs a person
            </span>
          )}
          {intent && <span className="rounded bg-panel-raised px-2 py-0.5">{intent}</span>}
        </span>
      </div>
      {channelLabel && <p className="-mt-2 text-[11px] text-muted">{channelLabel}</p>}

      <p className="rounded-[7px] bg-panel-raised p-2 text-sm text-fg">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Customer</span>
        {customerMessage}
      </p>

      {suggestedQuickReply && (
        <p className="text-xs text-muted">
          Suggested quick reply: <span className="font-medium text-amber">{suggestedQuickReply}</span>
        </p>
      )}

      <label className="block text-[11px] uppercase tracking-wide text-muted">
        AI draft
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm normal-case tracking-normal text-fg outline-none focus:border-amber"
        />
      </label>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => decide(changed ? "edited" : "approved")}
          className="rounded-[7px] bg-amber px-3 py-1.5 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-50"
        >
          {changed ? "Approve edited" : "Approve"}
        </button>
        <button
          disabled={pending}
          onClick={() => decide("rejected")}
          className="rounded-[7px] border border-line px-3 py-1.5 text-sm text-muted hover:border-danger hover:text-danger disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      <p className="text-[11px] text-muted">
        Approving only records your decision for learning - nothing is sent to the customer.
      </p>
    </div>
  );
}
