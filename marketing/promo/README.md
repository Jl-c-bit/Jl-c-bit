# PrivatePDF promo videos

Makes 11-second vertical (1080×1920) videos for TikTok, Reels and Shorts by
running the real PrivatePDF tools in a phone-sized browser.

```bash
cd marketing/promo
npm install
node make.mjs                 # every video in videos.json
node make.mjs privatepdf-f    # just one
```

Videos are written to `privatepdf/promo/<id>.mp4`, which is served at
`/pdf/promo/<id>.mp4` once merged to `main`. That public URL is what the
scheduler (Metricool) downloads.

Each entry in `videos.json` has a tool page, sample `inputs` (`bank`, `lease`,
`tax`, `scan`, `receipts`), a `hook`, three `steps` captions (wrap words in
`*stars*` to highlight them), and the post `caption` and `title`.
