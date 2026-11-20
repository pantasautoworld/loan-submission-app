// AI Reply Desk - step 3: live reader. Turns customers' new (unread) messages into AI draft replies for review.
//
// SAFETY: read-only toward LuluChat and it SENDS NOTHING. It never opens a chat (so nothing is marked read and
// no read receipt is sent): it only reads the Unread list, where LuluChat already shows each customer's latest
// message. The earlier conversation comes from the history saved in the database. Drafts are saved with status
// "pending" for an admin to approve / edit / reject on the AI Reply Desk page.
//
//   node src/live.mjs --rows --channel 60179952261   show the unread rows it can see (no AI, no database writes)
//   node src/live.mjs --dry  --channel 60179952261   also write drafts with Claude, print them, save nothing
//   node src/live.mjs        full run: all channels, drafts saved
// Flags: --channel <phone>   --max <n> drafts per run (default 15)
// Honours the kill switch (ai_settings.ai_enabled = false -> exits at once).
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import {
  INBOX_URL, sleep, switchChannel, currentPhone, openChannelModal, closeChannelModal,
  extractChannelCards, withTimeout, SessionExpiredError,
} from "./scrape.mjs";
import { loadStorageState } from "./state.mjs";
import {
  MODEL, ask, draftSystem, findProfile, flagReader, isAutomation, loadEnv, loadRecent, log, mask, maskIc, messageLine, parseJson, rest, usage,
} from "./aiShared.mjs";

const args = process.argv.slice(2);
const flag = flagReader(args);
const ROWS_ONLY = args.includes("--rows");
const DRY = args.includes("--dry") || ROWS_ONLY;
const ONLY_CHANNEL = String(flag("channel", ""));
const MAX_DRAFTS = Number(flag("max", 15));
const HARD_LIMIT_MS = 8 * 60_000; // never overlap the next 5-minute tick for long

