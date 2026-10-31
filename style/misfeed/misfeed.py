#!/usr/bin/env python3
"""MISFEED: a signature glitch-print animation style for 9:16 Shorts.

No image model is involved. Every frame is "printed" the way a cheap riso /
photocopier would print it: two ink plates (toner black, fluoro orange) laid on
newsprint, then wrecked by real machine faults. The plates misregister, the
page slips mid-scan, the scan head drags one line into blue streaks, the drum
leaves ghosts and scratches, and dust lands on the glass. Scan blue is the one
colour that only exists inside a fault.

    python3 style/misfeed/misfeed.py key            # out/misfeed_key.png   (the hero still)
    python3 style/misfeed/misfeed.py anim           # out/misfeed_hook.mp4  (7 s seamless loop, with sound)
    python3 style/misfeed/misfeed.py sheet          # out/misfeed_beats.png (storyboard of the beats)
    python3 style/misfeed/misfeed.py all            # all three
    python3 style/misfeed/misfeed.py treat my.jpg   # your photo, printed in MISFEED
    python3 style/misfeed/misfeed.py treat my.mp4 --glitch 0.4,3.1   # your clip

    --hook "YOU WEREN'T|SUPPOSED TO|SEE THIS."   hook lines, '|' between lines
    --note "that's you"                          the marker scribble by the eye
"""

import argparse
import math
import subprocess
import sys
import urllib.request
import wave
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
FONT_DIR = HERE / "fonts"

W, H, SS, FPS = 1080, 1920, 2, 24
LOOP = 168  # 7 s at 24 fps


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


# The whole palette. Two inks print; blue is reserved for faults.
PAPER = hexrgb("#ECE5D6")   # newsprint
SCRAP = hexrgb("#F6F2EA")   # the brighter stock the cut-out is printed on
TONER = hexrgb("#161418")   # toner black
ORANGE = hexrgb("#FF4A1C")  # fluoro "misfeed" orange
BLUE = hexrgb("#2640FF")    # scan blue: only ever appears inside a glitch
BED = hexrgb("#111013")     # the scanner glass you see when the page slides off
LAMP = np.array([0.86, 0.94, 1.0], np.float32)

# ---------------------------------------------------------------- fonts ---

GF = "https://raw.githubusercontent.com/google/fonts/main/"
FONTS = {
    "hook": ("Anton-Regular.ttf", GF + "ofl/anton/Anton-Regular.ttf"),
    "marker": ("PermanentMarker-Regular.ttf", GF + "apache/permanentmarker/PermanentMarker-Regular.ttf"),
    "type": ("SpecialElite-Regular.ttf", GF + "apache/specialelite/SpecialElite-Regular.ttf"),
}
FALLBACK = ["/usr/share/fonts/opentype/inter/Inter-Black.otf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/Library/Fonts/Arial Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"]


@lru_cache(None)
def font_file(key):
    name, url = FONTS[key]
    p = FONT_DIR / name
    if not p.exists():
        try:
            FONT_DIR.mkdir(exist_ok=True)
            tmp = p.with_suffix(".part")
            urllib.request.urlretrieve(url, tmp)
            tmp.rename(p)
        except Exception as e:  # offline: fall back, the look survives
            print(f"[misfeed] could not fetch {name} ({e}); using a fallback font", file=sys.stderr)
    for cand in [p, *FALLBACK]:
        if Path(cand).exists():
            return str(cand)
    return None


@lru_cache(None)
def font(key, size):
    f = font_file(key)
    return ImageFont.truetype(f, int(size)) if f else ImageFont.load_default()


# ---------------------------------------------------------------- noise ---

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def _box(a, r):
    k = 2 * r + 1
    for ax in (0, 1):
        pw = [(0, 0)] * a.ndim
        pw[ax] = (r + 1, r)
        c = np.cumsum(np.pad(a, pw, mode="edge"), axis=ax, dtype=np.float32)
        n = a.shape[ax]
        if ax == 0:
            a = (c[k:k + n] - c[:n]) / k
        else:
            a = (c[:, k:k + n] - c[:, :n]) / k
    return a


def blur(a, r, passes=2):
    r = int(round(r))
    for _ in range(passes if r >= 1 else 0):
        a = _box(a, r)
    return a


def vnoise(shape, cell, rng):
    h, w = shape
    gh, gw = int(h / cell) + 3, int(w / cell) + 3
    g = rng.random((gh, gw), dtype=np.float32)
    a = np.asarray(Image.fromarray(g).resize((int(gw * cell), int(gh * cell)), Image.BICUBIC))
    oy, ox = rng.integers(0, max(int(cell), 1), 2)
    return a[oy:oy + h, ox:ox + w]


def fbm(shape, cell, rng, octaves=3):
    tot, amp, norm = 0.0, 1.0, 0.0
    for i in range(octaves):
        tot = tot + amp * vnoise(shape, max(cell / 2 ** i, 1.0), rng)
        norm += amp
        amp *= 0.5
    return (tot / norm).astype(np.float32)


def shift(a, dx, dy, fill=0.0):
    dx, dy = int(round(dx)), int(round(dy))
    if not dx and not dy:
        return a
    out = np.full_like(a, fill)
    h, w = a.shape[:2]
    if abs(dx) >= w or abs(dy) >= h:
        return out
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = a[ys, xs]
    return out


YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


def disc(cx, cy, r):
    m = np.zeros((H, W), np.float32)
    x0, x1 = max(int(cx - r - 2), 0), min(int(cx + r + 3), W)
    y0, y1 = max(int(cy - r - 2), 0), min(int(cy + r + 3), H)
    d = np.hypot(XX[y0:y1, x0:x1] - cx, YY[y0:y1, x0:x1] - cy)
    m[y0:y1, x0:x1] = np.clip(r - d + 0.5, 0, 1)
    return m


# ------------------------------------------------------------ halftone ---

@lru_cache(None)
def screen(period, angle):
    a = math.radians(angle)
    c, s = math.cos(a), math.sin(a)
    k = 2 * math.pi / period
    u, v = (XX * c + YY * s) * k, (YY * c - XX * s) * k
    return ((np.cos(u) + np.cos(v)) * 0.25 + 0.5).astype(np.float32)


def halftone(tone, period=7.5, angle=45.0):
    """AM halftone: round dots that merge into a checker, then into holes."""
    s = screen(period, angle)
    a = np.clip((tone - s) * (period / 1.3) + 0.5, 0, 1)
    a *= np.clip(tone * 25, 0, 1)
    return np.maximum(a, np.clip((tone - 0.96) * 25, 0, 1))


# ------------------------------------------------------- paper & toner ---

