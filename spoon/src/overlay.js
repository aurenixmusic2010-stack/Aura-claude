// 2D ink layer: kinetic comic lettering, caption boxes, hand-drawn arrows, focus
// lines, emanata, pencil scratches and panel borders. Drawn in 1080x1920 design px.
import { clamp, lerp, hash, E, boilSeed } from './util.js';

export const INK = '#0b0812';
export const CREAM = '#fff4dc';
export const YEL = '#ffd23f';
export const MAG = '#ff2e7e';
export const CYAN = '#2ee6ff';

export class Overlay {
  constructor(canvas, px) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.px = px;
    this.W = 1080;
    this.H = 1920;
    this.t = 0;
  }
  begin(t) {
    this.t = t;
    this.seed = boilSeed(t);
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    g.setTransform(this.px, 0, 0, this.px, 0, 0);
    g.lineJoin = 'round';
    g.lineCap = 'round';
  }
  j(i, amt = 1) {
    // boil jitter in [-amt, amt]
    return (hash(i * 13.17 + this.seed * 7.31) * 2 - 1) * amt;
  }

  // Big comic word(s). p = appear progress (0..1, >1 holds), out = exit progress.
  word(str, x, y, o = {}) {
    const g = this.g;
    const size = o.size ?? 150;
    const font = o.font ?? 'Bangers';
    const p = o.p ?? 1;
    const out = o.out ?? 0;
    if (p <= 0 || out >= 1) return;
    g.save();
    g.translate(x, y);
    g.rotate(((o.rot ?? -3) * Math.PI) / 180);
    if (o.skew) g.transform(1, 0, o.skew, 1, 0, 0);
    g.font = `${o.weight ?? ''} ${size}px ${font}`;
    g.textBaseline = 'middle';
    const spacing = o.spacing ?? size * 0.02;
    const letters = [...str];
    const widths = letters.map((ch) => g.measureText(ch).width + spacing);
    const total = widths.reduce((a, b) => a + b, 0) - spacing;
    let cx = o.align === 'left' ? 0 : -total / 2;
    const stagger = o.stagger ?? 0.06;
    const n = letters.length;
    const stroke = o.stroke ?? size * 0.16;
    const shadowOff = o.shadow ?? size * 0.07;
    const fill = o.fill ?? CREAM;
    const fill2 = o.fill2 ?? null;
    const shadowCol = o.shadowCol ?? MAG;
    const jit = o.jitter ?? 1;
    const passes = [];
    letters.forEach((ch, i) => {
      const lp = clamp((p - i * stagger) / Math.max(1 - (n - 1) * stagger, 0.2));
      const lo = clamp(out);
      if (lp <= 0 || lo >= 1) {
        cx += widths[i];
        return;
      }
      const s = (o.noPop ? 1 : E.outBackBig(lp)) * (1 - E.in(lo));
      const w = widths[i];
      const lx = cx + w / 2 - spacing / 2;
      const rot = this.j(i + 1, 0.04 * jit) + (o.wave ? Math.sin(this.t * 6 + i) * 0.06 : 0);
      const dy = this.j(i + 50, 3 * jit) + (1 - E.out3(lp)) * (o.dropIn ?? -size * 0.5) - E.in(lo) * size * 0.3;
      passes.push({ ch, lx, dy, s, rot });
      cx += w;
    });
    const drawPass = (kind) => {
      for (const L of passes) {
        g.save();
        g.translate(L.lx, L.dy);
        g.rotate(L.rot);
        g.scale(L.s, L.s * (o.stretchY ?? 1));
        g.textAlign = 'center';
        if (kind === 'ghostR' || kind === 'ghostB') {
          // RGB split: coloured copies peek out either side of the ink outline
          const d = size * 0.05 * (1 + 0.35 * Math.sin(this.seed * 1.7 + L.lx));
          g.translate(kind === 'ghostR' ? -d : d, kind === 'ghostR' ? -d * 0.25 : d * 0.25);
          g.globalCompositeOperation = 'lighter';
          g.lineWidth = stroke * 0.9;
          g.strokeStyle = g.fillStyle = kind === 'ghostR' ? 'rgba(255,40,90,0.95)' : 'rgba(30,220,255,0.95)';
          g.strokeText(L.ch, 0, 0);
          g.fillText(L.ch, 0, 0);
        } else if (kind === 'shadow') {
          g.translate(shadowOff, shadowOff);
          g.lineWidth = stroke;
          g.strokeStyle = INK;
          g.fillStyle = shadowCol;
          g.strokeText(L.ch, 0, 0);
          g.fillText(L.ch, 0, 0);
        } else if (kind === 'stroke') {
          g.lineWidth = stroke;
          g.strokeStyle = INK;
          g.strokeText(L.ch, 0, 0);
        } else {
          if (fill2) {
            const gr = g.createLinearGradient(0, -size * 0.4, 0, size * 0.4);
            gr.addColorStop(0, fill);
            gr.addColorStop(0.55, fill);
            gr.addColorStop(0.56, fill2);
            gr.addColorStop(1, fill2);
            g.fillStyle = gr;
          } else g.fillStyle = fill;
          g.fillText(L.ch, 0, 0);
        }
        g.restore();
      }
    };
    if (o.rgb) {
      drawPass('ghostR');
      drawPass('ghostB');
    }
    if (shadowOff > 0) drawPass('shadow');
    drawPass('stroke');
    drawPass('fill');
    g.restore();
  }

  // Hand-lettered title (Caveat Brush), optionally RGB-split.
  title(str, x, y, o = {}) {
    this.word(str, x, y, { stroke: (o.size ?? 150) * 0.13, shadow: (o.size ?? 150) * 0.05, spacing: (o.size ?? 150) * 0.005, ...o, font: "'Caveat Brush'" });
  }

  // Caption box: yellow comic caption with mono text, slides/pops in.
  caption(lines, x, y, o = {}) {
    const p = o.p ?? 1;
    const out = o.out ?? 0;
    if (p <= 0 || out >= 1) return;
    const g = this.g;
    const size = o.size ?? 40;
    const font = o.font ?? 'Space Mono';
    g.save();
    g.font = `700 ${size}px ${font}`;
    const arr = Array.isArray(lines) ? lines : [lines];
    const lh = size * 1.22;
    const w = Math.max(...arr.map((l) => g.measureText(l).width)) + size * 1.1;
    const h = arr.length * lh + size * 0.7;
    const s = E.outBack(clamp(p)) * (1 - E.in(clamp(out)));
    g.translate(x + this.j(3, 1.2), y + this.j(4, 1.2));
    g.rotate(((o.rot ?? -2) * Math.PI) / 180 + this.j(5, 0.004));
    g.scale(s, s);
    const ax = o.align === 'left' ? 0 : o.align === 'right' ? -w : -w / 2;
    // shadow block
    g.fillStyle = INK;
    g.fillRect(ax + 12, -h / 2 + 12, w, h);
    g.fillStyle = o.bg ?? YEL;
    g.fillRect(ax, -h / 2, w, h);
    g.lineWidth = 6;
    g.strokeStyle = INK;
    this.wobblyRect(ax, -h / 2, w, h, 1.5);
    g.fillStyle = o.color ?? INK;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    arr.forEach((l, i) => {
      g.fillText(l, ax + size * 0.55, -h / 2 + size * 0.35 + lh * (i + 0.5));
    });
    g.restore();
  }

  wobblyRect(x, y, w, h, amt = 2) {
    const g = this.g;
    g.beginPath();
    const pts = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
    pts.forEach(([px, py], i) => {
      const jx = this.j(i * 3 + 20, amt);
      const jy = this.j(i * 3 + 21, amt);
      if (i === 0) g.moveTo(px + jx, py + jy);
      else g.lineTo(px + jx, py + jy);
    });
    g.closePath();
    g.stroke();
  }

  // Hand-lettered marker note (Permanent Marker) with optional arrow to a point.
  note(str, x, y, o = {}) {
    const p = o.p ?? 1;
    const out = o.out ?? 0;
    if (p <= 0 || out >= 1) return;
    const g = this.g;
    const size = o.size ?? 52;
    g.save();
    g.globalAlpha = 1 - clamp(out);
    g.translate(x, y);
    g.rotate(((o.rot ?? -4) * Math.PI) / 180 + this.j(7, 0.01));
    g.font = `${Math.round(size * 1.25)}px 'Caveat Brush'`;
    g.textAlign = o.align ?? 'center';
    g.textBaseline = 'middle';
    // write-on reveal: clip a growing rect
    const lines = Array.isArray(str) ? str : [str];
    const wmax = Math.max(...lines.map((l) => g.measureText(l).width));
    const rev = E.out(clamp(p));
    g.beginPath();
    const ox = o.align === 'left' ? 0 : -wmax / 2;
    g.rect(ox - 30, -size * 2 * lines.length, (wmax + 60) * rev, size * 4 * lines.length);
    g.clip();
    lines.forEach((l, i) => {
      const ly = (i - (lines.length - 1) / 2) * size * 1.1;
      g.lineWidth = size * 0.22;
      g.strokeStyle = o.strokeCol ?? INK;
      g.strokeText(l, 0, ly);
      g.fillStyle = o.color ?? CREAM;
      g.fillText(l, 0, ly);
    });
    g.restore();
  }

  arrow(x0, y0, x1, y1, o = {}) {
    const p = clamp(o.p ?? 1);
    if (p <= 0 || (o.out ?? 0) >= 1) return;
    const g = this.g;
    g.save();
    g.globalAlpha = 1 - clamp(o.out ?? 0);
    const bend = o.bend ?? 0.25;
    const mx = (x0 + x1) / 2 - (y1 - y0) * bend;
    const my = (y0 + y1) / 2 + (x1 - x0) * bend;
    const N = 30;
    const pts = [];
    for (let i = 0; i <= N * p; i++) {
      const u = i / N;
      const x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1;
      const y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1;
      pts.push([x + this.j(i + 70, 1.2), y + this.j(i + 90, 1.2)]);
    }
    for (const [lw, col] of [
      [o.w ? o.w + 8 : 16, INK],
      [o.w ?? 8, o.color ?? CREAM],
    ]) {
      g.lineWidth = lw;
      g.strokeStyle = col;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
    if (p >= 0.98 && pts.length > 2) {
      const [ax, ay] = pts[pts.length - 1];
      const [bx, by] = pts[pts.length - 3];
      const a = Math.atan2(ay - by, ax - bx);
      for (const [lw, col] of [
        [o.w ? o.w + 8 : 16, INK],
        [o.w ?? 8, o.color ?? CREAM],
      ]) {
        g.lineWidth = lw;
        g.strokeStyle = col;
        g.beginPath();
        g.moveTo(ax + Math.cos(a + 2.5) * 40, ay + Math.sin(a + 2.5) * 40);
        g.lineTo(ax, ay);
        g.lineTo(ax + Math.cos(a - 2.5) * 40, ay + Math.sin(a - 2.5) * 40);
        g.stroke();
      }
    }
    g.restore();
  }

  // Manga-style focus lines converging on (cx, cy).
  focusLines(cx, cy, amt, o = {}) {
    if (amt <= 0.01) return;
    const g = this.g;
    const count = o.count ?? 90;
    const R = 2400;
    const inner = o.inner ?? 420;
    g.save();
    g.fillStyle = o.color ?? CREAM;
    g.globalAlpha = clamp(amt) * (o.alpha ?? 1);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.j(i + 200, 0.03);
      const w = (0.004 + hash(i * 3.3 + this.seed) * 0.012) * (o.width ?? 1);
      const r0 = inner * (0.75 + hash(i * 5.1 + this.seed * 3) * 0.6) + (1 - amt) * 600;
      g.beginPath();
      g.moveTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R);
      g.lineTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // Parallel speed lines (motion) along angle.
  speedLines(angle, amt, o = {}) {
    if (amt <= 0.01) return;
    const g = this.g;
    g.save();
    g.translate(540, 960);
    g.rotate(angle);
    g.strokeStyle = o.color ?? CREAM;
    g.globalAlpha = clamp(amt) * (o.alpha ?? 0.8);
    const n = o.count ?? 40;
    for (let i = 0; i < n; i++) {
      const y = (hash(i * 7.7 + 1) - 0.5) * 2400;
      const len = 300 + hash(i * 3.1 + this.seed) * 900;
      const x = (hash(i * 5.5 + this.seed * 1.3) - 0.5) * 2600;
      g.lineWidth = 2 + hash(i * 2.2) * 6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + len, y);
      g.stroke();
    }
    g.restore();
  }

  // Animated pencil scratches + specks: changes on every boil step.
  scratches(amt = 1) {
    if (amt <= 0) return;
    const g = this.g;
    const s = this.seed;
    g.save();
    g.lineCap = 'round';
    const n = 5;
    for (let i = 0; i < n; i++) {
      const r = hash(s * 17.1 + i * 3.7);
      if (r < 0.35) continue;
      const x = hash(s * 3.3 + i * 11.1) * 1080;
      const y = hash(s * 5.9 + i * 7.3) * 1920;
      const len = 60 + hash(s + i * 9.1) * 380;
      const a = -1.2 + hash(s * 2.1 + i) * 0.5 + (i % 2) * 1.3;
      g.strokeStyle = i % 3 === 0 ? 'rgba(11,8,18,0.35)' : 'rgba(255,244,220,0.22)';
      g.lineWidth = 1.2 + hash(s + i * 1.7) * 1.8;
      g.globalAlpha = amt;
      g.beginPath();
      g.moveTo(x, y);
      const bx = x + Math.cos(a) * len;
      const by = y + Math.sin(a) * len;
      g.quadraticCurveTo((x + bx) / 2 + 12 * (hash(s + i) - 0.5), (y + by) / 2 + 24 * (hash(s + i * 2) - 0.5), bx, by);
      g.stroke();
    }
    // hatch marks clustered in a corner
    const cx = hash(s * 1.9) > 0.5 ? 90 + hash(s * 4.4) * 200 : 800 + hash(s * 4.4) * 200;
    const cy = hash(s * 8.8) * 1920;
    g.strokeStyle = 'rgba(255,244,220,0.16)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.moveTo(cx + k * 9, cy);
      g.lineTo(cx + k * 9 + 30, cy - 36);
      g.stroke();
    }
    // specks
    for (let k = 0; k < 14; k++) {
      const x = hash(s * 9.1 + k * 1.3) * 1080;
      const y = hash(s * 2.7 + k * 4.9) * 1920;
      g.fillStyle = k % 2 ? 'rgba(255,244,220,0.35)' : 'rgba(11,8,18,0.4)';
      g.beginPath();
      g.arc(x, y, 1 + hash(k + s) * 2.5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // Comic speech bubble with a tail pointing at (tx, ty).
  bubble(lines, x, y, tx, ty, o = {}) {
    const p = o.p ?? 1;
    const out = o.out ?? 0;
    if (p <= 0 || out >= 1) return;
    const g = this.g;
    const size = o.size ?? 86;
    g.save();
    g.font = `${size}px Bangers`;
    const arr = Array.isArray(lines) ? lines : [lines];
    const lh = size * 1.02;
    const w = Math.max(...arr.map((l) => g.measureText(l).width)) + size * 1.3;
    const h = arr.length * lh + size * 0.9;
    const s = E.outBackBig(clamp(p)) * (1 - E.in(clamp(out)));
    g.translate(x, y);
    g.scale(s, s);
    const drawShape = () => {
      g.beginPath();
      const rx = w / 2;
      const ry = h / 2;
      const N = 48;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const wob = 1 + this.j(i + 300, 0.008);
        const px = Math.cos(a) * rx * wob;
        const py = Math.sin(a) * ry * wob;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      // tail
      const ang = Math.atan2(ty - y, tx - x);
      const bx = Math.cos(ang) * rx * 0.75;
      const by = Math.sin(ang) * ry * 0.75;
      const tl = Math.hypot(tx - x, ty - y) / s;
      const ex = Math.cos(ang) * tl;
      const ey = Math.sin(ang) * tl;
      const perp = ang + Math.PI / 2;
      g.moveTo(bx + Math.cos(perp) * 50, by + Math.sin(perp) * 50);
      g.quadraticCurveTo((bx + ex) / 2 + Math.cos(perp) * 10, (by + ey) / 2 + Math.sin(perp) * 10, ex, ey);
      g.quadraticCurveTo((bx + ex) / 2 - Math.cos(perp) * 30, (by + ey) / 2 - Math.sin(perp) * 30, bx - Math.cos(perp) * 50, by - Math.sin(perp) * 50);
    };
    g.save();
    g.translate(14, 14);
    drawShape();
    g.fillStyle = INK;
    g.fill();
    g.restore();
    drawShape();
    g.lineWidth = 16;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = o.bg ?? '#ffffff';
    g.fill();
    g.fillStyle = o.color ?? INK;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    arr.forEach((l, i) => {
      const ly = (i - (arr.length - 1) / 2) * lh + size * 0.04;
      g.save();
      g.translate(this.j(i + 400, 1.5), ly + this.j(i + 410, 1.5));
      g.fillText(l, 0, 0);
      g.restore();
    });
    g.restore();
  }

  // Question mark / exclamation emanata with boil.
  glyph(ch, x, y, o = {}) {
    const p = o.p ?? 1;
    if (p <= 0 || (o.out ?? 0) >= 1) return;
    this.word(ch, x, y, { size: o.size ?? 160, p, out: o.out ?? 0, rot: o.rot ?? 8, fill: o.fill ?? YEL, shadowCol: o.shadowCol ?? MAG, stagger: 0 });
  }

  // Comic panel: border + interior fill, with a white gutter outside.
  panel(x, y, w, h, o = {}) {
    const g = this.g;
    g.save();
    if (o.fill) {
      g.fillStyle = o.fill;
      g.fillRect(x, y, w, h);
    }
    g.lineWidth = o.border ?? 18;
    g.strokeStyle = o.borderCol ?? CREAM;
    g.strokeRect(x - (o.border ?? 18) / 2, y - (o.border ?? 18) / 2, w + (o.border ?? 18), h + (o.border ?? 18));
    g.lineWidth = 6;
    g.strokeStyle = INK;
    this.wobblyRect(x - (o.border ?? 18), y - (o.border ?? 18), w + 2 * (o.border ?? 18), h + 2 * (o.border ?? 18), 1.2);
    g.restore();
  }

  // Comic "burst" (explosion balloon) behind SFX text.
  burst(x, y, r, o = {}) {
    const p = clamp(o.p ?? 1);
    if (p <= 0 || (o.out ?? 0) >= 1) return;
    const g = this.g;
    const n = o.points ?? 16;
    const s = E.outBackBig(p) * (1 - E.in(clamp(o.out ?? 0)));
    g.save();
    g.translate(x, y);
    g.rotate(o.rot ?? 0);
    g.scale(s, s);
    const path = () => {
      g.beginPath();
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r * (0.95 + hash(i * 3.1 + (o.seed ?? 0)) * 0.25) : r * (0.58 + hash(i * 1.7 + (o.seed ?? 0)) * 0.12);
        const px = Math.cos(a) * rr * (o.sx ?? 1.25);
        const py = Math.sin(a) * rr;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
    };
    g.save();
    g.translate(16, 16);
    path();
    g.fillStyle = INK;
    g.fill();
    g.restore();
    path();
    g.fillStyle = o.fill ?? YEL;
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = INK;
    g.stroke();
    g.restore();
  }

  circleWipe(cx, cy, r, color = '#000') {
    // fills everything OUTSIDE radius r (iris)
    const g = this.g;
    g.save();
    g.fillStyle = color;
    g.beginPath();
    g.rect(-50, -50, 1180, 2020);
    g.arc(cx, cy, Math.max(r, 0), 0, Math.PI * 2, true);
    g.fill('evenodd');
    g.restore();
  }

  fill(color, alpha = 1) {
    const g = this.g;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(-10, -10, 1100, 1940);
    g.restore();
  }

  dot(x, y, r, color = '#fff', glow = 0) {
    const g = this.g;
    g.save();
    if (glow > 0) {
      const gr = g.createRadialGradient(x, y, 0, x, y, glow);
      gr.addColorStop(0, 'rgba(190,246,255,0.9)');
      gr.addColorStop(0.3, 'rgba(120,220,255,0.35)');
      gr.addColorStop(1, 'rgba(60,120,255,0)');
      g.fillStyle = gr;
      g.fillRect(x - glow, y - glow, glow * 2, glow * 2);
    }
    g.fillStyle = color;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    g.restore();
  }
}

export { lerp };
