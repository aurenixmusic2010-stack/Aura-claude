# Environment report

Inspected at the start of production (cloud container, 2026-11-20).

| Item | Found | Consequence |
|---|---|---|
| CPU | 4 cores | frames rendered in 4 parallel workers |
| RAM | 15 GB | fine for full-frame float compositing |
| GPU | none (`nvidia-smi` absent) | no Cycles/EEVEE GPU rendering |
| Blender | not installed | see below |
| Python | 3.13, numpy 2.5, Pillow 12.3 | the whole renderer |
| FFmpeg | 6.1.1 with libx264, AAC, libass | encoding, loudness, burned captions |
| Speech recognition | faster-whisper (installed for this job), `small.en` | word timestamps for the supplied narration |
| Matting | rembg (installed for this job), models `isnet-general-use`, `isnet-anime` | cutting the Marvel art out of its backgrounds |
| Network | Wikipedia and Hugging Face reachable; marvel.com and Fandom refuse automated requests (403) | character art fetched from Wikipedia's fair-use copies (≈260×390 each) |
| Voice | supplied ElevenLabs file (Adam), 48.4 s | used as recorded, no regeneration |
| Music | supplied "Steel & Rust Underscore", 175.8 s | edited to the script's dynamics, ducked under the voice |

## Blender

The brief names Blender as the main 3D tool. This machine has neither Blender
nor a GPU. Installing Blender and rendering 1,530 frames of Cycles on 4 CPU
cores would have taken hours for a look that is mostly 2D print anyway, so the
episode is built in a purpose-written Python 2.5D engine instead
(`engine/ep001.py`):

- every element is drawn in screen space and printed through the MISFEED press
  (`style/misfeed/misfeed.py`): halftone plates, misregistration, page slips;
- the one genuinely 3D shot (the bone cross-section in scene 3) uses a real
  perspective camera, back-face culling and painter-sorted, Lambert-shaded
  facets, orbiting over the scene;
- camera moves, easing, overshoot and parallax are frame-deterministic, so any
  frame re-renders identically (`ep001.py still 21.0`).

No `.blend` file exists for this episode, so the delivery package has no
`blender/` folder.

## Low-resolution art

Wikipedia keeps non-free images small on purpose. The cut-outs are upscaled 3×
before matting and then printed through a 5.5–7 px halftone screen, which turns
the softness into print texture instead of blur. Higher-resolution official art
would sharpen scenes 2, 4A, 4B, 5 and 6; drop it into
`assets/characters/<name>/source.*` and re-run `prep_characters.py`.
