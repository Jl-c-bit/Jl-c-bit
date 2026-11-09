#!/usr/bin/env python3
"""TikTok assets for the Mandala series (1080x1920).

For each book:  <book>-colouring.mp4  - a page colours itself in, then the cover appears
                <book>-slide-*.jpg    - photo carousel: cover, 3 sample pages, call to action
Plus series-gift-*.jpg (all four books) for the gift-guide post.

    python3 promo/make_promo.py        (run after ./build_series.sh)
"""
import collections, os, subprocess, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_BOOKS = os.path.join(HERE, "..", "out")
DEST = os.path.join(HERE, "out")
W, H, FPS = 1080, 1920, 30
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"

BOOKS = [  # folder, title, line under title, cover bg, colouring palette, design pages
    ("1-mindful-mandalas", "Mindful Mandalas", "50 calming designs", "#2B2D42",
     ["#F2B5D4", "#7BDFF2", "#B2F7EF", "#FFD166", "#9D8DF1", "#F7D6E0", "#EF476F"], [5, 23, 61]),
    ("2-easy-mandalas", "Easy Mandalas", "40 big, simple designs", "#1D3557",
     ["#A8DADC", "#FFB4A2", "#E9C46A", "#F4A261", "#CDB4DB", "#457B9D"], [5, 21, 45]),
    ("3-intricate-mandalas", "Intricate Mandalas", "50 detailed designs", "#0B0B0F",
     ["#E0AAFF", "#C77DFF", "#9D4EDD", "#FFD60A", "#48CAE4", "#F72585", "#3A0CA3"], [5, 31, 77]),
    ("4-mandala-garden", "Mandala Garden", "50 flower designs", "#2D6A4F",
     ["#FFC8DD", "#FFAFCC", "#FFF1B5", "#BDE0FE", "#D8F3DC", "#FFB703", "#FB8500"], [5, 25, 59]),
]


def font(size, bold=True):
    return ImageFont.truetype(FONT if bold else FONT_R, size)


def hex2rgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def render(pdf, page, dpi):
    with tempfile.TemporaryDirectory() as t:
        subprocess.run(["pdftoppm", "-png", "-r", str(dpi), "-f", str(page), "-l", str(page),
                        "-singlefile", pdf, os.path.join(t, "p")], check=True)
        return Image.open(os.path.join(t, "p.png")).convert("RGB")


def mandala_bw(pdf, page, size=1000):
    """Page -> square, pure black/white crop of the mandala (page number dropped)."""
    im = render(pdf, page, 150).convert("L")
    a = np.array(im)[: int(im.height * 0.9)]
    ys, xs = np.where(a < 128)
    crop = im.crop((xs.min() - 4, ys.min() - 4, xs.max() + 5, ys.max() + 5)).resize((size, size), Image.LANCZOS)
    return (np.array(crop) >= 150)  # True = white


def label_regions(white):
    """4-connected labelling of white pixels (no scipy needed)."""
    h, w = white.shape
    lab = np.zeros(h * w, np.int32)
    flat = white.ravel()
    n = 0
    for start in np.flatnonzero(flat):
        if lab[start]:
            continue
        n += 1
        lab[start] = n
        q = collections.deque([start])
        while q:
            p = q.popleft()
            y, x = divmod(p, w)
            for nb, ok in ((p - 1, x > 0), (p + 1, x < w - 1), (p - w, y > 0), (p + w, y < h - 1)):
                if ok and flat[nb] and not lab[nb]:
                    lab[nb] = n
                    q.append(nb)
    return lab.reshape(h, w), n


def colouring_plan(white, palette):
    lab, n = label_regions(white)
    h, w = lab.shape
    flat = lab.ravel()
    order = np.argsort(flat, kind="stable")
    counts = np.bincount(flat, minlength=n + 1)
    starts = np.concatenate([[0], np.cumsum(counts)])
    yy, xx = np.divmod(np.arange(h * w), w)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    regions = []
    for i in range(1, n + 1):
        if i in border or counts[i] < 25:
            continue
        idx = order[starts[i]:starts[i + 1]]
        cy, cx = yy[idx].mean() - h / 2, xx[idx].mean() - w / 2
        r = (cx * cx + cy * cy) ** 0.5
        regions.append((r, np.arctan2(cy, cx), counts[i], idx))
    # same ring + similar size => same colour, so the colouring stays symmetric
    keys = sorted({(round(r / 9), int(np.log2(sz) * 2)) for r, _, sz, _ in regions})
    colour_of = {k: hex2rgb(palette[j % len(palette)]) for j, k in enumerate(keys)}
    regions.sort(key=lambda t: (round(t[0] / 9), t[1]))  # centre outwards, sweeping round
    return [(idx, colour_of[(round(r / 9), int(np.log2(sz) * 2))]) for r, _, sz, idx in regions]


def frame_base(bg, title, sub, top="Colour with me", bottom="Search \"Jl Studio Mandalas\" on Amazon"):
    f = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(f)
    d.text((W / 2, 170), top, font=font(54, False), fill="white", anchor="mm")
    d.text((W / 2, 270), title, font=font(84), fill="white", anchor="mm")
    d.text((W / 2, 360), sub, font=font(44, False), fill="#DDDDDD", anchor="mm")
    d.rounded_rectangle((30, 440, W - 30, 440 + 1020), 36, fill="white")
    d.text((W / 2, 1600), bottom, font=font(40, False), fill="white", anchor="mm")
    d.text((W / 2, 1670), "Single-sided pages  |  8.5 x 11 in", font=font(36, False), fill="#CCCCCC", anchor="mm")
    return f


