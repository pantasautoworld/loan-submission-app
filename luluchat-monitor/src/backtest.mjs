// AI Reply Desk - step 2: test the AI on OLD chats (database only - never touches LuluChat, sends nothing).
// For a sample of past customer messages the AI writes a draft reply using the playbook + that staff member's
// style profile, then a second Claude call grades the draft against what the staff member REALLY sent.
// Results are printed and written to luluchat-monitor/.history/backtest-<time>.json and .md (git-ignored).
//
//   node src/backtest.mjs --n 5 --dry     show which messages would be tested, call nothing
//   node src/backtest.mjs --n 40          run the test
// Flags: --n <count> (default 40)   --staff <name> only test that staff member's replies
import { mkdir, writeFile } from "node:fs/promises";
import { CONTEXT, MODEL, ask, draftSystem, flagReader, isAutomation, loadEnv, loadMessages, log, messageLine, parseJson, rest, shuffle, usage } from "./aiShared.mjs";

const args = process.argv.slice(2);
const flag = flagReader(args);
const DRY = args.includes("--dry");
const N = Number(flag("n", 40));
const ONLY_STAFF = String(flag("staff", "")).toLowerCase();

const isHumanStaffText = (m) => m.direction === "staff" && !isAutomation(m.staff_name) && (m.media_type === "text" || !m.media_type) && (m.body ?? "").trim();
const isCustomerText = (m) => m.direction === "customer" && (m.media_type === "text" || !m.media_type) && (m.body ?? "").trim().length >= 3;

/** A customer message that a human staff member answered in text, with the chat before it and what they really replied. */
function pickCase(messages) {
  const options = [];
  for (let i = 0; i < messages.length; i++) {
    if (!isCustomerText(messages[i])) continue;
    // skip ahead over automation lines and a following customer message to find the human reply
    let j = i + 1;
    while (j < messages.length && isAutomation(messages[j].staff_name)) j++;
    if (j >= messages.length || !isHumanStaffText(messages[j])) continue;
    const replies = [];
    for (let k = j; k < messages.length && isHumanStaffText(messages[k]) && replies.length < 3; k++) replies.push(messages[k]);
    options.push({ i, staff: replies[0].staff_name, actual: replies.map((r) => r.body.trim()).join("\n") });
  }
  if (!options.length) return null;
  const pick = options[Math.floor(Math.random() * options.length)];
  const context = messages.slice(Math.max(0, pick.i - 12), pick.i + 1).map(messageLine).filter(Boolean);
  return { staff: pick.staff, context, customerMessage: messages[pick.i].body.trim(), actual: pick.actual };
}

const JUDGE_SYSTEM = `${CONTEXT}
You grade an AI-drafted reply against what the real staff member actually sent. The real reply is the reference, but different wording can still be fine.
Score the draft 1-5: 5 = could be sent as is; 4 = fine after a tiny edit; 3 = right direction but needs editing; 2 = partly wrong or misses the point; 1 = wrong, harmful, or invents facts (prices, approvals).
Return ONLY JSON: {"score": 1-5, "safe": true/false, "reason": "one sentence"}  ("safe" = nothing invented or risky was promised.)`;

await loadEnv();
log(`model ${MODEL}${DRY ? " (dry run)" : ""}`);

const playbook = await rest("ai_playbook?select=topic,rule_text,examples&order=topic.asc");
const profiles = new Map((await rest("ai_staff_profiles?select=*")).map((p) => [p.staff_name, p]));
if (!playbook.length) throw new Error("the playbook is empty - run learn.mjs first");

const recent = await rest("ai_conversations?select=id&order=last_message_at.desc&limit=1000");
const cases = [];
for (const id of shuffle(recent.map((r) => r.id))) {
  if (cases.length >= N) break;
  const c = pickCase(await loadMessages(id));
  if (!c || (ONLY_STAFF && c.staff.toLowerCase() !== ONLY_STAFF)) continue;
  cases.push({ conversationId: id, ...c });
}
log(`${cases.length} test cases`);

const results = [];
for (const [n, c] of cases.entries()) {
  if (DRY) { log(`  #${n + 1} ${c.staff}: "${c.customerMessage.slice(0, 70)}"`); continue; }
  try {
    const user = `Chat so far (last line is the customer message to answer):\n${c.context.join("\n")}`;
    const draft = parseJson(await ask(draftSystem(playbook, profiles.get(c.staff)), user, 1500));
    const grade = parseJson(await ask(JUDGE_SYSTEM, `Customer message: ${c.customerMessage}\n\nAI draft:\n${draft.draft_text}\n\nREAL staff reply (${c.staff}):\n${c.actual}`, 800));
    results.push({ ...c, draft, grade });
    log(`  #${n + 1} ${c.staff}: score ${grade.score}${grade.safe === false ? " UNSAFE" : ""}`);
  } catch (err) {
    log(`  #${n + 1} failed: ${err.message}`);
  }
}
if (DRY) process.exit(0);

// ---------- report ----------
const scores = results.map((r) => Number(r.grade.score) || 0);
const avg = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
const dist = [1, 2, 3, 4, 5].map((s) => `${s}: ${scores.filter((x) => x === s).length}`).join("   ");
const unsafe = results.filter((r) => r.grade.safe === false).length;
const usable = scores.filter((s) => s >= 4).length;
const flagged = results.filter((r) => r.draft.needs_human).length;
const summary = `${results.length} drafts. Average ${avg.toFixed(2)} / 5. Usable (4-5): ${usable} (${Math.round((usable / (results.length || 1)) * 100)}%). Unsafe: ${unsafe}. AI said "needs a human": ${flagged}.\nScores - ${dist}`;
log(summary);

const dir = new URL("../.history/", import.meta.url);
await mkdir(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
await writeFile(new URL(`backtest-${stamp}.json`, dir), JSON.stringify({ model: MODEL, summary, results }, null, 2));
const md = [
  `# AI draft test - ${new Date().toISOString().slice(0, 10)}`, "", summary, "",
  ...results.map((r, i) => [
    `## ${i + 1}. ${r.staff} - score ${r.grade.score}${r.grade.safe === false ? " (UNSAFE)" : ""}`,
    `**Customer:** ${r.customerMessage}`, "",
    `**AI draft:** ${r.draft.draft_text}`, "",
    `**Real reply:** ${r.actual}`, "",
    `_${r.grade.reason}_`, "",
  ].join("\n")),
].join("\n");
await writeFile(new URL(`backtest-${stamp}.md`, dir), md);
log(`report: luluchat-monitor/.history/backtest-${stamp}.md   tokens: ${usage.input} in, ${usage.output} out`);
