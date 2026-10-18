# OrderTap social images

Five 1080×1350 feed cards (Instagram/Facebook 4:5) and a 1080×1080 profile picture, designed in `cards.html`.

```bash
cd marketing/ordertap-images
npm install
node make.mjs
```

PNGs are written to `ordertap-site/social/<id>.png`, served at `/ordertap/social/<id>.png` once merged to `main`. That public URL is what the scheduler (Metricool) downloads.

| Image | Launch post (`marketing/brand-launch.md`) |
|---|---|
| `ordertap-1-commission.png` | Day 1: the problem |
| `ordertap-2-how-it-works.png` | Day 3: how it works |
| `ordertap-3-just-call.png` | Day 4: "my customers just call" |
| `ordertap-4-pricing.png` | Day 6: pricing |
| `ordertap-5-local.png` | Day 7: local call-out |
| `ordertap-avatar.png` | Profile picture for the brand accounts |

Days 2 and 5 are Reels, so they need a screen recording rather than an image.
