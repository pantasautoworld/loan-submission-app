// Run by tick.mjs every 5 minutes, after quickreply.mjs.
//   node src/photoLinks.mjs          (add --force to sync now)
// Copies the PDF links of LuluChat quick replies (the car photo PDFs, shortcut "<car> - <PLATE>") into the
// app's database table luluchat_quick_reply_docs, so the Broker Sheet can give brokers each car's PDF.
// Read-only toward LuluChat: it opens the Quick Replies list in an archived chat with no unread messages
// (same as quickreply.mjs) and reads LuluChat's own answer. It syncs when the last sync is over an hour
// old, or when a "Send to LuluChat" job has finished since (new / replaced PDF); otherwise it exits at once.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LULUCHAT_STORAGE_STATE_B64 (same as quickreply.mjs)
import { chromium } from "playwright";
import { SessionExpiredError } from "./scrape.mjs";
import { loadStorageState } from "./state.mjs";
import { openManager, openQuietArchivedChat } from "./quickreplyFlow.mjs";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SYNC_EVERY_MS = 60 * 60_000;
const PER_PAGE = 1000;
const HARD_LIMIT_MS = 4 * 60_000;
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...headers, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`database ${method} ${path.split("?")[0]} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 || res.status === 201 ? null : res.json();
}

async function syncNeeded() {
  if (process.argv.includes("--force")) return true;
  const [last] = await rest("luluchat_quick_reply_docs?select=synced_at&order=synced_at.desc&limit=1");
  if (!last) return true;
  if (Date.now() - Date.parse(last.synced_at) > SYNC_EVERY_MS) return true;
  const jobs = await rest(`luluchat_quick_reply_jobs?status=eq.done&finished_at=gt.${encodeURIComponent(last.synced_at)}&select=id&limit=1`);
  return jobs.length > 0;
}

/** Every quick reply of the current channel, read from LuluChat's own list request (asked for in one big page). */
async function readAllQuickReplies(page) {
  let answer = null;
  // the list opens with 20 per page; ask for all of them in that same request
  await page.route(/\/quick-replies\?/, (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.continue();
    const url = new URL(req.url());
    url.searchParams.set("page", "1");
    url.searchParams.set("perpage", String(PER_PAGE));
    return route.continue({ url: url.toString() });
  });
  page.on("response", async (res) => {
    if (answer || res.request().method() !== "GET" || !/\/quick-replies\?/.test(res.url())) return;
    try {
      answer = await res.json();
    } catch {}
  });
  await openQuietArchivedChat(page);
  await openManager(page);
  for (let i = 0; i < 20 && !answer; i++) await page.waitForTimeout(500);
  if (!answer || !Array.isArray(answer.data)) throw new Error("LuluChat did not return the quick reply list");
  const total = answer.meta?.total ?? answer.data.length;
  if (answer.data.length < total) {
    throw new Error(`LuluChat returned ${answer.data.length} of ${total} quick replies - not all at once`);
  }
  return answer.data;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  if (!(await syncNeeded())) {
    console.log("quick reply PDF links are up to date");
    return;
  }

  const browser = await chromium.launch({ headless: true, channel: process.env.LULUCHAT_BROWSER_CHANNEL || undefined });
  let replies;
  try {
    const context = await browser.newContext({ storageState: await loadStorageState(), viewport: { width: 1316, height: 917 } });
    replies = await readAllQuickReplies(await context.newPage());
  } finally {
    await browser.close().catch(() => {});
  }

  const now = new Date().toISOString();
  const rows = [];
  for (const r of replies) {
    if (r.type !== "document" || !r.shortcut) continue;
    const doc = (r.info ?? []).find((i) => /^https:\/\//.test(i?.ori_url ?? ""));
    if (!doc) continue;
    rows.push({
      id: r.id,
      shortcut: String(r.shortcut).trim(),
      url: doc.ori_url.split("?")[0], // the ?f=<filename> part only names the download
      filename: doc.filename ?? "",
      lc_created_at: r.meta?.created ?? null,
      synced_at: now,
    });
  }

  if (rows.length) {
    await rest("luluchat_quick_reply_docs?on_conflict=id", { method: "POST", body: rows, prefer: "resolution=merge-duplicates" });
  }
  // quick replies deleted in LuluChat: drop them (only rows not touched by this sync)
  await rest(`luluchat_quick_reply_docs?synced_at=lt.${encodeURIComponent(now)}`, { method: "DELETE" });
  console.log(`quick reply PDF links: ${rows.length} documents (of ${replies.length} quick replies) saved`);
}

setTimeout(() => {
  console.error("photoLinks: time limit reached, aborting");
  process.exit(0);
}, HARD_LIMIT_MS).unref();

main().catch((err) => {
  console.error("photoLinks:", err instanceof SessionExpiredError ? "LuluChat login expired" : err.message);
  process.exit(0); // the quick reply robot already alerts on an expired login; next tick retries
});
