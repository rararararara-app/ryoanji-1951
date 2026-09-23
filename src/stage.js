import * as THREE from 'three';
import { GROUND, KEN, ROOM_X, ROOM_Z } from './config.js';
import { M } from './materials.js';
import { root, addMesh, uvMetres } from './geometry.js';
import { paintedTextures } from './textures.js';
import { withAtmos } from './atmosphere.js';

// The stage: a diorama cut at the edge of knowledge. One ground slab, its top at GROUND (−0.55, an estimate),
// with a 0.6 m cut edge showing a soil section. Outside the slab is void (the sky paints it in the fog colour).
export const SLAB = { x0: -9, x1: 13, z0: -11, z1: 5.5, depth: 0.6 };
export const inSlab = (x, z, margin = 0) => x > SLAB.x0 + margin && x < SLAB.x1 - margin && z > SLAB.z0 + margin && z < SLAB.z1 - margin;

// The measured floor extent, drawn on the slab surface: the footprint of known space.
export const MEASURED_FLOOR = { x0: 0, x1: 5.91, z0: -4.68, z1: 1.35 };

function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

function slab() {
  const { x0, x1, z0, z1, depth } = SLAB, w = x1 - x0, d = z1 - z0;
  const geo = uvMetres(new THREE.BoxGeometry(w, depth, d), w, depth, d);
  // faces: +x, −x, +y (earth), −y, +z, −z; the four sides carry the soil section
  const mats = [M.soil, M.soil, M.earth, M.soil, M.soil, M.soil];
  const m = new THREE.Mesh(geo, mats);
  m.position.set((x0 + x1) / 2, GROUND - depth / 2, (z0 + z1) / 2);
  addMesh(m, true, { edges: false });
  m.castShadow = false;
  m.userData.baseMaterial = mats;
  return m;
}

function footprintLine() {
  const { x0, x1, z0, z1 } = MEASURED_FLOOR, t = 0.025, y = GROUND + 0.006;
  const mat = new THREE.MeshBasicMaterial({ color: '#f0c68a', transparent: true, opacity: 0.9, depthWrite: false });
  const g = new THREE.Group();
  const strip = (cx, cz, sx, sz) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
    s.rotation.x = -Math.PI / 2; s.position.set(cx, y, cz); s.raycast = () => {};
    g.add(s);
  };
  strip((x0 + x1) / 2, z0, x1 - x0 + t, t); strip((x0 + x1) / 2, z1, x1 - x0 + t, t);
  strip(x0, (z0 + z1) / 2, t, z1 - z0 + t); strip(x1, (z0 + z1) / 2, t, z1 - z0 + t);
  g.renderOrder = 2;
  root.add(g);          // an annotation, not geometry: neither measured nor estimated
  return g;
}

function stones(rand) {
  // scattered small stones along the veranda base, and a few under it (ESTIMATE)
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const inst = new THREE.InstancedMesh(geo, M.stone, 220);
  const d = new THREE.Object3D(), c = new THREE.Color();
  let n = 0;
  const put = (x, z, r) => {
    d.position.set(x, GROUND + r * 0.3, z);
    d.rotation.set(rand() * 6.28, rand() * 6.28, rand() * 6.28);
    d.scale.set(r * (0.9 + rand() * 0.4), r * (0.45 + rand() * 0.25), r * (0.9 + rand() * 0.4));
    d.updateMatrix(); inst.setMatrixAt(n, d.matrix);
    inst.setColorAt(n++, c.set(M.stone.color).multiplyScalar(0.75 + rand() * 0.45));
  };
  for (let i = 0; i < 150; i++) put(-0.6 + rand() * 12.6, 1.38 + Math.pow(rand(), 2) * 0.7, 0.025 + rand() * 0.05);
  for (let i = 0; i < 60; i++) put(rand() * 12, rand() * 1.3 - 0.2 * rand(), 0.03 + rand() * 0.06);
  inst.count = n;
  addMesh(inst, true, { edges: false });
  return inst;
}