// ---------- in-page ----------
function getRows() {
  return [...document.querySelectorAll('[class*="chatRowContainer"]')].map((row) => {
    const lines = row.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
    const wrapper = row.querySelector('[class*="durationWrapper"]');
    const timeEl = wrapper?.querySelector('[class*="_duration"]:not([class*="Wrapper"])');
    return {
      lines,
      time: (timeEl?.textContent ?? "").trim(),
      assignee: (wrapper?.children[1]?.innerText ?? "").trim(),
    };
  });
}
function scrollList() {
  const row = document.querySelector('[class*="chatRowContainer"]');
  let el = row?.parentElement;
  while (el && !(el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
  if (!el) return { atBottom: true };
  el.scrollTop += Math.max(200, Math.floor(el.clientHeight * 0.8));
  return { atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 4 };
}

/** One list row -> { name, phone, assignee, time, preview, unreadCount }. */
function parseRow(r) {
  const phone = r.lines.find((l) => /^\d{9,15}$/.test(l)) ?? "";
  const countLine = r.lines.find((l) => /^\d{1,3}$/.test(l));
  const name = r.lines[0] ?? "";
  const preview = r.lines.find((l, i) => i > 0 && !/^\d{1,15}$/.test(l) && l !== r.assignee && l !== r.time) ?? "";
  return { name, phone: phone || name, assignee: r.assignee, time: r.time, preview, unreadCount: countLine ? Number(countLine) : 0 };
}

let listComplete = true; // false when the unread list could not be read to the end (do not expire drafts then)

async function collectUnread(page) {
  const seen = new Map();
  let quiet = 0;
  const deadline = Date.now() + 120_000;
  listComplete = true;
  for (let i = 0; i < 300 && quiet < 4; i++) {
    if (Date.now() >= deadline) { listComplete = false; break; }
    const before = seen.size;
    for (const r of await page.evaluate(getRows)) seen.set(r.lines.join("|") + r.time, parseRow(r));
    const { atBottom } = await page.evaluate(scrollList);
    await sleep(350);
    if (atBottom) {
      const more = page.getByText("Load More", { exact: true }).first();
      if (await more.isVisible().catch(() => false)) { await more.click(); await sleep(2000); }
    }
    quiet = seen.size === before ? quiet + 1 : 0;
  }
  return [...seen.values()];
}

// ---------- drafting ----------
const MEDIA_ONLY = /^(\s*(\[.*\]|voice (call|note)|missed (voice|video)? ?call|audio|photo|image|video|sticker|document|file|location|contact)\b|[\u{1F4F7}\u{1F3A4}\u{1F3A5}\u{1F4CE}])/iu;
// money / percentage figures the AI must not invent
const FIGURE = /(rm\s?\d[\d,.]*|\d[\d,.]*\s?(k|ribu|%|percent|peratus)\b)/gi;

function risky(draftText, playbook) {
  const known = playbook.map((p) => p.rule_text).join(" ").toLowerCase().replace(/\s+/g, "");
  return (draftText.match(FIGURE) ?? []).some((f) => !known.includes(f.toLowerCase().replace(/\s+/g, "")));
}

async function findOrCreateConversation(channel, title, c) {
  const phone = encodeURIComponent(c.phone);
  const found = await rest(`ai_conversations?channel=eq.${channel.phone}&contact_phone=eq.${phone}&select=id,contact_name`);
  if (found.length) return found[0];
  const [created] = await rest("ai_conversations", {
    method: "POST",
    prefer: "return=representation",
    body: [{ channel: channel.phone, channel_title: title, contact_phone: c.phone, contact_name: c.phone === c.name ? "" : c.name, assignee: c.assignee || null, status: "open" }],
  });
  return created;
}

async function draftFor(channel, c, playbook, profiles) {
  const customerText = maskIc(c.preview).trim();
  const conv = await findOrCreateConversation(channel, channel.title, c);
  const sourceKey = createHash("sha1").update(`${channel.phone}|${c.phone}|${c.time}|${customerText}`).digest("hex");
  const dup = await rest(`ai_drafts?source_key=eq.${sourceKey}&select=id`);
  if (dup.length) return { skipped: "already drafted", conv };

  // very short names ("A", "$", "UM") are not unique, so their saved chat may belong to someone else: use no history
  const ambiguous = c.phone === c.name && c.name.replace(/[^\p{L}\p{N}]/gu, "").length < 4;
  const history = ambiguous ? [] : (await loadRecent(conv.id, 14)).map(messageLine).filter(Boolean);
  // the last saved line may already be this very message (if the history reader saved it): do not show it twice
  const tail = `C: ${mask(customerText)}`;
  if (history.at(-1) === tail) history.pop();
  const dialogue = [...history, tail].join("\n");

  const mediaOnly = !customerText || MEDIA_ONLY.test(customerText);
  const profile = findProfile(profiles, c.assignee);
  const prompt = `Chat so far (last line is the customer message to answer):\n${dialogue}`;
  let raw;
  for (let attempt = 1; ; attempt++) { // Claude occasionally answers in plain text instead of JSON: ask once more
    try { raw = parseJson(await ask(draftSystem(playbook, profile), prompt, 1500)); break; } catch (err) { if (attempt >= 2) throw err; }
  }
  const draftText = String(raw.draft_text ?? "").trim();
  if (!draftText) return { skipped: "AI gave an empty draft", conv };
  const needsHuman = Boolean(raw.needs_human) || mediaOnly || risky(draftText, playbook);
  return {
    conv,
    row: {
      conversation_id: conv.id,
      intent: String(raw.intent ?? "").slice(0, 80),
      draft_text: draftText,
      confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0)),
      status: "pending",
      customer_message: customerText,
      source_key: sourceKey,
      needs_human: needsHuman,
    },
    profile: profile?.staff_name ?? "(generic)",
  };
}

