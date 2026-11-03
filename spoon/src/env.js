// Space: a baked posterised nebula on a camera-centred sphere (halftone applied in
// screen space every frame), drawn star sprites, and near-field parallax dust.
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_HALFTONE, G } from './toon.js';
import { hash } from './util.js';

const BAKE_FRAG = /* glsl */ `
varying vec2 vUv;
${GLSL_NOISE}
float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<6;i++){ s+=a*vnoise(p); p=p*2.07+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
void main(){
  float lon = (vUv.x - 0.5) * 6.2831853;
  float lat = (vUv.y - 0.5) * 3.14159265;
  vec3 d = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  vec3 q = vec3(fbm(d * 1.6), fbm(d * 1.6 + 4.3), fbm(d * 1.6 - 2.1));
  float a = fbm(d * 2.2 + q * 1.8);
  float b = fbm(d * 3.1 - q * 1.4 + 7.0);
  float band = exp(-pow(d.y * 2.6 + 0.35 * sin(lon * 1.5), 2.0));
  gl_FragColor = vec4(a, b, band, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform sampler2D uBake;
uniform vec3 uC0, uC1, uC2, uC3, uC4;
uniform float uAmt, uFlash, uDots;
${GLSL_HALFTONE}
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float lon = atan(d.x, d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5);
  vec4 s = texture2D(uBake, uv);
  float a = s.r * (0.52 + 0.58 * s.b) * uAmt;
  float b = s.g * (0.5 + 0.55 * s.b) * uAmt;
  vec3 col = uC0;
  float w = 0.012;
  col = mix(col, uC1, smoothstep(0.38 - w, 0.38 + w, a));
  float tdot = halftone(gl_FragCoord.xy, clamp((a - 0.3) * 3.0, 0.0, 1.0) * uDots, 6.0, 0.785);
  col = mix(col, uC1, tdot * 0.9);
  col = mix(col, uC2, smoothstep(0.56 - w, 0.56 + w, a));
  col = mix(col, uC3, smoothstep(0.5 - w, 0.5 + w, b) * 0.85);
  float tdot2 = halftone(gl_FragCoord.xy, clamp((b - 0.42) * 4.0, 0.0, 1.0) * uDots, 6.0, 0.3);
  col = mix(col, uC3, tdot2 * 0.6 * step(b, 0.5));
  col = mix(col, uC4, smoothstep(0.8 - w, 0.8 + w, a) * 0.9);
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(renderer) {
    const rt = new THREE.WebGLRenderTarget(2048, 1024, { type: THREE.HalfFloatType, wrapS: THREE.RepeatWrapping });
    rt.texture.wrapS = THREE.RepeatWrapping;
    const q = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`, fragmentShader: BAKE_FRAG }),
    );
    const sc = new THREE.Scene();
    sc.add(q);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    renderer.setRenderTarget(rt);
    renderer.render(sc, cam);
    renderer.setRenderTarget(null);
    this.palettes = {
      space: ['#06050d', '#140d2e', '#2a1552', '#0e3448', '#b81f5e'],
      deep: ['#040309', '#0f0a24', '#1e0f40', '#0b2a3d', '#b81f63'],
      warm: ['#0a0510', '#2a0d26', '#5a1838', '#1b2a55', '#ff8a3d'],
      dimension: ['#04080e', '#0a1e2c', '#0c3442', '#1d1245', '#1aa6c4'],
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uBake: { value: rt.texture },
        uC0: { value: new THREE.Color() },
        uC1: { value: new THREE.Color() },
        uC2: { value: new THREE.Color() },
        uC3: { value: new THREE.Color() },
        uC4: { value: new THREE.Color() },
        uAmt: { value: 1 },
        uFlash: { value: 0 },
        uDots: { value: 1 },
        uRes: G.uRes,
        uPx: G.uPx,
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 32), this.mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.setPalette('space');
  }
  setPalette(a, b = null, t = 0) {
    const pa = this.palettes[a];
    const pb = b ? this.palettes[b] : pa;
    ['uC0', 'uC1', 'uC2', 'uC3', 'uC4'].forEach((k, i) => {
      this.mat.uniforms[k].value.set(pa[i]).lerp(new THREE.Color(pb[i]), t);
    });
  }
}

