// Set pieces: the gravity-well "imaginary floor", the giant balance scale and its
// mountain, the atom lattice that gets crushed into neutrons, duct tape, and Earth.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, inked, keepGeo, outlineMat, G, GLSL_HALFTONE, GLSL_NOISE, TOON_VERT } from './toon.js';
import { hash } from './util.js';

const FLOOR_VERT = /* glsl */ `
uniform vec4 uDent; uniform vec4 uRip[4]; uniform float uTime;
varying vec3 vW; varying vec2 vXZ; varying float vDent;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vXZ = w.xz;
  float r = distance(w.xz, uDent.xy);
  float d = uDent.z * exp(-r * r / (uDent.w * uDent.w));
  w.y -= d;
  vDent = d;
  for (int i = 0; i < 4; i++) {
    float dt = uTime - uRip[i].z;
    if (dt > 0.0 && uRip[i].w > 0.0) {
      float rr = distance(w.xz, uRip[i].xy);
      float front = dt * 7.0;
      w.y += sin((rr - front) * 5.0) * exp(-dt * 2.2) * exp(-abs(rr - front) * 1.2) * uRip[i].w;
    }
  }
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FLOOR_FRAG = /* glsl */ `
uniform sampler2D uLabel; uniform vec4 uLabelRect; uniform float uLabelAmt, uFade, uRadius;
uniform vec3 uLine, uLine2, uBase;
${GLSL_HALFTONE}
varying vec3 vW; varying vec2 vXZ; varying float vDent;
float gridLine(vec2 p, float spacing, float width){
  vec2 g = abs(fract(p / spacing - 0.5) - 0.5) * spacing;
  vec2 fw = fwidth(p) * 1.2;
  vec2 l = 1.0 - smoothstep(vec2(width) - fw, vec2(width) + fw, g);
  return max(l.x, l.y);
}
void main(){
  float r = length(vXZ);
  float fade = 1.0 - smoothstep(uRadius * 0.42, uRadius * 0.75, r);
  vec3 col = uBase;
  // dent shading: halftone gets denser in the gravity well
  float dd = clamp(vDent * 1.6, 0.0, 1.0);
  col = mix(col, uBase * 0.35, halftone(gl_FragCoord.xy, dd, 6.0, 0.785));
  float minor = gridLine(vXZ, 0.25, 0.006);
  float major = gridLine(vXZ, 1.0, 0.014);
  col = mix(col, uLine * 0.7, minor * 0.28);
  col = mix(col, uLine2, major * 0.62);
  // dashed rim of the "floor"
  float rim = 1.0 - smoothstep(0.025, 0.05, abs(r - uRadius * 0.42));
  float dash = step(0.5, fract(atan(vXZ.y, vXZ.x) * 30.0));
  col = mix(col, vec3(1.0, 0.82, 0.25), rim * dash);
  vec2 luv = (vXZ - uLabelRect.xy) / uLabelRect.zw + 0.5;
  if (luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0) {
    vec4 L = texture2D(uLabel, vec2(luv.x, 1.0 - luv.y));
    col = mix(col, L.rgb, L.a * uLabelAmt);
  }
  float a = fade * uFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;

function labelTexture(lines, w = 1024, h = 256, size = 120, color = '#ffd23f') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.font = `${size}px 'Permanent Marker'`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((l, i) => {
    const y = h / 2 + (i - (arr.length - 1) / 2) * size * 0.95;
    g.lineWidth = size * 0.18;
    g.strokeStyle = '#0b0812';
    g.strokeText(l, w / 2, y);
    g.fillStyle = color;
    g.fillText(l, w / 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  return t;
}

function smoothHull(geo) {
  // copy with merged normals for a crack-free outline on faceted meshes
  const g = geo.clone();
  g.deleteAttribute('normal');
  const merged = mergeByPosition(g);
  merged.computeVertexNormals();
  return merged;
}
function mergeByPosition(g) {
  const pos = g.attributes.position;
  const map = new Map();
  const newPos = [];
  const idx = [];
  const src = g.index ? g.index.array : [...Array(pos.count).keys()];
  for (const i of src) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = newPos.length / 3;
      map.set(key, k);
      newPos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    idx.push(k);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
  out.setIndex(idx);
  return out;
}

// Toon with a snow line in object space (for the mountain)
function snowToon(opts) {
  const m = toon(opts);
  m.uniforms.uSnowY = { value: opts.snowY ?? 1e9 };
  m.uniforms.uSnow = { value: new THREE.Color(opts.snow ?? '#fff4dc') };
  m.uniforms.uSnowShade = { value: new THREE.Color(opts.snowShade ?? '#9d8fc4') };
  m.fragmentShader = m.fragmentShader
    .replace('uniform float uRim,', 'uniform float uSnowY; uniform vec3 uSnow, uSnowShade;\nuniform float uRim,')
    .replace(
      'vec3 col = mix(uShade * uShadeTint, uColor * uKeyColor, lit);',
      `float snowLine = uSnowY + sin(vObj.x * 9.0) * 0.12 + sin(vObj.z * 7.0 + 1.0) * 0.1;
  float isSnow = step(snowLine, vObj.y);
  vec3 baseC = mix(uColor, uSnow, isSnow);
  vec3 shadeC = mix(uShade, uSnowShade, isSnow);
  vec3 col = mix(shadeC * uShadeTint, baseC * uKeyColor, lit);`,
    );
  return m;
}

export function buildProps(scene) {
  const P = { propRoots: [] };
  const add = (o) => {
    scene.add(o);
    P.propRoots.push(o);
    return o;
  };

  // --- imaginary floor ----------------------------------------------------------
  const fg = new THREE.PlaneGeometry(40, 40, 220, 220);
  fg.rotateX(-Math.PI / 2);
  P.floorLabel = null;
  P.floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uDent: { value: new THREE.Vector4(0, 0, 0, 1) },
      uRip: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uTime: G.uTime,
      uLabel: { value: null },
      uLabelRect: { value: new THREE.Vector4(-2.2, 2.6, 4.6, 1.45) },
      uLabelAmt: { value: 1 },
      uFade: { value: 1 },
      uRadius: { value: 12 },
      uLine: { value: new THREE.Color('#5fd8ff') },
      uLine2: { value: new THREE.Color('#bfeaff') },
      uBase: { value: new THREE.Color('#17123a') },
      uRes: G.uRes,
      uPx: G.uPx,
    },
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    transparent: true,
  });
  P.floor = add(new THREE.Mesh(fg, P.floorMat));
  P.floor.position.y = -0.85;
  P.floor.renderOrder = 1;
  P.floor.frustumCulled = false;

  // --- balance scale ------------------------------------------------------------
  const gold = toon({ color: '#ffd23f', shade: '#c2531c', deep: '#5a1d10', spec: 0.7 });
  const plum = toon({ color: '#5b3fa8', shade: '#2a1d5c', deep: '#120b2a', spec: 0.4 });
  const steel = toon({ color: '#cfd8ea', shade: '#6d6699', deep: '#2a2148', spec: 0.8 });
  P.scale = add(new THREE.Group());
  const S = P.scale;
  S.userData.parts = {};
  const base = inked(keepGeo(new THREE.CylinderGeometry(1.6, 2.0, 0.6, 40)), plum, 5);
  base.position.y = 0.3;
  S.add(base);
  const base2 = inked(keepGeo(new THREE.CylinderGeometry(1.0, 1.3, 0.5, 40)), gold, 4);
  base2.position.y = 0.8;
  S.add(base2);
  // pillar in two pieces so the second break can buckle it
  const pillarLow = new THREE.Group();
  pillarLow.position.y = 1.0;
  S.add(pillarLow);
  const pl = inked(keepGeo(new THREE.CylinderGeometry(0.26, 0.34, 4.6, 24)), gold, 4.5);
  pl.position.y = 2.3;
  pillarLow.add(pl);
  const pillarHigh = new THREE.Group();
  pillarHigh.position.y = 4.6;
  pillarLow.add(pillarHigh);
  const ph = inked(keepGeo(new THREE.CylinderGeometry(0.22, 0.26, 4.0, 24)), gold, 4.5);
  ph.position.y = 2.0;
  pillarHigh.add(ph);
  const knuckle = inked(keepGeo(new THREE.SphereGeometry(0.42, 24, 16)), plum, 4);
  pillarHigh.add(knuckle);
  const pivot = new THREE.Group();
  pivot.position.y = 4.1;
  pillarHigh.add(pivot);
  const cap = inked(keepGeo(new THREE.SphereGeometry(0.5, 24, 16)), gold, 4.5);
  pivot.add(cap);
  const finial = inked(keepGeo(new THREE.ConeGeometry(0.22, 0.7, 16)), plum, 3.5);
  finial.position.y = 0.75;
  pivot.add(finial);
  // beam halves pivot at center so they can snap
  const halves = [];
  for (const sx of [-1, 1]) {
    const hg = new THREE.Group();
    pivot.add(hg);
    const bm = inked(keepGeo(new RoundedBoxGeometry(5.1, 0.36, 0.5, 3, 0.12)), plum, 4.5);
    bm.position.x = sx * 2.6;
    hg.add(bm);
    const stripe = inked(keepGeo(new RoundedBoxGeometry(4.2, 0.1, 0.52, 2, 0.04)), gold, 0);
    stripe.position.x = sx * 2.7;
    hg.add(stripe);
    const endBall = inked(keepGeo(new THREE.SphereGeometry(0.3, 20, 14)), gold, 4);
    endBall.position.x = sx * 5.15;
    hg.add(endBall);
    halves.push(hg);
  }
  // pans hang from beam ends, stay level
  const pans = [];
  for (const sx of [-1, 1]) {
    const pg = new THREE.Group();
    S.add(pg);
    const dish = inked(keepGeo(new THREE.SphereGeometry(1, 40, 12, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38)), gold, 4.5);
    dish.scale.set(2.3, 1.2, 2.3);
    dish.position.y = 0.95;
    pg.add(dish);
    const rimT = inked(keepGeo(new THREE.TorusGeometry(1.0, 0.07, 8, 48)), gold, 3);
    rimT.rotation.x = Math.PI / 2;
    rimT.scale.set(2.3 * 0.93, 2.3 * 0.93, 1);
    rimT.position.y = 0.95 - 1.2 * Math.cos(Math.PI * 0.62) * -1;
    pg.add(rimT);
    const plate = inked(keepGeo(new THREE.CylinderGeometry(2.0, 2.0, 0.08, 40)), toon({ color: '#3b2d77', shade: '#1d1540', deep: '#0b0812' }), 0);
    plate.position.y = rimT.position.y - 0.02;
    pg.add(plate);
    // three rods to a hook point
    const rods = [];
    for (let k = 0; k < 3; k++) {
      const rod = inked(keepGeo(new THREE.CylinderGeometry(0.035, 0.035, 1, 8)), steel, 2.5);
      pg.add(rod);
      rods.push(rod);
    }
    pans.push({ g: pg, rimY: rimT.position.y, rods, sx });
  }
  S.userData.parts = { pillarLow, pillarHigh, pivot, halves, pans, base, base2 };
  P.scaleRig = S.userData.parts;

  // tape patch for the repair gag
  const tapeMat = toon({ color: '#b9b6c9', shade: '#6d6699', deep: '#2a2148', spec: 0.3 });
  P.tape = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const band = inked(keepGeo(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 20, 1, true)), tapeMat, 3);
    band.material = tapeMat;
    band.rotation.z = Math.PI / 2;
    band.rotation.x = (k - 1) * 0.5;
    band.position.x = (k - 1) * 0.22;
    P.tape.add(band);
  }
  pivot.add(P.tape);

  // mountain: faceted fill + smooth hull
  const mg = new THREE.ConeGeometry(2.1, 5.2, 11, 7);
  const mp = mg.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    const x = mp.getX(i);
    const y = mp.getY(i);
    const z = mp.getZ(i);
    const k = (y + 2.6) / 5.2;
    const n = Math.sin(x * 3.1 + z * 1.7) * 0.5 + Math.sin(z * 4.3 - x * 2.2) * 0.5;
    const s = 1 + n * 0.12 * (1 - k * 0.3);
    mp.setXYZ(i, x * s + (k > 0.98 ? 0.25 : 0), y + n * 0.12 * k, z * s);
  }
  mg.computeVertexNormals();
  const mFill = mg.toNonIndexed();
  mFill.computeVertexNormals();
  const mHull = smoothHull(mg);
  const mMat = snowToon({ color: '#8a6fc9', shade: '#3e2b7a', deep: '#1a1138', snowY: 1.0, snow: '#fff4dc', snowShade: '#a99ad6' });
  P.mountain = add(new THREE.Group());
  const mMesh = new THREE.Mesh(keepGeo(mFill), mMat);
  const mH = new THREE.Mesh(keepGeo(mHull), outlineMat(5));
  P.mountain.add(mMesh, mH);
  mMesh.position.y = 2.6;
  mH.position.y = 2.6;
  // a little tuft of trees at the base (cones)
  const tree = toon({ color: '#2ee6a0', shade: '#127a6b', deep: '#0a3a3d' });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    const tr = inked(keepGeo(new THREE.ConeGeometry(0.2, 0.6, 8)), tree, 3);
    tr.position.set(Math.cos(a) * 1.85, 0.3, Math.sin(a) * 1.85);
    P.mountain.add(tr);
  }

  // --- atom lattice -> neutrons ---------------------------------------------------
  const NX = 6;
  const NY = 7;
  const NZ = 12;
  const N = NX * NY * NZ;
  P.atomGrid = { NX, NY, NZ, N };
  const proton = toon({ color: '#ff2e7e', shade: '#8f1450', deep: '#3d0726', spec: 0.5 });
  const neutronC = toon({ color: '#e9e3f5', shade: '#7f74b0', deep: '#33296b', spec: 0.5 });
  const electron = toon({ color: '#9ff6ff', shade: '#2ee6ff', deep: '#1b6f9e', rim: 0.5, spec: 1, halftone: 0 });
  const mergeSpheres = (list) => {
    const geos = list.map(([x, y, z, r]) => {
      const g = new THREE.SphereGeometry(r, 14, 10);
      g.translate(x, y, z);
      return g;
    });
    const pos = [];
    const nor = [];
    const idx = [];
    let off = 0;
    for (const g of geos) {
      pos.push(...g.attributes.position.array);
      nor.push(...g.attributes.normal.array);
      idx.push(...g.index.array.map((i) => i + off));
      off += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setIndex(idx);
    return out;
  };
  const pGeo = mergeSpheres([
    [0.1, 0.08, 0.05, 0.13],
    [-0.1, -0.06, 0.08, 0.13],
    [0.02, -0.1, -0.1, 0.13],
  ]);
  const nGeo = mergeSpheres([
    [-0.08, 0.1, -0.06, 0.13],
    [0.12, -0.08, -0.04, 0.13],
    [-0.04, 0.0, 0.14, 0.13],
  ]);
  const mkInst = (geo, mat, count, ow) => {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.frustumCulled = false;
    if (ow > 0) {
      const o = new THREE.InstancedMesh(geo, outlineMat(ow), count);
      o.instanceMatrix = m.instanceMatrix;
      o.frustumCulled = false;
      m.add(o);
    }
    return m;
  };
  P.atoms = add(new THREE.Group());
  P.protons = mkInst(pGeo, proton, N, 2.5);
  P.neutrons = mkInst(nGeo, neutronC, N, 2.5);
  P.electrons = mkInst(new THREE.SphereGeometry(0.07, 12, 8), electron, N * 2, 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#2ee6ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  P.ringMat = ringMat;
  P.rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.012, 6, 64), ringMat, N * 2);
  P.rings.frustumCulled = false;
  // packed neutron spheres (single spheres)
  const packed = toon({ color: '#d9d2f0', shade: '#6d62a8', deep: '#2a2160', spec: 0.6 });
  P.packed = mkInst(new THREE.SphereGeometry(1, 18, 12), packed, N, 2.2);
  P.packedMat = packed;
  P.atoms.add(P.protons, P.neutrons, P.electrons, P.rings, P.packed);
  P.atomSeed = [];
  for (let i = 0; i < N; i++) P.atomSeed.push([hash(i * 1.3), hash(i * 2.9), hash(i * 4.7), hash(i * 7.1)]);

  // --- Earth (home) -------------------------------------------------------------
  const earthMat = toon({ color: '#3fa0ff', shade: '#1b3f9e', deep: '#0d1b4d', spec: 0.4 });
  earthMat.fragmentShader = earthMat.fragmentShader
    .replace('uniform float uRim,', `${GLSL_NOISE}\nuniform float uRim,`)
    .replace(
      'vec3 col = mix(uShade * uShadeTint, uColor * uKeyColor, lit);',
      `float land = step(0.56, vnoise(normalize(vObj) * 3.2 + 2.0) * 0.7 + vnoise(normalize(vObj) * 7.0) * 0.3);
  vec3 baseC = mix(uColor, vec3(0.2, 0.85, 0.5), land);
  vec3 col = mix(mix(uShade, vec3(0.05, 0.35, 0.3), land) * uShadeTint, baseC * uKeyColor, lit);`,
    );
  P.earth = add(inked(keepGeo(new THREE.SphereGeometry(1, 40, 28)), earthMat, 4));

  // --- asteroid field (shot 5 parallax) -------------------------------------------
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const n = 1 + 0.22 * Math.sin(x * 4.1 + y * 2.3) + 0.18 * Math.sin(z * 5.3 - x * 1.7);
    rp.setXYZ(i, x * n, y * n * 0.8, z * n);
  }
  const rockFill = rockGeo.toNonIndexed();
  rockFill.computeVertexNormals();
  const rockHull = smoothHull(rockGeo);
  const rockMat = toon({ color: '#6b5aa6', shade: '#2e2366', deep: '#120b2a', rim: 1 });
  P.rockMat = rockMat;
  const NR = 90;
  P.rocks = add(new THREE.Group());
  P.rockFill = new THREE.InstancedMesh(rockFill, rockMat, NR);
  P.rockHullM = new THREE.InstancedMesh(rockHull, outlineMat(3.5), NR);
  P.rockHullM.instanceMatrix = P.rockFill.instanceMatrix;
  P.rockFill.frustumCulled = P.rockHullM.frustumCulled = false;
  P.rocks.add(P.rockFill, P.rockHullM);
  P.rockData = [];
  for (let i = 0; i < NR; i++) {
    const a = hash(i * 3.3 + 7) * Math.PI * 2;
    const r = 5 + hash(i * 5.1 + 2) * 30;
    const y = (hash(i * 7.7 + 1) - 0.5) * 14;
    P.rockData.push({ pos: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), s: 0.15 + Math.pow(hash(i * 9.9), 2) * 1.3, rx: hash(i * 1.1) * 6, ry: hash(i * 2.2) * 6, spin: (hash(i * 4.4) - 0.5) * 1.5 });
  }
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  P.updateRocks = (t) => {
    P.rockData.forEach((d, i) => {
      _e.set(d.rx + t * d.spin, d.ry + t * d.spin * 0.7, 0);
      _q.setFromEuler(_e);
      _m.compose(d.pos, _q, new THREE.Vector3(d.s, d.s, d.s));
      P.rockFill.setMatrixAt(i, _m);
    });
    P.rockFill.instanceMatrix.needsUpdate = true;
  };

  P.makeLabels = () => {
    P.floorMat.uniforms.uLabel.value = labelTexture(['IMAGINARY FLOOR', '(do not question it)'], 1024, 340, 118);
  };

  P.resetProps = () => {
    P.floorMat.uniforms.uDent.value.set(0, 0, 0, 1);
    for (const r of P.floorMat.uniforms.uRip.value) r.set(0, 0, 0, 0);
    P.floorMat.uniforms.uLabelAmt.value = 1;
    P.floorMat.uniforms.uFade.value = 1;
    P.floorMat.uniforms.uRadius.value = 12;
    P.floor.position.set(0, -0.85, 0);
    P.tape.visible = false;
    P.scale.position.set(0, 0, 0);
    P.scale.rotation.set(0, 0, 0);
  };

  // pose the balance: tilt (beam), snap (0..1 halves droop), buckle (0..1 pillar)
  P.poseScale = ({ tilt = 0, snap = 0, buckle = 0, panDrop = [0, 0], scatter = 0, time = 0 }) => {
    const r = P.scaleRig;
    r.pillarHigh.rotation.z = buckle * 0.9;
    r.pillarHigh.position.x = buckle * 0.2;
    r.pillarLow.rotation.z = -buckle * 0.25;
    r.pivot.rotation.z = tilt;
    r.halves[0].rotation.z = snap * 0.95 + scatter * 1.4;
    r.halves[1].rotation.z = -snap * 0.95 - scatter * 0.8;
    r.halves[0].position.set(-scatter * 2.5, scatter * 1.5, scatter * 1.0);
    r.halves[1].position.set(scatter * 3.0, scatter * 2.2, -scatter * 0.6);
    S.updateMatrixWorld(true);
    r.pans.forEach((pan, i) => {
      const half = r.halves[i];
      const end = new THREE.Vector3(pan.sx * 5.15, 0, 0).applyMatrix4(half.matrixWorld);
      S.worldToLocal(end);
      const hang = 3.6;
      const floorY = 0.12;
      let y = end.y - hang;
      y = Math.max(y - panDrop[i], floorY);
      pan.g.position.set(end.x, y, end.z);
      pan.g.rotation.z = scatter * (i ? -0.5 : 0.6);
      // rods from hook (end) to rim points
      const hook = new THREE.Vector3(end.x, Math.max(end.y, y + 0.6), end.z);
      pan.rods.forEach((rod, k) => {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        const rim = new THREE.Vector3(end.x + Math.cos(a) * 2.05, y + pan.rimY, end.z + Math.sin(a) * 2.05);
        const hookL = hook.clone();
        const mid = rim.clone().add(hookL).multiplyScalar(0.5);
        const len = rim.distanceTo(hookL);
        rod.position.copy(mid).sub(pan.g.position);
        rod.scale.set(1, len, 1);
        rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hookL.clone().sub(rim).normalize());
        rod.visible = scatter < 0.2;
      });
    });
    void time;
  };
  P.panTop = (i) => {
    const pan = P.scaleRig.pans[i];
    pan.g.updateMatrixWorld(true);
    return new THREE.Vector3(0, pan.rimY + 0.05, 0).applyMatrix4(pan.g.matrixWorld);
  };

  return P;
}
