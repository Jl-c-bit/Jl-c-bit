import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../netlify/functions/dashboard-stats.mjs";

const req = (method = "GET") => new Request("https://site.test/dashboard/api/stats", { method });
const fakeStripe = (charges) => {
  const s = { calls: 0, charges: { list: () => { s.calls++; return (async function* () { yield* charges; })(); } } };
  return s;
};
const charge = { id: "ch_abc123", status: "succeeded", paid: true, refunded: false, amount: 4900, amount_captured: 4900,
  amount_refunded: 0, currency: "usd", created: Math.floor(Date.now() / 1000), livemode: true,
  billing_details: { email: "x@example.com", name: "Jane Buyer", address: { country: "US" } } };

test("503 when Stripe is not set up", async () => {
  const res = await createHandler(() => null)(req());
  assert.equal(res.status, 503);
});

test("returns totals without customer details, and caches", async () => {
  const stripe = fakeStripe([charge]);
  const handler = createHandler(() => stripe);
  const res = await handler(req());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, "stripe");
  assert.equal(body.livemode, true);
  assert.equal(body.revenue, 4900);
  assert.equal(body.orders, 1);
  assert.ok(!JSON.stringify(body).includes("Jane Buyer"));
  assert.ok(!JSON.stringify(body).includes("x@example.com"));
  await handler(req());
  assert.equal(stripe.calls, 1);
});

test("502 when Stripe fails", async () => {
  const stripe = { charges: { list: () => (async function* () { throw new Error("boom"); })() } };
  const res = await createHandler(() => stripe)(req());
  assert.equal(res.status, 502);
});

test("only GET", async () => {
  const res = await createHandler(() => fakeStripe([]))(req("POST"));
  assert.equal(res.status, 404);
});
