"use client";

// After a deploy, a page that was already open still calls the previous version's server actions,
// which the new server doesn't know ("Server Action ... was not found on the server"). Reloading
// the page fixes it, so do that automatically - at most once per 30 seconds, so a real problem
// can never turn into a reload loop.
import { unstable_isUnrecognizedActionError } from "next/navigation";

const KEY = "reloaded-for-new-version-at";

/** True (and the page reloads) when `err` means this page is from an older deploy. */
export function reloadIfOutdated(err: unknown): boolean {
  if (!unstable_isUnrecognizedActionError(err)) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // storage blocked: still reload once - the next page load is the new version
  }
  window.location.reload();
  return true;
}
