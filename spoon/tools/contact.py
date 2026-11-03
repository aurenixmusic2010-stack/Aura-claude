#!/usr/bin/env python3
"""Tile rendered frames into a labelled contact sheet for review.
    python3 tools/contact.py <dir> <out.png> [cols] [thumb_w]"""
import sys, os
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6
tw = int(sys.argv[4]) if len(sys.argv) > 4 else 270
files = sorted(f for f in os.listdir(d) if f.endswith('.png'))
ims = [Image.open(os.path.join(d, f)).convert('RGB') for f in files]
th = int(tw * 16 / 9)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 22)), (20, 20, 20))
dr = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(zip(files, ims)):
    x, y = (i % cols) * tw, (i // cols) * (th + 22)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 22))
    fr = int(f[:5])
    dr.text((x + 4, y + 4), f"f{fr}  {fr/30:.2f}s", fill=(255, 255, 0))
sheet.save(out)
print(out, sheet.size)
