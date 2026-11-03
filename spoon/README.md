# GLITCHBOX: COSMIC TOON NOIR — *The Spoon That Could Break Earth*

A 52-second vertical (1080×1920, 30 fps, H.264) animated short about neutron-star
density. Picture only: music and voiceover get added in the edit. Exact hit timings
for syncing are in [`BEAT-SHEET.md`](BEAT-SHEET.md).

**Deliverable:** `out/the-spoon-that-could-break-earth.mp4`

## How it's made

There's no stock footage, image generation or slideshow anywhere in this. Every frame
is rendered from code:

- **Real 3D, drawn like ink.** three.js scenes rendered through custom cel shaders:
  hard light bands, screen-space halftone dots in the shadows, hard rim light, banded
  cartoon chrome for the spoon, and inverted-hull ink outlines whose width "boils"
  ten times a second, like redrawn pencil lines.
- **Original characters.** Pip, the astronaut (clamshell bubble helmet, tiny body,
  noodle arms rebuilt from Bézier curves every frame, an expressive face rig with
  lids, brows, mouth shapes, sweat and dizzy eyes), and the Spoon (cartoon chrome, a
  heaped bowl of glowing neutron-star matter, and a face and arms it keeps hidden
  until it needs them).
- **Hand-made cadence.** Character animation runs "on twos" (15 fps) while cameras
  run at 30 fps.
- **A comic-page layer** drawn on top every frame: kinetic Bangers lettering with
  per-letter pop and boil, caption boxes, marker notes and arrows, focus lines, SFX
  bursts, split panels, a speech bubble, and animated pencil scratches.
- **Post:** glitch slice tears, RGB channel separation, print-style misregistration
  on the ink layer, two-tone impact frames, film grain, paper tooth and vignette.

Everything is a pure function of time, so any frame renders identically in any order.

```
index.html          page that hosts the renderer (fonts + import map)
render.js           Node + headless Chromium frame renderer (SwiftShader WebGL2)
src/main.js         renderer, multi-panel views, frame entry point
src/toon.js         cel/halftone/rim shaders, chrome, glass, boiling ink outlines, tubes
src/astronaut.js    Pip the astronaut rig
src/spoon.js        the spoon (+ face, arms, glowing matter shader)
src/star.js         neutron star, pulsar beams, field lines, progenitor star, nebula
src/env.js          baked posterised nebula sky, stars, parallax dust
src/props.js        gravity-well floor, balance scale, mountain, atom lattice, rocks, Earth
src/overlay.js      2D comic layer (lettering, captions, panels, bursts, scratches)
src/post.js         final composite shader
src/shots.js        shots 01–02 choreography
src/shots2.js       shots 03–06 choreography
src/shotkit.js      shared shot helpers
tools/encode.sh     PNG sequence -> delivery MP4
tools/contact.py    contact sheets for review
fonts/              Bangers + Space Mono (SIL OFL 1.1), Permanent Marker (Apache 2.0); licenses included
```

## Render it yourself

```sh
cd spoon
npm install                       # three.js
node render.js --range 0:1560 --scale 1 --out frames     # ~45 min on 4 CPU cores
tools/encode.sh frames out/the-spoon-that-could-break-earth.mp4
```

Quick previews: `node render.js --frames 0,57,300,1380 --scale 0.5 --out preview`.

Playwright with a Chromium build is required (`PW_PATH` can point at a Playwright
install).
