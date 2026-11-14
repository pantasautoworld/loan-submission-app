"use client";

import { useTransition } from "react";
import { setAiEnabled } from "@/app/ai-desk/actions";

export function KillSwitch({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => setAiEnabled(!enabled))}
      className={
        enabled
          ? "rounded-[7px] border border-danger/50 px-3 py-1.5 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
          : "rounded-[7px] bg-amber px-3 py-1.5 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-50"
      }
    >
      {pending ? "Saving…" : enabled ? "STOP AI" : "Turn AI back on"}
    </button>
  );
}
