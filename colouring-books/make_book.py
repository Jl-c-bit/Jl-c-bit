#!/usr/bin/env python3
"""Generate a print-ready Amazon KDP colouring book (interior + wraparound cover).

Every design is drawn from code (rotational-symmetry mandalas), so the artwork is
original and you own it. Re-run with a different --seed for a brand-new book.

    python3 make_book.py                      # default 50-design book
    python3 make_book.py --designs 40 --seed 7 --title "Calm Mandalas"

Output (in ./out): interior.pdf, cover.pdf, preview-*.png (if pdftoppm exists)
"""
import argparse, math, os, random, shutil, subprocess

from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ---- KDP specs (paperback, black & white interior, white paper, no bleed) ----
TRIM_W, TRIM_H = 8.5 * inch, 11 * inch
INSIDE_MARGIN = 0.5 * inch      # KDP min is 0.375" for 24-150 pages; extra safety
OUTSIDE_MARGIN = 0.5 * inch     # KDP min 0.25"
SPINE_PER_PAGE = 0.002252 * inch  # white paper
BLEED = 0.125 * inch
MIN_LINE = 1.0                  # pt; KDP min printable line is ~0.72pt

FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", os.path.join(os.path.dirname(__file__), "fonts")]


def register_fonts():
    for d in FONT_DIRS:
        reg, bold = os.path.join(d, "DejaVuSerif.ttf"), os.path.join(d, "DejaVuSerif-Bold.ttf")
        if os.path.exists(reg) and os.path.exists(bold):
            pdfmetrics.registerFont(TTFont("Body", reg))   # TTF => embedded (KDP requires it)
            pdfmetrics.registerFont(TTFont("Bold", bold))
            return
    raise SystemExit("Need DejaVuSerif.ttf + DejaVuSerif-Bold.ttf (apt install fonts-dejavu or put them in ./fonts)")


# ---------------------------------------------------------------- mandala art
def petal(p, r0, r1, half_angle, bulge):
    """Closed petal path from radius r0 to r1 centred on angle 0."""
    a = half_angle
    p.moveTo(r0, 0)
    p.curveTo(r0 + (r1 - r0) * 0.3, r0 * math.tan(a) * bulge + (r1 - r0) * 0.35 * math.sin(a) * bulge * 3,
              r1 - (r1 - r0) * 0.25, (r1 - r0) * 0.3 * bulge, r1, 0)
    p.curveTo(r1 - (r1 - r0) * 0.25, -(r1 - r0) * 0.3 * bulge,
              r0 + (r1 - r0) * 0.3, -(r0 * math.tan(a) * bulge + (r1 - r0) * 0.35 * math.sin(a) * bulge * 3), r0, 0)
    p.close()


def draw_ring(c, rng, r0, r1, n, kind, fill=None, lw=1.4):
    """One ring of n identical motifs between radii r0..r1, centred at origin."""
    step = 360.0 / n
    offset = rng.choice([0, step / 2])
    for i in range(n):
        c.saveState()
        c.rotate(offset + i * step)
        p = c.beginPath()
        if kind == "petal":
            petal(p, r0, r1, math.radians(step / 2), rng.uniform(0.6, 1.0))
        elif kind == "double_petal":
            petal(p, r0, r1, math.radians(step / 2), 0.95)
            petal(p, r0 + (r1 - r0) * 0.25, r1 - (r1 - r0) * 0.2, math.radians(step / 2), 0.5)
        elif kind == "dots":
            rad = min((r1 - r0) / 2, (r0 + r1) / 2 * math.radians(step) / 2) * 0.8
            p.circle((r0 + r1) / 2, 0, rad)
        elif kind == "teardrop":
            mid = (r0 + r1) / 2
            w = mid * math.radians(step) * 0.42
            p.moveTo(r0, 0)
            p.curveTo(mid, w, r1, w, r1, 0)
            p.curveTo(r1, -w, mid, -w, r0, 0)
            p.close()
        elif kind == "arch":
            a = math.radians(step / 2) * 0.92
            p.moveTo(r0 * math.cos(a), r0 * math.sin(a))
            p.curveTo(r1 * math.cos(a), r1 * math.sin(a), r1 * 1.02, 0, r1 * 1.02, 0)
            p.curveTo(r1 * math.cos(-a) * 1.0, r1 * math.sin(-a), r0 * math.cos(-a), r0 * math.sin(-a),
                      r0 * math.cos(-a), r0 * math.sin(-a))
            p.close()
        elif kind == "diamond":
            mid = (r0 + r1) / 2
            w = mid * math.radians(step) * 0.45
            p.moveTo(r0, 0); p.lineTo(mid, w); p.lineTo(r1, 0); p.lineTo(mid, -w); p.close()
        c.setLineWidth(lw)
        if fill is not None:
            c.setFillColor(fill)
        c.drawPath(p, stroke=1, fill=1)
        c.restoreState()


