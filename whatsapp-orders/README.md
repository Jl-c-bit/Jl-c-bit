# WhatsApp Orders

A WhatsApp ordering bot you run **for local shops and restaurants** and charge a monthly fee for. One server handles all your clients. Each business has its own WhatsApp number, menu, and orders page.

How customers use it:

```
Customer: hi
Bot:      Hi! 👋 Welcome to Mario's Pizza.
          1. Margherita - $12.00   2. Pepperoni - $14.00 ...
Customer: 1x2, 6
Bot:      Added. 2 x Margherita - $24.00 / 1 x Soda - $2.00 / Total: $26.00
Customer: done → name → pickup/delivery → address → yes
Bot:      ✅ Order received!
```

The owner gets a WhatsApp message for every order, plus a live **orders page** (`/orders/<id>?key=<dashboardKey>`) to keep open on a tablet behind the counter.

If a client stops paying (`paidUntil` has passed), their bot replies with a polite "not taking WhatsApp orders right now" message until you extend it.

No dependencies. Needs Node 18+. Full sales playbook: [SALES.md](SALES.md).

## Setup

### 1. Meta / WhatsApp Cloud API (one-time, free)

1. Create an app at <https://developers.facebook.com> → type **Business** → add **WhatsApp**.
2. In WhatsApp → API Setup, note the **Phone number ID** and create a **permanent access token** (Business Settings → System users → generate a token with `whatsapp_business_messaging`).
3. App Settings → Basic → copy the **App Secret**.
4. For each client, add *their* phone number under your WhatsApp Business Account. The number must not be in use in the regular WhatsApp app, so clients usually get a new or second number.

Meta charges per conversation, but **customer-started service conversations are free**, and ordering is almost always started by the customer.

### 2. Configure businesses

```bash
cp businesses.example.json businesses.json
```

Set `phoneNumberId`, `ownerPhone` (digits with country code), a long random `dashboardKey`, the `menu` (prices in cents), and `paidUntil`.

### 3. Run and connect the webhook

```bash
WHATSAPP_TOKEN=... APP_SECRET=... VERIFY_TOKEN=any-secret-you-choose npm start
```

Deploy it to an always-on host with HTTPS and a persistent disk for `orders/` (Railway, Render, Fly.io or a VPS). Then in Meta → WhatsApp → Configuration, set the callback URL to `https://your-host/webhook` and the verify token to your `VERIFY_TOKEN`, and subscribe to **messages**.

### 4. Billing

When a client pays their monthly fee:

```bash
node admin.js extend marios-pizza 30   # adds 30 days
node admin.js list                     # who's active / paused
```

Restart the server after editing `businesses.json` or menus.

## Good to know

- WhatsApp only lets a business send free-form messages within 24 hours of someone's last message. So order notifications to the **owner** reach them only if the owner has messaged the bot number in the last 24 hours. The orders page always works. For reliable owner alerts, have the owner send "hi" each morning, or set up an approved message template.
- Carts live in memory for 2 hours, so a restart clears unfinished carts. Placed orders are saved to `orders/<id>.jsonl`.
- Customers pay at pickup or delivery. Online payment can be added later with Stripe payment links.

## Tests

```bash
npm test
```
