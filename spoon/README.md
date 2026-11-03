# GLITCHBOX: COSMIC TOON NOIR — *The Spoon That Could Break Earth*

A 52-second vertical (1080×1920, 30 fps, H.264) animated short about neutron-star
density, with the voiceover, the "Cosmic Joke" music track and full procedural sound
design mixed in. The animation
is locked to the voiceover; every line's timing is in [`BEAT-SHEET.md`](BEAT-SHEET.md).

**Deliverables (`out/`):**

- `the-spoon-that-could-break-earth.mp4`: final film. H.264 High, 1080×1920, 30 fps,
  52.0 s, AAC 48 kHz stereo, mixed to −14 LUFS / −1 dBTP for Shorts, TikTok and Reels.
- `captions.srt`: voiceover captions, timed to the mix, for platform upload.
- `stems/voiceover.flac`, `stems/music.flac`, `stems/sfx.flac`: the edited VO, the
  ducked music bed and the sound design, as mixed, for rebalancing in an editor.
- `vo-placement.json`: where every voice line sits, its source cut and its speed.

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
src/timeline.js     the VO-locked edit: per-shot time warps (output time -> shot time)
audio/              source VO + music, and vo-edit.json (line cuts, placement, ducking)
tools/mix_audio.py  builds the soundtrack, stems and captions from audio/vo-edit.json
tools/sfx.py        procedural sound design: generators + the 132-cue timeline
tools/glitch_scan.py flags isolated one-frame outliers in a rendered sequence
tools/encode.sh     PNG sequence -> delivery MP4
tools/contact.py    contact sheets for review
fonts/              Caveat Brush, Bangers, Space Mono (SIL OFL 1.1), Permanent Marker (Apache 2.0); licences included
```

## Render it yourself

```sh
cd spoon
npm install                       # three.js
node render.js --range 0:1560 --scale 1 --workers 2 --out frames   # ~17 min on 4 CPU cores
python3 tools/mix_audio.py build/audio  # VO edit + music bed + loudness + captions
tools/encode.sh frames out/the-spoon-that-could-break-earth.mp4 build/audio/mix-normalised.wav
```

The mixer needs `ffmpeg` built with `librubberband`, plus Python with NumPy.

Quick previews: `node render.js --frames 0,57,300,1380 --scale 0.5 --out preview`.

Playwright with a Chromium build is required (`PW_PATH` can point at a Playwright
install).
