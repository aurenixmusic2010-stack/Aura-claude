# THE APPETITE ECONOMY

Production package for a Vox-style animated explainer on what GLP-1 drugs are
doing to the American food industry.

**Runtime:** 13:30 · **Format:** 16:9 YouTube long-form · **Market:** US, 24–45 primary
**Pipeline:** `vox-motion-graphics` skill → Higgsfield MCP

---

## Status

| Phase | State |
|---|---|
| T — Topic | ✅ locked (supplied in brief) |
| R — Research / fact-check | ✅ complete — **6 corrections applied**, see `production/01-fact-check.md` |
| 2 — Script | ✅ complete — 81 blocks, `production/02-script.md` |
| 3 — Block prompts | ✅ complete — 81 prompts, `production/04-prompts.md` |
| 1 — Style key | ⛔ **blocked — 0 credits** |
| 4 — Clips | ⛔ **blocked — 0 credits** |
| 5 — Voiceover | ⛔ **blocked — 0 credits** |
| 6 — Assemble | ⛔ **blocked — 0 credits** |

The Higgsfield account is on the **free plan with 0 credits**. Every generation
phase is paid, so nothing can render yet. Everything free has been completed and
is ready to fire in one pass the moment credits land — see
`production/05-runbook.md` for the exact call sequence and cost estimate
(**≈3,300 credits** — the 4,000 pack).

## Two facts in the original brief were out of date

Both are flagged in full in `production/01-fact-check.md`. The important one:

> The brief states *"Medicare and Medicaid still don't cover these drugs for
> weight loss."* As of **July 1, 2026** this is false. The Medicare GLP-1 Bridge
> demonstration went live that day — $50/month for eligible Part D enrollees.

That claim sat under Act Four's central argument, so Act Four was rewritten. The
act's *thesis* survives intact and is arguably stronger now: coverage arrived
because access was the whole ballgame, and it arrived as a **time-limited
demonstration that expires December 31, 2027.**

## Layout

```
production/
  00-brief.md          locked creative brief — style, aspect, voice, palette, through-line
  01-fact-check.md     every claim, its source, and the 6 corrections
  02-script.md         full VO script by act, with timecodes
  03-blocks.md         the 81 × 10s block breakdown (narration + act + palette)
  04-prompts.md        81 Higgsfield video prompts (tokenised)
  05-runbook.md        exact MCP call sequence, credit estimate, failure playbook
  06-sources.md        source list for the description / fact-check trail
  07-packaging.md      titles, thumbnail, description, chapters
tools/
  build_prompts.py     expands 04-prompts.md into 81 ready-to-submit JSON payloads
```

## Rendering the prompt payloads

```sh
python3 tools/build_prompts.py            # -> build/prompts.json
python3 tools/build_prompts.py --check    # validate word counts + block coverage
```
