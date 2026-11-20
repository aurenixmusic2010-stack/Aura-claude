# Delivery report: Episode 001

## 1. Topic
The Metal Slowly Killing Wolverine: why the unbreakable skeleton is also what
hurts him. The topic, script and narration were supplied by the producer and
are used unchanged; production verified the claims (see
`research/research_report.md`).

## 2. Final title
**The Metal That's Slowly Killing Wolverine** (alternatives in `packaging.md`).

## 3. Duration
**51.0 s** (1,530 frames at 30 fps). Narration 48.4 s, offset +0.30 s; the
closer holds, rings out and ends on the same black as frame 0, so it loops.

## 4. Research sources
Marvel.com's skeleton history (primary), plus Wikipedia, CBR, Looper,
ComicBook.com, Bustle, TheWrap and Screen Rant; full list with claim labels in
`research/research_report.md`. The one uncertainty is X-Men **#98 vs #99** for
the poisoning issue; the tag follows Marvel (#99).

## 5. Assets
- Real Marvel art (fetched, cut out, git-ignored): Wolverine 1974 classic, Wolverine circa-2024 cover, Logan (*Weapon X* #1 cover), Magneto.
- Drawn in code: chrome claws, X-ray skeleton (poseable: hero, feral, sick), 3D bone cross-section, X-ray film, tug-of-war split, healing switch, meter, clock, labels, stamps.
- Audio: supplied narration and music; 33 synthesized sound-effect one-shots in `audio/sound_effects/`.
- Thumbnail: `thumbnail.png`.

## 6. Animation scenes
All seven scenes are complete and animated (no static holds):
hook · context · explanation (real 3D orbit) · test 1 (Magneto) · test 2 (sick) ·
revelation (tug-of-war) · payoff (Logan) · closer. Transitions: copier-lamp
sweep (1→2), rewind glitch (4A→4B), hard cut out of silence (4B→5), ink drain
(5→6), cross-dissolve (6→7).

## 7. Narration
Supplied ElevenLabs file (Adam), used as recorded. Word timestamps from
faster-whisper (`audio/narration_words.json`) drive every cue, cut and
caption. Chain: 75 Hz high-pass, 3:1 compression, limiter. The voice sits 10 dB
over the music in the loud sections and 16 dB over it in the quiet ones.

## 8. Editing
Music edited to the script: silent hook, low pulse from scene 2, the swell
lands on "Marvel's tested it", a dead cut on "poisoning", a hard re-entry for
scene 5, a hole before "kills him", a low-passed pad for Logan, silence for the
ring. The music is ducked under the voice (about −7 dB). Captions: 38 cues,
Anton on toner tape, with HEALING in amber and POISON in green.

## 9. Export verification
Checked with ffprobe/ffmpeg on the delivered files:

| Check | episode_001_final.mp4 | episode_001_clean.mp4 |
|---|---|---|
| Resolution / aspect | 1080×1920, 9:16 | 1080×1920, 9:16 |
| Frame rate / frames | 30 fps / 1530 | 30 fps / 1530 |
| Duration | 51.0 s | 51.0 s |
| Video | H.264 High, yuv420p, Rec.709 tagged | same |
| Audio | AAC-LC 48 kHz stereo, 192 kb/s | same |
| Loudness | −14.0 LUFS, −1.5 dBTP, LRA 4.9 | same mix |
| Black frames (blackdetect) | none | — |
| Silences > 0.8 s | none | — |
| Full decode | no errors | — |

The cut was reviewed as a contact sheet every 1.5 s and spot-checked at full
size. Three issues found in review were fixed and re-rendered: grey blotches
across the page in the feral beat, low-contrast stamps on the X-ray film, and
the cut-out covering the claws during the push-in.

## 10. Location
- `MARVEL_SHORTS_PROJECT/episodes/EPISODE_001/episode_001_final.mp4` (captions burned in; upload this)
- `MARVEL_SHORTS_PROJECT/episodes/EPISODE_001/episode_001_clean.mp4` (no captions; pair with `subtitles/subtitles.srt`)

## Not delivered, and why
- **`blender/project.blend`**: Blender and a GPU are not available on this machine; see `environment_report.md`.
- **Higher-resolution character art**: Marvel.com and Fandom refuse automated downloads, so the art is Wikipedia's small fair-use copies, printed through a halftone screen.

## Copyright
The Marvel art is used at the producer's request for fan commentary. It is
still Marvel's, and a claim or block on YouTube is possible. Swapping the four
cut-outs for original silhouettes is a one-command re-render.
