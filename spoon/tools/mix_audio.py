#!/usr/bin/env python3
"""Build the final soundtrack from audio/vo-edit.json:
  voiceover lines cut from the read and placed on their sync points,
  the music bed (ducked under speech and big hits, dipped for the awkward pause,
  hard silence before the final joke), and the procedural sound design (tools/sfx.py).
Loudness-normalised to -14 LUFS / -1 dBTP. Writes stems, the resolved line
placements and captions.srt.

    python3 tools/mix_audio.py <out_dir>
"""
import json, os, re, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import sfx  # noqa: E402

SR = 48000
DUR = 52.0
out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)
cfg = json.load(open(os.path.join(ROOT, "audio", "vo-edit.json")))
VO = os.path.join(ROOT, cfg["vo"])
MUSIC = os.path.join(ROOT, "audio", "music-cosmic-joke.mp3")


def ff(args, data=None):
    return subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error"] + args, input=data, capture_output=True, check=True).stdout


def decode(path, ch, af=None):
    a = ["-i", path] + (["-af", af] if af else []) + ["-ac", str(ch), "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(ff(a), np.float32).reshape(-1, ch).copy()


def tempo(x, t):
    if abs(t - 1) < 1e-3:
        return x
    y = ff(["-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-af", f"rubberband=tempo={t}:pitchq=quality:formant=preserved",
            "-f", "f32le", "-"], x.astype(np.float32).tobytes())
    return np.frombuffer(y, np.float32).copy()


def frames_db(x, hop=SR // 200):
    e = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, max(1, len(x) - hop), hop)])
    return 20 * np.log10(e + 1e-9)


def compact(x, max_gap=0.16, keep=0.12, thr=-48):
    """Shorten long internal pauses; returns (clip, time_map(src_offset)->new_offset)."""
    db = frames_db(x)
    q = db < thr
    runs, s = [], None
    for i, v in enumerate(q):
        if v and s is None:
            s = i
        if (not v or i == len(q) - 1) and s is not None:
            e = i
            if s > 0 and e < len(q) - 1 and (e - s) / 200 > max_gap:
                runs.append((s / 200, e / 200))
            s = None
    if not runs:
        return x, (lambda t: t)
    pieces, cut, last = [], [], 0.0
    for a, b in runs:
        mid_a, mid_b = a + keep / 2, b - keep / 2
        pieces.append(x[int(last * SR):int(mid_a * SR)])
        cut.append((mid_a, mid_b - mid_a))
        last = mid_b
    pieces.append(x[int(last * SR):])
    fade = int(0.008 * SR)
    y = pieces[0]
    for p in pieces[1:]:
        if len(y) > fade and len(p) > fade:
            r = np.linspace(0, 1, fade)
            y = np.concatenate([y[:-fade], y[-fade:] * (1 - r) + p[:fade] * r, p[fade:]])
        else:
            y = np.concatenate([y, p])

    def tm(t):
        return t - sum(d for (a, d) in cut if a < t)
    return y, tm


# ---- words -> line cuts
segs = json.load(open(os.path.join(ROOT, cfg["words"])))
W = [(a, b, re.sub(r"[^a-z0-9]", "", t.lower())) for s in segs for (a, b, t) in s["words"]]
raw = decode(VO, 1)[:, 0]
rawdb = frames_db(raw)


def quiet_near(t, lo, hi):
    i0, i1 = max(0, int((t + lo) * 200)), min(len(rawdb) - 1, int((t + hi) * 200))
    return (i0 + int(np.argmin(rawdb[i0:i1 + 1]))) / 200


def edge(t, direction, limit, thr=-46, run=0.05):
    i = int(t * 200)
    need = int(run * 200)
    lim = int(limit * 200)
    q = 0
    while 0 < i < len(rawdb) - 1:
        if (direction < 0 and i <= lim) or (direction > 0 and i >= lim):
            break
        q = q + 1 if rawdb[i] < thr else 0
        if q >= need:
            return (i + (need if direction < 0 else -need) * 0 ) / 200 + (0.02 if direction < 0 else -0.0)
        i += direction
    return i / 200


