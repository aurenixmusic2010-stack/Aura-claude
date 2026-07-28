# Locked Creative Brief

## Identity

| Field | Value |
|---|---|
| Working title | **THE APPETITE ECONOMY** |
| Topic | What happens to a food industry that spent fifty years engineering appetite, when appetite becomes a prescription |
| Runtime | 13:30 (810s) |
| Block count | **81** × 10s |
| Aspect | **16:9** (1280×720) — YouTube long-form |
| Market | United States. Primary 24–45, secondary 18–24 |
| Niche | Health / science / economics crossover |
| Narration | English, documentary, faceless |
| Subtitles | ON, font `anton`, burned at assembly |

## Why 16:9 (and what it costs)

The skill defaults to 9:16 vertical using the free Mixed Media preset key. This
brief is explicitly a Vox-style YouTube long-form piece — 13:30 runtime, chapter
structure, a landscape thumbnail concept. That means 16:9, which per the skill
**cannot** use the free preset key (it would force vertical framing). Phase 1
must instead generate a custom landscape style key with `generate_image` /
`nano_banana_pro`. Budgeted in `05-runbook.md`.

`aspect_ratio: "16:9"` must still be passed explicitly on **every** clip call.
The style key alone does not reliably set framing.

## Visual system

House style: **Mixed Media collage** (`references/vox-prompts.md`). Flat editorial,
archival photo cutouts with rough white paper borders, halftone and newsprint
texture, hand-drawn marker annotations, abstract charts and maps, snappy motion
graphics. A motion-designed magazine spread — never a filmed scene.

### Locked palette

One dominant field per block, same accents throughout.

| Role | Colour | Use |
|---|---|---|
| Paper | off-white `#F4EFE6` | default ground, Act Two |
| Warm yellow | `#F2C230` | Act One — cheap calories, abundance |
| Deep navy | `#1B2A4A` | cold open, Act Two data, Act Four |
| Coral red | `#E4572E` | the accent that means *loss* — Act Three, all falling numbers |
| Marker black | `#111111` | annotations, circles, underlines |

Coral is reserved. It only appears on things that shrink, fall, or cost money.
That discipline is what makes the falling revenue block in Act Two land.

### Through-line object: **the plate**

One physical metaphor travels every block and escalates.

- **Cold open** — a bare white paper plate, empty, centre frame.
- **Act One** — it grows. Every portion beat enlarges the same plate until it
  overruns the frame edge.
- **Act Two** — it holds still for the first time while a marker line draws
  across it (the "enough" signal) and the food on it stops multiplying.
- **Act Three** — it **splits in two**: the giant aisle plate, and a small
  rectangular freezer-tray plate beside it.
- **Act Four** — the small plate sits behind a paper barrier that lifts partway,
  then is shown to be hinged (the demonstration expires).
- **Act Five** — both plates, side by side, forty feet apart, one pullback.

### The question on a prop

The skill's device is to put the question physically in the frame. Clips
**cannot contain readable text** (AI lettering garbles), so the question
*"who stays hungry?"* is carried by the narration and the burned subtitles, and
represented visually by a **black marker circle drawn around an empty plate** —
placed in block 6 and paid off in block 81.

## Pacing map

Hooks land at 0:00, 4:00, 7:00, 9:50, 12:30. No stretch runs longer than ~3
minutes without a promise of something new. Every act ends on an open loop, never
a summary.

| Blocks | Timecode | Section |
|---|---|---|
| 1–5 | 0:00–0:50 | Cold open |
| 6 | 0:50–1:00 | Title slam — THE APPETITE ECONOMY |
| 7–24 | 1:00–4:00 | **Act One** — The business of being hungry |
| 25 | 4:00–4:10 | Re-hook |
| 26–42 | 4:10–7:00 | **Act Two** — The signal |
| 43 | 7:00–7:10 | Re-hook |
| 44–59 | 7:10–9:50 | **Act Three** — The counterattack |
| 60 | 9:50–10:00 | Re-hook |
| 61–75 | 10:00–12:30 | **Act Four** — Who actually gets to stop being hungry |
| 76 | 12:30–12:40 | Re-hook |
| 77–81 | 12:40–13:30 | **Act Five** — The uncomfortable part |

## Geographic anchor

Vox anchors geographically inside the first 75 seconds. The **prescription
density map** lands in block 4 (0:30–0:40) and is the first big visual payoff.
It is paid back by the **coverage map** in Act Four (block 69), deliberately
echoing the same composition so the video closes its own loop.

## Voice

Deep, measured, documentary. Calm authority, not ad-read energy. Curious, precise,
a little wry. Short declarative sentences. Contractions throughout. The narrator is
a friend who found something strange and wants to show you — not an institution
reading a report.

Auto-picked from `list_voices` at run time; one `voice_id` / `voice_type` pair
reused on all 81 takes without exception.

## Hard rules

1. **No readable text in any clip.** No letters, numbers, captions, logos.
   Typography beats become highlight bars, redaction blocks, circles, underlines.
2. **No one speaks on screen.** The `AUDIO:` line is ambient and SFX only.
3. **Never let a number float.** Every spoken statistic is pinned to a specific
   on-screen object or chart in the same block. Spoken figures without a visual
   anchor are the fastest way to lose retention in an explainer.
4. **Coral means loss.** Never use it decoratively.
5. Numbers are **spelled out** in narration ("thirty to fifty-five billion"), never
   written as digits — the TTS reads them wrong otherwise.

## Word-count note

The original brief targeted ~2,050 words at 150 wpm. The assembler uses **fixed
10s windows**, and the skill's binding constraint is 20–24 words per block
(~8–9s spoken). 81 blocks × ~21 words = **~1,730 words**, or ~128 wpm.

The lower rate is deliberate and correct for this pipeline: it leaves the
breathing room the brief asked for at the beat pauses, and it keeps every take
inside the 9.0–10.5s target window. Writing to 150 wpm would push most takes past
the 9.5s ceiling and get them speed-compressed at assembly, which reads as rushed.
