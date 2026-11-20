#!/usr/bin/env python3
"""Episode 001 sound: narration up front, the music edited to the script's
dynamics and ducked under the voice, and synthesized sound design on every beat.

    python3 MARVEL_SHORTS_PROJECT/engine/ep001_audio.py VO.mp3 MUSIC.mp3

Writes episodes/EPISODE_001/audio/{narration.wav, music.wav, sfx.wav, mix.wav}
and the one-shots to audio/sound_effects/. Every effect is made here from
noise and sine partials; nothing is sampled.
"""

import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ep001 import END, EP, SCENES, VO_OFFSET, cue  # noqa: E402

SR = 48000
N = int(END * SR)
AUD = EP / "audio"
FX = AUD / "sound_effects"
rng = np.random.default_rng(2001)
SC = dict(SCENES)


def decode(path, ch, af=None):
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-ac", str(ch), "-ar", str(SR)]
    if af:
        cmd += ["-af", af]
    raw = subprocess.run(cmd + ["-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, ch).copy()


def write(path, x):
    x = np.atleast_2d(x.T).T if x.ndim == 1 else x
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(pcm.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ---------------------------------------------------------------- dsp ---

def band(x, lo, hi):
    X = np.fft.rfft(x)
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    t1 = np.clip((fr - lo * 0.7) / (lo * 0.3 + 1e-9), 0, 1)
    t2 = np.clip((hi * 1.4 - fr) / (hi * 0.4), 0, 1)
    return np.fft.irfft(X * t1 * t2, len(x))


def lowpass(x, hz):
    return band(x, 1, hz)


def tt(d):
    return np.arange(int(d * SR)) / SR


def env(d, a=0.005, r=None, tau=None):
    t = tt(d)
    e = np.clip(t / max(a, 1e-4), 0, 1)
    if tau:
        e *= np.exp(-np.clip(t - a, 0, None) / tau)
    if r:
        e *= np.clip((d - t) / r, 0, 1)
    return e


def noise(d):
    return rng.normal(0, 1, int(d * SR))


def sweep(f0, f1, d, shape=1.0):
    t = tt(d)
    f = f0 + (f1 - f0) * (t / d) ** shape
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def norm(x, peak=0.9):
    return x / (np.abs(x).max() + 1e-9) * peak


# ----------------------------------------------------------- the sounds ---

def s_scrape():      # claws slide through paper: grit + ringing steel
    d = 0.75
    x = band(noise(d), 1800, 9000) * env(d, 0.01, 0.3) * (0.6 + 0.4 * np.sin(2 * np.pi * 31 * tt(d)))
    for f in (2310, 3710, 5150, 7020):
        x += 0.35 * np.sin(2 * np.pi * f * tt(d) * (1 + 0.004 * np.sin(9 * tt(d)))) * env(d, 0.02, tau=0.4)
    tear = band(noise(0.25), 600, 5000) * (rng.random(int(0.25 * SR)) > 0.8) * env(0.25, 0.002, tau=0.08)
    x[:len(tear)] += tear * 1.6
    return norm(x, 0.7)


def s_sub(d=1.4):   # the low hit under "poisoning"
    t = tt(d)
    f = 30 + 45 * np.exp(-t / 0.08)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5)
    x += band(noise(d), 40, 400) * np.exp(-t / 0.05) * 0.4
    return norm(x, 0.95)


def s_stamp(big=False):
    d = 0.4
    t = tt(d)
    x = np.sin(2 * np.pi * np.cumsum(48 + 70 * np.exp(-t / 0.03)) / SR) * np.exp(-t / (0.1 if big else 0.07))
    x += band(noise(d), 2000, 7000) * np.exp(-t / 0.005) * 0.45
    x += band(noise(d), 300, 2500) * np.exp(-t / 0.03) * 0.35
    return norm(x, 0.8 if big else 0.6)


def s_crunch():      # the page slipping on the glass
    d = 0.32
    g = int(0.038 * SR)
    grain = band(rng.normal(0, 1, g), 100, 5000) * 0.5 + np.sign(np.sin(2 * np.pi * 82 * np.arange(g) / SR)) * 0.3
    x = np.zeros(int(d * SR))
    for i in range(7):
        o = int(i * 0.044 * SR)
        x[o:o + g] += grain * (1 - i / 9)
    x = np.round(x * 6) / 6
    x = np.repeat(x[::10], 10)[:len(x)]
    return norm(x, 0.6)


def s_lamp(d=0.4):   # copier lamp pass
    t = tt(d)
    x = band(noise(d), 600, 6000) * np.sin(np.pi * t / d) ** 2 * 0.5
    x += sweep(400, 2000, d) * np.sin(np.pi * t / d) ** 2 * 0.12
    return norm(x, 0.5)


def s_whoosh(d=0.45, lo=300, hi=4000, up=True):
    t = tt(d)
    x = band(noise(d), lo, hi) * (np.sin(np.pi * (t / d) ** (0.6 if up else 1.6)) ** 2)
    return norm(x, 0.5)


def s_pour(d=2.6):   # liquid metal: a low churn that rises
    t = tt(d)
    bub = band(noise(d), 150, 900) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * (6 + 9 * t / d) * t)))
    rise = sweep(90, 340, d, 1.4) * 0.25 + sweep(181, 683, d, 1.4) * 0.12
    x = (bub + rise) * env(d, 0.2, 0.25) * (0.5 + 0.5 * t / d)
    return norm(x, 0.55)


