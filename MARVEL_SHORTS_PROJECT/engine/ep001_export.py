#!/usr/bin/env python3
"""Mux picture + mix into the two deliverables.

    episode_001_clean.mp4   no captions (use with subtitles.srt)
    episode_001_final.mp4   captions burned in (subtitles.ass, Anton on toner tape)

1080x1920, 30 fps, H.264 High, yuv420p, Rec.709 (SDR), AAC 48 kHz.
"""

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ep001 import BUILD, EP, ROOT  # noqa: E402

FONTS = ROOT / "style" / "misfeed" / "fonts"
TO709 = "scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv"
TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]


def encode(vf, out):
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(BUILD / "video_clean.mp4"), "-i", str(EP / "audio" / "mix.wav"),
           "-map", "0:v", "-map", "1:a", "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-maxrate", "14M", "-bufsize", "28M",
           "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30", *TAGS,
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)
    print(f"[export] {out}")


def main():
    encode(TO709, EP / "episode_001_clean.mp4")
    ass = EP / "subtitles" / "subtitles.ass"
    esc = lambda p: str(p).replace(":", r"\:").replace("'", r"\'")
    encode(f"subtitles='{esc(ass)}':fontsdir='{esc(FONTS)}',{TO709}", EP / "episode_001_final.mp4")


if __name__ == "__main__":
    main()
