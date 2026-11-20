#!/usr/bin/env python3
"""Captions for episode 001, timed from the narration's word timestamps.

Writes subtitles/subtitles.srt (plain) and subtitles/subtitles.ass (burned into
the final cut: Anton on toner tape, amber for healing, green for poison).
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ep001 import EP, VO_OFFSET, WORDS  # noqa: E402

CHUNKS = [
    "The metal that makes", "Wolverine unbreakable...", "is poisoning him.",
    "In the comics,", "the Weapon X program", "bonded adamantium", "to his entire skeleton.",
    "Unbreakable bones.", "Unbreakable claws.",
    "So why isn't he dead?", "His healing factor", "never clocks out.",
    "Every second, it's repairing", "what that metal does to him", "from the inside.",
    "Marvel's tested it.", "When Magneto ripped", "the adamantium out,", "his healing factor",
    "nearly turned him feral.",
    "And when the X-Men", "briefly lost their powers?", "Logan got sick.", "Advanced adamantium poisoning.",
    "So Wolverine runs", "on two powers", "that are always at war.",
    "Take away the metal,", "and the healing makes him wild.", "Take away the healing...",
    "and the metal kills him.",
    "That's the Wolverine we meet", "in the 2017 film Logan.", "Older. Scarred.",
    "His healing", "finally losing ground.",
    "The thing that made him unbreakable...", "was breaking him the whole time.",
]

AMBER, GREEN = r"{\c&H3AA3F2&}", r"{\c&H5DE19B&}"
PAPER = r"{\c&HD6E5EC&}"


def tokens(chunk):
    return sum(2 if w.lower().startswith("x-men") else 1 for w in chunk.split())


def timed():
    out, i = [], 0
    for c in CHUNKS:
        n = tokens(c)
        s = WORDS[i]["s"] + VO_OFFSET
        e = WORDS[i + n - 1]["e"] + VO_OFFSET
        out.append([c, s, e])
        i += n
    assert i == len(WORDS), (i, len(WORDS))
    for k in range(len(out)):  # hold each caption until the next, unless there is a real pause
        s, e = out[k][1], out[k][2]
        nxt = out[k + 1][1] if k + 1 < len(out) else e + 0.6
        out[k][1] = max(s - 0.05, 0)
        out[k][2] = min(nxt - 0.02, e + 0.45) if nxt - e < 0.7 else e + 0.3
    return out


def ts(x, sep=","):
    h, m = int(x // 3600), int(x % 3600 // 60)
    s = x % 60
    return f"{h:02d}:{m:02d}:{int(s):02d}{sep}{int(round((s % 1) * 1000)):03d}"


def ass_ts(x):
    h, m = int(x // 3600), int(x % 3600 // 60)
    return f"{h}:{m:02d}:{x % 60:05.2f}"


def colour(text):
    t = text.upper()
    t = re.sub(r"\b(HEALING)\b", lambda m: AMBER + m.group(1) + PAPER, t)
    t = re.sub(r"\b(POISONING|POISON)\b", lambda m: GREEN + m.group(1) + PAPER, t)
    return t


def main():
    d = EP / "subtitles"
    d.mkdir(exist_ok=True)
    cues = timed()
    srt = []
    for k, (c, s, e) in enumerate(cues, 1):
        srt.append(f"{k}\n{ts(s)} --> {ts(e)}\n{c}\n")
    (d / "subtitles.srt").write_text("\n".join(srt), encoding="utf-8")
    head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Tape,Anton,74,&H00D6E5EC,&H00D6E5EC,&H00171412,&H00171412,0,0,0,0,100,100,1,0,3,14,0,2,90,90,420,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    for c, s, e in cues:
        pop = r"{\fscx112\fscy112\t(0,90,\fscx100\fscy100)}"
        ev.append(f"Dialogue: 0,{ass_ts(s)},{ass_ts(e)},Tape,,0,0,0,,{pop}{colour(c)}")
    (d / "subtitles.ass").write_text(head + "\n".join(ev) + "\n", encoding="utf-8")
    print(f"[subs] {len(cues)} captions -> {d}")


if __name__ == "__main__":
    main()
