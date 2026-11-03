import * as THREE from 'three';
import { G } from './toon.js';
import { Sky, Stars, Dust } from './env.js';
import { Astronaut } from './astronaut.js';
import { Spoon } from './spoon.js';
import { NeutronStar, BigStar, Puffs, Streaks, shockRing } from './star.js';
import { buildProps } from './props.js';

export function buildWorld(renderer, camera) {
  const scene = new THREE.Scene();
  const w = { scene, camera, renderer };

  w.sky = new Sky(renderer);
  scene.add(w.sky.mesh);
  w.stars = new Stars(2600, 300, 11, 1);
  scene.add(w.stars.points);
  w.dust = new Dust(700, [60, 40, 80], 5);
  scene.add(w.dust.points);

  w.astro = new Astronaut();
  scene.add(w.astro.root);
  w.spoon = new Spoon();
  scene.add(w.spoon.root);
  w.ns = new NeutronStar(0.35);
  scene.add(w.ns.root);
  w.big = new BigStar();
  scene.add(w.big.root);
  w.puffs = new Puffs(320, 1);
  scene.add(w.puffs.mesh);
  w.streaks = new Streaks(220, 3, '#ffffff');
  scene.add(w.streaks.mesh);
  w.streaks2 = new Streaks(160, 9, '#7ff0ff');
  scene.add(w.streaks2.mesh);
  w.ring = shockRing('#ffffff');
  scene.add(w.ring);
  w.ring2 = shockRing('#ff2e7e');
  scene.add(w.ring2);

  Object.assign(w, buildProps(scene));

  const toggles = [
    w.astro.root,
    w.spoon.root,
    w.ns.root,
    w.big.root,
    w.puffs.mesh,
    w.streaks.mesh,
    w.streaks2.mesh,
    w.ring,
    w.ring2,
    w.dust.points,
    ...w.propRoots,
  ];
  const lightDefault = new THREE.Vector3(0.45, 0.65, 0.6).normalize();
  const rimDefault = new THREE.Vector3(-0.7, 0.25, -0.5).normalize();

  w.reset = () => {
    for (const o of toggles) o.visible = false;
    for (const o of [w.astro.root, w.spoon.root, w.ns.root, w.big.root]) {
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      o.quaternion.identity();
    }
    G.uLightDir.value.copy(lightDefault);
    G.uRimDir.value.copy(rimDefault);
    G.uRimColor.value.set('#2ee6ff');
    G.uKeyColor.value.set('#ffffff');
    G.uShadeTint.value.set('#ffffff');
    w.sky.setPalette('space');
    w.sky.mat.uniforms.uAmt.value = 1;
    w.sky.mat.uniforms.uFlash.value = 0;
    w.sky.mesh.visible = true;
    w.stars.points.visible = true;
    w.stars.mat.uniforms.uOpacity.value = 1;
    w.dust.mat.uniforms.uOpacity.value = 1;
    w.dust.mat.uniforms.uSize.value = 1;
    w.ns.setBeams(0);
    w.ns.magnetic.rotation.z = 0.5;
    w.ns.fieldMat.opacity = 0.5;
    w.ns.spinAxis.rotation.set(0, 0, 0);
    w.big.mat.uniforms.uHeat.value = 0;
    w.big.mat.uniforms.uCollapse.value = 0;
    w.puffs.mat.uniforms.uOpacity.value = 1;
    w.puffs.mesh.position.set(0, 0, 0);
    w.streaks.mesh.position.set(0, 0, 0);
    w.streaks2.mesh.position.set(0, 0, 0);
    w.views = null;
    w.ns.mat.uniforms.uFlash.value = 0;
    w.ns.root.scale.setScalar(1);
    w.spoon.chromeMat.uniforms.uGlow.value = 0;
    camera.fov = 40;
    camera.up.set(0, 1, 0);
    renderer.setClearColor('#05040b', 1);
    w.resetProps();
  };

  w.finish = () => {
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    w.sky.mesh.position.copy(camera.position);
    w.stars.points.position.copy(camera.position);
  };

  // camera helper: position, target, fov, roll (radians)
  w.cam = (pos, target, fov = 40, roll = 0) => {
    camera.position.set(...pos);
    camera.fov = fov;
    camera.up.set(0, 1, 0);
    camera.lookAt(...target);
    if (roll) camera.rotateZ(roll);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  return w;
}
