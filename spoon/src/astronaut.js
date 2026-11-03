// "PIP" — the original GLITCHBOX astronaut. Clamshell bubble helmet, tiny body,
// noodle arms rebuilt every frame from Bezier curves, a face built for overreacting.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, glass, inked, taperTube, keepGeo, outlineMat } from './toon.js';
import { clamp, lerp } from './util.js';

const C = {
  suit: '#f3ead8',
  suitShade: '#9d8fc4',
  suitDeep: '#4b3a7e',
  magenta: '#ff2e7e',
  yellow: '#ffd23f',
  cyan: '#2ee6ff',
  dark: '#2a2148',
  skin: '#f6bd95',
  skinShade: '#c46b7d',
  boot: '#3b3260',
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function capGeo(r, coverage) {
  // spherical cap from the top down to `coverage` (0..1 of the sphere)
  return new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI * clamp(coverage, 0.001, 1));
}

export class Astronaut {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const suit = toon({ color: C.suit, shade: C.suitShade, deep: C.suitDeep });
    const suitArm = toon({ color: C.suit, shade: C.suitShade, deep: C.suitDeep });
    this.mats = { suit, suitArm };
    const mag = toon({ color: C.magenta, shade: '#8f1450', deep: '#3d0726' });
    const yel = toon({ color: C.yellow, shade: '#c26a1c', deep: '#5a2410', spec: 0.6 });
    const cyan = toon({ color: C.cyan, shade: '#1b6f9e', deep: '#0d2b4d' });
    const dark = toon({ color: C.dark, shade: '#151026', deep: '#07050d', rim: 0.6 });
    const skin = toon({ color: C.skin, shade: C.skinShade, deep: '#6e2b4c', halftone: 0.8 });
    this.skinMat = skin;
    const white = toon({ color: '#fffaf0', shade: '#b8b3d8', deep: '#6d6699', halftone: 0.4, rim: 0.4 });
    const ink = toon({ color: '#120c1c', shade: '#0b0812', deep: '#0b0812', rim: 0, halftone: 0 });
    const boot = toon({ color: C.boot, shade: '#1e1838', deep: '#0b0812' });
    this.colorMats = { mag, yel, cyan, dark, white, ink, boot };

