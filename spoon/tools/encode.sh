#!/usr/bin/env bash
# Encode a rendered PNG sequence into the delivery MP4 (H.264, 1080x1920, 30 fps).
#   tools/encode.sh <frames_dir> <out.mp4>
set -euo pipefail
FR="${1:?frames dir}"
OUT="${2:?output mp4}"
ffmpeg -y -hide_banner -loglevel warning -stats \
  -framerate 30 -i "$FR/%05d.png" \
  -c:v libx264 -preset slow -crf 18 -tune film \
  -maxrate 14M -bufsize 28M \
  -pix_fmt yuv420p -profile:v high -level 4.2 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -movflags +faststart -r 30 "$OUT"
ffprobe -v error -show_entries format=duration,size,bit_rate -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames -of default=nw=1 "$OUT"
