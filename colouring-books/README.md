# Colouring books for Amazon KDP

`make_book.py` generates a print-ready paperback colouring book: an interior PDF and a full-wrap cover PDF. The cover's spine width is calculated from the page count. Every design is a code-drawn mandala, so the artwork is original.

```bash
pip install reportlab
./build_series.sh            # builds all 4 books into out/<book>/
python3 make_book.py --seed 7 --style floral --title "..." --subtitle "..." --out out/5-new-book
```

Changing `--seed` gives a completely different set of designs, so each new seed is a new book in the series.
`--style` sets the look of the designs:

| style | look | used by |
|-------|------|---------|
| classic | balanced mix | 1 Mindful Mandalas |
| easy | big spaces, thick 2.6pt lines, simple centre | 2 Easy Mandalas |
| intricate | many thin rings, dense motifs | 3 Intricate Mandalas |
| floral | petals, teardrops and arches only | 4 Mandala Garden |

`--bg` and `--palette` set the cover colours, and `--tagline` sets one line of the back-cover blurb.
`out/series-covers.png` shows the four front covers side by side.

Specs it follows (KDP paperback): 8.5x11 trim, no bleed on the interior, margins of 0.5 in or more, embedded fonts,
lines of 1pt or more, cover bleed of 0.125 in, white-paper spine (0.002252 in per page), spine text only above 79 pages,
and an empty barcode area on the back cover.

Listing copy, keywords, categories and pricing are in [LISTING.md](LISTING.md).
