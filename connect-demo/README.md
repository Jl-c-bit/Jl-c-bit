# Stripe Connect sample integration

A small Express app showing a complete Stripe Connect flow with **Accounts v2**:

1. **Sign up**: creates a v2 connected account and saves the user → `acct_` mapping.
2. **Onboarding**: an "Onboard to collect payments" button (v2 Account Links). Status is read live from the API on every page load.
3. **Products**: sellers create products on their own connected account (`Stripe-Account` header).
4. **Storefront**: one public page per seller. Purchases are **direct charges** with an **application fee**, through hosted Checkout.
5. **Platform subscription**: the seller's same `acct_` ID subscribes to your plan (`customer_account`), with a **billing portal** to manage it.
6. **Webhooks**: thin v2 events for account requirements and capabilities, plus snapshot events for subscriptions and billing.

Every Stripe call goes through one `stripeClient` (`lib/stripe.js`). The SDK (stripe-node 22.6.2) sends API version `2026-08-26.dahlia` automatically.

## Files

| File | What it does |
| --- | --- |
| `server.js` | Routes for every flow |
| `lib/stripe.js` | Creates `stripeClient` and reads settings, with helpful errors for missing values |
| `lib/connect.js` | The Stripe calls: accounts, account links, products, Checkout, billing portal |
| `lib/webhooks.js` | Thin (v2) and snapshot webhook parsing and handlers |
| `lib/db.js` | JSON-file stand-in for your database (`data/db.json`). Replace with your real DB |
| `lib/views.js` | The HTML pages |
| `test/app.test.js` | End-to-end tests with a fake Stripe API and real webhook signatures |

## Setup

Requires Node 22 or newer.

```bash
cd connect-demo
npm install
cp .env.example .env   # then fill in the values below
npm start              # http://localhost:4242
```

`.env` values (the app tells you exactly which one is missing):

| Variable | Where to get it |
| --- | --- |
| `STRIPE_SECRET_KEY` | [Dashboard → API keys](https://dashboard.stripe.com/apikeys). Use `sk_test_…` while testing |
| `PRICE_ID` | A **recurring** price on your **platform** account for the seller subscription ([Products](https://dashboard.stripe.com/products)) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret of the thin event destination (below) |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Signing secret of the billing webhook endpoint (below) |

Also turn on Connect for your platform in the Dashboard, and enable the [customer portal](https://dashboard.stripe.com/settings/billing/portal) so "Manage billing" works.

> The sample creates connected accounts with `identity.country: "us"`. If your platform is outside the US, check Stripe's cross-border rules or change the country in `lib/connect.js`.

## Webhooks

### 1. Connected-account changes (thin events, v2) → `/webhooks/connect`

Requirements can change at any time (new regulations, card network rules, expired documents), so listen for them:

1. In the [Dashboard](https://dashboard.stripe.com), open **Developers → Webhooks** and click **+ Add destination**.
2. Under **Events from**, choose **Connected accounts**.
3. Click **Show advanced options** and set **Payload style** to **Thin**.
4. Search "v2" and select:
   - `v2.core.account[requirements].updated`
   - `v2.core.account[configuration.merchant].capability_status_updated`
   - `v2.core.account[configuration.customer].capability_status_updated`
   - `v2.core.account[configuration.recipient].capability_status_updated` (only if you use recipient)
5. Point it at `https://<your-domain>/webhooks/connect` and put its signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`.

Locally, with the [Stripe CLI](https://docs.stripe.com/cli/listen):

```bash
stripe listen --thin-events 'v2.core.account[requirements].updated,v2.core.account[configuration.recipient].capability_status_updated,v2.core.account[configuration.merchant].capability_status_updated,v2.core.account[configuration.customer].capability_status_updated' \
  --forward-thin-to localhost:4242/webhooks/connect
```

The handler verifies the signature with `stripeClient.parseEventNotification(...)`. This was called `parseThinEvent` in older SDKs. It then fetches the full event with `stripeClient.v2.core.events.retrieve(id)` and re-reads the account.

### 2. Subscriptions and billing (snapshot events) → `/webhooks/billing`

Add a normal webhook endpoint for **your account** at `https://<your-domain>/webhooks/billing` with these events:
`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `payment_method.attached`, `payment_method.detached`, `customer.updated`, `customer.tax_id.created`, `customer.tax_id.deleted`, `customer.tax_id.updated`, `billing_portal.configuration.created`, `billing_portal.configuration.updated`, `billing_portal.session.created`.

Locally:

```bash
stripe listen --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,payment_method.attached,payment_method.detached,customer.updated,customer.tax_id.created,customer.tax_id.deleted,customer.tax_id.updated,billing_portal.configuration.created,billing_portal.configuration.updated,billing_portal.session.created \
  --forward-to localhost:4242/webhooks/billing
```

Subscription events are matched to your user by `subscription.customer_account` (the `acct_` ID), **not** `customer`. The status, price, quantity, scheduled cancellation and pause state are saved to the database.

## Try it

1. Create a seller on the home page, then click **Onboard to collect payments**. In test mode, use Stripe's [test onboarding values](https://docs.stripe.com/connect/testing).
2. Add a product, open the storefront link and buy with card `4242 4242 4242 4242`.
3. Click **Subscribe** on the dashboard, then **Manage billing**.

## Before going live

- Replace the demo cookie sign-in with real authentication (`server.js`, `currentUser`).
- Replace `lib/db.js` with your database.
- Use your own store identifier in storefront URLs instead of the `acct_` ID.
- Fulfil orders from webhooks (e.g. `checkout.session.completed` on connected accounts), not from the success redirect.
- Handle the TODOs in `lib/webhooks.js` (emails and access changes).

## Tests

```bash
npm test
```

18 tests run the whole app against a fake Stripe API, checking that each request matches the integration spec. Webhooks are signed and verified with the real stripe-node code.
