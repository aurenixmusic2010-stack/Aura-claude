#!/usr/bin/env bash
# Encode a rendered PNG sequence (+ optional mixed soundtrack) into the delivery MP4:
# H.264 High, 1080x1920, 30 fps, AAC 320k. Two-pass VBR so busy shots (grain +
# halftone + atom lattice) get the bits they need while the file stays under
# GitHub's 100 MB limit.
#   tools/encode.sh <frames_dir> <out.mp4> [audio.wav] [avg_bitrate]
set -euo pipefail
FR="${1:?frames dir}"
OUT="${2:?output mp4}"
AUD="${3:-}"
BR="${4:-13000k}"
LOG="$(mktemp -d)/x264"
VIN=(-framerate 30 -i "$FR/%05d.png")
VOPT=(-c:v libx264 -preset slow -tune film -b:v "$BR" -maxrate 26M -bufsize 40M
  -pix_fmt yuv420p -profile:v high -level 4.2
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -r 30)
ffmpeg -y -hide_banner -loglevel error "${VIN[@]}" "${VOPT[@]}" -pass 1 -passlogfile "$LOG" -an -f mp4 /dev/null
if [ -n "$AUD" ]; then
  ffmpeg -y -hide_banner -loglevel error "${VIN[@]}" -i "$AUD" -map 0:v -map 1:a "${VOPT[@]}" -pass 2 -passlogfile "$LOG" \
    -c:a aac -b:a 320k -ar 48000 -ac 2 -t 52 -movflags +faststart "$OUT"
else
  ffmpeg -y -hide_banner -loglevel error "${VIN[@]}" "${VOPT[@]}" -pass 2 -passlogfile "$LOG" -movflags +faststart "$OUT"
fi
ffprobe -v error -show_entries format=duration,size,bit_rate \
  -show_entries stream=codec_type,codec_name,profile,width,height,r_frame_rate,nb_frames,pix_fmt,sample_rate,channels \
  -of default=nw=1 "$OUT"
