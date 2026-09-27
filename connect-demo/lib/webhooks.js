// -----------------------------------------------------------------------------
// Webhook handlers
//
// There are TWO webhook endpoints, because they use different payload styles:
//
//  A) /webhooks/connect  (THIN events, Accounts v2)
//     Connected-account changes: requirements and capability status. Thin
//     events contain only IDs; we fetch the full event from the API.
//
//  B) /webhooks/billing  (SNAPSHOT events, classic)
//     Your platform's subscription/billing events. The full object is in the
//     payload, verified with `stripeClient.webhooks.constructEvent`.
//
// Each endpoint has its OWN signing secret (whsec_...). Signature checks need
// the raw request body, so server.js mounts these routes with express.raw().
// -----------------------------------------------------------------------------
import { requireEnv } from "./stripe.js";

// ---------------------------------------------------------------------------
// A) Thin events for connected accounts (v2)
// ---------------------------------------------------------------------------

/** Verify the signature and turn the raw body into a thin event notification. */
export function parseConnectNotification(stripeClient, rawBody, signature, env = process.env) {
  // PLACEHOLDER: STRIPE_CONNECT_WEBHOOK_SECRET must be set (see .env.example).
  const secret = requireEnv("STRIPE_CONNECT_WEBHOOK_SECRET", env);
  // Named `parseThinEvent` in older SDKs; stripe-node v22 calls it parseEventNotification.
  // Throws if the signature is invalid or the payload was tampered with.
  return stripeClient.parseEventNotification(rawBody, signature, secret);
}

/**
 * Handle one thin event. The notification only carries the event ID and type,
 * so we retrieve the full event (and then the account) from the API. That way
 * we always act on the latest data, even if events arrive out of order.
 */
export async function handleConnectNotification(stripeClient, notification, log = console.log) {
  // Fetch the full event to see what happened.
  const event = await stripeClient.v2.core.events.retrieve(notification.id);
  // For account events, related_object.id is the connected account (acct_...).
  const accountId = event.related_object?.id;

  switch (event.type) {
    // Stripe needs more information from the account (new regulations, a
    // document expired, volume thresholds reached, ...).
    case "v2.core.account[requirements].updated": {
      const account = await stripeClient.v2.core.accounts.retrieve(accountId, { include: ["requirements"] });
      const status = account.requirements?.summary?.minimum_deadline?.status ?? "none";
      const due = (account.requirements?.entries ?? []).filter((e) =>
        ["currently_due", "past_due"].includes(e.minimum_deadline?.status)
      );
      log(`[connect] ${accountId} requirements updated: ${status}, ${due.length} item(s) due`);
      if (due.length) {
        // TODO: email the account holder and ask them to finish onboarding
        // (the dashboard's "Onboard to collect payments" button creates a fresh link).
      }
      return { handled: event.type, accountId, status, due: due.length };
    }

    // A capability (e.g. card_payments) changed status: active, pending, restricted...
    case "v2.core.account[configuration.merchant].capability_status_updated":
    case "v2.core.account[configuration.customer].capability_status_updated":
    case "v2.core.account[configuration.recipient].capability_status_updated": {
      const configuration = event.type.match(/configuration\.(\w+)/)[1]; // merchant | customer | recipient
      const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
        include: [`configuration.${configuration}`],
      });
      const capabilities = account.configuration?.[configuration]?.capabilities ?? {};
      const summary = Object.entries(capabilities)
        .map(([name, cap]) => `${name}=${cap?.status ?? "unknown"}`)
        .join(", ");
      log(`[connect] ${accountId} ${configuration} capabilities: ${summary || "none"}`);
      // TODO: if card_payments is no longer "active", hide the seller's storefront
      // or show a banner, and notify them.
      return { handled: event.type, accountId, configuration, capabilities: summary };
    }

    default:
      // Other v2 events you may subscribe to later. Safe to acknowledge.
      log(`[connect] Unhandled event type ${event.type}`);
      return { handled: null, type: event.type };
  }
}

// ---------------------------------------------------------------------------
// B) Snapshot events for billing / subscriptions
// ---------------------------------------------------------------------------

