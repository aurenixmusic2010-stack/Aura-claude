"""Procedural sound design for the short: every effect is synthesised (no samples),
so the soundtrack is deterministic and licence-free. Each generator returns a
stereo float32 array at 48 kHz; EVENTS places them on the 52 s timeline (output
times, matching BEAT-SHEET.md)."""
import numpy as np
from scipy import signal

SR = 48000
_rng = np.random.default_rng(1234)


def T(d):
    return np.arange(int(d * SR)) / SR


def noise(d, color="white"):
    n = _rng.standard_normal(int(d * SR))
    if color == "pink":
        f = np.fft.rfft(n)
        k = np.arange(len(f))
        k[0] = 1
        n = np.fft.irfft(f / np.sqrt(k), len(n))
    elif color == "brown":
        n = np.cumsum(n)
        n = signal.sosfilt(signal.butter(1, 20, "hp", fs=SR, output="sos"), n)
    return n / (np.abs(n).max() + 1e-9)


def filt(x, kind, f, order=2):
    sos = signal.butter(order, f, kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def sweep_bp(x, f0, f1, bw=0.6, curve="log"):
    """Band-pass whose centre moves f0 -> f1 over the clip (block-wise, state carried)."""
    out = np.zeros_like(x)
    B = 256
    nb = max(1, len(x) // B)
    zi = None
    for i in range(nb + 1):
        a, b = i * B, min(len(x), (i + 1) * B)
        if a >= b:
            break
        u = i / max(nb, 1)
        fc = f0 * (f1 / f0) ** u if curve == "log" else f0 + (f1 - f0) * u
        lo, hi = max(20, fc / (1 + bw)), min(SR / 2 - 100, fc * (1 + bw))
        sos = signal.butter(2, [lo, hi], "band", fs=SR, output="sos")
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        out[a:b], zi = signal.sosfilt(sos, x[a:b], zi=zi)
    return out


def sweep_lp(x, f0, f1):
    out = np.zeros_like(x)
    B = 256
    nb = max(1, len(x) // B)
    zi = None
    for i in range(nb + 1):
        a, b = i * B, min(len(x), (i + 1) * B)
        if a >= b:
            break
        fc = f0 * (f1 / f0) ** (i / max(nb, 1))
        sos = signal.butter(2, min(fc, SR / 2 - 100), "lp", fs=SR, output="sos")
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        out[a:b], zi = signal.sosfilt(sos, x[a:b], zi=zi)
    return out


def adsr(n, a=0.005, d=0.3, shape=4.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / max(d, 1e-4))
    return e


def bell_env(n, peak=0.6, p=2.0):
    u = np.linspace(0, 1, n)
    e = np.where(u < peak, (u / peak) ** p, ((1 - u) / (1 - peak)) ** (p * 0.7))
    return e


def glide(d, f0, f1, curve="exp"):
    t = T(d)
    u = t / d
    f = f0 * (f1 / f0) ** u if curve == "exp" else f0 + (f1 - f0) * u
    return 2 * np.pi * np.cumsum(f) / SR


def st(x, pan=0.0, width=0.0):
    """mono -> stereo with equal-power pan; width adds a decorrelated side."""
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    out = np.stack([x * l, x * r], 1)
    if width > 0:
        d = int(0.011 * SR)
        side = np.concatenate([np.zeros(d), x[:-d]]) * width
        out[:, 0] += side * 0.5
        out[:, 1] -= side * 0.5
    return out.astype(np.float32)


def pan_sweep(x, p0, p1):
    u = np.linspace(0, 1, len(x))
    p = p0 + (p1 - p0) * u
    return np.stack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)], 1).astype(np.float32)


_ir_cache = {}


