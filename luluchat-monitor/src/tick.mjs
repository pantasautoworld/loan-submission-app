// What the Railway cron runs, every 5 minutes:
//   1. at the first tick of each hour (Malaysia time) - the unread-message report (monitor.mjs, which
//      itself only reports 9am-6pm)
//   2. every tick - any "Send to LuluChat" quick reply jobs waiting from the app (quickreply.mjs, which
//      exits at once when there are none), then the quick replies' photo PDF links copied into the app for
//      the Broker Sheet (photoLinks.mjs - only opens LuluChat hourly or after a quick reply job finished)
//   3. only when AI_LIVE_READER=on, 8am-9pm Malaysia time - the AI Reply Desk live reader (live.mjs): turns
//      customers' new unread messages into draft replies for review. Read-only toward LuluChat, sends nothing.
// Each runs as its own process so one failing or hanging can never take the other down.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function run(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { stdio: "inherit" });
    child.on("exit", resolve);
    child.on("error", (err) => {
      console.error(`could not start ${script}:`, err.message);
      resolve();
    });
  });
}

const minute = +new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", minute: "2-digit" }).format(new Date());

if (minute < 5) await run("./monitor.mjs");
await run("./quickreply.mjs");
await run("./photoLinks.mjs");

const hour = +new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hourCycle: "h23" }).format(new Date());
if (process.env.AI_LIVE_READER === "on" && hour >= 8 && hour < 21) await run("./live.mjs");
