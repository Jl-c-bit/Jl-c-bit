// -----------------------------------------------------------------------------
// Kindred Goods store checkout (https://<your-site>/shop/)
//
//   POST /shop/api/checkout  { items: { productId: qty }, promo? }
//        -> { url }  Stripe-hosted Checkout page to redirect the shopper to
//        -> 503 when STRIPE_SECRET_KEY is not set (the store falls back to demo checkout)
//   GET  /shop/api/order?session_id=cs_...
//        -> { paid, total, currency, email, name }  for the confirmation screen
//
// Prices are rebuilt from shop/products.js on the server. Uses the site's
// STRIPE_SECRET_KEY (sk_test_ for test mode, sk_live_ to take real payments).
// -----------------------------------------------------------------------------
import Stripe from "stripe";
import { buildCheckout, CheckoutError } from "../../../shop/checkout.js";
import { CURRENCY } from "../../../shop/products.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const key = Netlify.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!key) return json({ error: "Payments are not set up yet" }, 503);
  const stripe = new Stripe(key);
  const url = new URL(req.url);

  try {
    if (req.method === "POST" && url.pathname === "/shop/api/checkout") {
      const body = await req.json().catch(() => ({}));
      const { params, discount, promo } = buildCheckout({ items: body.items, promo: body.promo, origin: url.origin });
      if (discount > 0) {
        // One-time coupon for exactly the discount the store calculated.
        const coupon = await stripe.coupons.create({
          name: promo, amount_off: discount, currency: CURRENCY.toLowerCase(), duration: "once", max_redemptions: 1,
        });
        params.discounts = [{ coupon: coupon.id }];
      }
      const session = await stripe.checkout.sessions.create(params);
      return json({ url: session.url });
    }

    if (req.method === "GET" && url.pathname === "/shop/api/order") {
      const id = url.searchParams.get("session_id") || "";
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json({ error: "Invalid session" }, 400);
      const s = await stripe.checkout.sessions.retrieve(id);
      if (s.metadata?.store !== "kindred-goods") return json({ error: "Not found" }, 404);
      return json({
        paid: s.payment_status === "paid",
        total: s.amount_total,
        currency: s.currency,
        email: s.customer_details?.email || "",
        name: s.customer_details?.name || "",
        order: s.id.slice(-8).toUpperCase(),
      });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    if (err instanceof CheckoutError) return json({ error: err.message }, 400);
    console.error("shop checkout error:", err.type || err.name, err.message);
    return json({ error: "Checkout is unavailable right now. Please try again." }, 502);
  }
};

export const config = { path: ["/shop/api/checkout", "/shop/api/order"] };
