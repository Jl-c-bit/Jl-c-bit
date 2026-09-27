// End-to-end tests of the Express app with a fake Stripe API.
// Webhook signatures are generated and verified with the REAL stripe-node code.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import serverless from "serverless-http";
import { createApp, toCents } from "../server.js";
import { createDb } from "../lib/db.js";
import { createStripeClient, ConfigError, loadSettings } from "../lib/stripe.js";
import { handler as netlifyHandler } from "../netlify/functions/connect.mjs";

const real = new Stripe("sk_test_fake");
const calls = [];
const rec = (name, result) => async (...args) => {
  calls.push({ name, args });
  return typeof result === "function" ? result(...args) : result;
};
const lastCall = (name) => [...calls].reverse().find((c) => c.name === name);

let accountState = {
  id: "acct_123",
  display_name: "Jane's Candles",
  configuration: { merchant: { capabilities: { card_payments: { status: "pending" } } } },
  requirements: {
    summary: { minimum_deadline: { status: "currently_due" } },
    entries: [{ description: "Business address", minimum_deadline: { status: "currently_due" } }],
  },
};

// Fake client: the same shape as stripeClient, recording every call.
const fakeStripe = {
  parseEventNotification: real.parseEventNotification.bind(real),
  webhooks: real.webhooks,
  v2: {
    core: {
      accounts: {
        create: rec("accounts.create", { id: "acct_123" }),
        retrieve: rec("accounts.retrieve", () => accountState),
      },
      accountLinks: { create: rec("accountLinks.create", { url: "https://connect.stripe.com/setup/xyz" }) },
      events: {
        retrieve: rec("events.retrieve", (id) => ({
          id,
          type: id === "evt_cap" ? "v2.core.account[configuration.merchant].capability_status_updated" : "v2.core.account[requirements].updated",
          related_object: { id: "acct_123", type: "v2.core.account" },
        })),
      },
    },
  },
  products: {
    create: rec("products.create", (p) => ({ id: "prod_1", name: p.name })),
    list: rec("products.list", {
      data: [
        { id: "prod_1", name: "Lavender <candle>", description: "Smells nice", active: true, default_price: { id: "price_1", unit_amount: 1200, currency: "usd" } },
      ],
    }),
    retrieve: rec("products.retrieve", { id: "prod_1", active: true, default_price: { id: "price_1", unit_amount: 1200, currency: "usd" } }),
  },
  checkout: {
    sessions: {
      create: rec("checkout.create", { url: "https://checkout.stripe.com/c/pay/cs_1" }),
      retrieve: rec("checkout.retrieve", { payment_status: "paid", customer_details: { email: "buyer@example.com" } }),
    },
  },
  billingPortal: { sessions: { create: rec("portal.create", { url: "https://billing.stripe.com/p/session/1" }) } },
};

const env = {
  STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_connect_test",
  STRIPE_BILLING_WEBHOOK_SECRET: "whsec_billing_test",
  PRICE_ID: "price_platform_monthly",
};
const logs = [];
let server, base, db, cookie;

before(async () => {
  db = createDb(null); // in-memory
  const app = createApp({
    stripeClient: fakeStripe, db, env, log: (m) => logs.push(m),
    settings: { baseUrl: "http://demo.test", applicationFeeCents: 123 },
  });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (path, form, headers = {}) =>
  fetch(base + path, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie, ...headers }, body: new URLSearchParams(form) });
const get = (path) => fetch(base + path, { redirect: "manual", headers: { cookie } });

test("config: helpful errors for missing or wrong keys", () => {
  assert.throws(() => createStripeClient({}), (e) => e instanceof ConfigError && /dashboard\.stripe\.com\/apikeys/.test(e.message));
  assert.throws(() => createStripeClient({ STRIPE_SECRET_KEY: "sk_test_REPLACE_ME" }), /Missing STRIPE_SECRET_KEY/);
  assert.throws(() => createStripeClient({ STRIPE_SECRET_KEY: "pk_test_abc" }), /publishable key/);
  assert.ok(createStripeClient({ STRIPE_SECRET_KEY: "sk_test_abc" }));
});

