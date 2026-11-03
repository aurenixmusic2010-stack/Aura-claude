// Deterministic animation helpers. Everything in the film is a pure function of
// time, so any frame can be rendered in any order by any worker.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export const E = {
  lin: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in3: (t) => t * t * t,
  out3: (t) => 1 - Math.pow(1 - t, 3),
  inOut3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out5: (t) => 1 - Math.pow(1 - t, 5),
  in5: (t) => t * t * t * t * t,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t) => {
    const s = 1.9;
    const u = t - 1;
    return u * u * ((s + 1) * u + s) + 1;
  },
  outBackBig: (t) => {
    const s = 3.2;
    const u = t - 1;
    return u * u * ((s + 1) * u + s) + 1;
  },
  inBack: (t) => {
    const s = 1.9;
    return t * t * ((s + 1) * t - s);
  },
  outElastic: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  step: (t) => (t < 1 ? 0 : 1),
  hold: () => 0,
};

// Keyframes: K(t, [[t0, v0], [t1, v1, 'ease'], ...]). The ease on a key shapes the
// segment arriving at that key. Values may be numbers or arrays.
export function K(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const ease = typeof e === 'function' ? e : E[e || 'inOut'];
      const u = ease(t1 === t0 ? 1 : (t - t0) / (t1 - t0));
      if (Array.isArray(v0)) return v0.map((a, j) => lerp(a, v1[j], u));
      return lerp(v0, v1, u);
    }
  }
  return keys[keys.length - 1][1];
}

// Integer hash -> [0,1)
export function hash(n) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
export function hash2(a, b) {
  return hash(a * 57.31 + b * 113.97);
}

// Smooth 1D value noise in [-1,1]
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 101.3), hash(i + 1 + seed * 101.3), u) * 2 - 1;
}

// Damped spring response to an impulse at t=0 (0 at rest). Returns oscillation that
// starts at `amp` and settles to 0.
export function wobble(t, freq = 3, damp = 4, amp = 1) {
  if (t < 0) return 0;
  return amp * Math.exp(-damp * t) * Math.cos(2 * Math.PI * freq * t);
}
// Step that overshoots and settles at 1.
export function springTo(t, freq = 2.2, damp = 5) {
  if (t <= 0) return 0;
  return 1 - Math.exp(-damp * t) * Math.cos(2 * Math.PI * freq * t);
}

// Hand-held / impact shake: 2D noise, amplitude decays from `t0`.
export function shake(t, t0, amp, decay = 6, freq = 22, seed = 0) {
  const dt = t - t0;
  if (dt < 0) return [0, 0];
  const a = amp * Math.exp(-decay * dt);
  return [noise1(t * freq, seed + 1) * a, noise1(t * freq, seed + 7) * a];
}

// Animation "on twos": quantise character time to 15 fps for a hand-made cadence.
export const onTwos = (t) => Math.floor(t * 15 + 1e-4) / 15;
export const onThrees = (t) => Math.floor(t * 10 + 1e-4) / 10;

// Boil seed: changes ~10x per second, like redrawn ink lines.
export const boilSeed = (t) => Math.floor(t * 10 + 1e-4);

export const FPS = 30;
export const DURATION = 52;
export const FRAMES = FPS * DURATION;
