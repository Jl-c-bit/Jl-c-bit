// -----------------------------------------------------------------------------
// Real sales numbers for the Stormnettle dashboard:  GET /dashboard/api/stats
//
// Reads succeeded charges from Stripe and returns totals only, via dashboard/stats.js.
// Key: DASHBOARD_STRIPE_KEY if set, otherwise the shop's STRIPE_SECRET_KEY. That
// lets the shop stay on a test key while the dashboard reads live sales. Use a
// restricted key (rk_live_...) with only "Charges: Read" for DASHBOARD_STRIPE_KEY.
// Answers 503 when no key is set, and the dashboard falls back to demo data.
// Responses are cached for 5 minutes so page views don't each call Stripe.
// -----------------------------------------------------------------------------
import Stripe from "stripe";
import { summarizeCharges } from "../../../dashboard/stats.js";

const MAX_CHARGES = 5000;
const CACHE_MS = 5 * 60 * 1000;

const json = (body, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": cache } });

export function createHandler(getStripe, now = () => Date.now()) {
  let cached = null;
  return async function handler(request) {
    if (request.method !== "GET") return json({ error: "Not found" }, 404);
    const stripe = getStripe();
    if (!stripe) return json({ error: "Stripe is not set up" }, 503);
    if (cached && now() - cached.at < CACHE_MS) return json(cached.body, 200, "public, max-age=300");
    try {
      const charges = [];
      for await (const c of stripe.charges.list({ limit: 100 })) {
        charges.push(c);
        if (charges.length >= MAX_CHARGES) break;
      }
      const body = { source: "stripe", livemode: charges[0]?.livemode ?? null, updated: now(), ...summarizeCharges(charges, now()) };
      cached = { at: now(), body };
      return json(body, 200, "public, max-age=300");
    } catch (err) {
      console.error("dashboard stats error:", err.type || err.name, err.message);
      return json({ error: "Sales data is unavailable right now" }, 502);
    }
  };
}

let client;
export default createHandler(() => {
  const key = (Netlify.env.get("DASHBOARD_STRIPE_KEY") || Netlify.env.get("STRIPE_SECRET_KEY"))?.trim();
  if (!key) return null;
  return (client ??= new Stripe(key));
});

export const config = { path: "/dashboard/api/stats" };
