# Kindred Goods — ecommerce storefront

A dependency-free static store served at **`/shop/`** on the same Netlify site as Streakly and PrivatePDF.

**Features:** 12-product catalog with category filters, search and sort · product detail view ·
cart drawer with quantity controls and stock limits · promo codes (`WELCOME10`, `FREESHIP`) ·
free-shipping threshold, tax and totals · Stripe Checkout (with a demo fallback) · order confirmation ·
cart and orders remembered in the browser · light and dark mode · mobile layout.

| File | What it does |
| --- | --- |
| `products.js` | Catalog, promo codes, shipping and tax settings: edit this to change what you sell |
| `core.js` | Pure cart/pricing/validation logic (unit-tested) |
| `app.js` | Renders the page and wires up the UI |
| `index.html`, `styles.css` | Markup and styling |
| `test/core.test.js` | `npm test` |

## Run locally

```sh
cd shop
npm start      # http://localhost:5174
npm test
```

## Payments (Stripe Checkout)

Checkout sends shoppers to a Stripe-hosted payment page:

1. `app.js` posts the cart to `/shop/api/checkout`.
2. `connect-demo/netlify/functions/shop-checkout.mjs` rebuilds prices from `products.js` on the server
   (via `checkout.js`, so the browser can't change prices), adds tax, shipping and any promo discount
   (as a one-time Stripe coupon), and creates a Checkout Session.
3. Stripe collects the shipping address and card, then returns the shopper to
   `/shop/?checkout=success`, where `/shop/api/order` confirms the payment.

It uses the site's `STRIPE_SECRET_KEY` environment variable on Netlify (the same one `/connect/` uses).

- **Test mode** (`sk_test_…`, current setup): pay with card `4242 4242 4242 4242`, any future date, any CVC.
  Orders appear at https://dashboard.stripe.com/test/payments.
- **Go live:** replace `STRIPE_SECRET_KEY` with your `sk_live_…` key in Netlify (Project configuration →
  Environment variables) and redeploy. Note that `/connect/` uses the same variable.
- **No key set:** checkout falls back to the demo form, which charges nothing.

Tax here is a flat 8% line item. For real tax rules per region, switch to Stripe Tax (`automatic_tax`).
