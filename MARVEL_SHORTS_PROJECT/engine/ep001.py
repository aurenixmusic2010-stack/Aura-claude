#!/usr/bin/env python3
"""EPISODE 001: THE METAL SLOWLY KILLING WOLVERINE.

A 9:16 explainer printed in the MISFEED style (style/misfeed): newsprint, riso
inks, misregistered plates, the page slipping on the glass. Real Marvel art is
die-cut and lifts off the page; the explainer graphics (X-ray skeleton, 3D bone
cross-section, tug-of-war) are drawn here, in code.

Inks carry meaning and never change it:
    toner   #121417  everything that is metal, shadow or type
    amber   #F2A33A  healing, and only healing
    green   #9BE15D  poison, and only poison
    blue    #2640FF  only inside a fault (the page slips, Magneto pulls)

    python3 MARVEL_SHORTS_PROJECT/engine/ep001.py still 3.2 9.6 21 ...   # preview frames (seconds)
    python3 MARVEL_SHORTS_PROJECT/engine/ep001.py sheet                  # one frame per beat
    python3 MARVEL_SHORTS_PROJECT/engine/ep001.py render                 # every frame -> build/video_clean.mp4
"""

import json
import math
import re
import subprocess
import sys
from functools import lru_cache
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PROJ = ROOT / "MARVEL_SHORTS_PROJECT"
EP = PROJ / "episodes" / "EPISODE_001"
BUILD = PROJ / "build"
CHAR = PROJ / "assets" / "characters"
sys.path.insert(0, str(ROOT / "style" / "misfeed"))
import misfeed as mf  # noqa: E402  (the print core: paper, halftone, slips)

W, H, FPS = mf.W, mf.H, 30
SS = mf.SS
VO_OFFSET = 0.30          # the claw is already moving before the first word
END = 51.0                # VO ends at 48.5 s; the closer holds, rings out, goes black
NF = int(END * FPS)

hexrgb = mf.hexrgb
PAPER, SCRAP = mf.PAPER, mf.SCRAP
TONER = hexrgb("#121417")
AMBER = hexrgb("#F2A33A")
GREEN = hexrgb("#9BE15D")
BLUE = mf.BLUE
LAMP = mf.LAMP
MONO = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf"
XX, YY = mf.XX, mf.YY
smooth = mf.smoothstep

# ------------------------------------------------------------- timeline ---

WORDS = json.load(open(EP / "audio" / "narration_words.json"))


def _norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


_TOK = [_norm(w["w"]) for w in WORDS]


def cue(word, n=1, end=False):
    """Video time of the n-th spoken occurrence of a word."""
    k = 0
    for i, t in enumerate(_TOK):
        if t == _norm(word):
            k += 1
            if k == n:
                return WORDS[i]["e" if end else "s"] + VO_OFFSET
    raise KeyError(f"{word} #{n}")


SCENES = [  # (name, start) — each cut sits just before the line that opens the scene
    ("hook", 0.0),
    ("context", cue("in") - 0.07),
    ("explain", cue("so") - 0.07),
    ("test1", cue("marvels") - 0.07),
    ("test2", cue("and") - 0.07),
    ("reveal", cue("so", 2) - 0.07),
    ("payoff", cue("thats") - 0.07),
    ("closer", cue("thing") - 0.32),
]


def scene_at(t):
    name, t0 = SCENES[0]
    for n, s in SCENES:
        if t >= s:
            name, t0 = n, s
    nxt = [s for n, s in SCENES if s > t0]
    return name, t - t0, (nxt[0] if nxt else END) - t0


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


def ease_io(x):
    x = min(max(x, 0.0), 1.0)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def overshoot(x, k=1.70158):
    x = min(max(x, 0.0), 1.0) - 1
    return 1 + (k + 1) * x ** 3 + k * x ** 2


def ramp(t, a, b):
    return ease((t - a) / max(b - a, 1e-6))


def lerp(a, b, x):
    return a + (b - a) * x


# ------------------------------------------------------------- plates ---

class Plates:
    """Ink coverage per plate, built back to front.

    cover(): an opaque piece of paper laid on top (clears the inks under it).
    over():  ink printed on top (riso inks are translucent; they stack)."""

    def __init__(self, flood=0.0):
        self.K = np.full((H, W), flood, np.float32)
        self.A = np.zeros((H, W), np.float32)
        self.G = np.zeros((H, W), np.float32)
        self.S = np.zeros((H, W), np.float32)
        self.slips = []
        self.lights = []      # (y, height, strength, x0, x1): copier-lamp glows
        self.reg = (8, -6)

    def cover(self, m, K=0.0, A=0.0, G=0.0, S=1.0):
        inv = 1 - m
        self.K = self.K * inv + m * K
        self.A = self.A * inv + m * A
        self.G = self.G * inv + m * G
        self.S = self.S * inv + m * S

    def over(self, plate, m):
        p = getattr(self, plate)
        p += np.clip(m, 0, 1) * (1 - p)


def ht(tone, period=7.0, angle=45.0):
    return mf.halftone(np.clip(tone, 0, 1), period, angle)


def press(P, f, cp):
    """Plates onto paper, then the machine's faults. Returns uint8 RGB."""
    rng = np.random.default_rng(9000 + f)
    lf = cp.lf
    K = np.clip(P.K * (1 - 0.16 * lf - 0.22 * cp.holes), 0, 1)
    K = np.clip(K + 0.05 * mf.shift(K, 0, 36), 0, 1)                       # drum ghost
    A = mf.shift(np.clip(P.A * (1 - 0.28 * lf - 0.3 * cp.holes), 0, 1), *P.reg)
    G = mf.shift(np.clip(P.G * (1 - 0.28 * lf - 0.3 * cp.holes), 0, 1), P.reg[0] - 3, P.reg[1] + 3)
    paper = PAPER * cp.shade + (SCRAP - PAPER) * P.S[..., None] * cp.shade
    img = paper * (1 - 0.92 * A[..., None] * (1 - AMBER))
    img *= (1 - 0.92 * G[..., None] * (1 - GREEN))
    img *= (1 - 0.95 * K[..., None] * (1 - TONER))
    g, vig, band = mf.glass()
    img = img + (PAPER - img) * band * 0.15
    if P.slips:
        img = mf.apply_slips(img, P.slips, rng)
    toner = np.maximum(g, cp.dust * 0.85)[..., None]
    img = img * (1 - toner * (1 - TONER)) * vig
    for y, hgt, s, x0, x1 in P.lights:
        prof = s * np.exp(-((YY[:, :1] - y) / hgt) ** 2)
        if x0 is not None:
            prof = prof * (smooth(x0 - 30, x0, XX[:1]) * (1 - smooth(x1, x1 + 30, XX[:1])))
        img = img + (LAMP - img) * prof[..., None]
    img = img * 0.74 + mf.blur(img, 1, 1) * 0.26
    img = img + cp.grain[..., None] * 0.013
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


# ---------------------------------------------------------- typography ---

@lru_cache(None)
def mono(size):
    return ImageFont.truetype(MONO, int(size))


def text_mask(text, size, x, y, kind="hook", anchor="mm", rot=0.0, scale=1.0, boil=0, seed=1):
    """Stamped Anton (hand-placed letters, MISFEED style) or mono, as a mask."""
    c = mf.Canvas()
    if kind == "hook":
        img, m = mf.word_img(text.replace("'", "’"), size * scale, seed, boil % 6)
        if rot:
            img = img.rotate(rot, resample=Image.BICUBIC, expand=True)
        ax = {"l": 0.0, "m": 0.5, "r": 1.0}[anchor[0]]
        c.paste(img, x * SS - img.width * ax, y * SS - img.height / 2)
    else:
        f = mono(size * SS * scale)
        c.d.text((x * SS, y * SS), text, font=f, fill=255, anchor=anchor)
    return c.arr()


def tape(P, text, x, y, size=30, inv=False, anchor="l", seed=3):
    """A label: mono type on a torn strip of toner tape (or toner on paper)."""
    f = mono(size)
    tw = f.getlength(text)
    x0 = x if anchor == "l" else x - tw / 2 - 18
    box = (x0 - 4, y - size * 0.82, x0 + tw + 36, y + size * 0.82)
    c = mf.Canvas()
    rng = np.random.default_rng(seed)
    c.poly(mf.torn([(box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3])], rng, 2.5, 5))
    strip = c.arr()
    t = text_mask(text, size, x0 + 16, y, kind="mono", anchor="lm")
    if inv:
        P.cover(strip, S=1.0)
        P.over("K", t)
    else:
        P.cover(strip, K=0.95)
        P.cover(t, K=0.0, S=0.6)


def stamp(P, text, size, x, y, t_in, t, ink="K", knock=False, rot=0.0, seed=7, boil=0):
    """A word that lands like a rubber stamp: big, then home in 3 frames."""
    if t < t_in:
        return
    d = (t - t_in) * FPS
    s = 1.22 if d < 1 else 1.07 if d < 2 else 1.0
    m = text_mask(text, size, x, y, rot=rot, scale=s, seed=seed, boil=boil)
    if knock:
        P.cover(m, K=0.0, S=0.4)
    else:
        P.over(ink, m)


# ------------------------------------------------------------ cutouts ---

@lru_cache(None)
def cutout(name):
    im = Image.open(CHAR / name / "cutout.png").convert("RGBA")
    return im