test("toCents parses prices safely", () => {
  assert.equal(toCents("12"), 1200);
  assert.equal(toCents("12.5"), 1250);
  assert.equal(toCents("0.99"), 99);
  assert.equal(toCents("-1"), null);
  assert.equal(toCents("1.999"), null);
  assert.equal(toCents("abc"), null);
});

test("signup creates a v2 account with exactly the required properties", async () => {
  const res = await post("/signup", { name: "Jane's Candles", email: "jane@example.com" });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/dashboard");
  cookie = res.headers.get("set-cookie").split(";")[0];
  const [params] = lastCall("accounts.create").args;
  assert.deepEqual(params, {
    display_name: "Jane's Candles",
    contact_email: "jane@example.com",
    identity: { country: "us" },
    dashboard: "full",
    defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
    configuration: { customer: {}, merchant: { capabilities: { card_payments: { requested: true } } } },
  });
  assert.equal(params.type, undefined, "no top-level type");
  assert.equal((await db.listUsers())[0].stripeAccountId, "acct_123", "user -> account mapping stored");
});

test("dashboard reads status live from the API and offers onboarding", async () => {
  const html = await (await get("/dashboard")).text();
  const [id, opts] = lastCall("accounts.retrieve").args;
  assert.equal(id, "acct_123");
  assert.deepEqual(opts, { include: ["configuration.merchant", "requirements"] });
  assert.match(html, /Onboard to collect payments/);
  assert.match(html, /Action needed/);
  assert.match(html, /Business address/);
  assert.match(html, /Jane&#39;s Candles/, "escaped");
});

test("onboarding redirects to a v2 account link", async () => {
  const res = await post("/onboard", {});
  assert.equal(res.headers.get("location"), "https://connect.stripe.com/setup/xyz");
  assert.deepEqual(lastCall("accountLinks.create").args[0], {
    account: "acct_123",
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "customer"],
        refresh_url: "http://demo.test/onboard/refresh",
        return_url: "http://demo.test/dashboard?accountId=acct_123",
      },
    },
  });
});

test("onboarded account shows ready and hides the onboarding button", async () => {
  accountState = { ...accountState, configuration: { merchant: { capabilities: { card_payments: { status: "active" } } } }, requirements: { summary: { minimum_deadline: { status: "eventually_due" } }, entries: [] } };
  const html = await (await get("/dashboard")).text();
  assert.doesNotMatch(html, /Onboard to collect payments/);
  assert.match(html, /ready to sell/);
});

test("products are created on the connected account", async () => {
  const res = await post("/products", { name: "Lavender candle", description: "Soy wax", price: "12.00", currency: "usd" });
  assert.match(res.headers.get("location"), /flash=/);
  const [params, opts] = lastCall("products.create").args;
  assert.deepEqual(params, { name: "Lavender candle", description: "Soy wax", default_price_data: { unit_amount: 1200, currency: "usd" } });
  assert.deepEqual(opts, { stripeAccount: "acct_123" });
  const bad = await post("/products", { name: "x", price: "free", currency: "usd" });
  assert.match(bad.headers.get("location"), /error=/);
});

test("storefront lists products with the Stripe-Account header", async () => {
  const html = await (await fetch(`${base}/store/acct_123`)).text();
  assert.deepEqual(lastCall("products.list").args, [{ limit: 20, active: true, expand: ["data.default_price"] }, { stripeAccount: "acct_123" }]);
  assert.match(html, /Lavender &lt;candle&gt;/);
  assert.match(html, /\$12\.00/);
  assert.equal((await fetch(`${base}/store/acct_unknown`)).status, 404);
  assert.equal((await fetch(`${base}/store/not-an-id`)).status, 404);
});

