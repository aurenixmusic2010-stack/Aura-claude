#!/usr/bin/env python3
"""Expand the block table and prompt fragments into ready-to-submit payloads.

Reads production/03-blocks.md (narration, canonical) and production/04-prompts.md
(SCENE/MOTION/AUDIO), joins them on block number, splices in the constant STYLE
REFERENCE and NEGATIVE lines, and writes build/prompts.json.

    python3 tools/build_prompts.py            # write build/prompts.json
    python3 tools/build_prompts.py --check    # validate only, non-zero on failure
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOCKS_MD = ROOT / "production" / "03-blocks.md"
PROMPTS_MD = ROOT / "production" / "04-prompts.md"
OUT = ROOT / "build" / "prompts.json"

EXPECTED_BLOCKS = 81
WORD_MIN, WORD_MAX = 18, 25  # narration; skill targets 20-24, 18/25 tolerated

STYLE = (
    "STYLE REFERENCE: Match the attached style key EXACTLY — editorial "
    "mixed-media collage, archival photo cutouts with white paper borders, flat "
    "bold color fields, halftone and paper grain textures, hand-drawn marker "
    "annotations, snappy motion-graphics animation, non-photorealistic, no "
    "live-action."
)

NEGATIVE = (
    "NEGATIVE: readable text, letters, words, numbers, captions, subtitles, "
    "watermark, logo, photorealism, live-action footage, 3D render, lip-sync, "
    "talking characters, color drift."
)

# Things that must never reach a clip prompt: AI lettering garbles, and any
# digit in the narration means the TTS will read it wrong.
DIGIT_RE = re.compile(r"\d")
ROW_RE = re.compile(r"^\|\s*(\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)\|\s*$")


def parse_blocks():
    """production/03-blocks.md -> {n: {tc, act, palette, narration}}"""
    blocks = {}
    for line in BLOCKS_MD.read_text(encoding="utf-8").splitlines():
        m = ROW_RE.match(line.strip())
        if not m:
            continue
        n = int(m.group(1))
        blocks[n] = {
            "block": n,
            "timecode": m.group(2).strip(),
            "act": m.group(3).strip(),
            "palette": m.group(4).strip(),
            "narration": m.group(5).strip().rstrip("|").strip(),
        }
    return blocks


def parse_prompts():
    """production/04-prompts.md -> {n: {scene, motion, audio}}"""
    text = PROMPTS_MD.read_text(encoding="utf-8")
    prompts = {}
    # Only match "## Block N" headings, not the "## Constants" section.
    chunks = re.split(r"^## Block (\d+)\s*$", text, flags=re.MULTILINE)
    for i in range(1, len(chunks), 2):
        n = int(chunks[i])
        body = chunks[i + 1]
        parsed = {}
        for field in ("SCENE", "MOTION", "AUDIO"):
            m = re.search(
                rf"^{field}:\s*(.+?)(?=^(?:SCENE|MOTION|AUDIO):|\Z)",
                body,
                flags=re.MULTILINE | re.DOTALL,
            )
            if m:
                parsed[field.lower()] = " ".join(m.group(1).split())
        prompts[n] = parsed
    return prompts


def build(blocks, prompts):
    payloads = []
    for n in range(1, EXPECTED_BLOCKS + 1):
        b, p = blocks.get(n), prompts.get(n)
        if not b or not p:
            continue
        prompt = "\n".join(
            [
                f"Block {n}",
                STYLE,
                f"SCENE: {p.get('scene', '')}",
                f"MOTION: {p.get('motion', '')}",
                f"AUDIO: {p.get('audio', '')}",
                NEGATIVE,
            ]
        )
        payloads.append(
            {
                "block": n,
                "timecode": b["timecode"],
                "act": b["act"],
                "palette": b["palette"],
                "narration": b["narration"],
                "word_count": len(b["narration"].split()),
                "video": {
                    "model": "gemini_omni",
                    "prompt": prompt,
                    "duration": 10,
                    "resolution": "720p",
                    "aspect_ratio": "16:9",
                    "medias": [{"value": "<STYLE_KEY_JOB_ID>", "role": "image"}],
                },
                "audio": {
                    "model": "seed_audio",
                    "voice_type": "<FROM_LIST_VOICES>",
                    "voice_id": "<FROM_LIST_VOICES>",
                    "prompt": b["narration"],
                },
            }
        )
    return payloads


def check(blocks, prompts, payloads):
    errors, warnings = [], []

    missing_blocks = [n for n in range(1, EXPECTED_BLOCKS + 1) if n not in blocks]
    missing_prompts = [n for n in range(1, EXPECTED_BLOCKS + 1) if n not in prompts]
    if missing_blocks:
        errors.append(f"missing narration rows: {missing_blocks}")
    if missing_prompts:
        errors.append(f"missing prompt sections: {missing_prompts}")

    extra = sorted(set(blocks) | set(prompts) - set(range(1, EXPECTED_BLOCKS + 1)))
    extra = [n for n in extra if n > EXPECTED_BLOCKS]
    if extra:
        errors.append(f"block numbers past {EXPECTED_BLOCKS}: {extra}")

    for n, p in sorted(prompts.items()):
        for field in ("scene", "motion", "audio"):
            if not p.get(field):
                errors.append(f"block {n}: empty {field.upper()} line")
        audio = p.get("audio", "")
        if "no voice, no narration" not in audio:
            errors.append(f"block {n}: AUDIO must end 'no voice, no narration'")

    for n, b in sorted(blocks.items()):
        wc = len(b["narration"].split())
        if not (WORD_MIN <= wc <= WORD_MAX):
            warnings.append(f"block {n}: {wc} words (target {WORD_MIN}-{WORD_MAX})")
        if DIGIT_RE.search(b["narration"]):
            errors.append(f"block {n}: narration contains a digit — spell it out")

    total = len(payloads) * 10
    print(f"blocks:   {len(payloads)}/{EXPECTED_BLOCKS}")
    print(f"runtime:  {total // 60}:{total % 60:02d} ({total}s)")
    if payloads:
        counts = [p["word_count"] for p in payloads]
        print(f"words:    {sum(counts)} total, {sum(counts) / len(counts):.1f} avg/block")
        print(f"          min {min(counts)}, max {max(counts)}")
        wpm = sum(counts) / (total / 60)
        print(f"rate:     {wpm:.0f} wpm")

    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")

    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
    return not errors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="validate only")
    args = ap.parse_args()

    blocks, prompts = parse_blocks(), parse_prompts()
    payloads = build(blocks, prompts)
    ok = check(blocks, prompts, payloads)

    if not args.check:
        OUT.parent.mkdir(exist_ok=True)
        OUT.write_text(json.dumps(payloads, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {OUT.relative_to(ROOT)}")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