class Copy:
    """One physical copy of the page: paper grain, toner behaviour, dust.
    The animation cycles three of these on twos, so the texture crawls like a
    stack of photocopies flipped in front of a camera."""

    def __init__(self, seed):
        rng = np.random.default_rng(seed)
        self.hf = fbm((H, W), 5, rng, 3)
        self.lf = fbm((H, W), 230, rng, 4)
        self.holes = np.clip((fbm((H, W), 3, rng, 2) - 0.64) * 7, 0, 1)
        self.grain = rng.normal(0, 1, (H, W)).astype(np.float32)
        lum = (fbm((H, W), 380, rng, 3) - 0.5) * 0.07 + (fbm((H, W), 22, rng, 2) - 0.5) * 0.03
        fib = Image.new("L", (W, H), 128)
        d = ImageDraw.Draw(fib)
        for _ in range(1600):
            x, y = rng.uniform(0, W), rng.uniform(0, H)
            a, ln = rng.uniform(0, math.pi), rng.uniform(4, 20)
            d.line([(x, y), (x + ln * math.cos(a), y + ln * math.sin(a))],
                   fill=int(rng.choice([150, 160, 170, 100])), width=1)
        fib = (np.asarray(fib, np.float32) - 128) / 128 * 0.05
        self.shade = (1 + lum + fib)[..., None]
        dust = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(dust)
        for _ in range(260):
            x, y, r = rng.uniform(0, W), rng.uniform(0, H), rng.choice([0.6, 0.9, 1.2, 1.8, 2.6], p=[.35, .3, .2, .1, .05])
            d.ellipse([x - r, y - r, x + r, y + r], fill=int(rng.uniform(120, 255)))
        for _ in range(1):  # a hair on the glass
            x, y = rng.uniform(0, W), rng.uniform(0, H)
            pts = [(x + 60 * math.sin(i / 5 + y) + i * 3, y + i * 4) for i in range(30)]
            d.line(pts, fill=150, width=1)
        self.dust = np.asarray(dust, np.float32) / 255


@lru_cache(None)
def copies():
    return [Copy(s) for s in (101, 202, 303)]


@lru_cache(None)
def glass():
    """Faults that belong to the machine, so they stay put on every frame."""
    rng = np.random.default_rng(77)
    m = np.zeros((H, W), np.float32)
    for x, w, s in ((318, 1, 0.12), (781, 2, 0.17), (903, 1, 0.07), (122, 1, 0.05)):
        prof = s * (0.35 + 0.65 * smoothstep(0.3, 0.7, fbm((H, 4), 90, rng, 2)[:, 0]))
        m[:, x:x + w] = prof[:, None]
    dust = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(dust)
    for _ in range(90):
        x, y, r = rng.uniform(0, W), rng.uniform(0, H), rng.choice([0.7, 1.1, 1.6, 3.0], p=[.45, .3, .2, .05])
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    m = np.maximum(m, np.asarray(dust, np.float32) / 255)
    vig = 1 - 0.07 * (((XX / W - 0.5) * 1.6) ** 2 + ((YY / H - 0.5) * 1.2) ** 2)
    vig *= 1 - 0.22 * np.exp(-(W - 1 - XX) / 16)       # lid shadow down the right edge
    band = 0.3 * np.exp(-((YY[:, :1] - 1262) / 16) ** 2)  # a toner-starved band
    return m, vig[..., None].astype(np.float32), band[..., None].astype(np.float32)


def ink(mask, cp, spread=1, rough=0.5, starve=0.2, holes=0.4):
    """Turn a clean mask into ink: spread, ragged edges, starved patches, pinholes."""
    m = blur(mask, spread, 1) if spread else mask
    m = np.clip((m - 0.5 + rough * (cp.hf - 0.5)) * 4.5 + 0.5, 0, 1)
    return m * np.clip(1 - starve * cp.lf - holes * cp.holes, 0, 1)


# ------------------------------------------------------------- drawing ---

class Canvas:
    """A supersampled 1-bit-ish plate you draw vector shapes onto."""

    def __init__(self):
        self.im = Image.new("L", (W * SS, H * SS), 0)
        self.d = ImageDraw.Draw(self.im)

    def poly(self, pts, fill=255):
        self.d.polygon([(float(x) * SS, float(y) * SS) for x, y in pts], fill=fill)

    def circle(self, x, y, r, fill=255):
        self.d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=fill)

    def stroke(self, pts, widths, fill=255):
        pts = np.asarray(pts, np.float64)
        wd = np.broadcast_to(np.asarray(widths, np.float64), (len(pts),))
        d = np.gradient(pts, axis=0)
        d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
        nrm = np.stack([-d[:, 1], d[:, 0]], 1) * wd[:, None] / 2
        self.poly(np.vstack([pts + nrm, (pts - nrm)[::-1]]), fill)
        for p, w in ((pts[0], wd[0]), (pts[-1], wd[-1])):
            self.circle(p[0], p[1], w / 2, fill)

    def paste(self, img, x, y, fill=255):
        self.im.paste(fill, (int(round(x)), int(round(y))), img)

    def arr(self):
        return np.asarray(self.im.resize((W, H), Image.BOX), np.float32) / 255


def wobble(pts, rng, amp=1.5, harmonics=3):
    pts = np.asarray(pts, np.float64)
    t = np.linspace(0, 1, len(pts))[:, None]
    off = np.zeros_like(pts)
    for k in range(1, harmonics + 1):
        off += rng.normal(0, amp / k, 2) * np.sin(math.pi * k * t + rng.uniform(0, 2 * math.pi, 2))
    return pts + off


def bezier(p0, p1, p2, n=14):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2 = map(np.asarray, (p0, p1, p2))
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2


def rotate_pts(pts, ang_deg, cx, cy):
    a = math.radians(ang_deg)
    c, s = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in pts]


def torn(corners, rng, amp=5.0, step=6.0):
    """Walk a polygon's edges with a pinned random walk: a hand-torn edge."""
    pts = []
    for i in range(len(corners)):
        (ax, ay), (bx, by) = corners[i], corners[(i + 1) % len(corners)]
        ln = math.hypot(bx - ax, by - ay)
        n = max(int(ln / step), 2)
        walk = np.cumsum(rng.normal(0, amp * 0.4, n))
        walk -= np.linspace(walk[0], walk[-1], n)
        walk = np.clip(walk, -amp, amp) + rng.normal(0, amp * 0.2, n)
        nx, ny = (by - ay) / ln, -(bx - ax) / ln
        for k in range(n):
            f = k / n
            pts.append((ax + (bx - ax) * f + nx * walk[k], ay + (by - ay) * f + ny * walk[k]))
    return pts


