# Selling OrderTap to local businesses

## The offer

> "Your customers can order from you on WhatsApp 24/7, from a menu bot with your name on it. Orders land on your phone and a screen at the counter. No app for customers to download, and no 15–30% commission like the delivery apps."

The main selling point is that delivery apps take **15–30% of every order**. A restaurant doing $3,000/month through those apps pays $450–900. OrderTap costs a flat fee.

## Pricing (suggested)

| Plan | Price | Includes |
|---|---|---|
| **Starter** | $29/mo | Bot, menu up to 30 items, orders page, 1 menu update/month |
| **Standard** | $49/mo | Unlimited menu updates, delivery option, owner WhatsApp alerts |
| **Pro** | $99/mo | Everything, plus monthly order report and promo broadcast help |

Charge a **$99 setup fee** to cover getting their number on the WhatsApp API and entering their menu. Offer the **first month free**, then bill monthly by bank transfer, PayPal, or a Stripe payment link. Run `node admin.js extend <id> 30` when they pay.

Your costs are about $5–10/month total for hosting, and Meta fees are near zero for customer-started chats. So 10 clients on Standard is roughly **$490/month** in revenue.

## Who to target

Best fits:
- Takeaways, pizza and kebab shops, cafés, and bakeries that already take phone or WhatsApp orders by hand
- Home cooks and caterers selling through Instagram or WhatsApp
- Corner shops and butchers doing local delivery

Skip big chains and places already happy with a full POS ordering system.

## Finding clients

1. **Walk in during a quiet hour** (2–4pm). Show the demo on your phone. It's the most effective approach.
2. Google Maps → "takeaway near me" → message the ones whose listing says "order by phone/WhatsApp."
3. Local Facebook groups and Instagram home-food sellers.
4. Ask every happy client for one referral, and give them a free month for it.

## Opening message (WhatsApp / DM)

> Hi [Name], I run OrderTap. We help local food spots take orders on WhatsApp automatically. Customers text your number, pick from your menu, and the order shows up for you ready to go. No app fees or commission, just a flat monthly price. Can I send you a 30-second demo? First month's free.

## Demo

Set up a demo business in `businesses.json` with *their* real menu before visiting. Seeing their own food in the bot sells far better than a generic demo.

## Onboarding checklist

- [ ] Menu items and prices (photo of the menu is fine)
- [ ] A phone number for the bot (new SIM or second number, not their personal WhatsApp)
- [ ] Owner's personal WhatsApp for alerts
- [ ] Pickup only, or delivery too (fee? area?)
- [ ] Greeting and confirmation wording
- [ ] Add to `businesses.json`, test an order with them, and give them the orders-page link
- [ ] Put a "Order on WhatsApp: +X XXX" sign at the counter and on their Instagram and Google listing

## Keep clients

- Send them a monthly "you got 142 orders through WhatsApp" message. Count with `wc -l orders/<id>.jsonl`.
- Update menus quickly when they ask, since that's what they're paying for.
