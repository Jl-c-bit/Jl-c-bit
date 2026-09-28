# LiveEarth

A Google-Maps-style zoomable map of near-real-time satellite imagery. Served at `/earth/`.

- **Live (every 10 min):** GOES-East, GOES-West and Himawari-9 from NASA GIBS, with a 2-hour playback loop.
- **Daily, whole planet:** VIIRS (NOAA-20, Suomi NPP) and MODIS Terra true colour.
- **Zoom past the live resolution:** "smart blend" fades the live layer over Esri World Imagery, which is archived but sharp enough for streets.
- **Extras:** live ISS position, footprint and trail; day/night line; place search (Nominatim); shareable URL (`#lat,lng,zoom/layer`).

No build step and no API keys. Leaflet 1.9.4 is vendored in `vendor/leaflet`. The GIBS layer names, tile matrices and newest timestamps are read from GetCapabilities at runtime. Until that loads, the app estimates them.

Run locally: `python3 -m http.server -d earth` and open http://localhost:8000.
