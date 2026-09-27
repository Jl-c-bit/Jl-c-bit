// -----------------------------------------------------------------------------
// Stripe Connect operations.
//
// Each function takes the shared `stripeClient` as its first argument, so the
// same client is used for every request (and tests can pass a fake one).
// -----------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. Create a connected account (Accounts v2)
// ---------------------------------------------------------------------------
/**
 * Creates a connected account for one of your users.
 *
 * We use the V2 Accounts API with exactly these properties. Note there is NO
 * top-level `type` (no 'express' / 'standard' / 'custom'); v2 accounts are
 * described by their `configuration` instead:
 *   - configuration.merchant: the account can accept card payments (sell in its storefront)
 *   - configuration.customer: the SAME account can be charged by your platform
 *     (used below for the platform subscription), so one acct_ ID serves both roles
 */
export async function createConnectedAccount(stripeClient, { displayName, contactEmail }) {
  const account = await stripeClient.v2.core.accounts.create({
    display_name: displayName,
    contact_email: contactEmail,
    identity: {
      // Country of the connected account's business.
      country: "us",
    },
    // The connected account gets the full Stripe Dashboard.
    dashboard: "full",
    defaults: {
      responsibilities: {
        // Stripe collects fees from, and covers losses for, the connected account.
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
    },
    configuration: {
      customer: {},
      merchant: {
        capabilities: {
          card_payments: { requested: true },
        },
      },
    },
  });
  return account; // account.id looks like "acct_..."
}

// ---------------------------------------------------------------------------
// 2. Onboarding status (always read live from the API)
// ---------------------------------------------------------------------------
/**
 * Reads the account straight from Stripe and summarizes onboarding.
 * We never cache this in the database, so it is always current.
 */
export async function getAccountStatus(stripeClient, accountId) {
  const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
    // v2 accounts return only core fields unless you ask for more.
    include: ["configuration.merchant", "requirements"],
  });

  // Can this account take card payments right now?
  const cardPaymentsStatus = account?.configuration?.merchant?.capabilities?.card_payments?.status ?? "unknown";
  const readyToProcessPayments = cardPaymentsStatus === "active";

  // Is anything still required from the account holder?
  // "currently_due" / "past_due" mean they must finish (or revisit) onboarding.
  const requirementsStatus = account.requirements?.summary?.minimum_deadline?.status ?? null;
  const onboardingComplete = requirementsStatus !== "currently_due" && requirementsStatus !== "past_due";

  return {
    id: account.id,
    displayName: account.display_name,
    readyToProcessPayments,
    onboardingComplete,
    cardPaymentsStatus,
    requirementsStatus,
    // Human-readable list of what's outstanding, when Stripe provides it.
    entriesDue: (account.requirements?.entries ?? [])
      .filter((e) => ["currently_due", "past_due"].includes(e.minimum_deadline?.status))
      .map((e) => e.description || e.awaiting_action_from || "Information required"),
  };
}

// ---------------------------------------------------------------------------
// 3. Onboarding link (Account Links v2)
// ---------------------------------------------------------------------------
/**
 * Creates a single-use link to Stripe-hosted onboarding.
 *
 * - refresh_url: Stripe sends the user here if the link expired or was already
 *   used. That route must create a NEW link and redirect again.
 * - return_url: where the user lands after leaving onboarding. Returning does
 *   NOT mean they finished, so always re-check status from the API.
 */
export async function createOnboardingLink(stripeClient, { accountId, baseUrl }) {
  const accountLink = await stripeClient.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        // Collect what's needed for selling (merchant) and paying you (customer).
        configurations: ["merchant", "customer"],
        refresh_url: `${baseUrl}/onboard/refresh`,
        return_url: `${baseUrl}/dashboard?accountId=${encodeURIComponent(accountId)}`,
      },
    },
  });
  return accountLink.url;
}

