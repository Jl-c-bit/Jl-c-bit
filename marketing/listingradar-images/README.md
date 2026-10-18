# ListingRadar social images

Four 1080×1350 cards (X, Telegram, Instagram 4:5; TikTok photo posts accept them too) and a 1080×1080 profile picture, designed in `cards.html`.

```bash
cd marketing/listingradar-images
npm install
node make.mjs
```

PNGs are written to `listingradar-site/social/<id>.png`, served at `/listingradar/social/<id>.png` once merged to `main`. That public URL is what the scheduler (Metricool) downloads.

| Image | Launch post (`marketing/brand-launch.md`) |
|---|---|
| `listingradar-1-launch.png` | Day 1: launch |
| `listingradar-2-price-alert.png` | Day 3: how to set an alert |
| `listingradar-3-facts-not-tips.png` | Day 4: facts, not buy tips |
| `listingradar-4-pro.png` | Day 6: Pro |
| `listingradar-avatar.png` | Profile picture for the bot, channel, X and TikTok |

Days 2 and 5 are TikTok videos made from real alerts. Day 7 is a weekly recap with real numbers, so it has no fixed image.