def reverb(x, size=1.6, damp=4000, mix=0.3):
    key = (size, damp)
    if key not in _ir_cache:
        n = int(size * SR)
        t = np.arange(n) / SR
        irs = []
        for s in (1, 2):
            r = np.random.default_rng(s).standard_normal(n) * np.exp(-6.9 * t / size)
            r = filt(r, "lp", damp)
            r[: int(0.012 * SR)] = 0
            irs.append(r / np.sqrt(np.sum(r ** 2)))
        _ir_cache[key] = irs
    irs = _ir_cache[key]
    if x.ndim == 1:
        x = st(x)
    wet = np.stack([signal.fftconvolve(x[:, 0], irs[0])[: len(x) + len(irs[0])], signal.fftconvolve(x[:, 1], irs[1])[: len(x) + len(irs[1])]], 1)
    dry = np.pad(x, ((0, len(wet) - len(x)), (0, 0)))
    return (dry * (1 - mix) + wet * mix * 3.0).astype(np.float32)


def norm(x, peak=1.0):
    return x * (peak / (np.abs(x).max() + 1e-9))


# ---------------------------------------------------------------- generators
def blip(f=2600, d=0.25):
    t = T(d)
    x = np.sin(2 * np.pi * f * t) * adsr(len(t), 0.002, 0.05) + 0.3 * np.sin(2 * np.pi * f * 2.01 * t) * adsr(len(t), 0.001, 0.02)
    return st(norm(x))


