// AI Reply Desk - history reader.
// Reads old LuluChat conversations (about 6 months) and saves them to Supabase so the AI can learn
// how each staff member replies. READ-ONLY toward LuluChat: it never types, never sends, never
// closes/archives/tags anything. It only opens chats that are ALREADY READ (rows with an unread
// badge are skipped), and it refuses to open any chat unless LuluChat's "Incognito" switch reads On.
//
//   node src/history.mjs --channel 60179952261 --tabs Closed --limit 10 --dry     (look, don't save)
//   node src/history.mjs --channel 60179952261 --tabs Closed,All,Archived         (full run, resumable)
//
// Flags: --channel <phone>  one channel (default: all channels)   --tabs <a,b>  default Closed,All,Archived
//        --limit <n>  max chats per channel+tab                   --days <n>   how far back (default 185)
//        --dry        print what would be saved, write nothing
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { loadStorageState } from "./state.mjs";
import {
  INBOX_URL, sleep, switchChannel, currentPhone, openChannelModal, closeChannelModal,
  extractChannelCards, withTimeout,
} from "./scrape.mjs";

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] ?? true) : dflt; };
const ONLY_CHANNEL = flag("channel", "");
const TABS = String(flag("tabs", "Closed,All,Archived")).split(",").map((s) => s.trim()).filter(Boolean);
const LIMIT = Number(flag("limit", 100000));
const DAYS = Number(flag("days", 185));
const DRY = args.includes("--dry");
const CUTOFF = Date.now() - DAYS * 86_400_000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- env + Supabase (plain REST, service role; never printed) ----------
async function loadEnv() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  const txt = await readFile(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
async function sb(path, body, prefer = "return=minimal") {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`supabase ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return prefer.includes("representation") ? res.json() : null;
}

// ---------- privacy: mask IC numbers before anything is stored ----------
export function maskIc(text) {
  const valid = (yy, mm, dd) => Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31;
  return text
    .replace(/\b(\d{2})(\d{2})(\d{2})-\d{2}-\d{4}\b/g, "[IC]")
    .replace(/\b(\d{2})(\d{2})(\d{2})(\d{2})(\d{4})\b/g, (m, yy, mm, dd) =>
      m.startsWith("60") || !valid(yy, mm, dd) ? m : "[IC]"); // 12 digits starting 60 = a phone number
}

// ---------- parsing helpers ----------
function parseRowTime(t) {
  t = (t || "").trim();
  const d = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (d) return new Date(`${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}T12:00:00+08:00`).getTime();
  if (/\d{1,2}:\d{2}\s*[ap]m/i.test(t)) return Date.now(); // today
  return null; // "Yesterday", weekday names etc.: treated as recent
}
function parseMsgDate(s) {
  const m = (s || "").match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  let h = Number(m[4]) % 12; if (/pm/i.test(m[6])) h += 12;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${String(h).padStart(2, "0")}:${m[5]}:00+08:00`).toISOString();
}

