#!/usr/bin/env python3
"""Flag isolated outlier frames (a frame that differs from both neighbours while
the neighbours match each other) — the signature of a one-frame glitch.
    python3 tools/glitch_scan.py <frames_dir> [ignore_ranges.json]"""
import os, sys, json
import numpy as np
from PIL import Image
d = sys.argv[1]
fs = sorted(f for f in os.listdir(d) if f.endswith('.png'))
def small(f):
    return np.asarray(Image.open(os.path.join(d, f)).convert('RGB').resize((54, 96), Image.BILINEAR), dtype=np.float32) / 255
ims = [small(f) for f in fs]
D = lambda a, b: float(np.mean(np.abs(a - b)))
ign = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else []
rows = []
for i in range(1, len(ims) - 1):
    t = int(fs[i][:5]) / 30
    if any(a <= t <= b for a, b in ign):
        continue
    s = D(ims[i - 1], ims[i]) + D(ims[i], ims[i + 1]) - 2 * D(ims[i - 1], ims[i + 1])
    rows.append((s, int(fs[i][:5])))
rows.sort(reverse=True)
print('top isolated-frame scores:')
for s, f in rows[:12]:
    print(f'  frame {f:5d}  t={f/30:6.2f}s  score {s:.4f}')