def glitch(d=0.25, seed=0):
    r = np.random.default_rng(seed + 99)
    n = int(d * SR)
    out = np.zeros((n, 2), np.float32)
    i = 0
    while i < n:
        L = int(r.uniform(0.006, 0.03) * SR)
        kind = r.integers(0, 3)
        t = np.arange(L) / SR
        if kind == 0:
            seg = np.sign(np.sin(2 * np.pi * r.uniform(150, 2500) * t))
        elif kind == 1:
            hold = max(1, int(r.uniform(8, 60)))
            seg = np.repeat(r.uniform(-1, 1, L // hold + 1), hold)[:L]
        else:
            seg = r.standard_normal(L) * 0.7
        seg *= r.uniform(0.3, 1.0) * (r.random() > 0.15)
        p = r.uniform(-0.9, 0.9)
        e = min(L, n - i)
        out[i:i + e, 0] += seg[:e] * np.cos((p + 1) * np.pi / 4)
        out[i:i + e, 1] += seg[:e] * np.sin((p + 1) * np.pi / 4)
        i += L + int(r.uniform(0, 0.012) * SR)
    out[:, 0] = filt(out[:, 0], "hp", 120)
    out[:, 1] = filt(out[:, 1], "hp", 120)
    return norm(out) * 0.9


def metal(f0, d, ratios=(1, 2.32, 4.25, 6.63, 9.38, 12.5), amps=None, strike=0.4, seed=0):
    t = T(d)
    r = np.random.default_rng(seed)
    amps = amps or [1, 0.7, 0.5, 0.35, 0.25, 0.18]
    x = np.zeros(len(t))
    for k, (q, a) in enumerate(zip(ratios, amps)):
        f = f0 * q * (1 + r.uniform(-0.004, 0.004))
        if f > SR / 2.2:
            continue
        tau = d / (1.2 + 0.9 * k)
        beat = 1 + 0.15 * np.sin(2 * np.pi * r.uniform(1, 4) * t)
        x += a * np.sin(2 * np.pi * f * t + r.uniform(0, 6)) * np.exp(-t / tau) * beat
    s = filt(noise(0.02), "hp", 2000) * strike
    x[: len(s)] += s * adsr(len(s), 0.0005, 0.004)
    return x


def shing(f0=2100, d=1.2):
    x = metal(f0, d, ratios=(1, 1.47, 2.09, 2.56, 3.39, 4.1), amps=[1, 0.6, 0.5, 0.35, 0.25, 0.2], strike=0.6, seed=3)
    return st(norm(x), 0, 0.4)


def tink(f0=3200, d=0.3, seed=1):
    return st(norm(metal(f0, d, strike=0.5, seed=seed)))


def clang(f0=160, d=1.6, seed=2):
    x = metal(f0, d, strike=0.8, seed=seed)
    hi = metal(f0 * 3.1, d * 0.5, strike=0.3, seed=seed + 1)
    x[: len(hi)] += 0.8 * hi
    th = thud_m(70, 0.25) * 1.2
    x[: len(th)] += th
    return st(norm(x), 0, 0.3)


def thud_m(f=90, d=0.22):
    t = T(d)
    ph = glide(d, f * 1.8, f * 0.6)
    x = np.sin(ph) * adsr(len(t), 0.002, d * 0.35)
    x += 0.5 * filt(noise(d), "lp", 500) * adsr(len(t), 0.001, d * 0.18)
    return x


def thud(f=90, d=0.25):
    return st(norm(thud_m(f, d)))


def impact(size=1.0, seed=0):
    d = 1.4 * size + 0.4
    t = T(d)
    sub = np.sin(glide(d, 75, 30)) * adsr(len(t), 0.003, 0.45 * size)
    body = sweep_lp(noise(d, "pink"), 3500, 180) * adsr(len(t), 0.002, 0.22 * size)
    crack = filt(noise(0.03), "hp", 2500) * adsr(int(0.03 * SR), 0.0005, 0.006)
    x = sub * 1.1 + body * 0.9
    x[: len(crack)] += crack * 0.9
    return reverb(st(norm(x), 0, 0.5), 1.8, 3000, 0.22)


def reverse_swell(d=0.6):
    x = reverb(st(filt(noise(0.25, "pink"), "lp", 6000) * adsr(int(0.25 * SR), 0.001, 0.05)), 1.4, 6000, 0.9)
    x = x[: int(d * SR)][::-1]
    x = x * np.linspace(0, 1, len(x))[:, None] ** 2
    return norm(x)


def whoosh(d=0.6, f0=500, f1=2500, p0=-0.5, p1=0.5, bw=0.8, peak=0.55):
    x = sweep_bp(noise(d, "pink"), f0, f1, bw) * bell_env(int(d * SR), peak, 2.0)
    return norm(pan_sweep(norm(x), p0, p1))


def riser(d=0.8, f0=300, f1=5000):
    n = int(d * SR)
    x = sweep_bp(noise(d), f0, f1, 0.5) * np.linspace(0, 1, n) ** 2
    ph = glide(d, f0 * 0.5, f1 * 0.12)
    x += 0.35 * np.sign(np.sin(ph)) * np.linspace(0, 1, n) ** 3 * 0.3
    return st(norm(x), 0, 0.5)


def falling_whistle(d=0.6, f0=1800, f1=450):
    t = T(d)
    f = f0 * (f1 / f0) ** (t / d) * (1 + 0.015 * np.sin(2 * np.pi * 7 * t))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * bell_env(len(t), 0.15, 1.5)
    return st(norm(x))


def pop():
    d = 0.12
    t = T(d)
    x = np.sin(glide(d, 1100, 300)) * adsr(len(t), 0.001, 0.03)
    c = filt(noise(0.008), "bp", [800, 4000])
    x[: len(c)] += c * 0.8
    return st(norm(x))


def snap():
    d = 0.4
    t = T(d)
    crack = filt(noise(0.006), "hp", 3000)
    tw = np.sin(2 * np.pi * np.cumsum(170 * (1 + 0.25 * np.exp(-t * 12) * np.sin(2 * np.pi * 28 * t))) / SR) * adsr(len(t), 0.001, 0.09)
    x = tw * 0.6
    x[: len(crack)] += crack * 1.2
    return st(norm(x), 0, 0.2)


def stretch(d=0.7, f0=320, f1=900):
    t = T(d)
    f = f0 * (f1 / f0) ** (t / d) * (1 + 0.03 * np.sin(2 * np.pi * 11 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = sum(np.sin(ph * k) / k for k in range(1, 7))
    x = filt(x, "bp", [500, 3500]) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 23 * t))) * bell_env(len(t), 0.7, 1.2)
    return st(norm(x))


def boing(f=220, d=0.6):
    t = T(d)
    fr = f * (1 + 0.6 * np.exp(-t * 5) * np.sin(2 * np.pi * 10 * t))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    x = (np.sin(ph) + 0.3 * np.sin(2 * ph)) * adsr(len(t), 0.003, d * 0.4)
    return st(norm(x))


def creak(d=0.8, rate=40, res=(320, 760, 1350), seed=0):
    r = np.random.default_rng(seed + 7)
    n = int(d * SR)
    imp = np.zeros(n)
    i = 0
    while i < n:
        imp[i] = r.uniform(0.5, 1)
        i += int(SR / (rate * r.uniform(0.7, 1.3)))
    x = sum(filt(imp, "bp", [f * 0.9, f * 1.1]) * (1 / (k + 1)) for k, f in enumerate(res))
    x *= bell_env(n, 0.5, 1.0)
    return st(norm(x), r.uniform(-0.4, 0.4))


def explosion(d=3.0, seed=0):
    n = int(d * SR)
    t = np.arange(n) / SR
    roar = sweep_lp(noise(d, "pink"), 9000, 220) * adsr(n, 0.004, 0.9)
    sub = np.sin(glide(d, 60, 25)) * adsr(n, 0.003, 1.1)
    r = np.random.default_rng(seed + 5)
    crk = np.zeros(n)
    for _ in range(int(140 * d)):
        k = int(r.exponential(0.5) * SR)
        if k < n:
            crk[k] += r.uniform(-1, 1)
    crk = filt(crk, "bp", [1500, 7000]) * np.exp(-t / 0.9)
    x = roar * 1.0 + sub * 1.0 + crk * 0.6
    return reverb(st(norm(x), 0, 0.7), 2.6, 2500, 0.3)


def implosion(d=1.4):
    x = whoosh(d, 6000, 150, 0.6, -0.6, 0.9, 0.85)
    t = T(d)
    tone = np.sin(glide(d, 80, 600)) * np.linspace(0, 1, len(t)) ** 3 * 0.5
    x[:, 0] += tone
    x[:, 1] += tone
    return norm(x)


def zap(d=0.45, f=110):
    t = T(d)
    fm = f * (1 + 2.0 * filt(noise(d), "lp", 60) * 8)
    ph = 2 * np.pi * np.cumsum(np.abs(fm) + f) / SR
    x = (2 * ((ph / (2 * np.pi)) % 1) - 1) * adsr(len(t), 0.002, d * 0.35)
    x = filt(x, "bp", [150, 6000]) + 0.4 * filt(noise(d), "hp", 4000) * adsr(len(t), 0.001, 0.05)
    return st(norm(x), 0, 0.5)


def sparkle(seed=0, n=3, base=2200):
    r = np.random.default_rng(seed)
    d = 0.9
    t = T(d)
    x = np.zeros(len(t))
    scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2]
    for k in range(n):
        f = base * scale[r.integers(0, len(scale))] * (2 if r.random() > 0.6 else 1)
        o = int(k * 0.045 * SR)
        e = adsr(len(t) - o, 0.001, 0.22)
        x[o:] += (np.sin(2 * np.pi * f * t[: len(t) - o]) + 0.4 * np.sin(2 * np.pi * f * 1.003 * t[: len(t) - o])) * e
    return reverb(st(norm(x), r.uniform(-0.5, 0.5), 0.3), 1.8, 9000, 0.35)


