"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const EVERY_MS = 30_000;

/**
 * Re-runs the page's server queries every 30 seconds (and when the tab comes back into view) so new drafts
 * appear without a reload. Only server data is refreshed: text a person is typing into a draft is kept.
 */
export function AutoRefresh({ renderedAt }: { renderedAt: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const poll = setInterval(refresh, EVERY_MS);
    const clock = setInterval(() => setNow(Date.now()), 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  const ageSeconds = Math.max(0, Math.round((now - new Date(renderedAt).getTime()) / 1000));
  const time = new Date(renderedAt).toLocaleTimeString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <p className="text-[11px] text-muted">
      Updates by itself every 30 seconds. Last checked {time}
      {ageSeconds > 90 ? " (this tab was idle - refresh the page)" : ""}.
    </p>
  );
}
