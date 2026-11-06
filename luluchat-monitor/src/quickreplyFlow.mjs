// Creates / replaces a LuluChat Quick Reply (with a document) in the CURRENTLY selected channel.
// Quick Replies live in the chat composer (⋮ > Quick Replies), so a conversation has to be open.
// To touch as little as possible it opens an ARCHIVED conversation with no unread messages:
// nothing there gets marked as read, and nothing is typed or sent into it.
// Selectors match stable fragments / ids / visible text (LuluChat's class names are hashed).
import { INBOX_URL, SessionExpiredError, sleep } from "./scrape.mjs";

const MORE_BUTTON = '[class*="messageTypeWrapper"] button:has(.anticon-more), [class*="messageTypeWrapper"] button:has(.anticon-ellipsis)';

/** A chat row with no green unread badge (a bare-number line) and that isn't LuluChat's own notice chat. */
async function openQuietArchivedChat(page) {
  await page.goto(INBOX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const tab = page.getByRole("tab", { name: /^Archived/ }).first();
  try {
    await tab.waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    throw new SessionExpiredError("inbox did not load (login page shown?)");
  }
  await tab.click();
  await page.getByText("Archived List Conversations").first().waitFor({ state: "visible", timeout: 20_000 });
  await sleep(2500);

  const rows = page.locator('[class*="chatRowContainer"]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const lines = (await rows.nth(i).innerText()).split("\n").map((l) => l.trim());
    const joined = lines.join(" ");
    if (lines.some((l) => /^\d{1,3}$/.test(l)) || /unread messages/i.test(joined)) continue;
    await rows.nth(i).click();
    await page.locator(MORE_BUTTON).first().waitFor({ state: "visible", timeout: 20_000 });
    return;
  }
  throw new Error("no archived conversation without unread messages to open Quick Replies from");
}

const manager = (page) => page.locator(".ant-modal-container").filter({ hasText: "Manage Quick Replies" }).first();

async function openManager(page) {
  await page.locator(MORE_BUTTON).first().click();
  await page.getByText("Quick Replies", { exact: true }).first().click();
  await manager(page).getByRole("button", { name: "Create Quick Reply" }).waitFor({ state: "visible", timeout: 20_000 });
  await sleep(1000);
}

/** Leaves no dialog open - an open one blocks every click behind it (e.g. the channel switcher). */
async function closeDialogs(page) {
  for (let i = 0; i < 3; i++) {
    if (!(await page.locator(".ant-modal-wrap:visible").count())) return;
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(500);
  }
}

/** Rows of the manager table whose shortcut is exactly `shortcut` (case-insensitive). */
async function queryRows(page, shortcut) {
  const m = manager(page);
  const input = m.getByPlaceholder("Please enter").first();
  await input.fill(shortcut);
  await m.getByRole("button", { name: "Query" }).click();
  await sleep(2000);
  const rows = m.locator("tbody tr").filter({ has: page.locator("td") });
  const matches = [];
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const first = ((await rows.nth(i).locator("td").first().innerText().catch(() => "")) || "").trim();
    if (first.toLowerCase() === shortcut.trim().toLowerCase()) matches.push(rows.nth(i));
  }
  return matches;
}

async function deleteMatchingRows(page, shortcut, log) {
  for (let guard = 0; guard < 5; guard++) {
    const rows = await queryRows(page, shortcut);
    if (!rows.length) return guard;
    log(`  removing existing quick reply "${shortcut}"`);
    await rows[0].locator('[class*="anticon-delete"], [aria-label="delete"]').first().click();
    // confirmation popup: confirm
    await page.getByRole("button", { name: /^(OK|Yes|Confirm|Delete)$/i }).last().click();
    await sleep(2000);
  }
  throw new Error(`could not remove the existing quick reply "${shortcut}"`);
}

async function createWithDocument(page, { shortcut, message, filePath }, log) {
  await manager(page).getByRole("button", { name: "Create Quick Reply" }).click();
  const form = page.locator("form#basic");
  await form.waitFor({ state: "visible", timeout: 15_000 });
  await page.getByText("with Document", { exact: true }).first().click();
  await form.locator("#basic_shortcut").fill(shortcut);
  await form.locator("#basic_message").fill(message);
  await form.locator('input[name="upload_file"]').setInputFiles(filePath);
  // wait until the upload list shows the file (an uploading file has a progress / "uploading" state)
  await form.locator(".ant-upload-list-item").first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction(
    () => !document.querySelector("form#basic .ant-upload-list-item-uploading"),
    undefined,
    { timeout: 120_000 }
  );
  if (await form.locator(".ant-upload-list-item-error").count()) {
    throw new Error("LuluChat rejected the PDF upload (is the file storage full?)");
  }
  log(`  submitting "${shortcut}"`);
  await page.locator(".ant-modal-container").filter({ has: form }).getByRole("button", { name: /^Submit$/ }).click();
  await form.waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {
    throw new Error("LuluChat did not accept the quick reply (the form stayed open)");
  });
  await sleep(1500);
}

/**
 * Makes sure the current channel has exactly one quick reply named `shortcut` with this message + document.
 * An existing one with the same shortcut is removed first (so the PDF is replaced).
 */
export async function upsertQuickReply(page, job, log = console.log) {
  try {
    await openQuietArchivedChat(page);
    await openManager(page);
    await deleteMatchingRows(page, job.shortcut, log);
    await createWithDocument(page, job, log);
    const found = await queryRows(page, job.shortcut);
    if (found.length !== 1) throw new Error(`after saving, expected 1 quick reply named "${job.shortcut}" but found ${found.length}`);
  } finally {
    await closeDialogs(page);
  }
}

/** For tests / cleanup: remove a quick reply by exact shortcut in the current channel. */
export async function removeQuickReply(page, shortcut, log = console.log) {
  try {
    await openQuietArchivedChat(page);
    await openManager(page);
    await deleteMatchingRows(page, shortcut, log);
  } finally {
    await closeDialogs(page);
  }
}