    // --- torso ---------------------------------------------------------------
    const torso = inked(keepGeo(new THREE.CapsuleGeometry(0.36, 0.26, 10, 20)), suit, 5);
    torso.scale.set(1.06, 1, 0.92);
    torso.position.y = 0.04;
    this.body.add(torso);
    const belt = inked(keepGeo(new THREE.TorusGeometry(0.36, 0.05, 10, 32)), mag, 3);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = -0.14;
    belt.scale.set(1.07, 0.93, 1);
    this.body.add(belt);
    const panel = inked(keepGeo(new RoundedBoxGeometry(0.34, 0.2, 0.08, 3, 0.03)), dark, 3);
    panel.position.set(0, 0.13, 0.31);
    panel.rotation.x = -0.12;
    this.body.add(panel);
    [mag, yel, cyan].forEach((m, i) => {
      const b = inked(keepGeo(new THREE.SphereGeometry(0.032, 12, 8)), m, 2);
      b.position.set(-0.09 + i * 0.09, 0.13, 0.36);
      this.body.add(b);
    });
    // mission patch: a little lightning-spoon glyph (original)
    const patch = inked(keepGeo(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 20)), yel, 2.5);
    patch.rotation.set(Math.PI / 2, 0, 0.4);
    patch.position.set(-0.27, 0.12, 0.2);
    patch.lookAt(V(-0.27 * 3, 0.12, 0.2 * 3).add(V(0, 0, 0.6)));
    patch.rotateX(Math.PI / 2);
    this.body.add(patch);

    const pack = inked(keepGeo(new RoundedBoxGeometry(0.52, 0.56, 0.26, 3, 0.07)), toon({ color: '#e1d5bf', shade: '#8b7db3', deep: '#3f3170' }), 4.5);
    pack.position.set(0, 0.12, -0.36);
    this.body.add(pack);
    for (const sx of [-1, 1]) {
      const tank = inked(keepGeo(new THREE.CapsuleGeometry(0.07, 0.3, 6, 12)), mag, 3);
      tank.position.set(sx * 0.17, 0.2, -0.52);
      this.body.add(tank);
    }

    // --- helmet ----------------------------------------------------------------
    this.helmet = new THREE.Group();
    this.helmet.position.set(0, 1.08, 0.02);
    this.body.add(this.helmet);
    const collar = inked(keepGeo(new THREE.TorusGeometry(0.33, 0.085, 12, 32)), yel, 4);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.42, 0);
    this.body.add(collar);

    this.headGroup = new THREE.Group();
    this.helmet.add(this.headGroup);
    this.headGroup.position.set(0, -0.08, 0.06);
    const head = inked(keepGeo(new THREE.SphereGeometry(0.5, 40, 28)), skin, 4);
    head.scale.set(1.04, 0.98, 0.96);
    this.headGroup.add(head);
    this.head = head;

    // hair: a swoop of ink-dark tubes on top
    const hairMat = toon({ color: '#3a1f4f', shade: '#1b0f29', deep: '#0b0812', rim: 0.8 });
    const hairCurves = [
      [V(-0.3, 0.38, 0.22), V(-0.1, 0.56, 0.28), V(0.12, 0.52, 0.32), V(0.18, 0.4, 0.42)],
      [V(-0.05, 0.44, 0.33), V(0.06, 0.62, 0.22), V(0.25, 0.5, 0.25), V(0.3, 0.36, 0.33)],
    ];
    for (const pts of hairCurves) {
      const c = new THREE.CubicBezierCurve3(...pts);
      const h = inked(keepGeo(taperTube(c, (u) => 0.11 * (1 - u * 0.75) + 0.01, 20, 10)), hairMat, 3);
      this.headGroup.add(h);
    }
    const capHair = inked(keepGeo(new THREE.SphereGeometry(0.515, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.3)), hairMat, 3);
    capHair.rotation.x = -0.45;
    this.headGroup.add(capHair);

    // eyes
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * 0.175, 0.06, 0.4);
      this.headGroup.add(g);
      const white = inked(keepGeo(new THREE.SphereGeometry(1, 32, 20)), this.colorMats.white, 3.2);
      white.scale.set(0.15, 0.19, 0.11);
      g.add(white);
      const pupil = new THREE.Mesh(keepGeo(new THREE.SphereGeometry(1, 20, 14)), ink);
      pupil.scale.set(0.072, 0.09, 0.03);
      g.add(pupil);
      const shine = new THREE.Mesh(keepGeo(new THREE.SphereGeometry(1, 10, 8)), toon({ color: '#ffffff', shade: '#ffffff', deep: '#ffffff', rim: 0, halftone: 0 }));
      shine.scale.set(0.025, 0.03, 0.01);
      g.add(shine);
      const lid = inked(capGeo(1, 0.3), skin, 2.5);
      lid.scale.set(0.162, 0.2, 0.125);
      g.add(lid);
      const lowLid = inked(capGeo(1, 0.1), skin, 2.5);
      lowLid.scale.set(0.162, 0.2, 0.125);
      lowLid.rotation.x = Math.PI;
      g.add(lowLid);
      const brow = inked(keepGeo(new THREE.CapsuleGeometry(0.026, 0.13, 4, 10)), hairMat, 2.5);
      brow.rotation.z = Math.PI / 2;
      g.add(brow);
      this.eyes.push({ g, white, pupil, shine, lid, lowLid, brow, sx });
    }
    this.lidCache = {};

    // cheeks
    this.cheeks = [];
    const blush = toon({ color: '#ff7aa2', shade: '#e0507f', deep: '#e0507f', halftone: 0, rim: 0 });
    this.blushMat = blush;
    for (const sx of [-1, 1]) {
      const ch = new THREE.Mesh(keepGeo(new THREE.SphereGeometry(1, 16, 10)), blush);
      ch.scale.set(0.085, 0.05, 0.03);
      ch.position.set(sx * 0.3, -0.12, 0.38);
      ch.lookAt(V(sx * 0.6, -0.24, 0.76));
      this.headGroup.add(ch);
      this.cheeks.push(ch);
    }

    // mouth: an open ellipsoid OR a tube line (smile/frown); teeth for strain
    const mouthMat = toon({ color: '#4a0f2e', shade: '#2a0719', deep: '#14030c', halftone: 0, rim: 0 });
    this.mouthOpen = inked(keepGeo(new THREE.SphereGeometry(1, 24, 16)), mouthMat, 2.8);
    this.mouthOpen.position.set(0, -0.2, 0.43);
    this.headGroup.add(this.mouthOpen);
    this.tongue = new THREE.Mesh(keepGeo(new THREE.SphereGeometry(1, 16, 10)), toon({ color: '#ff6f91', shade: '#c23a63', deep: '#c23a63', halftone: 0, rim: 0 }));
    this.mouthOpen.add(this.tongue);
    this.tongue.position.set(0, -0.45, 0.5);
    this.tongue.scale.set(0.6, 0.4, 0.4);
    this.teeth = new THREE.Mesh(keepGeo(new RoundedBoxGeometry(1, 1, 1, 2, 0.15)), this.colorMats.white);
    this.teeth.position.set(0, -0.2, 0.455);
    this.headGroup.add(this.teeth);
    this.mouthLine = inked(new THREE.BufferGeometry(), ink, 0);
    this.headGroup.add(this.mouthLine);
    this.mouthMat = ink;

    // sweat drops
    this.sweat = [];
    const sweatMat = toon({ color: '#bff6ff', shade: '#2ee6ff', deep: '#1b6f9e', halftone: 0, rim: 0.5, spec: 1 });
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Group();
      const ball = inked(keepGeo(new THREE.SphereGeometry(0.045, 14, 10)), sweatMat, 2);
      const tip = inked(keepGeo(new THREE.ConeGeometry(0.045, 0.07, 14)), sweatMat, 2);
      tip.position.y = 0.05;
      d.add(ball, tip);
      this.headGroup.add(d);
      this.sweat.push(d);
    }

    // helmet shell (back half) + rim + glass
    const shellMat = toon({ color: '#fbf5ea', shade: '#9d8fc4', deep: '#4b3a7e', spec: 0.5 });
    const shell = inked(keepGeo(new THREE.SphereGeometry(0.8, 40, 28, Math.PI, Math.PI)), shellMat, 5.5);
    shell.rotation.x = 0.35;
    this.helmet.add(shell);
    const rim = inked(keepGeo(new THREE.TorusGeometry(0.8, 0.055, 12, 48)), yel, 4);
    rim.rotation.x = 0.35;
    this.helmet.add(rim);
    for (const sx of [-1, 1]) {
      const ear = inked(keepGeo(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 24)), mag, 3.5);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(sx * 0.8, -0.02, -0.04);
      this.helmet.add(ear);
      const earCap = inked(keepGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 20)), yel, 2.5);
      earCap.rotation.z = Math.PI / 2;
      earCap.position.set(sx * 0.88, -0.02, -0.04);
      this.helmet.add(earCap);
    }
    this.glassMat = glass({ alpha: 0.06 });
    this.glass = new THREE.Mesh(keepGeo(new THREE.SphereGeometry(0.79, 48, 32)), this.glassMat);
    this.glass.renderOrder = 5;
    const glassHull = new THREE.Mesh(this.glass.geometry, outlineMat(5.5, { transparent: true }));
    glassHull.renderOrder = 6;
    this.glass.add(glassHull);
    this.helmet.add(this.glass);

    // antenna with springy tip
    this.antenna = inked(new THREE.BufferGeometry(), dark, 2.5);
    this.helmet.add(this.antenna);
    this.antennaTip = inked(keepGeo(new THREE.SphereGeometry(0.07, 16, 12)), mag, 3);
    this.helmet.add(this.antennaTip);
    this.antennaGlow = null;

    // --- limbs ------------------------------------------------------------------
    this.arms = [];
    for (const sx of [-1, 1]) {
      const tube = inked(new THREE.BufferGeometry(), suitArm, 4.2);
      this.body.add(tube);
      const cuff = inked(keepGeo(new THREE.TorusGeometry(0.075, 0.035, 8, 20)), yel, 2.5);
      this.body.add(cuff);
      const hand = new THREE.Group();
      this.body.add(hand);
      const palm = inked(keepGeo(new THREE.SphereGeometry(1, 20, 14)), this.colorMats.white, 3.5);
      palm.scale.set(0.12, 0.11, 0.1);
      hand.add(palm);
      const thumb = inked(keepGeo(new THREE.CapsuleGeometry(0.042, 0.07, 4, 10)), this.colorMats.white, 3);
      hand.add(thumb);
      this.arms.push({ sx, tube, cuff, hand, palm, thumb });
    }
    this.legs = [];
    for (const sx of [-1, 1]) {
      const tube = inked(new THREE.BufferGeometry(), suit, 4.2);
      this.body.add(tube);
      const bootM = inked(keepGeo(new THREE.SphereGeometry(1, 24, 16)), boot, 4);
      bootM.scale.set(0.15, 0.12, 0.21);
      this.body.add(bootM);
      const sole = inked(keepGeo(new THREE.TorusGeometry(0.85, 0.12, 6, 24)), mag, 2.5);
      sole.rotation.x = Math.PI / 2;
      sole.position.y = -0.35;
      bootM.add(sole);
      this.legs.push({ sx, tube, boot: bootM });
    }

    // duct tape roll prop
    this.tapeRoll = inked(keepGeo(new THREE.TorusGeometry(0.11, 0.06, 10, 24)), toon({ color: '#b9b6c9', shade: '#6d6699', deep: '#2a2148', spec: 0.3 }), 3);
    this.body.add(this.tapeRoll);

    this.pose = Astronaut.defaultPose();
    this.apply(this.pose);
  }

  // Apply a pose whose hand/foot targets are given in world space.
  applyWorld(p, targets = {}) {
    this.body.rotation.set(p.bodyLean, p.bodyTwist, p.bodyTilt);
    const s = p.squash;
    this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    this.root.updateMatrixWorld(true);
    for (const k in targets) {
      const v = targets[k].clone();
      this.body.worldToLocal(v);
      p[k] = [v.x, v.y, v.z];
    }
    this.apply(p);
  }
  handWorld(side = 1) {
    const a = this.arms[side > 0 ? 1 : 0];
    this.root.updateMatrixWorld(true);
    return a.hand.getWorldPosition(new THREE.Vector3());
  }
  helmetWorld(local = [0, 0, 0]) {
    this.root.updateMatrixWorld(true);
    return new THREE.Vector3(...local).applyMatrix4(this.helmet.matrixWorld);
  }

  static defaultPose() {
    return {
      // root-space hand targets (wrist) and feet
      handL: [-0.62, -0.05, 0.12],
      handR: [0.62, -0.05, 0.12],
      armBendL: 0.25,
      armBendR: 0.25,
      handRotL: [0, 0, 0],
      handRotR: [0, 0, 0],
      fistL: 0,
      fistR: 0,
      thumbUpR: 0,
      tape: 0,
      dizzy: 0,
      footL: [-0.2, -0.72, 0.03],
      footR: [0.2, -0.72, 0.03],
      bodyLean: 0, // x rotation of body
      bodyTwist: 0, // y
      bodyTilt: 0, // z
      squash: 1,
      headTurn: 0,
      headTilt: 0,
      headNod: 0,
      lookX: 0,
      lookY: 0,
      eyeOpen: 1, // 0 closed .. 1 open
      eyeSquint: 0, // lower lid
      eyeScale: 1,
      pupil: 1,
      browY: 0,
      browAngle: 0, // + = worried (inner up), - = angry
      mouthOpen: 0,
      mouthW: 1,
      mouthCurve: 0.3,
      grit: 0,
      sweat: 0,
      blush: 0.6,
      antennaSwing: [0, 0],
      time: 0,
    };
  }

  lid(cov) {
    const k = Math.round(clamp(cov, 0, 1) * 40);
    if (!this.lidCache[k]) this.lidCache[k] = keepGeo(capGeo(1, Math.max(k / 40, 0.001)));
    return this.lidCache[k];
  }

  apply(p) {
    this.pose = p;
    const b = this.body;
    b.rotation.set(p.bodyLean, p.bodyTwist, p.bodyTilt);
    const s = p.squash;
    b.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));

    this.helmet.rotation.set(p.headNod, p.headTurn, p.headTilt);

    // eyes
    for (const e of this.eyes) {
      const sc = p.eyeScale;
      e.g.scale.setScalar(sc);
      const dz = p.dizzy * (e.sx > 0 ? 1 : -1);
      const lx = clamp(p.lookX + Math.cos(p.time * 14 * e.sx) * p.dizzy, -1, 1) * 0.07;
      const ly = clamp(p.lookY + Math.sin(p.time * 14 * e.sx) * Math.abs(dz), -1, 1) * 0.08;
      e.pupil.position.set(lx, ly, 0.098);
      e.pupil.scale.set(0.072 * p.pupil, 0.09 * p.pupil, 0.03);
      e.shine.position.set(lx + 0.03, ly + 0.04, 0.115);
      e.shine.visible = p.pupil > 0.35;
      // upper lid coverage 0.08 (open) .. 0.52 (closed)
      const cov = lerp(0.52, 0.06, clamp(p.eyeOpen, 0, 1));
      e.lid.setGeo(this.lid(cov));
      e.lid.rotation.x = -0.15;
      const low = lerp(0.04, 0.3, clamp(p.eyeSquint, 0, 1));
      e.lowLid.setGeo(this.lid(low));
      // brows
      const ang = p.browAngle * e.sx;
      e.brow.position.set(0.0 + e.sx * 0.005, 0.25 + p.browY * 0.1 + Math.abs(p.browAngle) * 0.02, 0.06);
      e.brow.rotation.set(0, 0, Math.PI / 2 - ang * 0.6);
    }
    for (const ch of this.cheeks) ch.visible = p.blush > 0.05;
    this.blushMat.uniforms.uColor.value.set('#ff7aa2').lerp(new THREE.Color('#ff2e55'), clamp(p.blush - 0.6, 0, 1));

    // mouth
    const mo = clamp(p.mouthOpen, 0, 1);
    if (p.grit > 0.05) {
      this.mouthOpen.visible = true;
      this.mouthOpen.scale.set(0.16 * p.mouthW, 0.06 + 0.04 * p.grit, 0.05);
      this.teeth.visible = true;
      this.teeth.scale.set(0.27 * p.mouthW, 0.07 + 0.03 * p.grit, 0.03);
      this.tongue.visible = false;
      this.mouthLine.visible = false;
    } else if (mo > 0.04) {
      this.mouthOpen.visible = true;
      this.teeth.visible = false;
      this.tongue.visible = mo > 0.3;
      this.mouthOpen.scale.set(0.1 * p.mouthW + 0.03 * mo, 0.02 + 0.13 * mo, 0.05);
      this.mouthLine.visible = false;
    } else {
      this.mouthOpen.visible = false;
      this.teeth.visible = false;
      this.mouthLine.visible = true;
      const w = 0.13 * p.mouthW;
      const cv = p.mouthCurve * 0.08;
      const c = new THREE.QuadraticBezierCurve3(V(-w, -0.19 + cv * 0.5, 0.43), V(0, -0.19 - cv, 0.47), V(w, -0.19 + cv * 0.5, 0.43));
      this.mouthLine.setGeo(taperTube(c, (u) => 0.016 + 0.01 * Math.sin(u * Math.PI), 14, 6));
    }

    // sweat
    this.sweat.forEach((d, i) => {
      const ph = (p.time * 0.9 + i * 0.37) % 1;
      const vis = p.sweat > 0.05 && ph < 0.85;
      d.visible = vis;
      const sx = i === 1 ? -1 : 1;
      d.position.set(sx * (0.34 + 0.06 * i), 0.22 - ph * 0.35, 0.33);
      d.scale.setScalar(clamp(p.sweat, 0, 1.4) * (0.8 + 0.3 * (1 - ph)));
    });

    // antenna: base on the shell top-back, tip springs with antennaSwing
    const base = V(0.18, 0.72, -0.25);
    const [sw, sz] = p.antennaSwing;
    const tip = V(0.32 + sw * 0.35, 1.18 - Math.abs(sw) * 0.12, -0.38 + sz * 0.3);
    const mid = V(0.26 + sw * 0.08, 0.98, -0.32);
    const ac = new THREE.QuadraticBezierCurve3(base, mid, tip);
    this.antenna.setGeo(taperTube(ac, (u) => 0.022 - 0.008 * u, 12, 6));
    this.antennaTip.position.copy(tip);

    // arms
    for (const a of this.arms) {
      const left = a.sx < 0;
      const hp = V(...(left ? p.handL : p.handR));
      const bend = left ? p.armBendL : p.armBendR;
      const sh = V(a.sx * 0.34, 0.2, 0.0);
      const d = hp.clone().sub(sh);
      const len = d.length();
      // elbow pushes outward/down, scaled by bend; long stretched arms go straighter
      const side = V(a.sx, -0.35, 0.15).normalize();
      const straight = clamp((len - 0.6) / 1.6, 0, 1);
      const off = side.multiplyScalar(bend * Math.min(len, 1.0) * 0.6 * (1 - straight * 0.7));
      const p1 = sh.clone().lerp(hp, 0.3).add(off);
      const p2 = sh.clone().lerp(hp, 0.72).add(off.clone().multiplyScalar(0.7));
      const curve = new THREE.CubicBezierCurve3(sh, p1, p2, hp);
      const thin = 1 / Math.sqrt(Math.max(len / 0.6, 1)); // stretched arms thin out
      a.tube.setGeo(taperTube(curve, (u) => (0.085 - 0.018 * u) * lerp(1, thin, Math.sin(u * Math.PI)), 28, 10));
      const tan = curve.getTangentAt(1);
      a.cuff.position.copy(hp);
      a.cuff.lookAt(hp.clone().add(tan));
      const hand = a.hand;
      hand.position.copy(hp).add(tan.clone().multiplyScalar(0.09));
      // orient hand: forward along arm, then user rotation
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), tan);
      hand.quaternion.copy(q);
      const hr = left ? p.handRotL : p.handRotR;
      hand.rotateX(hr[0]);
      hand.rotateY(hr[1]);
      hand.rotateZ(hr[2]);
      const fist = left ? p.fistL : p.fistR;
      a.palm.scale.set(0.12, 0.105, lerp(0.11, 0.095, fist));
      const tu = left ? 0 : p.thumbUpR;
      a.thumb.position.set(lerp(a.sx * -0.085, 0, tu), lerp(0.07, 0.15, tu), lerp(0.02 - 0.03 * fist, 0, tu));
      a.thumb.rotation.set(lerp(0.4, 0, tu), 0, lerp(a.sx * (0.9 - fist * 0.5), 0, tu));
      a.thumb.scale.setScalar(1 + 0.3 * tu);
      if (!left) {
        this.tapeRoll.visible = p.tape > 0.01;
        this.tapeRoll.position.copy(hand.position).add(V(0.05, -0.05, 0.12));
        this.tapeRoll.rotation.set(p.time * 9, 0.4, 0);
      }
    }
    // legs
    for (const l of this.legs) {
      const left = l.sx < 0;
      const fp = V(...(left ? p.footL : p.footR));
      const hip = V(l.sx * 0.16, -0.22, 0.0);
      const c = new THREE.CubicBezierCurve3(hip, hip.clone().lerp(fp, 0.35).add(V(l.sx * 0.03, 0, 0.03)), hip.clone().lerp(fp, 0.7), fp.clone().add(V(0, 0.08, -0.02)));
      l.tube.setGeo(taperTube(c, (u) => 0.1 - 0.015 * u, 16, 10));
      l.boot.position.copy(fp);
    }
  }
}
