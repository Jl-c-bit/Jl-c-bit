# 🔥 Streakly: Build Habits That Stick

A fast, private, offline-first habit tracker with a freemium model. It is a PWA
with no backend, so hosting is free and the costs stay near zero as it grows.

## Why this app

- **Proven demand.** "Habit tracker" is one of the most searched productivity
  categories. Apps like Streaks, Habitica and Loop have millions of users.
- **Daily retention loop.** Streaks, a daily progress ring, milestone confetti
  (3/7/14/30/…/365 days) and a 7-day dot trail give people a reason to return every day.
- **Built-in virality.** "Tell a friend" shares your current streak through the
  native share sheet.
- **Private by design.** No account, no ads and no tracking. Data stays on the device,
  with JSON export and import. That's a real selling point against competitors.
- **Near-zero cost.** Static files on GitHub Pages, Netlify or Cloudflare Pages. Every sale is almost pure margin.

## Monetization

| Free                         | Pro ($4.99 one-time, via Whop)           |
| ---------------------------- | ---------------------------------------- |
| Up to 3 habits               | Unlimited habits                         |
| Current streak, 4-week grid  | Full-year heatmap, best streak, 30-day rate, totals |
| Light, dark and system themes | Sunset and Ocean themes                 |

The limit of three habits lets people get hooked before they hit the paywall. By the time
someone wants a fourth habit, they've already built a streak.

### Set up payments with Whop (5 minutes)

Checkout is embedded right in the paywall using
[Whop's embedded checkout](https://docs.whop.com/payments/checkout-embed), so buyers never leave the app.
Whop hosts the payment form, sends receipts and handles payouts.

1. Create a Whop account and a product called "Streakly Pro".
2. Add a **one-time** plan at your price (the paywall label defaults to $4.99).
3. Copy the plan ID (it starts with `plan_`) into `config.js` as `WHOP_PLAN_ID`.
   Update `PRO_PRICE_LABEL` if you change the price, and set `SUPPORT_EMAIL`.
4. To test first, set `WHOP_ENVIRONMENT = "sandbox"` and use a sandbox plan ID.
   Switch it back to `"production"` before launch.

How the unlock works:
- **In-page payment:** Whop calls `streaklyWhopComplete(planId, receiptId)`. The app
  unlocks Pro and saves the receipt ID, which shows under Settings for support requests.
- **Redirected payment** (payment methods that leave the page): Whop sends the buyer back to the app with
  `?status=success` or `?status=error`, and the app unlocks Pro or shows an error.
- Whop's script loads only when someone taps "Unlock Pro", so free users never load third-party code.
  Until `WHOP_PLAN_ID` is set, the paywall says checkout isn't set up instead of showing a broken form.

> **Honest caveat:** Pro is unlocked on the device, with no server check. Someone
> technical could unlock it for free. This is normal for a $5 MVP and not worth
> fighting at first. If revenue justifies it, add a small server that confirms
> purchases with Whop's API or webhooks, or use Whop license keys. Another option is to wrap
> the app for the app stores and use in-app purchases (see below).
> Buyers who switch devices can email support with their receipt ID.

## Run locally

```bash
cd streakly
npm test            # unit tests for streak, stats and paywall logic (Node 18+)
npm start           # serves on http://localhost:5173
```

## Deploy

Any static host works. To use GitHub Pages: go to Settings → Pages, deploy from the branch, and set the folder to `/streakly`
(or copy the folder into a dedicated repo). HTTPS is required for install-to-home-screen and offline mode.

## Growth plan

1. **Launch posts:** Product Hunt, r/getdisciplined, r/productivity, r/selfimprovement and Indie Hackers.
   Lead with "private, no account, pay once, no subscription". Subscription fatigue is a strong hook.
2. **Short-form video:** "Day N of my streak" content on TikTok, Reels and Shorts, using the share card.
3. **SEO pages:** "free habit tracker no account", "habit tracker without subscription" and similar searches.
4. **App stores:** wrap with Capacitor or [PWABuilder](https://www.pwabuilder.com/) to publish on Google Play and the App Store,
   and switch Pro to in-app purchase. The stores are where most habit-app downloads come from.
5. **Next features that raise conversion:** reminders (push notifications), home-screen widgets,
   weekly-target habits (for example 3×/week), and optional cloud sync as a subscription upsell.

## Project layout

| File | Purpose |
| --- | --- |
| `core.js` | Pure logic: streaks, stats, the free-tier limit, data sanitizing (unit-tested) |
| `app.js` | UI, paywall, sharing, import and export |
| `config.js` | Whop plan ID and environment, price label, support email |
| `sw.js`, `manifest.webmanifest` | Offline support and install-to-home-screen |
| `test/` | `node:test` unit tests |
