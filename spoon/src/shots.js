// THE SPOON THAT COULD BREAK EARTH — shot choreography. Each shot is a pure
// function of time. Character poses run "on twos" (15 fps); cameras run at 30.
import {
  V3, P, SS, qLook, spoonWorld, handlePt, placeSpoonBy, impact, addShake, walkCycle, FLOOR_Y,
  K, E, clamp, lerp, inv, onTwos, shake, wobble, springTo, INK, CREAM, YEL, MAG, CYAN, G,
} from './shotkit.js';
import { shot3, shot4, shot5, shot6 } from './shots2.js';

// ---------------------------------------------------------------------------------
// SHOT 01 — THE HOOK (0:00–0:03)
// ---------------------------------------------------------------------------------
function shot1(t, lt, w) {
  const { astro: a, spoon: s, ns, overlay: o, post } = w;
  const lc = onTwos(t);

  // space fades up from pure black once the pixel has become a spoon
  const reveal = K(lt, [[0.3, 0], [1.0, 1, 'out']]);
  w.sky.mat.uniforms.uAmt.value = reveal * 0.95;
  w.stars.mat.uniforms.uOpacity.value = reveal;
  w.dust.points.visible = true;
  w.dust.mat.uniforms.uOpacity.value = reveal;

  // --- spoon: pops out of the pixel spinning, settles bowl-to-camera, then stands
  // upright like a monument while the star flares behind it
  const N0 = V3(0.25, 0.35, 0);
  const pop = K(lt, [[0.34, 0.0], [0.64, 1, 'outBackBig']]);
  const roll = (1 - E.out3(inv(0.34, 1.0, lt))) * 7.5 + Math.sin(lt * 1.6) * 0.08;
  const rise = E.inOut3(inv(1.3, 1.9, lt));
  const dir = V3(lerp(0.5, 0.12, rise), lerp(0.85, 1, rise), lerp(0.15, 0.04, rise)).normalize();
  const upHint = [Math.sin(roll) + 0.2 * rise, -0.1 * rise, Math.cos(roll)];
  const q = qLook([dir.x, dir.y, dir.z], upHint);
  s.root.visible = lt > 0.34;
  const drop = E.in(inv(2.55, 3.0, lt));
  const spoonPos = N0.clone().add(V3(0, -14 * drop + Math.sin(lt * 2.1) * 0.03, 0));
  s.root.position.copy(spoonPos);
  s.root.quaternion.copy(q);
  s.root.scale.setScalar(Math.max(pop, 0.001) * (1 + 0.32 * rise));
  const st = SS();
  st.time = t;
  st.glow = 1 + K(lt, [[1.4, 0], [1.9, 0.9], [2.4, 0.4]]);
  st.heat = K(lt, [[0.34, 1], [0.6, 0]]);
  s.apply(st);
  s.chromeMat.uniforms.uGlow.value = K(lt, [[0.34, 1], [0.7, 0]]);

  // --- astronaut drifts in, casually grabs the handle
  a.root.visible = lt > 0.55;
  const enter = E.out3(inv(0.6, 1.12, lc));
  const rootPos = V3(lerp(-3.9, -1.05, enter), lerp(-0.1, -0.82, enter) + Math.sin(lt * 1.7) * 0.03, lerp(-0.9, -0.5, enter));
  const yank = E.in3(inv(2.62, 3.0, lt));
  rootPos.y -= yank * 12;
  a.root.position.copy(rootPos);
  a.root.rotation.set(0, 0.62, lerp(0.12, 0, enter));
  const p = P();
  p.time = t;
  const realize = inv(1.3, 1.55, lc);
  const shock = inv(1.88, 1.95, lc);
  p.eyeOpen = lerp(0.55, 1, realize);
  p.mouthOpen = lerp(0.2, 0.0, realize);
  p.mouthW = lerp(0.42, 1, realize);
  p.mouthCurve = lerp(0.2, -0.4, realize);
  p.lookX = lerp(0.25, 0.75, inv(0.9, 1.1, lc));
  p.lookY = lerp(0.0, 0.35, realize);
  p.eyeScale = 1 + 0.18 * realize + 0.28 * shock;
  p.pupil = lerp(1, 0.55, realize) - 0.12 * shock;
  p.browY = 0.55 * realize + 0.4 * shock;
  p.browAngle = 0.35 * realize;
  if (shock > 0) {
    p.mouthOpen = 0.35 + 0.55 * shock;
    p.mouthW = 1.1;
  }
  p.sweat = shock;
  p.blush = lerp(0.6, 0.15, realize);
  p.headTilt = lerp(0.15, -0.05, realize) + Math.sin(lc * 3) * 0.04 * (1 - realize);
  p.headNod = lerp(0.05, -0.12, realize);
  const kick = Math.sin(lc * 5.5);
  p.footL = [-0.22, -0.68 + kick * 0.05, 0.05 + kick * 0.06];
  p.footR = [0.2, -0.7 - kick * 0.05, 0.02 - kick * 0.06];
  p.handL = [-0.6, lerp(0.05, 0.3, shock), 0.2];
  p.armBendL = 0.4;
  p.squash = 1 + wobble(lt - 1.9, 3.2, 5, 0.12);
  p.antennaSwing = [wobble(lt - 1.9, 2.4, 3, 0.8) + Math.sin(lt * 2) * 0.1, wobble(lt - 1.12, 2, 3, 0.4)];
  // flailing during the yank
  if (yank > 0) {
    p.handL = [-0.7, 0.75 + Math.sin(t * 40) * 0.1, 0.3];
    p.footL = [-0.3, -0.5 + Math.sin(t * 30) * 0.15, 0.2];
    p.footR = [0.3, -0.45 - Math.sin(t * 30) * 0.15, -0.1];
    p.mouthOpen = 1;
  }
  // right hand: reach from rest to handle grip
  const grip = spoonWorld(s, handlePt(s, 0.86));
  const reach = E.inOut(inv(0.86, 1.12, lc));
  a.root.updateMatrixWorld(true);
  const rest = V3(0.62, -0.02, 0.22).applyMatrix4(a.body.matrixWorld);
  const hand = rest.clone().lerp(grip, reach);
  p.armBendR = lerp(0.3, 0.05, reach);
  p.fistR = reach;
  a.applyWorld(p, { handR: hand });

  // --- the neutron star flares on behind him
  ns.root.visible = lt > 1.42;
  ns.root.position.set(-3.4, 7.2, -5.6);
  const flare = K(lt, [[1.42, 0], [1.72, 1, 'outBackBig']]);
  ns.root.scale.setScalar(2.4 * Math.max(flare, 0.001));
  ns.update(t, t * 3, 1 + K(lt, [[1.85, 0], [1.95, 0.6], [2.4, 0]]));
  ns.mat.uniforms.uFlash.value = K(lt, [[1.42, 1], [1.7, 0]]);
  if (lt > 1.42) {
    G.uRimDir.value.copy(V3(-3.4, 7.2, -5.6).sub(rootPos).normalize());
    G.uRimColor.value.set('#bff6ff');
  }

  // --- camera
  const cPos = K(lt, [
    [0, [0.3, 0.72, 2.5]],
    [0.72, [0.36, 0.7, 2.75], 'inOut'],
    [1.3, [-0.45, 0.2, 6.6], 'inOut'],
    [1.9, [0.62, -1.15, 1.55], 'in3'],
    [2.55, [0.6, -1.1, 1.42], 'out'],
  ]);
  const cTgt = K(lt, [
    [0, [0.38, 0.68, 0]],
    [0.72, [0.38, 0.66, 0], 'inOut'],
    [1.3, [-0.45, 0.05, 0], 'inOut'],
    [1.9, [-0.35, 1.0, -0.7], 'in3'],
    [2.55, [-0.35, 1.05, -0.7]],
    [3.0, [-0.2, -5.0, -0.5], 'in'],
  ]);
  const fov = K(lt, [[0, 36], [1.3, 40], [1.9, 64, 'in3'], [2.55, 61], [3.0, 70, 'in']]);
  const sh = shake(t, 1.9, 0.09, 5, 24);
  const sh2 = shake(t, 0.36, 0.03, 8, 30, 3);
  const [cp, ctg] = addShake(cPos, cTgt, [sh[0] + sh2[0], sh[1] + sh2[1]]);
  w.cam(cp, ctg, fov, wobble(lt - 1.9, 2, 4, 0.05) - 0.06 * rise);

  // --- post
  post.u.uGlitch.value = K(lt, [[0.31, 0], [0.34, 1], [0.48, 0.15], [0.55, 0], [2.85, 0], [3.0, 0.7, 'in']]);
  post.u.uSplit.value = 1.5 + K(lt, [[0.33, 0], [0.36, 9], [0.7, 0]]) + K(lt, [[1.42, 0], [1.46, 6], [1.8, 0]]) + K(lt, [[1.88, 0], [1.9, 12], [2.5, 1]]);
  post.u.uFlash.value = K(lt, [[1.42, 0], [1.46, 0.55], [1.75, 0]]);
  post.u.uZoomBlur.value = K(lt, [[1.45, 0], [1.75, 0.6], [1.9, 0.9], [1.98, 0]]) + K(lt, [[2.6, 0], [3.0, 0.9, 'in']]);
  if (impact(post, t, 1.9, 'IIN')) {
    w.sky.mat.uniforms.uAmt.value = 0;
    w.stars.mat.uniforms.uOpacity.value = 0;
    w.dust.points.visible = false;
    post.u.uThresh.value = 0.3;
  }

  // --- overlay
  if (lt < 0.31) {
    if (lt > 0.08) {
      const k = inv(0.08, 0.3, lt);
      o.dot(540, 960, 2 + 3 * E.in(k), '#ffffff', 20 + 90 * E.in(k));
    }
  }
  const [sx, sy] = w.toScreen(spoonWorld(s, V3(0, 0, 0.34)));
  o.focusLines(sx, sy, K(lt, [[0.34, 0], [0.38, 0.8], [0.62, 0]]), { inner: 300, color: CREAM, count: 70 });
  o.focusLines(sx, sy, K(lt, [[1.86, 0], [1.9, 1], [2.45, 0.25]]), { inner: 380, color: CREAM, count: 110, width: 1.4 });
  o.speedLines(Math.PI / 2, K(lt, [[2.62, 0], [2.8, 1], [3.0, 1]]), { count: 50, alpha: 0.9 });
  const out = inv(2.6, 2.8, lt);
  const tsh = shake(t, 1.9, 14, 6, 30, 9);
  o.title('This Spoon', 540 + tsh[0], 270 + tsh[1], { rgb: true, size: 205, p: inv(0.55, 0.88, lt), out, rot: -4, fill: CREAM, shadowCol: MAG });
  o.title('Billion-Ton', 540 + tsh[1], 450 + tsh[0], { rgb: true, size: 178, p: inv(1.9, 2.12, lt), out, rot: 3, fill: YEL, shadowCol: MAG, stagger: 0.035 });
  o.title('Density', 540 - tsh[0], 610 + tsh[1], { rgb: true, size: 240, p: inv(1.97, 2.2, lt), out, rot: -2, fill: CREAM, fill2: YEL, shadowCol: CYAN, stagger: 0.05 });
  o.scratches(reveal * 0.9);
}

