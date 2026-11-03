// Neutron star (+ pulsar beams, field lines), the massive progenitor star, and
// supernova debris. All stylised: banded plasma, hard glows, drawn spikes.
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_HALFTONE, G, glowSprite, spikeSprite, taperTube, radialTex } from './toon.js';
import { clamp, hash } from './util.js';

const VERT = /* glsl */ `varying vec3 vN; varying vec3 vW; varying vec3 vObj;
void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; vObj=position; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`;

const NS_FRAG = /* glsl */ `
uniform float uTime, uSpin, uFlash;
varying vec3 vN; varying vec3 vW; varying vec3 vObj;
${GLSL_NOISE}
void main(){
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  float f = max(dot(N, V), 0.0);
  vec3 p = normalize(vObj);
  float lat = p.y;
  float n = vnoise(p * 5.0 + vec3(0.0, uTime * 0.6, 0.0)) * 0.6 + vnoise(p * 11.0 - uTime) * 0.4;
  float stripes = sin(lat * 18.0 + n * 4.0) * 0.5 + 0.5;
  float k = f * 0.9 + stripes * 0.18 + n * 0.12;
  vec3 col = vec3(0.18, 0.55, 1.0);
  float w = fwidth(k) + 0.01;
  col = mix(col, vec3(0.6, 0.95, 1.0), smoothstep(0.55 - w, 0.55 + w, k));
  col = mix(col, vec3(1.0), smoothstep(0.82 - w, 0.82 + w, k));
  // magnetic hot spots at the poles
  float pole = smoothstep(0.82, 0.9, abs(lat));
  col = mix(col, vec3(1.0, 0.95, 0.85), pole);
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;

const BEAM_VERT = /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`;
const BEAM_FRAG = /* glsl */ `
uniform float uTime, uIntensity; uniform vec3 uColor;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  float along = vUv.y; // 0 at star, 1 at far end
  vec3 V = normalize(cameraPosition - vW);
  float edge = 1.0 - abs(dot(normalize(vN), V));
  float core = pow(1.0 - edge, 2.0);
  float fade = pow(1.0 - along, 0.9) * smoothstep(0.0, 0.02, along);
  float rings = smoothstep(0.3, 0.45, sin(along * 70.0 - uTime * 30.0) * 0.5 + 0.5) * 0.3 + 0.7;
  float rim = smoothstep(0.7, 0.95, edge) * 0.6;
  float a = fade * (0.45 + core * 1.1 + rim) * rings * uIntensity;
  vec3 col = mix(uColor, vec3(1.0), core * (1.0 - along));
  gl_FragColor = vec4(col * a, a);
}`;

