// Shots 03–06.
import {
  THREE, V3, P, SS, qLook, spoonWorld, handlePt, placeSpoonBy, impact, addShake, FLOOR_Y,
  K, E, clamp, lerp, inv, onTwos, shake, wobble, springTo, hash, INK, CREAM, YEL, MAG, CYAN, G,
} from './shotkit.js';

const billboard = (mesh, camera) => mesh.quaternion.copy(camera.quaternion);

// ---------------------------------------------------------------------------------
// SHOT 03 — THE STAR COLLAPSES (0:10–0:20)
// ---------------------------------------------------------------------------------
export function shot3(t, lt, w) {
  const { astro: a, big, ns, overlay: o, post, camera } = w;
  const lc = onTwos(t) - 10;
  const SC = V3(0, 0, -40);
  w.dust.points.visible = true;
  w.sky.setPalette('warm', 'deep', inv(6.0, 8.0, lt));

  const boom = 3.85;
  const collapseStart = 6.05;
  const born = 7.55;

  // --- the massive star swells, shivers, blows
  const pulse = Math.sin(lt * 5.2) * 0.12 + Math.sin(lt * 9.1) * 0.06;
  let R = K(lt, [[0, 6.5], [3.35, 12.5, 'inOut']]) + pulse;
  if (lt > 3.35 && lt < boom) R += (hash(Math.floor(t * 30)) - 0.5) * 0.7 * inv(3.35, boom, lt);
  const core = K(lt, [[boom, 12.5], [4.35, 2.3, 'out3'], [collapseStart, 2.0], [born, 0.12, 'in3']]);
  const radius = lt < boom ? R : core;
  big.root.visible = lt < born;
  big.root.position.copy(SC);
  big.sphere.scale.setScalar(radius);
  big.mat.uniforms.uTime.value = t;
  big.mat.uniforms.uHeat.value = K(lt, [[3.3, 0], [boom, 0.75, 'in'], [4.1, 0.2], [collapseStart, 0.1], [born, 1, 'in']]);
  big.mat.uniforms.uCollapse.value = inv(boom, 4.6, lt);
  big.corona.scale.setScalar(radius * 3.3);
  big.corona2.scale.setScalar(radius * 2.4);
  big.corona.material.color.set(lt < boom ? '#ff8a3d' : '#4fd8ff');
  big.corona2.material.color.set(lt < boom ? '#ffd27a' : '#bff6ff');

  // supernova debris
  const nova = lt > boom;
  w.puffs.mesh.visible = nova;
  w.puffs.mesh.position.copy(SC);
  const pu = w.puffs.mat.uniforms;
  pu.uSpread.value = K(lt, [[boom, 7], [6.0, 14.5, 'out3'], [10, 19, 'lin']]);
  pu.uSize.value = K(lt, [[boom, 1.4], [6.0, 2.3, 'out'], [10, 2.8]]);
  pu.uNear.value = 5;
  pu.uSwirl.value = K(lt, [[boom, 0], [10, 1.6, 'out']]);
  pu.uOpacity.value = K(lt, [[boom, 1], [6.0, 0.85], [born, 0.5]]);
  w.streaks.mesh.visible = lt > boom && lt < 5.0;
  w.streaks.mesh.position.copy(SC);
  const su = w.streaks.mat.uniforms;
  su.uR.value = K(lt, [[boom, 11], [5.0, 55, 'out']]);
  su.uLen.value = 9;
  su.uWidth.value = 0.12;
  su.uOpacity.value = K(lt, [[boom, 1], [5.0, 0]]);
  w.ring.visible = lt > boom && lt < 5.1;
  w.ring.position.copy(SC);
  w.ring.scale.setScalar(K(lt, [[boom, 12], [5.1, 70, 'out']]));
  w.ring.material.opacity = K(lt, [[boom, 1], [5.1, 0]]);
  w.ring2.visible = lt > boom + 0.12 && lt < 5.4;
  w.ring2.position.copy(SC);
  w.ring2.scale.setScalar(K(lt, [[boom + 0.12, 10], [5.4, 50, 'out']]));
  w.ring2.material.opacity = K(lt, [[boom + 0.12, 1], [5.4, 0]]);
  // collapse: streaks rush inward
  w.streaks2.mesh.visible = lt > collapseStart && lt < born + 0.1;
  w.streaks2.mesh.position.copy(SC);
  const s2 = w.streaks2.mat.uniforms;
  s2.uR.value = K(lt, [[collapseStart, 24], [born, 0.3, 'in']]);
  s2.uLen.value = K(lt, [[collapseStart, 5], [born, 0.6, 'in']]);
  s2.uWidth.value = 0.06;
  s2.uOpacity.value = K(lt, [[collapseStart, 0], [collapseStart + 0.2, 1], [born, 1]]);

  // neutron star is born
  ns.root.visible = lt > born - 0.02;
  ns.root.position.copy(SC);
  const nsPop = K(lt, [[born, 3.5], [born + 0.35, 1, 'out3']]);
  ns.root.scale.setScalar(nsPop);
  ns.update(t, t * 4, 1 + K(lt, [[born, 1.5], [born + 0.5, 0]]));
  ns.fieldMat.opacity = 0.35;

  // --- astronaut: foreground silhouette measuring with a thumb, then blown away;
  // later drifts back beside the tiny neutron star
  a.root.visible = lt < 4.7 || lt > 7.65;
  const p = P();
  p.time = t;
  if (lt < 4.7) {
    const blow = E.in(inv(boom + 0.05, 4.7, lc));
    a.root.position.set(lerp(-1.5, -4, blow), lerp(-3.4, -1.0, blow) + Math.sin(lc * 1.3) * 0.08, lerp(-6, 6, blow));
    a.root.rotation.set(blow * 4, Math.PI + 0.25 + blow * 3, blow * 5);
    const thumb = E.inOut(inv(0.9, 1.35, lc)) * (1 - E.inOut(inv(2.6, 3.1, lc)));
    p.handR = [lerp(0.6, 0.35, thumb), lerp(-0.05, 1.05, thumb), lerp(0.2, 0.75, thumb)];
    p.fistR = thumb;
    p.thumbUpR = thumb;
    p.handL = [-0.6, lerp(-0.05, 0.2, inv(2.6, 3.2, lc)), 0.25];
    p.headTilt = 0.12 * thumb;
    p.sweat = inv(2.6, 3.0, lc);
    p.antennaSwing = [Math.sin(lc * 2) * 0.15 + wobble(lc - boom, 3, 2, 1.5), 0];
    p.footL = [-0.22, -0.68 + Math.sin(lc * 2.5) * 0.05, 0.05];
    p.footR = [0.22, -0.7 - Math.sin(lc * 2.5) * 0.05, 0.02];
    if (blow > 0) {
      p.handL = [-0.8, 0.6, 0.1];
      p.handR = [0.8, 0.6, 0.1];
      p.mouthOpen = 1;
      p.eyeScale = 1.3;
    }
    G.uRimColor.value.set('#ffb35a');
    G.uRimDir.value.set(0, 0.3, -1).normalize();
    G.uKeyColor.value.set('#ffd9b0');
    G.uLightDir.value.set(0.2, 0.5, -1).normalize();
    a.apply(p);
  } else {
    // drifts back in and floats beside the tiny star, baffled
    const drift = E.out3(inv(7.65, 8.45, lc));
    const A = V3(SC.x + 1.0, SC.y - 0.75, SC.z + 0.3);
    a.root.position.set(lerp(A.x + 3.5, A.x, drift), A.y + Math.sin(lc * 1.6) * 0.05 + (1 - drift) * 0.8, A.z);
    a.root.rotation.set(0, lerp(-1.2, -0.35, drift), lerp(-0.6, 0, drift));
    const conf = inv(8.55, 8.8, lc);
    p.lookX = -0.9;
    p.lookY = -0.15;
    p.eyeOpen = 1;
    p.browAngle = 0.4 * conf;
    p.browY = 0.3 * conf;
    p.mouthCurve = lerp(0.2, -0.5, conf);
    p.mouthW = lerp(1, 0.6, conf);
    p.headTilt = 0.3 * conf;
    p.antennaSwing = [Math.sin(lc * 2) * 0.2, wobble(lc - 8.45, 2, 3, 0.6)];
    // scratches helmet
    const scr = Math.sin(lc * 22) * 0.05;
    p.handL = conf > 0 ? [-0.45, 1.2 + scr, 0.45] : [-0.6, 0.0, 0.25];
    p.fistL = conf;
    p.handR = [0.6, -0.05, 0.3];
    G.uRimColor.value.set('#bff6ff');
    G.uRimDir.value.copy(SC.clone().sub(A).normalize());
    a.apply(p);
  }

  // --- camera
  let cPos;
  let cTgt;
  let fov = 40;
  if (lt < collapseStart) {
    cPos = K(lt, [[0, [0, 0.4, -30.2]], [1.2, [0, 0, 8], 'outExpo'], [boom, [0, 0, 8.5]], [5.7, [0, 1.5, 34], 'out'], [collapseStart, [0, 1.5, 34]]]);
    cTgt = [0, 0, -40];
    fov = K(lt, [[0, 70], [1.2, 40, 'out'], [boom, 42], [4.3, 46, 'out']]);
  } else if (lt < born + 0.1) {
    cPos = K(lt, [[collapseStart, [0, 1.5, 34]], [born, [0.3, 0.1, -33.5], 'in3']]);
    cTgt = [0, 0, -40];
    fov = K(lt, [[collapseStart, 46], [born, 34, 'in']]);
  } else {
    cPos = K(lt, [[born + 0.1, [0.4, 0.3, -34]], [8.6, [0.85, 1.05, -33.9], 'out']]);
    cTgt = K(lt, [[born + 0.1, [0, 0.2, -40]], [8.6, [0.6, 0.85, -39.8], 'out']]);
    fov = 40;
  }
  const sh = shake(t, 10 + boom, 0.55, 3.2, 18);
  const sh2 = shake(t, 10 + born, 0.12, 6, 25, 3);
  [cPos, cTgt] = addShake(cPos, cTgt, [sh[0] + sh2[0], sh[1] + sh2[1]]);
  w.cam(cPos, cTgt, fov);
  billboard(w.ring, camera);
  billboard(w.ring2, camera);

  // --- post
  post.u.uFlash.value = K(lt, [[0, 1], [0.28, 0]]) + K(lt, [[boom, 0], [boom + 0.03, 1], [4.35, 0]]) + K(lt, [[born - 0.03, 0], [born, 0.8], [born + 0.25, 0]]);
  post.u.uSplit.value = 1.5 + K(lt, [[boom, 0], [boom + 0.05, 14], [5.0, 1]]) + K(lt, [[born, 0], [born + 0.03, 8], [born + 0.5, 0]]);
  post.u.uZoomBlur.value = K(lt, [[0, 1], [0.8, 0]]) + K(lt, [[collapseStart + 0.3, 0], [born - 0.1, 0.9, 'in'], [born + 0.15, 0]]);
  if (impact(post, t, 10 + boom + 0.05, 'IIN')) {
    w.sky.mat.uniforms.uAmt.value = 0;
    post.u.uThresh.value = 0.55;
  }
  if (impact(post, t, 10 + born, 'IN')) w.sky.mat.uniforms.uAmt.value = 0;

  // --- overlay
  const [cx, cy] = w.toScreen(SC);
  o.focusLines(cx, cy, K(lt, [[collapseStart + 0.2, 0], [born - 0.2, 1], [born + 0.3, 0]]), { inner: 160, color: CREAM, count: 110 });
  o.word('IT STARTS AS', 540, 255, { size: 104, p: inv(0.5, 0.75, lt), out: inv(3.3, 3.45, lt), rot: -3 });
  o.word('A GIANT STAR', 540, 385, { size: 152, p: inv(0.65, 0.95, lt), out: inv(3.3, 3.45, lt), rot: 2, fill: YEL, shadowCol: MAG });
  o.caption(["8–20× THE SUN'S MASS"], 540, 1310, { size: 52, p: inv(1.2, 1.4, lt), out: inv(3.3, 3.45, lt), rot: -2 });
  o.burst(540, 760, 250, { p: inv(boom + 0.1, boom + 0.25, lt), out: inv(5.6, 5.8, lt), seed: 2, fill: YEL, points: 18, sx: 1.4 });
  o.word('SUPERNOVA!', 540, 760, { size: 150, p: inv(boom + 0.12, boom + 0.32, lt), out: inv(5.6, 5.8, lt), rot: -6, fill: MAG, shadowCol: INK, stagger: 0.03 });
  o.word('THE CORE', 540, 270, { size: 120, p: inv(collapseStart + 0.1, collapseStart + 0.3, lt), out: inv(born - 0.1, born, lt), rot: -3 });
  o.word('COLLAPSES...', 540, 405, { size: 140, p: inv(collapseStart + 0.25, collapseStart + 0.5, lt), out: inv(born - 0.1, born, lt), rot: 2, fill: CYAN, shadowCol: MAG });
  o.word('...INTO A', 540, 250, { size: 100, p: inv(born + 0.15, born + 0.35, lt), rot: -2 });
  o.word('NEUTRON STAR', 540, 375, { size: 150, p: inv(born + 0.3, born + 0.55, lt), rot: 2, fill: CYAN, shadowCol: MAG });
  o.caption(['~20 KM ACROSS', 'MORE MASS THAN THE SUN'], 540, 535, { size: 50, p: inv(8.1, 8.3, lt), rot: -2 });
  if (lt > born) {
    const [nx, ny] = w.toScreen(SC);
    o.note('*not to scale', nx - 40, ny + 190, { size: 40, p: inv(8.4, 8.6, lt), rot: -6, color: CREAM });
    const [hx, hy] = w.toScreen(a.helmetWorld([0.1, 1.15, 0]));
    o.glyph('?', clamp(hx + 250, 200, 920), hy + 60, { p: inv(8.6, 8.75, lt), size: 220, rot: 10 + Math.sin(lt * 6) * 4 });
  }
  o.scratches(0.9);
}

