# Marvel Shorts Studio

Animated Marvel explainers for YouTube Shorts, printed in the **MISFEED** style
(`style/misfeed`): newsprint, riso inks, misregistered plates, the page
slipping on the glass. Real Marvel characters come out of the page as die-cut
paper; the explainer graphics are drawn in code.

## Episodes

| # | Title | Runtime | Files |
|---|---|---|---|
| 001 | The Metal Slowly Killing Wolverine | 0:51 | `episodes/EPISODE_001/` |

## Layout

```
engine/
  prep_characters.py   fetch the Marvel art (Wikipedia, fair use) and cut it out with rembg
  ep001.py             the episode: scenes, camera, print press, frame renderer
  ep001_audio.py       narration chain, music edit + ducking, synthesized sound design, master
  ep001_subs.py        SRT + styled ASS captions from the narration's word timestamps
  ep001_export.py      final (captions burned in) and clean MP4s
assets/characters/     cut-outs land here (git-ignored: Marvel's art is not redistributed)
episodes/EPISODE_001/  the delivery package
build/                 frames, chunks, stills (git-ignored)
```

## Rebuild episode 001

```sh
pip install "rembg[cpu]" faster-whisper numpy pillow
python3 MARVEL_SHORTS_PROJECT/engine/prep_characters.py
python3 MARVEL_SHORTS_PROJECT/engine/ep001_audio.py narration.mp3 music.mp3
python3 MARVEL_SHORTS_PROJECT/engine/ep001_subs.py
python3 MARVEL_SHORTS_PROJECT/engine/ep001.py render        # ~15 min on 4 cores
python3 MARVEL_SHORTS_PROJECT/engine/ep001_export.py
```

Preview without rendering everything: `ep001.py still 3.4 21.0` (seconds) or
`ep001.py sheet` (one frame per beat).