// ---------------------------------------------------------------------------------
// SHOT 02 — THE IMPOSSIBLE SPOON (0:03–0:10)
// Vertical staging for 9:16: he deadlifts, sinks, rockets up on taffy arms, snaps.
// ---------------------------------------------------------------------------------
function shot2(t, lt, w) {
  const { astro: a, spoon: s, overlay: o, post } = w;
  const lc = onTwos(t) - 3;
  w.floor.visible = true;
  w.dust.points.visible = true;
  w.sky.setPalette('deep');
  w.sky.mat.uniforms.uAmt.value = 0.85;
  const fm = w.floorMat.uniforms;

  // --- spoon slams down into a gravity well in the floor
  const sScale = 1.25;
  const zdir = V3(1.0, 0, 0.9).normalize();
  const sq = qLook([zdir.x, 0, zdir.z]);
  const B = V3(0.55, 0, 1.0); // bowl centre (xz)
  const land = 0.1;
  const fall = E.in(inv(-0.12, land, lt));
  const dent = lt < land ? 0 : 0.48 * springTo(lt - land, 2.4, 5);
  fm.uDent.value.set(B.x, B.z, dent, 1.3);
  const restY = FLOOR_Y - dent * 0.9 + 0.12 * sScale;
  s.root.visible = true;
  placeSpoonBy(s, V3(0, 0, 0.34), V3(B.x, lerp(7, restY, fall), B.z), sq, sScale);
  const st = SS();
  st.time = t;
  st.squash = 1 + wobble(lt - land, 4, 6, -0.25);
  st.face = K(lc, [[5.42, 0], [5.62, 1, 'outBackBig']]);
  st.lookX = 0.1;
  st.lookY = 0.85;
  st.eyeOpen = K(lc, [[6.2, 1], [6.26, 0.08], [6.34, 1], [6.6, 1], [6.8, 1.3]]);
  st.browAngle = K(lc, [[5.62, 0.2], [6.4, 0.2], [6.55, -0.45]]);
  s.apply(st);
  fm.uRip.value[0].set(B.x, B.z, 3 + land, 0.26);

  // --- astronaut
  a.root.visible = true;
  const p = P();
  p.time = t;
  const gripL = spoonWorld(s, handlePt(s, 0.8));
  const gripR = spoonWorld(s, handlePt(s, 0.95));
  const A = V3(-0.95, 0, -0.55);
  a.root.rotation.set(0, 0.5, 0);

  const landA = 0.2;
  const stand = E.outBack(inv(0.48, 0.78, lc));
  const crouch = E.inOut(inv(1.05, 1.38, lc));
  const h1 = E.inOut(inv(1.45, 1.9, lc)) - 0.4 * E.inOut(inv(1.95, 2.15, lc));
  const h2 = E.inOut(inv(2.2, 2.75, lc)) - 0.3 * E.inOut(inv(2.85, 3.05, lc));
  const h3 = E.out3(inv(3.1, 3.6, lc));
  const snapT = 4.15;
  const snapped = lc >= snapT;
  const up = E.out(inv(snapT, 4.38, lc)); // rockets up
  const down = E.in(inv(4.42, 4.66, lc)); // falls back
  const sitUp = E.out3(inv(4.85, 5.1, lc));

  let ry = 0;
  let rx = A.x;
  let rz = A.z;
  const sink = 0.13 * clamp(h1 * 1.6) + 0.27 * clamp(h2 * 1.4);
  if (lc < 0.48) {
    ry = lerp(5, -0.42, E.in(inv(0.02, landA, lc))) + (lc > landA ? wobble(lc - landA, 3, 6, 0.06) : 0);
    rx = A.x - 0.15;
  } else if (!snapped) {
    ry = lerp(-0.42, 0, stand) - 0.26 * crouch * (1 - clamp(h1 * 2)) - sink + 0.3 * h1 + 0.35 * h2;
    ry = ry + h3 * (3.0 + Math.sin(lc * 17) * 0.08 + sink);
  } else {
    // shoots up out of frame, falls back on his rump beside the spoon
    ry = lerp(3.3, 10, up);
    if (lc > 4.42) ry = lerp(9, -0.42, down);
    if (lc > 4.66) ry = -0.42 + wobble(lc - 4.66, 3, 6, 0.08);
    rx = A.x - 0.35;
    rz = A.z + 0.35;
  }
  a.root.position.set(rx, ry, rz);

  p.bodyLean = 0.32 * crouch * (1 - clamp(h1 * 2)) - 0.12 * h1 - 0.18 * h2;
  if (lc < 0.48 && lc > landA) p.squash = 1 + wobble(lc - landA, 3, 6, -0.3);
  if (snapped) {
    p.bodyLean = lc > 4.66 ? -0.25 + sitUp * 0.2 : 0;
    p.squash = lc > 4.66 ? 1 + wobble(lc - 4.66, 3, 6, -0.32) : lerp(1.25, 1, down);
    p.bodyTilt = lc < 4.66 ? Math.sin(lc * 20) * 0.3 : 0;
  }
  p.bodyTilt += h3 * Math.sin(lc * 23) * 0.05 * (snapped ? 0 : 1);

  // hands
  let targets = {};
  const holding = lc > 1.32 && !snapped;
  if (holding) {
    // a tiny vibration in the arms at full strain
    const vib = (h2 + h3) * 0.02;
    targets = { handL: gripL.clone().add(V3(Math.sin(t * 90) * vib, 0, 0)), handR: gripR.clone().add(V3(0, Math.sin(t * 80) * vib, 0)) };
    p.fistL = p.fistR = 1;
    p.armBendL = p.armBendR = lerp(0.12, 0.0, clamp(h2 + h3));
  } else if (!snapped) {
    p.handL = lc < 0.48 ? [-0.75, 0.3, 0.1] : [-0.6, 0.0, 0.3];
    p.handR = lc < 0.48 ? [0.75, 0.3, 0.1] : [0.6, 0.0, 0.3];
    if (lc > 0.85 && lc < 1.05) {
      // shoulder roll / hand rub before the lift
      const r = Math.sin((lc - 0.85) * 40) * 0.05;
      p.handL = [-0.18, 0.05 + r, 0.42];
      p.handR = [0.18, 0.05 - r, 0.42];
    }
    if (crouch > 0) {
      const pre = E.inOut(inv(1.05, 1.32, lc));
      a.root.updateMatrixWorld(true);
      targets = {
        handL: V3(-0.5, -0.05, 0.4).applyMatrix4(a.body.matrixWorld).lerp(gripL, pre),
        handR: V3(0.5, -0.05, 0.4).applyMatrix4(a.body.matrixWorld).lerp(gripR, pre),
      };
    }
  } else {
    const wl = wobble(lc - snapT, 3.5, 5, 0.4);
    p.handL = [-0.75 - wl, 0.55, 0.1];
    p.handR = [0.75 + wl, 0.55, 0.1];
    if (lc > 4.66) {
      p.handL = [-0.6, lerp(0.3, -0.35, sitUp), 0.25];
      p.handR = [0.6, lerp(0.3, -0.35, sitUp), 0.25];
    }
  }
  // legs
  const sitting = lc < 0.48 || lc > 4.66;
  if (sitting) {
    p.footL = [-0.24, -0.45, 0.6];
    p.footR = [0.24, -0.48, 0.55];
  } else if (snapped || h3 > 0.05) {
    const k = Math.sin(lc * 26);
    p.footL = [-0.25, -0.62 + k * 0.1, 0.05 + k * 0.1];
    p.footR = [0.25, -0.62 - k * 0.1, 0.05 - k * 0.1];
  } else {
    // feet stay planted in the world while the body rises/squats
    const bodyY = ry + sink;
    p.footL = [-0.24, -0.72 - bodyY, 0.08];
    p.footR = [0.24, -0.72 - bodyY, 0.08];
  }
  // face
  const strain = Math.max(h1 * 0.7, h2, h3) * (snapped ? 0 : 1);
  p.lookX = 0.35;
  p.lookY = -0.6;
  p.browAngle = -0.7 * Math.min(crouch + strain, 1);
  p.grit = strain > 0.35 ? 1 : 0;
  p.mouthW = 1.1;
  p.eyeOpen = lerp(1, 0.2, strain);
  p.eyeSquint = strain;
  p.blush = 0.6 + 1.1 * h2 + 0.4 * h3;
  p.sweat = Math.max(h2, h3) * (lc > 5.0 ? 0.6 : 1);
  p.headNod = 0.15 * crouch - 0.12 * strain;
  if (lc < 0.48) {
    p.eyeOpen = 0.2;
    p.mouthOpen = 0.35;
    p.headTilt = 0.25;
    p.dizzy = lc > landA ? 0.5 : 0;
  } else if (lc < 1.05) {
    p.lookX = 0.55;
    p.lookY = -0.65;
    p.mouthCurve = 0.5;
    p.browAngle = -0.25;
  }
  if (snapped) {
    p.mouthOpen = lc < 4.66 ? 1 : lerp(0.6, 0, sitUp);
    p.eyeScale = lc < 4.66 ? 1.3 : 1;
    p.pupil = lc < 4.66 ? 0.5 : 1;
    p.eyeOpen = lc < 4.66 ? 1 : lerp(0.15, 0.45, sitUp);
    p.lookY = 0;
    p.dizzy = lc > 4.66 ? 0.6 * (1 - sitUp) : 0;
  }
  // side-eye beat
  const side = inv(5.1, 5.35, lc);
  if (side > 0) {
    p.lookX = lerp(0.2, 0.55, side);
    p.lookY = lerp(0, -0.85, side);
    p.eyeOpen = 0.4;
    p.mouthCurve = -0.2;
    p.mouthW = 0.65;
    p.mouthOpen = 0;
    p.browAngle = 0.1;
    p.browY = -0.25;
    p.headNod = 0.12 * side;
    p.dizzy = 0;
  }
  if (lc > 6.0 && lc < 6.12) p.eyeOpen = 0.05;
  if (lc > 6.62) {
    p.eyeScale = 1.22;
    p.eyeOpen = 1;
    p.pupil = 0.6;
    p.browY = 0.5;
  }
  p.antennaSwing = [wobble(lc - landA, 2.5, 3, 0.9) + wobble(lc - 4.66, 3, 3, 1.0) + h3 * Math.sin(lc * 20) * 0.3, wobble(lc - snapT, 3, 4, 0.8)];
  a.applyWorld(p, targets);
  // ripples: landing, sinking steps, the pop, the crash
  fm.uRip.value[1].set(A.x - 0.15, A.z, 3 + landA, 0.16);
  fm.uRip.value[2].set(A.x, A.z, 3 + 1.6, lc > 1.6 ? 0.07 : 0);
  fm.uRip.value[3].set(A.x, A.z, 3 + 3.1, lc > 3.1 ? 0.14 : 0);
  if (lc > 4.66) fm.uRip.value[2].set(A.x - 0.35, A.z + 0.35, 3 + 4.66, 0.16);
  fm.uLabelRect.value.set(1.75, -2.2, 3.3, 1.1);

  // --- camera
  const orbit = E.inOut(inv(1.4, 4.1, lt));
  const th = lerp(0.24, -0.72, orbit);
  const C = V3(-0.25, 0.25, 0.25);
  const R = K(lt, [[1.4, 6.4], [3.1, 6.9], [3.8, 9.2]]);
  const hgt = K(lt, [[1.4, 1.15], [3.1, 1.3], [3.8, 1.9]]);
  const lift = K(lt, [[3.1, 0], [3.55, 2.35, 'out'], [4.15, 2.35], [4.3, 3.0, 'out'], [4.5, 0.2, 'inOut'], [4.7, -0.15]]);
  let cPos = [C.x + Math.sin(th) * R, C.y + hgt, C.z + Math.cos(th) * R];
  let cTgt = [C.x, C.y + lift - 0.05, C.z];
  let fov = K(lt, [[3.1, 40], [3.7, 50], [4.6, 50], [5.0, 40]]);
  if (lt < 1.4) {
    cPos = K(lt, [[0, [1.5, 1.4, 7.0]], [1.4, cPos]]);
    cTgt = K(lt, [[0, [-0.1, 0.05, 0.3]], [1.4, cTgt]]);
  }
  if (lt > 4.55) {
    const k = E.inOut(inv(4.55, 5.0, lt));
    cPos = cPos.map((v, i) => lerp(v, [1.6, 0.8, 6.6][i], k));
    cTgt = cTgt.map((v, i) => lerp(v, [-0.4, -0.15, 0.3][i], k));
  }
  const sh = shake(t, 3.1, 0.1, 6, 22);
  const sh2 = shake(t, 3.0 + landA, 0.07, 7, 22, 4);
  const sh3 = shake(t, 3.0 + 4.66, 0.1, 7, 24, 6);
  const sh4 = shake(t, 3.0 + land, 0.12, 7, 24, 8);
  [cPos, cTgt] = addShake(cPos, cTgt, [sh[0] + sh2[0] + sh3[0] + sh4[0], sh[1] + sh2[1] + sh3[1] + sh4[1]]);
  w.cam(cPos, cTgt, fov);

  // --- split panels: he looks; the spoon looks back; awkward pause; dive
  const split = lt > 5.18;
  if (split) {
    const headW = a.helmetWorld([0, -0.05, 0]);
    const bowlW = spoonWorld(s, V3(0, 0.1, 0.34));
    const slideA = E.out3(inv(5.18, 5.36, lt));
    const slideB = E.out3(inv(5.26, 5.44, lt));
    const grow = E.inOut3(inv(6.55, 6.86, lt));
    const topRect = [lerp(-1080, 0, slideA), 0, 1080, 945];
    const botRect = [lerp(1080, 0, slideB) * (1 - grow), lerp(975, 0, grow), 1080, lerp(945, 1920, grow)];
    // he is seen from the front, a little below eye line
    a.root.updateMatrixWorld(true);
    const fwd = V3(0, 0, 1).applyQuaternion(a.root.quaternion);
    const right = V3(1, 0, 0).applyQuaternion(a.root.quaternion);
    const cp = headW.clone().add(fwd.clone().multiplyScalar(2.3)).add(right.clone().multiplyScalar(0.55)).add(V3(0, -0.15, 0));
    const topView = { rect: topRect, pos: cp.toArray(), target: headW.clone().add(V3(0, -0.1, 0)).toArray(), fov: 38 };
    // the spoon is seen from its handle side, above: face-up = screen-up
    const zW = V3(0, 0, 1).applyQuaternion(s.root.quaternion);
    const push = E.in3(inv(6.5, 7.0, lt));
    const sp0 = bowlW.clone().sub(zW.clone().multiplyScalar(0.55)).add(V3(0, 1.25, 0));
    const sp1 = bowlW.clone().add(V3(0, 0.12, 0)).sub(zW.clone().multiplyScalar(0.03));
    const botView = { rect: botRect, pos: sp0.lerp(sp1, push).toArray(), target: bowlW.clone().add(zW.clone().multiplyScalar(0.02 * (1 - push))).toArray(), fov: lerp(36, 62, push) };
    w.views = grow >= 1 ? [botView] : [botView, topView];
    if (grow < 1) {
      o.g.save();
      o.fill(CREAM, 1);
      o.g.clearRect(topRect[0], topRect[1], topRect[2], topRect[3]);
      o.g.clearRect(botRect[0], botRect[1], botRect[2], botRect[3]);
      for (const r of [topRect, botRect]) {
        o.g.lineWidth = 9;
        o.g.strokeStyle = INK;
        o.wobblyRect(r[0] + 5, r[1] + 5, r[2] - 10, r[3] - 10, 1.5);
      }
      o.g.restore();
    }
    const dots = inv(5.95, 6.45, lt);
    if (dots > 0 && grow < 0.3) {
      const n = Math.min(3, 1 + Math.floor(dots * 2.999));
      o.word('.'.repeat(n), 540 - (3 - n) * 18, 945, { size: 150, p: 1, rot: 0, fill: INK, shadow: 0, stroke: 0.01, stagger: 0, noPop: true, jitter: 0.4 });
    }
    post.u.uFlash.value = K(lt, [[6.84, 0], [7.0, 1, 'in']]);
    post.u.uZoomBlur.value = K(lt, [[6.6, 0], [7.0, 0.8, 'in']]);
  }

  // --- post + overlay
  impact(post, t, 3.1, 'IN');
  impact(post, t, 7.15, 'N');
  post.u.uSplit.value = 1.5 + K(lt, [[0.08, 0], [0.1, 8], [0.5, 0]]) + K(lt, [[4.15, 0], [4.18, 7], [4.5, 0]]) + K(lt, [[4.64, 0], [4.67, 6], [5.0, 0]]);
  if (!split) {
    const [bx, by] = w.toScreen(spoonWorld(s, V3(0, 0, 0.34)));
    const kx = clamp(bx, 260, 820);
    const ky = clamp(by - 170, 300, 1500);
    o.burst(kx, ky, 140, { p: inv(0.1, 0.24, lt), out: inv(0.8, 1.0, lt), seed: 4, fill: YEL, rot: 0.1 });
    o.word('KLANG!', kx, ky, { size: 118, p: inv(0.12, 0.28, lt), out: inv(0.8, 1.0, lt), rot: -8, fill: MAG, shadowCol: INK, stagger: 0.04 });
    const lp = inv(0.95, 1.25, lt);
    const lo = inv(2.6, 2.85, lt);
    o.note(['One teaspoon', 'of neutron star'], 735, 760, { size: 66, p: lp, out: lo, rot: -4, color: YEL });
    o.arrow(800, 850, bx + 20, by - 70, { p: inv(1.1, 1.4, lt), out: lo, bend: -0.25, color: YEL });
    const [hx, hy] = w.toScreen(a.helmetWorld([0, 1.0, 0]));
    o.word('HNNNGH!', clamp(hx, 320, 760), clamp(hy - 30, 300, 900), { size: 140, p: inv(2.3, 2.5, lt), out: inv(3.0, 3.12, lt), rot: -6, fill: YEL, shadowCol: MAG, wave: true });
    o.word('HNNNNNGGGH!!', 540, 280, { size: 112, p: inv(3.25, 3.45, lt), out: inv(4.1, 4.18, lt), rot: 4, fill: CREAM, shadowCol: MAG, wave: true, stagger: 0.03 });
    const [px2, py2] = w.toScreen(V3(A.x, FLOOR_Y, A.z));
    o.word('POP!', clamp(px2 + 120, 200, 880), clamp(py2 - 40, 300, 1500), { size: 100, p: inv(3.1, 3.22, lt), out: inv(3.5, 3.62, lt), rot: 10, fill: CYAN, shadowCol: INK });
    o.burst(540, 700, 130, { p: inv(4.15, 4.24, lt), out: inv(4.5, 4.62, lt), seed: 9, fill: CREAM });
    o.word('SNAP!', 540, 700, { size: 130, p: inv(4.15, 4.26, lt), out: inv(4.5, 4.62, lt), rot: 6, fill: MAG, shadowCol: INK });
    o.speedLines(Math.PI / 2, K(lt, [[4.15, 0], [4.25, 0.9], [4.62, 0.9], [4.72, 0]]), { count: 45 });
    const [lx2, ly2] = w.toScreen(a.root.position.clone().add(V3(0, -0.5, 0)));
    o.word('THUD.', clamp(lx2, 220, 860), clamp(ly2 + 120, 300, 1500), { size: 96, p: inv(4.66, 4.78, lt), out: inv(5.05, 5.17, lt), rot: -5, fill: CREAM, shadowCol: MAG });
    if (lt > 1.6 && lt < 4.15) {
      const [gx, gy] = w.toScreen(gripR);
      o.g.save();
      o.g.strokeStyle = CREAM;
      o.g.lineWidth = 6;
      for (let k = 0; k < 3; k++) {
        const ang = -2.4 + k * 0.45 + o.j(k + 600, 0.1);
        o.g.beginPath();
        o.g.moveTo(gx + Math.cos(ang) * 80, gy + Math.sin(ang) * 80);
        o.g.lineTo(gx + Math.cos(ang) * 130, gy + Math.sin(ang) * 130);
        o.g.stroke();
      }
      o.g.restore();
    }
  }
  o.scratches(0.9);
}

export const SHOTS = [
  { start: 0, end: 3, update: shot1 },
  { start: 3, end: 10, update: shot2 },
  { start: 10, end: 20, update: shot3 },
  { start: 20, end: 32, update: shot4 },
  { start: 32, end: 42, update: shot5 },
  { start: 42, end: 59.01, update: shot6 },
];
