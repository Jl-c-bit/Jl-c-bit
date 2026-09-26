import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePageRanges, formatBytes, sanitizeState, checkLimit, recordTask, tasksUsedToday,
  outputName, moveItem, checkoutReturned, FREE_TASKS_PER_DAY, FREE_MAX_BYTES,
} from "../assets/core.js";

test("parsePageRanges handles singles, ranges and open ends", () => {
  assert.deepEqual(parsePageRanges("1-3, 5", 10), [0, 1, 2, 4]);
  assert.deepEqual(parsePageRanges("8-", 10), [7, 8, 9]);
  assert.deepEqual(parsePageRanges("-2", 10), [0, 1]);
  assert.deepEqual(parsePageRanges("3,1,3", 5), [2, 0]);
  assert.deepEqual(parsePageRanges(" 2 - 4 ", 5), [1, 2, 3]);
});

test("parsePageRanges rejects bad input with readable messages", () => {
  assert.throws(() => parsePageRanges("", 5), /Enter the pages/);
  assert.throws(() => parsePageRanges("abc", 5), /isn't a page/);
  assert.throws(() => parsePageRanges("0", 5), /start at 1/);
  assert.throws(() => parsePageRanges("4-9", 5), /has 5 pages/);
  assert.throws(() => parsePageRanges("5-2", 5), /backwards/);
  assert.throws(() => parsePageRanges("2", 1), /has 1 page\./);
});

test("formatBytes", () => {
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatBytes(-1), "0 B");
});

test("free plan: daily task limit resets each day", () => {
  let s = sanitizeState({});
  for (let i = 0; i < FREE_TASKS_PER_DAY; i++) {
    assert.equal(checkLimit(s, 1000, "2026-09-26"), null);
    s = recordTask(s, "2026-09-26");
  }
  assert.equal(checkLimit(s, 1000, "2026-09-26").reason, "daily");
  assert.equal(checkLimit(s, 1000, "2026-09-27"), null);
  assert.equal(tasksUsedToday(recordTask(s, "2026-09-27"), "2026-09-27"), 1);
});

test("free plan: size limit, pro has none", () => {
  const s = sanitizeState({});
  assert.equal(checkLimit(s, FREE_MAX_BYTES + 1, "2026-09-26").reason, "size");
  assert.equal(checkLimit({ ...s, pro: true, used: 99, day: "2026-09-26" }, FREE_MAX_BYTES * 10, "2026-09-26"), null);
});

test("sanitizeState drops junk", () => {
  assert.deepEqual(sanitizeState({ pro: "yes", day: "x", used: -3 }), { version: 1, pro: false, day: null, used: 0 });
  assert.deepEqual(sanitizeState(null), { version: 1, pro: false, day: null, used: 0 });
});

test("outputName keeps the original name", () => {
  assert.equal(outputName("Report Final.pdf", "compressed"), "Report Final-compressed.pdf");
  assert.equal(outputName("scan.PDF", "page-3", "jpg"), "scan-page-3.jpg");
  assert.equal(outputName("", "merged"), "document-merged.pdf");
  assert.equal(outputName('a/b:c?.pdf', "x"), "abc-x.pdf");
});

test("moveItem reorders without mutating", () => {
  const list = ["a", "b", "c"];
  assert.deepEqual(moveItem(list, 0, 2), ["b", "c", "a"]);
  assert.deepEqual(moveItem(list, 2, 0), ["c", "a", "b"]);
  assert.deepEqual(moveItem(list, 0, 5), ["a", "b", "c"]);
  assert.deepEqual(list, ["a", "b", "c"]);
});

test("checkoutReturned", () => {
  assert.equal(checkoutReturned("?upgraded=1"), true);
  assert.equal(checkoutReturned("?upgraded=0"), false);
  assert.equal(checkoutReturned(""), false);
});