def rrect(cx, cy, w, h, r, ang):
    pts = []
    for qx, qy, a0 in ((w / 2 - r, -h / 2 + r, -90), (w / 2 - r, h / 2 - r, 0),
                       (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180)):
        for a in np.linspace(a0, a0 + 90, 7):
            pts.append((cx + qx + r * math.cos(math.radians(a)), cy + qy + r * math.sin(math.radians(a))))
    return rotate_pts(pts, ang, cx, cy)


# --------------------------------------------------------------- scene ---

CX, CY, HW, HU, HL = 540, 604, 398, 226, 156
IRIS_R = 174

_F = np.random.default_rng(11)


def _circ_smooth(a, r):
    k = 2 * r + 1
    a = np.convolve(np.r_[a[-r:], a, a[:r]], np.ones(k) / k, "valid")
    return (a - a.min()) / (a.max() - a.min())


FIB1, FIB2 = _circ_smooth(_F.random(900), 2), _circ_smooth(_F.random(900), 7)


def _circ_interp(arr, idx):
    n = len(arr)
    i0 = np.floor(idx)
    f = idx - i0
    i0 = i0.astype(np.int64) % n
    return arr[i0] * (1 - f) + arr[(i0 + 1) % n] * f


@lru_cache(None)
def scrap():
    """The torn cut-out the eye is printed on: outer paper, inner ink, shadow."""
    rng = np.random.default_rng(3)
    x0, y0, x1, y1 = 54, 196, 1026, 978
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    outer = [(x0 + 92, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0 + 118)]
    inner = [(x0 + 101, y0 + 10), (x1 - 10, y0 + 9), (x1 - 9, y1 - 10), (x0 + 10, y1 - 9), (x0 + 9, y0 + 128)]
    co, ci = Canvas(), Canvas()
    co.poly(rotate_pts(torn(outer, rng, 6, 5), -2.2, cx, cy))
    ci.poly(rotate_pts(torn(inner, rng, 4, 5), -2.2, cx, cy))
    out, inn = co.arr(), ci.arr()
    shadow = blur(shift(out, 13, 19), 4) * (1 - out) * 0.6
    return out, inn, shadow


def lids(blink):
    t = np.linspace(-1, 1, 181)
    tu, tl = t + 0.12 * (1 - t * t), t - 0.15 * (1 - t * t)
    x = CX + HW * t
    yu0 = CY - HU * np.clip(1 - tu * tu, 0, 1) ** 0.8
    yl = CY + HL * np.clip(1 - tl * tl, 0, 1) ** 0.9
    yu = (1 - blink) * yu0 + blink * (yl - 7 * (1 - t * t))
    return t, x, yu, yu0, yl


def draw_eye(st, K, KN, tone, rng):
    t, x, yu, yu0, yl = lids(st.blink)
    op = Canvas()
    op.poly(list(zip(x, yu)) + list(zip(x[::-1], yl[::-1])))
    open_m = op.arr()

    px, py = CX + st.look[0], CY + st.look[1]
    iris = disc(px, py, IRIS_R) * open_m
    pupil = disc(px, py, st.pupil) * open_m

    # iris fibres, collarette, limbal ring, as a black halftone tone map
    y0, y1, x0, x1 = int(py - IRIS_R - 2), int(py + IRIS_R + 3), int(px - IRIS_R - 2), int(px + IRIS_R + 3)
    dx, dy = XX[y0:y1, x0:x1] - px, YY[y0:y1, x0:x1] - py
    r, th = np.hypot(dx, dy), np.arctan2(dy, dx)
    rn = np.clip((r - st.pupil) / (IRIS_R - st.pupil), 0, 1)
    idx = (th / (2 * math.pi) % 1) * 900
    fib = _circ_interp(FIB1, idx + 30 * np.sin(rn * 2.4)) * 0.6 + _circ_interp(FIB2, idx + 60 * rn) * 0.4
    fib = smoothstep(0.3, 0.85, fib)
    it = 0.08 + 0.58 * fib * (0.4 + 0.6 * rn)
    it += 0.95 * smoothstep(0.76, 0.98, rn)
    it += 0.34 * np.exp(-((rn - 0.30 - 0.035 * np.sin(th * 13 + 1.3)) / 0.045) ** 2)
    it += 0.5 * (1 - smoothstep(0.0, 0.1, rn))
    tone[y0:y1, x0:x1] += np.clip(it, 0, 1) * iris[y0:y1, x0:x1]

    # lid shadow on the eyeball, corner shading on the white
    col_u = np.interp(XX[0], x, yu, left=np.nan, right=np.nan)
    col_l = np.interp(XX[0], x, yl, left=np.nan, right=np.nan)
    tx = np.abs((XX[0] - CX) / HW)
    below = np.nan_to_num(YY - col_u[None, :], nan=1e4)
    above = np.nan_to_num(col_l[None, :] - YY, nan=1e4)
    sh = 0.62 * np.exp(-np.clip(below, 0, None) / 36) + 0.2 * np.exp(-np.clip(above, 0, None) / 16)
    sh += 0.36 * smoothstep(0.42, 1.0, tx)[None, :] * (1 - iris)
    tone += sh * open_m

    # socket and crease shading on the skin (lands on orange)
    _, inn, _ = scrap()
    d = np.sqrt(((XX - CX) / HW) ** 2 + ((YY - CY + 12) / (HU * 1.06)) ** 2)
    skin = 0.42 * np.exp(-((d - 1.07) / 0.2) ** 2) + 0.16 * smoothstep(1.1, 2.1, d)
    crease_y = yu0 - (66 + 30 * (1 - t * t)) + st.blink * 16
    col_c = np.nan_to_num(np.interp(XX[0], x, crease_y, left=np.nan, right=np.nan), nan=-1e4)
    skin += 0.34 * np.exp(-((YY - col_c[None, :] - 13) / 11) ** 2) * ((XX[0] - CX > -HW * 0.72) & (XX[0] - CX < HW * 0.5))[None, :]
    tone += skin * (1 - open_m) * inn

    # upper lid line, with the outer "wing"
    w_u = 5 + 22 * np.exp(-((t - 0.2) / 0.62) ** 2)
    lid = np.stack([x, yu - 0.3 * w_u], 1)
    wing = bezier((x[-1] - 4, yu[-1] - 2), (x[-1] + 26, yu[-1] - 4), (x[-1] + 54, yu[-1] - 34 + 18 * st.blink), 10)
    lid = np.vstack([lid[4:], wing[1:]])
    lw = np.r_[w_u[4:], np.linspace(w_u[-1], 1.6, 9)]
    K.stroke(wobble(lid, rng, 1.4), lw)

    # lower lid, broken where a hand would lift the pen
    w_l = 3.5 + 6 * np.exp(-((t - 0.25) / 0.5) ** 2)
    for a, b in ((8, 78), (86, 176)):
        seg = np.stack([x[a:b], yl[a:b] + 0.3 * w_l[a:b]], 1)
        K.stroke(wobble(seg, rng, 1.2), w_l[a:b])

    # crease
    m = (t > -0.72) & (t < 0.5)
    cw = 1.5 + 3.8 * np.sin(np.linspace(0, math.pi, m.sum()))
    K.stroke(wobble(np.stack([x[m], crease_y[m]], 1), rng, 2.0), cw)

    # inner corner (caruncle)
    ic = bezier((CX - HW + 34, CY - 8), (CX - HW - 6, CY - 2), (CX - HW + 30, CY + 16), 10)
    K.stroke(wobble(ic, rng, 0.8), np.linspace(2, 4, 10))

    # lashes: up and out when open, down when shut
    dxd, dyd = np.gradient(x), np.gradient(yu)
    nrm = np.hypot(dxd, dyd)
    tgx, tgy = dxd / nrm, dyd / nrm
    for k, tt in enumerate(np.linspace(-0.56, 0.97, 14)):
        tt += rng.normal(0, 0.012)
        j = int(np.clip((tt + 1) / 2 * 180, 0, 180))
        base = np.array([x[j], yu[j] - 0.35 * w_u[j]])
        tg = np.array([tgx[j], tgy[j]])
        up = np.array([tg[1], -tg[0]]) + 0.55 * tt * tg
        down = np.array([0.5 * tt, 1.0])
        dvec = (1 - st.blink) * up / np.linalg.norm(up) + st.blink * down / np.linalg.norm(down)
        dvec /= np.linalg.norm(dvec)
        ln = 34 + 46 * ((tt + 1) / 2) ** 1.4 + rng.normal(0, 3)
        tip = base + ln * (0.92 * dvec + 0.32 * (0.3 + tt) * tg)
        ctrl = base + dvec * ln * 0.62
        K.stroke(bezier(base, ctrl, tip, 12), np.linspace(6.5, 1.0, 12))

    dxl, dyl = np.gradient(x), np.gradient(yl)
    nl = np.hypot(dxl, dyl)
    for tt in np.linspace(0.12, 0.9, 7):
        j = int((tt + 1) / 2 * 180)
        tg = np.array([dxl[j], dyl[j]]) / nl[j]
        base = np.array([x[j], yl[j] + 4])
        dvec = np.array([-tg[1], tg[0]]) + 0.7 * tt * tg
        dvec /= np.linalg.norm(dvec)
        ln = 14 + 18 * tt + rng.normal(0, 2)
        K.stroke(bezier(base, base + dvec * ln * 0.6, base + dvec * ln + tg * ln * 0.25, 8),
                 np.linspace(3.6, 0.8, 8))

    # catchlight shaped like a phone screen: the reflection is the viewer
    q = (px + 64, py - 68)
    KN.poly(rrect(q[0], q[1], 40, 70, 9, -9))
    KN.circle(px - 56, py - 30, 8.5)
    return open_m, iris, pupil, q