// ---------------------------------------------------------------------------------
// SHOT 04 — THE DENSITY REVEAL (0:20–0:32)
// ---------------------------------------------------------------------------------
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function layoutAtoms(w, lt) {
  const { NX, NY, NZ } = w.atomGrid;
  const s = K(lt, [[2.2, 3.0], [4.0, 0.6, 'inOut3']]);
  const orbitR = K(lt, [[2.35, 1.0], [3.45, 0.0, 'in3']]);
  const nuc = K(lt, [[3.25, 1], [3.7, 0, 'in']]);
  const pack = K(lt, [[3.3, 0], [3.85, 1, 'outBack']]);
  let i = 0;
  for (let ix = 0; ix < NX; ix++)
    for (let iy = 0; iy < NY; iy++)
      for (let iz = 0; iz < NZ; iz++, i++) {
        const sd = w.atomSeed[i];
        const jit = 0.12 * (1 - inv(2.2, 4.0, lt));
        const pos = V3((ix - (NX - 1) / 2 + (sd[0] - 0.5) * jit) * s, (iy - (NY - 1) / 2 + (sd[1] - 0.5) * jit) * s, (iz - (NZ - 1) / 2 + (sd[2] - 0.5) * jit) * s);
        _e.set(sd[0] * 6 + lt * (0.5 + sd[1]), sd[1] * 6 + lt * 0.7, sd[2] * 6);
        _q.setFromEuler(_e);
        const ns = Math.max(nuc, 0.0001) * 1.25;
        _m.compose(pos, _q, _s.set(ns, ns, ns));
        w.protons.setMatrixAt(i, _m);
        w.neutrons.setMatrixAt(i, _m);
        const pr = Math.max(pack * 0.5 * s * 0.97, 0.0001);
        _m.compose(pos, _q, _s.set(pr, pr, pr));
        w.packed.setMatrixAt(i, _m);
        for (let k = 0; k < 2; k++) {
          _e.set(sd[3] * 3 + k * 1.3, sd[0] * 3 + k * 2.1, sd[2] * 2);
          const rq = new THREE.Quaternion().setFromEuler(_e);
          const rr = Math.max(orbitR * (0.75 + 0.35 * k), 0.0001);
          _m.compose(pos, rq, _s.set(rr, rr, rr));
          w.rings.setMatrixAt(i * 2 + k, _m);
          const ang = lt * (2.5 + sd[k] * 2) * (k ? -1 : 1) + sd[3] * 6;
          _v.set(Math.cos(ang) * rr, Math.sin(ang) * rr, 0).applyQuaternion(rq).add(pos);
          const es = orbitR > 0.02 ? 1 : 0.0001;
          _m.compose(_v, _q.identity(), _s.set(es, es, es));
          w.electrons.setMatrixAt(i * 2 + k, _m);
        }
      }
  for (const m of [w.protons, w.neutrons, w.packed, w.rings, w.electrons]) m.instanceMatrix.needsUpdate = true;
  return s;
}

