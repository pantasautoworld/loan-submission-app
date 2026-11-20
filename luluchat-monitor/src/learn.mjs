// AI Reply Desk - step 1: learn from the saved chat history.
// Reads the conversations saved by history.mjs (database only - never touches LuluChat) and asks Claude to write
//   - a style profile for each human staff member  -> ai_staff_profiles
//   - a playbook of topics + how the team answers   -> ai_playbook
// Messages from LuluChat automations ("Name (Automation: ...)") are scripted templates, not a person's style:
// they are left out of the staff profiles and shown to the playbook step as the team's standard scripts.
// Phone numbers and IC numbers are masked before any text is sent to Claude.
//
//   node src/learn.mjs --dry                 build the prompts, print their size, call nothing
//   node src/learn.mjs                       full run (staff profiles + playbook)
//   node src/learn.mjs --only anas           one staff member only
//   node src/learn.mjs --skip-playbook | --skip-staff
// Flags: --convs <n> conversations sampled per staff member (default 25)   --playbook-convs <n> (default 120)
import { CONTEXT, MODEL, ask, clip, isAutomation, loadDialogue, loadEnv, log, mask, parseJson, rest, shuffle, usage, flagReader } from "./aiShared.mjs";

const args = process.argv.slice(2);
const flag = flagReader(args);
const DRY = args.includes("--dry");
const ONLY = String(flag("only", "")).toLowerCase();
const CONVS_PER_STAFF = Number(flag("convs", 25));
const PLAYBOOK_CONVS = Number(flag("playbook-convs", 120));

const STAFF_SYSTEM = `${CONTEXT}
Study how ONE staff member talks and write a profile an AI assistant can follow to draft replies in their voice. Base everything strictly on what appears in the chats. Do not invent prices, approval promises or policies.
Return ONLY a JSON object:
{
  "style_notes": "3-6 short sentences: tone, language mix, length, emojis, typical sign-offs, how formal",
  "opening_style": "how they usually greet or start a conversation, with one or two real example lines",
  "document_requests": ["documents or information they ask customers for, as short phrases, most common first"],
  "typical_replies": [{"situation": "when the customer says / asks ...", "reply": "a real reply of theirs, lightly cleaned"}]
}
Give 8-12 typical_replies covering the most common situations.`;

const PLAYBOOK_SYSTEM = `${CONTEXT}
Build the team's reply PLAYBOOK from these chats and the team's standard automation scripts. Each topic is a recurring customer situation (e.g. first enquiry, asking for deposit, asking about documents, blacklist or CTOS, salary cash / EPF, car availability, booking a visit, loan rejected / pending, price negotiation, follow-up when the customer goes quiet).
Base every rule strictly on what staff actually do in the chats. Do not invent prices, interest rates or approval promises - where staff avoid committing, say so.
Return ONLY a JSON object:
{"topics": [{"topic": "short name", "rule_text": "2-5 sentences: what the customer wants, what staff do and say, what they never promise", "examples": [{"customer": "typical customer message", "staff_reply": "a real staff reply, lightly cleaned"}]}]}
Give 15-25 topics, each with 2-3 examples.`;

// ---------- staff profiles ----------
async function staffProfiles() {
  // staff who wrote the most among the latest 3000 staff text messages (PostgREST returns 1000 rows per request)
  const counts = new Map();
  for (let offset = 0; offset < 3000; offset += 1000) {
    const page = await rest(`ai_messages?direction=eq.staff&media_type=eq.text&select=staff_name&order=sent_at.desc&limit=1000&offset=${offset}`);
    for (const r of page) counts.set(r.staff_name, (counts.get(r.staff_name) ?? 0) + 1);
  }
  const names = [...counts].filter(([name, n]) => name && !isAutomation(name) && n >= 40).map(([name]) => name);
  const targets = names.filter((n) => !ONLY || n.toLowerCase() === ONLY);
  log(`staff to profile: ${targets.join(", ")}`);

  for (const name of targets) {
    const enc = encodeURIComponent(name);
    const recent = await rest(`ai_messages?staff_name=eq.${enc}&direction=eq.staff&media_type=eq.text&select=conversation_id&order=sent_at.desc&limit=1000`);
    const convIds = shuffle([...new Set(recent.map((r) => r.conversation_id))]).slice(0, CONVS_PER_STAFF);
    const dialogues = [];
    for (const id of convIds) dialogues.push(await loadDialogue(id));
    const text = dialogues.map((d, i) => `--- chat ${i + 1} ---\n${d}`).join("\n\n");
    log(`  ${name}: ${convIds.length} chats, ${text.length} chars`);
    if (DRY) continue;

    const user = `Staff member: ${name}\nIn these chats the lines starting "S:" are written by ${name}.\n\n${text}`;
    const profile = parseJson(await ask(STAFF_SYSTEM, user, 4000));
    await rest("ai_staff_profiles?on_conflict=staff_name,channel", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: [{
        staff_name: name,
        channel: "all",
        style_notes: String(profile.style_notes ?? ""),
        opening_style: String(profile.opening_style ?? ""),
        document_requests: profile.document_requests ?? [],
        typical_replies: profile.typical_replies ?? [],
        chats_analysed: convIds.length,
        updated_at: new Date().toISOString(),
      }],
    });
    log(`  ${name}: profile saved`);
  }
}

// ---------- playbook ----------
async function playbook() {
  const recent = await rest("ai_conversations?select=id&order=last_message_at.desc&limit=800");
  const convIds = shuffle(recent.map((r) => r.id)).slice(0, PLAYBOOK_CONVS);
  const dialogues = [];
  for (const id of convIds) {
    const d = await loadDialogue(id);
    if (d.includes("\nS:")) dialogues.push(d); // only chats where a person actually replied
  }
  const scripts = await rest("ai_messages?direction=eq.staff&staff_name=ilike.*automation*&body=neq.&select=body&order=sent_at.desc&limit=3000");
  const counts = new Map();
  for (const s of scripts) { const b = mask(s.body).trim(); counts.set(b, (counts.get(b) ?? 0) + 1); }
  const templates = [...counts].filter(([, n]) => n >= 20).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const text = [
    "STANDARD AUTOMATION SCRIPTS (sent automatically by LuluChat, with how often):",
    ...templates.map(([b, n]) => `(${n}x) ${clip(b, 500)}`),
    "",
    "CHATS:",
    ...dialogues.map((d, i) => `--- chat ${i + 1} ---\n${d}`),
  ].join("\n");
  log(`playbook: ${dialogues.length} chats, ${templates.length} scripts, ${text.length} chars`);
  if (DRY) return;

  const result = parseJson(await ask(PLAYBOOK_SYSTEM, text, 12000));
  const topics = (result.topics ?? []).filter((t) => t.topic && t.rule_text);
  if (!topics.length) throw new Error("Claude returned no playbook topics");
  await rest("ai_playbook?id=not.is.null", { method: "DELETE" });
  await rest("ai_playbook", {
    method: "POST",
    prefer: "return=minimal",
    body: topics.map((t) => ({ topic: String(t.topic), rule_text: String(t.rule_text), examples: t.examples ?? [], auto_send: false })),
  });
  log(`playbook: ${topics.length} topics saved`);
}

await loadEnv();
log(`model ${MODEL}${DRY ? " (dry run - nothing is sent to Claude or saved)" : ""}`);
if (!args.includes("--skip-staff")) await staffProfiles();
if (!args.includes("--skip-playbook") && !ONLY) await playbook();
if (!DRY) log(`done. Claude tokens: ${usage.input} in, ${usage.output} out`);