def s_clank():       # metal on metal: inharmonic partials
    d = 1.3
    t = tt(d)
    x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / dec) for f, a, dec in
            ((220, 1.0, 0.5), (563, 0.7, 0.35), (1023, 0.5, 0.25), (1652, 0.4, 0.18), (2830, 0.3, 0.1)))
    x += band(noise(d), 1500, 9000) * np.exp(-t / 0.006) * 1.2
    return norm(x, 0.85)


def s_snikt():       # the claws: fast steel swish + a bright ring
    d = 0.6
    t = tt(d)
    x = band(noise(d), 2500, 11000) * np.exp(-((t - 0.05) / 0.035) ** 2) * 1.4
    x += sum(np.sin(2 * np.pi * f * t) * np.exp(-t / 0.22) * a for f, a in ((3200, 0.5), (4870, 0.35), (6410, 0.25)))
    return norm(x, 0.8)


def s_fizz(d):       # poison: sparse acidic crackle
    x = band(noise(d), 3000, 12000) * (rng.random(int(d * SR)) > 0.985) * 3
    return norm(x, 0.25)


def s_shimmer(d):    # healing: a warm, slow shimmer
    t = tt(d)
    x = sum(np.sin(2 * np.pi * f * t + p) for f, p in ((880, 0), (1320, 1), (1760, 2), (2217, 0.5)))
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 5.5 * t)
    return norm(x * env(d, 0.4, 0.4), 0.18)


def s_tick():
    d = 0.04
    return norm(band(noise(d), 3000, 9000) * np.exp(-tt(d) / 0.004), 0.4)


def s_hum(d=2.4):    # Magneto: a magnetic field winding up
    t = tt(d)
    f = 55 + 40 * (t / d) ** 2
    x = sum(np.sin(2 * np.pi * np.cumsum(f * k) / SR) / k for k in (1, 2, 3, 5))
    x *= (t / d) ** 1.5 * (0.7 + 0.3 * np.sin(2 * np.pi * 7 * t))
    x += band(noise(d), 2000, 6000) * (t / d) ** 3 * 0.15
    return norm(x * env(d, 0.05, 0.1), 0.7)


def s_rip():         # metal torn out
    d = 0.9
    t = tt(d)
    x = band(noise(d), 400, 7000) * np.exp(-t / 0.25) * (0.5 + 0.5 * (rng.random(len(t)) > 0.6))
    x += sweep(1800, 300, d, 0.7) * np.exp(-t / 0.3) * 0.6
    return norm(x, 0.9)


def s_growl(d=1.8):  # feral: low rumble with a ragged flutter
    t = tt(d)
    x = band(noise(d), 60, 420) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t + 2 * np.sin(2 * np.pi * 3 * t)))
    x += sweep(70, 55, d) * 0.4
    return norm(x * env(d, 0.25, 0.4), 0.7)


def s_rewind(d=0.3):
    t = tt(d)
    x = sweep(2400, 200, d, 0.5) * 0.6 + band(noise(d), 1000, 6000) * 0.4
    x *= (np.sin(2 * np.pi * 40 * t) > -0.2)
    return norm(x * env(d, 0.01, 0.05), 0.6)


def s_powerdown():
    d = 1.0
    t = tt(d)
    x = sweep(1300, 70, d, 0.6) * np.exp(-t / 0.6) * 0.8
    x[:int(0.02 * SR)] += band(noise(0.02), 2000, 8000) * 2      # the switch click
    return norm(x, 0.6)