// ---------- in-page extractors ----------
function getRows() {
  return [...document.querySelectorAll('[class*="chatRowContainer"]')].map((row, index) => {
    const lines = row.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
    const wrapper = row.querySelector('[class*="durationWrapper"]');
    const timeEl = wrapper?.querySelector('[class*="_duration"]:not([class*="Wrapper"])');
    return {
      index,
      lines,
      time: (timeEl?.textContent ?? "").trim(),
      assignee: (wrapper?.children[1]?.innerText ?? "").trim(),
      unread: lines.some((l) => /^\d{1,3}$/.test(l)), // the green unread-count bubble
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
function extractMessages() {
  const out = [];
  for (const c of document.querySelectorAll('[class*="xcQ4CW_messageContainer"]')) {
    if (/eventMessageContainer/.test(c.className)) continue;
    const w = c.querySelector('[class*="messageWrapper"]');
    if (!w?.id) continue;
    const classes = [...w.querySelectorAll("[class]")].map((e) => e.className.toString()).join(" ") + " " + w.className;
    // skip text inside a quoted (replied-to) message: it is a copy of an earlier message, not new text
    const text = [...c.querySelectorAll("article")].filter((a) => !a.closest('[class*="quotedContainer"]')).map((a) => a.innerText.trim()).filter(Boolean).join("\n");
    let media = "text";
    if (c.querySelector("audio") || /audio|voice/i.test(classes)) media = "audio";
    else if (c.querySelector("video") || /video/i.test(classes)) media = "video";
    else if (/imageWrapper|ant-image/.test(classes)) media = "image";
    else if (/document|file|pdf|attachment/i.test(classes)) media = "document";
    else if (!text) media = "other";
    out.push({
      id: w.id,
      right: /AlignRight/.test(c.className),
      text,
      media,
      date: c.querySelector('[class*="dateWrapper"]')?.textContent.trim() ?? "",
      sentBy: c.querySelector('[class*="sentBy"]')?.innerText.trim() ?? "",
    });
  }
  return out;
}
function scrollMessagesUp() {
  const c = document.querySelector('[class*="xcQ4CW_messageContainer"]');
  let el = c?.parentElement;
  while (el && !(el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
  if (!el) return { top: true };
  el.scrollTop = Math.max(0, el.scrollTop - Math.max(300, el.clientHeight * 0.9));
  return { top: el.scrollTop <= 2 };
}

// ---------- safety ----------
async function incognitoOn(page) {
  const lab = page.locator("[class*=actionLabel]", { hasText: /Incognito/ }).first();
  const txt = ((await lab.textContent({ timeout: 5000 }).catch(() => "")) || "").trim();
  if (/Off/i.test(txt)) {
    await lab.click();
    await sleep(800);
    return /On/i.test(((await lab.textContent()) || "").trim());
  }
  return /On/i.test(txt);
}
async function requireIncognito(page) {
  if (!(await incognitoOn(page))) throw new Error("Incognito is not ON - stopping before opening any chat");
}

// ---------- reading one chat ----------
async function readChat(page, row) {
  const rowLoc = page.locator('[class*="chatRowContainer"]').nth(row.index);
  await requireIncognito(page);
  await rowLoc.click({ position: { x: 120, y: 18 } });
  await sleep(2500);
  await page.locator('[class*="xcQ4CW_messageContainer"]').first().waitFor({ timeout: 10_000 }).catch(() => {});

  const seen = new Map();
  let quiet = 0;
  for (let i = 0; i < 120 && quiet < 3; i++) {
    if (process.env.HIST_DEBUG) log(`    pass ${i}: ${seen.size} msgs`);
    const before = seen.size;
    for (const m of await page.evaluate(extractMessages)) seen.set(m.id, m);
    const { top } = await page.evaluate(scrollMessagesUp);
    await sleep(700);
    const more = page.getByText(/^(Load (more|previous|older)|View older)/i).first();
    if (top && (await more.isVisible().catch(() => false))) { await more.click().catch(() => {}); await sleep(1500); }
    quiet = seen.size === before && top ? quiet + 1 : 0;
  }
  for (const m of await page.evaluate(extractMessages)) seen.set(m.id, m);
  return [...seen.values()];
}

/** Guard against reading the wrong chat: the list preview must appear in the chat we ended up reading. */
function matchesPreview(row, msgs) {
  const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const previewLine = row.lines.find((l, i) => i > 0 && l.length >= 10 && !/^\d{9,15}$/.test(l) && l !== row.assignee && l !== row.time);
  if (!previewLine) return true; // nothing to compare (media-only preview)
  const needle = norm(previewLine).slice(0, 14);
  return msgs.some((m) => norm(m.text).includes(needle));
}

function toDbMessages(conversationId, msgs) {
  return msgs.map((m) => {
    const staffName = m.right ? (m.sentBy.match(/Sent by\s+(.+?)\s+(?:via|$)/i)?.[1] ?? null) : null;
    return {
      conversation_id: conversationId,
      direction: m.right ? "staff" : "customer",
      body: maskIc(m.text),
      media_type: m.media,
      staff_name: staffName,
      sent_at: parseMsgDate(m.date) ?? new Date().toISOString(),
      external_id: m.id,
    };
  });
}

// ---------- main ----------
await loadEnv();
await mkdir(new URL("../.history/", import.meta.url), { recursive: true });
const progressFile = new URL("../.history/progress.json", import.meta.url);
const done = new Set(JSON.parse(await readFile(progressFile, "utf8").catch(() => "[]")));
const saveProgress = () => writeFile(progressFile, JSON.stringify([...done]));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: await loadStorageState(), viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
let originalPhone = "";
const totals = { chats: 0, messages: 0, skippedUnread: 0, skippedMismatch: 0, errors: 0 };

try {
  await page.goto(INBOX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("tab", { name: /^Unread/ }).first().waitFor({ timeout: 30_000 });
  await sleep(2000);
  await requireIncognito(page);
  log("Incognito is ON");
  originalPhone = await currentPhone(page);
  await openChannelModal(page);
  let channels = await page.evaluate(extractChannelCards);
  await closeChannelModal(page);
  if (ONLY_CHANNEL) channels = channels.filter((c) => c.phone === ONLY_CHANNEL);
  log("channels:", channels.map((c) => `${c.title} (${c.phone})`).join(", "));

  let consecutiveErrors = 0;
  for (const ch of channels) {
    await withTimeout(switchChannel(page, ch.phone), 90_000, `switching to ${ch.title}`);
    for (const tab of TABS) {
      await requireIncognito(page);
      await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).first().click();
      await sleep(3000);
      log(`== ${ch.title} / ${tab}`);
      let handled = 0, quiet = 0, old = 0;
      const tried = new Set();
      while (handled < LIMIT && quiet < 5 && old < 15) {
        const rows = await page.evaluate(getRows);
        const next = rows.find((r) => !tried.has(r.lines.join("|") + r.time));
        if (!next) {
          const { atBottom } = await page.evaluate(scrollList);
          await sleep(500);
          const more = page.getByText("Load More", { exact: true }).first();
          if (atBottom && (await more.isVisible().catch(() => false))) { await more.click(); await sleep(2000); quiet = 0; }
          else quiet++;
          continue;
        }
        quiet = 0;
        const rowKey = next.lines.join("|") + next.time;
        tried.add(rowKey);

        const lastActive = parseRowTime(next.time);
        if (lastActive !== null && lastActive < CUTOFF) { old++; continue; }
        old = 0;
        if (next.unread) { totals.skippedUnread++; continue; } // never touch unread chats
        const phone = next.lines.find((l) => /^\d{9,15}$/.test(l)) ?? "";
        const doneKey = `${ch.phone}|${phone || next.lines[0]}|${next.time}`;
        if (done.has(doneKey)) continue;

        try {
          let msgs = await withTimeout(readChat(page, next), 150_000, "reading a chat");
          if (!matchesPreview(next, msgs)) {
            await sleep(2500);
            msgs = await withTimeout(readChat(page, next), 150_000, "re-reading a chat");
            if (!matchesPreview(next, msgs)) { totals.skippedMismatch++; log(`  skipped (could not confirm the right chat): ${next.lines[0]}`); continue; }
          }
          msgs = msgs.filter((m) => { const t = parseMsgDate(m.date); return !t || Date.parse(t) >= CUTOFF; });
          if (!msgs.length) { done.add(doneKey); continue; }
          const name = next.lines[0];
          const contactPhone = phone || (/^\d{9,15}$/.test(name) ? name : name);
          if (DRY) {
            log(`  [dry] ${name} | ${next.assignee || "Unassigned"} | ${msgs.length} msgs | staff ${msgs.filter((m) => m.right).length}`);
            if (totals.chats < 2) console.log(msgs.slice(0, 6).map((m) => `    ${m.right ? "STAFF" : "CUST "} [${m.media}] ${maskIc(m.text).slice(0, 80)} (${m.sentBy})`).join("\n"));
          } else {
            const last = msgs.map((m) => parseMsgDate(m.date)).filter(Boolean).sort().pop() ?? null;
            const [conv] = await sb("ai_conversations?on_conflict=channel,contact_phone", [{
              channel: ch.phone,
              channel_title: ch.title,
              contact_phone: contactPhone,
              contact_name: contactPhone === name ? "" : name,
              assignee: next.assignee || null,
              status: "handled",
              last_message_at: last,
            }], "resolution=merge-duplicates,return=representation");
            const rowsToSave = toDbMessages(conv.id, msgs);
            for (let i = 0; i < rowsToSave.length; i += 200) {
              await sb("ai_messages?on_conflict=conversation_id,external_id", rowsToSave.slice(i, i + 200), "resolution=merge-duplicates,return=minimal");
            }
          }
          done.add(doneKey);
          totals.chats++; totals.messages += msgs.length; handled++; consecutiveErrors = 0;
          if (totals.chats % 10 === 0) { await saveProgress(); log(`  ${totals.chats} chats, ${totals.messages} messages so far`); }
          await sleep(1200 + Math.random() * 1500);
        } catch (err) {
          totals.errors++; consecutiveErrors++;
          log(`  error on ${next.lines[0]}: ${err.message}`);
          if (/Incognito/.test(err.message) || consecutiveErrors >= 5) throw err;
        }
      }
      await saveProgress();
    }
  }
} finally {
  await saveProgress().catch(() => {});
  log("DONE", JSON.stringify(totals));
  try { if (originalPhone) await withTimeout(switchChannel(page, originalPhone), 60_000, "switching back"); } catch { /* best effort */ }
  await browser.close();
}
