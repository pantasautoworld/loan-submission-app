// Pure functions: turn scraped Unread-tab rows into the admin's usual Telegram update.
// No browser or network here, so it can be tested with plain fixtures (format.test.mjs).

const TZ = "Asia/Kuala_Lumpur";
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Calendar parts of `date` in Malaysia time. */
function myParts(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map((x) => [x.type, x.value])
  );
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute };
}

/** 15:30 -> "3.30pm", 13:38 -> "1.38pm", 0:05 -> "12.05am" (the admin's hand-typed style). */
export function formatClock(hh, mm) {
  const suffix = hh >= 12 ? "pm" : "am";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}.${String(mm).padStart(2, "0")}${suffix}`;
}

/**
 * LuluChat's list timestamp -> { sortKey, label }.
 *  "06:09 pm"   today's time          -> label "6.09pm"
 *  "Yesterday"  / "Friday"            -> label "yesterday" / "Fri"
 *  "21/09/2026" older date            -> label "21/09"
 * sortKey is only for finding the OLDEST unreplied chat (smaller = older).
 */
export function parseListTime(raw, now = new Date()) {
  const text = String(raw ?? "").trim();
  const today = myParts(now);
  const dayMs = (y, m, d) => Date.UTC(y, m - 1, d);
  const todayMs = dayMs(today.y, today.m, today.d);

  const t = text.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (t) {
    let hh = +t[1] % 12;
    if (t[3].toLowerCase() === "pm") hh += 12;
    return { sortKey: todayMs + (hh * 60 + +t[2]) * 60_000, label: formatClock(hh, +t[2]) };
  }
  if (/^yesterday$/i.test(text)) return { sortKey: todayMs - 86_400_000, label: "yesterday" };

  const wd = WEEKDAYS.indexOf(text.toLowerCase());
  if (wd >= 0) {
    const todayWd = new Date(todayMs).getUTCDay();
    const back = ((todayWd - wd + 7) % 7) || 7; // same weekday name means a week ago
    return { sortKey: todayMs - back * 86_400_000, label: text.slice(0, 3) };
  }

  const dm = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) return { sortKey: dayMs(+dm[3], +dm[2], +dm[1]), label: `${dm[1].padStart(2, "0")}/${dm[2].padStart(2, "0")}` };

  return { sortKey: todayMs, label: text || "?" }; // unknown format: show as-is, treat as today
}

const norm = (s) => s.trim().toLowerCase();

/**
 * @param channels  [{ title: "PANTAS 0179952261", rows: [{ assignee, time }] }]
 * @param roster    staff names that always get a line (CLEAR when nothing unread)
 */
export function buildReport({ channels, roster = [], now = new Date() }) {
  // One display name per person, first spelling seen wins; roster order first, then anyone new we meet.
  const display = new Map();
  for (const name of roster) if (name.trim() && !display.has(norm(name))) display.set(norm(name), name.trim());
  for (const ch of channels)
    for (const r of ch.rows) {
      const a = (r.assignee ?? "").trim();
      if (a && !display.has(norm(a))) display.set(norm(a), a);
    }

  const p = myParts(now);
  const lines = [`unclear message till ${formatClock(p.hh, p.mm)}`];
  let totalUnreplied = 0;

  for (const ch of channels) {
    lines.push("", `channel ${ch.title}`);
    const byStaff = new Map();
    const unassigned = [];
    for (const r of ch.rows) {
      const a = (r.assignee ?? "").trim();
      (a ? (byStaff.get(norm(a)) ?? byStaff.set(norm(a), []).get(norm(a))) : unassigned).push(r);
    }
    const describe = (rows) => {
      const oldest = rows.map((r) => parseListTime(r.time, now)).sort((a, b) => a.sortKey - b.sortKey)[0];
      return `${rows.length} customer since ${oldest.label}`;
    };
    for (const [key, name] of display) {
      const rows = byStaff.get(key);
      if (rows?.length) { lines.push(`${name} - ${describe(rows)}`); totalUnreplied += rows.length; }
      else lines.push(`${name} - CLEAR 👍🏻`);
    }
    if (unassigned.length) { lines.push(`unassigned - ${describe(unassigned)}`); totalUnreplied += unassigned.length; }
  }
  return { text: lines.join("\n"), totalUnreplied };
}
