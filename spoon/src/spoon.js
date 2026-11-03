// The teaspoon: cartoon chrome, a bowl of glowing neutron-star matter, and a face
// (and arms) it is hiding until it needs them.
import * as THREE from 'three';
import { toon, chrome, inked, taperTube, keepGeo, glowSprite, GLSL_NOISE } from './toon.js';
import { clamp, lerp } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const MATTER_FRAG = /* glsl */ `
uniform float uTime, uHeat;
varying vec3 vN; varying vec3 vW; varying vec3 vObj;
${GLSL_NOISE}
void main(){
  vec3 p = vObj * 9.0;
  float n = vnoise(p + vec3(uTime * 1.3, -uTime * 0.7, uTime));
  n += 0.5 * vnoise(p * 2.3 - vec3(0.0, uTime * 2.1, 0.0));
  n /= 1.5;
  vec3 V = normalize(cameraPosition - vW);
  float f = max(dot(normalize(vN), V), 0.0);
  float k = n * 0.55 + f * 0.55 + 0.08;
  vec3 c1 = vec3(0.16, 0.62, 1.0), c2 = vec3(0.62, 0.97, 1.0), c3 = vec3(1.0);
  float w = fwidth(k) + 0.01;
  vec3 col = mix(c1, c2, smoothstep(0.42 - w, 0.42 + w, k));
  col = mix(col, c3, smoothstep(0.66 - w, 0.66 + w, k));
  col = mix(col, vec3(1.0), uHeat);
  gl_FragColor = vec4(col, 1.0);
}`;

export function matterMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHeat: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying vec3 vObj;
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; vObj=position; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: MATTER_FRAG,
  });
}