# ------------------------------------------------------------ the hook ---

HOOK_X0, HOOK_W, HOOK_TOP, HOOK_GAP = 66, 812, 1032, 18
BAR_PX, BAR_PY, MAX_CAP = 26, 18, 172
TRACK = 0.012


def _clean(s):
    return s.replace("'", "\u2019")


@lru_cache(None)
def hook_layout(lines):
    """Justified stack: every line is fitted to the same width (last line sits
    reversed out of a toner bar). Returns per-word placements in 1x pixels."""
    lines = [_clean(l.strip()) for l in lines if l.strip()]
    probe = font("hook", 200)
    ratio = (probe.getbbox("H")[3] - probe.getbbox("H")[1]) / 200
    words, y, bar, line_tops = [], HOOK_TOP, None, []
    for li, line in enumerate(lines):
        last = li == len(lines) - 1 and len(lines) > 1
        target = HOOK_W - (2 * BAR_PX if last else 0)

        def width(size):
            f = font("hook", size)
            return sum(f.getlength(c) + TRACK * size for c in line) - TRACK * size

        size = 200 * target / width(200)
        size = min(size, MAX_CAP / ratio)
        cap = ratio * size
        lw = width(size)
        x = HOOK_X0 + (BAR_PX if last else 0) + (target - lw) / 2
        if last:
            y += BAR_PY
            bar = (HOOK_X0, y - BAR_PY, HOOK_X0 + HOOK_W, y + cap + BAR_PY)
        line_tops.append(y)
        f = font("hook", size)
        for wd in line.split(" "):
            words.append(dict(text=wd, size=size, x=x, y=y, cap=cap, last=last, seed=len(words) * 13 + 5))
            x += sum(f.getlength(c) + TRACK * size for c in wd) + f.getlength(" ") * 0.92
        y += cap + HOOK_GAP + (BAR_PY if last else 0)
    return words, bar, line_tops


@lru_cache(maxsize=512)
def word_img(text, size, seed, boil):
    """Each letter is placed by hand: its own tilt and baseline, plus a little
    boil every drawing so the type is alive without being wobbly."""
    f = font("hook", round(size * SS))
    _, top, _, bot = f.getbbox("H")
    cap = bot - top
    m = int(cap * 0.3) + 8
    advs = [f.getlength(c) for c in text]
    track = TRACK * size * SS
    img = Image.new("L", (int(sum(advs) + track * len(text) + 2 * m), int(cap + 2 * m)), 0)
    rng, brng = np.random.default_rng(seed), np.random.default_rng(seed * 7919 + boil)
    xc = m
    for c, adv in zip(text, advs):
        g = Image.new("L", (int(adv + 2 * m), img.height), 0)
        ImageDraw.Draw(g).text((m, m - top), c, font=f, fill=255)
        ang = rng.normal(0, 1.4) + brng.normal(0, 0.3)
        g = g.rotate(ang, resample=Image.BICUBIC, center=(m + adv / 2, m + cap / 2))
        jx = rng.normal(0, 0.012 * cap) + brng.normal(0, 0.5 * SS)
        jy = rng.normal(0, 0.02 * cap) + brng.normal(0, 0.5 * SS)
        img.paste(255, (int(xc - m + jx), int(jy)), g)
        xc += adv + track
    return img, m


