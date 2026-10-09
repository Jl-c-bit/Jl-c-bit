import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanHit, addHit, createHandler } from "../netlify/functions/pdf-stats.mjs";

test("cleanHit keeps PrivatePDF paths and outside referrers only", () => {
  assert.deepEqual(cleanHit({ p: "/pdf/merge-pdf/", r: "https://www.tiktok.com/@x" }), { path: "/pdf/merge-pdf/", event: null, ref: "tiktok.com" });
  assert.equal(cleanHit({ p: "/pdf/merge-pdf/", r: "https://chimerical-crostata-fb89ec.netlify.app/pdf/" }).ref, null);
  assert.equal(cleanHit({ p: "/etc/passwd" }), null);
  assert.equal(cleanHit({ e: "hack" }), null);
  assert.equal(cleanHit(null), null);
  assert.deepEqual(cleanHit({ e: "buy_click" }), { path: null, event: "buy_click", ref: null });
});

test("addHit counts views, referrers and events separately", () => {
  let c = addHit({}, { path: "/pdf/", ref: "tiktok.com" });
  c = addHit(c, { path: "/pdf/", ref: null });
  c = addHit(c, { event: "task_done" });
  assert.deepEqual(c, { views: { "/pdf/": 2 }, refs: { "tiktok.com": 1 }, events: { task_done: 1 } });
});

test("handler stores hits and reports stats", async () => {
  const data = new Map();
  const store = { get: async (k) => data.get(k) ?? null, setJSON: async (k, v) => data.set(k, v) };
  const h = createHandler(store);
  const post = (body) => h(new Request("https://x/pdf/api/hit", { method: "POST", body: JSON.stringify(body) }));
  assert.equal((await post({ p: "/pdf/", r: "https://reddit.com/r/x" })).status, 204);
  await post({ e: "pro_open" });
  await post({ junk: true });
  const res = await h(new Request("https://x/pdf/api/stats"));
  const { days } = await res.json();
  assert.equal(days.length, 1);
  assert.deepEqual(days[0].views, { "/pdf/": 1 });
  assert.deepEqual(days[0].refs, { "reddit.com": 1 });
  assert.deepEqual(days[0].events, { pro_open: 1 });
});
