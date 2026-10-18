import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../core.js";

const shop = {
  id: "s",
  name: "Test Diner",
  currency: "USD",
  paidUntil: "2026-12-31",
  delivery: { enabled: true, fee: 300 },
  menu: [
    { category: "Food", name: "Burger", price: 1000 },
    { category: "Food", name: "Fries", price: 400 },
    { category: "Drinks", name: "Cola", price: 200 },
  ],
};
const now = new Date("2026-10-18T12:00:00Z");

function chat(business, messages) {
  let session = core.newSession();
  let last;
  for (const text of messages) {
    last = core.handleMessage(business, session, text, { now });
    session = last.session;
  }
  return last;
}

test("parses item lists", () => {
  assert.deepEqual(core.parseItems("2", 3), [{ index: 1, qty: 1 }]);
  assert.deepEqual(core.parseItems("1, 3x2", 3), [{ index: 0, qty: 1 }, { index: 2, qty: 2 }]);
  assert.deepEqual(core.parseItems("1 x 4 2", 3), [{ index: 0, qty: 4 }, { index: 1, qty: 1 }]);
  assert.equal(core.parseItems("9", 3), null);
  assert.equal(core.parseItems("hello", 3), null);
});

test("greeting shows grouped menu", () => {
  const r = chat(shop, ["hi"]);
  assert.equal(r.replies.length, 2);
  assert.match(r.replies[1], /_Drinks_\n3\. Cola - \$2\.00/);
});

test("full delivery order", () => {
  const r = chat(shop, ["hi", "1x2, 3", "done", "Sam", "2", "12 Main St", "yes"]);
  assert.deepEqual(r.order, {
    name: "Sam",
    fulfilment: "delivery",
    address: "12 Main St",
    lines: [
      { name: "Burger", qty: 2, lineTotal: 2000 },
      { name: "Cola", qty: 1, lineTotal: 200 },
    ],
    subtotal: 2200,
    deliveryFee: 300,
    total: 2500,
  });
  assert.equal(r.session.step, "browsing");
  assert.deepEqual(r.session.cart, {});
});

test("confirmation shows delivery fee and total", () => {
  const r = chat(shop, ["2", "done", "Al", "2", "5 Oak Avenue"]);
  assert.match(r.replies[0], /Delivery - \$3\.00\n\*Total: \$7\.00\*/);
});

test("pickup only when delivery disabled", () => {
  const r = chat({ ...shop, delivery: { enabled: false } }, ["2", "done", "Al", "yes"]);
  assert.equal(r.order.fulfilment, "pickup");
  assert.equal(r.order.total, 400);
});

test("can't check out an empty cart; remove and cancel work", () => {
  assert.match(chat(shop, ["done"]).replies[0], /cart is empty/);
  assert.match(chat(shop, ["1", "2", "remove 1"]).replies[0], /^1 x Fries/);
  const r = chat(shop, ["1", "done", "cancel"]);
  assert.deepEqual(r.session, core.newSession());
});

test("unpaid business gets the paused message and no order", () => {
  const r = chat({ ...shop, paidUntil: "2026-10-17" }, ["hi"]);
  assert.match(r.replies[0], /isn't taking WhatsApp orders/);
  assert.equal(core.isActive({ ...shop, paidUntil: "2026-10-18" }, now), true, "paid day is inclusive");
});

test("owner notification text", () => {
  const r = chat(shop, ["1", "done", "Sam", "1", "yes"]);
  const text = core.ownerOrderText(shop, { ...r.order, number: 7, customer: "15550001111" });
  assert.match(text, /New order #7 - Test Diner\nFrom: Sam \(\+15550001111\)\nPickup\n\n1 x Burger\n\nTotal: \$10\.00/);
});