def s_flatline(d=1.1):
    t = tt(d)
    return norm(np.sin(2 * np.pi * 1000 * t) * env(d, 0.01, 0.05), 0.3)


def s_creak(d):      # rope under strain
    t = tt(d)
    x = np.zeros(len(t))
    for c in np.arange(0.1, d - 0.4, 0.55):
        seg = int(0.35 * SR)
        o = int(c * SR)
        tt_ = np.arange(seg) / SR
        g = band(rng.normal(0, 1, seg), 250, 900) * (np.sin(2 * np.pi * (14 + 8 * rng.random()) * tt_) > 0.3)
        x[o:o + seg] += g * np.sin(np.pi * tt_ / 0.35)
    return norm(x, 0.35)


def s_boom():        # "kills him"
    d = 2.0
    t = tt(d)
    x = np.sin(2 * np.pi * np.cumsum(28 + 60 * np.exp(-t / 0.06)) / SR) * np.exp(-t / 0.7)
    x += band(noise(d), 30, 600) * np.exp(-t / 0.12) * 0.5
    return norm(x, 1.0)


def s_wind(d):
    t = tt(d)
    x = lowpass(noise(d), 700) * (0.55 + 0.45 * np.sin(2 * np.pi * 0.23 * t + 1))
    return norm(x * env(d, 0.6, 0.8), 0.22)


def s_buzz(d=1.2):   # the meter flickering
    t = tt(d)
    x = np.sign(np.sin(2 * np.pi * 120 * t)) * 0.3 * (rng.random(len(t)) > 0.4)
    return norm(band(x, 100, 3000) * env(d, 0.02, 0.2), 0.15)


def s_crack(d=1.6):  # the word splitting
    x = np.zeros(int(d * SR))
    for k in range(26):
        o = int((k / 26) ** 0.7 * (d - 0.1) * SR)
        g = int(0.02 * SR)
        x[o:o + g] += band(rng.normal(0, 1, g), 800, 7000) * np.exp(-np.arange(g) / SR / 0.004) * (0.4 + k / 30)
    return norm(x, 0.6)


def s_ring(d=2.4):   # one soft metallic ring, and a resolve note under it
    t = tt(d)
    x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / dec) for f, a, dec in
            ((523.3, 1.0, 1.1), (1307, 0.4, 0.7), (2210, 0.22, 0.4), (3500, 0.1, 0.25)))
    x += 0.5 * (np.sin(2 * np.pi * 110 * t) + 0.5 * np.sin(2 * np.pi * 164.8 * t)) * env(d, 0.3, 0.9)
    return norm(x * env(d, 0.003), 0.5)


# -------------------------------------------------------------- placing ---