KINDS = ["petal", "double_petal", "dots", "teardrop", "arch", "diamond"]


def draw_mandala(c, cx, cy, radius, rng, palette=None):
    """Draw a full mandala. palette=None -> white fills (colouring page)."""
    c.saveState()
    c.translate(cx, cy)
    c.setStrokeColor(black)
    # rings from outside in so inner rings sit on top
    edges = [radius]
    r = radius
    while r > radius * 0.12:
        r -= radius * rng.uniform(0.09, 0.16)
        edges.append(max(r, radius * 0.08))
    rings = list(zip(edges[1:], edges[:-1]))
    base_n = rng.choice([8, 10, 12, 16])
    for idx, (r0, r1) in enumerate(rings):
        n = base_n * rng.choice([1, 1, 2]) if r1 > radius * 0.35 else base_n
        kind = rng.choice(KINDS)
        fill = white if palette is None else palette[idx % len(palette)]
        # backing disc so overlaps read cleanly
        c.setFillColor(white if palette is None else palette[(idx + 2) % len(palette)])
        c.setLineWidth(1.2)
        c.circle(0, 0, r1, stroke=1, fill=1)
        draw_ring(c, rng, r0, r1, n, kind, fill=fill, lw=max(MIN_LINE, 1.6 - idx * 0.05))
    c.setFillColor(white if palette is None else palette[0])
    c.circle(0, 0, edges[-1], stroke=1, fill=1)
    draw_ring(c, rng, edges[-1] * 0.25, edges[-1] * 0.95, base_n // 2, "petal",
              fill=white if palette is None else palette[1])
    c.circle(0, 0, edges[-1] * 0.22, stroke=1, fill=1)
    c.restoreState()


# ---------------------------------------------------------------- interior
def text_page(c, lines):
    y = TRIM_H * 0.62
    for font, size, txt in lines:
        c.setFont(font, size)
        c.drawCentredString(TRIM_W / 2, y, txt)
        y -= size * 1.8
    c.showPage()


def build_interior(path, args):
    c = canvas.Canvas(path, pagesize=(TRIM_W, TRIM_H), initialFontName="Body")
    c.setTitle(args.title); c.setAuthor(args.author)
    # 1 title, 2 blank, 3 "this book belongs to", 4 blank/copyright
    text_page(c, [("Bold", 34, args.title), ("Body", 16, args.subtitle), ("Body", 13, ""), ("Body", 13, args.author)])
    c.showPage()  # blank back of title page
    text_page(c, [("Bold", 24, "This Book Belongs To"), ("Body", 14, ""), ("Body", 14, "_" * 34)])
    text_page(c, [("Body", 10, f"Copyright © {args.year} {args.author}. All rights reserved."),
                  ("Body", 10, "No part of this book may be reproduced without permission."),
                  ("Body", 10, "Tip: place a sheet of card behind each page when using markers."),
                  ("Body", 10, "Every design is printed on its own page with a blank back.")])
    rng = random.Random(args.seed)
    usable_w = TRIM_W - INSIDE_MARGIN - OUTSIDE_MARGIN
    for i in range(args.designs):
        # right-hand (odd) pages get the art; inside margin is on the left
        cx = INSIDE_MARGIN + usable_w / 2
        draw_mandala(c, cx, TRIM_H / 2 + 0.15 * inch, usable_w / 2 * 0.97, rng)
        c.setFont("Body", 9)
        c.drawCentredString(cx, 0.55 * inch, f"{i + 1}")
        c.showPage()
        c.showPage()  # blank reverse so markers don't bleed into the next design
    c.save()
    return 4 + args.designs * 2


