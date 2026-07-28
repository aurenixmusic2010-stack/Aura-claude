# Runbook

Everything free is done. This is the exact sequence to fire once the Higgsfield
account has credits.

## Blocker

```
mcp__Higgsfield__balance  →  { "credits": 0, "subscription_plan_type": "free" }
```

**Checked July 28, 2026.** Phases 1, 4, 5 and 6 all cost credits, so nothing can
render. Phases T, R, 2 and 3 are complete and committed.

To unblock, call `mcp__Higgsfield__show_plans_and_credits` with
`intent: "topup"` and relay the checkout links verbatim. Credit packs come in
500 / 1,000 / 2,000 / 4,000. **This run needs the 4,000 pack** — see the estimate
below.

## Credit estimate

| Phase | Calls | Unit | Subtotal | Confidence |
|---|---|---|---|---|
| 1 — style key (`generate_image`, `nano_banana_pro`, 16:9) | 1 | ~20 | ~20 | estimate |
| 4 — clips (`generate_video`, `gemini_omni`, 10s, 720p) | 81 | **30** | **2,430** | from skill, reliable |
| 5 — voice (`generate_audio`, `seed_audio`) | 81 | ~5 | ~405 | estimate |
| 6 — subtitles (`anton`, per voiced block) | 81 | 0.05 | ~4 | from skill |
| Re-runs — off-style clips + long takes, budget 15% | — | — | ~430 | planning figure |
| | | **Total** | **≈3,300** | |

Only the 30 cr/clip figure is documented. **Before committing to the full run,
submit one `generate_video` with `get_cost: true`** and one `generate_audio` the
same way, then re-derive this table. At 81 blocks a 5-credit error per clip is a
405-credit swing.

The skill's re-run guidance is not optional padding: expect 1–2 re-voice rounds
because TTS pacing varies by 4+ seconds at the same word count, and expect some
clips to drift photoreal on first submission.

## Phase 1 — Style key (16:9, so **not** the free preset)

The default Mixed Media preset key is 9:16 and would force vertical framing. This
video is 16:9, so generate a landscape key instead:

```
generate_image
  model: "nano_banana_pro"
  aspect_ratio: "16:9"
  prompt: |
    Editorial mixed-media collage style swatch, Vox-documentary motion graphics
    aesthetic: flat warm yellow and off-white paper background with halftone dot
    texture, archival photo cutouts with rough white paper borders, torn paper
    edges and tape strips, hand-drawn black marker circles and arrows, bold flat
    color blocks in navy and coral, subtle paper grain and drop shadows.
    Abstract composition only — no characters, no objects with faces, no letters,
    no words, no numbers. Non-photorealistic, no live-action, no realism, no 3D
    render.
```

Poll to completion. **That job id is the style key.** Substitute it for
`<STYLE_KEY_JOB_ID>` in `build/prompts.json` and attach it to all 81 clips.

Inspect the key before spending 2,430 credits on clips that inherit it. If it
comes back photoreal or 3D, regenerate — a bad key poisons every downstream clip.

## Phase 4 — Clips

```sh
python3 tools/build_prompts.py     # -> build/prompts.json
```

Each entry's `video` object is the `generate_video` call, verbatim, once the style
key is substituted:

```
generate_video
  model: "gemini_omni"
  prompt: <payload.video.prompt>
  duration: 10
  resolution: "720p"
  aspect_ratio: "16:9"
  medias: [ { value: "<style key job id>", role: "image" } ]
```

Four things that will bite:

1. **Pass `aspect_ratio` explicitly on every call.** The style key alone does not
   reliably set framing — a verified run with a 9:16 key still produced 16:9
   clips. Never rely on inheritance.
2. **The server will intercept the first submission** with a
   `preset_recommendation` notice — it pattern-matches collage prompts to its
   "3D RENDER" preset. Decline it by resubmitting with `declined_preset_id` from
   the notice's `retry_literal_with`. Never accept a photoreal or 3D preset.
3. **Submit in batches**, not all 81 at once. Record every job id against its
   block number in a table you keep; re-submit only failed blocks.
4. **If a clip renders photoreal**, strengthen STYLE and NEGATIVE and re-run that
   block only. Two identical failures means the prompt is wrong, not the seed.

