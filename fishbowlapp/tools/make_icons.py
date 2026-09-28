"""Draw the app icons: a goldfish in a bowl on a warm background.

Run from the fishbowlapp folder:  python3 tools/make_icons.py
Needs Pillow (pip install pillow). Writes icons/icon-192.png, icons/icon-512.png
and icons/icon-512-maskable.png (with extra padding for Android's shaped icons).
"""

import math
import os

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")
SS = 4  # draw 4x larger, then shrink, for smooth edges


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def radial_background(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    cx, cy, r = size * 0.3, size * 0.15, size * 1.1
    inner, outer = (122, 79, 51), (42, 28, 20)
    for y in range(size):
        for x in range(size):
            t = min(1, math.hypot(x - cx, y - cy) / r)
            px[x, y] = lerp(inner, outer, t)
    return img


def bezier(p0, p1, p2, p3, steps=24):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        pts.append((
            mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
            mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1],
        ))
    return pts


def draw_icon(size, scale):
    """scale < 1 shrinks the artwork toward the middle (for maskable icons)."""
    S = size * SS
    img = radial_background(S)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def P(x, y):  # artwork is designed on a 512 grid
        k = S / 512
        return ((256 + (x - 256) * scale) * k, (280 + (y - 280) * scale) * k)

    def R(v):
        return v * S / 512 * scale

    cx, cy = P(256, 280)
    rad = R(180)

    # Shadow on the table
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([P(106, 438), P(446, 468)], fill=(0, 0, 0, 110))
    img.paste(shadow.filter(ImageFilter.GaussianBlur(R(10))), (0, 0), shadow.filter(ImageFilter.GaussianBlur(R(10))))

    # Water: circle below the waterline, darker toward the bottom
    water = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    wpx = water.load()
    top_y = P(0, 190)[1]
    for y in range(int(top_y), int(cy + rad) + 1):
        t = (y - top_y) / (cy + rad - top_y)
        c = lerp((143, 224, 216), (27, 111, 120), t)
        half = math.sqrt(max(0, rad * rad - (y - cy) ** 2))
        for x in range(int(cx - half), int(cx + half) + 1):
            wpx[x, y] = (*c, 255)
    layer.alpha_composite(water)

    # Gravel
    d.chord([cx - rad, cy - rad, cx + rad, cy + rad], 30, 150, fill=(156, 132, 102))
    # Seaweed
    for dx, w, col in ((0, 14, (47, 138, 74)), (22, 10, (58, 163, 90))):
        pts = bezier(P(150 + dx, 405), P(135 + dx, 340), P(175 + dx, 300), P(158 + dx, 225))
        d.line(pts, fill=col, width=round(R(w)), joint="curve")

    # Fish: tail, dorsal fin, body, eye
    fx, fy = 270, 290
    d.polygon([P(fx - 70, fy), P(fx - 130, fy - 45), P(fx - 115, fy), P(fx - 130, fy + 45)], fill=(255, 159, 67))
    d.polygon([P(fx - 10, fy - 50), P(fx + 25, fy - 88), P(fx + 60, fy - 55)], fill=(255, 159, 67))
    body = (bezier(P(fx + 100, fy), P(fx + 92, fy - 62), P(fx + 10, fy - 70), P(fx - 72, fy - 16))
            + bezier(P(fx - 72, fy + 16), P(fx + 10, fy + 70), P(fx + 92, fy + 62), P(fx + 100, fy)))
    body_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(body_mask).polygon(body, fill=255)
    grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gpx = grad.load()
    y0, y1 = P(0, fy - 70)[1], P(0, fy + 70)[1]
    for y in range(int(y0), int(y1) + 1):
        t = (y - y0) / (y1 - y0)
        c = lerp((194, 65, 12), (255, 138, 42), t / 0.5) if t < 0.5 else lerp((255, 138, 42), (255, 224, 184), (t - 0.5) / 0.5)
        for x in range(int(P(fx - 75, 0)[0]), int(P(fx + 102, 0)[0])):
            gpx[x, y] = (*c, 255)
    layer.paste(grad, (0, 0), body_mask)
    ex, ey = P(fx + 62, fy - 12)
    d.ellipse([ex - R(13), ey - R(13), ex + R(13), ey + R(13)], fill=(255, 255, 255))
    d.ellipse([ex - R(3), ey - R(7), ex + R(11), ey + R(7)], fill=(17, 17, 17))

    # Bubbles
    for bx, by, br in ((335, 232, 9), (318, 258, 6)):
        x, y = P(bx, by)
        d.ellipse([x - R(br), y - R(br), x + R(br), y + R(br)], outline=(232, 255, 255), width=round(R(3.5)))

    # Waterline, rim, glass outline, highlight
    d.ellipse([P(106, 176), P(406, 204)], fill=(176, 236, 229, 235))
    d.ellipse([P(152, 124), P(360, 148)], outline=(232, 251, 255, 220), width=round(R(6)))
    d.arc([cx - rad, cy - rad, cx + rad, cy + rad], -56, 236, fill=(223, 246, 255, 160), width=round(R(5)))
    d.arc([cx - rad * 0.86, cy - rad * 0.86, cx + rad * 0.86, cy + rad * 0.86], 196, 238, fill=(255, 253, 240, 215), width=round(R(12)))

    img = img.convert("RGBA")
    img.alpha_composite(layer)
    return img.convert("RGB").resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, size, scale in (("icon-192.png", 192, 1.0), ("icon-512.png", 512, 1.0), ("icon-512-maskable.png", 512, 0.78)):
        draw_icon(size, scale).save(os.path.join(OUT, name), optimize=True)
        print("wrote", os.path.join("icons", name))


if __name__ == "__main__":
    main()