def shimmer(d=1.2, seed=0, base=2000):
    out = np.zeros((int((d + 1.0) * SR), 2), np.float32)
    r = np.random.default_rng(seed + 11)
    for k in range(int(d * 14)):
        s = sparkle(seed * 31 + k, 1, base * r.uniform(0.9, 1.6))
        o = int(r.uniform(0, d) * SR)
        e = min(len(s), len(out) - o)
        out[o:o + e] += s[:e] * r.uniform(0.3, 1.0)
    return norm(out)


def cricket(d=0.6):
    t = T(d)
    gate = ((t % 0.32) < 0.075) * (np.sin(2 * np.pi * 40 * t) > 0)
    x = np.sin(2 * np.pi * 4600 * t) * gate * (0.7 + 0.3 * np.sin(2 * np.pi * 3 * t))
    x = filt(x.astype(float), "bp", [3500, 6000])
    return reverb(st(norm(x), 0.3), 1.2, 8000, 0.25)


def tweets(d=1.8, seed=0):
    r = np.random.default_rng(seed + 3)
    n = int(d * SR)
    x = np.zeros(n)
    tt = 0.0
    while tt < d - 0.1:
        L = 0.07
        t = T(L)
        f0 = r.uniform(2600, 3400)
        c = np.sin(glide(L, f0, f0 * r.uniform(1.15, 1.35))) * bell_env(len(t), 0.3, 1.5)
        o = int(tt * SR)
        x[o:o + len(c)] += c[: n - o]
        tt += r.uniform(0.09, 0.2)
    p = np.sin(2 * np.pi * 1.2 * np.arange(n) / SR) * 0.7
    return norm(np.stack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)], 1).astype(np.float32))


