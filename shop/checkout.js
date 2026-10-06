// Builds the Stripe Checkout Session request from a cart. Runs on the server
// (Netlify Function), so prices, stock and discounts always come from the
// catalog here, never from what the browser sends.
import { PRODUCTS, PROMO_CODES, SHIPPING, TAX_RATE, CURRENCY } from "./products.js";
import { cartLines, computeTotals, normalizePromo } from "./core.js";

export const SHIP_COUNTRIES = ["US", "AU", "CA", "GB", "NZ"];

export class CheckoutError extends Error {}

// Turn untrusted input into a clean cart: known products, whole quantities, in stock.
export function sanitizeCart(items) {
  if (!items || typeof items !== "object") throw new CheckoutError("Cart is empty");
  const byId = new Map(PRODUCTS.map((p) => [p.id, p]));
  const cart = {};
  for (const [id, raw] of Object.entries(items)) {
    const product = byId.get(id);
    const qty = Math.floor(Number(raw));
    if (!product || !(qty > 0)) continue;
    if (qty > product.stock) throw new CheckoutError(`Only ${product.stock} ${product.name} left`);
    cart[id] = qty;
  }
  if (!Object.keys(cart).length) throw new CheckoutError("Cart is empty");
  return cart;
}

// Returns { totals, discount, params } where `params` is ready for
// stripe.checkout.sessions.create. When `discount` > 0 the caller attaches a
// one-time coupon for that amount (see the Netlify function).
export function buildCheckout({ items, promo, origin }) {
  const cart = sanitizeCart(items);
  const code = promo ? normalizePromo(promo, PROMO_CODES) : null;
  const lines = cartLines(cart, PRODUCTS);
  const totals = computeTotals(lines, { promo: code, promos: PROMO_CODES, shipping: SHIPPING, taxRate: TAX_RATE });
  const currency = CURRENCY.toLowerCase();

  const line_items = lines.map(({ product, qty }) => ({
    quantity: qty,
    price_data: {
      currency,
      unit_amount: product.price,
      product_data: { name: product.name, description: product.description, metadata: { sku: product.id } },
    },
  }));
  if (totals.tax > 0) {
    line_items.push({
      quantity: 1,
      price_data: { currency, unit_amount: totals.tax, product_data: { name: `Sales tax (${Math.round(TAX_RATE * 100)}%)` } },
    });
  }

  const base = `${origin}/shop/`;
  const params = {
    mode: "payment",
    line_items,
    shipping_address_collection: { allowed_countries: SHIP_COUNTRIES },
    shipping_options: [{
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: totals.shipping ? "Standard shipping" : "Free shipping",
        fixed_amount: { amount: totals.shipping, currency },
        delivery_estimate: { minimum: { unit: "business_day", value: 3 }, maximum: { unit: "business_day", value: 7 } },
      },
    }],
    metadata: { store: "kindred-goods", promo: code || "", cart: JSON.stringify(cart).slice(0, 500) },
    success_url: `${base}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?checkout=cancelled`,
  };
  return { totals, discount: totals.discount, promo: code, params };
}
