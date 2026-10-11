import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, formatClock, parseListTime } from "./format.mjs";

// 2026-10-12 15:30 Malaysia time (UTC+8) = 07:30 UTC; a Monday.
const NOW = new Date("2026-10-12T07:30:00Z");

test("formatClock matches the admin's style", () => {
  assert.equal(formatClock(15, 30), "3.30pm");
  assert.equal(formatClock(13, 38), "1.38pm");
  assert.equal(formatClock(0, 5), "12.05am");
  assert.equal(formatClock(12, 0), "12.00pm");
});

test("parseListTime handles today, weekday, date", () => {
  assert.equal(parseListTime("06:09 pm", NOW).label, "6.09pm");
  assert.equal(parseListTime("Friday", NOW).label, "Fri");
  assert.equal(parseListTime("21/09/2026", NOW).label, "21/09");
  assert.ok(parseListTime("Friday", NOW).sortKey < parseListTime("01:00 pm", NOW).sortKey);
});

test("report: counts, oldest 'since', CLEAR, unassigned, new staff", () => {
  const channels = [
    {
      title: "PANTAS 2231988",
      rows: [
        { assignee: "awin", time: "02:10 pm" },
        { assignee: "Awin", time: "01:38 pm" },
        { assignee: "chitra", time: "02:30 pm" },
        { assignee: "Farah", time: "Friday" },
        { assignee: "", time: "05:10 pm" },
      ],
    },
    { title: "0162303131 FREE TV", rows: [] },
  ];
  const { text, totalUnreplied } = buildReport({ channels, roster: ["Awin", "Chitra", "Anas", "Lin"], now: NOW });
  assert.equal(totalUnreplied, 5);
  assert.equal(
    text,
    [
      "unclear message till 3.30pm",
      "",
      "channel PANTAS 2231988",
      "Awin - 2 customer since 1.38pm",
      "Chitra - 1 customer since 2.30pm",
      "Anas - CLEAR 👍🏻",
      "Lin - CLEAR 👍🏻",
      "Farah - 1 customer since Fri",
      "unassigned - 1 customer since 5.10pm",
      "",
      "channel 0162303131 FREE TV",
      "Awin - CLEAR 👍🏻",
      "Chitra - CLEAR 👍🏻",
      "Anas - CLEAR 👍🏻",
      "Lin - CLEAR 👍🏻",
      "Farah - CLEAR 👍🏻",
    ].join("\n")
  );
});
