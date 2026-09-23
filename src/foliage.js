import * as THREE from 'three';
import { LENS, VIEW_DIR, VFOV, GROUND } from './config.js';
import { M } from './materials.js';
import { withAtmos } from './atmosphere.js';
import { root, addMesh } from './geometry.js';
import { paintedTextures, leafQuad } from './textures.js';
import { inSlab } from './stage.js';
const inSlabXZ = (p) => inSlab(p.x, p.z, 0.1);

// Maple at the photo's top-left (ESTIMATE). Layered horizontal sprays with gaps between the tiers, placed in
// Bischof's frame: every leaf is positioned by frame x, frame y and distance from the lens, and clipped so the
// whole tree stays inside photo x < 250, y < 450, clear of the end-wall board enclosure (x 0–150, y 400–850).
// Each spray sways about its own twig base, so the motion stays within a few px. Trunk and crown are out of frame.
const PHOTO_W = 1140, PHOTO_H = 1142;
const LIMIT_X = 250, LIMIT_Y = 450, ENCL_X = 150, ENCL_Y = 400;
const TRUNK = new THREE.Vector3(3.4, GROUND, 3.3);
const TRUNK_TOP = new THREE.Vector3(3.45, 2.35, 3.25);
const LEAF = 0.08;                                  // Acer palmatum leaf, ~8 cm

// sprays: [frame x from, frame x to, frame y, distance from lens (m)] in photo px
const SPRAYS = [
  [0, 120, 40, 3.2], [140, 235, 55, 3.1],
  [10, 105, 135, 2.9], [120, 225, 150, 2.8],
  [0, 90, 235, 2.6], [110, 210, 245, 2.6],
  [20, 120, 320, 2.4], [150, 225, 350, 2.35],
];

function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

