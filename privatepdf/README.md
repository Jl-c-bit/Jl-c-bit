# PrivatePDF

Free PDF tools that run entirely in the browser: merge, split, compress, rotate,
JPG to PDF and PDF to JPG. Files are never uploaded, so hosting is free and there
are no server costs.

## How it makes money

- **Free:** 3 tasks a day, files up to 25 MB in total per task.
- **Pro:** $4.99 one-time for unlimited tasks and any file size, through a Stripe Payment Link.

Set up Pro:

1. In Stripe, create a Payment Link for "PrivatePDF Pro" ($4.99, one-time).
2. Under *After payment*, redirect to `https://<your-site>/?upgraded=1`.
3. Paste the link into `assets/config.js` as `PAYMENT_LINK`.

Like Streakly, Pro is unlocked on the device with no server check.

## Growth

Each tool has its own page (`/merge-pdf/`, `/compress-pdf/`, …) with its own
title, description and FAQ, so each can rank in Google for its search term.
After the site's final address is known, update `SITE_URL` in `tools/build.mjs`,
run `npm run build`, and submit `sitemap.xml` in Google Search Console.

## Develop

```bash
cd privatepdf
npm test         # unit tests for page ranges, limits and file naming
npm run build    # regenerate the HTML pages from tools/build.mjs
npm start        # serve on http://localhost:5175
```

Pages are generated: edit `tools/build.mjs`, not the HTML files.

## Deploy on Netlify

Create a new Netlify site from this repository and set **Base directory** to
`privatepdf`. Netlify then uses `privatepdf/netlify.toml`, which publishes the
folder as is (no build step).

## Libraries

- [pdf-lib](https://pdf-lib.js.org/) 1.17.1 (MIT) for editing PDFs
- [pdf.js](https://mozilla.github.io/pdf.js/) 6.3.289 legacy build (Apache 2.0) for rendering pages

Both are vendored in `assets/vendor/` with their licenses.