// ---------- main ----------
async function main() {
  await loadEnv();
  const settings = await rest("ai_settings?select=key,value");
  if (settings.find((s) => s.key === "ai_enabled")?.value === "false") { log("AI kill switch is OFF - nothing to do"); return; }

  const playbook = ROWS_ONLY ? [] : await rest("ai_playbook?select=topic,rule_text,examples&order=topic.asc");
  const profiles = new Map((ROWS_ONLY ? [] : await rest("ai_staff_profiles?select=*")).map((p) => [p.staff_name, p]));
  if (!ROWS_ONLY && !playbook.length) throw new Error("the playbook is empty - run learn.mjs first");
  log(`model ${MODEL}${ROWS_ONLY ? " (rows only)" : DRY ? " (dry run - nothing saved)" : ""}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: await loadStorageState(), viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let originalPhone = "";
  const totals = { unread: 0, drafted: 0, skipped: 0, flagged: 0, expired: 0, errors: 0 };
  let drafts = 0;

  try {
    await page.goto(INBOX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (!page.url().includes("/inbox")) throw new SessionExpiredError(`redirected to ${page.url()}`);
    await page.getByRole("tab", { name: /^Unread/ }).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {
      throw new SessionExpiredError("inbox did not load");
    });
    originalPhone = await currentPhone(page);
    await openChannelModal(page);
    let channels = await page.evaluate(extractChannelCards);
    await closeChannelModal(page);
    if (ONLY_CHANNEL) channels = channels.filter((c) => c.phone === ONLY_CHANNEL);
    if (!channels.length) throw new Error("no channel to read");
    log("channels:", channels.map((c) => `${c.title} (${c.phone})`).join(", "));

    for (const ch of channels) {
      await withTimeout(switchChannel(page, ch.phone), 90_000, `switching to ${ch.title}`);
      await page.getByRole("tab", { name: /^Unread/ }).first().click();
      await page.getByText("Unread List Conversations").first().waitFor({ state: "visible", timeout: 15_000 });
      await sleep(2500);
      const rows = (await withTimeout(collectUnread(page), 150_000, `reading ${ch.title}`)).filter((r) => r.preview || r.unreadCount);
      log(`== ${ch.title}: ${rows.length} unread chat(s)`);
      totals.unread += rows.length;

      if (ROWS_ONLY) {
        for (const r of rows) console.log(`   ${r.name} | phone ${r.phone} | ${r.assignee || "Unassigned"} | ${r.time} | unread ${r.unreadCount} | "${r.preview.slice(0, 70)}"`);
        continue;
      }

      for (const c of rows) {
        if (drafts >= MAX_DRAFTS) break;
        if (!c.preview) { totals.skipped++; continue; }
        try {
          const out = await draftFor(ch, c, playbook, profiles);
          if (out.skipped) { totals.skipped++; continue; }
          drafts++; totals.drafted++; if (out.row.needs_human) totals.flagged++;
          log(`  draft for ${c.name} (${out.profile})${out.row.needs_human ? " [needs a person]" : ""}`);
          if (DRY) {
            console.log(`    customer: ${c.preview.slice(0, 120)}\n    AI draft: ${out.row.draft_text.replace(/\n/g, " / ")}`);
          } else {
            // source_key is unique: a duplicate (two runs at once) just fails this one insert
            await rest("ai_drafts", { method: "POST", prefer: "return=minimal", body: [out.row] });
            await rest(`ai_conversations?id=eq.${out.conv.id}`, { method: "PATCH", prefer: "return=minimal", body: { status: out.row.needs_human ? "needs_human" : "open", last_message_at: new Date().toISOString() } });
          }
        } catch (err) {
          totals.errors++;
          log(`  failed for ${c.name}: ${err.message}`);
        }
      }

      // drafts whose chat is no longer unread (someone answered it) are no longer needed
      if (!DRY && listComplete) {
        const pending = await rest(`ai_drafts?status=eq.pending&select=id,conversation_id,ai_conversations!inner(channel,contact_phone)&ai_conversations.channel=eq.${ch.phone}`);
        const stillUnread = new Set(rows.map((r) => r.phone));
        const stale = pending.filter((d) => !stillUnread.has(d.ai_conversations.contact_phone)).map((d) => d.id);
        if (stale.length) {
          await rest(`ai_drafts?id=in.(${stale.join(",")})&status=eq.pending`, { method: "PATCH", prefer: "return=minimal", body: { status: "expired" } });
          totals.expired += stale.length;
        }
      }
    }
  } finally {
    log("DONE", JSON.stringify(totals), `tokens ${usage.input} in / ${usage.output} out`);
    try { if (originalPhone) await withTimeout(switchChannel(page, originalPhone), 60_000, "switching back"); } catch { /* best effort */ }
    await browser.close().catch(() => {});
  }
}

async function alertTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = (process.env.LULUCHAT_TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (DRY || !token || !chats.length) return;
  for (const chat_id of chats) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id, text }) }).catch(() => {});
  }
}

setTimeout(() => { console.error("hard time limit reached, aborting"); process.exit(0); }, HARD_LIMIT_MS).unref();
main().catch(async (err) => {
  console.error(err);
  // an expired login is already reported by the hourly monitor; only tell the team about other failures
  if (!(err instanceof SessionExpiredError)) await alertTelegram(`⚠️ AI Reply Desk live reader: ${err.message}`);
  process.exit(0);
});
