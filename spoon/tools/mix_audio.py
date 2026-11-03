#!/usr/bin/env python3
"""Build the final soundtrack: VO phrases placed per audio/vo-edit.json over the
music bed (ducked under speech, dipped for the awkward pause, hard silence before
the final joke), loudness-normalised to -14 LUFS / -1 dBTP. Also writes captions.

    python3 tools/mix_audio.py <out_dir>      # -> mix.wav, mix-normalised.m4a, captions.srt
"""
import json, os, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
DUR = 52.0
out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)
cfg = json.load(open(os.path.join(ROOT, "audio", "vo-edit.json")))
VO = os.path.join(ROOT, "audio", "vo-adam.mp3")
MUSIC = os.path.join(ROOT, "audio", "music-cosmic-joke.mp3")


def decode(path, channels, filters=None):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path]
    if filters:
        cmd += ["-af", filters]
    cmd += ["-ac", str(channels), "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, channels).copy()


def active_rms(a):
    hop = SR // 50
    f = np.array([np.sqrt(np.mean(a[i:i + hop] ** 2)) for i in range(0, len(a) - hop, hop)])
    f = f[f > f.max() * 0.1]
    return np.sqrt(np.mean(f ** 2))


n = int(SR * DUR)
vo_track = np.zeros(n, dtype=np.float32)
clips = []
speech = np.zeros(n, dtype=bool)
cues = []
for ph in cfg["phrases"]:
    tempo = ph.get("tempo", cfg["tempo"])
    a, b = ph["src"]
    # cut, clean up, retime (pitch-preserving), short fades so cuts never click
    flt = (f"atrim={a}:{b},asetpts=PTS-STARTPTS,highpass=f=80,"
           f"acompressor=threshold=-20dB:ratio=2.5:attack=5:release=90:makeup=2,"
           f"rubberband=tempo={tempo}:pitchq=quality:formant=preserved,"
           f"afade=t=in:d=0.012,areverse,afade=t=in:d=0.04,areverse")
    clip = decode(VO, 1, flt)[:, 0]
    clips.append(clip)
target = np.median([active_rms(c) for c in clips])
for ph, clip in zip(cfg["phrases"], clips):
    tempo = ph.get("tempo", cfg["tempo"])
    a, b = ph["src"]
    # ride the fader: every line sits at the read's median speech level
    clip = clip * (target / active_rms(clip))
    s0 = int(ph["at"] * SR)
    s1 = min(n, s0 + len(clip))
    vo_track[s0:s1] += clip[: s1 - s0]
    speech[s0:s1] = True
    end = ph["at"] + len(clip) / SR
    parts = ph["text"].split("|")
    if len(parts) == 2 and "split" in ph:
        mid = ph["at"] + (ph["split"] - a) / tempo
        cues += [(ph["at"], mid, parts[0]), (mid, end, parts[1])]
    else:
        cues.append((ph["at"], end, ph["text"].replace("|", " ")))
    print(f"{ph['id']:4s} {ph['at']:6.2f} -> {end:6.2f}  {ph['text'].replace('|', ' ')}")

# speech-level normalisation of the VO track (peak-safe)
vo_track *= 0.5 / max(1e-6, np.percentile(np.abs(vo_track[speech]), 99.5))

music = decode(MUSIC, 2)[:n]
if len(music) < n:
    music = np.pad(music, ((0, n - len(music)), (0, 0)))

# music gain envelope (dB), built at 1 kHz then interpolated
m = cfg["music"]
fs = 1000
k = int(DUR * fs)
tt = np.arange(k) / fs
gdb = np.zeros(k)
sp = speech[:: SR // fs][:k].astype(float)
# duck: attack before speech, release after
att = int(m["duck_attack"] * fs)
rel = int(m["duck_release"] * fs)
duck = np.zeros(k)
idx = np.where(sp > 0)[0]
mask = np.zeros(k)
mask[idx] = 1
# expand mask: lookahead attack, slow release
ahead = np.convolve(mask, np.ones(att * 2 + 1), mode="same") > 0
env = np.zeros(k)
level = 0.0
for i in range(k):
    target = 1.0 if ahead[i] else 0.0
    rate = 1.0 / max(att, 1) if target > level else 1.0 / max(rel, 1)
    level += (target - level) * min(1.0, rate * 3)
    env[i] = level
gdb += m["duck_db"] * env
for d in m["dips"]:
    w = np.clip(np.minimum((tt - d["from"]) / 0.15, (d["to"] - tt) / 0.2), 0, 1)
    gdb += d["db"] * w
gain = 10 ** (gdb / 20)
s0, s1 = m["silence"]
gain[(tt >= s0) & (tt < s1)] = 0.0
# 20 ms ramps around the silence so it cuts hard but clean
for edge, sign in ((s0, -1), (s1, 1)):
    r = (tt >= edge - 0.02) & (tt < edge + 0.02)
    gain[r] *= np.clip(0.5 + sign * (tt[r] - edge) / 0.04, 0, 1)
f0, f1 = m["end_fade"]
gain *= np.clip((f1 - tt) / (f1 - f0), 0, 1) ** 2 * (tt >= f0) + (tt < f0)
g = np.interp(np.arange(n) / SR, tt, gain).astype(np.float32)

music_bed = music * g[:, None] * 0.62
vo_st = np.repeat(vo_track[:, None], 2, axis=1)
# keep VO dry and centred; nothing plays during the silence
vo_st[int(s0 * SR): int(s1 * SR)] *= 0
mix = music_bed + vo_st
peak = np.abs(mix).max()
if peak > 0.98:
    mix *= 0.98 / peak

def write(path, arr):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                    "-c:a", "pcm_s24le", path], input=arr.astype(np.float32).tobytes(), check=True)
write(os.path.join(out_dir, "stem-voiceover.wav"), vo_st)
write(os.path.join(out_dir, "stem-music.wav"), music_bed)
wav = os.path.join(out_dir, "mix.wav")
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                "-c:a", "pcm_s24le", wav], input=mix.astype(np.float32).tobytes(), check=True)

# two-pass loudness normalisation for social platforms
meas = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav, "-af", "loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json", "-f", "null", "-"],
                      capture_output=True, text=True).stderr
js = json.loads(meas[meas.rindex("{"): meas.rindex("}") + 1])
ln = (f"loudnorm=I=-14:TP=-1.0:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
      f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
norm = os.path.join(out_dir, "mix-normalised.wav")
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-af", ln + ",aresample=48000", "-c:a", "pcm_s24le", norm], check=True)
print("loudness in:", js["input_i"], "LUFS  TP", js["input_tp"])

def ts(x):
    h, r = divmod(x, 3600)
    mm, ss = divmod(r, 60)
    return f"{int(h):02d}:{int(mm):02d}:{int(ss):02d},{int(round((ss - int(ss)) * 1000)):03d}"
with open(os.path.join(out_dir, "captions.srt"), "w") as f:
    for i, (a, b, txt) in enumerate(cues, 1):
        f.write(f"{i}\n{ts(a)} --> {ts(b)}\n{txt}\n\n")
print("wrote", wav, norm, "captions.srt")
