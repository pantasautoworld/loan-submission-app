// Read-only scrape of the LuluChat web inbox. It never opens a conversation, never types
// and never sends: it only clicks the Unread tab and the channel switcher.
// LuluChat's CSS class names are hashed (e.g. "IEYfOG_chatRowContainer"), so every selector
// below matches on a stable fragment ([class*="chatRowContainer"]) rather than the full name.

export class SessionExpiredError extends Error {}

const INBOX_URL = "https://app.luluchat.io/inbox/list";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs in the page: every currently rendered chat row (the list is virtualised, so only ~10 exist at once). */
function extractRows() {
  return [...document.querySelectorAll('[class*="chatRowContainer"]')].map((row) => {
    const wrapper = row.querySelector('[class*="durationWrapper"]');
    const timeEl = wrapper?.querySelector('[class*="_duration"]:not([class*="Wrapper"])');
    return {
      name: (row.innerText.split("\n")[0] ?? "").trim(),
      time: (timeEl?.textContent ?? "").trim(),
      // 2nd child of the wrapper is the yellow assignee label; absent when nobody is assigned
      assignee: (wrapper?.children[1]?.innerText ?? "").trim(),
      preview: (row.innerText.split("\n")[1] ?? "").trim(),
    };
  });
}

/** Runs in the page: scroll the chat list one step; reports whether it is at the bottom. */
function scrollStep() {
  const row = document.querySelector('[class*="chatRowContainer"]');
  let el = row?.parentElement;
  while (el && !(el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
  if (!el) return { atBottom: true };
  el.scrollTop += Math.max(200, Math.floor(el.clientHeight * 0.8));
  return { atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 4 };
}

/** The header phone-icon button; its text reads "Channels (60179952261)" but the accessible name differs. */
const channelsButton = (page) => page.locator("button", { hasText: /Channels\s*\(/ }).first();

async function openUnreadTab(page) {
  const tab = page.getByRole("tab", { name: /^Unread/ }).first();
  try {
    await tab.waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    throw new SessionExpiredError("inbox tabs never appeared (login page shown?)");
  }
  await tab.click();
  await page.getByText("Unread List Conversations").first().waitFor({ state: "visible", timeout: 15_000 });
  await sleep(2500); // let the first page of rows render
}

async function collectUnreadRows(page, log = () => {}) {
  const seen = new Map();
  let quietPasses = 0;
  const deadline = Date.now() + 120_000; // hard cap per channel
  // Stop once several passes in a row find nothing new (the Load More button can stay visible at the very end).
  for (let i = 0; i < 400 && quietPasses < 4 && Date.now() < deadline; i++) {
    const before = seen.size;
    if (i % 10 === 0) log(`    ...pass ${i}, ${seen.size} chats so far`);
    for (const r of await page.evaluate(extractRows)) seen.set(`${r.name}|${r.time}|${r.assignee}|${r.preview}`, r);
    const { atBottom } = await page.evaluate(scrollStep);
    await sleep(350);
    if (atBottom) {
      const more = page.getByText("Load More", { exact: true }).first();
      if (await more.isVisible().catch(() => false)) {
        await more.click();
        await sleep(2000);
      }
    }
    quietPasses = seen.size === before ? quietPasses + 1 : 0;
  }
  return [...seen.values()];
}

/** The header button reads "Channels (60179952261)": which channel is selected right now. */
async function currentPhone(page) {
  const label = (await channelsButton(page).first().innerText().catch(() => "")) || "";
  const aria = (await channelsButton(page).first().getAttribute("aria-label").catch(() => "")) || "";
  return (label + " " + aria).match(/\d{8,}/)?.[0] ?? "";
}

async function openChannelModal(page) {
  await channelsButton(page).first().click();
  await page.getByText("Phone Number:").first().waitFor({ state: "visible", timeout: 15_000 });
}

async function closeChannelModal(page) {
  await page.keyboard.press("Escape");
  await sleep(500);
}

/** Runs in the page: every channel card in the open dialog -> { title, phone }. Parses the dialog text: the title is the line just above "Phone Number: <digits>". */
function extractChannelCards() {
  const lines = document.body.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
  const cards = new Map();
  lines.forEach((line, i) => {
    const m = line.match(/^Phone Number:\s*(\d+)/);
    if (m && i > 0) cards.set(m[1], { title: lines[i - 1], phone: m[1] });
  });
  return [...cards.values()];
}

async function switchChannel(page, phone) {
  if ((await currentPhone(page)) === phone) return;
  await openChannelModal(page);
  // Find this channel's card, then click its select/switch button. NEVER the Disconnect button.
  const card = page.locator("div", { has: page.getByText(phone) }).filter({ hasText: /Disconnect/ }).last();
  const buttons = card.getByRole("button");
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const text = ((await buttons.nth(i).innerText()) || "").trim();
    if (/disconnect/i.test(text) || /current/i.test(text) || !/(select|switch|use|open|choose|change)/i.test(text)) continue;
    await buttons.nth(i).click();
    break;
  }
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await sleep(700);
    if ((await currentPhone(page)) === phone) break;
  }
  if ((await currentPhone(page)) !== phone) {
    await page.keyboard.press("Escape").catch(() => {});
    throw new Error(`could not switch to channel ${phone}`);
  }
  // LuluChat lands on /dashboard after a switch: go back to the inbox of the new channel.
  await page.goto(INBOX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("tab", { name: /^Unread/ }).first().waitFor({ state: "visible", timeout: 30_000 });
  await sleep(1500);
}

/** Rejects if `promise` takes longer than `ms` (so one stuck page step can never hang the whole run). */
const withTimeout = (promise, ms, what) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);

/**
 * @returns { results, finish }
 *   results = [{ title, phone, rows: [{ name, time, assignee, preview }] }] - one per channel, rows = every chat in its Unread tab.
 *   finish() = best-effort tidy-up (switch the account back to the channel it started on, close the page).
 *   Call it AFTER sending the report so a slow tidy-up can never delay or block the message.
 */
export async function scrapeUnread(context, log = console.log) {
  const page = await context.newPage();
  let originalPhone = "";
  const finish = async () => {
    try {
      if (originalPhone) await withTimeout(switchChannel(page, originalPhone), 60_000, "switching back to the original channel");
    } catch (err) {
      log(`(could not switch back to the original channel: ${err.message})`);
    } finally {
      await page.close().catch(() => {});
    }
  };
  try {
    await page.goto(INBOX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (!page.url().includes("/inbox")) throw new SessionExpiredError(`redirected to ${page.url()}`);
    await page.getByRole("tab", { name: /^Unread/ }).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {
      throw new SessionExpiredError("inbox did not load");
    });

    originalPhone = await currentPhone(page);
    await openChannelModal(page);
    const channels = await page.evaluate(extractChannelCards);
    await closeChannelModal(page);
    if (!channels.length) throw new Error("no channels found in the Channels dialog");
    log(`channels: ${channels.map((c) => `${c.title} (${c.phone})`).join(", ")}`);

    const results = [];
    for (const ch of channels) {
      await withTimeout(switchChannel(page, ch.phone), 90_000, `switching to ${ch.title}`);
      await withTimeout(openUnreadTab(page), 60_000, `opening the Unread tab for ${ch.title}`);
      const rows = await withTimeout(collectUnreadRows(page, log), 150_000, `reading ${ch.title}`);
      log(`  ${ch.title}: ${rows.length} unread chat(s)`);
      results.push({ ...ch, rows });
    }
    return { results, finish };
  } catch (err) {
    await finish();
    throw err;
  }
}