def whir(d=2.0, f0=250, f1=1100):
    t = T(d)
    f = f0 * (f1 / f0) ** (t / d)
    ph = 2 * np.pi * np.cumsum(f) / SR
    am = 0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(f / 18) / SR)
    x = (np.sign(np.sin(ph)) * 0.3 + np.sin(ph)) * am
    x = filt(x, "lp", 3000) * bell_env(len(t), 0.7, 1.2)
    x += 0.5 * sweep_bp(noise(d), 400, 2500, 0.6) * am * bell_env(len(t), 0.7, 1.2)
    return st(norm(x), 0, 0.4)


def whum(d=0.4):
    t = T(d)
    x = (np.sin(2 * np.pi * 70 * t) + 0.5 * np.sin(2 * np.pi * 140 * t)) * bell_env(len(t), 0.35, 1.6)
    x += 0.6 * sweep_bp(noise(d, "pink"), 300, 1400, 0.7) * bell_env(len(t), 0.4, 1.6)
    return st(norm(x), 0, 0.6)


def hum(d=2.0, f=55):
    t = T(d)
    x = sum(np.sin(2 * np.pi * f * k * t + k) / k for k in (1, 2, 3, 5)) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.7 * t))
    x *= np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.6)
    return st(norm(x), 0, 0.5)


def rumble(d=2.6):
    n = int(d * SR)
    x = filt(noise(d, "brown"), "lp", 160) * 1.2 + 0.4 * filt(noise(d), "bp", [200, 900]) * (0.5 + 0.5 * np.abs(filt(noise(d), "lp", 6)))
    x += 0.6 * np.sin(2 * np.pi * 38 * np.arange(n) / SR)
    x *= np.linspace(0.15, 1, n) ** 1.5
    return st(norm(x), 0, 0.7)


def tape(d=0.45, seed=0):
    r = np.random.default_rng(seed + 21)
    n = int(d * SR)
    am = np.zeros(n)
    i = 0
    while i < n:
        am[i:i + int(0.004 * SR)] = r.uniform(0.4, 1)
        i += int(SR / r.uniform(35, 90))
    am = filt(am, "lp", 400)
    x = filt(noise(d), "bp", [1300, 6000]) * (0.3 + am) * bell_env(n, 0.3, 1.0)
    return st(norm(x), 0.2)


def ding(f=1320, d=1.6):
    x = metal(f, d, ratios=(1, 2.0, 2.76, 4.07, 5.4), amps=[1, 0.5, 0.35, 0.2, 0.12], strike=0.2, seed=9)
    return reverb(st(norm(x)), 1.6, 9000, 0.3)


def pizz(f=220, d=0.45):
    n = int(d * SR)
    L = int(SR / f)
    buf = np.random.default_rng(int(f)).uniform(-1, 1, L)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % L]
        buf[i % L] = 0.5 * (buf[i % L] + buf[(i + 1) % L]) * 0.996
    out = filt(out, "lp", 2500)
    return st(norm(out) * adsr(n, 0.001, 0.18)[:, None][:, 0], 0.1)