export function leafGeometry(size = LEAF) {
  // palmate, five-lobed maple leaf, flat, stem at the origin
  const s = new THREE.Shape();
  const lobes = 5, pts = [];
  for (let i = 0; i <= lobes * 2; i++) {
    const a = Math.PI * 0.5 + (i / (lobes * 2)) * Math.PI * 2 - Math.PI;
    const r = i % 2 === 0 ? 0.28 : 1.0 - Math.abs(i - lobes) * 0.08;
    pts.push(new THREE.Vector2(Math.cos(a) * r * size * 0.5, Math.sin(a) * r * size * 0.5 + size * 0.45));
  }
  s.moveTo(0, 0);
  for (const p of pts) s.lineTo(p.x, p.y);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

// frame (photo px + distance) ↔ world, through Bischof's measured camera
const T = Math.tan((VFOV * Math.PI) / 360), FW = VIEW_DIR.clone();
const RT = new THREE.Vector3().crossVectors(FW, new THREE.Vector3(0, 1, 0)).normalize();
const UP = new THREE.Vector3().crossVectors(RT, FW).normalize();
export function frameToWorld(px, py, d) {
  const nx = px / PHOTO_W, ny = py / PHOTO_H;
  const dir = FW.clone().addScaledVector(RT, (nx * 2 - 1) * T).addScaledVector(UP, (1 - ny * 2) * T).normalize();
  return LENS.clone().addScaledVector(dir, d);
}
export function worldToFrame(p) {
  const o = p.clone().sub(LENS), f = o.dot(FW);
  return [((o.dot(RT) / f / T + 1) / 2) * PHOTO_W, ((1 - o.dot(UP) / f / T) / 2) * PHOTO_H, o.length()];
}
// inside x < 250, y < 450 and off the enclosure; margin = projected leaf radius + sway
function allowed(px, py, marginPx) {
  if (px + marginPx > LIMIT_X || py + marginPx > LIMIT_Y) return false;
  if (px - marginPx < ENCL_X && py + marginPx > ENCL_Y) return false;
  return true;
}

export function buildMaple() {
  const rand = rng(1951);
  const bark = M.bark;
  // crooked trunk (out of frame) up to the fork at TRUNK_TOP
  const trunkPts = [TRUNK, new THREE.Vector3(3.35, 0.25, 3.37), new THREE.Vector3(3.47, 1.05, 3.27), new THREE.Vector3(3.40, 1.75, 3.31), TRUNK_TOP];
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPts), trunkGeo = new THREE.TubeGeometry(trunkCurve, 24, 0.075, 9);
  const tuv = trunkGeo.attributes.uv, tlen = trunkCurve.getLength();
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getY(i) * 0.47, tuv.getX(i) * tlen);   // bark UVs in metres
  const trunk = new THREE.Mesh(trunkGeo, bark);
  addMesh(trunk, true);
  trunk.userData.maple = true;
  const tube =(pts, r, parent, origin) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().sub(origin)));
    addMesh(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, r, 6), bark), true, undefined, parent);
  };

  // a hub just outside the left frame edge carries the limb from the trunk; twigs run from it into the sprays
  const hub = frameToWorld(-90, 160, 2.9);
  const limbGroup = new THREE.Group(); limbGroup.position.copy(TRUNK_TOP); limbGroup.userData.maple = true; root.add(limbGroup);
  tube([TRUNK_TOP, TRUNK_TOP.clone().lerp(hub, 0.5).add(new THREE.Vector3(0, 0.15, 0)), hub], 0.035, limbGroup, TRUNK_TOP);

  // leaves: painted atlas quads (three maple shapes), alpha-tested
  const atlas = paintedTextures.cached().leaves.map;
  const mat = withAtmos(new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  const quads = [0, 1, 2].map((c) => leafQuad(c, LEAF * 1.1));
  const geo = quads[0];
  const greens = ['#3c5a2b', '#48682f', '#557636', '#647d37', '#40552c'];
  const sprays = [];
  const d = new THREE.Object3D(), col = new THREE.Color();
  const PER = 70, SWAY_PX = 8;

  SPRAYS.forEach(([x0, x1, y, dist], sprayIndex) => {
    // pivot = where the twig enters from outside the frame, at this tier's height
    const base = frameToWorld(-40, y + 10, dist);
    const g = new THREE.Group(); g.position.copy(base); g.userData.maple = true; root.add(g);
    tube([hub, hub.clone().lerp(base, 0.5).add(new THREE.Vector3(0, 0.05, 0)), base], 0.012, g, base);
    tube([base, frameToWorld((x0 + x1) / 2, y + 6, dist), frameToWorld(x1 - 10, y + 4, dist)], 0.008, g, base);

    const leaves = new THREE.InstancedMesh(quads[sprayIndex % 3], mat, PER);
    let n = 0;
    for (let i = 0; i < PER * 3 && n < PER; i++) {
      // a flat spray: spread along the twig, thin vertically, a little depth
      const px = x0 + rand() * (x1 - x0), py = y + (rand() - 0.5) * 34, dd = dist + (rand() - 0.5) * 0.3;
      const marginPx = ((LEAF * 1.3) / dd / (2 * T)) * PHOTO_W + SWAY_PX;   // a leaf reaches one full (scaled) length from its stem
      if (!allowed(px, py, marginPx)) continue;
      d.position.copy(frameToWorld(px, py, dd)).sub(base);
      // leaves lie roughly flat in the spray, seen from below by the lens
      d.rotation.set(-Math.PI / 2 + (rand() - 0.5) * 0.7, rand() * Math.PI * 2, (rand() - 0.5) * 0.5, 'YXZ');
      d.scale.setScalar(0.8 + rand() * 0.45);
      d.updateMatrix();
      leaves.setMatrixAt(n, d.matrix);
      leaves.setColorAt(n, col.set(greens[Math.floor(rand() * greens.length)]));
      n++;
    }
    leaves.count = n;
    addMesh(leaves, true, { edges: false }, g);
    sprays.push({ g, phase: rand() * 6.28 });
  });

  // branches from the trunk (outside the frame), each splitting once, with flat foliage clusters along them
  const crownGroup = new THREE.Group(); crownGroup.position.copy(TRUNK_TOP); crownGroup.userData.maple = true; root.add(crownGroup);
  const inFrame = (p, m = 30) => { const [fx, fy, dd] = worldToFrame(p); return dd > 0.3 && fx > -m && fx < PHOTO_W + m && fy > -m && fy < PHOTO_H + m && p.clone().sub(LENS).dot(FW) > 0; };
  const trunkAt = (t) => trunkCurve.getPointAt(t);
  const BRANCHES = [   // [position up the trunk (0–1), direction, length]
    [0.62, [0.1, 0.45, 1.0], 1.3], [0.72, [-0.8, 0.5, 0.6], 1.2], [0.8, [0.85, 0.55, 0.45], 1.1],
    [0.9, [0.2, 1.0, 0.35], 0.9], [0.55, [-0.35, 0.3, 1.0], 1.0],
  ];
  const clusters = [];
  for (const [t0, dir, len] of BRANCHES) {
    const start = trunkAt(t0), d = new THREE.Vector3(...dir).normalize();
    const mid = start.clone().addScaledVector(d, len * 0.55).add(new THREE.Vector3(0, 0.12, 0));
    const tipA = mid.clone().addScaledVector(d.clone().add(new THREE.Vector3(0.35, 0.1, -0.2)).normalize(), len * 0.5);
    const tipB = mid.clone().addScaledVector(d.clone().add(new THREE.Vector3(-0.3, 0.05, 0.3)).normalize(), len * 0.45);
    const curveOK = (pts) => { const c = new THREE.CatmullRomCurve3(pts); for (let k = 0; k <= 12; k++) if (inFrame(c.getPointAt(k / 12), 10)) return false; return true; };
    if (!curveOK([start, mid, tipA]) || !curveOK([mid, tipB])) continue;          // never let a branch enter the frame
    tube([start, start.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, 0.06, 0)), mid], 0.03, crownGroup, TRUNK_TOP);
    tube([mid, mid.clone().lerp(tipA, 0.5).add(new THREE.Vector3(0, 0.05, 0)), tipA], 0.016, crownGroup, TRUNK_TOP);
    tube([mid, mid.clone().lerp(tipB, 0.5).add(new THREE.Vector3(0, 0.04, 0)), tipB], 0.014, crownGroup, TRUNK_TOP);
    for (const [a0, a1, f] of [[start, mid, 0.6], [mid, tipA, 0.5], [mid, tipA, 1.0], [mid, tipB, 0.6], [mid, tipB, 1.0]])
      clusters.push(a0.clone().lerp(a1, f));
  }
  const crown = new THREE.InstancedMesh(quads[1], mat, clusters.length * 70);
  let n = 0;
  for (const c of clusters) {
    for (let i = 0; i < 70; i++) {
      // flat, layered sprays: wide, thin vertically
      const p = c.clone().add(new THREE.Vector3((rand() - 0.5) * 0.55, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.55));
      if (inFrame(p) || !inSlabXZ(p)) continue;
      d.position.copy(p).sub(TRUNK_TOP);
      d.rotation.set(-Math.PI / 2 + (rand() - 0.5) * 0.7, rand() * Math.PI * 2, (rand() - 0.5) * 0.5, 'YXZ');
      d.scale.setScalar(0.9 + rand() * 0.5);
      d.updateMatrix();
      crown.setMatrixAt(n, d.matrix);
      crown.setColorAt(n, col.set(greens[Math.floor(rand() * greens.length)]));
      n++;
    }
  }
  crown.count = n;
  addMesh(crown, true, { edges: false }, crownGroup);

  return {
    sprays,
    update(time, gust) {
      const a = 0.4 + gust;
      for (const s of sprays) {
        s.g.rotation.x = Math.sin(time * 0.9 + s.phase) * 0.008 * a;
        s.g.rotation.z = Math.sin(time * 0.7 + s.phase * 1.3) * 0.010 * a;
      }
      crownGroup.rotation.z = Math.sin(time * 0.6) * 0.01 * a;
    },
  };
}