export function shot4(t, lt, w) {
  const { astro: a, spoon: sp, overlay: o, post, mountain, scale: scl } = w;
  const lc = onTwos(t) - 20;
  const partB = lt >= 5.3;

  if (!partB) {
    // ---- inside the density: atoms -> crushed -> neutrons
    w.atoms.visible = true;
    w.sky.setPalette('dimension');
    w.sky.mat.uniforms.uAmt.value = 1.1;
    w.dust.points.visible = false;
    G.uLightDir.value.set(0.4, 0.8, 0.45).normalize();
    G.uRimColor.value.set('#2ee6ff');
    G.uRimDir.value.set(-0.5, 0.3, -0.8).normalize();
    const s = layoutAtoms(w, lt);
    w.ringMat.opacity = 0.6 * K(lt, [[2.4, 1], [3.4, 0]]);
    // camera travels between atoms in lattice space
    const u = K(lt, [[0, 10], [2.2, 1.8, 'out'], [4.0, 9.6, 'inOut'], [4.25, 9.8]]);
    const back = E.inExpo(inv(4.25, 5.3, lt));
    const ux = 0.18 * Math.sin(lt * 1.3);
    const uy = 0.5 + 0.15 * Math.sin(lt * 1.7);
    let pos = [ux * s, uy * s, (u + back * 30) * s];
    let tgt = [ux * s * 0.5 + Math.sin(lt * 0.9) * 0.6 * s, uy * s - 0.1 * s, (u - 6) * s];
    if (back > 0) {
      pos = [lerp(pos[0], 6, back), lerp(pos[1], 4, back), pos[2]];
      tgt = [lerp(tgt[0], 0, back), lerp(tgt[1], 0, back), lerp(tgt[2], 0, back)];
    }
    w.cam(pos, tgt, K(lt, [[0, 70], [0.6, 52, 'out'], [4.2, 58], [5.0, 40]]), Math.sin(lt * 0.8) * 0.08);
    post.u.uFlash.value = K(lt, [[0, 1], [0.35, 0]]) + K(lt, [[5.1, 0], [5.3, 1, 'in']]);
    post.u.uZoomBlur.value = K(lt, [[0, 0.8], [0.5, 0]]) + K(lt, [[4.3, 0], [5.0, 0.6, 'in']]);
    post.u.uGlitch.value = K(lt, [[5.0, 0], [5.25, 0.8, 'in']]);
    // squeeze emanata
    o.focusLines(540, 960, K(lt, [[2.3, 0], [2.6, 0.75], [3.9, 0.8], [4.2, 0]]), { inner: 520, color: CREAM, count: 80 });
    o.word('ATOMS ARE', 540, 250, { size: 110, p: inv(0.45, 0.7, lt), out: inv(2.25, 2.4, lt), rot: -3 });
    o.word('MOSTLY EMPTY SPACE', 540, 380, { size: 100, p: inv(0.6, 0.95, lt), out: inv(2.25, 2.4, lt), rot: 2, fill: CYAN, shadowCol: MAG, stagger: 0.03 });
    o.burst(540, 330, 190, { p: inv(2.4, 2.55, lt), out: inv(3.2, 3.35, lt), seed: 6, fill: MAG });
    o.word('SQUEEZE!', 540, 330, { size: 140, p: inv(2.42, 2.6, lt), out: inv(3.2, 3.35, lt), rot: -5, fill: YEL, shadowCol: INK });
    o.caption(['GRAVITY CRUSHES ELECTRONS', 'INTO PROTONS → NEUTRONS'], 540, 1310, { size: 46, p: inv(2.7, 2.9, lt), out: inv(4.9, 5.05, lt) });
    o.word('NEUTRONS,', 540, 250, { size: 120, p: inv(3.6, 3.8, lt), out: inv(4.95, 5.1, lt), rot: -3 });
    o.word('PACKED TIGHT', 540, 385, { size: 140, p: inv(3.75, 4.0, lt), out: inv(4.95, 5.1, lt), rot: 2, fill: YEL, shadowCol: MAG });
    o.scratches(0.8);
    return;
  }

  // ---- the weigh-in
  const L = lt;
  w.floor.visible = true;
  w.floorMat.uniforms.uLabelAmt.value = 0;
  w.floorMat.uniforms.uRadius.value = 30;
  w.sky.setPalette('deep');
  w.sky.mat.uniforms.uAmt.value = 0.9;
  w.dust.points.visible = true;
  scl.visible = true;
  scl.position.set(0, FLOOR_Y, 0);
  mountain.visible = true;
  sp.root.visible = true;
  G.uLightDir.value.set(0.5, 0.75, 0.6).normalize();

  const land = 6.45;
  const crack = 8.7;
  const fixA = 9.25;
  const fixed = 10.05;
  const kaboom = 10.6;
  // beam tilt: spoon side down -> mountain lands -> level (balanced)
  let tilt = -0.3 + (L > land ? 0.3 * springTo(L - land, 1.4, 3.2) : 0);
  const snap = E.in(inv(crack, crack + 0.22, L)) * (1 - E.inOut(inv(9.75, 10.0, L)));
  const scatter = E.out(inv(kaboom, kaboom + 0.9, L));
  const buckle = E.out3(inv(kaboom, kaboom + 0.35, L));
  if (L > crack) tilt = 0;
  const panDrop = [snap * 6 + scatter * 6, snap * 6 + scatter * 6];
  w.poseScale({ tilt, snap, buckle, panDrop, scatter, time: t });
  w.tape.visible = L > 9.55 && L < kaboom + 0.05;
  w.tape.scale.setScalar(E.outBack(inv(9.55, 9.85, L)));

  // mountain falls onto the left pan
  const panL = w.panTop(0);
  const mFall = E.in(inv(5.9, land, L));
  mountain.position.set(panL.x, lerp(panL.y + 22, panL.y - 0.05, mFall), panL.z);
  mountain.scale.setScalar(1);
  mountain.rotation.set(0, 0.4, scatter * 0.8);
  if (scatter > 0) mountain.position.add(V3(-scatter * 2.5, scatter * 1.5 - scatter * scatter * 3, 0));
  const mSquash = L > land ? 1 + wobble(L - land, 3, 6, -0.12) : 1;
  mountain.scale.set(1 / Math.sqrt(mSquash), mSquash, 1 / Math.sqrt(mSquash));

  // the spoon sits on the right pan (it walked there itself, obviously)
  const panR = w.panTop(1);
  const spQ = qLook([0.6, 0, 0.8]);
  const sS = 1.5;
  const bounceY = scatter > 0 ? scatter * 4 - scatter * scatter * 5 : 0;
  placeSpoonBy(sp, V3(0, -0.12, 0.34), panR.clone().add(V3(-0.3, bounceY, 0.5)), spQ, sS);
  if (scatter > 0) sp.root.rotateZ(scatter * 3);
  const st = SS();
  st.time = t;
  st.glow = 1.4;
  st.face = K(L, [[6.7, 0], [6.85, 1, 'outBack'], [7.6, 1], [7.8, 0]]);
  st.lookX = -1;
  st.lookY = 0.3;
  s_apply(sp, st);

  // astronaut: repair crew
  a.root.visible = L > fixA - 0.3 && L < kaboom + 1.4;
  const pivotW = V3(0, FLOOR_Y + 1.0 + 4.6 + 4.1, 0);
  if (a.root.visible) {
    const p = P();
    p.time = t;
    const arrive = E.out3(inv(fixA - 0.3, fixA + 0.05, lc));
    const A = pivotW.clone().add(V3(1.25, -1.15, -0.75));
    a.root.position.set(lerp(A.x + 6, A.x, arrive), lerp(A.y + 3, A.y, arrive) + Math.sin(lc * 2) * 0.04, A.z);
    a.root.rotation.set(0, -0.55, lerp(-0.5, 0, arrive));
    const wrap = inv(9.55, 9.9, lc);
    const push = E.inOut(inv(9.75, 10.0, lc));
    const proud = inv(fixed, fixed + 0.12, lc);
    p.tape = wrap > 0 && wrap < 1 ? 1 : 0;
    if (wrap > 0 && wrap < 1) {
      const ang = wrap * Math.PI * 6;
      p.handR = [0.0 + Math.cos(ang) * 0.12, 0.1 + Math.sin(ang) * 0.18, 0.85];
    } else p.handR = [0.6, 0.05, 0.3];
    p.handL = push > 0 && push < 1 ? [-0.3, 0.5, 0.8] : [-0.6, 0.0, 0.3];
    p.lookX = -0.6;
    p.lookY = 0.1;
    p.browAngle = -0.3;
    p.mouthCurve = 0.2;
    p.squash = 1 + wobble(lc - (fixA + 0.05), 3, 5, 0.1);
    if (proud > 0) {
      p.handR = [0.55, 0.45, 0.55];
      p.fistR = 1;
      p.thumbUpR = 1;
      p.mouthCurve = 1;
      p.mouthW = 1.2;
      p.eyeOpen = 0.55;
      p.eyeSquint = 0.6;
      p.browAngle = 0.2;
      p.lookX = 0.3;
      p.lookY = 0;
    }
    if (L > kaboom) {
      const fly = E.out(inv(kaboom, kaboom + 1.2, lc));
      a.root.position.add(V3(-fly * 9, fly * 7 - fly * fly * 2, fly * 2));
      a.root.rotation.set(fly * 6, fly * 3, fly * 9);
      p.mouthOpen = 1;
      p.eyeScale = 1.35;
      p.pupil = 0.5;
      p.thumbUpR = 0;
      p.handL = [-0.8, 0.7, 0.1];
      p.handR = [0.8, 0.7, 0.1];
    }
    p.antennaSwing = [wobble(lc - fixA, 2, 3, 0.8), 0];
    a.apply(p);
  }

  // camera
  const wide = [0, 5.4, 37];
  const wideT = [0, 4.6, 0];
  let cPos;
  let cTgt;
  if (L < 6.3) {
    const sW = spoonWorld(sp, V3(0, 0.1, 0.34));
    const k = E.inOutExpo(inv(5.3, 6.25, L));
    cPos = [lerp(sW.x + 0.4, wide[0], k), lerp(sW.y + 0.9, wide[1], k), lerp(sW.z + 2.6, wide[2], k)];
    cTgt = [lerp(sW.x, wideT[0], k), lerp(sW.y, wideT[1], k), lerp(sW.z, wideT[2], k)];
  } else if (L < fixA - 0.2) {
    cPos = K(L, [[6.3, wide], [crack, [0.5, 5.0, 33.5]]]);
    cTgt = wideT;
  } else if (L < kaboom - 0.05) {
    const k = E.inOut(inv(fixA - 0.2, fixA + 0.25, L)) * (1 - E.inOut(inv(fixed + 0.2, kaboom - 0.05, L)));
    const close = [pivotW.x + 1.6, pivotW.y + 0.2, pivotW.z + 13.5];
    cPos = [lerp(0.5, close[0], k), lerp(5.0, close[1], k), lerp(33.5, close[2], k)];
    cTgt = [lerp(0, pivotW.x + 0.5, k), lerp(4.6, pivotW.y - 1.1, k), lerp(0, pivotW.z, k)];
  } else {
    cPos = K(L, [[kaboom, [0.5, 5.0, 33.5]], [12, [0, 4.0, 40], 'out']]);
    cTgt = wideT;
  }
  const sh = shake(t, 20 + land, 0.35, 5, 20);
  const sh2 = shake(t, 20 + crack, 0.4, 5, 22, 2);
  const sh3 = shake(t, 20 + kaboom, 0.9, 3, 18, 4);
  [cPos, cTgt] = addShake(cPos, cTgt, [sh[0] + sh2[0] + sh3[0], sh[1] + sh2[1] + sh3[1]]);
  w.cam(cPos, cTgt, 40);
  const fm = w.floorMat.uniforms;
  fm.uRip.value[0].set(panL.x, 0, 20 + land, 0.25);
  fm.uRip.value[1].set(0, 0, 20 + crack + 0.2, 0.3);
  fm.uRip.value[2].set(0, 0, 20 + kaboom + 0.2, 0.5);

  // post
  post.u.uFlash.value = K(L, [[5.3, 1], [5.6, 0]]);
  post.u.uGlitch.value = K(L, [[5.3, 0.7], [5.55, 0]]) + K(L, [[11.6, 0], [12, 0.9, 'in']]);
  post.u.uSplit.value = 1.5 + K(L, [[land, 0], [land + 0.04, 6], [land + 0.4, 0]]) + K(L, [[crack, 0], [crack + 0.04, 9], [crack + 0.5, 0]]) + K(L, [[kaboom, 0], [kaboom + 0.04, 16], [kaboom + 1, 1]]);
  const imp = impact(post, t, 20 + crack, 'IIN') || impact(post, t, 20 + kaboom, 'IINNIIN');
  if (imp) {
    w.sky.mat.uniforms.uAmt.value = 0;
    post.u.uThresh.value = 0.45;
  }

  // overlay
  const [sx, sy] = w.toScreen(spoonWorld(sp, V3(0, 0.1, 0.34)));
  const [mx, my] = w.toScreen(mountain.position.clone().add(V3(0, 5.6, 0)));
  const labelOut = inv(kaboom - 0.1, kaboom, L);
  o.note('TEASPOON', clamp(sx + 40, 260, 820), sy - 250, { size: 64, p: inv(6.1, 6.35, L), out: Math.max(inv(8.6, 8.7, L), labelOut), rot: 4, color: YEL });
  o.arrow(clamp(sx + 40, 260, 820), sy - 205, sx + 5, sy - 45, { p: inv(6.25, 6.45, L), out: Math.max(inv(8.6, 8.7, L), labelOut), bend: 0.2, color: YEL });
  o.note('A MOUNTAIN', clamp(mx - 60, 240, 840), my + 470, { size: 64, p: inv(6.55, 6.8, L), out: Math.max(inv(8.6, 8.7, L), labelOut), rot: -4, color: CREAM });
  o.burst(clamp(mx, 300, 780), my + 330, 120, { p: inv(land, land + 0.12, L), out: inv(land + 0.6, land + 0.75, L), seed: 3, fill: CREAM });
  o.word('THOOM!', clamp(mx, 300, 780), my + 330, { size: 100, p: inv(land, land + 0.14, L), out: inv(land + 0.6, land + 0.75, L), rot: -7, fill: MAG, shadowCol: INK });
  const tOut = inv(kaboom - 0.05, kaboom + 0.1, L);
  const tsh = shake(t, 20 + crack, 16, 6, 28, 7);
  o.word('ONE TEASPOON', 540 + tsh[0], 255 + tsh[1], { size: 132, p: inv(7.2, 7.45, L), out: tOut, rot: -3 });
  o.word('~1 BILLION TONS', 540 - tsh[0], 400 + tsh[1], { size: 128, p: inv(7.55, 7.85, L), out: tOut, rot: 2, fill: YEL, shadowCol: MAG, stagger: 0.035 });
  o.caption(['≈ THE MASS OF A SMALL MOUNTAIN', '(A DENSITY COMPARISON.', ' NOT A SHIPPING PLAN.)'], 540, 1350, { size: 42, p: inv(8.0, 8.2, L), out: inv(kaboom - 0.1, kaboom, L), rot: -2 });
  const [px, py] = w.toScreen(pivotW);
  o.burst(px, py + 40, 140, { p: inv(crack, crack + 0.12, L), out: inv(crack + 0.6, crack + 0.75, L), seed: 8, fill: YEL });
  o.word('KRAK!', px, py + 40, { size: 120, p: inv(crack, crack + 0.14, L), out: inv(crack + 0.6, crack + 0.75, L), rot: 8, fill: MAG, shadowCol: INK });
  if (L > fixA) {
    const [ax, ay] = w.toScreen(a.helmetWorld([0, 1.0, 0]));
    o.note('FIXED!', clamp(ax + 60, 260, 820), ay - 40, { size: 90, p: inv(fixed + 0.05, fixed + 0.25, L), out: inv(kaboom - 0.02, kaboom, L), rot: -8, color: YEL });
  }
  o.focusLines(540, 900, K(L, [[kaboom, 0], [kaboom + 0.05, 1], [kaboom + 0.9, 0]]), { inner: 300, color: CREAM, count: 130, width: 1.5 });
  o.burst(540, 860, 300, { p: inv(kaboom + 0.02, kaboom + 0.2, L), out: inv(11.5, 11.7, L), seed: 12, fill: YEL, points: 20, sx: 1.25 });
  o.word('KRA-KOOM!!', 540, 860, { size: 150, p: inv(kaboom + 0.04, kaboom + 0.24, L), out: inv(11.5, 11.7, L), rot: -5, fill: MAG, shadowCol: INK, stagger: 0.03 });
  o.scratches(0.9);
}
function s_apply(sp, st) {
  sp.apply(st);
}

