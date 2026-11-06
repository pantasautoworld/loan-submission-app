// Entry point, run by a Railway cron every 5 minutes.
//   node src/quickreply.mjs
// Looks in the app's database for "Send to LuluChat" jobs (Car Photos page). With none waiting it
// exits straight away (no browser is started). Otherwise it creates / replaces the car's Quick Reply
// (shortcut + message + the Car Photos PDF) in EVERY connected LuluChat channel - each channel keeps
// its own Quick Reply list - and records the result back on the job row.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   the app's database (set on Railway as references to the main app)
//   LULUCHAT_STORAGE_STATE_B64                 saved LuluChat login (same as the monitor)
//   TELEGRAM_BOT_TOKEN, LULUCHAT_TELEGRAM_CHAT_ID   failure alerts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  INBOX_URL,
  SessionExpiredError,
  closeChannelModal,
  currentPhone,
  extractChannelCards,
  openChannelModal,
  switchChannel,
  withTimeout,
} from "./scrape.mjs";
import { loadStorageState } from "./state.mjs";
import { upsertQuickReply } from "./quickreplyFlow.mjs";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BUCKET = "submission-files";
const MAX_JOBS_PER_RUN = 3;
const STUCK_AFTER_MS = 20 * 60_000;
const HARD_LIMIT_MS = 13 * 60_000;

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

/** Playwright errors carry a long call log; only the first line is useful on the page / in Telegram. */
const firstLine = (err) => String(err?.message ?? err).split(/\r?\n/)[0];

async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...headers, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`database ${method} ${path.split("?")[0]} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = (process.env.LULUCHAT_TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || !chats.length) {
    console.log("(Telegram not configured)", text);
    return;
  }
  for (const chat_id of chats) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text }),
    }).catch(() => {});
  }
}

async function finishJob(job, status, error) {
  await rest(`luluchat_quick_reply_jobs?id=eq.${job.id}`, {
    method: "PATCH",
    body: { status, error: error ? String(error).slice(0, 500) : null, updated_at: new Date().toISOString(), finished_at: new Date().toISOString() },
  });
}

async function downloadPdf(job, dir) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${job.file_path}`, { headers });
  if (!res.ok) throw new Error(`could not read the PDF from storage (${res.status})`);
  const name = `${(job.plate || "car").replace(/[^A-Za-z0-9]/g, "")} Photos.pdf`;
  const filePath = join(dir, name);
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
  return filePath;
}

async function readChannels(page) {
  await page.goto(INBOX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("tab", { name: /^Unread/ }).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {
    throw new SessionExpiredError("inbox did not load (login page shown?)");
  });
  const originalPhone = await currentPhone(page);
  await openChannelModal(page);
  const channels = await page.evaluate(extractChannelCards);
  await closeChannelModal(page);
  if (!channels.length) throw new Error("no channels found in the Channels dialog");
  return { channels, originalPhone };
}

async function runJob(context, job, pdfPath) {
  const page = await context.newPage();
  const done = [];
  const failed = [];
  let originalPhone = "";
  try {
    const found = await readChannels(page);
    originalPhone = found.originalPhone;
    for (const ch of found.channels) {
      try {
        await page.goto(INBOX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 }); // fresh page: no dialog left open by the previous channel
        await withTimeout(switchChannel(page, ch.phone), 90_000, `switching to ${ch.title}`);
        await withTimeout(
          upsertQuickReply(page, { shortcut: job.shortcut, message: job.message, filePath: pdfPath }, (m) => console.log(`[${ch.title}] ${m}`)),
          180_000,
          `saving the quick reply in ${ch.title}`
        );
        done.push(ch.title);
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        console.error(`[${ch.title}] failed:`, err.message);
        failed.push(`${ch.title}: ${firstLine(err)}`);
      }
    }
  } finally {
    // tidy-up: leave the account on the channel it started on
    if (originalPhone) await withTimeout(switchChannel(page, originalPhone), 60_000, "switching back").catch(() => {});
    await page.close().catch(() => {});
  }
  return { done, failed };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");

  // a run that died mid-job leaves it "running" forever - fail it so the page shows the problem
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  const stuck = await rest(`luluchat_quick_reply_jobs?status=eq.running&updated_at=lt.${cutoff}&select=*`);
  for (const job of stuck) await finishJob(job, "failed", "the robot stopped before finishing - press Send to LuluChat again");

  const queued = await rest(`luluchat_quick_reply_jobs?status=eq.queued&order=created_at.asc&limit=${MAX_JOBS_PER_RUN}&select=*`);
  if (!queued.length) {
    console.log("no quick reply jobs waiting");
    return;
  }

  const browser = await chromium.launch({ headless: true, channel: process.env.LULUCHAT_BROWSER_CHANNEL || undefined }); // channel only for local runs (installed Chrome)
  const dir = await mkdtemp(join(tmpdir(), "quickreply-"));
  try {
    const context = await browser.newContext({ storageState: await loadStorageState(), viewport: { width: 1316, height: 917 } });
    for (const job of queued) {
      // claim it (only if still queued - guards against two runs overlapping)
      const claimed = await rest(`luluchat_quick_reply_jobs?id=eq.${job.id}&status=eq.queued`, {
        method: "PATCH",
        body: { status: "running", attempts: job.attempts + 1, updated_at: new Date().toISOString() },
        prefer: "return=representation",
      });
      if (!claimed.length) continue;

      try {
        console.log(`job ${job.id}: "${job.shortcut}"`);
        const pdfPath = await downloadPdf(job, dir);
        const { done, failed } = await runJob(context, job, pdfPath);
        if (failed.length) {
          const msg = `${done.length ? `Saved in ${done.join(", ")}. ` : ""}Failed - ${failed.join("; ")}`;
          await finishJob(job, "failed", msg);
          await sendTelegram(`⚠️ LuluChat quick reply "${job.shortcut}" - ${msg}`);
        } else {
          await finishJob(job, "done");
          await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${job.file_path}`, { method: "DELETE", headers }).catch(() => {});
          console.log(`job ${job.id}: saved in ${done.join(", ")}`);
        }
      } catch (err) {
        console.error(err);
        const reason = err instanceof SessionExpiredError
          ? "LuluChat login expired - run the login step again and update LULUCHAT_STORAGE_STATE_B64 on Railway"
          : firstLine(err);
        await finishJob(job, "failed", reason).catch(() => {});
        await sendTelegram(`⚠️ LuluChat quick reply "${job.shortcut}" failed: ${reason}`);
        if (err instanceof SessionExpiredError) break; // the next jobs would fail the same way
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await browser.close().catch(() => {});
  }
}

setTimeout(async () => {
  console.error("hard time limit reached, aborting");
  await sendTelegram("⚠️ LuluChat quick reply robot took too long and was stopped").catch(() => {});
  process.exit(0);
}, HARD_LIMIT_MS).unref();

main().catch(async (err) => {
  console.error(err);
  await sendTelegram(`⚠️ LuluChat quick reply robot: ${err.message}`).catch(() => {});
  process.exit(0); // alert sent; a non-zero exit would make Railway restart-loop a cron job
});
