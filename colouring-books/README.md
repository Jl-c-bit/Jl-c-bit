# Colouring books for Amazon KDP

`make_book.py` generates a print-ready paperback colouring book: an interior PDF and a full-wrap cover PDF. The cover's spine width is calculated from the page count. Every design is a code-drawn mandala, so the artwork is original.

```bash
pip install reportlab
python3 make_book.py                                   # Mindful Mandalas, 50 designs
python3 make_book.py --seed 7 --title "Calm Mandalas" --subtitle "40 Easy Patterns" --designs 40
```

Changing `--seed` gives a completely different set of designs, so each new seed is a new book in the series.

Specs it follows (KDP paperback): 8.5x11 trim, no bleed on the interior, margins of 0.5 in or more, embedded fonts,
lines of 1pt or more, cover bleed of 0.125 in, white-paper spine (0.002252 in per page), spine text only above 79 pages,
and an empty barcode area on the back cover.

Listing copy, keywords, categories and pricing are in [LISTING.md](LISTING.md).
