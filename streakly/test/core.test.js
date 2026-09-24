import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, currentStreak, longestStreak, completionRate, canAddHabit,
  toggleDay, createHabit, milestoneReached, sanitizeState, lastNDays, FREE_HABIT_LIMIT,
  checkoutReturnStatus, cleanReceiptId,
} from "../core.js";

const log = (...days) => Object.fromEntries(days.map((d) => [d, true]));

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("currentStreak counts through today", () => {
  assert.equal(currentStreak(log("2026-09-22", "2026-09-23", "2026-09-24"), "2026-09-24"), 3);
});

test("currentStreak stays alive when only today is missing", () => {
  assert.equal(currentStreak(log("2026-09-22", "2026-09-23"), "2026-09-24"), 2);
});

test("currentStreak breaks after a missed day", () => {
  assert.equal(currentStreak(log("2026-09-21", "2026-09-22"), "2026-09-24"), 0);
  assert.equal(currentStreak({}, "2026-09-24"), 0);
});

test("longestStreak finds the best run", () => {
  assert.equal(longestStreak(log("2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07")), 3);
  assert.equal(longestStreak({}), 0);
});

test("completionRate ignores days before creation", () => {
  assert.equal(completionRate(log("2026-09-24"), "2026-09-23", "2026-09-24", 30), 0.5);
  assert.equal(completionRate({}, "2026-09-25", "2026-09-24", 30), 0);
});

test("free tier is capped, pro is not", () => {
  const habits = Array.from({ length: FREE_HABIT_LIMIT }, () => ({}));
  assert.equal(canAddHabit({ pro: false, habits }), false);
  assert.equal(canAddHabit({ pro: true, habits }), true);
  assert.equal(canAddHabit({ pro: false, habits: [] }), true);
});

test("toggleDay is immutable and reversible", () => {
  const h = { log: {} };
  const on = toggleDay(h, "2026-09-24");
  assert.deepEqual(h.log, {});
  assert.equal(on.log["2026-09-24"], true);
  assert.deepEqual(toggleDay(on, "2026-09-24").log, {});
});

test("createHabit validates and trims", () => {
  assert.throws(() => createHabit({ name: "   " }));
  const h = createHabit({ name: "  Read  " }, new Date(2026, 8, 24));
  assert.equal(h.name, "Read");
  assert.equal(h.createdAt, "2026-09-24");
});

test("milestoneReached fires once when crossing", () => {
  assert.equal(milestoneReached(6, 7), 7);
  assert.equal(milestoneReached(7, 8), null);
});

test("lastNDays ends on today", () => {
  assert.deepEqual(lastNDays(3, "2026-09-24"), ["2026-09-22", "2026-09-23", "2026-09-24"]);
});

test("sanitizeState drops malformed data", () => {
  const s = sanitizeState({
    pro: "yes",
    theme: "hacker",
    habits: [
      { name: "Run", color: "red", log: { "2026-09-24": true, bad: true, "2026-09-23": "x" } },
      { name: "" },
      null,
    ],
  });
  assert.equal(s.pro, false);
  assert.equal(s.theme, "system");
  assert.equal(s.habits.length, 1);
  assert.equal(s.habits[0].color, "#22c55e");
  assert.deepEqual(s.habits[0].log, { "2026-09-24": true });
  assert.deepEqual(sanitizeState("garbage").habits, []);
});

test("checkoutReturnStatus reads Whop's return status", () => {
  assert.equal(checkoutReturnStatus("?status=success"), "success");
  assert.equal(checkoutReturnStatus("?status=error&foo=1"), "error");
  assert.equal(checkoutReturnStatus("?status=hacked"), null);
  assert.equal(checkoutReturnStatus(""), null);
});

test("cleanReceiptId accepts Whop IDs and rejects junk", () => {
  assert.equal(cleanReceiptId("pay_abc123"), "pay_abc123");
  assert.equal(cleanReceiptId("<script>"), null);
  assert.equal(cleanReceiptId(42), null);
  assert.equal(sanitizeState({ proReceipt: "pay_x1" }).proReceipt, "pay_x1");
  assert.equal(sanitizeState({ proReceipt: "bad id!" }).proReceipt, null);
});