const STAR_VERT = /* glsl */ `
attribute vec3 aData; // size, twinkle phase, color
uniform float uPx, uTime, uScale;
varying float vB; varying float vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.75 + 0.25 * sin(uTime * (3.0 + aData.y * 5.0) + aData.y * 40.0);
  gl_PointSize = aData.x * uPx * uScale * tw;
  vB = aData.x; vC = aData.z;
  gl_Position = projectionMatrix * mv;
}`;
const STAR_FRAG = /* glsl */ `
varying float vB; varying float vC; uniform float uOpacity;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  float core = smoothstep(0.32, 0.18, d);
  float cross = vB > 7.0 ? max(smoothstep(0.1, 0.0, abs(p.x)) * (1.0 - abs(p.y)), smoothstep(0.1, 0.0, abs(p.y)) * (1.0 - abs(p.x))) : 0.0;
  float a = max(core, cross);
  if (a < 0.02) discard;
  vec3 col = vC < 0.6 ? vec3(1.0) : vC < 0.8 ? vec3(0.6, 0.95, 1.0) : vec3(1.0, 0.75, 0.9);
  gl_FragColor = vec4(col * a, a * uOpacity);
}`;

export class Stars {
  constructor(count = 2200, radius = 300, seed = 11, sizeMul = 1) {
    const pos = [];
    const data = [];
    for (let i = 0; i < count; i++) {
      const u = hash(i * 1.7 + seed) * 2 - 1;
      const th = hash(i * 3.3 + seed) * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.push(s * Math.cos(th) * radius, u * radius, s * Math.sin(th) * radius);
      const r = hash(i * 9.9 + seed);
      const size = r > 0.985 ? 12 + r * 8 : r > 0.9 ? 5 + r * 2 : 2 + r * 2.5;
      data.push(size * sizeMul, hash(i * 4.1 + seed), hash(i * 6.6 + seed));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aData', new THREE.Float32BufferAttribute(data, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uPx: G.uPx, uTime: G.uTime, uScale: { value: 1 }, uOpacity: { value: 1 } },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = -9;
  }
}

// Near-field dust: small ink-outlined chunks + glints within a box, for parallax.
const DUST_VERT = /* glsl */ `
attribute vec2 aData;
uniform float uPx, uSize; uniform vec2 uRes;
uniform vec3 uVel; // streak direction in view space
varying float vK;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(uSize * aData.x * uPx * 60.0 / max(-mv.z, 0.5), 1.5 * uPx, 40.0 * uPx);
  vK = aData.y;
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FRAG = /* glsl */ `
varying float vK; uniform float uOpacity;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  if (d > 1.0) discard;
  vec3 col = d > 0.72 ? vec3(0.043, 0.031, 0.07) : (vK > 0.7 ? vec3(1.0, 0.18, 0.5) : vK > 0.4 ? vec3(0.6, 0.55, 0.85) : vec3(0.18, 0.9, 1.0));
  if (d < 0.72 && p.x + p.y > 0.25) col *= 0.55;
  gl_FragColor = vec4(col, uOpacity);
}`;
export class Dust {
  constructor(count = 500, box = [40, 30, 60], seed = 5) {
    const pos = [];
    const data = [];
    for (let i = 0; i < count; i++) {
      pos.push((hash(i * 1.1 + seed) - 0.5) * box[0], (hash(i * 2.3 + seed) - 0.5) * box[1], (hash(i * 3.7 + seed) - 0.5) * box[2]);
      data.push(0.4 + hash(i * 5.1 + seed) * 1.2, hash(i * 7.3 + seed));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aData', new THREE.Float32BufferAttribute(data, 2));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uPx: G.uPx, uRes: G.uRes, uSize: { value: 1 }, uOpacity: { value: 1 }, uVel: { value: new THREE.Vector3() } },
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
}