def front_cover(folder, height):
    dpi = 100
    im = render(os.path.join(OUT_BOOKS, folder, "cover.pdf"), 1, dpi)
    bleed = round(0.125 * dpi)
    # front cover = rightmost 8.5in before the right bleed; drop the bleed on all sides
    front = im.crop((im.width - bleed - round(8.5 * dpi), bleed, im.width - bleed, im.height - bleed))
    return front.resize((int(front.width * height / front.height), height), Image.LANCZOS)


def make_video(book):
    folder, title, sub, bg, palette, pages = book
    pdf = os.path.join(OUT_BOOKS, folder, "interior.pdf")
    white = mandala_bw(pdf, pages[0])
    plan = colouring_plan(white, palette)
    page = np.where(white[..., None], 255, 0).astype(np.uint8).repeat(3, 2)
    base = frame_base(bg, title, sub)
    path = os.path.join(DEST, f"{folder}-colouring.mp4")
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                           "-crf", "20", "-movflags", "+faststart", path], stdin=subprocess.PIPE)
    flat = page.reshape(-1, 3)

    def emit(img, times=1):
        b = img.tobytes()
        for _ in range(times):
            ff.stdin.write(b)

    def compose():
        f = base.copy(); f.paste(Image.fromarray(page), (40, 450)); return f

    emit(compose(), FPS)                      # 1s blank page
    fill_frames = 14 * FPS                    # 14s of colouring
    per = max(1, -(-len(plan) // fill_frames))
    for i in range(0, len(plan), per):
        for idx, col in plan[i:i + per]:
            flat[idx] = col
        emit(compose())
    emit(compose(), 2 * FPS)                  # hold finished page
    cover = front_cover(folder, 1020)
    end = base.copy(); end.paste(cover, ((W - cover.width) // 2, 440))
    emit(end, 3 * FPS)
    ff.stdin.close(); ff.wait()
    return path, len(plan)


def make_slides(book):
    folder, title, sub, bg, palette, pages = book
    pdf = os.path.join(OUT_BOOKS, folder, "interior.pdf")
    paths = []
    s = Image.new("RGB", (W, H), bg); d = ImageDraw.Draw(s)
    cover = front_cover(folder, 1300)
    s.paste(cover, ((W - cover.width) // 2, 230))
    d.text((W / 2, 1650), "New colouring book", font=font(64), fill="white", anchor="mm")
    d.text((W / 2, 1740), "swipe for a look inside", font=font(44, False), fill="#DDDDDD", anchor="mm")
    paths.append(s)
    for n, p in enumerate(pages, 1):
        pg = render(pdf, p, 150)
        pg = pg.resize((W - 80, int(pg.height * (W - 80) / pg.width)), Image.LANCZOS)
        s = Image.new("RGB", (W, H), bg); d = ImageDraw.Draw(s)
        d.text((W / 2, 150), f"Page {n} of 3 inside", font=font(52), fill="white", anchor="mm")
        s.paste(pg, (40, 260))
        paths.append(s)
    s = Image.new("RGB", (W, H), bg); d = ImageDraw.Draw(s)
    for y, (t, sz, b) in zip(range(600, 1500, 130), [
            (title, 80, True), (sub, 50, False), ("Single-sided pages, no bleed-through", 42, False),
            ("Big 8.5 x 11 inch pages", 42, False), ("Search \"Jl Studio Mandalas\"", 52, True),
            ("on Amazon, or tap the link in bio", 42, False)]):
        d.text((W / 2, y), t, font=font(sz, b), fill="white", anchor="mm")
    paths.append(s)
    out = []
    for i, im in enumerate(paths, 1):
        p = os.path.join(DEST, f"{folder}-slide-{i}.jpg"); im.save(p, quality=90); out.append(p)
    return out


def make_gift_slides():
    out = []
    s = Image.new("RGB", (W, H), "#22223B"); d = ImageDraw.Draw(s)
    d.text((W / 2, 220), "Colouring book gift guide", font=font(66), fill="white", anchor="mm")
    d.text((W / 2, 310), "which one is for who?", font=font(46, False), fill="#DDDDDD", anchor="mm")
    covers = [front_cover(b[0], 640) for b in BOOKS]
    for i, c in enumerate(covers):
        x = 60 + (i % 2) * 500; y = 420 + (i // 2) * 700
        s.paste(c.resize((460, int(c.height * 460 / c.width))), (x, y))
    p = os.path.join(DEST, "series-gift-1.jpg"); s.save(p, quality=90); out.append(p)
    for i, (who, b) in enumerate(zip(["For the stressed-out friend", "For Grandma and Grandpa",
                                      "For the perfectionist", "For the garden lover"], BOOKS), 2):
        s = Image.new("RGB", (W, H), b[3]); d = ImageDraw.Draw(s)
        d.text((W / 2, 200), who, font=font(62), fill="white", anchor="mm")
        c = front_cover(b[0], 1250); s.paste(c, ((W - c.width) // 2, 320))
        d.text((W / 2, 1700), f"{b[1]}: {b[2]}", font=font(46, False), fill="white", anchor="mm")
        p = os.path.join(DEST, f"series-gift-{i}.jpg"); s.save(p, quality=90); out.append(p)
    return out


if __name__ == "__main__":
    os.makedirs(DEST, exist_ok=True)
    for b in BOOKS:
        path, n = make_video(b)
        print(f"{os.path.basename(path)}: {n} regions coloured")
        print("  slides:", len(make_slides(b)))
    print("gift slides:", len(make_gift_slides()))
