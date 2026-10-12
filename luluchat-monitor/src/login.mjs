// One-time login helper - run on YOUR PC (needs a screen):
//   cd luluchat-monitor && npm install && npx playwright install chromium && npm run login
// A Chrome window opens: log in to LuluChat as normal (use the dedicated monitor user if you made one).
// When the inbox appears the window closes and the login is saved to .auth/state.json plus
// .auth/state.b64.txt - paste the contents of state.b64.txt into the Railway variable LULUCHAT_STORAGE_STATE_B64.
// The .auth folder is git-ignored. Treat these files like a password.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const dir = new URL("../.auth/", import.meta.url);
await mkdir(dir, { recursive: true });

const browser = await chromium.launch({ headless: false, channel: "chrome" }); // your normal Google Chrome
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.goto("https://app.luluchat.io/inbox/list");
console.log("Log in to LuluChat in the window that opened. Waiting up to 10 minutes...");
await page.waitForURL(/\/inbox/, { timeout: 600_000 });
await page.getByRole("tab", { name: /^Unread/ }).first().waitFor({ state: "visible", timeout: 120_000 });
await page.waitForTimeout(3000);

const state = await context.storageState();
const json = JSON.stringify(state);
await writeFile(new URL("state.json", dir), json);
await writeFile(new URL("state.b64.txt", dir), Buffer.from(json).toString("base64"));
await browser.close();
console.log("Saved luluchat-monitor/.auth/state.json and state.b64.txt");