test("buying creates a direct charge with an application fee", async () => {
  const res = await fetch(`${base}/store/acct_123/checkout`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "productId=prod_1" });
  assert.equal(res.headers.get("location"), "https://checkout.stripe.com/c/pay/cs_1");
  assert.deepEqual(lastCall("products.retrieve").args, ["prod_1", { expand: ["default_price"] }, { stripeAccount: "acct_123" }]);
  const [params, opts] = lastCall("checkout.create").args;
  assert.deepEqual(opts, { stripeAccount: "acct_123" });
  assert.equal(params.mode, "payment");
  assert.deepEqual(params.payment_intent_data, { application_fee_amount: 123 });
  assert.deepEqual(params.line_items, [{ price_data: { currency: "usd", unit_amount: 1200, product: "prod_1" }, quantity: 1 }]);
  assert.equal(params.success_url, "http://demo.test/store/acct_123/success?session_id={CHECKOUT_SESSION_ID}");
});

test("success page retrieves the session on the connected account", async () => {
  const html = await (await fetch(`${base}/store/acct_123/success?session_id=cs_1`)).text();
  assert.deepEqual(lastCall("checkout.retrieve").args, ["cs_1", {}, { stripeAccount: "acct_123" }]);
  assert.match(html, /buyer@example\.com/);
});

test("subscription checkout uses customer_account on the platform", async () => {
  const res = await post("/subscribe", {});
  assert.equal(res.headers.get("location"), "https://checkout.stripe.com/c/pay/cs_1");
  const call = lastCall("checkout.create");
  assert.equal(call.args.length, 1, "no Stripe-Account header: platform-level session");
  assert.deepEqual(call.args[0], {
    customer_account: "acct_123",
    mode: "subscription",
    line_items: [{ price: "price_platform_monthly", quantity: 1 }],
    success_url: "http://demo.test/subscribe/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "http://demo.test/dashboard",
  });
});

test("billing portal uses customer_account", async () => {
  const res = await post("/billing-portal", {});
  assert.equal(res.headers.get("location"), "https://billing.stripe.com/p/session/1");
  assert.deepEqual(lastCall("portal.create").args[0], { customer_account: "acct_123", return_url: "http://demo.test/dashboard" });
});

// ---- Webhooks ---------------------------------------------------------------

