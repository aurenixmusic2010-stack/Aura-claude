import * as THREE from 'three';
import { G } from './toon.js';
import { Post } from './post.js';
import { Overlay } from './overlay.js';
import { buildWorld } from './world.js';
import { SHOTS } from './shots.js';
import { boilSeed, FPS } from './util.js';

THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(location.search);
const scale = parseFloat(params.get('scale') || '1');
const W = Math.round(1080 * scale);
const H = Math.round(1920 * scale);

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor('#05040b', 1);
document.body.appendChild(renderer.domElement);

G.uRes.value.set(W, H);
G.uPx.value = scale;

const post = new Post(W, H);
const overlay = new Overlay(post.overCanvas, scale);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 2000);
const world = buildWorld(renderer, camera);
world.post = post;
world.overlay = overlay;
world.W = W;
world.H = H;

const v = new THREE.Vector3();
world.toScreen = (p) => {
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  v.copy(p).project(camera);
  return [(v.x * 0.5 + 0.5) * 1080, (-v.y * 0.5 + 0.5) * 1920, v.z];
};
world.worldPos = (obj, local = [0, 0, 0]) => {
  obj.updateWorldMatrix(true, false);
  return new THREE.Vector3(...local).applyMatrix4(obj.matrixWorld);
};

function renderFrame(f) {
  const t = f / FPS;
  G.uTime.value = t;
  G.uBoil.value = boilSeed(t);
  world.reset();
  world.views = null;
  camera.aspect = W / H;
  post.reset();
  post.u.uSeed.value = f % 997;
  overlay.begin(t);
  const shot = SHOTS.find((s) => t >= s.start && t < s.end) || SHOTS[SHOTS.length - 1];
  shot.update(t, t - shot.start, world);
  renderViews();
}

// Render the scene through one or more comic panels into the post target.
function renderViews() {
  const views = world.views;
  renderer.setRenderTarget(post.rt);
  renderer.setScissorTest(false);
  renderer.clear();
  if (!views || !views.length) {
    camera.aspect = W / H;
    world.finish();
    renderer.setViewport(0, 0, W, H);
    renderer.render(world.scene, camera);
  } else {
    renderer.setScissorTest(true);
    for (const v of views) {
      const [x, y, w, h] = v.rect;
      world.cam(v.pos, v.target, v.fov ?? 40, v.roll ?? 0);
      camera.aspect = w / h;
      world.finish();
      const px = Math.round(x * scale);
      const py = Math.round((1920 - y - h) * scale);
      const pw = Math.round(w * scale);
      const ph = Math.round(h * scale);
      renderer.setViewport(px, py, pw, ph);
      renderer.setScissor(px, py, pw, ph);
      G.uRes.value.set(pw, ph);
      renderer.render(world.scene, camera);
    }
    G.uRes.value.set(W, H);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
  }
  renderer.setRenderTarget(null);
  post.overTex.needsUpdate = true;
  renderer.render(post.scene, post.cam);
}

// project a world point into a panel view's rect (design px)
world.toScreenView = (p, view) => {
  const [x, y, w, h] = view.rect;
  world.cam(view.pos, view.target, view.fov ?? 40, view.roll ?? 0);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  v.copy(p).project(camera);
  camera.aspect = W / H;
  return [x + (v.x * 0.5 + 0.5) * w, y + (-v.y * 0.5 + 0.5) * h, v.z];
};

window.renderFrame = renderFrame;
window.saveFrame = async (f, name) => {
  renderFrame(f);
  const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/png'));
  const res = await fetch('/save/' + name, { method: 'POST', body: blob });
  return res.status;
};

Promise.all([
  document.fonts.load('150px Bangers'),
  document.fonts.load("50px 'Permanent Marker'"),
  document.fonts.load("700 40px 'Space Mono'"),
]).then(() => {
  world.makeLabels();
  window.READY = true;
});