def draw_hook(st, KT, O, lines):
    words, bar, _ = hook_layout(lines)
    scales = st.words if st.words is not None else [1.0] * len(words)
    bar_on = any(s > 0 for w, s in zip(words, scales) if w["last"])
    if bar and bar_on:
        rng = np.random.default_rng(9)
        x0, y0, x1, y1 = bar
        KT.poly(rotate_pts(torn([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], rng, 3, 5), -0.9,
                           (x0 + x1) / 2, (y0 + y1) / 2))
    for w, s in zip(words, scales):
        if s <= 0:
            continue
        img, m = word_img(w["text"], w["size"], w["seed"], st.boil % 6)
        ox, oy = w["x"] * SS - m, w["y"] * SS - m
        if abs(s - 1) > 1e-3:
            big = img.resize((int(img.width * s), int(img.height * s)), Image.BICUBIC)
            ox -= (big.width - img.width) / 2
            oy -= (big.height - img.height) / 2
            img = big
        if w["last"]:
            KT.paste(img, ox, oy, fill=0)   # reversed out of the toner bar...
            O.paste(img, ox, oy, fill=255)  # ...and filled with orange on the other plate
        else:
            KT.paste(img, ox, oy, fill=255)


def draw_note(st, K, text, q, rng):
    """Marker scribble + arrow at the catchlight. Writes on left to right."""
    if st.note <= 0 or not text:
        return
    f = font("marker", 58 * SS)
    l, t, r, b = f.getbbox(text)
    im = Image.new("L", (r - l + 40 * SS, b - t + 40 * SS), 0)
    ImageDraw.Draw(im).text((20 * SS - l, 20 * SS - t), text, font=f, fill=255)
    im = im.rotate(8 + rng.normal(0, 0.5), resample=Image.BICUBIC, expand=True)
    p_text = min(st.note / 0.62, 1.0)
    if p_text < 1:
        a = np.asarray(im).copy()
        a[:, int(a.shape[1] * p_text):] = 0
        im = Image.fromarray(a)
    nx, ny = 972 - im.width / SS, 200
    K.paste(im, nx * SS + rng.normal(0, 0.6) * SS, ny * SS + rng.normal(0, 0.6) * SS)
    p_arrow = (st.note - 0.62) / 0.38
    if p_arrow <= 0:
        return
    start = np.array([nx + 40, ny + im.height / SS - 8])
    end = np.array([q[0] + 22, q[1] - 46])
    ctrl = np.array([start[0] - 70, (start[1] + end[1]) / 2 - 10])
    path = wobble(bezier(start, ctrl, end, 30), rng, 1.6, 2)
    n = max(int(len(path) * min(p_arrow, 1)), 2)
    K.stroke(path[:n], np.linspace(5, 8, n))
    if p_arrow >= 1:
        d = path[-1] - path[-4]
        d /= np.linalg.norm(d)
        for sgn in (1, -1):
            a = math.radians(152 * sgn)
            v = np.array([d[0] * math.cos(a) - d[1] * math.sin(a), d[0] * math.sin(a) + d[1] * math.cos(a)])
            K.stroke(wobble([path[-1], path[-1] + v * 30], rng, 0.8, 1), [8, 5])


def regmark(c, x, y):
    c.d.ellipse([(x - 15) * SS, (y - 15) * SS, (x + 15) * SS, (y + 15) * SS], outline=255, width=2 * SS)
    c.d.line([(x - 24) * SS, y * SS, (x + 24) * SS, y * SS], fill=255, width=2 * SS)
    c.d.line([x * SS, (y - 24) * SS, x * SS, (y + 24) * SS], fill=255, width=2 * SS)


def draw_furniture(st, K, O, tone):
    """Print-shop furniture: slug line, registration targets, control strip.
    Registration targets print on both plates, so misregistration shows."""
    for c in (K, O):
        for x, y in ((46, 70), (W - 46, 70), (46, H - 58), (W - 46, H - 58)):
            regmark(c, x, y)
    f = font("type", 25 * SS)
    K.d.text((86 * SS, 56 * SS), "MISFEED \u2014 PLATE 01/07 \u00b7 K+O", font=f, fill=255)
    frm = f"FRM {st.frame_no:04d}"
    K.d.text(((W - 86) * SS - f.getlength(frm), 56 * SS), frm, font=f, fill=255)
    y = H - 72
    for i, (k, o) in enumerate(((1, 0), (0, 1), (1, 1))):
        x = 86 + i * 34
        if k:
            K.d.rectangle([x * SS, y * SS, (x + 28) * SS, (y + 28) * SS], fill=255)
        if o:
            O.d.rectangle([x * SS, y * SS, (x + 28) * SS, (y + 28) * SS], fill=255)
    for i, v in enumerate((0.2, 0.4, 0.6, 0.8)):
        x = 196 + i * 34
        tone[y:y + 28, x:x + 28] = np.maximum(tone[y:y + 28, x:x + 28], v)
    f2 = font("type", 22 * SS)
    K.d.text((346 * SS, (y + 3) * SS), "PRINTED, NOT GENERATED.", font=f2, fill=255)


# ------------------------------------------------------------ the press ---

@dataclass(frozen=True)
class State:
    boil: int = 7
    blink: float = 0.0
    look: tuple = (0.0, 0.0)
    pupil: float = 74.0
    words: tuple = None          # per-word stamp scale, 0 = not yet stamped
    note: float = 1.0
    slips: tuple = ()            # (y, dx, drag_rows): the page slid dx px at row y
    reg: tuple = (10, -7)        # orange plate offset
    frame_no: int = 7
    scan: float = None
    shake: tuple = (0.0, 0.0)
    zoom: float = 1.0


def key_slips(lines):
    _, bar, tops = hook_layout(lines)
    s = [(CY + 30, 34, 86), (300, 6, 0)]
    if bar:
        s.append((int(bar[1]) - 9, -16, 8))
    return tuple(sorted(s))


def apply_slips(img, slips, rng):
    """The page moves on the glass mid-scan. Every row after y is offset by dx;
    the stuck row itself gets dragged down into blue streaks."""
    for y0, dx, drag in sorted(slips):
        y0 = int(np.clip(y0, 1, H - 2))
        row = img[y0 - 1].copy()
        if dx:
            seg = img[y0:]
            bed = BED + rng.normal(0, 0.012, (seg.shape[0], abs(dx), 1)).astype(np.float32)
            moved = np.empty_like(seg)
            if dx > 0:
                moved[:, dx:], moved[:, :dx] = seg[:, :-dx], bed
                moved[:, dx:dx + 2] = np.minimum(moved[:, dx:dx + 2] * 1.08, 1)
            else:
                moved[:, :dx], moved[:, dx:] = seg[:, -dx:], bed
            img[y0:] = moved
        n = int(min(drag, H - y0))
        if n > 0:
            rows = np.arange(n)
            creep = (dx * rows / max(n, 1) + rng.normal(0, 0.8, n)).astype(int)
            band = np.stack([np.roll(row, c, axis=0) for c in creep])
            lum = band.mean(-1)
            dark = np.clip((0.9 - lum) / 0.8, 0, 1)
            fade = (1 - 0.6 * rows / n)[:, None]
            flick = (rng.random(n) < 0.12)[:, None] * 0.6
            a = np.clip((0.07 + 0.93 * dark ** 0.8 * fade) * (1 - flick), 0, 1)
            img[y0:y0 + n] = PAPER * (1 - 0.95 * a[..., None] * (1 - BLUE))
        img[y0] = np.minimum(img[y0] * 0.4 + LAMP * 0.6, 1)
    return img


