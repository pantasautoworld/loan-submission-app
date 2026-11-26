"use client";

import { useEffect } from "react";
import { reloadIfOutdated } from "@/lib/reloadOnNewVersion";

/** Any server action call that fails because the page is from an older deploy reloads the page. */
export function ReloadOnNewVersion() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (reloadIfOutdated(e.reason)) e.preventDefault();
    };
    const onError = (e: ErrorEvent) => {
      if (reloadIfOutdated(e.error)) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}
