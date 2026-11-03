// GLITCHBOX shading kit: cel bands with screen-space halftone in the shadows,
// hard rim light, banded cartoon chrome, glass, and boiling inverted-hull ink lines.
import * as THREE from 'three';

export const G = {
  uLightDir: { value: new THREE.Vector3(0.45, 0.65, 0.6).normalize() },
  uRimDir: { value: new THREE.Vector3(-0.7, 0.25, -0.5).normalize() },
  uRimColor: { value: new THREE.Color('#2ee6ff') },
  uKeyColor: { value: new THREE.Color('#ffffff') },
  uShadeTint: { value: new THREE.Color('#ffffff') },
  uRes: { value: new THREE.Vector2(1080, 1920) },
  uPx: { value: 1 }, // pixels per design pixel (render scale)
  uBoil: { value: 0 },
  uTime: { value: 0 },
  uInk: { value: new THREE.Color('#0b0812') },
  uHalftone: { value: 1 },
};

const NOISE = /* glsl */ `
float h31(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
`;
export const GLSL_NOISE = NOISE;

const HALFTONE = /* glsl */ `
uniform vec2 uRes; uniform float uPx;
float halftone(vec2 frag, float amount, float cellPx, float angle){
  float c = cos(angle), s = sin(angle);
  vec2 p = mat2(c,-s,s,c) * frag / (cellPx*uPx);
  vec2 cell = fract(p) - 0.5;
  float d = length(cell);
  float r = sqrt(clamp(amount,0.0,1.0)) * 0.72;
  float aa = 0.08;
  return smoothstep(r + aa, r - aa, d);
}
`;
export const GLSL_HALFTONE = HALFTONE;

const TOON_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vW; varying vec3 vObj;
void main(){
  vec4 lp = vec4(position, 1.0);
  vec3 ln = normal;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
    ln = mat3(instanceMatrix) * ln;
  #endif
  vec4 w = modelMatrix * lp;
  vW = w.xyz; vObj = position;
  vN = normalize(mat3(modelMatrix) * ln);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export { TOON_VERT };

const TOON_FRAG = /* glsl */ `
uniform vec3 uColor, uShade, uDeep, uLightDir, uRimDir, uRimColor, uKeyColor, uShadeTint, uEmit;
uniform float uRim, uHalftone, uSpec, uTerm, uOpacity, uEmitAmt, uFlatten;
${HALFTONE}
varying vec3 vN; varying vec3 vW; varying vec3 vObj;
void main(){
  vec3 N = normalize(vN);
  if(!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(uLightDir);
  float ndl = dot(N, L);
  float aa = max(fwidth(ndl), 0.002) * 1.2;
  float lit = smoothstep(uTerm - aa, uTerm + aa, ndl);
  vec3 col = mix(uShade * uShadeTint, uColor * uKeyColor, lit);
  // halftone dots deepen the shadow side, densest away from the terminator
  float shadeAmt = clamp((uTerm - ndl) * 1.35 + 0.08, 0.0, 1.0) * uHalftone;
  float dots = halftone(gl_FragCoord.xy, shadeAmt, 7.0, 0.785);
  col = mix(col, uDeep, dots * (1.0 - lit));
  // light-side halftone highlight just past the terminator (print feel)
  float hiAmt = clamp(1.0 - abs(ndl - uTerm - 0.12) * 9.0, 0.0, 1.0) * 0.35 * uHalftone;
  col = mix(col, uShade * uShadeTint, halftone(gl_FragCoord.xy, hiAmt, 5.0, 0.3) * lit);
  // toon specular
  vec3 H = normalize(L + V);
  float sp = pow(max(dot(N, H), 0.0), 60.0);
  float spa = fwidth(sp) + 0.01;
  col = mix(col, vec3(1.0), smoothstep(0.55 - spa, 0.55 + spa, sp) * uSpec);
  // hard rim light from the second source
  float fres = 1.0 - max(dot(N, V), 0.0);
  float rimTerm = fres * fres * max(dot(N, normalize(uRimDir)) + 0.35, 0.0);
  float ra = fwidth(rimTerm) + 0.01;
  col = mix(col, uRimColor, smoothstep(0.42 - ra, 0.42 + ra, rimTerm) * uRim);
  col = mix(col, uEmit, uEmitAmt);
  gl_FragColor = vec4(col, uOpacity);
}`;

export function toon(opts = {}) {
  const c = new THREE.Color(opts.color ?? '#ffffff');
  const shade = new THREE.Color(opts.shade ?? c.clone().multiplyScalar(0.45).lerp(new THREE.Color('#2a1d52'), 0.45));
  const deep = new THREE.Color(opts.deep ?? shade.clone().multiplyScalar(0.55).lerp(new THREE.Color('#0b0812'), 0.4));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: c },
      uShade: { value: shade },
      uDeep: { value: deep },
      uEmit: { value: new THREE.Color(opts.emit ?? '#ffffff') },
      uEmitAmt: { value: opts.emitAmt ?? 0 },
      uRim: { value: opts.rim ?? 1 },
      uHalftone: { value: opts.halftone ?? 1 },
      uSpec: { value: opts.spec ?? 0 },
      uTerm: { value: opts.term ?? 0.08 },
      uOpacity: { value: opts.opacity ?? 1 },
      uFlatten: { value: 0 },
      uLightDir: G.uLightDir,
      uRimDir: G.uRimDir,
      uRimColor: G.uRimColor,
      uKeyColor: G.uKeyColor,
      uShadeTint: G.uShadeTint,
      uRes: G.uRes,
      uPx: G.uPx,
    },
    vertexShader: TOON_VERT,
    fragmentShader: TOON_FRAG,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
  });
  return m;
}