// ---------------------------------------------------------------------------------
// SHOT 05 — THE COSMIC LIGHTHOUSE (0:32–0:42)
// ---------------------------------------------------------------------------------
function spinAngle(lt) {
  // rev/s ramps 0.3 -> 1.25, integrated
  const r0 = 0.3;
  const r1 = 1.25;
  const T = 1.2;
  if (lt < T) return Math.PI * 2 * (r0 * lt + ((r1 - r0) * lt * lt * lt) / (3 * T * T));
  return Math.PI * 2 * (r0 * T + ((r1 - r0) * T) / 3 + r1 * (lt - T));
}
export function shot5(t, lt, w) {
  const { astro: a, ns, overlay: o, post } = w;
  const lc = onTwos(t) - 32;
  w.sky.setPalette('space');
  w.dust.points.visible = true;
  w.rocks.visible = true;
  w.updateRocks(t);
  ns.root.visible = true;
  const nsScale = 2.6;
  ns.root.scale.setScalar(nsScale);
  ns.magnetic.rotation.z = 1.15;
  const phi = spinAngle(lt);
  ns.update(t, phi, 1.15);
  ns.spikes.material.opacity *= 0.35;
  ns.spikes2.material.opacity *= 0.35;
  const beams = K(lt, [[0.9, 0], [1.3, 1, 'out']]);
  ns.setBeams(beams);
  ns.fieldMat.opacity = 0.55;
  G.uRimColor.value.set('#bff6ff');
  G.uKeyColor.value.set('#e9f6ff');

  // when does the upper beam point at azimuth az? beam azimuth = phi + offset
  const Aaz = 0.35;
  const elev = Math.PI / 2 - 1.15;
  const Aw = V3(Math.cos(Aaz) * 6.5 * Math.cos(elev), Math.sin(elev) * 6.5, -Math.sin(Aaz) * 6.5 * Math.cos(elev));
  // beam sweeping key-light pulse on everything near it
  const beamDir = V3(0, 1, 0).applyAxisAngle(V3(0, 0, 1), -1.15).applyAxisAngle(V3(0, 1, 0), phi);
  const hit = Math.pow(Math.max(beamDir.dot(Aw.clone().normalize()), 0), 40) * beams;
  w.rockMat.uniforms.uEmitAmt.value = 0;

  // astronaut caught in the rhythm
  a.root.visible = lt > 4.3;
  if (a.root.visible) {
    const p = P();
    p.time = t;
    const spinStart = 4.7;
    const spinEnd = 7.0;
    const stopT = 7.9;
    const psiAt = (x) => {
      const d = Math.max(0, Math.min(x, spinEnd) - spinStart);
      let v = Math.PI * 2 * (0.5 * d + 0.55 * d * d);
      if (x > spinEnd) {
        const vEnd = Math.PI * 2 * (0.5 + 1.1 * (spinEnd - spinStart));
        const dd = Math.min(x, stopT) - spinEnd;
        const T = stopT - spinEnd;
        v += vEnd * (dd - (dd * dd) / (2 * T));
      }
      return v;
    };
    const finalFacing = 2.25;
    const psi = psiAt(lc) - psiAt(stopT) + finalFacing + 0.6;
    const spinning = lc > spinStart && lc < stopT;
    const speed = spinning ? clamp((lc - spinStart) / 1.5) * (1 - inv(spinEnd, stopT, lc)) : 0;
    a.root.position.copy(Aw).add(V3(0, Math.sin(lc * 1.5) * 0.06, 0));
    a.root.rotation.set(0.12 * speed * Math.sin(lc * 3), -0.6 + psi, 0.18 * speed);
    p.handL = [-0.9 - 0.3 * speed, 0.35 + 0.3 * speed, 0.0];
    p.handR = [0.9 + 0.3 * speed, 0.35 + 0.3 * speed, 0.0];
    p.armBendL = p.armBendR = 0.1;
    p.footL = [-0.3 - 0.15 * speed, -0.62, 0.05];
    p.footR = [0.3 + 0.15 * speed, -0.62, 0.05];
    p.mouthOpen = spinning ? 0.8 : 0.1;
    p.eyeScale = spinning ? 1.2 : 1;
    p.squash = 1 + 0.12 * speed * Math.sin(lc * 30);
    p.antennaSwing = [speed * 1.2, speed * 0.3];
    p.dizzy = lc > 6.9 ? 1 : 0;
    if (lc < spinStart) {
      p.handL = [-0.6, 0.0, 0.3];
      p.handR = [0.6, 0.0, 0.3];
      p.lookX = 0.8;
      p.mouthOpen = 0;
      p.mouthCurve = 0.3;
    }
    if (lc > stopT) {
      p.handL = [-0.6, -0.1 + Math.sin(lc * 3) * 0.1, 0.3];
      p.handR = [0.6, -0.1 - Math.sin(lc * 3) * 0.1, 0.3];
      p.mouthOpen = 0.25;
      p.headTilt = Math.sin(lc * 4) * 0.25;
      p.bodyTilt = Math.sin(lc * 4 + 1) * 0.1;
    }
    a.apply(p);
    if (spinning) a.colorMats.white.uniforms.uEmitAmt.value = 0;
  }

  // camera
  let cPos;
  let cTgt;
  let fov = 44;
  if (lt < 1.5) {
    cPos = K(lt, [[0, [0.4, 0.9, 6.2]], [1.5, [1.5, 1.6, 9.5], 'inOut']]);
    cTgt = [0, 0, 0];
    fov = K(lt, [[0, 52], [1.5, 46]]);
  } else if (lt < 4.5) {
    // fly out through the asteroid field, looking back at the lighthouse
    const k = E.inOut(inv(1.5, 4.5, lt));
    const ang = lerp(1.35, -0.25, k);
    const r = lerp(9.5, 16, k);
    cPos = [Math.sin(ang) * r, lerp(1.6, 3.4, k) + Math.sin(lt * 1.3) * 0.4, Math.cos(ang) * r];
    cTgt = [lerp(0, 2, k), lerp(0, 1.5, k), 0];
    fov = 46;
  } else if (lt < 9.0) {
    const k = E.inOut(inv(4.5, 5.2, lt));
    const ang = lerp(1.7, 2.3, inv(4.5, 7.9, lt));
    const close = [Aw.x + Math.sin(ang) * 7.2, Aw.y + 0.9, Aw.z + Math.cos(ang) * 7.2];
    const far = [Math.sin(-0.25) * 16, 3.4, Math.cos(-0.25) * 16];
    cPos = far.map((v, i) => lerp(v, close[i], k));
    cTgt = [lerp(2, Aw.x - 0.9, k), lerp(1.5, Aw.y + 0.35, k), lerp(0, Aw.z + 0.3, k)];
    fov = lerp(46, 42, k);
  } else {
    const k = E.inOutExpo(inv(9.0, 9.5, lt));
    const ang = 2.3;
    const close = [Aw.x + Math.sin(ang) * 7.2, Aw.y + 0.9, Aw.z + Math.cos(ang) * 7.2];
    cPos = close.map((v, i) => lerp(v, [3, 6, 30][i], k));
    cTgt = [lerp(Aw.x - 0.9, 1.5, k), lerp(Aw.y + 0.35, 1.2, k), lerp(Aw.z + 0.3, 0, k)];
  }
  const sh = shake(t, 32 + 1.0, 0.12, 4, 20);
  const hitSh = [noise1s(t * 30) * hit * 0.08, noise1s(t * 30 + 5) * hit * 0.08];
  [cPos, cTgt] = addShake(cPos, cTgt, [sh[0] + hitSh[0], sh[1] + hitSh[1]]);
  w.cam(cPos, cTgt, fov);

  // post
  post.u.uGlitch.value = K(lt, [[0, 0.8], [0.3, 0]]);
  post.u.uFlash.value = K(lt, [[0.95, 0], [1.0, 0.6], [1.3, 0]]) + hit * 0.25 * (lt > 4.5 && lt < 7.9 ? 1 : 0);
  post.u.uSplit.value = 1.5 + hit * 6 + K(lt, [[0.95, 0], [1.0, 8], [1.4, 0]]);

  // overlay
  const [nx, ny] = w.toScreen(V3(0, 0, 0));
  if (lt < 1.5) {
    // spin arcs around the star
    const g = o.g;
    g.save();
    g.strokeStyle = CREAM;
    g.lineWidth = 7;
    const rr = 240;
    for (let k = 0; k < 3; k++) {
      const a0 = phi * 0.5 + k * 2.1;
      g.beginPath();
      g.ellipse(nx, ny, rr + k * 30, (rr + k * 30) * 0.3, -0.15, a0, a0 + 1.2);
      g.stroke();
    }
    g.restore();
  }
  o.word('IT SPINS.', 540, 260, { size: 130, p: inv(0.25, 0.45, lt), out: inv(1.15, 1.25, lt), rot: -4 });
  o.word('PULSAR', 540, 300, { size: 230, p: inv(1.25, 1.5, lt), out: inv(4.3, 4.45, lt), rot: -3, fill: CYAN, fill2: CREAM, shadowCol: MAG, stagger: 0.05 });
  o.caption(['SOME SPIN 700+ TIMES', 'A SECOND. TWO BEAMS', 'SWEEP SPACE LIKE A', 'LIGHTHOUSE.'], 540, 1310, { size: 46, p: inv(1.9, 2.1, lt), out: inv(4.3, 4.45, lt) });
  if (a.root.visible && lt > 4.5 && lt < 9.05) {
    const [hx, hy] = w.toScreen(a.helmetWorld([0, 0, 0]));
    o.speedLines(0, K(lt, [[5.2, 0], [6.0, 0.6], [7.0, 0.8], [7.8, 0]]), { count: 30, alpha: 0.5 });
    o.word('@#$%&!', clamp(hx, 300, 780), clamp(hy - 330, 280, 900), { size: 130, p: inv(5.5, 5.7, lt), out: inv(6.9, 7.05, lt), rot: -6 + Math.sin(lt * 20) * 3, fill: YEL, shadowCol: MAG, wave: true });
    if (lt > 7.05) {
      // dizzy stars orbiting the helmet
      for (let k = 0; k < 4; k++) {
        const ang = lt * 5 + (k * Math.PI) / 2;
        const sx = hx + Math.cos(ang) * 200;
        const sy = hy - 190 + Math.sin(ang) * 50;
        o.word('★', sx, sy, { size: 70, p: inv(7.05, 7.25, lt), rot: ang * 20, fill: YEL, shadowCol: MAG, stroke: 10, shadow: 4, font: 'sans-serif' });
      }
    }
  }
  o.caption(['A CITY-SIZED', 'COSMIC LIGHTHOUSE'], 540, 1320, { size: 52, p: inv(9.2, 9.4, lt) });
  o.scratches(0.9);
}
function noise1s(x) {
  return Math.sin(x * 1.7) * 0.6 + Math.sin(x * 3.1 + 1) * 0.4;
}