def paper(d=0.2, slam=False):
    n = int(d * SR)
    x = filt(noise(d), "bp", [1500, 7000]) * bell_env(n, 0.25, 1.6)
    if slam:
        th = thud_m(110, 0.18)
        x[: len(th)] += th * 1.3
    return st(norm(x))


def marker(d=0.45):
    t = T(d)
    am = np.abs(np.sin(2 * np.pi * 7 * t)) ** 0.5
    x = filt(noise(d), "bp", [1100, 3200]) * am * bell_env(len(t), 0.5, 1.0)
    return st(norm(x), -0.3)


def plunk():
    d = 0.35
    t = T(d)
    x = np.sin(glide(0.08, 260, 1100)) * adsr(int(0.08 * SR), 0.001, 0.05)
    y = np.zeros(len(t))
    y[: len(x)] += x
    o = int(0.09 * SR)
    x2 = np.sin(glide(0.06, 420, 1300)) * adsr(int(0.06 * SR), 0.001, 0.03) * 0.45
    y[o:o + len(x2)] += x2
    return reverb(st(norm(y)), 1.0, 5000, 0.3)


def void(d=0.7):
    x = whoosh(d, 1800, 70, 0.0, 0.0, 1.0, 0.3)
    t = T(d)
    s = np.sin(glide(d, 90, 35)) * bell_env(len(t), 0.4, 1.5)
    x[:, 0] += s
    x[:, 1] += s
    return norm(x)


def power_up(d=0.9):
    t = T(d)
    ph = glide(d, 140, 900)
    x = (np.sign(np.sin(ph)) * 0.4 + np.sin(ph)) * np.linspace(0.3, 1, len(t)) * adsr(len(t), 0.01, d)
    x = filt(x, "lp", 4000)
    b = boing(110, d)[:, 0]
    x[: len(b)] += b * 0.8
    return reverb(st(norm(x), 0, 0.5), 1.4, 6000, 0.25)


def record_scratch(music, at, d=0.36):
    """Vinyl scratch made from the music itself: the read head yanks back and forth."""
    n = int(d * SR)
    t = np.arange(n) / SR
    base = at * SR
    # position: forward, quick back-yank, forward drag (classic baby scratch)
    pos = base + SR * (0.5 * t - 0.09 * np.sin(np.pi * t / d * 2.0) * np.exp(-t * 2))
    pos = np.clip(pos, 0, len(music) - 2)
    i0 = pos.astype(int)
    fr = pos - i0
    seg = music[i0] * (1 - fr[:, None]) + music[i0 + 1] * fr[:, None]
    seg = np.stack([filt(seg[:, 0], "bp", [250, 6000]), filt(seg[:, 1], "bp", [250, 6000])], 1)
    seg *= bell_env(n, 0.2, 0.8)[:, None]
    return norm(seg.astype(np.float32))


