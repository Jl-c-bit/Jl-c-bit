import test from "node:test";
import assert from "node:assert/strict";
import { summarizeCharges, DAYS } from "../stats.js";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const daysAgo = (n) => Math.floor((NOW - n * 864e5) / 1000);
let n = 0;
const charge = (o = {}) => ({
  id: "ch_test" + String(++n).padStart(6, "0"), status: "succeeded", paid: true, refunded: false,
  amount: 1000, amount_captured: 1000, amount_refunded: 0, currency: "usd", created: daysAgo(1),
  billing_details: { email: "a@example.com", name: "Secret Name", address: { country: "US" } },
  payment_method_details: { card: { country: "US", last4: "4242", fingerprint: "fp1" } }, ...o,
});

test("totals, 30-day windows and averages", () => {
  const s = summarizeCharges([
    charge({ amount: 2000, amount_captured: 2000 }),
    charge({ created: daysAgo(10) }),
    charge({ created: daysAgo(45), billing_details: { email: "b@example.com", address: { country: "AU" } } }),
  ], NOW);
  assert.equal(s.revenue, 4000);
  assert.equal(s.orders, 3);
  assert.equal(s.last30, 3000);
  assert.equal(s.orders30, 2);
  assert.equal(s.prev30, 1000);
  assert.equal(s.prevOrders30, 1);
  assert.equal(s.averageOrder, 1333);
  assert.equal(s.customers, 2);
  assert.deepEqual(s.countries, [{ code: "US", amount: 3000 }, { code: "AU", amount: 1000 }]);
});

test("failed, fully refunded and partly refunded charges", () => {
  const s = summarizeCharges([
    charge({ status: "failed", paid: false }),
    charge({ refunded: true, amount_refunded: 1000 }),
    charge({ amount_refunded: 400 }),
  ], NOW);
  assert.equal(s.orders, 1);
  assert.equal(s.revenue, 600);
});

test("daily series covers 90 days ending today", () => {
  const s = summarizeCharges([charge({ created: daysAgo(0) }), charge({ created: daysAgo(200) })], NOW);
  assert.equal(s.daily.length, DAYS);
  assert.equal(s.daily.at(-1).day, "2026-10-12");
  assert.equal(s.daily.at(-1).amount, 1000);
  assert.equal(s.daily.reduce((a, d) => a + d.amount, 0), 1000); // the 200-day-old sale is outside the chart
  assert.equal(s.revenue, 2000);                                   // but counts toward the total
  assert.equal(s.firstSale, new Date(daysAgo(200) * 1000).toISOString().slice(0, 10));
});

test("reports the main currency only", () => {
  const s = summarizeCharges([charge(), charge(), charge({ currency: "aud", amount: 9999, amount_captured: 9999 })], NOW);
  assert.equal(s.currency, "usd");
  assert.equal(s.revenue, 2000);
  assert.deepEqual(s.otherCurrencies, ["aud"]);
});

test("never exposes names, emails or card details", () => {
  const out = JSON.stringify(summarizeCharges([charge({ description: "Gale Pack" })], NOW));
  for (const secret of ["Secret Name", "a@example.com", "4242", "fp1"]) assert.ok(!out.includes(secret), secret);
  assert.match(out, /Gale Pack/);
});

test("no sales", () => {
  const s = summarizeCharges([], NOW);
  assert.equal(s.revenue, 0);
  assert.equal(s.averageOrder, 0);
  assert.equal(s.firstSale, null);
  assert.deepEqual(s.recent, []);
});
