#!/usr/bin/env bash
# Encode a rendered PNG sequence into the delivery MP4 (H.264 High, 1080x1920, 30 fps).
# Two-pass VBR so busy shots (grain + halftone + atom lattice) get the bits they need
# while the file stays under GitHub's 100 MB limit.
#   tools/encode.sh <frames_dir> <out.mp4> [avg_bitrate]
set -euo pipefail
FR="${1:?frames dir}"
OUT="${2:?output mp4}"
BR="${3:-13500k}"
LOG="$(mktemp -d)/x264"
COMMON=(-framerate 30 -i "$FR/%05d.png" -c:v libx264 -preset slow -tune film
  -b:v "$BR" -maxrate 26M -bufsize 40M -pix_fmt yuv420p -profile:v high -level 4.2
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -r 30)
ffmpeg -y -hide_banner -loglevel error "${COMMON[@]}" -pass 1 -passlogfile "$LOG" -an -f mp4 /dev/null
ffmpeg -y -hide_banner -loglevel error "${COMMON[@]}" -pass 2 -passlogfile "$LOG" -movflags +faststart "$OUT"
ffprobe -v error -show_entries format=duration,size,bit_rate -show_entries stream=codec_name,profile,width,height,r_frame_rate,nb_frames,pix_fmt -of default=nw=1 "$OUT"