function underfloor(rand) {
  // open underfloor (ESTIMATE): dark earth, sleepers, short posts on foundation stones
  const X2 = 2 * ROOM_X;
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(X2 + 0.2, 1.35 - ROOM_Z + 0.1), M.earthDark);
  dark.rotation.x = -Math.PI / 2; dark.position.set(X2 / 2, GROUND + 0.003, (1.35 + ROOM_Z) / 2);
  addMesh(dark, true, { edges: false }); dark.castShadow = false;

  const STONE_H = 0.12;
  const stoneGeo = new THREE.CylinderGeometry(0.13, 0.16, STONE_H, 9);
  const postGeo = new THREE.BoxGeometry(0.1, 1, 0.1);
  const pts = [];
  for (let x = 0; x <= X2 + 0.01; x += KEN / 2) for (let z = 0; z >= ROOM_Z - 0.01; z -= KEN / 2) pts.push([x, z, -0.12]);
  for (let x = 0.3; x < 12; x += KEN) pts.push([x, 1.19, -0.16]);                  // the veranda posts
  const st = new THREE.InstancedMesh(stoneGeo, M.stone, pts.length);
  const po = new THREE.InstancedMesh(postGeo, M.dark, pts.length);
  const d = new THREE.Object3D(), c = new THREE.Color();
  pts.forEach(([x, z, top], i) => {
    d.position.set(x, GROUND + STONE_H / 2, z); d.rotation.set(0, rand() * 6.28, 0); d.scale.set(1, 1, 1);
    d.updateMatrix(); st.setMatrixAt(i, d.matrix); st.setColorAt(i, c.set(M.stone.color).multiplyScalar(0.8 + rand() * 0.3));
    const y0 = GROUND + STONE_H, h = top - y0;
    d.position.set(x, y0 + h / 2, z); d.rotation.set(0, 0, 0); d.scale.set(1, h, 1);
    d.updateMatrix(); po.setMatrixAt(i, d.matrix);
  });
  addMesh(st, true, { edges: false }); addMesh(po, true, { edges: false });
  // sleepers (obiki) under the room floor, running along x
  for (let z = 0; z >= ROOM_Z - 0.01; z -= KEN / 2) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(X2, 0.1, 0.1), M.dark);
    s.position.set(X2 / 2, -0.11, z);
    addMesh(s, true);
  }
}

function heartLeafClumps(rand) {
  // large heart-shaped, pointed, long-stalked leaves under the veranda edge (photo, bottom-left). ESTIMATE.
  const tex = paintedTextures.cached().heart.map;
  const mat = withAtmos(new THREE.MeshStandardMaterial({ color: '#4d6a3c', map: tex, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }));
  const stalkMat = M.plant;
  const g = new THREE.Group(); root.add(g);
  const clumps = [[1.25, 0.95], [1.55, 1.2], [1.75, 0.98], [1.4, 1.28]];
  const blades = [];
  for (const [cx, cz] of clumps) {
    const n = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.28, lean = 0.05 + rand() * 0.12, h = 0.18 + rand() * 0.14;      // stalk top stays under the deck
      const base = new THREE.Vector3(cx + (rand() - 0.5) * 0.08, GROUND, cz + (rand() - 0.5) * 0.08);
      const top = base.clone().add(new THREE.Vector3(Math.cos(a) * lean, h, Math.sin(a) * lean));
      const curve = new THREE.QuadraticBezierCurve3(base, base.clone().lerp(top, 0.5).add(new THREE.Vector3(0, 0.03, 0)), top);
      addMesh(new THREE.Mesh(new THREE.TubeGeometry(curve, 6, 0.004, 4), stalkMat), true, undefined, g);
      const size = 0.13 + rand() * 0.08;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 1.15), mat);
      blade.geometry.translate(0, size * 0.5, 0);                                           // stalk joins at the notch
      blade.position.copy(top);
      blade.rotation.set(-1.0 - rand() * 0.5, a + Math.PI / 2, (rand() - 0.5) * 0.4, 'YXZ'); // tipped outward, drooping
      addMesh(blade, true, { edges: false }, g);
      blades.push(blade);
    }
  }
  return blades;
}

export function buildStage() {
  const rand = rng(419);
  const slabMesh = slab();
  const footprint = footprintLine();
  stones(rand);
  underfloor(rand);
  const plants = heartLeafClumps(rand);
  return { slab: slabMesh, footprint, plants };
}
