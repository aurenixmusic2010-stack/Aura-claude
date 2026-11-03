// Final composite: glitch slices, RGB channel separation, print-misregistered ink
// overlay, two-tone impact frames, grain, paper tooth, vignette, fades.
import * as THREE from 'three';
import { G } from './toon.js';

const FRAG = /* glsl */ `
uniform sampler2D tScene, tOver;
uniform vec2 uRes; uniform float uPx;
uniform float uSeed, uSplit, uGlitch, uImpact, uFlash, uGrain, uVignette, uFade, uMisreg, uInvert, uThresh, uShakeX, uShakeY, uZoomBlur;
uniform vec3 uInk, uCream, uImpactTint;
varying vec2 vUv;
float h1(float n){ return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 x){ vec2 i=floor(x); vec2 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
vec3 sampleScene(vec2 uv, vec2 off){
  return vec3(texture2D(tScene, uv + off).r, texture2D(tScene, uv).g, texture2D(tScene, uv - off).b);
}
void main(){
  vec2 uv = vUv;
  // glitch: horizontal slice tears + block offsets
  if (uGlitch > 0.001) {
    float rows = 22.0 + 40.0 * h1(uSeed);
    float row = floor(uv.y * rows);
    float r = h1(row * 1.73 + uSeed * 9.1);
    if (r < uGlitch * 0.6) uv.x += (h1(row * 7.1 + uSeed) - 0.5) * 0.22 * uGlitch;
    float blk = h2(floor(uv * vec2(9.0, 16.0)) + uSeed);
    if (blk < uGlitch * 0.12) uv += (vec2(h1(blk * 91.0), h1(blk * 37.0)) - 0.5) * 0.08;
  }
  vec2 c = uv - 0.5;
  vec2 off = (c * length(c) * 2.0 + vec2(0.35, 0.0)) * uSplit / uRes * uPx * 2.0;
  if (uGlitch > 0.001) off += vec2(uGlitch * 0.02 * (h1(floor(uv.y * 30.0) + uSeed) - 0.5), 0.0);
  vec3 col = sampleScene(uv, off);
  if (uZoomBlur > 0.001) {
    vec3 acc = col; float wsum = 1.0;
    for (int i = 1; i < 8; i++) {
      float k = float(i) / 8.0 * uZoomBlur * 0.12;
      acc += sampleScene(uv - c * k, off); wsum += 1.0;
    }
    col = acc / wsum;
  }
  // ink overlay with print misregistration (magenta ghost plate)
  vec2 mo = vec2(uMisreg, -uMisreg * 0.6) / uRes * uPx;
  vec4 o = texture2D(tOver, uv);
  vec4 og = texture2D(tOver, uv + mo);
  float ghost = clamp(og.a - o.a, 0.0, 1.0);
  col = mix(col, vec3(0.2, 0.9, 1.0), ghost * 0.35);
  col = mix(col, o.rgb, o.a);
  // impact frame: hard two-tone
  if (uImpact > 0.5) {
    float l = dot(col, vec3(0.3, 0.59, 0.11));
    float t = step(uThresh, l);
    if (uInvert > 0.5) t = 1.0 - t;
    col = mix(uInk, uImpactTint, t);
  }
  col = mix(col, vec3(1.0), uFlash);
  // paper tooth + grain
  vec2 fc = gl_FragCoord.xy / uPx;
  float paper = vn(fc * 0.9) * 0.6 + vn(fc * 0.13 + 3.0) * 0.4;
  float grain = h2(fc + uSeed * 13.7) - 0.5;
  col += (grain * uGrain) + (paper - 0.5) * 0.035;
  // vignette
  float v = smoothstep(0.95, 0.35, length(c * vec2(1.0, 0.72)));
  col *= mix(1.0, v, uVignette);
  col = mix(col, vec3(0.0), uFade);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Post {
  constructor(W, H) {
    this.rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    this.overCanvas = document.createElement('canvas');
    this.overCanvas.width = W;
    this.overCanvas.height = H;
    this.overTex = new THREE.CanvasTexture(this.overCanvas);
    this.overTex.minFilter = THREE.LinearFilter;
    this.overTex.generateMipmaps = false;
    this.u = {
      tScene: { value: this.rt.texture },
      tOver: { value: this.overTex },
      uRes: G.uRes,
      uPx: G.uPx,
      uSeed: { value: 0 },
      uSplit: { value: 1.5 },
      uGlitch: { value: 0 },
      uImpact: { value: 0 },
      uInvert: { value: 0 },
      uThresh: { value: 0.4 },
      uFlash: { value: 0 },
      uGrain: { value: 0.05 },
      uVignette: { value: 0.35 },
      uFade: { value: 0 },
      uMisreg: { value: 4 },
      uShakeX: { value: 0 },
      uShakeY: { value: 0 },
      uZoomBlur: { value: 0 },
      uInk: { value: new THREE.Color('#0b0812') },
      uCream: { value: new THREE.Color('#fff4dc') },
      uImpactTint: { value: new THREE.Color('#fff4dc') },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    q.frustumCulled = false;
    this.scene.add(q);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  reset() {
    const u = this.u;
    u.uSplit.value = 1.5;
    u.uGlitch.value = 0;
    u.uImpact.value = 0;
    u.uInvert.value = 0;
    u.uThresh.value = 0.4;
    u.uFlash.value = 0;
    u.uGrain.value = 0.05;
    u.uVignette.value = 0.35;
    u.uFade.value = 0;
    u.uMisreg.value = 4;
    u.uZoomBlur.value = 0;
    u.uImpactTint.value.set('#fff4dc');
  }
}