If `gemini_omni` is rejected, confirm the current video model id with
`models_explore(type: "video")`. Never silently switch to a photoreal model.

### Moderation watch-list

No named politicians and no close-up recognisable faces appear anywhere in these
81 prompts — every human is an anonymous paper cutout silhouette, which is both
the house style and the safest moderation posture. Two prompts to watch:

- **Block 51** — the "official document with an approval stamp" could read as a
  forged government document to a strict filter. If it fails, drop "official" and
  describe it as a plain paper form.
- **Block 62** — a coral wash sweeping over human figures who then drop out of
  frame. If flagged, re-describe the figures as plain circular tokens.

## Phase 5 — Voiceover

1. `list_voices`. Auto-pick a **deep, measured, documentary** narrator — calm
   authority, not ad-read energy. Note the exact `voice_id` **and** `voice_type`
   pair. Mismatched pairs are the single most common failure here.
2. One `generate_audio` per block, **the same voice on all 81**:

```
generate_audio
  model: "seed_audio"
  voice_type: "<from list_voices>"
  voice_id: "<from list_voices>"
  prompt: <payload.audio.prompt>
```

### Verify every take before assembling

Read `durationSec` from each completed job via `show_generations`. **Target
9.0–10.5s.**

The assembler centres short takes and speed-compresses long ones. A 7s take
starts ~1.5s late and reads as desync; a 13s take gets squeezed 30% and reads as
rushed. Neither is recoverable at assembly — fix it in the take.

Narrator voices pause ~0.7s at every period, so **punctuation drives length more
than word count does**. A choppy name-heavy line reads ~1.8 words/s while one
flowing comma-joined sentence reads ~2.5 — the same word count can differ by 4+
seconds. The script was written with this in mind, but these blocks are the most
period-dense and will run long first:

> **13, 30, 38, 50, 58, 63, 77, 81**

If a take overruns: raise `speech_rate` one notch, or shorten the line and
re-voice. A slight overrun beats a late start — prefer the overrun.

Block 81 is the kicker and sits at the 24-word ceiling deliberately. Let it run
slightly long rather than clipping the last four words.

## Phase 6 — Assemble

Automatic and mandatory. The moment all 81 clips and 81 takes are terminal,
assemble in the same run without being asked. Delivering loose clips instead of an
assembled MP4 is a failure.

**Read the finished clips' real `width`/`height` from their job records first.**
If they rendered in a different aspect than planned, the assembly must match the
clips, not the plan.

```
explainer_video
  params:
    width: 1280          # the clips' REAL width
    height: 720          # the clips' REAL height
    subtitles: { font: "anton" }
    items:
      - { video: "<clip 1 job id>",  audio: "<voice 1 job id>" }
      - { video: "<clip 2 job id>",  audio: "<voice 2 job id>" }
      …
      - { video: "<clip 81 job id>", audio: "<voice 81 job id>" }
```

All 81 items, in order. Block N's audio always lands on clip N. Blocks are fixed
10s windows, video is never stretched, so total = 81 × 10s = **810s = 13:30
exact**.

Poll to completion, then present with `job_display`.

## Failure playbook

| Symptom | Cause | Fix |
|---|---|---|
| Clip drifts off-style | key not attached, or STYLE too weak | re-attach key, tighten STYLE/NEGATIVE, rerun that block only |
| Clip is photoreal twice running | prompt is wrong, not the seed | rewrite the SCENE line — it's describing a filmed scene |
| Take > 9.5s | period-dense line | raise `speech_rate` or shorten; re-voice that block only |
| `voice_id`/`voice_type` error | `list_voices` was skipped | call it; reuse one exact pair everywhere |
| Assembly rejects an id | job not terminal yet | poll it, retry assembly with all 81 items in order |
| Status `failed`/`nsfw`, no error text | moderation | see the watch-list above; swap the image, keep the idea |
| Readable text appears in a clip | NEGATIVE line was edited | it is fixed and verbatim — restore it and rerun |

## Deliverable

One MP4, 13:30, 1280×720, burned `anton` subtitles. Plus the script and the
sources list from `06-sources.md` in the delivery message.

Offer — do not run unasked — the `youtube-seo` skill for titles, description and
tags. Draft packaging is already in `07-packaging.md`.
