import test from "node:test";
import assert from "node:assert/strict";
import { buildCheckout, sanitizeCart, CheckoutError } from "../checkout.js";

const origin = "https://example.test";
const sum = (p) => p.line_items.reduce((s, l) => s + l.price_data.unit_amount * l.quantity, 0);

test("prices come from the catalog, not the client", () => {
  const { params, totals } = buildCheckout({ items: { "mug-ember": 2, "desk-lamp": 1 }, origin });
  assert.equal(params.line_items[0].price_data.unit_amount, 2400);
  assert.equal(params.mode, "payment");
  // what Stripe will charge = our computed total
  assert.equal(sum(params) + params.shipping_options[0].shipping_rate_data.fixed_amount.amount, totals.total);
  assert.match(params.success_url, /^https:\/\/example\.test\/shop\/\?checkout=success&session_id=\{CHECKOUT_SESSION_ID\}$/);
});

test("discount and shipping line up with the storefront totals", () => {
  const { params, totals, discount, promo } = buildCheckout({ items: { "mug-ember": 1 }, promo: "welcome10", origin });
  assert.equal(promo, "WELCOME10");
  assert.equal(discount, 240);
  const ship = params.shipping_options[0].shipping_rate_data.fixed_amount.amount;
  assert.equal(ship, 800);
  assert.equal(sum(params) + ship - discount, totals.total);
});

test("unknown products and bad quantities are dropped; empty carts rejected", () => {
  assert.deepEqual(sanitizeCart({ "mug-ember": "2.7", fake: 3, planter: -1 }), { "mug-ember": 2 });
  assert.throws(() => sanitizeCart({ fake: 1 }), CheckoutError);
  assert.throws(() => sanitizeCart(null), CheckoutError);
});

test("over-stock and sold-out items are rejected", () => {
  assert.throws(() => sanitizeCart({ "throw-wool": 99 }), /Only 6/);
  assert.throws(() => sanitizeCart({ bottle: 1 }), /Only 0/);
});
