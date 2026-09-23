import * as THREE from 'three';
import { LENS, VIEW_DIR, VFOV, GROUND } from './config.js';
import { M } from './materials.js';
import { withAtmos } from './atmosphere.js';
import { root, addMesh } from './geometry.js';

// Maple branch cluster at the photo's top-left (estimated). The leaves are placed by where they should appear
// in Bischof's frame (normalised x, y from the top-left) and how far they are from the lens (2–3.5 m), so the
// cluster covers the photo's top-left corner without drifting onto the lantern. The trunk stands outside the
// frame at (3.4, 3.3), so the branch has something to grow from in free view.
const TRUNK = new THREE.Vector3(3.4, GROUND, 3.3);
const TRUNK_TOP = new THREE.Vector3(3.45, 2.35, 3.25);
const LANTERN = new THREE.Vector3(3.53, 0.99, 1.35);

// [nx, ny, distance from lens] — lower clumps stay left of x 0.15 so they clear the lantern (x ≥ 0.25)
const CLUMPS = [
  [0.02, 0.04, 3.1], [0.10, 0.03, 3.3], [0.19, 0.05, 3.2], [0.05, 0.13, 2.7], [0.14, 0.12, 2.9],
  [0.21, 0.15, 3.0], [0.02, 0.24, 2.5], [0.10, 0.22, 2.4], [0.03, 0.35, 2.3], [0.09, 0.33, 2.6],
  [0.01, 0.46, 2.2],
];

function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

function leafGeometry(size = 0.11) {
  // palmate, five-lobed maple leaf, flat, stem at the origin
  const s = new THREE.Shape();
  const lobes = 5, pts = [];
  for (let i = 0; i <= lobes * 2; i++) {
    const a = Math.PI * 0.5 + (i / (lobes * 2)) * Math.PI * 2 - Math.PI;   // fan around the stem
    const r = i % 2 === 0 ? 0.28 : 1.0 - Math.abs(i - lobes) * 0.08;
    pts.push(new THREE.Vector2(Math.cos(a) * r * size * 0.5, Math.sin(a) * r * size * 0.5 + size * 0.45));
  }
  s.moveTo(0, 0);
  for (const p of pts) s.lineTo(p.x, p.y);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

export function buildMaple() {
  const rand = rng(1951);
  const group = new THREE.Group();          // pivots at the trunk top so the whole branch sways
  group.position.copy(TRUNK_TOP);
  const local = (v) => v.clone().sub(TRUNK_TOP);

  // frame → world: a ray from the lens through (nx, ny) of the square POV frame
  const t = Math.tan((VFOV * Math.PI) / 360), fw = VIEW_DIR.clone();
  const rt = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(rt, fw).normalize();
  const toWorld = (nx, ny, d) => {
    const dir = fw.clone().addScaledVector(rt, (nx * 2 - 1) * t).addScaledVector(up, (1 - ny * 2) * t).normalize();
    return LENS.clone().addScaledVector(dir, d);
  };

  // trunk (out of frame) and branches arching to each clump
  const bark = M.lacquer;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, TRUNK_TOP.y - GROUND, 10), bark);
  trunk.position.copy(TRUNK).add(TRUNK_TOP).multiplyScalar(0.5);
  addMesh(trunk, true);
  const frameClumps = CLUMPS.map(([nx, ny, d]) => toWorld(nx, ny, d));
  // one main limb from the trunk top toward the frame clumps, then short twigs to each clump
  const fork = frameClumps.reduce((a, c) => a.add(c), new THREE.Vector3()).divideScalar(frameClumps.length);
  fork.lerp(TRUNK_TOP, 0.35); fork.y += 0.15;
  const limbMid = TRUNK_TOP.clone().lerp(fork, 0.5); limbMid.y += 0.2;
  const tube = (a, m, b, r) => addMesh(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(local(a), local(m), local(b)), 14, r, 7), bark), true, undefined, group);
  tube(TRUNK_TOP, limbMid, fork, 0.035);
  for (const c of frameClumps) { const m = fork.clone().lerp(c, 0.5); m.y += 0.08; tube(fork, m, c, 0.012); }
  // a small crown around the trunk top (outside the frame) so the tree reads in free view
  const crown = [[0, 0.35, 0], [-0.45, 0.15, 0.3], [0.4, 0.2, 0.35], [0.1, 0.1, -0.45], [-0.3, 0.45, -0.2]]
    .map(([x, y, z]) => TRUNK_TOP.clone().add(new THREE.Vector3(x, y, z)));
  const centres = [...frameClumps, ...crown];

  // leaves: instanced cards around each clump centre, kept clear of the lantern and its hanger
  const geo = leafGeometry();
  const perClump = 90, count = centres.length * perClump;
  const mat = withAtmos(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  const leaves = new THREE.InstancedMesh(geo, mat, count);
  const d = new THREE.Object3D(), col = new THREE.Color();
  const greens = ['#3c5a2b', '#48682f', '#557636', '#647d37', '#40552c'];
  let n = 0;
  for (const c of centres) {
    for (let i = 0; i < perClump; i++) {
      const p = c.clone().add(new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.7, rand() - 0.5).multiplyScalar(0.5));
      // in-frame leaves stay 2–3.5 m from the lens
      const off = p.clone().sub(LENS);
      if (frameClumps.includes(c)) p.copy(LENS).addScaledVector(off.clone().normalize(), THREE.MathUtils.clamp(off.length(), 2.0, 3.5));
      off.copy(p).sub(LENS);
      const toLantern = Math.hypot(p.x - LANTERN.x, p.z - LANTERN.z);
      if (toLantern < 0.4 && p.y > 0.6) continue;          // keep off the lantern body and its hanger
      const f = off.dot(fw), nx = (off.dot(rt) / f / t + 1) / 2, ny = (1 - off.dot(up) / f / t) / 2;
      if (nx > 0.21 && nx < 0.46 && ny > 0.32 && ny < 0.59) continue;   // and off its silhouette, with room for the sway
      d.position.copy(local(p));
      d.rotation.set(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
      d.scale.setScalar(0.75 + rand() * 0.5);
      d.updateMatrix();
      leaves.setMatrixAt(n, d.matrix);
      leaves.setColorAt(n, col.set(greens[Math.floor(rand() * greens.length)]));
      n++;
    }
  }
  leaves.count = n;
  addMesh(leaves, true, { edges: false }, group);
  root.add(group);

  return {
    group,
    update(time, gust) {
      const a = 0.35 + gust;
      group.rotation.x = Math.sin(time * 0.9) * 0.018 * a;
      group.rotation.z = Math.sin(time * 0.7 + 1.3) * 0.022 * a;
      group.rotation.y = Math.sin(time * 0.5 + 0.4) * 0.012 * a;
    },
  };
}
