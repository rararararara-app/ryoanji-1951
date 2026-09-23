import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { M } from './materials.js';
import { root, addMesh } from './geometry.js';

// The priest (BRIEF §4). Body centre (0.43, 0, −2.28) and top of back 0.44 m are measured.
// He faces 50° from +x toward +z, toward the open facade, back to the rear of the room (measured by calculation).
// Posture: seiza, folded fully forward, shaved head down between wide sleeves spread forward on the tatami.
// The kimono is one soft mass: a smooth union of ellipsoids, polygonised once with marching cubes.
// Local frame: +x forward (the facing direction), y up, +z to his left.

const CENTRE = new THREE.Vector3(0.43, 0, -2.28);
const FACING_DEG = 50;
const TOP_OF_BACK = 0.44;

// [centre x, y, z, radii x, y, z, yaw about y (rad)] — the form, estimated inside the measured envelope
const PARTS = [
  [-0.20, 0.16, 0.00, 0.17, 0.15, 0.19, 0],      // seat on the heels
  [-0.05, 0.07, 0.00, 0.27, 0.075, 0.21, 0],     // folded legs, knees forward
  [-0.02, 0.31, 0.00, 0.21, 0.14, 0.17, 0],      // back, arched to a tent-like peak
  [0.14, 0.23, 0.00, 0.11, 0.11, 0.19, 0],       // shoulders, rolling forward and down
  ...[1, -1].flatMap((s) => [
    [0.22, 0.15, s * 0.15, 0.11, 0.09, 0.09, 0],          // upper arm inside the sleeve
    [0.30, 0.075, s * 0.17, 0.15, 0.075, 0.11, s * 0.2],  // wide sleeve falling forward onto the tatami, merged into the mass
  ]),
];

function sdEllipsoid(px, py, pz, [cx, cy, cz, rx, ry, rz, yaw]) {
  let x = px - cx, y = py - cy, z = pz - cz;
  if (yaw) { const c = Math.cos(yaw), s = Math.sin(yaw), xr = c * x - s * z; z = s * x + c * z; x = xr; }
  const k = Math.hypot(x / rx, y / ry, z / rz);
  return (k - 1) * Math.min(rx, ry, rz);
}
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

function field(x, y, z) {
  let d = 1e3;
  for (const p of PARTS) d = smin(d, sdEllipsoid(x, y, z, p), 0.07);
  return Math.max(d, -y);                                             // rests on the tatami
}

function kimonoGeometry() {
  const RES = 72, H = 0.5, OFF = new THREE.Vector3(0.08, 0.2, 0);    // cube half-size (m) and centre, local
  const mc = new MarchingCubes(RES, new THREE.MeshBasicMaterial(), false, false, 120000);
  mc.reset();
  const size = mc.size, half = mc.halfsize;
  for (let zi = 0; zi < size; zi++) for (let yi = 0; yi < size; yi++) for (let xi = 0; xi < size; xi++) {
    const x = ((xi - half) / half) * H + OFF.x, y = ((yi - half) / half) * H + OFF.y, z = ((zi - half) / half) * H + OFF.z;
    mc.field[xi + yi * size + zi * size * size] = mc.isolation - field(x, y, z) * 900;
  }
  mc.update();
  const n = mc.count, src = mc.geometry;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const sp = src.getAttribute('position').array, sn = src.getAttribute('normal').array;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = sp[i * 3] * H + OFF.x; pos[i * 3 + 1] = sp[i * 3 + 1] * H + OFF.y; pos[i * 3 + 2] = sp[i * 3 + 2] * H + OFF.z;
    nor[i * 3] = sn[i * 3]; nor[i * 3 + 1] = sn[i * 3 + 1]; nor[i * 3 + 2] = sn[i * 3 + 2];
  }
  src.dispose();
  // cloth folds: occlusion sampled from the same field along each normal (SDF ambient occlusion), as vertex colour.
  // Creases between the sleeves, under the fold and at the tatami darken; open surfaces stay light.
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2], nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
    let occ = 0, w = 1;
    for (const t of [0.02, 0.05, 0.09, 0.14]) { occ += w * Math.max(0, t - field(px + nx * t, py + ny * t, pz + nz * t)) / t; w *= 0.6; }
    const ao = THREE.MathUtils.clamp(1 - 0.55 * occ, 0.35, 1) * (0.75 + 0.25 * THREE.MathUtils.smoothstep(py, 0, 0.12));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  // trim his right side (local −z, the image's right), which ran past the photo's outline
  for (let i = 2; i < pos.length; i += 3) if (pos[i] < 0) pos[i] *= 0.86;
  // scale height so the top of the back is exactly the measured 0.44 m
  let top = 0; for (let i = 1; i < pos.length; i += 3) top = Math.max(top, pos[i]);
  for (let i = 1; i < pos.length; i += 3) pos[i] = Math.max(0, pos[i]) * (TOP_OF_BACK / top);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

export function buildPriest() {
  const g = new THREE.Group();
  g.position.copy(CENTRE);
  g.rotation.y = -THREE.MathUtils.degToRad(FACING_DEG);   // local +x → (cos 50°, 0, sin 50°)
  root.add(g);

  const robe = M.robe.clone();
  robe.vertexColors = true;
  robe.onBeforeCompile = M.robe.onBeforeCompile; robe.customProgramCacheKey = M.robe.customProgramCacheKey;
  addMesh(new THREE.Mesh(kimonoGeometry(), robe), false, undefined, g);

  // shaved head, bowed so the crown faces forward (toward the facade and the camera), between the sleeves
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.088, 28, 18), M.scalp);
  head.scale.set(1.12, 0.92, 0.88);                      // long axis = neck → crown
  head.position.set(0.27, 0.155, 0.01);                   // low, between the sleeves
  head.rotation.z = -0.55;                               // crown tipped forward and down
  addMesh(head, false, undefined, g);

  g.userData.hover = 'priest';
  return g;
}