wi = 0
lines = []
order = []
for gi, g in enumerate(cfg["groups"]):
    for ln in g["lines"]:
        order.append((gi, ln))
    for dl in g.get("dropped", []):
        order.append((gi, [dl.split(" (")[0], None, "drop"]))
for gi, ln in order:
    if True:
        text = ln[0]
        toks = [re.sub(r"[^a-z0-9]", "", w.lower()) for w in text.replace("...", " ").split()]
        toks = [t for t in toks if t]
        j = wi
        while W[j][2] != toks[0]:
            j += 1
        k = j + len(toks) - 1
        prev_end = W[j - 1][1] if j > 0 else 0.0
        next_start = W[k + 1][0] if k + 1 < len(W) else len(raw) / SR
        # edges from the waveform: walk outward to the first real silence (ASR word
        # edges can be early or degenerate), never past the neighbouring words
        s0 = edge(W[j][0] if j > 0 else 0.0, -1, prev_end if j > 0 else 0.0) if j > 0 else 0.0
        s1 = edge(W[k][1], +1, next_start)
        words = [(W[m][0] - s0, W[m][2]) for m in range(j, k + 1)]
        if len(ln) > 2 and ln[2] == "drop":
            wi = k + 1
            continue
        lines.append({"group": gi, "text": text, "min": ln[1] if len(ln) > 1 else None, "src": [s0, s1], "words": words})
        wi = k + 1

af = "highpass=f=80,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=90:makeup=2"
for L in lines:
    clip = decode(VO, 1, f"atrim={L['src'][0]}:{L['src'][1]},asetpts=PTS-STARTPTS," + af)[:, 0]
    clip, tm = compact(clip)
    L["clip"], L["tm"] = clip, tm


def active_rms(a):
    db = frames_db(a)
    lin = 10 ** (db / 20)
    lin = lin[lin > lin.max() * 0.1]
    return np.sqrt(np.mean(lin ** 2))


# ---- plan each group: smallest tempo (1.00..1.25) that fits between its sync points
gap = cfg["gap"]
plan = []
for gi, g in enumerate(cfg["groups"]):
    G = [L for L in lines if L["group"] == gi]
    for tp in np.arange(1.0, 1.1801, 0.01):
        t = g["start"]
        place = []
        for n, L in enumerate(G):
            st0 = t if n == 0 else t + gap
            if L["min"] is not None:
                st0 = max(st0, L["min"])
            if n == 1 and "anchor" in g:
                w, at = g["anchor"]
                off = next(o for (o, ww) in L["words"] if ww == w)
                st0 = max(st0, at - L["tm"](off) / tp)
            d = len(L["clip"]) / SR / tp
            place.append((st0, d))
            t = st0 + d
        if t <= g["deadline"] or tp >= 1.18:
            break
    for L, (st0, d) in zip(G, place):
        L["at"], L["tempo"] = st0, round(float(tp), 2)
    plan.append(round(float(tp), 2))

n = int(DUR * SR)
vo = np.zeros(n, np.float32)
speech = np.zeros(n, bool)
clips = [tempo(L["clip"], L["tempo"]) for L in lines]
target = np.median([active_rms(c) for c in clips])
cues = []
for L, c in zip(lines, clips):
    c = c * (target / active_rms(c))
    e = 0.004 * SR
    r = np.ones(len(c))
    r[: int(e)] = np.linspace(0, 1, int(e))
    r[-int(e * 5):] = np.linspace(1, 0, int(e * 5))
    c = c * r
    a0 = int(L["at"] * SR)
    a1 = min(n, a0 + len(c))
    vo[a0:a1] += c[: a1 - a0]
    speech[a0:a1] = True
    L["end"] = L["at"] + len(c) / SR
    cues.append((L["at"], L["end"], L["text"]))
vo *= 0.5 / max(1e-6, np.percentile(np.abs(vo[speech]), 99.5))
for L in lines:
    print(f"{L['at']:6.2f}-{L['end']:6.2f}  x{L['tempo']:.2f}  {L['text']}")
print("group tempos:", plan)

