// Entry point, run once per cron tick (Railway cron: every hour, 9am-6pm Malaysia time).
//   node src/monitor.mjs          scrape + send the report to Telegram
//   node src/monitor.mjs --dry    scrape + print the report only (no Telegram)
//   node src/monitor.mjs --force  ignore the 9am-6pm guard
//
// Env:
//   LULUCHAT_STORAGE_STATE_B64  base64 of the saved login (made by `npm run login`)  - or a local .auth/state.json
//   TELEGRAM_BOT_TOKEN          bot token                                             - set on Railway
//   LULUCHAT_TELEGRAM_CHAT_ID   group chat id (comma-separate for several)            - set on Railway
//   LULUCHAT_STAFF              optional roster, e.g. "Awin,Chitra,Anas,Laxmi,Lin" (CLEAR lines); anyone with unread is added automatically
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { buildReport } from "./format.mjs";
import { scrapeUnread, SessionExpiredError } from "./scrape.mjs";

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");
const DEFAULT_ROSTER = "Awin,Chitra,Anas,Laxmi,Lin";

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = (process.env.LULUCHAT_TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (DRY || !token || !chats.length) {
    console.log(DRY ? "--- dry run, not sent ---" : "--- Telegram not configured, printing instead ---");
    console.log(text);
    return;
  }
  for (const chat_id of chats) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text }), // plain text: staff names/emoji need no escaping
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) console.error(`telegram send failed for ${chat_id}:`, data.description ?? res.status);
  }
}

async function loadStorageState() {
  if (process.env.LULUCHAT_STORAGE_STATE_B64) return JSON.parse(Buffer.from(process.env.LULUCHAT_STORAGE_STATE_B64, "base64").toString("utf8"));
  try {
    return JSON.parse(await readFile(new URL("../.auth/state.json", import.meta.url), "utf8"));
  } catch {
    throw new Error("no saved LuluChat login: set LULUCHAT_STORAGE_STATE_B64 or run `npm run login` first");
  }
}

/** Malaysia local hour/minute, to skip stray runs outside working hours. */
function inWorkingHours(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  const mins = +p.hour * 60 + +p.minute;
  return mins >= 8 * 60 + 55 && mins <= 18 * 60 + 15; // cron fires at 9:00 ... 18:00
}

async function main() {
  if (!FORCE && !DRY && !inWorkingHours()) {
    console.log("outside 9am-6pm Malaysia time, skipping");
    return;
  }
  const roster = (process.env.LULUCHAT_STAFF ?? DEFAULT_ROSTER).split(",").map((s) => s.trim()).filter(Boolean);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: await loadStorageState(), viewport: { width: 1280, height: 900 } });
    const channels = await scrapeUnread(context);
    const { text } = buildReport({ channels, roster });
    await sendTelegram(text);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(async (err) => {
  console.error(err);
  const reason = err instanceof SessionExpiredError
    ? "LuluChat login expired - please run the login step again and update LULUCHAT_STORAGE_STATE_B64 on Railway"
    : `check failed (${err.message})`;
  await sendTelegram(`⚠️ LuluChat monitor: ${reason}`).catch(() => {});
  process.exit(0); // alert already sent; a non-zero exit would make Railway restart-loop a cron job
});
