# Kindred Goods — ecommerce storefront

A dependency-free static store served at **`/shop/`** on the same Netlify site as Streakly and PrivatePDF.

**Features:** 12-product catalog with category filters, search and sort · product detail view ·
cart drawer with quantity controls and stock limits · promo codes (`WELCOME10`, `FREESHIP`) ·
free-shipping threshold, tax and totals · validated checkout form · order confirmation ·
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

## Taking real payments

Checkout currently runs in **demo mode**: it validates the order and shows a confirmation, but no card is
charged. To take money, either:

1. **Stripe Payment Links (no code):** create one per product in the Stripe Dashboard and link to it, or
2. **Stripe Checkout (recommended for a multi-item cart):** add a small Netlify Function that creates a
   Checkout Session from the cart (the `connect-demo/` app in this repo already has the Stripe client and
   function setup to copy from), then redirect to `session.url` in `placeOrder()` in `app.js`.