# ---- music bed
music_full = decode(MUSIC, 2)
music = music_full[:n] if len(music_full) >= n else np.pad(music_full, ((0, n - len(music_full)), (0, 0)))
M = cfg["music"]
fs = 1000
k = int(DUR * fs)
tt = np.arange(k) / fs


def follower(mask, att=0.08, rel=0.35):
    ahead = np.convolve(mask.astype(float), np.ones(int(att * fs) * 2 + 1), mode="same") > 0
    env = np.zeros(len(mask))
    lv = 0.0
    for i in range(len(mask)):
        tgt = 1.0 if ahead[i] else 0.0
        rate = 1 / (att * fs) if tgt > lv else 1 / (rel * fs)
        lv += (tgt - lv) * min(1, rate * 3)
        env[i] = lv
    return env


sp_env = follower(speech[:: SR // fs][:k])
sfx_track, hero = sfx.render(music_full)
hero_env = follower(hero[:: SR // fs][:k] > 0, 0.01, 0.5)
gdb = M["duck_db"] * sp_env + M["hero_duck_db"] * hero_env
for d in M["dips"]:
    gdb += d["db"] * np.clip(np.minimum((tt - d["from"]) / 0.15, (d["to"] - tt) / 0.2), 0, 1)
gain = 10 ** (gdb / 20)
s0, s1 = M["silence"]
ramp = 0.02
gain *= np.clip(np.maximum((s0 - tt) / ramp, (tt - s1) / ramp), 0, 1)
f0, f1 = M["end_fade"]
gain *= np.where(tt >= f0, np.clip((f1 - tt) / (f1 - f0), 0, 1) ** 2, 1)
g = np.interp(np.arange(n) / SR, tt, gain).astype(np.float32)
bed = music * g[:, None] * M["bed_gain"]

# ---- sound design, tucked under the voice
S = cfg["sfx"]
# hits keep their first 150 ms (the punch); their tails and everything else step
# aside for the voice
hs = np.zeros(k)
on = np.flatnonzero(np.diff(np.concatenate([[0], hero[:: SR // fs][:k] > 0]).astype(int)) > 0)
for i in on:
    hs[i:i + int(0.15 * fs)] = 1
duck = S["duck_under_vo_db"] * sp_env * (1 - hs)
sg = 10 ** ((S["gain_db"] + np.interp(np.arange(n) / SR, tt, duck)) / 20)
sfx_bus = sfx_track * sg[:, None].astype(np.float32)

vo_st = np.repeat(vo[:, None], 2, 1)
mix = bed + vo_st + sfx_bus
mix[int(44.0 * SR):int(44.62 * SR)] = 0
pk = np.abs(mix).max()
if pk > 0.98:
    mix *= 0.98 / pk


def write(path, arr):
    ff(["-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "pcm_s24le", path], arr.astype(np.float32).tobytes())


write(os.path.join(out_dir, "stem-voiceover.wav"), vo_st)
write(os.path.join(out_dir, "stem-music.wav"), bed)
write(os.path.join(out_dir, "stem-sfx.wav"), sfx_bus)
wav = os.path.join(out_dir, "mix.wav")
write(wav, mix)
meas = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav, "-af", "loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json", "-f", "null", "-"],
                      capture_output=True, text=True).stderr
js = json.loads(meas[meas.rindex("{"): meas.rindex("}") + 1])
ln = (f"loudnorm=I=-14:TP=-1.0:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:"
      f"measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
ff(["-y", "-i", wav, "-af", ln + ",aresample=48000", "-c:a", "pcm_s24le", os.path.join(out_dir, "mix-normalised.wav")])
print("pre-norm loudness:", js["input_i"], "LUFS")


def ts(x):
    ms = int(round(x * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


with open(os.path.join(out_dir, "captions.srt"), "w") as f:
    for i, (a, b, txt) in enumerate(cues, 1):
        f.write(f"{i}\n{ts(a)} --> {ts(b)}\n{txt.replace('...', '').strip()}\n\n")
json.dump([{"at": round(L["at"], 3), "end": round(L["end"], 3), "tempo": L["tempo"], "src": [round(v, 3) for v in L["src"]], "text": L["text"]}
           for L in lines], open(os.path.join(out_dir, "vo-placement.json"), "w"), indent=1)
