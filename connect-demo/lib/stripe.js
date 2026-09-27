// -----------------------------------------------------------------------------
// Stripe client + configuration
//
// Every Stripe request in this demo goes through ONE `stripeClient`, created
// here. We never pin an API version: the SDK (stripe-node v22) sends the version
// it was built for (2026-08-26.dahlia) automatically.
//
// All secrets come from environment variables (see .env.example). Nothing is
// hard-coded, and a missing value produces an error that says exactly what to
// set and where to find it.
// -----------------------------------------------------------------------------
import Stripe from "stripe";

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

// Where each setting comes from, used in error messages.
const HELP = {
  STRIPE_SECRET_KEY:
    "Your platform's secret key. Find it at https://dashboard.stripe.com/apikeys (starts with sk_test_ or sk_live_).",
  STRIPE_CONNECT_WEBHOOK_SECRET:
    "Signing secret of the THIN event destination for connected-account (v2) events. " +
    "Locally: run `stripe listen --thin-events ... --forward-thin-to localhost:4242/webhooks/connect` and copy the whsec_ it prints.",
  STRIPE_BILLING_WEBHOOK_SECRET:
    "Signing secret of the SNAPSHOT webhook endpoint for subscription/billing events. " +
    "Locally: run `stripe listen --events ... --forward-to localhost:4242/webhooks/billing` and copy the whsec_ it prints.",
  PRICE_ID:
    "ID of a recurring Price on your PLATFORM account that connected accounts subscribe to (starts with price_). " +
    "Create one at https://dashboard.stripe.com/products.",
};

/**
 * Read a required setting. Throws a ConfigError explaining how to fix it.
 * Called lazily, so a missing webhook secret only breaks the webhook route,
 * not the whole app.
 */
export function requireEnv(name, env = process.env) {
  const value = env[name]?.trim();
  // PLACEHOLDER: set this value in your .env file (copy .env.example to .env).
  if (!value || value.includes("REPLACE_ME")) {
    throw new ConfigError(`Missing ${name}. ${HELP[name] ?? ""}`.trim());
  }
  return value;
}

/**
 * Create the Stripe Client used for all requests.
 */
export function createStripeClient(env = process.env) {
  const secretKey = requireEnv("STRIPE_SECRET_KEY", env);
  if (secretKey.startsWith("pk_")) {
    throw new ConfigError(
      "STRIPE_SECRET_KEY is a publishable key (pk_...). Use the SECRET key (sk_...) from https://dashboard.stripe.com/apikeys."
    );
  }
  if (!/^(sk|rk)_(test|live)_/.test(secretKey)) {
    throw new ConfigError(
      "STRIPE_SECRET_KEY doesn't look like a Stripe secret key. It should start with sk_test_ or sk_live_."
    );
  }
  // The Stripe Client. Use `stripeClient` for every Stripe call in the app.
  return new Stripe(secretKey);
}

/**
 * Non-secret settings with sensible defaults for local development.
 */
export function loadSettings(env = process.env) {
  const port = Number(env.PORT || 4242);
  return {
    port,
    // Public URL of this app. Stripe redirects back here after onboarding and checkout.
    baseUrl: (env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ""),
    // Sample platform fee taken on each storefront sale, in the smallest currency
    // unit (cents). $1.23 here. Adjust to your pricing.
    applicationFeeCents: Number(env.APPLICATION_FEE_CENTS || 123),
    dbFile: env.DB_FILE || new URL("../data/db.json", import.meta.url).pathname,
  };
}