// Cartoon chrome: hard reflection bands + a sharp highlight streak.
const CHROME_FRAG = /* glsl */ `
uniform vec3 uLightDir, uRimDir, uRimColor;
uniform vec3 uSky, uMid, uGround, uInkC;
uniform float uGlow;
uniform vec3 uGlowColor;
${HALFTONE}
varying vec3 vN; varying vec3 vW; varying vec3 vObj;
float band(float x, float a, float b){ float w=fwidth(x)+0.004; return smoothstep(a-w,a+w,x)*(1.0-smoothstep(b-w,b+w,x)); }
void main(){
  vec3 N = normalize(vN);
  if(!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  vec3 R = reflect(-V, N);
  float y = R.y + 0.18 * R.x;
  vec3 col = uGround;
  float w = fwidth(y) + 0.004;
  col = mix(col, uMid, smoothstep(-0.35 - w, -0.35 + w, y));
  col = mix(col, uInkC, smoothstep(-0.06 - w, -0.06 + w, y));
  col = mix(col, uSky, smoothstep(0.1 - w, 0.1 + w, y));
  col = mix(col, uMid, band(y, 0.5, 0.58) * 0.7);
  float h = max(dot(R, normalize(uLightDir)), 0.0);
  float hw = fwidth(h) + 0.003;
  col = mix(col, vec3(1.0), smoothstep(0.93 - hw, 0.93 + hw, h));
  // diagonal streak highlight
  float s = dot(normalize(R.xz + 1e-4), vec2(0.6, 0.8));
  col = mix(col, vec3(1.0), band(s, 0.86, 0.92) * smoothstep(0.0, 0.3, R.y) * 0.9);
  float fres = 1.0 - max(dot(N, V), 0.0);
  float rimTerm = fres * fres * max(dot(N, normalize(uRimDir)) + 0.35, 0.0);
  float ra = fwidth(rimTerm) + 0.01;
  col = mix(col, uRimColor, smoothstep(0.45 - ra, 0.45 + ra, rimTerm));
  col = mix(col, uGlowColor, uGlow * (0.4 + 0.6 * fres));
  gl_FragColor = vec4(col, 1.0);
}`;

export function chrome(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSky: { value: new THREE.Color(opts.sky ?? '#e9fbff') },
      uMid: { value: new THREE.Color(opts.mid ?? '#8fa6c9') },
      uGround: { value: new THREE.Color(opts.ground ?? '#7a3a8f') },
      uInkC: { value: new THREE.Color(opts.ink ?? '#1b1430') },
      uGlow: { value: 0 },
      uGlowColor: { value: new THREE.Color('#bff6ff') },
      uLightDir: G.uLightDir,
      uRimDir: G.uRimDir,
      uRimColor: G.uRimColor,
      uRes: G.uRes,
      uPx: G.uPx,
    },
    vertexShader: TOON_VERT,
    fragmentShader: CHROME_FRAG,
    side: opts.side ?? THREE.FrontSide,
  });
}