function signedPost(path, payloadObj, secret) {
  const payload = JSON.stringify(payloadObj);
  const header = real.webhooks.generateTestHeaderString({ payload, secret });
  return fetch(base + path, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
}

const thin = (id, type) => ({
  id, object: "v2.core.event", type, created: "2026-09-27T00:00:00.000Z", livemode: false,
  related_object: { id: "acct_123", type: "v2.core.account", url: "/v2/core/accounts/acct_123" },
});

test("thin webhook: requirements.updated fetches the event and account", async () => {
  const res = await signedPost("/webhooks/connect", thin("evt_req", "v2.core.account[requirements].updated"), env.STRIPE_CONNECT_WEBHOOK_SECRET);
  assert.equal(res.status, 200);
  assert.deepEqual(lastCall("events.retrieve").args, ["evt_req"]);
  assert.ok(logs.some((l) => l.includes("acct_123 requirements updated")));
});

test("thin webhook: capability status updated", async () => {
  const res = await signedPost("/webhooks/connect", thin("evt_cap", "v2.core.account[configuration.merchant].capability_status_updated"), env.STRIPE_CONNECT_WEBHOOK_SECRET);
  assert.equal(res.status, 200);
  assert.deepEqual(lastCall("accounts.retrieve").args, ["acct_123", { include: ["configuration.merchant"] }]);
  assert.ok(logs.some((l) => l.includes("merchant capabilities: card_payments=active")));
});

test("thin webhook rejects bad signatures", async () => {
  const res = await signedPost("/webhooks/connect", thin("evt_x", "v2.core.account[requirements].updated"), "whsec_wrong");
  assert.equal(res.status, 400);
});

const snapshot = (type, object) => ({ id: `evt_${type}`, object: "event", type, api_version: "2026-08-26.dahlia", created: 1, data: { object }, livemode: false });
const sub = (extra = {}) => ({
  id: "sub_1", object: "subscription", status: "active", customer_account: "acct_123", cancel_at_period_end: false, pause_collection: null,
  items: { data: [{ price: { id: "price_platform_monthly" }, quantity: 1 }] }, ...extra,
});

test("billing webhook stores subscription state by customer_account", async () => {
  let res = await signedPost("/webhooks/billing", snapshot("customer.subscription.updated", sub()), env.STRIPE_BILLING_WEBHOOK_SECRET);
  assert.equal(res.status, 200);
  assert.equal((await db.findUserByAccountId("acct_123")).subscription.status, "active");

  res = await signedPost("/webhooks/billing", snapshot("customer.subscription.updated", sub({ cancel_at_period_end: true, items: { data: [{ price: { id: "price_pro" }, quantity: 3 }] } })), env.STRIPE_BILLING_WEBHOOK_SECRET);
  const s = (await db.findUserByAccountId("acct_123")).subscription;
  assert.equal(s.cancelAtPeriodEnd, true);
  assert.equal(s.priceId, "price_pro");
  assert.equal(s.quantity, 3);

  res = await signedPost("/webhooks/billing", snapshot("customer.subscription.deleted", sub({ status: "canceled" })), env.STRIPE_BILLING_WEBHOOK_SECRET);
  assert.equal((await db.findUserByAccountId("acct_123")).subscription.status, "canceled");

  const html = await (await get("/dashboard")).text();
  assert.match(html, /canceled/);
  assert.match(html, />Subscribe</, "can subscribe again after cancel");
});

test("billing webhook acknowledges every listed event type", async () => {
  const types = [
    ["payment_method.attached", { type: "card", customer_account: "acct_123" }],
    ["payment_method.detached", { type: "card", customer_account: "acct_123" }],
    ["customer.updated", { invoice_settings: { default_payment_method: "pm_1" } }],
    ["customer.tax_id.created", { type: "eu_vat", verification: { status: "pending" } }],
    ["customer.tax_id.deleted", { type: "eu_vat" }],
    ["customer.tax_id.updated", { type: "eu_vat", verification: { status: "verified" } }],
    ["billing_portal.configuration.created", { id: "bpc_1" }],
    ["billing_portal.configuration.updated", { id: "bpc_1" }],
    ["billing_portal.session.created", { id: "bps_1" }],
    ["invoice.paid", { customer_account: "acct_123", amount_paid: 900, currency: "usd" }],
  ];
  for (const [type, obj] of types) {
    const res = await signedPost("/webhooks/billing", snapshot(type, obj), env.STRIPE_BILLING_WEBHOOK_SECRET);
    assert.equal(res.status, 200, type);
  }
  assert.ok(!logs.some((l) => l.includes("Unhandled")), logs.filter((l) => l.includes("Unhandled")).join("\n"));
});

test("missing webhook secret gives a helpful 500", async () => {
  const app = createApp({ stripeClient: fakeStripe, db, env: {}, log: () => {}, settings: { baseUrl: "x", applicationFeeCents: 123 } });
  const s = await new Promise((r) => { const srv = app.listen(0, () => r(srv)); });
  const res = await fetch(`http://127.0.0.1:${s.address().port}/webhooks/billing`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "x" }, body: "{}" });
  assert.equal(res.status, 500);
  assert.match(await res.text(), /Missing STRIPE_BILLING_WEBHOOK_SECRET/);
  s.close();
});

// ---- Running under /connect on Netlify ----------------------------------------

test("settings: Netlify URL + base path", () => {
  const s = loadSettings({ URL: "https://site.netlify.app", BASE_PATH: "/connect" });
  assert.equal(s.basePath, "/connect");
  assert.equal(s.baseUrl, "https://site.netlify.app/connect");
  assert.equal(loadSettings({}).baseUrl, "http://localhost:4242");
});

// Build a Lambda-style event like Netlify sends to the function.
const lambdaEvent = (method, path, { body = "", headers = {} } = {}) => ({
  httpMethod: method, path, rawUrl: `https://site.netlify.app${path}`, headers: { host: "site.netlify.app", ...headers },
  multiValueHeaders: {}, queryStringParameters: {}, multiValueQueryStringParameters: {}, body, isBase64Encoded: false,
});

