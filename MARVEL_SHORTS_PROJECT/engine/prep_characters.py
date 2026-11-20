#!/usr/bin/env python3
"""Fetch the Marvel reference art used in episode 001 and cut each figure out.

The art is Marvel's copyright, used here for fan commentary. It is fetched on
demand from Wikipedia (which hosts it under fair use) and never committed, so
the repository only holds the recipe. Output goes to
assets/characters/<name>/cutout.png (git-ignored).

    python3 MARVEL_SHORTS_PROJECT/engine/prep_characters.py

Needs: pip install "rembg[cpu]" (downloads its matting models on first run).
"""

import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CHAR = ROOT / "assets" / "characters"
UA = "MarvelShortsResearch/1.0 (fan commentary short; contact via GitHub)"
WIKI = "https://upload.wikimedia.org/wikipedia/en/"

# name -> (source file on en.wikipedia, matting model, what it is)
SOURCES = {
    "wolverine_classic": ("5/56/Wolverine_%28Marvel_Comics_character_circa_1974%29.png", None,
                          "Wolverine, classic 1974 costume (Marvel Comics)"),
    "wolverine_modern": ("d/d3/Wolverine_%28circa_2024%29.jpg", "isnet-anime",
                         "Wolverine, circa 2024 cover art (Marvel Comics)"),
    "logan_claws": ("1/1a/Wolverine_Weapon_X_Vol_1_1.jpg", "isnet-general-use",
                    "Wolverine: Weapon X vol. 1 #1 cover (Marvel Comics, 2009)"),
    "magneto": ("e/e9/Magneto_%28Marvel_Comics_character%29.jpg", "isnet-general-use",
                "Magneto (Marvel Comics)"),
}


def fetch(rel, dest):
    if dest.exists():
        return
    req = urllib.request.Request(WIKI + rel, headers={"User-Agent": UA})
    for attempt in range(5):  # Wikimedia answers bursts with 429
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                dest.write_bytes(r.read())
            time.sleep(2)
            return
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 4:
                raise
            time.sleep(10 * 2 ** attempt)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def box_dilate(m, r):
    """Max-filter a mask by r px (separable, via shifted maxima)."""
    out = m.copy()
    for ax in (0, 1):
        acc = out.copy()
        for s in range(1, r + 1):
            acc = np.maximum(acc, np.roll(out, s, ax))
            acc = np.maximum(acc, np.roll(out, -s, ax))
        out = acc
    return out


def clean_magneto(rgb, alpha):
    """The matte keeps grey sketch-work from the giant X behind him. Keep only
    what is near his saturated reds and purples (plus their black linework)."""
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / (mx + 1e-6)
    core = ((sat > 0.32) & (mx > 0.18)).astype(np.float32)
    near = box_dilate(core, 9)
    a = alpha * near
    # keep only the connected figure: break thin bridges, flood from the torso
    solid = (a > 0.5).astype(np.float32)
    eroded = 1 - box_dilate(1 - solid, 2)
    im = Image.fromarray((eroded * 255).astype(np.uint8)).copy()  # array-backed images are read-only
    h, w = solid.shape
    oy, ox = int(h * .35), int(w * .4)
    ys, xs = np.nonzero(eroded[oy:int(h * .5), ox:int(w * .7)] > 0)
    seed = (int(xs[len(xs) // 2]) + ox, int(ys[len(ys) // 2]) + oy)
    ImageDraw.floodfill(im, seed, 128)
    body = (np.asarray(im) == 128).astype(np.float32)
    return a * box_dilate(body, 3)


def main():
    from rembg import new_session, remove

    sessions = {}
    for name, (rel, model, desc) in SOURCES.items():
        d = CHAR / name
        d.mkdir(parents=True, exist_ok=True)
        src = d / ("source" + Path(rel).suffix.lower())
        fetch(rel, src)
        im = Image.open(src).convert("RGBA")
        im = im.resize((im.width * 3, im.height * 3), Image.LANCZOS)
        if model:
            sessions.setdefault(model, new_session(model))
            cut = remove(im.convert("RGB"), session=sessions[model])
            rgb = np.asarray(im.convert("RGB"), np.float32) / 255
            a = np.asarray(cut, np.float32)[..., 3] / 255
        else:  # already has a transparent background
            rgb = np.asarray(im.convert("RGB"), np.float32) / 255
            a = np.asarray(im, np.float32)[..., 3] / 255
        if name == "magneto":
            a = clean_magneto(rgb, a)
        a = smoothstep(0.35, 0.7, a)
        ys, xs = np.nonzero(a > 0.05)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        out = np.dstack([rgb, a])[y0:y1, x0:x1]
        Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(d / "cutout.png")
        (d / "SOURCE.txt").write_text(f"{desc}\nhttps://en.wikipedia.org (file {rel})\n"
                                      "Marvel copyright. Used for commentary; not redistributed.\n")
        print(f"[prep] {name}: {out.shape[1]}x{out.shape[0]}")


if __name__ == "__main__":
    main()