// Bubble-helmet glass: transparent, fresnel edge, curved highlight streaks.
const GLASS_FRAG = /* glsl */ `
uniform vec3 uTint, uRimColor; uniform float uAlpha, uFog;
varying vec3 vN; varying vec3 vW; varying vec3 vObj;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float f = 1.0 - max(dot(N, V), 0.0);
  vec3 vn = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  float a = uAlpha + smoothstep(0.55, 0.95, f) * 0.45;
  vec3 col = mix(uTint, uRimColor, smoothstep(0.75, 0.95, f));
  // big curved highlight (upper left) and a small dot
  float ang = atan(vn.y, vn.x);
  float rad = length(vn.xy);
  float arc = smoothstep(0.035, 0.0, abs(rad - 0.78)) * smoothstep(1.7, 2.0, ang) * (1.0 - smoothstep(2.6, 2.9, ang));
  float dotH = smoothstep(0.075, 0.06, length(vn.xy - vec2(-0.36, 0.5)));
  float hl = max(arc, dotH);
  col = mix(col, vec3(1.0), hl);
  a = max(a, hl * 0.95);
  a = mix(a, 1.0, uFog);
  col = mix(col, uTint, uFog);
  gl_FragColor = vec4(col, a);
}`;

export function glass(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTint: { value: new THREE.Color(opts.tint ?? '#9fe9ff') },
      uAlpha: { value: opts.alpha ?? 0.07 },
      uFog: { value: 0 },
      uRimColor: G.uRimColor,
    },
    vertexShader: TOON_VERT,
    fragmentShader: GLASS_FRAG,
    transparent: true,
    depthWrite: true,
  });
}

// Inverted hull with a constant screen-space width that boils ~10x/second.
const OUTLINE_VERT = /* glsl */ `
uniform float uWidth, uBoil, uPx, uWobble; uniform vec2 uRes;
${NOISE}
void main(){
  vec4 lp = vec4(position, 1.0);
  vec3 ln = normal;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
    ln = mat3(instanceMatrix) * ln;
  #endif
  vec4 clip = projectionMatrix * modelViewMatrix * lp;
  vec3 nv = normalize(normalMatrix * ln);
  vec4 cn = projectionMatrix * vec4(nv, 0.0);
  vec2 dir = cn.xy;
  float l = length(dir);
  dir = l > 1e-5 ? dir / l : vec2(0.0);
  float n = vnoise(position * 4.0 + vec3(uBoil * 7.13, uBoil * 3.1, 0.0));
  float n2 = vnoise(position * 13.0 - vec3(0.0, uBoil * 5.7, uBoil));
  float w = uWidth * uPx * mix(1.0, 0.45 + 1.1 * n + 0.35 * n2, uWobble);
  clip.xy += dir * w * 2.0 / uRes * clip.w;
  gl_Position = clip;
}`;
const OUTLINE_FRAG = /* glsl */ `
uniform vec3 uInk; uniform float uOpacity;
void main(){ gl_FragColor = vec4(uInk, uOpacity); }`;

export function outlineMat(width = 5, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uWidth: { value: width },
      uWobble: { value: opts.wobble ?? 1 },
      uBoil: G.uBoil,
      uPx: G.uPx,
      uRes: G.uRes,
      uInk: opts.color ? { value: new THREE.Color(opts.color) } : G.uInk,
      uOpacity: { value: 1 },
    },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: THREE.BackSide,
    transparent: !!opts.transparent,
  });
}

// Mesh + ink hull sharing one geometry. Swap geometry with setGeo().
export function inked(geo, mat, width = 5, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (width > 0) {
    const o = new THREE.Mesh(geo, outlineMat(width, opts));
    o.renderOrder = opts.order ?? 0;
    m.add(o);
    m.userData.hull = o;
  }
  m.setGeo = (g) => {
    if (m.geometry && m.geometry !== g && !m.geometry.userData.keep) m.geometry.dispose();
    m.geometry = g;
    if (m.userData.hull) m.userData.hull.geometry = g;
  };
  return m;
}

// Additive glow sprite from a generated radial texture.
const texCache = {};
export function radialTex(key, stops, size = 256) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  texCache[key] = t;
  return t;
}

