// -----------------------------------------------------------------------------
// Stripe Connect sample integration (Express)
//
// Flows:
//   1. Sign up           -> create a v2 connected account, store user -> acct_ mapping
//   2. Onboard           -> v2 Account Link to Stripe-hosted onboarding; status read live
//   3. Products          -> create products ON the connected account (Stripe-Account header)
//   4. Storefront        -> one page per seller; direct charge + application fee via Checkout
//   5. Subscription      -> the seller (same acct_ ID) subscribes to your platform plan
//   6. Billing portal    -> the seller manages that subscription
//   7. Webhooks          -> thin v2 account events + snapshot billing events
//
// Run: copy .env.example to .env, fill it in, then `npm start`.
// -----------------------------------------------------------------------------
import express from "express";
import { fileURLToPath } from "node:url";
import { createStripeClient, loadSettings, requireEnv, ConfigError } from "./lib/stripe.js";
import { createDb } from "./lib/db.js";
import {
  createConnectedAccount, getAccountStatus, createOnboardingLink, createProduct, listProducts,
  createStorefrontCheckout, createSubscriptionCheckout, createBillingPortal, UserFacingError,
} from "./lib/connect.js";
import { parseConnectNotification, handleConnectNotification, constructBillingEvent, handleBillingEvent } from "./lib/webhooks.js";
import { signupPage, dashboardPage, storefrontPage, messagePage, setBasePath } from "./lib/views.js";

const ACCOUNT_ID = /^acct_[A-Za-z0-9]+$/;

// Turn a Stripe/unknown error into a message that's safe to show.
function describe(err) {
  if (err instanceof UserFacingError || err instanceof ConfigError) return err.message;
  // Stripe API errors carry a readable `message` (e.g. invalid currency).
  if (err?.type?.startsWith?.("Stripe")) return err.message;
  return "Something went wrong. Check the server logs.";
}