// ---------------------------------------------------------------------------
// 4. Products on the connected account
// ---------------------------------------------------------------------------
/**
 * Creates a product (with a one-time default price) ON THE CONNECTED ACCOUNT.
 * The `stripeAccount` option sends the `Stripe-Account` header, so the product
 * belongs to the seller, not to your platform.
 */
export async function createProduct(stripeClient, { accountId, name, description, priceInCents, currency }) {
  return stripeClient.products.create(
    {
      name,
      description: description || undefined,
      default_price_data: {
        unit_amount: priceInCents,
        currency,
      },
    },
    {
      stripeAccount: accountId, // Stripe-Account header
    }
  );
}

/**
 * Lists the connected account's active products with their prices expanded,
 * so the storefront can show the amount without extra requests.
 */
export async function listProducts(stripeClient, accountId) {
  const products = await stripeClient.products.list(
    {
      limit: 20,
      active: true,
      expand: ["data.default_price"],
    },
    {
      stripeAccount: accountId, // Stripe-Account header
    }
  );
  return products.data;
}

// ---------------------------------------------------------------------------
// 5. Storefront purchase: Direct Charge + application fee, via hosted Checkout
// ---------------------------------------------------------------------------
/**
 * A "direct charge": the Checkout Session is created ON THE CONNECTED ACCOUNT
 * (Stripe-Account header). The customer pays the seller directly, the seller
 * is the merchant of record, and `application_fee_amount` sends part of the
 * payment to your platform.
 *
 * The price is read from Stripe on the server (never trusted from the browser).
 */
export async function createStorefrontCheckout(stripeClient, { accountId, productId, baseUrl, applicationFeeCents }) {
  const product = await stripeClient.products.retrieve(
    productId,
    { expand: ["default_price"] },
    { stripeAccount: accountId }
  );
  const price = product.default_price;
  if (!product.active || !price || typeof price !== "object" || price.unit_amount == null) {
    throw new UserFacingError("That product isn't available for purchase.");
  }
  // The platform fee can't be larger than the payment itself.
  if (applicationFeeCents >= price.unit_amount) {
    throw new UserFacingError("This product's price is lower than the platform fee, so it can't be sold. Raise the price.");
  }

  const session = await stripeClient.checkout.sessions.create(
    {
      line_items: [
        {
          price_data: {
            currency: price.currency,
            unit_amount: price.unit_amount,
            product: product.id,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        // Your platform's cut, in cents. Sample value; see APPLICATION_FEE_CENTS.
        application_fee_amount: applicationFeeCents,
      },
      mode: "payment",
      // {CHECKOUT_SESSION_ID} is replaced by Stripe with the real session ID.
      success_url: `${baseUrl}/store/${accountId}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/store/${accountId}?canceled=1`,
    },
    {
      stripeAccount: accountId, // Direct charge: create the session on the connected account
    }
  );
  return session.url;
}

// ---------------------------------------------------------------------------
// 6. Platform subscription charged TO the connected account
// ---------------------------------------------------------------------------
/**
 * With v2 accounts, the same acct_ ID can also act as a CUSTOMER of your
 * platform (because we created it with `configuration.customer`). So we pass it
 * as `customer_account` instead of creating a separate cus_ customer.
 *
 * This session is created on YOUR PLATFORM (no Stripe-Account header): the
 * seller pays you for your service.
 */
export async function createSubscriptionCheckout(stripeClient, { accountId, priceId, baseUrl }) {
  const session = await stripeClient.checkout.sessions.create({
    customer_account: accountId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/dashboard`,
  });
  return session.url;
}

/**
 * Stripe-hosted billing portal where the connected account manages its
 * platform subscription (change plan, update card, cancel, see invoices).
 */
export async function createBillingPortal(stripeClient, { accountId, baseUrl }) {
  const session = await stripeClient.billingPortal.sessions.create({
    customer_account: accountId,
    return_url: `${baseUrl}/dashboard`,
  });
  return session.url;
}

// An error whose message is safe to show to the person using the app.
export class UserFacingError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserFacingError";
  }
}