export function glowSprite(color = '#bff6ff', size = 1, opacity = 1) {
  const tex = radialTex('glow', [
    [0, 'rgba(255,255,255,1)'],
    [0.12, 'rgba(255,255,255,0.85)'],
    [0.3, 'rgba(255,255,255,0.32)'],
    [0.6, 'rgba(255,255,255,0.08)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  const m = new THREE.SpriteMaterial({
    map: tex,
    color: new THREE.Color(color),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

// Four-point cartoon flare spike texture.
export function spikeTex() {
  if (texCache.spike) return texCache.spike;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  for (let k = 0; k < 2; k++) {
    g.save();
    g.rotate((k * Math.PI) / 2);
    const grd = g.createLinearGradient(-S / 2, 0, S / 2, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-S / 2, 0);
    g.quadraticCurveTo(0, -S * 0.018, S / 2, 0);
    g.quadraticCurveTo(0, S * 0.018, -S / 2, 0);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  texCache.spike = t;
  return t;
}

export function spikeSprite(color = '#ffffff', size = 1) {
  const m = new THREE.SpriteMaterial({
    map: spikeTex(),
    color: new THREE.Color(color),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

// Tapered tube along a curve (arms, legs, spoon handle). Rebuilt per frame when
// the curve animates. radiusFn(u) -> radius, flat = [sx, sy] ring squash.
export function taperTube(curve, radiusFn, segs = 24, radial = 12, flat = [1, 1], caps = true) {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [];
  const nor = [];
  const idx = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, P);
    const r = radiusFn(u);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a) * flat[0];
      const cy = Math.sin(a) * flat[1];
      const nx = N.x * cx + B.x * cy;
      const ny = N.y * cx + B.y * cy;
      const nz = N.z * cx + B.z * cy;
      pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r);
      nor.push(N.x * Math.cos(a) / flat[0] + B.x * Math.sin(a) / flat[1], N.y * Math.cos(a) / flat[0] + B.y * Math.sin(a) / flat[1], N.z * Math.cos(a) / flat[0] + B.z * Math.sin(a) / flat[1]);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  if (caps) {
    for (const end of [0, 1]) {
      const i = end * segs;
      const c = pos.length / 3;
      const T = curve.getTangentAt(end).multiplyScalar(end ? 1 : -1);
      const p = curve.getPointAt(end);
      const r = radiusFn(end);
      // hemispherical cap
      const rings = 4;
      let prevStart = i * (radial + 1);
      for (let k = 1; k <= rings; k++) {
        const th = (k / rings) * (Math.PI / 2);
        const ringStart = pos.length / 3;
        for (let j = 0; j <= radial; j++) {
          const a = (j / radial) * Math.PI * 2;
          const N = frames.normals[i];
          const B = frames.binormals[i];
          const cx = Math.cos(a) * flat[0] * Math.cos(th);
          const cy = Math.sin(a) * flat[1] * Math.cos(th);
          const tz = Math.sin(th);
          pos.push(
            p.x + (N.x * cx + B.x * cy) * r + T.x * tz * r,
            p.y + (N.y * cx + B.y * cy) * r + T.y * tz * r,
            p.z + (N.z * cx + B.z * cy) * r + T.z * tz * r,
          );
          nor.push(
            N.x * Math.cos(a) * Math.cos(th) + B.x * Math.sin(a) * Math.cos(th) + T.x * tz,
            N.y * Math.cos(a) * Math.cos(th) + B.y * Math.sin(a) * Math.cos(th) + T.y * tz,
            N.z * Math.cos(a) * Math.cos(th) + B.z * Math.sin(a) * Math.cos(th) + T.z * tz,
          );
        }
        for (let j = 0; j < radial; j++) {
          const a = prevStart + j;
          const b = ringStart + j;
          if (end) idx.push(a, a + 1, b, b, a + 1, b + 1);
          else idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
        prevStart = ringStart;
      }
      void c;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  // normalise normals
  const n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let k = 0; k < n.count; k++) {
    v.fromBufferAttribute(n, k).normalize();
    n.setXYZ(k, v.x, v.y, v.z);
  }
  return g;
}

export const keepGeo = (g) => {
  g.userData.keep = true;
  return g;
};