export class NeutronStar {
  constructor(radius = 0.35) {
    this.root = new THREE.Group();
    this.spinAxis = new THREE.Group(); // tilt of spin axis
    this.root.add(this.spinAxis);
    this.spinner = new THREE.Group(); // rotates about local y
    this.spinAxis.add(this.spinner);
    this.magnetic = new THREE.Group(); // magnetic axis tilted from spin axis
    this.magnetic.rotation.z = 0.5;
    this.spinner.add(this.magnetic);

    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSpin: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: NS_FRAG,
    });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), this.mat);
    this.magnetic.add(this.sphere);
    this.radius = radius;

    // glow layers (camera-facing, not spinning)
    this.glowA = glowSprite('#ffffff', radius * 4.2, 0.95);
    this.glowB = glowSprite('#4fd8ff', radius * 11, 0.55);
    this.glowC = glowSprite('#3b5bff', radius * 26, 0.3);
    this.spikes = spikeSprite('#dffaff', radius * 16);
    this.spikes2 = spikeSprite('#9ff0ff', radius * 9);
    this.spikes2.material.rotation = Math.PI / 4;
    this.root.add(this.glowC, this.glowB, this.glowA, this.spikes, this.spikes2);
    for (const s of [this.glowA, this.glowB, this.glowC, this.spikes, this.spikes2]) s.renderOrder = 8;

    // dipole field lines r = L sin^2(theta)
    this.field = new THREE.Group();
    this.magnetic.add(this.field);
    const fieldMat = new THREE.MeshBasicMaterial({ color: '#5fe9ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    this.fieldMat = fieldMat;
    for (const L of [2.2, 3.4, 5.0]) {
      for (let k = 0; k < 6; k++) {
        const phi = (k / 6) * Math.PI * 2 + L;
        const pts = [];
        for (let i = 0; i <= 40; i++) {
          const th = 0.25 + (i / 40) * (Math.PI - 0.5);
          const r = L * radius * Math.sin(th) ** 2;
          if (r < radius * 0.98) continue;
          pts.push(new THREE.Vector3(r * Math.sin(th) * Math.cos(phi), r * Math.cos(th), r * Math.sin(th) * Math.sin(phi)));
        }
        if (pts.length < 4) continue;
        const c = new THREE.CatmullRomCurve3(pts);
        const m = new THREE.Mesh(taperTube(c, () => radius * 0.02, 40, 5, [1, 1], false), fieldMat);
        m.renderOrder = 7;
        this.field.add(m);
      }
    }

    // pulsar beams along the magnetic axis
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uColor: { value: new THREE.Color('#7ff0ff') } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beams = [];
    for (const dir of [1, -1]) {
      const len = 40;
      const g = new THREE.CylinderGeometry(radius * 3.2, radius * 0.25, len, 32, 1, true);
      g.translate(0, len / 2 + radius * 0.6, 0);
      const b = new THREE.Mesh(g, this.beamMat);
      if (dir < 0) b.rotation.z = Math.PI;
      b.renderOrder = 9;
      this.magnetic.add(b);
      this.beams.push(b);
    }
    this.setBeams(0);
  }
  setBeams(v) {
    this.beamMat.uniforms.uIntensity.value = v;
    for (const b of this.beams) b.visible = v > 0.001;
  }
  update(t, spinAngle, glow = 1) {
    this.mat.uniforms.uTime.value = t;
    this.beamMat.uniforms.uTime.value = t;
    this.spinner.rotation.y = spinAngle;
    const tw = 1 + 0.04 * Math.sin(t * 37.0) + 0.03 * Math.sin(t * 23.0);
    this.glowA.material.opacity = 0.95 * glow;
    this.glowB.material.opacity = 0.55 * glow * tw;
    this.glowC.material.opacity = 0.3 * glow;
    this.spikes.material.opacity = 0.85 * glow;
    this.spikes2.material.opacity = 0.6 * glow;
    this.spikes.material.rotation = t * 0.15;
    this.spikes2.material.rotation = Math.PI / 4 - t * 0.1;
    const s = this.radius;
    this.spikes.scale.setScalar(s * 16 * tw);
  }
}

// --- the massive star (shot 3) -------------------------------------------------
const BIG_FRAG = /* glsl */ `
uniform float uTime, uHeat, uCollapse;
${GLSL_HALFTONE}
varying vec3 vN; varying vec3 vW; varying vec3 vObj;
${GLSL_NOISE}
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5;} return s; }
void main(){
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  float f = max(dot(N, V), 0.0);
  vec3 p = normalize(vObj) * 3.0;
  float n = fbm(p + vec3(uTime * 0.15, uTime * 0.1, -uTime * 0.12));
  float cells = fbm(p * 2.6 - uTime * 0.2);
  float k = f * 0.75 + n * 0.45 + cells * 0.15 - 0.15;
  vec3 deep = mix(vec3(0.75, 0.12, 0.16), vec3(0.2, 0.45, 1.0), uCollapse);
  vec3 mid = mix(vec3(1.0, 0.45, 0.1), vec3(0.5, 0.85, 1.0), uCollapse);
  vec3 hi = mix(vec3(1.0, 0.86, 0.35), vec3(0.9, 0.98, 1.0), uCollapse);
  float w = fwidth(k) + 0.01;
  vec3 col = deep;
  col = mix(col, mid, smoothstep(0.38 - w, 0.38 + w, k));
  col = mix(col, hi, smoothstep(0.62 - w, 0.62 + w, k));
  col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.86 - w, 0.86 + w, k));
  // halftone sunspot shading near the limb
  float limb = clamp((0.45 - f) * 1.6, 0.0, 1.0);
  col = mix(col, deep * 0.5, halftone(gl_FragCoord.xy, limb, 9.0, 0.785));
  col = mix(col, vec3(1.0), uHeat);
  gl_FragColor = vec4(col, 1.0);
}`;