def place(track, sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= len(track) or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    j = min(len(sig), len(track) - i)
    l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    track[i:i + j, 0] += sig[:j] * gain * l * 1.41
    track[i:i + j, 1] += sig[:j] * gain * r * 1.41


def build_sfx():
    fx = np.zeros((N, 2))
    shots = {}

    def add(name, sig, at, gain=1.0, pan=0.0):
        shots.setdefault(name, sig)
        place(fx, sig, at, gain, pan)

    # 1 hook
    add("claw_scrape", s_scrape(), 0.0, 0.8)
    add("stamp", s_stamp(), cue("unbreakable") - 0.05, 0.6)
    add("sub_hit", s_sub(), cue("poisoning"), 1.0)
    add("page_slip", s_crunch(), cue("poisoning") + 0.06, 0.55)
    add("copier_lamp", s_lamp(), SC["context"] - 0.2, 0.6)
    # 2 context
    add("pop_up", s_whoosh(0.4, 400, 5000), SC["context"] + 0.02, 0.55, -0.4)
    add("metal_pour", s_pour(cue("skeleton", end=True) - cue("bonded") + 0.2), cue("bonded") - 0.2, 0.75)
    add("clank", s_clank(), cue("unbreakable", 2), 0.8, -0.1)
    add("stamp_big", s_stamp(True), cue("unbreakable", 2) + 0.03, 0.4)
    add("snikt", s_snikt(), cue("unbreakable", 3) + 0.07, 0.9, 0.3)
    add("clank", s_clank(), cue("claws") + 0.02, 0.6, 0.3)
    # 3 explain
    add("stamp", s_stamp(), SC["explain"] + 0.05, 0.55)
    add("stamp_big", s_stamp(True), SC["explain"] + 0.4, 0.55)
    add("layers_whoosh", s_whoosh(0.6, 300, 3000), cue("healing") - 0.15, 0.55)
    d3 = SC["test1"] - (cue("every") - 0.6)
    add("poison_fizz", s_fizz(d3), cue("every") - 0.6, 0.6, 0.35)
    add("healing_shimmer", s_shimmer(d3), cue("every") - 0.6, 0.6, -0.35)
    for k in range(5):
        add("clock_tick", s_tick(), cue("clocks") - 0.1 + k * 0.17, 0.7, 0.5)
    # 4A test 1
    add("label_stamp", s_stamp(), SC["test1"] + 0.03, 0.35)
    add("magnetic_hum", s_hum(2.6), cue("ripped") - 1.0, 0.7)
    add("metal_rip", s_rip(), cue("ripped"), 0.85)
    add("page_slip", s_crunch(), cue("ripped") + 0.04, 0.5)
    add("growl", s_growl(1.9), cue("healing", 2) + 0.1, 0.8)
    add("stamp", s_stamp(), cue("feral") - 0.05, 0.5)
    add("rewind", s_rewind(), SC["test2"] - 0.22, 0.6)
    # 4B test 2
    add("power_down", s_powerdown(), cue("lost"), 0.75, 0.4)
    add("slide_in", s_whoosh(0.5, 200, 3000), cue("sick") - 0.5, 0.5, 0.5)
    add("snap_zoom", s_whoosh(0.18, 800, 7000), cue("poisoning", 2) - 0.05, 0.6)
    add("flatline", s_flatline(SC["reveal"] - cue("poisoning", 2) - 0.05), cue("poisoning", 2) + 0.05, 0.55)
    # 5 reveal
    add("re_entry_hit", s_sub(0.9), SC["reveal"], 0.7)
    add("rope_creak", s_creak(cue("take") - SC["reveal"]), SC["reveal"], 0.7)
    add("half_whoosh", s_whoosh(0.45, 300, 5000), cue("take") + 0.02, 0.65)
    add("page_slip", s_crunch(), cue("take") + 0.04, 0.45)
    add("growl", s_growl(1.0), cue("wild") - 0.2, 0.5)
    add("rewind", s_rewind(), cue("take", 2) - 0.37, 0.55)
    add("drain_whoosh", s_whoosh(0.6, 150, 2500, up=False), cue("take", 2) + 0.05, 0.6)
    add("deep_boom", s_boom(), cue("kills"), 1.0)
    add("fall_whoosh", s_whoosh(0.5, 200, 3500, up=False), cue("kills") + 0.08, 0.5)
    # 6 payoff
    add("wind_bed", s_wind(SC["closer"] - SC["payoff"] + 0.8), SC["payoff"], 0.8)
    add("stamp", s_stamp(), cue("older") - 0.03, 0.4, 0.4)
    add("stamp", s_stamp(), cue("scarred") - 0.03, 0.4, 0.4)
    add("meter_buzz", s_buzz(1.6), cue("healing", 5) - 0.2, 0.8, -0.5)
    # 7 closer
    add("crack", s_crack(1.8), cue("breaking") - 0.1, 0.7)
    add("final_ring", s_ring(), END - 1.9, 0.8)
    return fx, shots


# ---------------------------------------------------------------- music ---

def piece(src, s0, d, fade_in=0.015, fade_out=0.015):
    a = src[int(s0 * SR):int((s0 + d) * SR)].copy()
    n = len(a)
    fi, fo = max(int(fade_in * SR), 1), max(int(fade_out * SR), 1)
    a[:fi] *= np.linspace(0, 1, fi)[:, None]
    a[n - fo:] *= np.linspace(1, 0, fo)[:, None]
    return a


def lay(track, a, at, gain=1.0):
    i = int(at * SR)
    j = min(len(a), len(track) - i)
    track[i:i + j] += a[:j] * gain


def build_music(src):
    m = np.zeros((N, 2))
    # silence over the hook, then the low pulse; the big section lands on "Marvel's tested it"
    a0, a1 = SC["context"] - 0.05, cue("poisoning", 2)
    src_start = 20.25 - (SC["test1"] - a0)               # align the source's swell to scene 4A
    seg = piece(src, src_start, a1 - a0, 0.6, 0.004)                  # ...cut dead on "poisoning"
    tl = a0 + np.arange(len(seg)) / SR
    lift = 1 + 1.8 * (1 - np.clip((tl - (SC["test1"] - 0.35)) / 0.45, 0, 1))   # the quiet intro, brought up
    lay(m, seg * lift[:, None], a0, 1.0)
    # scene 5: a hard re-entry, a hole before "kills him"
    r0, gap0, gap1 = SC["reveal"], cue("healing", 4, end=True) + 0.04, cue("kills")
    lay(m, piece(src, 80.0, gap0 - r0, 0.004, 0.08), r0, 1.0)
    lay(m, piece(src, 80.0 + (gap1 - r0), SC["payoff"] + 0.4 - gap1, 0.004, 0.4), gap1, 1.0)
    # scene 6-7: thin to a pad (the quiet section, low-passed), gone before the last line ends
    p0 = SC["payoff"]
    pad = piece(src, 62.0, END - p0, 0.5, 0.01)
    pad = np.stack([lowpass(pad[:, c], 900) for c in (0, 1)], 1) * 1.6
    t = np.arange(len(pad)) / SR
    pad *= np.clip(1 - (t - (cue("breaking") - p0)) / 1.6, 0, 1)[:, None]
    lay(m, pad, p0, 1.0)
    return m


def envelope(x, attack=0.02, release=0.35):
    """Smoothed level follower for side-chain ducking."""
    a = np.abs(x)
    hop = 240
    blocks = a[:len(a) // hop * hop].reshape(-1, hop).max(1)
    out = np.zeros_like(blocks)
    ka, kr = np.exp(-hop / SR / attack), np.exp(-hop / SR / release)
    v = 0.0
    for i, b in enumerate(blocks):
        k = ka if b > v else kr
        v = k * v + (1 - k) * b
        out[i] = v
    return np.repeat(out, hop)[:len(x)] if len(out) else out


def db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


def main(vo_path, music_path):
    FX.mkdir(parents=True, exist_ok=True)
    # voice chain: low cut, gentle compression, a ceiling, so it can sit loud and stay clean
    vo_raw = decode(vo_path, 1, "highpass=f=75,acompressor=threshold=-26dB:ratio=3:attack=6:release=140:knee=6,"
                                "volume=6dB,alimiter=limit=0.6:attack=3:release=60:level=disabled")[:, 0]
    vo = np.zeros(N)
    i = int(VO_OFFSET * SR)
    vo[i:i + len(vo_raw)] = vo_raw[:N - i]
    speech = vo[np.abs(vo) > 0.01]
    vo *= 10 ** ((-17.0 - db(speech)) / 20)          # voice sits well above everything else
    music = build_music(decode(music_path, 2))
    music *= 10 ** ((-24.0 - db(music[np.abs(music).max(1) > 1e-4])) / 20)
    e = envelope(vo)
    duck = 1 - 0.55 * np.clip(e / 0.05, 0, 1)        # about -7 dB while he speaks
    music *= duck[:, None]
    fx, shots = build_sfx()
    fx *= 10 ** (-9 / 20)
    mix = np.stack([vo, vo], 1) + music + fx
    write(AUD / "narration.wav", vo * 0.5)          # stems at the premaster's level, so they sum to it
    write(AUD / "music.wav", music * 0.5)
    write(AUD / "sfx.wav", fx * 0.5)
    for name, sig in shots.items():
        write(FX / f"{name}.wav", sig * 0.9)
    peak = np.abs(mix).max()
    write(AUD / "mix_premaster.wav", mix * 0.5)          # 6 dB of headroom; mastered in ffmpeg
    print(f"[audio] vo {db(speech):.1f} dB -> placed; music, {len(shots)} sfx; premaster peak {peak:.2f}")


def master():
    """Limit, then normalise to -14 LUFS / -1.5 dBTP (two-pass, linear)."""
    pre = AUD / "mix_premaster.wav"
    chain = "volume=8dB,alimiter=limit=0.82:attack=2:release=50:level=disabled"
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(pre), "-af",
                          chain + ",loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    import json
    m = json.loads(out[out.rindex("{"):out.rindex("}") + 1])
    ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(pre), "-af", chain + "," + ln, "-ar", str(SR),
                    str(AUD / "mix.wav")], check=True)
    print(f"[audio] mastered -> {AUD / 'mix.wav'}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
    master()