test("Netlify adapter: pages, prefixed redirects, cookie path and webhooks", async () => {
  const pdb = createDb(null);
  const app = createApp({
    stripeClient: fakeStripe, db: pdb, env, log: () => {},
    settings: { basePath: "/connect", baseUrl: "https://site.netlify.app/connect", applicationFeeCents: 123 },
  });
  const handle = serverless(app);

  // Home page on the public path, with a <base> so relative links stay under /connect/.
  let res = await handle(lambdaEvent("GET", "/connect/"), {});
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<base href="\/connect\/">/);
  assert.match(res.body, /action="signup"/);

  // Same app reachable on the function path too.
  res = await handle(lambdaEvent("GET", "/.netlify/functions/connect/"), {});
  assert.equal(res.statusCode, 200);

  // Sign up: redirect keeps the prefix, cookie is scoped to /connect.
  res = await handle(lambdaEvent("POST", "/connect/signup", {
    body: "name=Shop&email=shop%40example.com", headers: { "content-type": "application/x-www-form-urlencoded" },
  }), {});
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, "/connect/dashboard");
  const setCookie = [res.headers["set-cookie"], ...(res.multiValueHeaders?.["set-cookie"] ?? [])].filter(Boolean).join(";");
  assert.match(setCookie, /Path=\/connect/);

  // Onboarding link uses the public /connect URLs.
  const cookieHeader = setCookie.split(";")[0];
  res = await handle(lambdaEvent("POST", "/connect/onboard", { headers: { cookie: cookieHeader, "content-type": "application/x-www-form-urlencoded" } }), {});
  assert.equal(res.statusCode, 303);
  const link = lastCall("accountLinks.create").args[0].use_case.account_onboarding;
  assert.equal(link.refresh_url, "https://site.netlify.app/connect/onboard/refresh");
  assert.equal(link.return_url, "https://site.netlify.app/connect/dashboard?accountId=acct_123");

  // A signed webhook still verifies after passing through the Lambda adapter (raw body intact).
  const payload = JSON.stringify(snapshot("customer.subscription.updated", sub()));
  const header = real.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_BILLING_WEBHOOK_SECRET });
  res = await handle(lambdaEvent("POST", "/connect/webhooks/billing", { body: payload, headers: { "content-type": "application/json", "stripe-signature": header } }), {});
  assert.equal(res.statusCode, 200);
  assert.equal((await pdb.findUserByAccountId("acct_123")).subscription.status, "active");

  // Base64-encoded bodies (how Netlify sometimes delivers them) verify too.
  res = await handle({ ...lambdaEvent("POST", "/connect/webhooks/billing", { headers: { "content-type": "application/json", "stripe-signature": header } }), body: Buffer.from(payload).toString("base64"), isBase64Encoded: true }, {});
  assert.equal(res.statusCode, 200);
});

test("Netlify function shows a setup page when the Stripe key is missing", async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const event = { ...lambdaEvent("GET", "/connect/"), blobs: Buffer.from(JSON.stringify({ url: "https://blobs.example", token: "t" })).toString("base64") };
    const res = await netlifyHandler(event, {});
    assert.equal(res.statusCode, 500);
    assert.match(res.body, /Missing STRIPE_SECRET_KEY/);
    assert.match(res.body, /Environment variables/);
  } finally {
    if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
  }
});

test("blob database round-trips through a Netlify Blobs-style store", async () => {
  const { createBlobDb } = await import("../lib/db.js");
  const mem = new Map();
  const store = { get: async (k) => mem.get(k) ?? null, setJSON: async (k, v) => { mem.set(k, JSON.parse(JSON.stringify(v))); } };
  const bdb = createBlobDb(store);
  const u = await bdb.createUser({ name: "A", email: "a@x.io", stripeAccountId: "acct_9" });
  assert.equal((await bdb.getUser(u.id)).stripeAccountId, "acct_9");
  await bdb.setSubscription("acct_9", { status: "active" });
  assert.equal((await bdb.findUserByAccountId("acct_9")).subscription.status, "active");
  assert.equal(await bdb.setSubscription("acct_nope", {}), null);
});
