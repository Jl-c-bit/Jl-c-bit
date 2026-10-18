# ListingRadar (Telegram bot)

A Telegram bot that sends:

- **New-listing alerts** when MEXC adds a coin (free, also posted to your public channel)
- **Price-target alerts** (`/alert BTC 70000`): 2 free, 50 on Pro
- **Big-move alerts** when any USDT pair moves 10%+ in 15 minutes (Pro only)

It makes money from **Pro subscriptions paid in Telegram Stars** (no payment processor needed) and from your **MEXC referral code**, which is added to every trade link.

No dependencies. Needs Node 18+.

## Setup (about 10 minutes)

1. In Telegram, message **@BotFather**, send `/newbot`, and copy the token.
2. Optional: create a public channel (e.g. `@ListingRadar`) and add your bot as an admin. Listings get posted there, and it's your free marketing funnel.
3. Get your MEXC referral code: MEXC app → Profile → Referral.
4. Run it:

```bash
TELEGRAM_TOKEN=123:abc \
MEXC_INVITE_CODE=yourcode \
CHANNEL_ID=@ListingRadar \
npm start
```

| Variable | Default | Meaning |
|---|---|---|
| `TELEGRAM_TOKEN` | required | From @BotFather |
| `MEXC_INVITE_CODE` | none | Added to every MEXC link |
| `CHANNEL_ID` | none | Channel that gets new-listing posts |
| `PRO_STARS` | 250 | Price of 30 days of Pro in Stars (~$3–5) |
| `MOVE_PCT` | 10 | Big-move threshold (%) |
| `MOVE_WINDOW_MIN` | 15 | Big-move window (minutes) |
| `STATE_FILE` | state.json | Where users and alerts are saved |

On its first run, the bot just records MEXC's current coin list. New-listing alerts start from the next new coin.

## Hosting

The bot needs to run 24/7. Any always-on Node host works, for example Railway, Render (background worker), Fly.io, or a $4–6/mo VPS. Use a persistent disk or volume for `state.json` so alerts survive restarts. Telegram Stars you earn can be withdrawn through @BotFather → Bot Settings → Payments / Fragment.

## Commands

`/start` `/alert BTC 70000` `/alerts` `/remove 1` `/listings on|off` `/price BTC` `/upgrade` `/status`

Messages are factual alerts, not buy/sell signals. Keep it that way: "signal" groups attract scams and legal trouble.

## Tests

```bash
npm test
```