def figure(P, name, cx, by, height, f, rot=0.0, lean=0.0, breathe=0.0, border=11, shadow=1.0,
           lift=0.0, clip_y=None, tone_gain=1.0, green=None, amber=None, jag=0.0, alpha=1.0,
           hflip=False, period=6.0):
    """A die-cut character standing on the page at (cx, by=feet line).

    lift > 0 raises it off the page (bigger, longer softer shadow): that is the
    'coming out of the page' move. clip_y hides everything below a slit."""
    src = cutout(name)
    if hflip:
        src = src.transpose(Image.FLIP_LEFT_RIGHT)
    s = height / src.height * (1 + 0.06 * lift)
    w, h = int(src.width * s), int(src.height * s)
    if w < 4 or h < 4:
        return
    im = src.resize((w, h), Image.BILINEAR)
    pad = border + 40
    big = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    big.paste(im, (pad, pad))
    # pose: lean (shear about the feet), breathe (vertical stretch), tilt
    bw, bh = big.size
    a = math.radians(rot)
    sy = 1 + breathe
    fx, fy = bw / 2, bh - pad
    ca, sa = math.cos(a), math.sin(a)
    # inverse map: output (u,v) -> source (x,y)
    def inv(u, v):
        u0, v0 = u - fx, v - fy
        x1, y1 = ca * u0 + sa * v0, -sa * u0 + ca * v0
        y1 /= sy
        x1 -= lean * (-y1)
        return x1 + fx, y1 + fy
    ox, oy = inv(0, 0)
    ax_, ay_ = inv(1, 0)
    bx_, by_ = inv(0, 1)
    coeffs = (ax_ - ox, bx_ - ox, ox, ay_ - oy, by_ - oy, oy)
    big = big.transform(big.size, Image.AFFINE, coeffs, Image.BILINEAR)
    arr = np.asarray(big, np.float32) / 255
    al = arr[..., 3] * alpha
    if jag > 0:  # feral: the outline frays and tears
        n = mf.fbm(al.shape, 6, np.random.default_rng(f // 2), 2)
        al = np.clip((al - 0.5 + jag * (n - 0.5) * 1.6) * 4 + 0.5, 0, 1) * (al > 0.02)
    lum = arr[..., :3] @ np.array([0.3, 0.55, 0.15], np.float32)
    x0, y0 = int(cx - bw / 2), int(by - (bh - pad))
    # clip to frame
    sx0, sy0 = max(x0, 0), max(y0, 0)
    sx1, sy1 = min(x0 + bw, W), min(y0 + bh, H)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    sl = (slice(sy0 - y0, sy1 - y0), slice(sx0 - x0, sx1 - x0))
    al, lum = al[sl], lum[sl]
    if clip_y is not None:
        rows = np.arange(sy0, sy1)[:, None]
        al = al * (rows < clip_y)
    region = (slice(sy0, sy1), slice(sx0, sx1))
    # die-cut paper border + shadow on the page
    edge = mf.blur(al, max(border // 2, 1), 2)
    border_m = np.clip((edge - 0.04) * 6, 0, 1)
    if clip_y is not None:
        border_m = border_m * (np.arange(sy0, sy1)[:, None] < clip_y)
    if shadow > 0:
        off = int(10 + 26 * lift)
        sh = mf.blur(mf.shift(np.pad(border_m, 60), off, int(off * 1.3)), int(4 + 8 * lift), 2)[60:-60, 60:-60]
        st = sh * (1 - border_m) * 0.55 * shadow
        sub = P.K[region]
        sub += _ht_box(st, sy0, sx0) * (1 - sub)
    m = border_m
    P.K[region] = P.K[region] * (1 - m)
    P.A[region] = P.A[region] * (1 - m)
    P.G[region] = P.G[region] * (1 - m)
    P.S[region] = P.S[region] * (1 - m) + m
    tone = np.clip(((1 - lum) - 0.1) / 0.78, 0, 1) ** 0.95 * tone_gain
    cov = np.maximum(_ht_box(tone, sy0, sx0, period), smooth(0.8, 0.9, 1 - lum)) * al
    P.K[region] += cov * (1 - P.K[region])
    def _part(v):  # a full-frame mask is cut to this figure's region; scalars pass through
        return v[region] if isinstance(v, np.ndarray) else v
    if green is not None:
        P.G[region] += np.clip(_part(green) * al, 0, 1) * (1 - P.G[region])
    if amber is not None:
        P.A[region] += np.clip(_part(amber) * al, 0, 1) * (1 - P.A[region])
    return (sx0, sy0, sx1, sy1), al


def _ht_box(tone, y0, x0, period=7.0, angle=45.0):
    s = mf.screen(period, angle)[y0:y0 + tone.shape[0], x0:x0 + tone.shape[1]]
    a = np.clip((tone - s) * (period / 1.3) + 0.5, 0, 1)
    a *= np.clip(tone * 25, 0, 1)
    return np.maximum(a, np.clip((tone - 0.96) * 25, 0, 1))


def torn_rect(x0, y0, x1, y1, rot=0.0, seed=1, amp=5):
    rng = np.random.default_rng(seed)
    pts = mf.torn([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], rng, amp, 5)
    return mf.rotate_pts(pts, rot, (x0 + x1) / 2, (y0 + y1) / 2)


def poly_mask(pts):
    c = mf.Canvas()
    c.poly(pts)
    return c.arr()


@lru_cache(None)
def poison_noise():
    rng = np.random.default_rng(404)
    return mf.fbm((H, W), 60, rng, 4)


def furniture(P, f, label="FILE 001 · WOLVERINE", dark=False):
    """Registration targets and the slug line: MISFEED's print-shop furniture."""
    c = mf.Canvas()
    for x, y in ((46, 70), (W - 46, 70)):
        mf.regmark(c, x, y)
    f_ = mono(24 * SS)
    c.d.text((86 * SS, 58 * SS), "MISFEED — " + label, font=f_, fill=255)
    frm = f"FRM {f:04d}"
    c.d.text(((W - 86) * SS - f_.getlength(frm), 58 * SS), frm, font=f_, fill=255)
    m = c.arr()
    if dark:
        P.cover(m, K=0.0, S=0.0)
    else:
        P.over("K", m)
    rm = mf.Canvas()  # registration targets print on every plate, so they double up
    for x, y in ((46, 70), (W - 46, 70)):
        mf.regmark(rm, x, y)
    P.over("A", rm.arr() * 0.9)


# ------------------------------------------------------------- claws ---

def blade_geom(base, tip, width, bend=0.012):
    """Spine, half-widths and normals of a straight, slightly swept blade."""
    base, tip = np.asarray(base, float), np.asarray(tip, float)
    d = tip - base
    L = np.linalg.norm(d) + 1e-9
    u = d / L
    n = np.array([-u[1], u[0]])
    t = np.linspace(0, 1, 61)[:, None]
    spine = base + d * t + n * (np.sin(t * math.pi) * L * bend)
    wd = width * np.clip((1 - t) / 0.2, 0, 1) ** 0.85 * (1 - 0.18 * t) + 0.8
    return spine, wd[:, 0], n, L


def draw_claws(P, claws, f, rim=0.0, veins=0.0, glint=None, vein_seed=3, clip_y=None):
    """Chrome claws in print: a bevelled blade whose faces carry reflection bands,
    a white rim light on the shadow edge, a glint that runs along the blade, and
    green veins climbing from the base. claws: list of (base, tip, width)."""
    edge, tone_c, rimc, gl, vein = mf.Canvas(), mf.Canvas(), mf.Canvas(), mf.Canvas(), mf.Canvas()
    rng = np.random.default_rng(vein_seed)
    for ci, (b, tp, wd) in enumerate(claws):
        spine, ws, n, L = blade_geom(b, tp, wd)
        left = spine + n * ws[:, None] / 2
        right = spine - n * ws[:, None] / 2
        ridge = spine + n * ws[:, None] * 0.08
        edge.poly(np.vstack([left, right[::-1]]))
        tt = np.linspace(0, 1, len(spine))
        for i in range(len(spine) - 1):
            u = tt[i]
            # chrome: bright face with one dark reflection band, steel face darkening to the root
            lt = 0.06 + 0.42 * math.exp(-((u - 0.55 - 0.03 * ci) / 0.07) ** 2) + 0.12 * (1 - u)
            dt = 0.38 + 0.3 * (1 - u) + 0.2 * math.exp(-((u - 0.3) / 0.08) ** 2)
            tone_c.poly([left[i], left[i + 1], ridge[i + 1], ridge[i]], fill=int(lt * 255))
            tone_c.poly([ridge[i], ridge[i + 1], right[i + 1], right[i]], fill=int(dt * 255))
        rimc.stroke(right[4:55] + n * 2.5, np.linspace(max(wd * 0.05, 2), 1.2, 51))
        if glint is not None:
            k = int(np.clip(glint, 0, 0.92) * 60)
            seg = slice(max(k - 3, 0), min(k + 4, 61))
            gl.stroke(np.vstack([left[seg] * 0.5 + ridge[seg] * 0.5]), max(wd * 0.22, 4))
        if veins > 0:
            for _ in range(4):
                p0 = np.asarray(b, float) + n * rng.normal(0, wd * 0.16)
                path = [p0]
                ang = rng.uniform(-1, 1)
                u = (np.asarray(tp, float) - np.asarray(b, float)) / L
                for _ in range(int(22 * veins) + 1):
                    ang += rng.normal(0, 0.5)
                    path.append(path[-1] + u * L * 0.03 + n * math.sin(ang) * wd * 0.05)
                path = np.array(path)
                vein.stroke(path, np.linspace(max(wd * 0.09, 3), 1.5, len(path)))
    em = edge.arr()
    if clip_y is not None:
        em = em * (YY < clip_y)
    P.cover(em, K=0.0, S=0.8)
    P.over("K", _ht_box(tone_c.arr() * em, 0, 0, 5.5, 45))
    P.over("K", np.clip((em - mf.blur(em, 1, 1)) * 3, 0, 1) * 0.8)       # inked outline
    P.cover(rimc.arr() * em, K=0.0, S=1.0)                               # rim light
    if glint is not None:
        P.cover(gl.arr() * em * 0.95, K=0.0, S=1.0)
    if veins > 0:
        vm = vein.arr() * em
        P.over("G", vm)
        P.over("G", _ht_box(0.3 * veins * em * vein_zone(claws, veins), 0, 0, 6, 15))
    return em


def vein_zone(claws, amount):
    c = mf.Canvas()
    for b, tp, wd in claws:
        b, tp = np.asarray(b, float), np.asarray(tp, float)
        e = b + (tp - b) * amount
        c.stroke([b, e], [wd * 1.2, wd * 0.5])
    return c.arr()


# ---------------------------------------------------------- skeleton ---

# figure space: feet at y=0, top of hair at about -1000; x to the figure's left = negative
JOINTS = {
    "skull": (0, -872), "jaw": (0, -805), "neck": (0, -770), "chest": (0, -650), "spine_lo": (0, -470),
    "pelvis": (0, -430), "sh_l": (-150, -748), "sh_r": (150, -748), "el_l": (-212, -560),
    "el_r": (206, -562), "wr_l": (-240, -392), "wr_r": (226, -388), "hd_l": (-248, -330),
    "hd_r": (236, -322), "hip_l": (-82, -408), "hip_r": (82, -408), "kn_l": (-108, -205),
    "kn_r": (104, -210), "an_l": (-120, -22), "an_r": (132, -20), "ft_l": (-178, 0), "ft_r": (196, 0),
}
BONES = [("sh_l", "el_l", 17), ("el_l", "wr_l", 14), ("sh_r", "el_r", 17), ("el_r", "wr_r", 14),
         ("hip_l", "kn_l", 22), ("kn_l", "an_l", 18), ("hip_r", "kn_r", 22), ("kn_r", "an_r", 18),
         ("an_l", "ft_l", 11), ("an_r", "ft_r", 11), ("neck", "sh_l", 9), ("neck", "sh_r", 9),
         ("wr_l", "hd_l", 13), ("wr_r", "hd_r", 13)]


def pose(hunch=0.0, sag=0.0, wild=0.0):
    """Neutral hero stance, bent toward feral (hunch) or sick (sag)."""
    j = {k: np.array(v, float) for k, v in JOINTS.items()}
    upper = ["skull", "jaw", "neck", "chest", "sh_l", "sh_r", "el_l", "el_r", "wr_l", "wr_r", "hd_l", "hd_r"]
    for k in upper:  # hunch: torso folds forward and down, head juts
        y = j[k][1]
        f_ = smooth(-460, -900, y)
        j[k] += np.array([60 * f_, 70 * f_]) * hunch
    for k in ("skull", "jaw"):
        j[k] += np.array([40, 30]) * hunch
    for k in ("sh_l", "sh_r", "el_l", "el_r", "wr_l", "wr_r", "hd_l", "hd_r"):
        j[k] += np.array([0, 60]) * sag
    for k in ("wr_l", "hd_l", "wr_r", "hd_r"):
        j[k] += np.array([0, 40]) * sag + np.array([np.sign(j[k][0]) * -30, -40]) * hunch
    for k in ("skull", "jaw", "neck"):
        j[k] += np.array([18, 70]) * sag
    for k in ("kn_l", "kn_r"):
        j[k] += np.array([-40 if k == "kn_l" else 40, 30]) * (sag + hunch * 0.8)
    for k in ("hip_l", "hip_r", "pelvis", "spine_lo", "chest"):
        j[k] += np.array([0, 50]) * (sag * 0.7 + hunch * 0.6)
    if wild:
        rng = np.random.default_rng(int(wild * 1000))
        for k in j:
            j[k] += rng.normal(0, 4 * wild, 2)
    return j


class Rig:
    """Maps figure space to screen for one shot."""

    def __init__(self, fx, fy, s):
        self.fx, self.fy, self.s = fx, fy, s

    def __call__(self, p):
        return (self.fx + p[0] * self.s, self.fy + p[1] * self.s)


def skeleton_masks(j, rig, claw=0.0, boil=0, rib=True):
    """Bone mask, a highlight mask (for chrome), body silhouette mask."""
    rng = np.random.default_rng(100 + boil)
    bone, spec, body = mf.Canvas(), mf.Canvas(), mf.Canvas()
    s = rig.s

    def P_(k):
        return rig(j[k])

    # --- soft tissue silhouette (X-ray glow) with the hair 'wings'
    for a, b, r in BONES:
        body.stroke([P_(a), P_(b)], (r * 2.6 + 26) * s)
    tor = [P_("sh_l"), P_("sh_r"), rig(j["hip_r"] + (30, 0)), rig(j["hip_l"] - (30, 0))]
    body.poly(tor)
    hx, hy = P_("skull")
    body.circle(hx, hy, 92 * s)
    wing = lambda sg: [rig(j["skull"] + (sg * 40, -66)), rig(j["skull"] + (sg * 122, -104)),
                       rig(j["skull"] + (sg * 92, -28))]
    body.poly(wing(-1))
    body.poly(wing(1))
    body.stroke([P_("neck"), P_("chest")], 120 * s)
    # --- bones
    for a, b, r in BONES:
        pa, pb = P_(a), P_(b)
        bone.stroke(mf.wobble([pa, pb], rng, 0.6, 1), [r * 2 * s, r * 1.8 * s])
        bone.circle(*pa, r * 1.35 * s)
        bone.circle(*pb, r * 1.25 * s)
        d = np.subtract(pb, pa)
        nn = np.array([-d[1], d[0]]) / (np.hypot(*d) + 1e-9)
        spec.stroke([np.add(pa, nn * r * 0.45 * s), np.add(pb, nn * r * 0.45 * s)], r * 0.5 * s)
    # spine
    sp = np.array([j["neck"], j["chest"], j["spine_lo"], j["pelvis"]])
    t = np.linspace(0, 1, 13)
    for k, tt in enumerate(t):
        seg = int(min(tt * 3, 2.999))
        p = sp[seg] + (sp[seg + 1] - sp[seg]) * (tt * 3 - seg)
        x, y = rig(p)
        bone.circle(x, y, 13 * s)
    # ribs
    if rib:
        cx, cy = P_("chest")
        for k in range(6):
            yy = cy + (-70 + k * 28) * s
            wdt = (95 - abs(k - 2) * 6) * s
            for sg in (-1, 1):
                pts = mf.bezier((cx, yy), (cx + sg * wdt * 1.15, yy - 14 * s), (cx + sg * wdt * 0.9, yy + 34 * s), 10)
                bone.stroke(pts, 7 * s)
    # pelvis
    px_, py_ = P_("pelvis")
    bone.poly([(px_ - 95 * s, py_ - 30 * s), (px_ + 95 * s, py_ - 30 * s), (px_ + 70 * s, py_ + 35 * s),
               (px_, py_ + 20 * s), (px_ - 70 * s, py_ + 35 * s)])
    # skull + jaw, eye sockets knocked out later
    bone.circle(hx, hy, 62 * s)
    jx, jy = P_("jaw")
    bone.poly([(jx - 44 * s, jy - 30 * s), (jx + 44 * s, jy - 30 * s), (jx + 30 * s, jy + 16 * s), (jx - 30 * s, jy + 16 * s)])
    spec.circle(hx - 22 * s, hy - 26 * s, 16 * s)
    sock = mf.Canvas()
    for sg in (-1, 1):
        sock.circle(hx + sg * 24 * s, hy + 6 * s, 15 * s)
    sock.poly([(hx - 7 * s, hy + 30 * s), (hx + 7 * s, hy + 30 * s), (hx, hy + 44 * s)])
    # claws from the right fist: three blades
    claws = []
    if claw > 0.01:
        wr, hd = np.array(P_("wr_r")), np.array(P_("hd_r"))
        u = (hd - wr) / (np.linalg.norm(hd - wr) + 1e-9)
        nrm = np.array([-u[1], u[0]])
        for k in (-1, 0, 1):
            b = hd + nrm * k * 13 * s
            claws.append((b, b + u * 175 * s * claw + nrm * k * 8 * s, 15 * s))
    return bone.arr(), spec.arr(), body.arr(), sock.arr(), claws


def draw_skeleton(P, j, rig, f, metal=0.0, metal_y=None, claw=0.0, green=0.0, green_front=None,
                  amber_swarm=0.0, film=True, jag=0.0, metal_mask_extra=None, t=0.0, white=False):
    """The X-ray figure. metal: 0..1 how much is adamantium (or pass metal_y: the
    fill line in screen y; bones below it are metal)."""
    bone, spec, body, sock, claws = skeleton_masks(j, rig, claw, f // 2)
    if jag > 0:  # fray the outline only near the body, never across the page
        n = mf.fbm((H, W), 9, np.random.default_rng(f // 2), 2)
        near = (mf.blur(body, 10, 2) > 0.03).astype(np.float32)
        body = np.clip((mf.blur(body, 3, 1) - 0.5 + jag * (n - 0.5) * 2.2) * 5 + 0.5, 0, 1) * near
    # soft tissue glows lighter than the film
    P.cover(body * 0.85, K=0.62, S=0.0)
    if metal_y is not None:
        mm = (YY > metal_y).astype(np.float32)
        mm = mf.blur(mm, 2, 1)
    else:
        mm = np.full((H, W), float(metal), np.float32)
    if metal_mask_extra is not None:
        mm = mm * metal_mask_extra
    mbone = bone * mm
    wbone = bone * (1 - mm)
    # white bone: paper with soft shading
    P.cover(wbone, K=0.0, S=0.5)
    P.over("K", _ht_box(0.12 * wbone, 0, 0, 6, 45))
    # adamantium: chrome steel
    P.cover(mbone, K=0.0, S=0.2)
    P.over("K", _ht_box(0.5 * mbone, 0, 0, 5.5, 45))
    P.cover(spec * mm * 0.95, K=0.0, S=1.0)
    P.over("K", sock * 0.95)
    if green > 0:
        n = poison_noise()
        front = green if green_front is None else green_front
        gm = smooth(1 - front, 1 - front + 0.08, n) * bone
        P.over("G", np.maximum(_ht_box(0.85 * gm, 0, 0, 6, 15), gm * 0.6))
    if claws:
        draw_claws(P, claws, f)
    return bone, body, claws


def particles(P, pts, ink, size, alpha=1.0):
    c = mf.Canvas()
    for x, y, r in pts:
        if -20 < x < W + 20 and -20 < y < H + 20:
            c.circle(x, y, r * size)
    P.over(ink, c.arr() * alpha)


def film_scrap(P, box, rot, seed, cam=None):
    x0, y0, x1, y1 = box
    m = poly_mask(torn_rect(x0, y0, x1, y1, rot, seed, 6))
    sh = mf.blur(mf.shift(m, 14, 20), 6, 2) * (1 - m)
    P.over("K", _ht_box(sh * 0.55, 0, 0))
    P.cover(m, K=0.93, S=0.0)
    # diagnostic grid, printed as thin paper lines in the toner
    g = mf.Canvas()
    for x in range(int(x0) + 30, int(x1), 64):
        g.d.line([(x * SS, y0 * SS), (x * SS, y1 * SS)], fill=255, width=SS)
    for y in range(int(y0) + 30, int(y1), 64):
        g.d.line([(x0 * SS, y * SS), (x1 * SS, y * SS)], fill=255, width=SS)
    P.cover(g.arr() * m * 0.45, K=0.0, S=0.0)
    return m


def tape_strip(P, x, y, w, h, rot, seed):
    m = poly_mask(torn_rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2, rot, seed, 2))
    P.cover(m * 0.85, K=0.0, S=1.0)
    P.over("K", _ht_box(0.1 * m, 0, 0))


# --------------------------------------------------------------- scenes ---

HOOK_PIERCE = [(392, 1384, -9.0), (540, 1366, 0.0), (690, 1388, 8.5)]   # (x, y, lean in degrees)
HOOK_LEN = 930
HOOK_WIDTH = 104


def hook_claws(push, cam_x, cam_y, zoom):
    """Three blades through the page. push 0..1: how far out they are."""
    out = []
    conv = lambda p: ((p[0] - cam_x) * zoom + W / 2, (p[1] - cam_y) * zoom + H / 2)
    for x, y, lean in HOOK_PIERCE:
        a = math.radians(lean)
        L = HOOK_LEN * push
        tip = (x + math.sin(a) * L, y - math.cos(a) * L)
        out.append((conv((x, y)), conv(tip), HOOK_WIDTH * zoom))
    return out


def slits(P, claws, f, below=True):
    """Ragged tears in the page where each blade came through."""
    rim, hole = mf.Canvas(), mf.Canvas()
    for i, (b, tp, wd) in enumerate(claws):
        x, y = b
        rng = np.random.default_rng(70 + i)
        pts = [(x - wd * 0.95, y - 6), (x + wd * 0.95, y - 6), (x + wd * 0.8, y + 26), (x - wd * 0.8, y + 26)]
        rim.poly(mf.torn(pts, rng, 7, 4))
        hole.poly(mf.torn([(x - wd * 0.62, y - 2), (x + wd * 0.62, y - 2), (x + wd * 0.5, y + 14), (x - wd * 0.5, y + 14)], rng, 3, 4))
    return rim.arr(), hole.arr()


def word_split(P, text, size, x, y, crack, split, t_in, t, seed=11, boil=0):
    """UNBREAKABLE knocked out of the black page, cracked and pulled apart."""
    if t < t_in:
        return
    d = (t - t_in) * FPS
    s = 1.22 if d < 1 else 1.07 if d < 2 else 1.0
    m = text_mask(text, size, x, y, scale=s, seed=seed, boil=boil)
    if split > 0:
        # the crack line: a zigzag; left half drops, right half rises
        zz = x + 30 + 26 * np.sin((YY[:, :1] - y) / 23.0) + 10 * np.sin((YY[:, :1] - y) / 7.0)
        left = (XX < zz).astype(np.float32)
        ml = mf.shift(m * left, -int(10 * split), int(26 * split))
        mr = mf.shift(m * (1 - left), int(10 * split), -int(20 * split))
        m = np.maximum(ml, mr)
    P.cover(m, K=0.0, S=0.3)
    if crack > 0:
        c = mf.Canvas()
        n = 24
        ys = np.linspace(y - size * 0.62, y - size * 0.62 + size * 1.24 * crack, n)
        xs = x + 30 + 26 * np.sin((ys - y) / 23.0) + 10 * np.sin((ys - y) / 7.0)
        c.stroke(np.stack([xs, ys], 1), np.linspace(15, 5, n))
        P.over("G", c.arr())


@lru_cache(None)
def black_page():
    """Pitch-black toner, with a little light falling where the blades are."""
    glow = np.exp(-(((XX - 540) / 560) ** 2 + ((YY - 820) / 980) ** 2))
    return _ht_box(0.97 - 0.13 * glow, 0, 0, 7, 45)


def s_hook(P, f, t, dur):
    """0:00 The metal that makes Wolverine unbreakable... is poisoning him."""
    tp = cue("poisoning")
    tu = cue("unbreakable") - 0.05
    # pitch-black page, a little light falling on the blades
    P.K[:] = black_page()
    P.S[:] = 0
    push = 0.5 + 0.5 * overshoot(ramp(t, 0.0, 0.75), 1.1) + 0.04 * ramp(t, 1.0, dur)
    k = ease_io(ramp(t, 0.15, dur))
    cam_y, zoom = lerp(560, 1010, k), lerp(1.65, 1.04, k)
    claws = hook_claws(push, 540, cam_y, zoom)
    rim, hole = slits(P, claws, f)
    P.cover(rim, K=0.0, S=1.0)                 # torn paper fibre shows white
    P.cover(hole, K=1.0, S=0.0)
    veins = ramp(t, tp - 0.1, tp + 1.1)
    glint = (t * 0.75) % 1.3 / 1.3 * 1.15
    clipy = min(c[0][1] for c in claws) + 4
    draw_claws(P, claws, f, veins=veins, glint=1 - glint if glint < 1 else None, clip_y=None)
    # the lower lip of each tear sits over the blade's root
    lip = mf.Canvas()
    for i, (b, tp_, wd) in enumerate(claws):
        x, y = b
        rng = np.random.default_rng(90 + i)
        lip.poly(mf.torn([(x - wd * 0.85, y + 4), (x + wd * 0.85, y + 4), (x + wd * 0.9, y + 80 * zoom), (x - wd * 0.9, y + 80 * zoom)], rng, 5, 4))
    lm = lip.arr()
    P.cover(lm, K=0.95, S=0.0)
    P.cover(np.clip((lm - mf.shift(lm, 0, 5)) * 3, 0, 1), K=0.0, S=1.0)
    crack = ramp(t, tp + 0.05, tp + 0.7)
    split = ramp(t, tp + 0.1, tp + 0.28) * 0.35
    word_split(P, "UNBREAKABLE", 158, W / 2, 222, crack, split, tu, t, boil=f // 2)
    if tp + 0.06 <= t < tp + 0.4:            # the page slips on "poisoning"
        kk = int((t - tp) * FPS)
        P.slips = [(int(lerp(210, 330, kk / 10)), [42, -26, 64, 18, 30, 12, 22, 8, 14, 6][kk % 10],
                    [120, 50, 160, 40, 90, 30, 60, 20, 40, 10][kk % 10])]
        P.reg = (24 - kk * 2, 8)
    elif t >= tp + 0.4:
        P.slips = [(300, 18, 26)]
    furniture(P, f, dark=True)


def s_context(P, f, t, dur):
    """0:05 In the comics, the Weapon X program bonded adamantium..."""
    t0 = SCENES[1][1]
    T = t + t0
    P.S[:] = 0
    # camera: crane up the film from the feet to the skull, then punch in on the claws
    t_bones, t_claws = cue("unbreakable", 2) - t0, cue("unbreakable", 3) - t0
    cy = lerp(1210, 700, ease_io(ramp(t, 0.3, t_bones + 0.3)))
    z = lerp(1.18, 1.18, 1)
    cx = 540
    pk = ramp(t, t_claws + 0.05, t_claws + 0.35)
    cx, cy, z = lerp(cx, 805, pk), lerp(cy, 1125, pk), lerp(z, 2.05, overshoot(ramp(t, t_claws + 0.05, t_claws + 0.4), 1.2))
    cam = lambda x, y: ((x - cx) * z + W / 2, (y - cy) * z + H / 2)
    # the film
    fx0, fy0 = cam(150, 240)
    fx1, fy1 = cam(930, 1430)
    film_scrap(P, (fx0, fy0, fx1, fy1), -1.4, 21)
    tape_strip(P, *cam(200, 250), 150 * z, 46 * z, -18, 5)
    tape_strip(P, *cam(880, 1420), 150 * z, 46 * z, -12, 6)
    rig = Rig(*cam(540, 1385), 1.08 * z)
    j = pose()
    # metal rises from the feet: "bonded adamantium to his entire skeleton"
    t_bond, t_skel = cue("bonded") - t0, cue("skeleton", end=True) - t0
    fill = ease_io(ramp(t, t_bond - 0.2, t_skel))
    feet_y, skull_y = rig(j["ft_l"])[1] + 30, rig(j["skull"])[1] - 70
    metal_y = lerp(feet_y, skull_y, fill)
    lock = t >= t_bones + 0.1
    if lock:
        metal_y = -100
    clawk = 0.0
    if t >= t_claws + 0.05:
        d = t - (t_claws + 0.05)
        clawk = -0.08 if d < 0.07 else min(1.12, 1.12 * ease_out((d - 0.07) / 0.12)) if d < 0.19 else 1 + 0.12 * math.exp(-d * 9) * math.cos(d * 60)
    draw_skeleton(P, j, rig, f, metal_y=metal_y, claw=max(clawk, 0) * 1.3)
    if 0.02 < fill < 0.999 and not lock:
        x_l, x_r = cam(260, 0)[0], cam(820, 0)[0]
        P.lights.append((metal_y, 9, 0.85, x_l, x_r))
    if lock and t < t_bones + 0.45:            # the skull locks: a flash on the cranium
        sx, sy = rig(j["skull"])
        P.lights.append((sy, 60 * z, 0.6 * (1 - (t - t_bones - 0.1) / 0.35), sx - 90 * z, sx + 90 * z))
    # tags
    tape(P, "COMICS CONTINUITY", 70, 170, 28)
    if t_bond - 0.6 < t < t_bones - 0.05:
        lx, ly = cam(560, 760)
        tape(P, "WEAPON X PROGRAM", 600, 330, 26, inv=True, seed=8)
        c = mf.Canvas()
        c.stroke(mf.bezier((700, 360), (720, 430), (lx + 40, ly - 40), 14), 3)
        c.circle(lx + 40, ly - 40, 7)
        P.over("K", c.arr())
    # the real Wolverine bursts up out of the page, bottom left, and watches
    rise = overshoot(ramp(t, 0.05, 0.55), 1.4)
    if rise > 0:
        by = lerp(2350, 1925, rise) + (1210 - cy) * 0.35  # parallax: he is nearer the camera
        breathe = 0.012 * math.sin(T * 2 * math.pi / 2.6)
        lean = 0.05 * math.sin(T * 1.3) + (0.1 if t > t_claws else 0)
        figure(P, "wolverine_classic", 250 - 640 * ease_io(pk), by, 940, f, rot=-4 + 2 * math.sin(T * 1.1), lean=lean,
               breathe=breathe, lift=0.6, clip_y=None)
    if t >= t_bones - 0.02:   # knocked out of toner tape: reads on the page and on the film
        d = (t - (t_bones - 0.02)) * FPS
        um = text_mask("UNBREAKABLE", 100, 540, 300, scale=1.22 if d < 1 else 1.07 if d < 2 else 1.0,
                       seed=31, boil=f // 2)
        P.cover(poly_mask(torn_rect(215, 248, 865, 352, 0.8, 43, 3)), K=0.94, S=0)
        P.cover(um, K=0.0, S=0.3)
    if t >= t_bones:
        word = "CLAWS." if t >= t_claws else "BONES."
        tin = t_claws if t >= t_claws else t_bones
        m = text_mask(word, 120, 540, 432, scale=1.2 if (t - tin) * FPS < 1 else 1.0, seed=41, boil=f // 2)
        bar = poly_mask(torn_rect(330, 375, 750, 490, -1.0, 44, 3))
        P.cover(bar, K=0.94, S=0)
        P.cover(m, K=0.0, S=0.3)
    furniture(P, f)


class Cam3:
    def __init__(self, az, el, dist, target=(0, 0, 0), fov=0.9, cx=W / 2, cy=H / 2):
        self.target = np.array(target, float)
        a, e = math.radians(az), math.radians(el)
        self.pos = self.target + dist * np.array([math.sin(a) * math.cos(e), math.sin(e), math.cos(a) * math.cos(e)])
        fwd = self.target - self.pos
        fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, np.array([0, 1.0, 0]))
        right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        self.R = np.stack([right, up, fwd])
        self.f = (W / 2) / math.tan(fov / 2)
        self.cx, self.cy = cx, cy

    def proj(self, p):
        q = (np.asarray(p, float) - self.pos) @ self.R.T
        z = q[..., 2]
        return np.stack([self.cx + q[..., 0] / z * self.f, self.cy - q[..., 1] / z * self.f], -1), z


def draw_tube(cam, r_out, r_in, x0, x1, kind, n=44):
    """Return a list of (depth, polygon, tone) for a hollow tube's outside and its near cap."""
    out = []
    th = np.linspace(0, 2 * math.pi, n + 1)
    L = np.array([-0.45, 0.75, 0.5])
    L /= np.linalg.norm(L)
    view = cam.pos
    for i in range(n):
        a0, a1 = th[i], th[i + 1]
        am = (a0 + a1) / 2
        nrm = np.array([0, math.cos(am), math.sin(am)])
        pc = np.array([(x0 + x1) / 2, r_out * math.cos(am), r_out * math.sin(am)])
        vd = view - pc
        if nrm @ vd <= 0:
            continue
        quad = np.array([[x0, r_out * math.cos(a0), r_out * math.sin(a0)], [x1, r_out * math.cos(a0), r_out * math.sin(a0)],
                         [x1, r_out * math.cos(a1), r_out * math.sin(a1)], [x0, r_out * math.cos(a1), r_out * math.sin(a1)]])
        p2, z = cam.proj(quad)
        lam = max(nrm @ L, 0)
        vn = abs(nrm @ (vd / np.linalg.norm(vd)))
        if kind == "metal":
            tone = 0.35 + 0.5 * (1 - vn) ** 1.2 + 0.2 * (0.5 + 0.5 * math.cos(am * 3)) * (1 - lam)
            tone = tone if lam < 0.9 else 0.04
        elif kind == "bone":
            tone = 0.02 + 0.22 * (1 - lam)
        else:
            tone = 0.1 + 0.3 * (1 - lam)
        out.append((z.mean(), p2, float(np.clip(tone, 0, 1)), kind))
    # cap at the end facing the camera (+x or -x)
    cap_x = x1 if view[0] > (x0 + x1) / 2 else x0
    ring_o = np.stack([np.full(n, cap_x), r_out * np.cos(th[:-1]), r_out * np.sin(th[:-1])], 1)
    p_o, z_o = cam.proj(ring_o)
    if r_in > 0:
        ring_i = np.stack([np.full(n, cap_x), r_in * np.cos(th[:-1]), r_in * np.sin(th[:-1])], 1)
        p_i, _ = cam.proj(ring_i)
        out.append((z_o.mean() - 1, ("annulus", p_o, p_i), {"metal": 0.6, "bone": 0.08, "tissue": 0.3}[kind], kind))
    else:
        out.append((z_o.mean() - 1, ("disc", p_o), 0.08, kind))
    return out


def s_explain(P, f, t, dur):
    """0:12 So why isn't he dead? His healing factor never clocks out..."""
    t0 = SCENES[2][1]
    P.S[:] = 0.0
    t_heal = cue("healing") - t0
    t_clock = cue("clocks") - t0
    t_every = cue("every") - t0
    # paper scrap the diagram sits on
    m = poly_mask(torn_rect(40, 300, 1040, 1380, 1.2, 77, 6))
    sh = mf.blur(mf.shift(m, 14, 20), 6, 2) * (1 - m)
    P.over("K", _ht_box(sh * 0.5, 0, 0))
    P.cover(m, S=1.0)
    # the question, stamped
    t_q = 0.05
    if t < t_heal + 0.2:
        stamp(P, "WHY ISN'T", 150, 540, 560, t_q, t, seed=51, boil=f // 2)
        stamp(P, "HE DEAD?", 200, 540, 760, t_q + 0.35, t, seed=52, boil=f // 2)
    # the cross-section: three telescoped layers, orbiting
    ex = ease_io(ramp(t, t_heal - 0.1, t_heal + 0.9))           # explode the layers apart
    alive = ramp(t, t_heal - 0.15, t_heal + 0.25)
    if alive <= 0:
        furniture(P, f)
        return
    az = lerp(-38, 24, ease_io(ramp(t, t_heal, dur)))
    el = lerp(14, 26, ease_io(ramp(t, t_heal, dur)))
    cam = Cam3(az, el, lerp(1400, 1060, alive), target=(100 * ex, 0, 0), fov=0.72, cy=870)
    faces = []
    faces += draw_tube(cam, 70, 0, -300, 320, "bone")
    faces += draw_tube(cam, 92, 70, -200 + 150 * ex, 270 + 150 * ex, "metal")
    faces += draw_tube(cam, 150, 92, -110 + 300 * ex, 200 + 300 * ex, "tissue")
    faces.sort(key=lambda q: -q[0])
    tone_c, cover_c = mf.Canvas(), mf.Canvas()
    tone_img = tone_c.im
    for z, poly, tone, kind in faces:
        if isinstance(poly, tuple):
            if poly[0] == "annulus":
                po, pi = poly[1], poly[2]
                cover_c.poly(po)
                tone_c.poly(po, fill=int(tone * 255))
                tone_c.poly(pi, fill=int({"metal": 0.1, "tissue": 0.45, "bone": 0.1}[kind] * 255))
            else:
                cover_c.poly(poly[1])
                tone_c.poly(poly[1], fill=int(0.1 * 255))
                cc = poly[1].mean(0)
                tone_c.circle(cc[0], cc[1], 18, fill=int(0.55 * 255))   # marrow
        else:
            cover_c.poly(poly)
            tone_c.poly(poly, fill=int(tone * 255))
    cov = cover_c.arr() * alive
    tone = tone_c.arr()
    P.cover(cov, S=0.6)
    P.over("K", _ht_box(tone * cov, 0, 0, 6, 45))
    # outline every part with a fine toner line
    edge = np.clip(cov - mf.blur(cov, 1, 1), 0, 1) * 3
    P.over("K", np.clip(edge, 0, 1))
    # particles: green leaks off the metal; amber swarms in and patches it
    if t > t_every - 0.6:
        rng = np.random.default_rng(5)
        n = 70
        base_x = rng.uniform(-200 + 150 * ex, 270 + 150 * ex, n)
        ang = rng.uniform(0, 2 * math.pi, n)
        ph = rng.uniform(0, 1, n)
        life = (t * 0.7 + ph) % 1
        rr = 92 + life * 70
        gp = np.stack([base_x, rr * np.cos(ang), rr * np.sin(ang)], 1)
        p2, z = cam.proj(gp)
        heal = (life > 0.55)
        greens = [(x, y, 6 * (1 - 0.4 * l)) for (x, y), l, hh in zip(p2, life, heal) if not hh]
        particles(P, greens, "G", 1.0)
        # amber arrives from outside to each green spot
        ah = np.stack([base_x + 40 * (1 - np.clip((life - 0.3) / 0.25, 0, 1)), (rr + 120 * (1 - np.clip((life - 0.3) / 0.25, 0, 1))) * np.cos(ang + 0.3),
                       (rr + 120 * (1 - np.clip((life - 0.3) / 0.25, 0, 1))) * np.sin(ang + 0.3)], 1)
        a2, _ = cam.proj(ah)
        ambers = [(x, y, 7 + 5 * (l > 0.55) * (1 - (l - 0.55) / 0.45)) for (x, y), l in zip(a2, life) if l > 0.3]
        particles(P, ambers, "A", 1.0)
    # leader-line labels
    if t > t_heal + 0.5:
        anchors = {"ADAMANTIUM": (-20 + 150 * ex * 0.55, 30, 88),
                   "BONE": (-240, 20, 68), "TISSUE": (220 + 300 * ex * 0.7, 40, 146)}
        spots = {"ADAMANTIUM": (380, 1170), "BONE": (70, 1090), "TISSUE": (640, 560)}
        for i, (name, a3) in enumerate(anchors.items()):
            if t < t_heal + 0.5 + i * 0.25:
                continue
            (ax, ay), _ = cam.proj(np.array(a3, float))
            lx, ly = spots[name]
            c = mf.Canvas()
            c.stroke([(ax, ay), (lx + 10, ly)], 3)
            c.circle(ax, ay, 7)
            P.over("K", c.arr())
            tape(P, name, lx, ly, 30, seed=60 + i)
    # legend: the colour code the whole video keeps
    if t > t_heal:
        c, cg = mf.Canvas(), mf.Canvas()
        c.circle(96, 1270, 18)
        cg.circle(96, 1324, 18)
        P.over("A", c.arr())
        P.over("G", cg.arr())
        P.over("K", text_mask("HEALING", 30, 130, 1270, kind="mono", anchor="lm"))
        P.over("K", text_mask("POISON", 30, 130, 1324, kind="mono", anchor="lm"))
    # the clock that never clocks out
    if t > t_clock - 0.2:
        cx_, cy_ = 930, 1290
        c = mf.Canvas()
        c.d.ellipse([(cx_ - 52) * SS, (cy_ - 52) * SS, (cx_ + 52) * SS, (cy_ + 52) * SS], outline=255, width=7 * SS)
        a = (t - t_clock) * 9
        c.stroke([(cx_, cy_), (cx_ + 36 * math.sin(a), cy_ - 36 * math.cos(a))], 7)
        c.stroke([(cx_, cy_), (cx_ + 24 * math.sin(a / 12), cy_ - 24 * math.cos(a / 12))], 9)
        P.over("K", c.arr())
        P.over("A", _ht_box(disc_m(cx_, cy_, 46) * 0.5, 0, 0, 6, 15))
    furniture(P, f)


def disc_m(x, y, r):
    return mf.disc(x, y, r)


def lab_layout(P, f, t, tag, source, test):
    P.S[:] = 0
    tape(P, test, 70, 170, 28)
    tape(P, source, 70, 232, 24, inv=True, seed=9)


def s_test1(P, f, t, dur):
    """0:19 Marvel's tested it. When Magneto ripped the adamantium out..."""
    t0 = SCENES[3][1]
    T = t + t0
    t_rip = cue("ripped") - t0
    t_feral = cue("feral") - t0
    t_heal = cue("healing", 2) - t0
    tilt = ease_io(ramp(t, t_heal, dur))
    cy = lerp(0, 120, tilt)
    film_scrap(P, (130, 600 - cy, 950, 1400 - cy), 1.2, 23)
    rig = Rig(540, 1370 - cy, 0.84)
    feral = ease_out(ramp(t, t_heal + 0.1, t_feral + 0.2))
    j = pose(hunch=feral, wild=feral * 0.5 + 0.001 * (f // 2 % 7))
    # Magneto rises out of a torn hole at the top of the page
    rise = ease_out(ramp(t, t_rip - 0.9, t_rip - 0.2))
    hole = poly_mask(torn_rect(150, -60, 930, 560, -1.5, 81, 10))
    ring = np.clip(mf.blur(hole, 6, 2) * 1.6 - 0.25, 0, 1) * (1 - hole)
    P.over("K", _ht_box(ring * 0.8, 0, 0))                    # the hole's shadowed rim
    P.cover(hole, K=0.0, S=1.0)                               # the page underneath shows through
    P.over("K", _ht_box(hole * (0.1 + 0.25 * (YY > 380)), 0, 0, 7, 45))
    if rise > 0:
        figure(P, "magneto", 540, lerp(1800, 1150, rise), 1150, f, rot=2 * math.sin(T * 0.9),
               lean=0.04 * math.sin(T * 1.4), breathe=0.01 * math.sin(T * 2.4), lift=0.4 + 0.4 * rise,
               clip_y=575, period=6.0)
    lip = poly_mask(torn_rect(140, 548, 940, 600, -1.5, 82, 6))   # the torn lower lip of the hole
    P.cover(lip, S=1.0)
    # the pull: metal peels off as chrome flecks streaming up to his hand
    pull = ease_io(ramp(t, t_rip, t_rip + 1.2))
    n = poison_noise()
    keep = smooth(pull, pull + 0.06, n * 0.9 + 0.05 * (YY / H))
    bone, body, claws = draw_skeleton(P, j, rig, f, metal=1.0, metal_mask_extra=keep, jag=feral * 0.8,
                                      claw=1.0 - pull)
    if 0 < pull < 1 or (t_rip - 0.2 < t < t_rip + 1.6):
        rng = np.random.default_rng(f)
        k = 120
        hx, hy = 480, lerp(650, 40, rise)
        sx = rng.uniform(320, 760, k)
        sy = rng.uniform(640, 1360, k) - cy
        prog = (t - t_rip) * 1.4 + rng.uniform(0, 0.6, k)
        prog = np.clip(prog, 0, 1) ** 1.6
        px = sx + (hx - sx) * prog + rng.normal(0, 8, k)
        py = sy + (hy - sy) * prog
        pts = [(x, y, 3 + 4 * (1 - p)) for x, y, p in zip(px, py, prog) if 0 < p < 0.98]
        particles(P, pts, "K", 1.0)
        # field lines as scanner drag (the only blue in the scene: this is the fault)
        if t_rip - 0.05 < t < t_rip + 1.4:
            kk = int((t - t_rip) * FPS)
            P.slips = [(int(lerp(560, 900, (kk % 9) / 8)), [26, -18, 40, -12, 22][kk % 5], [150, 90, 210, 70, 120][kk % 5])]
            P.reg = (30 - (kk % 5) * 12, 6)
    # healing flares out of control: amber blooms off the body, ragged
    if feral > 0:
        bloom = mf.blur(body, 14, 2)
        n2 = mf.fbm((H, W), 18, np.random.default_rng(f // 2), 2)
        flare = np.clip(bloom * 1.6 * feral - 0.25 + (n2 - 0.5) * 0.6, 0, 1)
        P.over("A", np.maximum(_ht_box(flare * 0.9, 0, 0, 7, 15), (flare > 0.7) * 1.0))
    lab_layout(P, f, t, "", "X-MEN #25 (1993)", "TEST 1 · REMOVE THE METAL")
    if t > t_feral - 0.05:
        stamp(P, "FERAL.", 150, 780, 1000 - cy, t_feral - 0.05, t, seed=71, boil=f // 2, rot=-4, knock=True)
    # the rewind snaps the metal back in (last 6 frames)
    if dur - t < 0.2:
        k = int((dur - t) * FPS)
        P.slips = [(500 + 120 * k, -50 + 20 * k, 180), (1300, 30, 40)]
        P.reg = (-30, 12)
    furniture(P, f)


def s_test2(P, f, t, dur):
    """0:24 And when the X-Men briefly lost their powers? Logan got sick."""
    t0 = SCENES[4][1]
    T = t + t0
    t_lost = cue("lost") - t0
    t_sick = cue("sick") - t0
    t_poison = cue("poisoning", 2) - t0
    t_adv = cue("advanced") - t0
    # slow push with hand-held drift, then a snap to the skull on "poisoning"
    snap = ease_out(ramp(t, t_poison, t_poison + 0.16))
    z = lerp(1.0, 1.06, ease(t / dur)) * lerp(1, 2.3, snap)
    drift = (6 * math.sin(T * 1.7), 5 * math.sin(T * 1.3 + 1))
    sag = ease_io(ramp(t, t_sick - 0.3, t_poison + 0.3))
    j = pose(sag=sag)
    rig0 = Rig(540, 1370, 0.84)
    sx, sy = rig0(j["skull"])
    fxp, fyp = lerp(540, sx, snap), lerp(960, sy, snap)
    cam = lambda x, y: ((x - fxp) * z + W / 2 + drift[0], (y - fyp) * z + H / 2 + drift[1])
    film_scrap(P, (*cam(130, 600), *cam(950, 1400)), 1.2, 23)
    rig = Rig(*cam(540, 1370), 0.84 * z)
    spread = ease_io(ramp(t, t_lost + 0.4, t_poison + 0.2))
    draw_skeleton(P, j, rig, f, metal=1.0, green=0.05 + 0.95 * spread, claw=1.0 * (1 - sag * 0.5))
    # healing swarm: amber specks around the body, going dark and sinking once powers drop
    rng = np.random.default_rng(12)
    k = 46
    bx = rng.uniform(260, 820, k)
    by = rng.uniform(640, 1370, k)
    off = ramp(t, t_lost, t_lost + 0.6)
    drop = np.clip((t - t_lost) * 260, 0, None) * rng.uniform(0.6, 1.2, k)
    pts = [(*cam(x + 6 * math.sin(T * 3 + i), y + drop[i] + 6 * math.cos(T * 2.4 + i)), 7 * z) for i, (x, y) in enumerate(zip(bx, by))]
    if off < 1:
        particles(P, pts, "A", 1.0, alpha=1 - off)
    particles(P, pts, "K", 1.0, alpha=off * 0.8)
    # the power switch: amber ON, flips OFF on "lost"
    on = t < t_lost + 0.05
    swx, swy = 860, 420
    c, ck = mf.Canvas(), mf.Canvas()
    c.poly(mf.rrect(swx, swy, 150, 70, 34, 0))
    knob_x = swx + (36 if on else -36)
    ck.circle(knob_x, swy, 28)
    P.cover(c.arr(), K=0.9 if not on else 0.0, A=1.0 if on else 0.0, S=0.5)
    P.cover(ck.arr(), K=0.0, S=1.0)
    P.over("K", text_mask("HEALING " + ("ON" if on else "OFF"), 24, swx, swy + 66, kind="mono"))
    # the real Wolverine slumps into frame, sick, green creeping up him
    if t > t_sick - 0.5:
        enter = ease_out(ramp(t, t_sick - 0.5, t_sick + 0.1))
        slump = ease_io(ramp(t, t_sick, t_poison + 0.4))
        n = poison_noise()
        gfront = ease_io(ramp(t, t_sick, t_poison + 0.6))
        gmask = smooth(1 - gfront, 1 - gfront + 0.1, n)
        figure(P, "wolverine_modern", *cam(lerp(1300, 860, enter), 1960 + 60 * slump), 900 * z, f,
               rot=-3 + 9 * slump + 1.5 * math.sin(T * 1.2), lean=-0.08 * slump, breathe=-0.05 * slump + 0.008 * math.sin(T * 3),
               lift=0.5, green=gmask * 0.75)
    lab_layout(P, f, t, "", "X-MEN #99 (2000)", "TEST 2 · REMOVE THE HEALING")
    furniture(P, f)


def s_reveal(P, f, t, dur):
    """0:30 Two powers always at war. Take away either one..."""
    t0 = SCENES[5][1]
    T = t + t0
    t_m = cue("take") - t0
    t_wild = cue("wild") - t0
    t_h = cue("take", 2) - t0
    t_kill = cue("kills") - t0
    t_war = cue("war") - t0
    pull = 0.85 + 0.15 * ease_io(ramp(t, dur - 1.6, dur))
    zc = lerp(1.0, 0.9, ease_io(ramp(t, t_kill, dur)))
    mid = 960 + 26 * math.sin(T * 5.0) * (1 if t < t_m else 0.3)    # the war: the line shakes
    # top: METAL (toner gunmetal); bottom: HEALING (amber)
    gone_metal = ease_io(ramp(t, t_m + 0.05, t_m + 0.45)) * (1 - ease(ramp(t, t_h - 0.35, t_h - 0.2)))
    drain = ease_io(ramp(t, t_h + 0.05, t_h + 0.5))
    flood_amber = gone_metal
    top = poly_mask(torn_rect(-20, -40 - 1100 * gone_metal, W + 20, mid + 8 - 1100 * gone_metal, -0.6, 91, 7))
    P.cover(np.ones((H, W), np.float32), S=0.0)
    amber_top = lerp(mid, -50, flood_amber)
    amber_bot = lerp(H + 50, H + 50, 1)
    amber_m = ((YY > amber_top) & (YY < amber_bot)).astype(np.float32)
    amber_m = amber_m * (1 - drain * (YY < lerp(mid, H + 100, drain))) if drain > 0 else amber_m
    if drain > 0:
        amber_m = ((YY > lerp(mid, H + 60, drain)) & (YY < H + 60)).astype(np.float32)
    P.over("A", amber_m)
    if drain > 0:
        green_m = ((YY > lerp(H + 60, mid - 30, ease_io(ramp(t, t_h + 0.3, t_kill + 0.2))))).astype(np.float32)
        P.over("G", green_m)
    P.cover(top, K=0.0, S=0.0)
    P.over("K", _ht_box(top * 0.62, 0, 0, 6, 45))
    if gone_metal < 0.95:
        m = text_mask("METAL", 230, 540, 330 - 1100 * gone_metal, seed=81, boil=f // 2)
        P.cover(m * top, K=0.0, S=0.2)
    if drain < 0.9:
        hm = text_mask("HEALING", 230, 540, 1250 + 900 * drain, seed=82, boil=f // 2)
        P.over("K", hm * (amber_m > 0.5))
    # the rope they pull on
    rope = mf.Canvas()
    xs = np.linspace(-40, W + 40, 60)
    ys = mid + 6 * np.sin(xs / 40 + T * 9) * (1 if t < t_m else 0.4)
    rope.stroke(np.stack([xs, ys], 1), 22)
    rm_ = rope.arr()
    P.cover(rm_, K=0.85, S=0.0)
    hatch = mf.Canvas()
    for x in range(-40, W + 40, 24):
        hatch.stroke([(x, mid - 9), (x + 14, mid + 9)], 4)
    P.cover(hatch.arr() * rm_, K=0.0, S=0.6)
    # Wolverine balancing on it; wild when the metal goes, falls when the healing goes
    wild = gone_metal
    fall = ease(ramp(t, t_kill, t_kill + 0.6))
    by = mid - 8 + 900 * fall ** 2
    figure(P, "wolverine_classic", 540 + 30 * fall, by, 420 + 60 * wild, f,
           rot=6 * math.sin(T * 3.1) * (1 - fall) + 70 * fall + 10 * wild * math.sin(T * 13),
           lean=0.06 * math.sin(T * 2.3), breathe=0.012 * math.sin(T * 4), lift=0.4 + 0.3 * wild,
           jag=0.9 * wild, amber=0.35 * wild if wild > 0 else None)
    if t >= t_kill:
        stamp(P, "KILLS HIM.", 150, 540, 1240, t_kill, t, seed=88, boil=f // 2)
    if t_m < t < t_m + 0.12 or t_h - 0.35 < t < t_h - 0.2:   # page slips: the half tears away / rewinds
        k = int(t * FPS) % 4
        P.slips = [(int(mid) - 30, [40, -30, 60, -10][k], [90, 40, 140, 30][k])]
    P.reg = (8, -6) if not (t_h - 0.35 < t < t_h - 0.2) else (-26, 10)
    # drain everything to a dusty grade for the cut to LOGAN
    fade = ramp(t, dur - 0.35, dur)
    if fade > 0:
        P.A *= 1 - fade
        P.G *= 1 - fade
        P.K *= 1 - 0.5 * fade
    if zc != 1.0:
        P.zoom = zc
    furniture(P, f)


def s_payoff(P, f, t, dur):
    """0:39 That's the Wolverine we meet in the 2017 film Logan. Older. Scarred."""
    t0 = SCENES[6][1]
    T = t + t0
    t_old = cue("older") - t0
    t_scar = cue("scarred") - t0
    t_heal = cue("healing", 5) - t0
    z = lerp(1.0, 1.14, ease_io(t / dur))
    cam = lambda x, y: ((x - 540) * z + W / 2, (y - 1000) * z + H / 2)
    P.S[:] = 0.0
    # warm, dusty page: a faint toner tint, and amber dust that drifts down and dies
    P.over("K", _ht_box(np.full((H, W), 0.08, np.float32), 0, 0, 8, 45))
    slit_y = cam(0, 1395)[1]
    rise = ease_out(ramp(t, 0.0, 0.7))
    figure(P, "logan_claws", *cam(560, lerp(2000, 1720, rise)), 1240 * z, f, rot=-1 + 0.8 * math.sin(T * 0.7),
           lean=0.03 * math.sin(T * 0.9), breathe=0.01 * math.sin(T * 2 * math.pi / 3.4), lift=0.5,
           border=12, period=5.5, clip_y=slit_y)
    lip = poly_mask(torn_rect(-20, slit_y - 8, W + 20, slit_y + 26, -0.5, 67, 5))
    P.cover(lip, S=1.0)
    P.over("K", _ht_box(mf.blur(mf.shift(lip, 0, 14), 4, 2) * (1 - lip) * 0.5, 0, 0))
    rng = np.random.default_rng(31)
    k = 60
    dx = rng.uniform(0, W, k)
    dy0 = rng.uniform(0, H, k)
    sp = rng.uniform(30, 90, k)
    life = 1 - ramp(t, 1.0, dur) * rng.uniform(0.5, 1.0, k)
    pts = [(x + 20 * math.sin(T * 0.6 + i), (y + T * s) % H, 3 + 5 * l) for i, (x, y, s, l) in enumerate(zip(dx, dy0, sp, life))]
    particles(P, pts, "A", 1.0, alpha=0.9)
    # the healing meter, stuck near 20%, flickering
    lvl = 0.2 + 0.04 * math.sin(T * 23) * (rng.random() > 0.3) - 0.08 * ramp(t, t_heal, dur)
    c = mf.Canvas()
    c.d.rectangle([90 * SS, 1290 * SS, 330 * SS, 1330 * SS], outline=255, width=4 * SS)
    P.over("K", c.arr())
    ca = mf.Canvas()
    ca.d.rectangle([96 * SS, 1296 * SS, (96 + 228 * lvl) * SS, 1324 * SS], fill=255)
    P.over("A", ca.arr())
    P.over("K", text_mask(f"HEALING {int(lvl * 100):02d}%", 26, 90, 1262, kind="mono", anchor="lm"))
    tape(P, "LOGAN (2017) · FOX FILM, NOT MCU", 70, 170, 26)
    stamp(P, "OLDER.", 120, 800, 300, t_old - 0.03, t, seed=91, boil=f // 2, rot=-5)
    stamp(P, "SCARRED.", 120, 760, 425, t_scar - 0.03, t, seed=92, boil=f // 2, rot=3)
    furniture(P, f)


def s_closer(P, f, t, dur):
    """0:45 The thing that made him unbreakable... was breaking him the whole time."""
    t0 = SCENES[7][1]
    P.K[:] = 0.93
    P.S[:] = 0
    t_unb = cue("unbreakable", 4) - t0
    t_brk = cue("breaking") - t0
    back = ease_io(ramp(t, 0, dur - 0.6))
    zoom = lerp(1.25, 0.82, back)
    P.K[:] = black_page()
    claws = hook_claws(1.04, 540, lerp(1010, 1150, back), lerp(1.04, 0.8, back))
    rim, hole = slits(P, claws, f)
    P.cover(rim, K=0.0, S=1.0)
    P.cover(hole, K=1.0, S=0.0)
    draw_claws(P, claws, f, veins=1.0)
    crack = ramp(t, t_brk - 0.1, t_brk + 1.2)
    split = ramp(t, t_brk + 0.2, dur - 0.9)
    word_split(P, "UNBREAKABLE", 158, W / 2, 222, 1.0, 0.35 + 1.4 * split, -1, t, boil=f // 2)
    if crack > 0:
        P.slips = [(300, int(18 + 40 * split), int(26 + 60 * crack))]
    # fade to black, then the mark
    black = ramp(t, dur - 1.25, dur - 0.55)
    if black > 0:
        P.K = P.K * (1 - black) + 0.95 * black
        P.S *= 1 - black
        P.slips = [] if black > 0.8 else P.slips
    if t > dur - 0.55:
        m = text_mask("MISFEED", 64, W / 2, H / 2, seed=99, boil=0)
        P.cover(m, K=0.0, S=0.3)
        P.over("A", text_mask("FILE 001", 26, W / 2, H / 2 + 70, kind="mono"))
    furniture(P, f, dark=True)


SCENE_FN = {"hook": s_hook, "context": s_context, "explain": s_explain, "test1": s_test1,
            "test2": s_test2, "reveal": s_reveal, "payoff": s_payoff, "closer": s_closer}


TRANSITIONS = {"context": ("lamp", 0.3), "closer": ("dissolve", 0.6)}


def render_scene(name, t, f):
    t0 = dict(SCENES)[name]
    nxt = [s for n, s in SCENES if s > t0]
    dur = (nxt[0] if nxt else END) - t0
    P = Plates()
    P.zoom = 1.0
    SCENE_FN[name](P, f, t - t0, dur)
    img = press(P, f, mf.copies()[(f // 2) % 3])
    if P.zoom != 1.0:
        z = P.zoom
        im = Image.fromarray(img).transform((W, H), Image.AFFINE,
                                            (1 / z, 0, W / 2 * (1 - 1 / z), 0, 1 / z, H / 2 * (1 - 1 / z)),
                                            Image.BICUBIC, fillcolor=tuple(int(v * 255) for v in PAPER))
        img = np.asarray(im)
    return img


def render_frame(f):
    t = f / FPS
    name = scene_at(t)[0]
    names = [n for n, _ in SCENES]
    for nm, (kind, span) in TRANSITIONS.items():
        b = dict(SCENES)[nm]
        if b - span / 2 <= t < b + span / 2:
            prev = names[names.index(nm) - 1]
            a = (t - (b - span / 2)) / span
            old, new = render_scene(prev, min(t, b - 1 / FPS), f), render_scene(nm, max(t, b), f)
            if kind == "lamp":   # the copier lamp passes: new print above, old print below
                return mf.scanbar(new, lerp(-60, H + 60, a), old)
            mix = ease_io(a)
            return (old * (1 - mix) + new * mix + 0.5).astype(np.uint8)
    return render_scene(name, t, f)


# ------------------------------------------------------------- outputs ---

def _worker(args):
    f0, f1, path = args
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "14",
           "-pix_fmt", "yuv420p", str(path)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(f0, f1):
        p.stdin.write(render_frame(f).tobytes())
        if f % 30 == 0:
            print(f"[ep001] frame {f}", flush=True)
    p.stdin.close()
    p.wait()
    return str(path)


def render_parts(indices, workers=4):
    """Re-render only some chunks (same chunking as render_all), then re-join."""
    step = math.ceil(NF / (workers * 3))
    jobs = [(i * step, min(i * step + step, NF), BUILD / f"part_{i:03d}.mp4") for i in indices]
    with Pool(min(workers, len(jobs))) as pool:
        pool.map(_worker, jobs)
    parts = sorted(BUILD.glob("part_*.mp4"))
    lst = BUILD / "parts.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-c", "copy", str(BUILD / "video_clean.mp4")], check=True)
    print(f"[ep001] re-rendered parts {indices}")


def render_all(workers=4):
    BUILD.mkdir(exist_ok=True)
    chunks = []
    step = math.ceil(NF / (workers * 3))
    for i, f0 in enumerate(range(0, NF, step)):
        chunks.append((f0, min(f0 + step, NF), BUILD / f"part_{i:03d}.mp4"))
    with Pool(workers) as pool:
        parts = pool.map(_worker, chunks)
    lst = BUILD / "parts.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    out = BUILD / "video_clean.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-c", "copy", str(out)], check=True)
    print(f"[ep001] {out}")


def thumbnail(path):
    """One frame that states the mystery: the unbreakable man, going green."""
    P = Plates()
    P.K[:] = black_page()
    P.S[:] = 0
    n = poison_noise()
    g = smooth(0.42, 0.52, n) * np.clip((YY - 1000) / 800, 0, 1) ** 0.7
    figure(P, "wolverine_modern", 540, 1905, 1300, 0, rot=-2, lift=0.9, border=14, green=g * 0.8,
           period=5.5, tone_gain=0.82)
    word_split(P, "UNBREAKABLE", 160, W / 2, 250, 1.0, 0.35, -1, 1.0, boil=0)
    P.slips = [(352, 22, 30)]
    tape(P, "IT'S POISONING HIM", 540, 470, 40, anchor="m")
    furniture(P, 0, dark=True)
    img = press(P, 7, mf.copies()[1])
    Image.fromarray(img).save(path)
    print(path)


def stills(times, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for s in times:
        f = int(round(float(s) * FPS))
        p = out_dir / f"f{f:04d}.png"
        Image.fromarray(render_frame(f)).save(p)
        paths.append(p)
        print(p)
    return paths


def sheet(out):
    beats = [0.05, 1.8, 3.6, 5.6, 8.0, 10.0, 11.5, 12.8, 16.5, 20.4, 21.6, 23.5, 25.8, 27.6, 28.9,
             31.0, 34.3, 37.4, 41.0, 43.5, 46.5, 50.6]
    with Pool(4) as pool:
        frames = pool.map(render_frame, [int(b * FPS) for b in beats])
    tw, th, pad = 216, 384, 10
    cols = 11
    rows = math.ceil(len(beats) / cols)
    sh = Image.new("RGB", (pad + cols * (tw + pad), pad + rows * (th + pad + 26)), (17, 16, 19))
    d = ImageDraw.Draw(sh)
    for i, (b, fr) in enumerate(zip(beats, frames)):
        x, y = pad + (i % cols) * (tw + pad), pad + (i // cols) * (th + pad + 26)
        sh.paste(Image.fromarray(fr).resize((tw, th), Image.LANCZOS), (x, y))
        d.text((x, y + th + 4), f"{b:5.2f}s  {scene_at(b)[0]}", font=mono(16), fill=(236, 229, 214))
    sh.save(out)
    print(out)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "sheet"
    if cmd == "still":
        stills(sys.argv[2:], BUILD / "stills")
    elif cmd == "sheet":
        BUILD.mkdir(exist_ok=True)
        sheet(BUILD / "sheet.jpg")
    elif cmd == "render":
        render_all()
    elif cmd == "parts":
        render_parts([int(x) for x in sys.argv[2:]])
    elif cmd == "thumb":
        thumbnail(EP / "thumbnail.png")
    elif cmd == "scenes":
        for n, s in SCENES:
            print(f"{n:8s} {s:6.2f}")
