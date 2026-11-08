# Partner handover: keeping the money coming in

You don't need to code. Follow this list. Claude (claude.ai/code, this repo) can do
the technical parts; just tell it what you need in plain words.

## Do first (today)
- [ ] Get the login (email + password + 2FA phone) for: **Stripe**, **Whop**,
      **Netlify**, **GitHub**, **Metricool**, **Gmail**.
- [ ] In Stripe → Settings → Payouts: check where payouts go. Make sure it's an
      account you can still reach.
- [ ] Write down the live site: https://chimerical-crostata-fb89ec.netlify.app

## Money source 1: OrderTap (biggest: $99 setup + $29–99/month per shop)
A WhatsApp bot that takes food orders for local shops with no delivery-app commission.
1. Monday to Friday, 2–4pm, walk into 5 takeaways, pizza or kebab shops, or cafés.
2. Say: *"Delivery apps take 15–30% of every order. I set up a WhatsApp bot with your
   menu that takes orders for a flat $49 a month. First month free, $99 setup."*
3. Show the demo on your phone. Full script: `whatsapp-orders/SALES.md`.
4. If they say yes: take a photo of their menu and get their WhatsApp number.
   Collect the $99. Then ask Claude: "set up OrderTap for this shop."
5. Goal: 10 shops ≈ $490/month.

## Money source 2: apps that already take payments
- PrivatePDF Pro, $4.99: https://chimerical-crostata-fb89ec.netlify.app/pdf/
- Streakly Pro: https://chimerical-crostata-fb89ec.netlify.app/
- These only need visitors. Approve the scheduled posts in Metricool every week
  (they wait for your review), and share the links in Facebook groups and on Reddit
  where people ask "how do I merge a PDF for free".

## Money source 3: GodMode trading indicator on Whop
- There's a draft product in Whop. Check it, then press Publish.
- Share the link in trading Discords and on TikTok and X.

## Weekly (30 minutes)
- [ ] Check Stripe and Whop for sales and new messages. Answer customers within a day.
- [ ] Approve next week's Metricool posts.
- [ ] Note which shops paid. For OrderTap, run `node admin.js extend <id> 30`
      (or ask Claude to).

## Never
- Don't share passwords in public places, and don't let anyone "verify" the
  accounts for you.
- Don't promise trading profits when selling GodMode. Say "it's a tool, not
  financial advice."
