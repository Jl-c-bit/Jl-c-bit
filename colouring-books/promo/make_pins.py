#!/usr/bin/env python3
"""Pinterest pins for the Mandala series (1000x1500, Pinterest's 2:3 size).

Per book:  <book>-pin-cover.jpg     cover with a search-style headline
           <book>-pin-inside.jpg    3 pages from inside, in a collage
           <book>-pin-palette.jpg   a fully coloured page plus the colour swatches used
           <book>-pin-before-after.jpg  the same page blank, then coloured
Plus series-pin-gift-guide.jpg.

    python3 promo/make_pins.py        (run after ./build_series.sh)
"""
import os
import numpy as np
from PIL import Image, ImageDraw

from make_promo import (BOOKS, OUT_BOOKS, colouring_plan, font, front_cover, hex2rgb,
                        mandala_bw, render)

PW, PH = 1000, 1500
DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "pins")
PAPER = "#FAF7F2"
INK = "#22223B"


def coloured_page(book, size):
    folder, _, _, _, palette, pages = book
    white = mandala_bw(os.path.join(OUT_BOOKS, folder, "interior.pdf"), pages[0], size)
    page = np.where(white[..., None], 255, 0).astype(np.uint8).repeat(3, 2)
    blank = Image.fromarray(page.copy())
    flat = page.reshape(-1, 3)
    for idx, col in colouring_plan(white, palette):
        flat[idx] = col
    return blank, Image.fromarray(page)


def header(d, top, big, y=70, colour=INK):
    d.text((PW / 2, y), top, font=font(36, False), fill=colour, anchor="mm")
    d.text((PW / 2, y + 70), big, font=font(58), fill=colour, anchor="mm")


def footer(d, title, colour=INK):
    d.text((PW / 2, PH - 110), title, font=font(42), fill=colour, anchor="mm")
    d.text((PW / 2, PH - 55), "Jl Studio Mandala Collection  |  on Amazon", font=font(30, False),
           fill=colour, anchor="mm")


def pin_cover(book):
    folder, title, sub, bg, *_ = book
    s = Image.new("RGB", (PW, PH), bg); d = ImageDraw.Draw(s)
    header(d, "Adult coloring book", sub.capitalize(), colour="white")
    c = front_cover(folder, 1100)
    s.paste(c, ((PW - c.width) // 2, 220))
    footer(d, "Single-sided pages, no bleed-through", colour="white")
    return s


def pin_inside(book):
    folder, title, sub, bg, palette, pages = book
    s = Image.new("RGB", (PW, PH), PAPER); d = ImageDraw.Draw(s)
    header(d, "Look inside", title)
    pdf = os.path.join(OUT_BOOKS, folder, "interior.pdf")
    imgs = [render(pdf, p, 100) for p in pages]
    big = imgs[0].resize((560, int(imgs[0].height * 560 / imgs[0].width)))
    s.paste(big, (40, 230))
    for i, im in enumerate(imgs[1:]):
        sm = im.resize((340, int(im.height * 340 / im.width)))
        s.paste(sm, (620, 230 + i * (sm.height + 20)))
    for x, y, w, h in [(40, 230, 560, big.height), (620, 230, 340, sm.height), (620, 230 + sm.height + 20, 340, sm.height)]:
        d.rectangle((x, y, x + w, y + h), outline="#BBBBBB", width=2)
    y = 230 + max(big.height, 2 * sm.height + 20) + 60
    for line in ["50 original designs, no repeats" if "40" not in sub else "40 big, simple designs",
                 "Every design on its own page", "Large 8.5 x 11 inch format"]:
        d.text((PW / 2, y), "•  " + line, font=font(36, False), fill=INK, anchor="mm"); y += 62
    footer(d, title)
    return s


def pin_palette(book, coloured):
    folder, title, sub, bg, palette, pages = book
    s = Image.new("RGB", (PW, PH), PAPER); d = ImageDraw.Draw(s)
    header(d, "Mandala coloring idea", "Try this color palette")
    s.paste(coloured.resize((900, 900)), (50, 220))
    n = len(palette); sw = (PW - 100) // n
    for i, h in enumerate(palette):
        d.rounded_rectangle((50 + i * sw + 6, 1150, 50 + (i + 1) * sw - 6, 1250), 14, fill=hex2rgb(h))
        d.text((50 + i * sw + sw / 2, 1280), h.upper(), font=font(20, False), fill=INK, anchor="mm")
    footer(d, f"Page from {title}")
    return s


def pin_before_after(book, blank, coloured):
    folder, title, *_ = book
    s = Image.new("RGB", (PW, PH), PAPER); d = ImageDraw.Draw(s)
    header(d, "Before & after", "From blank page to calm", y=55)
    for i, (im, label) in enumerate([(blank, "Before"), (coloured, "After")]):
        y = 190 + i * 610
        s.paste(im.resize((560, 560)), (220, y))
        d.text((120, y + 280), label, font=font(34), fill=INK, anchor="mm")
    footer(d, title)
    return s


def pin_gift_guide():
    s = Image.new("RGB", (PW, PH), "#22223B"); d = ImageDraw.Draw(s)
    header(d, "Gift guide", "Coloring books for everyone", colour="white")
    who = ["For the stressed-out friend", "For Grandma & Grandpa", "For the perfectionist", "For the garden lover"]
    for i, (b, w) in enumerate(zip(BOOKS, who)):
        x = 50 + (i % 2) * 470; y = 240 + (i // 2) * 560
        c = front_cover(b[0], 520)
        c = c.resize((360, int(c.height * 360 / c.width)))
        s.paste(c, (x + 55, y))
        d.text((x + 235, y + c.height + 32), w,
               font=font(28), fill="white", anchor="mm")
    footer(d, "Single-sided pages  |  8.5 x 11 in", colour="white")
    return s


if __name__ == "__main__":
    os.makedirs(DEST, exist_ok=True)
    for b in BOOKS:
        blank, coloured = coloured_page(b, 1000)
        for name, im in [("cover", pin_cover(b)), ("inside", pin_inside(b)),
                         ("palette", pin_palette(b, coloured)),
                         ("before-after", pin_before_after(b, blank, coloured))]:
            im.save(os.path.join(DEST, f"{b[0]}-pin-{name}.jpg"), quality=90)
        print(b[0], "done")
    pin_gift_guide().save(os.path.join(DEST, "series-pin-gift-guide.jpg"), quality=90)
    print("gift guide done")