export class BigStar {
  constructor() {
    this.root = new THREE.Group();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHeat: { value: 0 }, uCollapse: { value: 0 }, uRes: G.uRes, uPx: G.uPx },
      vertexShader: VERT,
      fragmentShader: BIG_FRAG,
    });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), this.mat);
    this.root.add(this.sphere);
    // ink outline ring (drawn as back-face hull, see toon outline)
    this.corona = glowSprite('#ff8a3d', 3.4, 0.6);
    this.corona2 = glowSprite('#ffd27a', 2.4, 0.5);
    this.root.add(this.corona, this.corona2);
  }
}

// --- supernova debris: billboarded cel-shaded puffs ----------------------------
function puffTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  // cartoon smoke puff: lit body, offset shadow crescent, ink outline
  const R = S * 0.4;
  g.translate(S / 2, S / 2);
  g.fillStyle = '#0b0812';
  g.beginPath();
  g.arc(0, 0, R + 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7a7a7a';
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(-R * 0.22, -R * 0.24, R * 0.92, 0, Math.PI * 2);
  g.fill();
  // halftone dots on the shadow crescent
  g.fillStyle = '#4a4a4a';
  for (let y = -R; y < R; y += 11) {
    for (let x = -R; x < R; x += 11) {
      const ox = x + ((y / 11) % 2 ? 5.5 : 0);
      const dd = Math.hypot(ox + R * 0.22, y + R * 0.24);
      if (dd > R * 0.92) {
        const rr = Math.min(4.2, (dd - R * 0.92) * 0.18 + 1.2);
        g.beginPath();
        g.arc(ox, y, rr, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  return t;
}

const PUFF_VERT = /* glsl */ `
attribute vec3 aDir; attribute vec4 aData; // speed, size, phase, colorIdx
uniform float uT, uSpread, uSize, uSwirl;
varying vec2 vUv; varying float vCol; varying float vFade; varying float vDepth;
void main(){
  vUv = uv;
  float sp = aData.x;
  float r = uSpread * sp;
  float ang = uSwirl * (1.2 - sp) * 1.2;
  vec3 d = aDir;
  float c = cos(ang), s = sin(ang);
  d = vec3(c*d.x - s*d.y, s*d.x + c*d.y, d.z);
  vec3 center = d * r;
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  vDepth = -mv.z;
  float size = uSize * aData.y * (0.6 + 0.4 * sp);
  mv.xy += position.xy * size;
  vCol = aData.w;
  vFade = aData.z;
  gl_Position = projectionMatrix * mv;
}`;
const PUFF_FRAG = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uC0, uC1, uC2, uC3; uniform float uOpacity, uNear;
varying vec2 vUv; varying float vCol; varying float vFade; varying float vDepth;
void main(){
  if (vDepth < uNear) discard;
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  vec3 base = vCol < 0.5 ? uC0 : vCol < 1.5 ? uC1 : vCol < 2.5 ? uC2 : uC3;
  float lum = t.r;
  vec3 col = lum < 0.1 ? vec3(0.043, 0.031, 0.07) : lum < 0.4 ? base * 0.45 : lum < 0.6 ? base * 0.72 : base;
  if (uOpacity < hashFade(vFade)) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Puffs {
  constructor(count = 260, seed = 1) {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.attributes.position = base.attributes.position;
    g.attributes.uv = base.attributes.uv;
    const dir = [];
    const data = [];
    for (let i = 0; i < count; i++) {
      // a ring nebula facing the camera (xy plane), lumpy and thick
      const th = hash(i * 7.7 + seed * 2) * Math.PI * 2;
      const rad = 1 + (hash(i * 3.1 + seed) - 0.5) * 0.45 + 0.12 * Math.sin(th * 5.0);
      dir.push(Math.cos(th) * rad, Math.sin(th) * rad * 0.92, (hash(i * 1.3 + seed) - 0.5) * 0.55);
      data.push(0.55 + 0.45 * hash(i * 9.1 + seed), 0.5 + hash(i * 4.4 + seed) * 0.9, hash(i * 2.2 + seed), Math.floor(hash(i * 5.5 + seed) * 4));
    }
    g.setAttribute('aDir', new THREE.InstancedBufferAttribute(new Float32Array(dir), 3));
    g.setAttribute('aData', new THREE.InstancedBufferAttribute(new Float32Array(data), 4));
    g.instanceCount = count;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: puffTexture() },
        uT: { value: 0 },
        uSpread: { value: 1 },
        uSize: { value: 1 },
        uSwirl: { value: 0 },
        uOpacity: { value: 1 },
        uNear: { value: 2 },
        uC0: { value: new THREE.Color('#ff2e7e') },
        uC1: { value: new THREE.Color('#2ee6ff') },
        uC2: { value: new THREE.Color('#ff8a3d') },
        uC3: { value: new THREE.Color('#7b3cff') },
      },
      vertexShader: PUFF_VERT,
      fragmentShader: PUFF_FRAG.replace('void main(){', 'float hashFade(float x){ return x; }\nvoid main(){'),
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }
}

// Spark streaks: instanced thin quads moving along directions (explosion / implosion)
const STREAK_VERT = /* glsl */ `
attribute vec3 aDir; attribute vec2 aData;
uniform float uR, uLen, uWidth;
varying float vA;
void main(){
  float r = uR * (0.5 + aData.x);
  vec3 a = aDir * r;
  vec3 b = aDir * (r + uLen * (0.5 + aData.x));
  vec4 ma = modelViewMatrix * vec4(a, 1.0);
  vec4 mb = modelViewMatrix * vec4(b, 1.0);
  vec2 d = normalize(mb.xy - ma.xy + 1e-5);
  vec2 n = vec2(-d.y, d.x);
  vec4 p = mix(ma, mb, position.y + 0.5);
  p.xy += n * position.x * uWidth * (0.5 + aData.y);
  vA = 1.0;
  gl_Position = projectionMatrix * p;
}`;
export class Streaks {
  constructor(count = 160, seed = 3, color = '#ffffff') {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.attributes.position = base.attributes.position;
    const dir = [];
    const data = [];
    for (let i = 0; i < count; i++) {
      const u = hash(i * 3.7 + seed) * 2 - 1;
      const th = hash(i * 5.3 + seed) * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      dir.push(s * Math.cos(th), u, s * Math.sin(th));
      data.push(hash(i * 1.9 + seed), hash(i * 8.3 + seed));
    }
    g.setAttribute('aDir', new THREE.InstancedBufferAttribute(new Float32Array(dir), 3));
    g.setAttribute('aData', new THREE.InstancedBufferAttribute(new Float32Array(data), 2));
    g.instanceCount = count;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uR: { value: 1 }, uLen: { value: 0.5 }, uWidth: { value: 0.02 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
      vertexShader: STREAK_VERT,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor, uOpacity); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }
}

export function shockRing(color = '#ffffff') {
  const tex = radialTex('ring', [
    [0, 'rgba(255,255,255,0)'],
    [0.82, 'rgba(255,255,255,0)'],
    [0.9, 'rgba(255,255,255,1)'],
    [0.95, 'rgba(255,255,255,0.5)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  return m;
}

export { clamp };
