// Shared helpers for shot choreography.
import * as THREE from 'three';
import { K, E, clamp, lerp, inv, onTwos, shake, wobble, springTo, hash, noise1 } from './util.js';
import { Astronaut } from './astronaut.js';
import { Spoon } from './spoon.js';
import { INK, CREAM, YEL, MAG, CYAN } from './overlay.js';
import { G } from './toon.js';

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const P = () => Astronaut.defaultPose();
export const SS = () => Spoon.defaultState();

export function qLook(dir, up = [0, 1, 0]) {
  const m = new THREE.Matrix4().lookAt(V3(...dir).normalize(), V3(0, 0, 0), V3(...up));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
export function spoonWorld(spoon, local) {
  spoon.root.updateMatrixWorld(true);
  return local.clone().applyMatrix4(spoon.inner.matrixWorld);
}
export function handlePt(spoon, u) {
  return spoon.handleCurve.getPointAt(u).clone().add(V3(0, 0.03, 0));
}
// place the spoon so that a local point lands on a world position
export function placeSpoonBy(spoon, local, worldPos, quat, scale = 1) {
  spoon.root.quaternion.copy(quat);
  spoon.root.scale.setScalar(scale);
  spoon.root.position.set(0, 0, 0);
  spoon.root.updateMatrixWorld(true);
  const p = local.clone().applyMatrix4(spoon.inner.matrixWorld);
  spoon.root.position.copy(worldPos).sub(p);
}
// impact frame: alternating inverted / normal two-tone frames from t0
export function impact(post, t, t0, pattern = 'IIN') {
  const f = Math.round((t - t0) * 30);
  if (f < 0 || f >= pattern.length) return false;
  post.u.uImpact.value = 1;
  post.u.uInvert.value = pattern[f] === 'I' ? 1 : 0;
  return true;
}
export function addShake(pos, target, s) {
  return [
    [pos[0] + s[0], pos[1] + s[1], pos[2]],
    [target[0] + s[0] * 0.5, target[1] + s[1] * 0.5, target[2]],
  ];
}
export const walkCycle = (t, rate = 2) => Math.sin(t * Math.PI * 2 * rate);

export const FLOOR_Y = -0.85;
export { THREE, K, E, clamp, lerp, inv, onTwos, shake, wobble, springTo, hash, noise1, INK, CREAM, YEL, MAG, CYAN, G };