/** Verify the signature and parse a classic (snapshot) event. */
export function constructBillingEvent(stripeClient, rawBody, signature, env = process.env) {
  // PLACEHOLDER: STRIPE_BILLING_WEBHOOK_SECRET must be set (see .env.example).
  const secret = requireEnv("STRIPE_BILLING_WEBHOOK_SECRET", env);
  return stripeClient.webhooks.constructEvent(rawBody, signature, secret);
}

/** Shape we keep in the database for a subscription. */
function subscriptionRecord(sub) {
  const item = sub.items?.data?.[0];
  return {
    id: sub.id,
    status: sub.status, // active, trialing, past_due, canceled, ...
    priceId: item?.price?.id ?? null, // which plan (for upgrades/downgrades)
    quantity: item?.quantity ?? null, // seats/quantity
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end), // scheduled cancellation
    pausedUntil: sub.pause_collection ? sub.pause_collection.resumes_at ?? "indefinitely" : null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Handle one billing event.
 *
 * IMPORTANT for v2 accounts: the subscriber is identified by `customer_account`
 * (acct_...), not `customer` (cus_...). e.g. `subscription.customer_account`.
 */
export async function handleBillingEvent(db, event, log = console.log) {
  const obj = event.data.object;

  switch (event.type) {
    // New subscription, upgrade/downgrade (check the price), quantity change,
    // scheduled cancellation (cancel_at_period_end) and reactivation,
    // and pause/resume (pause_collection).
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const accountId = obj.customer_account; // acct_...
      const record = subscriptionRecord(obj);
      // Write to the database: grant or adjust access based on status + priceId + quantity.
      const user = await db.setSubscription(accountId, record);
      if (record.cancelAtPeriodEnd) log(`[billing] ${accountId} will cancel at period end`);
      if (record.pausedUntil) log(`[billing] ${accountId} collection paused until ${record.pausedUntil}`);
      log(`[billing] ${accountId} subscription ${record.status} (price ${record.priceId}, qty ${record.quantity})`);
      return { handled: event.type, accountId, stored: Boolean(user), record };
    }

    // Subscription ended: revoke access.
    case "customer.subscription.deleted": {
      const accountId = obj.customer_account;
      const record = { ...subscriptionRecord(obj), status: "canceled" };
      const user = await db.setSubscription(accountId, record);
      log(`[billing] ${accountId} subscription canceled; revoke access`);
      return { handled: event.type, accountId, stored: Boolean(user), record };
    }

    // A subscription invoice was paid: good moment to extend access or send a receipt.
    case "invoice.paid":
    case "invoice.payment_failed": {
      const accountId = obj.customer_account;
      log(`[billing] ${accountId} ${event.type} for ${obj.amount_paid ?? obj.amount_due} ${obj.currency}`);
      // TODO: on invoice.payment_failed, tell the user to update their card in the billing portal.
      return { handled: event.type, accountId };
    }

    // Payment methods added/removed (e.g. in the billing portal).
    case "payment_method.attached":
    case "payment_method.detached": {
      const accountId = obj.customer_account;
      log(`[billing] ${accountId ?? "unknown account"} ${event.type} (${obj.type})`);
      // TODO: update any saved "card on file" display in your database.
      return { handled: event.type, accountId };
    }

    // Billing details changed. Treat as billing info only; never use the billing
    // email as a login. Check invoice_settings.default_payment_method for the new default.
    case "customer.updated": {
      log(`[billing] customer updated; default payment method: ${obj.invoice_settings?.default_payment_method ?? "none"}`);
      // TODO: update stored billing details in your database.
      return { handled: event.type };
    }

    // Tax IDs added, removed or validated.
    case "customer.tax_id.created":
    case "customer.tax_id.deleted":
    case "customer.tax_id.updated": {
      log(`[billing] ${event.type}: ${obj.type} ${obj.verification?.status ?? ""}`.trim());
      // TODO: store tax IDs if you show them on invoices or in your app.
      return { handled: event.type };
    }

    // Billing portal activity (informational).
    case "billing_portal.configuration.created":
    case "billing_portal.configuration.updated":
    case "billing_portal.session.created": {
      log(`[billing] ${event.type} ${obj.id}`);
      return { handled: event.type };
    }

    default:
      log(`[billing] Unhandled event type ${event.type}`);
      return { handled: null, type: event.type };
  }
}