def press(k, o, st, cp, rng, paper_mask=None, glitch_rng=None):
    """Lay the plates on paper, then let the machine misbehave."""
    k = np.clip(k + 0.06 * shift(k, 0, 40), 0, 1)        # drum ghost
    o = shift(o, *st.reg)
    paper = PAPER * cp.shade
    if paper_mask is not None:
        paper = paper + (SCRAP - PAPER) * paper_mask[..., None] * cp.shade
    img = paper * (1 - 0.94 * o[..., None] * (1 - ORANGE)) * (1 - 0.96 * k[..., None] * (1 - TONER))
    g, vig, band = glass()
    img = img + (PAPER - img) * band
    img = apply_slips(img, st.slips, glitch_rng or rng)
    toner = np.maximum(g, cp.dust * 0.85)[..., None]
    img = img * (1 - toner * (1 - TONER)) * vig
    img[:12] = np.where((XX[:12] < 300 - YY[:12] * 25)[..., None], BED, img[:12])  # page sits crooked
    img = img * 0.72 + blur(img, 1, 1) * 0.28
    img = img + cp.grain[..., None] * 0.013
    return np.clip(img, 0, 1)


def render(st, hook_lines, note_text):
    cp = copies()[st.boil % 3]
    rng = np.random.default_rng(1000 + st.boil)
    K, KT, O, KN = Canvas(), Canvas(), Canvas(), Canvas()
    tone = np.zeros((H, W), np.float32)

    out, inn, shadow = scrap()
    jx, jy = (rng.normal(0, 0.7, 2) if st.boil else (0, 0))
    out, inn, shadow = (shift(a, jx, jy) for a in (out, inn, shadow))
    tone += shadow

    open_m, iris, pupil, q = draw_eye(st, K, KN, tone, rng)
    draw_note(st, K, note_text, q, rng)
    draw_furniture(st, K, O, tone)
    draw_hook(st, KT, O, hook_lines)

    kn = KN.arr() * open_m
    k_eye = np.maximum(K.arr(), pupil)
    o_m = np.clip(inn * (1 - open_m) + iris + O.arr(), 0, 1)
    k = np.maximum.reduce([
        ink(k_eye, cp, spread=1, rough=0.45, starve=0.12, holes=0.12),
        ink(KT.arr(), cp, spread=2, rough=0.9, starve=0.24, holes=0.5),
        halftone(np.clip(tone, 0, 1)) * np.clip(1 - 0.3 * cp.lf, 0, 1),
    ])
    o = ink(o_m, cp, spread=1, rough=0.55, starve=0.3, holes=0.3)
    k, o = k * (1 - kn), o * (1 - kn)
    return press(k, o, st, cp, rng, paper_mask=out)


def camera(img_u8, st):
    if st.zoom == 1 and st.shake == (0, 0):
        return img_u8
    z = st.zoom
    a, c = 1 / z, (W / 2) * (1 - 1 / z) - st.shake[0] / z
    e, f = 1 / z, (H / 2) * (1 - 1 / z) - st.shake[1] / z
    im = Image.fromarray(img_u8).transform((W, H), Image.AFFINE, (a, 0, c, 0, e, f), Image.BICUBIC,
                                           fillcolor=tuple(int(v * 255) for v in BED))
    return np.asarray(im)


def scanbar(img_u8, y, below_u8):
    """The copier lamp passing over the page: new copy above, old copy below."""
    yy = np.arange(H, dtype=np.float32)[:, None, None]
    out = np.where(yy < y, img_u8, below_u8).astype(np.float32) / 255
    glow = 0.92 * np.exp(-((yy - y) / 14) ** 2) + 0.28 * np.exp(-((yy - y) / 90) ** 2) * (yy < y)
    out = out + (LAMP - out) * glow
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)


def to_u8(img):
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


# ------------------------------------------------------------ timeline ---

