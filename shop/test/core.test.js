import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../core.js";
import { PRODUCTS, PROMO_CODES, SHIPPING, TAX_RATE } from "../products.js";

const mug = PRODUCTS.find((p) => p.id === "mug-ember");
const throwP = PRODUCTS.find((p) => p.id === "throw-wool");
const bottle = PRODUCTS.find((p) => p.id === "bottle");
const opts = { promos: PROMO_CODES, shipping: SHIPPING, taxRate: TAX_RATE };

test("formats money", () => {
  assert.equal(core.formatMoney(2400), "$24.00");
});

test("adds to cart and clamps to stock", () => {
  let cart = core.addToCart({}, mug, 2);
  cart = core.addToCart(cart, mug, 1);
  assert.equal(cart[mug.id], 3);
  assert.equal(core.addToCart({}, throwP, 99)[throwP.id], throwP.stock);
  assert.deepEqual(core.addToCart({}, bottle), {}, "out of stock is not added");
});

test("setQuantity removes at zero", () => {
  const cart = core.setQuantity({ [mug.id]: 2 }, mug, 0);
  assert.deepEqual(cart, {});
  assert.equal(core.cartCount(core.setQuantity({}, mug, 5)), 5);
});

test("totals charge shipping under the threshold", () => {
  const lines = core.cartLines({ [mug.id]: 1 }, PRODUCTS);
  const t = core.computeTotals(lines, opts);
  assert.equal(t.subtotal, 2400);
  assert.equal(t.shipping, 800);
  assert.equal(t.tax, 192);
  assert.equal(t.total, 3392);
});

test("free shipping over the threshold and promo codes", () => {
  const big = core.cartLines({ [throwP.id]: 1 }, PRODUCTS);
  assert.equal(core.computeTotals(big, opts).shipping, 0);
  const lines = core.cartLines({ [mug.id]: 1 }, PRODUCTS);
  const pct = core.computeTotals(lines, { ...opts, promo: "WELCOME10" });
  assert.equal(pct.discount, 240);
  assert.equal(core.computeTotals(lines, { ...opts, promo: "FREESHIP" }).shipping, 0);
  assert.equal(core.normalizePromo(" welcome10 ", PROMO_CODES), "WELCOME10");
  assert.equal(core.normalizePromo("nope", PROMO_CODES), null);
});

test("empty cart totals are zero", () => {
  assert.equal(core.computeTotals([], opts).total, 0);
});

test("filters and sorts products", () => {
  const desk = core.filterProducts(PRODUCTS, { category: "Desk", sort: "price-asc" });
  assert.ok(desk.every((p) => p.category === "Desk"));
  assert.ok(desk[0].price <= desk[desk.length - 1].price);
  assert.equal(core.filterProducts(PRODUCTS, { query: "brass" }).length, 2);
});

test("validates checkout", () => {
  assert.deepEqual(
    core.validateCheckout({ name: "Ada L", email: "a@b.co", address: "1 Main St", city: "X", zip: "12345" }),
    {}
  );
  const errs = core.validateCheckout({ email: "bad" });
  assert.ok(errs.name && errs.email && errs.address && errs.city && errs.zip);
});

test("order numbers look right", () => {
  assert.match(core.makeOrderNumber(), /^KG-[A-Z0-9]{7}$/);
});