# ---------------------------------------------------------------- the timeline
def pulsar_pulses(t0=26.0, t1=35.0, speed=1.0 / 0.9):
    """Beam-pass times for shot 05 (replicates spinAngle() in shots2.js)."""
    def spin(src):
        r0, r1, Tm = 0.3, 1.25, 1.2
        if src < Tm:
            return 2 * np.pi * (r0 * src + (r1 - r0) * src ** 3 / (3 * Tm * Tm))
        return 2 * np.pi * (r0 * Tm + (r1 - r0) * Tm / 3 + r1 * (src - Tm))
    out = []
    prev = None
    for T_ in np.arange(t0, t1, 1 / 240):
        k = int(spin((T_ - t0) * speed) // np.pi)
        if prev is not None and k != prev:
            out.append((round(float(T_), 3), k))
        prev = k
    return out


def events(music):
    E = []  # (time, sound, gain_db, hero)
    a = E.append
    # ---- SHOT 01 — the hook
    a((0.10, blip(2600, 0.3), -14, 0))
    a((0.20, riser(0.14, 800, 6000), -24, 0))
    a((0.34, glitch(0.22, 1), -9, 0))
    a((0.36, shing(2100, 1.3), -12, 0))
    a((0.38, whoosh(0.55, 3200, 700, -0.4, 0.4), -15, 0))
    a((0.62, whoosh(0.6, 500, 1400, -0.8, -0.2), -21, 0))
    a((1.08, tink(3400, 0.3), -17, 0))
    a((1.30, reverse_swell(0.6), -9, 0))
    a((1.42, hum(0.5, 90), -16, 0))
    a((1.90, impact(1.0), -2, 1))
    a((1.90, clang(190, 1.4), -12, 0))
    a((2.55, falling_whistle(0.5, 1700, 420), -15, 0))
    a((2.62, whoosh(0.45, 1500, 250, 0, 0), -12, 0))
    # ---- SHOT 02 — the impossible spoon
    a((3.08, clang(150, 1.8, 4), -3, 1))
    a((3.09, thud(55, 0.35), -6, 0))
    a((3.12, boing(85, 0.8), -15, 0))
    a((3.20, thud(95, 0.2), -10, 0))
    a((3.21, paper(0.12), -22, 0))
    a((4.30, creak(0.6, 35, seed=1), -15, 0))
    a((4.85, stretch(0.55, 300, 420), -20, 0))
    a((5.15, creak(0.7, 28, seed=2), -13, 0))
    a((5.65, pop(), -8, 0))
    a((5.66, stretch(0.72, 380, 950), -12, 0))
    a((6.40, snap(), -5, 1))
    a((6.42, whoosh(0.32, 400, 3500, 0, 0), -12, 0))
    a((6.50, falling_whistle(0.26, 2000, 520), -16, 0))
    a((6.77, thud(80, 0.28), -5, 0))
    a((6.78, boing(160, 0.5), -16, 0))
    a((7.15, paper(0.18), -15, 0))
    a((7.23, paper(0.18), -15, 0))
    a((7.33, pop(), -15, 0))
    a((7.62, cricket(0.55), -19, 0))
    a((8.13, whoosh(0.5, 300, 6000, 0, 0, 0.7, 0.7), -10, 0))
    a((8.20, shimmer(0.5, 1), -17, 0))
    # ---- SHOT 03 — the star collapses
    a((8.45, rumble(2.6), -11, 0))
    a((10.45, riser(0.6, 250, 4000), -12, 0))
    a((11.05, explosion(3.0), 0, 1))
    a((11.15, whoosh(0.9, 2500, 200, -0.6, 0.6), -10, 0))
    a((12.05, implosion(1.45), -8, 0))
    a((13.55, zap(0.4, 140), -7, 1))
    a((13.55, shing(3600, 0.9), -12, 0))
    a((13.60, hum(2.2, 62), -21, 0))
    a((14.56, boing(520, 0.35), -17, 0))
    # ---- SHOT 04 — the density reveal
    a((15.85, whoosh(0.45, 200, 5000, 0, 0), -11, 0))
    a((15.95, shimmer(0.4, 2), -17, 0))
    a((16.25, whir(1.7, 500, 800), -24, 0))
    a((17.98, stretch(0.7, 600, 260), -10, 0))
    a((17.98, creak(0.7, 55, (180, 420, 900), 3), -13, 0))
    a((19.02, thud(110, 0.25), -10, 0))
    a((20.22, glitch(0.3, 2), -8, 0))
    a((20.45, whoosh(0.5, 4000, 300, 0.3, -0.3), -14, 0))
    a((21.10, tink(2900, 0.35, 5), -15, 0))
    a((21.44, impact(1.0, 1), -5, 1))
    a((21.48, creak(0.8, 30, (220, 520, 1100), 4), -10, 0))
    a((22.00, creak(1.0, 22, (260, 610, 1300), 5), -15, 0))
    a((23.29, snap(), -4, 1))
    a((23.29, impact(0.6, 2), -7, 0))
    a((23.42, clang(260, 1.0, 6), -9, 0))
    a((23.52, clang(235, 1.1, 7), -10, 0))
    a((23.74, whoosh(0.4, 600, 1800, 0.6, 0.1), -17, 0))
    a((23.86, tape(0.5, 1), -11, 0))
    a((24.15, tape(0.25, 2), -12, 0))
    a((24.40, ding(1320, 1.4), -10, 0))
    a((24.85, explosion(2.2, 1), -1, 1))
    r = np.random.default_rng(77)
    for k in range(9):
        a((24.95 + k * 0.09 + r.uniform(0, 0.05), tink(r.uniform(700, 2200), 0.5, 10 + k), -13 - k * 0.6, 0))
    a((25.65, glitch(0.35, 3), -8, 0))
    # ---- SHOT 05 — the cosmic lighthouse
    a((26.00, glitch(0.25, 4), -10, 0))
    a((26.20, whir(1.0, 180, 900), -12, 0))
    a((26.81, zap(0.6, 95), -6, 1))
    a((26.81, hum(0.9, 70), -10, 0))
    pulses = pulsar_pulses()
    for i, (tp, k) in enumerate(pulses):
        if tp > 27.0:
            a((tp - 0.12, whum(0.42), -17, 0))
            if 30.2 < tp < 32.3 and k % 2 == 0:
                a((tp, zap(0.22, 180), -13, 0))
    for tf, p in ((27.6, -0.7), (28.5, 0.7), (29.4, -0.5)):
        a((tf, whoosh(0.5, 400, 2200, p, -p), -14, 0))
    a((30.30, whir(2.0, 300, 1300), -12, 0))
    a((32.30, tweets(1.7), -15, 0))
    a((34.10, whoosh(0.7, 2000, 200, 0, 0), -14, 0))
    # ---- SHOT 06 — recap + the final joke
    a((35.00, whoosh(0.9, 3000, 300, 0.3, -0.3), -11, 0))
    a((35.20, hum(8.6, 55), -25, 0))
    for i, (ts, pn) in enumerate(((36.85, -0.7), (37.00, 0.7), (37.12, 0.2), (37.25, -0.4), (37.36, 0.8), (37.48, -0.1))):
        a((ts, sparkle(40 + i, 2, 2400), -15, 0))
    a((39.70, hum(1.6, 98), -16, 0))
    a((40.95, shimmer(1.2, 3, 2200), -13, 0))
    a((42.05, marker(0.4), -17, 0))
    for i, f in enumerate((196, 247, 220, 262)):
        a((42.62 + i * 0.19, pizz(f, 0.4), -15, 0))
    a((43.64, record_scratch(music, 43.6), -5, 1))
    # 44.00–44.62: dramatic silence (nothing)
    a((44.62, power_up(0.9), -6, 1))
    a((44.65, impact(0.7, 3), -7, 0))
    a((45.35, whoosh(0.25, 800, 3000, -0.4, 0.2), -12, 0))
    a((45.57, impact(0.8, 4), -4, 1))
    a((48.05, tink(2600, 0.25, 30), -13, 0))
    a((48.08, falling_whistle(0.7, 1800, 350), -12, 0))
    a((48.25, paper(0.22, True), -8, 0))
    a((48.80, plunk(), -7, 0))
    a((49.35, void(0.7), -9, 0))
    a((49.98, impact(0.45, 5), -10, 0))
    a((50.02, sparkle(77, 3, 1800), -14, 0))
    x = reverse_swell(0.4)
    a((51.33, x, -14, 0))
    a((51.80, blip(3100, 0.18), -16, 0))
    return E


def render(music, dur=52.0):
    n = int(dur * SR)
    out = np.zeros((n, 2), np.float32)
    hero = np.zeros(n, np.float32)
    for (t0, snd, gdb, h) in events(music):
        o = int(t0 * SR)
        if o >= n:
            continue
        e = min(len(snd), n - o)
        out[o:o + e] += snd[:e] * (10 ** (gdb / 20))
        if h:
            hero[o:o + int(0.9 * SR)] = 1
    # nothing may sound inside the dramatic silence
    out[int(44.0 * SR):int(44.62 * SR)] = 0
    return out, hero[:n]