def state_at(f, lines):
    """Beat sheet for the 7 s loop (24 fps, drawings on twos, faults on ones).

    0.00  lamp sweeps, eye already there, page half reprinted
    0.17  hook stamps in word by word, one thud each
    1.25  the eye snaps from off-camera to you
    1.70  marker scribble writes on, arrow lands on the phone in the eye
    2.75  MISFEED: page slides, scan drags blue, pupil blows wide
    4.00  slow blink
    6.25  page twitches again, lamp sweeps, loops
    """
    words, _, _ = hook_layout(lines)
    n = len(words)
    starts = [4 + round(i * 22 / max(n - 1, 1)) + (2 if w["last"] else 0) for i, w in enumerate(words)]
    starts[-1] = max(starts[-1], 26)
    scales, shake, reg = [], [0.0, 0.0], [10, -7]
    for s in starts:
        d = f - s
        scales.append(0.0 if d < 0 else (1.18, 1.06)[d] if d < 2 else 1.0)
        if d == 0:
            shake = [np.random.default_rng(f).normal(0, 3), 9.0]
            reg = [24, -1]
        elif d == 1:
            shake = [0.0, -4.0]
    look = (-46.0, 7.0) if f < 30 else (9.0, -3.0) if f == 30 else (17.0, -6.0) if 118 <= f < 130 else (0.0, 0.0)
    pupil = 70.0
    if 66 <= f <= 72:
        pupil = 94.0
    elif f > 72:
        pupil = 70 + 24 * math.exp(-(f - 72) / 22)
    note = float(np.clip(((f - 40) // 2 * 2) / 20, 0, 1))
    blink = {96: .35, 97: .35, 98: .8, 99: .8, 100: 1, 101: 1, 102: 1, 103: 1, 104: .6, 105: .6, 106: .2, 107: .2}.get(f, 0.0)

    ks = key_slips(lines)
    main = ks[[s[0] for s in ks].index(CY + 30)][0]
    _, bar, _ = hook_layout(lines)
    l3 = int(bar[1]) - 9 if bar else 1400
    glitch = {
        66: ((main, 64, 150), (main + 260, -22, 20)),
        67: ((main - 40, -30, 70),),
        68: ((main, 86, 210), (l3, -40, 14), (420, 12, 6)),
        69: ((main + 20, 14, 40),),
        70: ((main, 48, 120), (l3, -26, 12)),
        150: ((main, 44, 120),) + ks[1:],
        151: ((main, 26, 60),) + ks[1:],
        154: ((main, 40, 104), (l3 + 120, -10, 30)),
    }
    greg = {66: (40, -12), 67: (-24, 10), 68: (30, 14), 69: (4, -20), 70: (18, -6), 150: (22, -4), 154: (-8, 6)}
    gshake = {66: (14, -6), 67: (-12, 5), 68: (10, 8), 69: (-6, -3), 70: (4, 2), 150: (6, 0), 154: (-5, 2)}
    slips = glitch.get(f, ks if f >= 71 else ())
    if f in greg:
        reg, shake = list(greg[f]), list(gshake[f])
    frame_no = f // 2 * 2
    if 66 <= f <= 70:
        frame_no = int(np.random.default_rng(f).integers(0, 9999))
    zoom = 1 + 0.035 * smoothstep(30, 150, f)
    boil = f if (66 <= f <= 70 or 150 <= f <= 155) else f // 2
    return State(boil=int(boil), blink=blink, look=look, pupil=pupil, words=tuple(scales), note=note,
                 slips=slips, reg=tuple(reg), frame_no=frame_no, shake=tuple(shake), zoom=float(zoom))


SWEEP = {162: -40, 163: 150, 164: 340, 165: 520, 166: 700, 167: 860, 0: 1010, 1: 1300, 2: 1620, 3: 1960}


def sweep_y(f):
    """Lamp position. It straddles the loop point, so frame 0 already shows
    the eye on the new copy and the whole hook still on the old one."""
    return SWEEP.get(f)


# ---------------------------------------------------------------- sound ---

SR = 48000


def _band(x, lo, hi):
    X = np.fft.rfft(x)
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    X *= smoothstep(lo * 0.7, lo, fr) * (1 - smoothstep(hi, hi * 1.4, fr))
    return np.fft.irfft(X, len(x))


def soundtrack(nframes, lines):
    rng = np.random.default_rng(8)
    n = int(nframes / FPS * SR)
    t = np.arange(n) / SR
    a = 0.016 * np.sin(2 * np.pi * 100 * t) + 0.007 * np.sin(2 * np.pi * 200 * t + .3) + 0.004 * np.sin(2 * np.pi * 300 * t)
    a += _band(rng.normal(0, 1, n), 200, 3000) * 0.012

    def add(sec, sig):
        i = int(sec * SR) % n
        j = min(len(sig), n - i)
        a[i:i + j] += sig[:j]
        a[:len(sig) - j] += sig[j:]

    def env(d, tau):
        tt = np.arange(int(d * SR)) / SR
        return tt, np.exp(-tt / tau)

    def thud(big=False):
        tt, e = env(0.45, 0.10 if big else 0.07)
        ph = 2 * np.pi * np.cumsum(48 + 70 * np.exp(-tt / 0.03)) / SR
        s = np.sin(ph) * e * (0.95 if big else 0.7)
        s += _band(rng.normal(0, 1, len(tt)), 2000, 7000) * np.exp(-tt / 0.005) * 0.45
        s += _band(rng.normal(0, 1, len(tt)), 300, 2500) * np.exp(-tt / 0.03) * 0.35
        return s

    def whoosh(d):
        tt = np.arange(int(d * SR)) / SR
        s = _band(rng.normal(0, 1, len(tt)), 600, 6000) * np.sin(np.pi * tt / d) ** 2 * 0.25
        s += np.sin(2 * np.pi * np.cumsum(400 + 1600 * tt / d) / SR) * np.sin(np.pi * tt / d) ** 2 * 0.05
        return s

    def tick():
        tt, e = env(0.03, 0.003)
        return _band(rng.normal(0, 1, len(tt)), 3000, 9000) * e * 0.35

    def scribble(d):
        tt = np.arange(int(d * SR)) / SR
        am = np.abs(np.sin(2 * np.pi * (6.5 + 2 * np.sin(tt * 9)) * tt)) ** 1.6
        return _band(rng.normal(0, 1, len(tt)), 1500, 7500) * am * 0.11

    def crunch():
        d = 0.32
        g = int(0.038 * SR)
        grain = _band(rng.normal(0, 1, g), 100, 5000) * 0.5 + np.sign(np.sin(2 * np.pi * 82 * np.arange(g) / SR)) * 0.3
        s = np.zeros(int(d * SR))
        for i in range(7):
            o = int(i * 0.044 * SR)
            s[o:o + g] += grain * (1 - i / 9)
        s = np.round(s * 6) / 6
        s = np.repeat(s[::10], 10)[:len(s)]
        tt, e = env(d, 0.12)
        s += np.sin(2 * np.pi * 38 * tt) * e * 0.8
        return s * 0.75

    words, _, _ = hook_layout(lines)
    st = [state_at(f, lines).words for f in range(nframes)]
    for i in range(len(words)):
        f0 = next(f for f in range(nframes) if st[f][i] > 0)
        add(f0 / FPS, thud(big=words[i]["last"]))
    add(162 / FPS, whoosh(0.42))
    add(30 / FPS, tick())
    add(40 / FPS, scribble(0.8))
    add(66 / FPS, crunch())
    add(96 / FPS, tick() * 0.6)
    add(106 / FPS, tick() * 0.4)
    add(150 / FPS, crunch()[: int(0.12 * SR)] * 0.5)
    add(154 / FPS, crunch()[: int(0.08 * SR)] * 0.4)
    a = a / (np.abs(a).max() + 1e-9) * 0.89
    return (a * 32767).astype(np.int16)


def write_wav(path, pcm):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ------------------------------------------------------------- outputs ---

def make_key(lines, note, path):
    st = State(slips=key_slips(lines), pupil=78.0)
    img = to_u8(render(st, lines, note))
    Image.fromarray(img).save(path, optimize=True)
    print(f"[misfeed] {path}")


def make_anim(lines, note, path, frames=LOOP):
    OUT.mkdir(exist_ok=True)
    wav = path.with_suffix(".wav")
    write_wav(wav, soundtrack(frames, lines))
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", str(wav), "-c:v", "libx264", "-preset", "slow", "-crf", "21",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest",
           "-movflags", "+faststart", str(path)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    end = camera(to_u8(render(state_at(frames - 7, lines), lines, note)), state_at(frames - 7, lines))
    cache = {}
    for f in range(frames):
        st = state_at(f, lines)
        key = st
        if key not in cache:
            cache.clear()
            cache[key] = camera(to_u8(render(st, lines, note)), st)
        fr = cache[key]
        y = sweep_y(f)
        if y is not None:
            fr = scanbar(fr, y, end)
        p.stdin.write(fr.tobytes())
        if f % 24 == 0:
            print(f"[misfeed] frame {f}/{frames}", file=sys.stderr)
    p.stdin.close()
    p.wait()
    wav.unlink(missing_ok=True)
    print(f"[misfeed] {path}")


def make_sheet(lines, note, path):
    beats = [(0, "LAMP / FRAME 0"), (13, "STAMP"), (28, "HOOK LANDS"), (60, "THAT'S YOU"),
             (68, "MISFEED"), (100, "BLINK"), (140, "HOLD")]
    beats = [(f, f"{f / FPS:.2f}  {lbl}") for f, lbl in beats]
    tw, th, pad = 300, 533, 24
    sheet = Image.new("RGB", (pad + len(beats) * (tw + pad), th + 2 * pad + 46), tuple(int(v * 255) for v in BED))
    d = ImageDraw.Draw(sheet)
    end = camera(to_u8(render(state_at(LOOP - 7, lines), lines, note)), state_at(LOOP - 7, lines))
    for i, (f, label) in enumerate(beats):
        st = state_at(f, lines)
        fr = camera(to_u8(render(st, lines, note)), st)
        if sweep_y(f) is not None:
            fr = scanbar(fr, sweep_y(f), end)
        x = pad + i * (tw + pad)
        sheet.paste(Image.fromarray(fr).resize((tw, th), Image.LANCZOS), (x, pad))
        d.text((x, th + pad + 12), label, font=font("type", 22), fill=(236, 229, 214))
    sheet.save(path, optimize=True)
    print(f"[misfeed] {path}")


# --------------------------------------------------- treat your footage ---

def plates_from_photo(rgb_u8):
    """Riso duotone separation: shadows to toner, midtones to orange."""
    a = rgb_u8.astype(np.float32) / 255
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    lo, hi = np.percentile(lum, (2, 98))
    lum = np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1)
    dark = 1 - lum
    k_tone = smoothstep(0.42, 1.0, dark)
    o_tone = smoothstep(0.08, 0.7, dark) * 0.92
    k = np.maximum(halftone(k_tone, 6.5, 45), smoothstep(0.86, 0.95, dark))
    o = halftone(o_tone, 9.0, 15)
    return k, o


def fit_cover(im):
    s = max(W / im.width, H / im.height)
    im = im.resize((math.ceil(im.width * s), math.ceil(im.height * s)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def treat_frame(rgb_u8, st):
    cp = copies()[st.boil % 3]
    rng = np.random.default_rng(500 + st.boil)
    k, o = plates_from_photo(rgb_u8)
    k = ink(k, cp, spread=0, rough=0, starve=0.18, holes=0.25)
    o = ink(o, cp, spread=0, rough=0, starve=0.3, holes=0.3)
    return to_u8(press(k, o, st, cp, rng))


TREAT_GLITCH = [((0.46, 64, 150), (0.6, -22, 20)), ((0.44, -30, 70),), ((0.46, 86, 210), (0.74, -40, 14)),
                ((0.47, 14, 40),), ((0.46, 48, 120),)]


def treat(src, out_path, glitches):
    src = Path(src)
    if src.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"):
        rgb_u8 = np.asarray(fit_cover(Image.open(src).convert("RGB")))
        st = State(slips=((int(H * 0.46), 34, 86), (int(H * 0.74), -16, 8)))
        Image.fromarray(treat_frame(rgb_u8, st)).save(out_path)
        print(f"[misfeed] {out_path}")
        return
    vf = f"fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}"
    rd = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", str(src), "-vf", vf, "-f", "rawvideo",
                           "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    wr = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", str(src), "-map", "0:v",
                           "-map", "1:a?", "-c:v", "libx264", "-preset", "slow", "-crf", "21",
                           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest",
                           "-movflags", "+faststart", str(out_path)], stdin=subprocess.PIPE)
    gframes = {}
    for g in glitches:
        for i, sl in enumerate(TREAT_GLITCH):
            gframes[int(round(g * FPS)) + i] = tuple((int(H * y), dx, dr) for y, dx, dr in sl)
    f, held = 0, None
    while True:
        buf = rd.stdout.read(W * H * 3)
        if len(buf) < W * H * 3:
            break
        if f in gframes:
            st = State(boil=f, slips=gframes[f], reg=(int(np.random.default_rng(f).integers(-30, 30)), 8))
            fr = treat_frame(np.frombuffer(buf, np.uint8).reshape(H, W, 3), st)
        elif f % 2 == 0 or held is None:   # on twos: a new print every other frame
            held = treat_frame(np.frombuffer(buf, np.uint8).reshape(H, W, 3), State(boil=f // 2))
            fr = held
        else:
            fr = held
        wr.stdin.write(fr.tobytes())
        f += 1
    wr.stdin.close()
    wr.wait()
    rd.wait()
    print(f"[misfeed] {out_path}  ({f} frames)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("what", choices=["key", "anim", "sheet", "all", "treat"])
    ap.add_argument("src", nargs="?", help="image or video for 'treat'")
    ap.add_argument("--hook", default="YOU WEREN'T|SUPPOSED TO|SEE THIS.")
    ap.add_argument("--note", default="that's you")
    ap.add_argument("--glitch", default="0.4,3.1", help="seconds where a misfeed hits ('treat' video)")
    ap.add_argument("-o", "--out", help="output path")
    a = ap.parse_args()
    lines = tuple(l for l in a.hook.split("|") if l.strip())
    OUT.mkdir(exist_ok=True)
    if a.what == "treat":
        if not a.src:
            ap.error("treat needs an image or video path")
        ext = ".png" if Path(a.src).suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff") else ".mp4"
        treat(a.src, Path(a.out or OUT / (Path(a.src).stem + "_misfeed" + ext)),
              [float(x) for x in a.glitch.split(",") if x.strip()])
        return
    if a.what in ("key", "all"):
        make_key(lines, a.note, Path(a.out) if a.out and a.what == "key" else OUT / "misfeed_key.png")
    if a.what in ("sheet", "all"):
        make_sheet(lines, a.note, Path(a.out) if a.out and a.what == "sheet" else OUT / "misfeed_beats.png")
    if a.what in ("anim", "all"):
        make_anim(lines, a.note, Path(a.out) if a.out and a.what == "anim" else OUT / "misfeed_hook.mp4")


if __name__ == "__main__":
    main()