export class Spoon {
  constructor() {
    this.root = new THREE.Group(); // pivot at bowl/handle neck
    this.inner = new THREE.Group();
    this.root.add(this.inner);
    this.chromeMat = chrome();
    const cm = this.chromeMat;

    // bowl: lower half-ellipsoid, open top filled by the matter dome
    const bowl = inked(keepGeo(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), cm, 5);
    bowl.scale.set(0.27, 0.12, 0.36);
    bowl.position.set(0, 0, 0.34);
    this.inner.add(bowl);
    this.bowl = bowl;
    const lip = inked(keepGeo(new THREE.TorusGeometry(1, 0.035, 8, 48)), cm, 3);
    lip.rotation.x = Math.PI / 2;
    lip.scale.set(0.27, 0.36, 0.6);
    lip.position.set(0, 0, 0.34);
    this.inner.add(lip);

    this.matter = matterMat();
    const dome = new THREE.Mesh(keepGeo(new THREE.SphereGeometry(1, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2)), this.matter);
    dome.scale.set(0.255, 0.11, 0.345);
    dome.position.set(0, 0.005, 0.34);
    this.inner.add(dome);
    this.dome = dome;
    this.glow = glowSprite('#7fe8ff', 1.6, 0.8);
    this.glow.position.set(0, 0.1, 0.34);
    this.inner.add(this.glow);

    // handle: flattened tapered tube with a gentle S-rise
    const hc = new THREE.CubicBezierCurve3(V(0, 0.0, 0.02), V(0, 0.06, -0.35), V(0, 0.2, -0.7), V(0, 0.24, -1.08));
    const handle = inked(
      keepGeo(taperTube(hc, (u) => 0.05 + 0.075 * Math.pow(u, 2.0) + 0.012 * Math.sin(u * Math.PI), 40, 14, [0.38, 1.0])),
      cm,
      4.5,
    );
    this.inner.add(handle);
    this.handle = handle;
    this.handleCurve = hc;

    // --- face: lives ON the glowing matter, facing +y (out of the bowl) ---------
    this.face = new THREE.Group();
    this.face.position.set(0, 0.105, 0.34);
    this.inner.add(this.face);
    const white = toon({ color: '#ffffff', shade: '#ffffff', deep: '#ffffff', halftone: 0, rim: 0 });
    const ink = toon({ color: '#120c1c', shade: '#0b0812', deep: '#0b0812', rim: 0, halftone: 0 });
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * 0.1, 0.03, 0.05);
      this.face.add(g);
      const w = inked(keepGeo(new THREE.SphereGeometry(1, 24, 16)), white, 5.5);
      w.scale.set(0.085, 0.03, 0.105);
      g.add(w);
      const pupil = new THREE.Mesh(keepGeo(new THREE.SphereGeometry(1, 16, 10)), ink);
      pupil.scale.set(0.042, 0.014, 0.052);
      g.add(pupil);
      const brow = inked(keepGeo(new THREE.CapsuleGeometry(0.014, 0.08, 4, 8)), ink, 2.5);
      g.add(brow);
      this.eyes.push({ g, w, pupil, brow, sx });
    }
    const mouthMat = toon({ color: '#3d0f2a', shade: '#1d0614', deep: '#0b0812', halftone: 0, rim: 0 });
    this.mouth = inked(keepGeo(new THREE.SphereGeometry(1, 24, 14)), mouthMat, 2.5);
    this.mouth.position.set(0, 0.012, -0.13);
    this.face.add(this.mouth);

    // --- arms + gloves (for the finale) ----------------------------------------
    const armMat = chrome();
    this.armMat = armMat;
    const glove = toon({ color: '#fffaf0', shade: '#b8b3d8', deep: '#6d6699', halftone: 0.5, rim: 0.5 });
    this.arms = [];
    for (const sx of [-1, 1]) {
      const tube = inked(new THREE.BufferGeometry(), toon({ color: '#cfd8ea', shade: '#6d6699', deep: '#2a2148', spec: 0.8 }), 3.5);
      this.inner.add(tube);
      const hand = new THREE.Group();
      this.inner.add(hand);
      const fist = inked(keepGeo(new THREE.SphereGeometry(1, 20, 14)), glove, 4.5);
      fist.scale.set(0.105, 0.095, 0.1);
      hand.add(fist);
      const thumb = inked(keepGeo(new THREE.CapsuleGeometry(0.042, 0.12, 4, 10)), glove, 4);
      thumb.rotation.x = Math.PI / 2;
      hand.add(thumb);
      this.arms.push({ sx, tube, hand, thumb, fist });
    }

    this.state = Spoon.defaultState();
    this.apply(this.state);
  }

  static defaultState() {
    return {
      face: 0, // 0 hidden .. 1 shown
      pupil: 1,
      brows: 1,
      lookX: 0,
      lookY: 0,
      eyeOpen: 1,
      browAngle: 0,
      mouth: 0,
      mouthW: 1,
      arms: 0,
      handL: [-0.5, 0.2, 0.2],
      handR: [0.5, 0.2, 0.2],
      thumbDown: 0,
      glow: 1,
      heat: 0,
      time: 0,
      squash: 1,
    };
  }

  apply(s) {
    this.state = s;
    this.matter.uniforms.uTime.value = s.time;
    this.matter.uniforms.uHeat.value = s.heat;
    this.glow.material.opacity = 0.7 * s.glow;
    this.glow.visible = s.glow > 0.01;
    const sq = s.squash;
    this.inner.scale.set(1 / Math.sqrt(sq), 1 / Math.sqrt(sq), sq);

    const f = clamp(s.face, 0, 1);
    this.face.visible = f > 0.01;
    for (const e of this.eyes) {
      e.g.scale.setScalar(f);
      const open = clamp(s.eyeOpen, 0.05, 1.2);
      e.w.scale.set(0.085, 0.03, 0.105 * open);
      // face "up" is local +z (toward the bowl tip): an upright spoon is a head on a stick
      e.pupil.position.set(s.lookX * 0.04, 0.02, s.lookY * 0.045);
      e.pupil.scale.set(0.042 * s.pupil, 0.014, 0.052 * Math.min(open, 1) * s.pupil);
      e.brow.position.set(e.sx * 0.005, 0.02, 0.135 + Math.abs(s.browAngle) * 0.015);
      e.brow.rotation.set(0, -s.browAngle * e.sx * 0.7, Math.PI / 2);
      e.brow.rotation.order = 'ZYX';
      e.brow.visible = f > 0.5 && s.brows > 0.5;
    }
    const m = clamp(s.mouth, 0, 1);
    this.mouth.visible = m > 0.02 && f > 0.1;
    this.mouth.scale.set(0.08 * s.mouthW * (0.5 + m * 0.5), 0.02, 0.01 + 0.06 * m);

    const a = clamp(s.arms, 0, 1);
    for (const arm of this.arms) {
      const vis = a > 0.01;
      arm.tube.visible = arm.hand.visible = vis;
      if (!vis) continue;
      const sh = V(arm.sx * 0.05, 0.0, 0.0);
      const target = V(...(arm.sx < 0 ? s.handL : s.handR));
      const hp = sh.clone().lerp(target, a);
      const c = new THREE.CubicBezierCurve3(
        sh,
        sh.clone().lerp(hp, 0.33).add(V(arm.sx * 0.15, 0.12, 0)),
        sh.clone().lerp(hp, 0.66).add(V(arm.sx * 0.08, 0.06, 0)),
        hp,
      );
      arm.tube.setGeo(taperTube(c, (u) => 0.028 - 0.006 * u, 20, 8));
      arm.hand.position.copy(hp);
      arm.hand.scale.setScalar(a);
      const td = arm.sx > 0 ? s.thumbDown : 0;
      arm.thumb.visible = td > 0.02;
      arm.thumb.scale.set(1, clamp(td, 0, 1), 1);
      arm.thumb.position.set(0, 0.035, -0.08 - 0.08 * td);
    }
  }
}
