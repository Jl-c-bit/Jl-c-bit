# LiveEarth

A Google-Maps-style zoomable map of near-real-time satellite imagery. Served at `/earth/`.

- **Live (every 10 min):** GOES-East, GOES-West and Himawari-9 from NASA GIBS, with a 2-hour playback loop.
- **Daily, whole planet:** VIIRS (NOAA-20, Suomi NPP) and MODIS Terra true colour.
- **Zoom past the live resolution:** "smart blend" fades the live layer over Esri World Imagery, which is archived but sharp enough for streets.
- **Extras:** live ISS position, footprint and trail; day/night line; place search (Nominatim); shareable URL (`#lat,lng,zoom/layer`).

## Fresh satellite photo (SkyFi)

The 📸 button lets you pick a spot and:

1. **Buy a photo already taken:** the newest high-resolution images (about 30 cm to 1 m) from the last 60 days, newest first, with price and delivery time. This is often the fastest option.
2. **Book the next satellite pass:** passes over that spot in the next 72 hours, including radar satellites that see through cloud and at night. "Priority" pays to jump the queue.
3. **Track orders:** status updates every minute, then "Show on map" and "Download" once delivered.

It runs through the Netlify Function `connect-demo/netlify/functions/earth-api.mjs`, with the logic in `api/skyfi.mjs`, so the SkyFi key never reaches the browser. Set these on the Netlify site (Site configuration > Environment variables), then redeploy:

| Variable | Needed for | Notes |
|---|---|---|
| `SKYFI_API_KEY` | searching | From app.skyfi.com, My Profile |
| `EARTH_ORDER_PASSCODE` | ordering | Secret phrase typed in the panel. Without it the site can only search |
| `EARTH_MAX_ORDER_USD` | optional | Per-order cap, default 500. Archive prices are re-checked against SkyFi before ordering. Tasking uses the pass estimate, because SkyFi only confirms the final price after the order |

Tests: `cd earth && npm test`.

No build step and no API keys. Leaflet 1.9.4 is vendored in `vendor/leaflet`. The GIBS layer names, tile matrices and newest timestamps are read from GetCapabilities at runtime. Until that loads, the app estimates them.

Run locally: `python3 -m http.server -d earth` and open http://localhost:8000.