# ---------------------------------------------------------------- cover
PALETTE = [HexColor(h) for h in ["#F2B5D4", "#7BDFF2", "#B2F7EF", "#F7D6E0", "#EFF7F6", "#FFD166", "#9D8DF1"]]


def build_cover(path, args, pages):
    spine = pages * SPINE_PER_PAGE
    W = BLEED * 2 + TRIM_W * 2 + spine
    H = TRIM_H + BLEED * 2
    c = canvas.Canvas(path, pagesize=(W, H), initialFontName="Body")
    c.setTitle(args.title + " - cover")
    bg = HexColor("#2B2D42")
    c.setFillColor(bg); c.rect(0, 0, W, H, stroke=0, fill=1)
    front_x0 = BLEED + TRIM_W + spine
    rng = random.Random(args.seed + 999)
    # front: big coloured mandala + title band
    draw_mandala(c, front_x0 + TRIM_W / 2, BLEED + TRIM_H * 0.44, TRIM_W * 0.43, rng, palette=PALETTE)
    c.setFillColor(white)
    c.setFont("Bold", 40)
    c.drawCentredString(front_x0 + TRIM_W / 2, BLEED + TRIM_H - 1.35 * inch, args.title)
    c.setFont("Body", 17)
    c.drawCentredString(front_x0 + TRIM_W / 2, BLEED + TRIM_H - 1.85 * inch, args.subtitle)
    c.setFont("Body", 14)
    c.drawCentredString(front_x0 + TRIM_W / 2, BLEED + 0.7 * inch, args.author)
    # back: blurb + small mandala; leave KDP barcode zone (bottom-right of back, 2"x1.2") empty
    back_cx = BLEED + TRIM_W / 2
    draw_mandala(c, back_cx, BLEED + TRIM_H * 0.62, TRIM_W * 0.22, random.Random(args.seed + 5), palette=PALETTE)
    c.setFillColor(white); c.setFont("Body", 13)
    y = BLEED + TRIM_H * 0.36
    for line in args.blurb:
        c.drawCentredString(back_cx, y, line); y -= 20
    # spine text only when KDP allows it (>79 pages) and there is room
    if pages > 79 and spine > 0.2 * inch:
        c.saveState()
        c.translate(BLEED + TRIM_W + spine / 2, H / 2)
        c.rotate(-90)
        c.setFont("Bold", min(10, spine / inch * 30))  # keeps KDP 0.0625" gap each side
        c.drawCentredString(0, -3, args.title.upper())
        c.restoreState()
    c.save()
    return W / inch, H / inch, spine / inch


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", default="Mindful Mandalas")
    ap.add_argument("--subtitle", default="50 Original Patterns for Stress Relief & Relaxation")
    ap.add_argument("--author", default="Jl Studio")
    ap.add_argument("--year", default="2026")
    ap.add_argument("--designs", type=int, default=50)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    args = ap.parse_args()
    args.blurb = ["Slow down, breathe, and colour.",
                  f"{args.designs} original mandala designs,",
                  "from bold and simple to rich and detailed.",
                  "",
                  "Single-sided pages - no bleed-through",
                  "Large 8.5 x 11 inch format",
                  "Perfect for markers, pencils and gel pens"]
    register_fonts()
    os.makedirs(args.out, exist_ok=True)
    pages = build_interior(os.path.join(args.out, "interior.pdf"), args)
    w, h, s = build_cover(os.path.join(args.out, "cover.pdf"), args, pages)
    print(f"Interior: {pages} pages, 8.5 x 11 in, no bleed")
    print(f"Cover:    {w:.3f} x {h:.3f} in (spine {s:.3f} in)  -> enter {pages} pages in KDP")
    if shutil.which("pdftoppm"):
        subprocess.run(["pdftoppm", "-png", "-r", "60", "-f", "5", "-l", "5",
                        os.path.join(args.out, "interior.pdf"), os.path.join(args.out, "preview-page")])
        subprocess.run(["pdftoppm", "-png", "-r", "40", "-singlefile",
                        os.path.join(args.out, "cover.pdf"), os.path.join(args.out, "preview-cover")])


if __name__ == "__main__":
    main()