// Parse "12", "12.5", "12.50" into integer cents. Returns null when invalid.
export function toCents(input) {
  const s = String(input ?? "").trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/**
 * Build the app. Dependencies are passed in so tests can use fakes.
 */
export function createApp({ stripeClient, db, settings, env = process.env, log = console.log }) {
  const app = express();
  // All routes live on a router so the app can run under a path prefix
  // ("/connect" on the Netlify site, "" locally).
  const router = express.Router();
  const bp = settings.basePath || "";
  setBasePath(bp);

  // --- Webhooks FIRST, with the raw body (signature checks need exact bytes) ---

  // Thin events for connected accounts (Accounts v2).
  router.post("/webhooks/connect", express.raw({ type: "application/json" }), async (req, res) => {
    let notification;
    try {
      notification = parseConnectNotification(stripeClient, req.body, req.get("stripe-signature"), env);
    } catch (err) {
      if (err instanceof ConfigError) return res.status(500).send(err.message);
      log(`[connect] Signature check failed: ${err.message}`);
      return res.status(400).send("Invalid signature");
    }
    try {
      await handleConnectNotification(stripeClient, notification, log);
      res.sendStatus(200);
    } catch (err) {
      // A 500 tells Stripe to retry the event later.
      log(`[connect] Handler failed for ${notification.id}: ${err.message}`);
      res.sendStatus(500);
    }
  });

  // Snapshot events for your platform's subscriptions/billing.
  router.post("/webhooks/billing", express.raw({ type: "application/json" }), async (req, res) => {
    let event;
    try {
      event = constructBillingEvent(stripeClient, req.body, req.get("stripe-signature"), env);
    } catch (err) {
      if (err instanceof ConfigError) return res.status(500).send(err.message);
      log(`[billing] Signature check failed: ${err.message}`);
      return res.status(400).send("Invalid signature");
    }
    try {
      await handleBillingEvent(db, event, log);
      res.sendStatus(200);
    } catch (err) {
      log(`[billing] Handler failed for ${event.id}: ${err.message}`);
      res.sendStatus(500);
    }
  });

  // Regular form posts.
  router.use(express.urlencoded({ extended: false }));

  // --- Demo "authentication" ------------------------------------------------
  // A plain cookie holding the user ID. Fine for a local demo only.
  // TODO: replace with your app's real sign-in (sessions, OAuth, ...).
  const currentUser = async (req) => {
    const match = /(?:^|;\s*)uid=([^;]+)/.exec(req.get("cookie") || "");
    return match ? await db.getUser(decodeURIComponent(match[1])) : null;
  };
  const signIn = (res, user) => res.cookie("uid", user.id, { httpOnly: true, sameSite: "lax", path: bp || "/" });
  const requireUser = async (req, res, next) => {
    const user = await currentUser(req);
    if (!user?.stripeAccountId) return res.redirect(303, bp + "/");
    req.user = user;
    next();
  };

  // --- 1. Sign up: create the connected account -------------------------------
  router.get("/", async (req, res) => {
    if ((await currentUser(req))?.stripeAccountId) return res.redirect(303, bp + "/dashboard");
    res.send(signupPage({ users: await db.listUsers(), error: req.query.error }));
  });

  router.post("/signup", async (req, res) => {
    const name = String(req.body.name || "").trim().slice(0, 80);
    const email = String(req.body.email || "").trim().slice(0, 200);
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).send(signupPage({ users: await db.listUsers(), error: "Enter a name and a valid email." }));
    }
    try {
      const account = await createConnectedAccount(stripeClient, { displayName: name, contactEmail: email });
      // Save the user and the user -> connected account mapping.
      const user = await db.createUser({ name, email, stripeAccountId: account.id });
      signIn(res, user);
      res.redirect(303, bp + "/dashboard");
    } catch (err) {
      log(`[signup] ${err.message}`);
      res.status(502).send(signupPage({ users: await db.listUsers(), error: `Couldn't create your Stripe account: ${describe(err)}` }));
    }
  });

  router.post("/login/:userId", async (req, res) => {
    const user = await db.getUser(req.params.userId);
    if (!user) return res.redirect(303, bp + "/");
    signIn(res, user);
    res.redirect(303, bp + "/dashboard");
  });

  router.post("/logout", (req, res) => {
    res.clearCookie("uid", { path: bp || "/" });
    res.redirect(303, bp + "/");
  });

  // --- 2. Dashboard + onboarding ------------------------------------------------
  router.get("/dashboard", requireUser, async (req, res) => {
    let status = null;
    let statusError = null;
    try {
      // Always read onboarding status live from the API (not from the database).
      status = await getAccountStatus(stripeClient, req.user.stripeAccountId);
    } catch (err) {
      log(`[dashboard] ${err.message}`);
      statusError = describe(err);
    }
    let priceConfigured = true;
    try {
      requireEnv("PRICE_ID", env);
    } catch {
      priceConfigured = false;
    }
    res.send(dashboardPage({
      user: req.user, status, statusError, priceConfigured,
      subscription: req.user.subscription,
      flash: req.query.flash, error: req.query.error,
    }));
  });

  // "Onboard to collect payments" button.
  router.post("/onboard", requireUser, async (req, res) => {
    try {
      const url = await createOnboardingLink(stripeClient, { accountId: req.user.stripeAccountId, baseUrl: settings.baseUrl });
      res.redirect(303, url); // off to Stripe-hosted onboarding
    } catch (err) {
      log(`[onboard] ${err.message}`);
      res.redirect(303, `${bp}/dashboard?error=${encodeURIComponent(describe(err))}`);
    }
  });

  // Stripe sends the user here when their link expired or was reused: make a fresh one.
  router.get("/onboard/refresh", requireUser, async (req, res) => {
    try {
      res.redirect(303, await createOnboardingLink(stripeClient, { accountId: req.user.stripeAccountId, baseUrl: settings.baseUrl }));
    } catch (err) {
      res.redirect(303, `${bp}/dashboard?error=${encodeURIComponent(describe(err))}`);
    }
  });

  // --- 3. Create products on the connected account --------------------------------
  router.post("/products", requireUser, async (req, res) => {
    const name = String(req.body.name || "").trim().slice(0, 120);
    const description = String(req.body.description || "").trim().slice(0, 500);
    const currency = ["usd", "eur", "gbp", "aud"].includes(req.body.currency) ? req.body.currency : "usd";
    const priceInCents = toCents(req.body.price);
    if (!name || !priceInCents) {
      return res.redirect(303, `${bp}/dashboard?error=${encodeURIComponent("Enter a product name and a price like 12.00.")}`);
    }
    try {
      const product = await createProduct(stripeClient, { accountId: req.user.stripeAccountId, name, description, priceInCents, currency });
      res.redirect(303, `${bp}/dashboard?flash=${encodeURIComponent(`Created "${product.name}".`)}`);
    } catch (err) {
      log(`[products] ${err.message}`);
      res.redirect(303, `${bp}/dashboard?error=${encodeURIComponent(`Couldn't create the product: ${describe(err)}`)}`);
    }
  });

  // --- 4. Storefront: one page per connected account ------------------------------
  // NOTE: the URL uses the Stripe account ID for simplicity. In a real app, use
  // your own identifier (a shop slug like /store/janes-candles) instead of acct_.
  const findSeller = async (req, res) => {
    const accountId = req.params.accountId;
    const seller = ACCOUNT_ID.test(accountId) ? await db.findUserByAccountId(accountId) : null;
    if (!seller) {
      res.status(404).send(messagePage({ title: "Not found", heading: "Store not found", message: "This store doesn't exist.", link: { href: "", label: "Home" } }));
    }
    return seller;
  };

  router.get("/store/:accountId", async (req, res) => {
    const seller = await findSeller(req, res);
    if (!seller) return;
    try {
      const products = await listProducts(stripeClient, seller.stripeAccountId);
      res.send(storefrontPage({ seller, products, canceled: req.query.canceled === "1", error: req.query.error }));
    } catch (err) {
      log(`[store] ${err.message}`);
      res.status(502).send(storefrontPage({ seller, products: [], error: `Couldn't load products: ${describe(err)}` }));
    }
  });

  router.post("/store/:accountId/checkout", async (req, res) => {
    const seller = await findSeller(req, res);
    if (!seller) return;
    const productId = String(req.body.productId || "");
    if (!/^prod_[A-Za-z0-9]+$/.test(productId)) return res.redirect(303, `${bp}/store/${seller.stripeAccountId}`);
    try {
      const url = await createStorefrontCheckout(stripeClient, {
        accountId: seller.stripeAccountId, productId, baseUrl: settings.baseUrl, applicationFeeCents: settings.applicationFeeCents,
      });
      res.redirect(303, url); // off to Stripe Checkout
    } catch (err) {
      log(`[checkout] ${err.message}`);
      res.redirect(303, `${bp}/store/${seller.stripeAccountId}?error=${encodeURIComponent(describe(err))}`);
    }
  });

  router.get("/store/:accountId/success", async (req, res) => {
    const seller = await findSeller(req, res);
    if (!seller) return;
    let message = "Thanks for your order!";
    try {
      // The session lives on the connected account, so pass the header here too.
      const session = await stripeClient.checkout.sessions.retrieve(String(req.query.session_id || ""), {}, { stripeAccount: seller.stripeAccountId });
      if (session.payment_status === "paid") message = `Payment received. A receipt was sent to ${session.customer_details?.email ?? "your email"}.`;
    } catch {
      // Still show a friendly page; fulfilment should rely on webhooks, not this redirect.
    }
    res.send(messagePage({ title: "Thank you", heading: "Thank you!", message, link: { href: `store/${seller.stripeAccountId}`, label: "Back to the store" } }));
  });

  // --- 5. Platform subscription for the connected account -------------------------
  router.post("/subscribe", requireUser, async (req, res) => {
    try {
      // PLACEHOLDER: PRICE_ID must be a recurring price on your platform (see .env.example).
      const priceId = requireEnv("PRICE_ID", env);
      const url = await createSubscriptionCheckout(stripeClient, { accountId: req.user.stripeAccountId, priceId, baseUrl: settings.baseUrl });
      res.redirect(303, url);
    } catch (err) {
      log(`[subscribe] ${err.message}`);
      res.redirect(303, `${bp}/dashboard?error=${encodeURIComponent(describe(err))}`);
    }
  });

  router.get("/subscribe/success", requireUser, (req, res) => {
    // The webhook (customer.subscription.created/updated) records the subscription.
    res.redirect(303, `${bp}/dashboard?flash=${encodeURIComponent("Thanks for subscribing! Your status updates in a few seconds.")}`);
  });

  // --- 6. Billing portal ---------------------------------------------------------
  router.post("/billing-portal", requireUser, async (req, res) => {
    try {
      res.redirect(303, await createBillingPortal(stripeClient, { accountId: req.user.stripeAccountId, baseUrl: settings.baseUrl }));
    } catch (err) {
      log(`[portal] ${err.message}`);
      res.redirect(303, `${bp}/dashboard?error=${encodeURIComponent(`Couldn't open billing: ${describe(err)}`)}`);
    }
  });

  // Mount the routes. On Netlify, requests may arrive either with the public
  // path (/connect/...) or the function path (/.netlify/functions/connect/...).
  app.use(bp || "/", router);
  if (bp) app.use("/.netlify/functions/connect", router);

  // Last resort: a friendly page instead of a stack trace (details go to the logs).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    log(`[error] ${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
    res.status(500).send(messagePage({
      title: "Something went wrong", heading: "Something went wrong",
      message: "Please try again in a moment. If it keeps happening, check the site's function logs.",
      link: { href: "", label: "Home" },
    }));
  });

  return app;
}

// --- Start the server when run directly (not when imported by tests) ----------
// `import.meta.url` is undefined when Netlify bundles this file for a function,
// so check it before using it.
const thisFile = typeof import.meta.url === "string" ? fileURLToPath(import.meta.url) : null;
if (thisFile && process.argv[1] === thisFile) {
  let stripeClient;
  try {
    stripeClient = createStripeClient();
  } catch (err) {
    console.error(`\nSetup needed: ${err.message}\nCopy .env.example to .env and fill it in, then run npm start again.\n`);
    process.exit(1);
  }
  const settings = loadSettings();
  const db = createDb(settings.dbFile ?? fileURLToPath(new URL("./data/db.json", import.meta.url)));
  createApp({ stripeClient, db, settings }).listen(settings.port, () => {
    console.log(`Connect demo running at ${settings.baseUrl}`);
  });
}