// ---------------------------------------------------------------------------------
// SHOT 06 — THE FINAL JOKE (0:42–0:52)
// ---------------------------------------------------------------------------------
export function shot6(t, lt, w) {
  const { astro: a, spoon: sp, ns, overlay: o, post, earth } = w;
  const lc = onTwos(t) - 42;
  w.sky.setPalette('space');
  w.dust.points.visible = true;
  ns.root.visible = true;
  ns.root.position.set(-1.1, 0.25, -0.6);
  ns.root.scale.setScalar(1.3);
  ns.magnetic.rotation.z = 1.15;
  ns.update(t, t * 2.2, 1);
  ns.setBeams(0.3);
  G.uRimColor.value.set('#bff6ff');
  G.uRimDir.value.set(-1, 0.2, -0.4).normalize();
  earth.visible = true;
  earth.position.set(-7, 6.5, -30);
  earth.scale.setScalar(1.4);
  earth.rotation.y = t * 0.2;

  const freeze0 = 2.0;
  const freeze1 = 2.65;
  const grow0 = 2.65;
  const tdown = 3.45;
  const drop = 6.05;
  const panel0 = 6.25;
  const fill0 = 7.35;
  const text0 = 8.0;
  const pix0 = 9.35;
  const frozen = lc > freeze0 && lc < freeze1;
  const tc = frozen ? freeze0 : lc; // dramatic silence: everything holds

  // --- astronaut + spoon
  a.root.visible = lt < fill0 + 0.7;
  const A = V3(0.9, -0.3, 0.3);
  const p = P();
  p.time = t;
  const sneak = E.inOut(inv(1.45, freeze0, tc));
  a.root.position.copy(A).add(V3(-0.35 * sneak, 0.12 * sneak + Math.sin(tc * 1.6) * 0.05, -0.2 * sneak));
  const faceCam = inv(grow0, grow0 + 0.3, lc) * (1 - inv(drop, drop + 0.3, lc));
  a.root.rotation.set(0, lerp(lerp(-0.35, -0.7, sneak), -0.05, faceCam), lerp(0, 0.12, sneak) * (1 - faceCam));
  p.dizzy = 0.9 * (1 - inv(0.2, 1.0, tc));
  p.headTilt = Math.sin(tc * 4) * 0.2 * (1 - inv(0.3, 1.0, tc));
  // looks at spoon, then at HOME, then the sly grin
  const lookSpoon = inv(1.0, 1.15, tc);
  const lookHome = inv(1.4, 1.55, tc);
  p.lookX = lerp(lerp(0, 0.7, lookSpoon), -0.85, lookHome);
  p.lookY = lerp(lerp(0, -0.5, lookSpoon), 0.65, lookHome);
  p.mouthCurve = lerp(0.1, 1.0, inv(1.55, 1.75, tc));
  p.mouthW = lerp(1, 1.25, inv(1.55, 1.75, tc));
  p.eyeOpen = lerp(1, 0.55, inv(1.55, 1.75, tc));
  p.browAngle = -0.35 * inv(1.55, 1.75, tc);
  p.handR = [0.5, 0.15, 0.55];
  p.fistR = 1;
  p.handL = [0.05, 0.1, 0.6];
  p.armBendL = 0.4;
  // fear when the spoon looms
  const fear = inv(grow0 + 0.1, grow0 + 0.35, lc);
  if (fear > 0) {
    p.lookX = 0.3;
    p.lookY = 1;
    p.eyeScale = 1 + 0.35 * fear;
    p.pupil = 1 - 0.45 * fear;
    p.eyeOpen = 1;
    p.mouthCurve = -0.6;
    p.mouthOpen = 0.5 * fear;
    p.mouthW = 0.8;
    p.browAngle = 0.6 * fear;
    p.browY = 0.5 * fear;
    p.sweat = fear;
    p.blush = 0.2;
    p.headNod = -0.25 * fear;
    p.handL = [-0.45, 0.55, 0.45];
    p.handR = [lerp(0.5, 0.95, fear), lerp(0.15, 0.75, fear), lerp(0.55, 0.15, fear)];
    p.lookX = 0.7;
    p.lookY = 0.9;
    p.headTurn = 0.25 * fear;
  }
  const letGo = inv(drop, drop + 0.12, lc);
  if (letGo > 0) {
    p.fistR = 1 - letGo;
    p.handR = [0.65, 0.35, 0.5];
    p.mouthCurve = lerp(-0.6, 0.4, inv(drop + 0.2, drop + 0.5, lc));
    p.mouthOpen = 0;
    p.eyeOpen = lerp(1, 0.6, inv(drop + 0.2, drop + 0.5, lc));
    p.browAngle = 0.3;
    p.lookY = lerp(1, -0.8, inv(drop, drop + 0.3, lc));
    p.lookX = 0.4;
    p.headNod = 0.15;
    p.sweat = 0.6;
  }
  p.antennaSwing = [Math.sin(tc * 2) * 0.15 + wobble(lc - grow0, 3, 3, 0.9), 0];
  a.apply(p);

  // spoon: held, transforms, thumbs down, dropped into a black panel
  sp.root.visible = lt < panel0 + 0.9;
  const handW = a.handWorld(1);
  const grow = E.outBackBig(inv(grow0, grow0 + 0.45, lc));
  const shrink = E.in(inv(drop, drop + 0.22, lc));
  const big = 1.15 + 2.75 * grow * (1 - shrink);
  const upright = E.inOut(inv(grow0, grow0 + 0.35, lc));
  const dir = V3(lerp(0.75, 0.2, upright), lerp(0.5, 1, upright), lerp(0.45, 0.05, upright)).normalize();
  const q = qLook([dir.x, dir.y, dir.z], [lerp(0, 0.1, upright), lerp(1, 0.08, upright), lerp(0, 1, upright)]);
  const grip = handlePt(sp, 0.9);
  if (lc < drop) placeSpoonBy(sp, grip, handW, q, big);
  else {
    const fall = Math.max(0, lc - drop - 0.05);
    placeSpoonBy(sp, grip, handW.clone().add(V3(0.1, -10 * fall * fall - 1.2 * fall, 0.2 * fall)), q, big);
    sp.root.rotateX(fall * 3);
  }
  const st = SS();
  st.time = t;
  st.squash = 1 + wobble(lc - grow0, 3, 4, 0.25);
  st.face = K(tc, [[1.95, 0], [2.0, 0.55], [grow0 + 0.1, 0.55], [grow0 + 0.3, 1, 'outBack']]);
  st.eyeOpen = K(lc, [[freeze0, 0.15], [freeze1, 0.35], [grow0 + 0.25, 1.1]]);
  st.browAngle = -0.8 * inv(grow0 + 0.05, grow0 + 0.25, lc);
  st.lookX = 0.35;
  st.lookY = -0.75;
  st.pupil = 0.9;
  const talk = lc > tdown + 0.35 && lc < 5.5 ? Math.abs(Math.sin((lc - tdown) * 15)) : 0;
  st.mouth = talk * 0.9 + 0.12 * inv(grow0 + 0.3, grow0 + 0.4, lc) * (1 - shrink);
  st.mouthW = 1.1;
  st.arms = E.outBack(inv(grow0 + 0.2, grow0 + 0.5, lc)) * (1 - shrink);
  const td = E.outBackBig(inv(tdown, tdown + 0.2, lc));
  st.handL = [-0.32, 0.12, -0.55];
  st.handR = [lerp(0.42, 0.26, td), lerp(0.05, 0.4, td), lerp(0.3, -0.18, td)];
  st.thumbDown = td;
  st.glow = 1.2;
  if (lc > drop) {
    st.face = 1 - shrink;
    st.mouth = 0;
  }
  sp.apply(st);

  // --- camera
  let cPos;
  let cTgt;
  let fov = 40;
  const head = a.helmetWorld([0, 0, 0]);
  if (lt < freeze0) {
    const k = E.outExpo(inv(0, 1.25, lt));
    const close = [head.x + 0.35, head.y + 0.1, head.z + 2.9];
    const wide = [-0.4, 0.9, 10.5];
    cPos = close.map((v, i) => lerp(v, wide[i], k));
    cTgt = [lerp(head.x, -0.1, k), lerp(head.y, 0.4, k), lerp(head.z, 0, k)];
    fov = lerp(38, 42, k);
  } else if (lt < grow0) {
    cPos = [-0.4, 0.9, 10.5];
    cTgt = [-0.1, 0.4, 0];
    fov = 42;
  } else if (lt < drop) {
    const k = E.inOutExpo(inv(grow0, grow0 + 0.4, lt));
    const low = [A.x + 1.0, A.y - 1.0, A.z + 10.2];
    cPos = [lerp(-0.4, low[0], k), lerp(0.9, low[1], k), lerp(10.5, low[2], k)];
    cTgt = [lerp(-0.1, A.x + 0.25, k), lerp(0.4, A.y + 3.0, k), lerp(0, A.z, k)];
    fov = lerp(42, 52, k);
  } else {
    const k = E.inOut(inv(drop, drop + 0.4, lt));
    const low = [A.x + 1.0, A.y - 1.0, A.z + 10.2];
    cPos = low.map((v, i) => lerp(v, [0.9, 0.6, 9.2][i], k));
    cTgt = [lerp(A.x + 0.25, 0.7, k), lerp(A.y + 3.0, -1.2, k), lerp(A.z, 0, k)];
    fov = lerp(52, 44, k);
  }
  const sh = shake(t, 42 + grow0, 0.08, 5, 22);
  const sh2 = shake(t, 42 + tdown + 0.1, 0.14, 5, 24, 3);
  [cPos, cTgt] = addShake(cPos, cTgt, [sh[0] + sh2[0], sh[1] + sh2[1]]);
  w.cam(cPos, cTgt, fov);

  // --- post
  post.u.uSplit.value = 1.5 + K(lt, [[grow0, 0], [grow0 + 0.05, 7], [grow0 + 0.5, 0]]) + K(lt, [[tdown + 0.1, 0], [tdown + 0.14, 10], [tdown + 0.6, 0]]);
  if (impact(post, t, 42 + tdown + 0.12, 'IIN')) {
    w.sky.mat.uniforms.uAmt.value = 0;
    post.u.uThresh.value = 0.42;
  }
  if (frozen) post.u.uGrain.value = 0.07;

  // --- overlay
  if (lt < panel0) {
    const [ex, ey] = w.toScreen(earth.position);
    o.note('HOME', ex + 120, ey + 20, { size: 70, p: inv(1.35, 1.55, lt), out: inv(grow0, grow0 + 0.1, lt), rot: -6, color: YEL });
    o.arrow(ex + 70, ey + 70, ex + 25, ey + 25, { p: inv(1.45, 1.6, lt), out: inv(grow0, grow0 + 0.1, lt), bend: 0.3, color: YEL, w: 6 });
  }
  const [mx, my] = w.toScreen(spoonWorld(sp, V3(0, 0.12, 0.2)));
  o.focusLines(mx, my, K(lt, [[tdown + 0.1, 0], [tdown + 0.15, 1], [tdown + 0.8, 0.0]]), { inner: 420, color: CREAM, count: 110, width: 1.3 });
  o.bubble(['YOU’RE NOT', 'TAKING ME HOME.'], 470, 270, clamp(mx - 170, 200, 800), my - 10, { size: 92, p: inv(tdown + 0.3, tdown + 0.5, lt), out: inv(drop + 0.05, drop + 0.2, lt) });

  // the spoon vanishes once it falls inside the black panel
  if (lt > drop) {
    const [, by] = w.toScreen(spoonWorld(sp, V3(0, 0, 0.34)));
    if (lt > panel0 + 0.15 && by > 1235) sp.root.visible = false;
  }
  // black comic panel that swallows the spoon, then the whole frame
  if (lt > panel0) {
    const pin = E.outBack(inv(panel0, panel0 + 0.2, lt));
    const fillK = E.inOutExpo(inv(fill0, fill0 + 0.55, lt));
    const r0 = [190, 1150, 700, 520];
    const r1 = [-60, -60, 1200, 2040];
    const r = r0.map((v, i) => lerp(v, r1[i], fillK));
    const cxp = r[0] + r[2] / 2;
    const cyp = r[1] + r[3] / 2;
    const ww = r[2] * lerp(0.6, 1, pin);
    const hh = r[3] * lerp(0.6, 1, pin);
    o.g.save();
    o.g.translate(o.j(800, 2), o.j(801, 2));
    o.panel(cxp - ww / 2, cyp - hh / 2, ww, hh, { fill: '#000000', border: 16, borderCol: CREAM });
    o.g.restore();
    o.word('PLUNK.', 540, 1100, { size: 92, p: inv(panel0 + 0.55, panel0 + 0.7, lt), out: inv(fill0 - 0.1, fill0, lt), rot: -5, fill: CREAM, shadowCol: MAG });
    if (lt > fill0 + 0.5) o.fill('#000000', 1);
  }
  if (lt > text0) {
    const collapse = E.inBack(inv(pix0, pix0 + 0.35, lt));
    const g = o.g;
    g.save();
    g.translate(540, 950);
    g.scale(1 - collapse, 1 - collapse);
    g.translate(-540, -950);
    o.word('SPACE IS', 540, 860, { size: 170, p: inv(text0, text0 + 0.25, lt), rot: -3 });
    o.word('RIDICULOUS.', 540, 1040, { size: 182, p: inv(text0 + 0.2, text0 + 0.5, lt), rot: 2, fill: YEL, shadowCol: MAG, stagger: 0.04 });
    g.restore();
    if (collapse > 0.85) {
      const fade = 1 - inv(9.8, 9.88, lt);
      if (fade > 0) {
        const pulse = 1 + 0.4 * Math.sin(inv(pix0 + 0.3, 9.8, lt) * Math.PI);
        o.dot(540, 950, 3 * pulse * fade, '#ffffff', 70 * pulse * fade);
      }
    }
  }
  if (lt < text0) o.scratches(0.9);
  else o.scratches(0.5 * (1 - inv(9.3, 9.6, lt)));
}
