// What the Railway cron runs, every 5 minutes:
//   1. at the first tick of each hour (Malaysia time) - the unread-message report (monitor.mjs, which
//      itself only reports 9am-6pm)
//   2. every tick - any "Send to LuluChat" quick reply jobs waiting from the app (quickreply.mjs, which
//      exits at once when there are none)
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
