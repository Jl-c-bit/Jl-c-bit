# TikTok launch plan: Mandala series

All posts are scheduled in Metricool (brand **nexusmedia**, TikTok **@nexusmedia79**), on Sydney time.
They're set to **"notify me" rather than auto-publish**. At each time, Metricool sends a push notification
to your phone, and you open TikTok, add a trending sound and post. Nothing goes live on its own.

The times come from Metricool's best-time data for your audience: Wed/Thu at 10:00 and 18:00 score highest.
The dates assume each book is live on Amazon by its launch day. If one is late, drag its posts in the Metricool planner.

| # | When (Sydney) | Book | Format | Hook |
|---|---------------|------|--------|------|
| 1 | Wed 18 Nov, 10:00 | Mindful Mandalas | Colouring video | "Watch this mandala colour itself in" |
| 2 | Thu 19 Nov, 18:00 | Mindful Mandalas | 5-photo carousel | "Which page would you colour first?" |
| 3 | Wed 25 Nov, 10:00 | Easy Mandalas | Colouring video | "For people who don't like tiny fiddly bits" |
| 4 | Thu 26 Nov, 18:00 | Easy Mandalas | 5-photo carousel | "Tag someone who'd love these" |
| 5 | Wed 2 Dec, 10:00 | Intricate Mandalas | Colouring video | "700+ tiny spaces in ONE page" |
| 6 | Thu 3 Dec, 18:00 | Intricate Mandalas | 5-photo carousel | "Rate the difficulty 1-10" |
| 7 | Wed 9 Dec, 10:00 | Mandala Garden | Colouring video | "A flower mandala blooming in colour" |
| 8 | Thu 10 Dec, 18:00 | Mandala Garden | 5-photo carousel | "Which flower would you colour first?" |
| 9 | Tue 15 Dec, 18:00 | All four | Gift-guide carousel | "Last-minute Christmas gift sorted" |

## Settings on every post
- **Branded content (own brand): on.** TikTok requires this when you promote your own product.
- **AI-generated label: on for the videos.** The art comes from a program an AI wrote, which matches the KDP disclosure.
- Photo carousels have TikTok's auto-music turned on. For videos, pick a trending calm or lo-fi sound when you post.

## Before 18 Nov
1. Publish Mindful Mandalas on KDP. Paperbacks also sell on Amazon.com.au, which suits an Australian audience.
2. Put the Amazon link in your TikTok bio, using a link-in-bio page that lists all four books.
3. If you can, colour a real printed page and film it. A real hand colouring is the strongest content of all, so post it as a bonus.

## Assets
`promo/out/` holds the videos (`*-colouring.mp4`), carousels (`*-slide-1..5.jpg`) and the gift guide (`series-gift-*.jpg`).
To rebuild them, run `python3 promo/make_promo.py` after `./build_series.sh`.
