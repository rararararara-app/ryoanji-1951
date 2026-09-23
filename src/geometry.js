import * as THREE from 'three';
import { KEN, KAMOI, GROUND, ROOM_X, ROOM_Z } from './config.js';
import { M, GHOST, GHOST_EDGE } from './materials.js';

// Every mesh is registered as measured (from the photo) or estimated (outside the frame / not measured).
// Ported from ryoanji-greybox-rev4.html. rev4 built in depth d with a z-mirrored group; here z = −d directly.
export const registry = { measured: [], estimated: [], cutaway: [] };

export const root = new THREE.Group();

function register(mesh, est, { cutaway = false, receive = true, edges = true } = {}) {
  mesh.castShadow = true;                       // estimated geometry casts shadows too (brief §5, §11)
  mesh.receiveShadow = receive;
  mesh.userData.estimated = !!est;
  mesh.userData.baseMaterial = mesh.material;
  if (est) {
    if (edges) {   // instanced meshes skip this: one outline at the origin would be wrong
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), GHOST_EDGE);
      e.visible = false;
      e.raycast = () => {};
      mesh.add(e);
      mesh.userData.edges = e;
    }
    registry.estimated.push(mesh);
  } else registry.measured.push(mesh);
  if (cutaway) {
    mesh.material = mesh.material.clone();
    mesh.material.onBeforeCompile = mesh.userData.baseMaterial.onBeforeCompile;
    mesh.material.customProgramCacheKey = mesh.userData.baseMaterial.customProgramCacheKey;
    mesh.material.transparent = true;
    mesh.userData.baseMaterial = mesh.material;
    registry.cutaway.push(mesh);
  }
  return mesh;
}

// Axis-aligned box from extents, scene coordinates. Order of each pair doesn't matter.
export function box(x0, x1, y0, y1, z0, z1, mat, est = false, opts) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  const m = new THREE.Mesh(g, mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  root.add(m);
  return register(m, est, opts);
}

export function addMesh(mesh, est, opts, parent = root) {
  parent.add(mesh);
  return register(mesh, est, opts);
}

export function setEstimatedView(on) {
  for (const m of registry.estimated) {
    m.material = on ? GHOST : m.userData.baseMaterial;
    if (m.userData.edges) m.userData.edges.visible = on;
  }
}

// Fade roof and ceiling when orbiting above them, so the room stays readable. Shadows are unaffected.
export function updateCutaway(camera, estimatedView) {
  const t = THREE.MathUtils.smoothstep(camera.position.y, 3.4, 4.6);
  for (const m of registry.cutaway) {
    if (estimatedView) continue;
    const mat = m.material;
    mat.opacity = 1 - t;
    mat.depthWrite = t < 0.5;
    mat.colorWrite = t < 0.98;        // fully cut away, but still in the shadow pass
  }
}

export function buildArchitecture() {
  const X2 = 2 * ROOM_X;          // building continues along the veranda (estimate)

  // ---------- ground (estimate: 0.55 m below the veranda floor)
  // 400 m, and its far distance fades into the sky colour (ATMOS_HORIZON), so free view shows no edge
  const groundMat = M.ground.clone();
  groundMat.onBeforeCompile = M.ground.onBeforeCompile; groundMat.customProgramCacheKey = M.ground.customProgramCacheKey;
  groundMat.defines = { ATMOS_HORIZON: '' };
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  gr.rotation.x = -Math.PI / 2; gr.position.set(3, GROUND, 0);
  addMesh(gr, true);
  gr.castShadow = false;

  // ---------- veranda (measured: depth 1.35, planks ≈ 0.135, fascia 0.16)
  box(0, 8, -0.16, 0, 0, 1.35, M.wood);
  box(8, 12, -0.16, 0, 0, 1.35, M.wood, true);
  for (let z = 1.35 - 0.135; z > 0.01; z -= 0.135) {
    box(0, 8, 0, 0.002, z - 0.004, z + 0.004, M.dark, false, { receive: true }).castShadow = false;
    box(8, 12, 0, 0.002, z - 0.004, z + 0.004, M.dark, true).castShadow = false;
  }
  for (let x = 0.3; x < 12; x += KEN) box(x - 0.06, x + 0.06, GROUND, -0.16, 1.13, 1.25, M.dark, true);
  box(0, X2, GROUND, -0.07, -0.12, ROOM_Z + 0.1, M.iron, true);   // shadowed underfloor plinth, set back

  // ---------- room floor (tatami level = sill level within ~2 cm)
  box(0, ROOM_X, -0.06, 0, 0, -4.68, M.tatami);
  box(0, ROOM_X, -0.06, 0, -4.68, ROOM_Z, M.tatami, true);
  box(ROOM_X, X2, -0.06, 0, 0, ROOM_Z, M.tatami, true);

  // ---------- facade (z = 0)
  box(0, ROOM_X, -0.03, 0.03, -0.06, 0.06, M.dark);                 // sill
  box(ROOM_X, X2, -0.03, 0.03, -0.06, 0.06, M.dark, true);
  for (const x of [0, 0.82, 1.94]) box(x - 0.075, x + 0.075, 0, 2.55, -0.075, 0.075, M.dark);
  for (let x = ROOM_X; x < X2 + 0.01; x += KEN) box(x - 0.075, x + 0.075, 0, 2.55, -0.075, 0.075, M.dark, true);
  box(0, ROOM_X, KAMOI, KAMOI + 0.1, -0.07, 0.07, M.dark);           // kamoi at 1.77 m — scale anchor
  box(ROOM_X, X2, KAMOI, KAMOI + 0.1, -0.07, 0.07, M.dark, true);
  box(0, ROOM_X, 2.30, 2.55, -0.1, 0.1, M.dark);                     // upper beam 2.30–2.55
  box(ROOM_X, X2, 2.30, 2.55, -0.1, 0.1, M.dark, true);
  box(0, X2, KAMOI + 0.1, 2.30, -0.02, 0.02, M.paper, true);         // ranma band (detail estimated)
  box(0.9, 1.87, 0, KAMOI, -0.02, 0.02, M.paper);                    // closed leaf behind the lantern
  box(3.72, 3.72 + KEN / 2, 0, KAMOI, 0, 0.04, M.paper);             // near leaf: edge measured, width half ken
  box(3.72 + KEN / 2, ROOM_X - 0.08, 0, KAMOI, 0, 0.04, M.paper, true);
  for (let x = ROOM_X; x < X2 - 0.1; x += KEN / 2)                   // rest of the building: closed leaves
    box(x + 0.08, x + KEN / 2 - 0.02, 0, KAMOI, -0.02, 0.02, M.paper, true);
  shoji('z', 0.9, 1.87, 0.03, 2, 4);             // leaf positions measured, lattice and koshi estimated
  shoji('z', 3.72, 3.72 + KEN / 2, 0.047, 3, 6);

  // ---------- end wall (x = 0): the veranda's end enclosure and the room's side wall, one line
  box(-0.08, 0, 0, 2.55, 0, 1.35, M.dark);                           // board enclosure at the veranda end
  box(-0.08, 0, 2.55, 2.75, 0, 2.4, M.dark, true);                    // closes the gap up to the eave
  // open slot z 0 → −0.37 (source of the veranda sun patch) — intentionally empty
  box(-0.03, 0.03, 0, KAMOI, -0.37, -1.50, M.paper, true);           // hidden behind the closed leaf
  box(-0.03, 0.03, 0, KAMOI, -1.50, -1.71, M.paper);                 // narrow leaf
  // side opening z −1.71 → −3.66 (1 ken) — open, looks onto the court
  box(-0.03, 0.03, 0, KAMOI, -3.66, -4.68, M.paper);                 // leaf right of the side opening
  box(-0.03, 0.03, 0, KAMOI, -4.68, ROOM_Z, M.paper, true);
  box(-0.07, 0.07, KAMOI, KAMOI + 0.1, 0, ROOM_Z, M.dark);           // end-wall kamoi (5–7 px from the photo)
  box(-0.02, 0.02, KAMOI + 0.1, 2.55, 0, ROOM_Z, M.paper, true);
  for (const z of [-1.71, -3.66]) box(-0.07, 0.07, 0, KAMOI, z, z + 0.07, M.dark);   // jambs, as rev4
  box(0.08, 0.1, 0, 1.72, -3.28, -3.62, M.cloth);                    // hanging curtain inside the opening
  shoji('x', -1.50, -1.71, 0.037, 1, 10, 0.12);
  shoji('x', -3.66, -4.68, 0.037, 4, 10, 0.3);

  // ---------- partitions, back wall, ceiling, roof (not in frame — estimates)
  box(ROOM_X - 0.02, ROOM_X + 0.02, 0, 2.55, 0, ROOM_Z, M.paper, true);
  box(X2 - 0.05, X2 + 0.05, 0, 2.55, 0, ROOM_Z, M.plaster, true);
  box(0, X2, 0, 2.55, ROOM_Z, ROOM_Z - 0.05, M.plaster, true);
  box(0, X2, 2.55, 2.6, 0, ROOM_Z, M.paper, true, { cutaway: true });           // ceiling ≈ 2.6
  box(-0.6, 12.9, 2.75, 2.85, 2.4, ROOM_Z - 0.9, M.dark, true, { cutaway: true });  // eave slab, overhang to z +2.4
  hippedRoof(-0.6, 12.9, 2.4, ROOM_Z - 0.9, 2.85, 1.7, M.tile, { cutaway: true });

  // ---------- court beyond the end wall (glimpsed only)
  box(-2.6, -2.52, GROUND, GROUND + 1.6, -1.2, 2.5, M.bamboo, true);           // bamboo fence (seen through the slot)
  for (let z = -1.1; z < 2.5; z += 0.9) box(-2.62, -2.5, GROUND, GROUND + 1.68, z - 0.03, z + 0.03, M.dark, true);
  const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 2), M.plant);
  shrub.scale.set(1, 0.85, 1); shrub.position.set(-1.6, GROUND + 0.6, -2.7);
  addMesh(shrub, true);
  // neighbouring building, white walls. Runs to z −9.5 (was −6.2): the photo shows building, not sky,
  // at the right of the side opening, where the sight line reaches x −3.8 at about z −7.3
  box(-7.5, -3.8, GROUND, 2.3, -0.6, -9.5, M.plasterFar, true);
  box(-7.5, -3.8, GROUND, GROUND + 0.5, -0.6, -9.5, M.dark, true);
  box(-8, -3.3, 2.3, 2.45, -0.1, -10.0, M.tile, true);                           // its tiled eave
  gableAlongZ(-8, -3.3, -0.1, -10.0, 2.45, 1.2, M.tile);

  // ---------- garden where Bischof stands: open ground, low planting at the veranda edge
  const clumps = [[-0.6, 1.7, 0.55], [0.4, 1.62, 0.5], [1.3, 1.7, 0.42], [2.3, 1.6, 0.38], [3.1, 1.66, 0.34], [-1.4, 1.1, 0.6], [8.4, 1.62, 0.4], [9.6, 1.7, 0.5]];
  const plants = [];
  for (const [x, z, r] of clumps) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10), M.plant);
    p.scale.set(1, 0.42, 0.7); p.position.set(x, GROUND + r * 0.2, z);
    addMesh(p, true);
    plants.push(p);
  }
  return { plants };
}

// Shoji detail on measured leaves: kumiko grid and a low wooden kick panel (koshi), both read from the photo
// but not measured, so they are tagged estimated. plane 'z': leaf on the facade (a = x); plane 'x': on the end wall (a = z).
function shoji(plane, a0, a1, off, cols, rows, koshi = 0.36) {
  const w = Math.abs(a1 - a0), lo = Math.min(a0, a1), g = new THREE.Group();
  const bars = [];   // [centre along, centre y, size along, size y, material]
  const top = KAMOI - 0.03, bottom = koshi;
  for (let i = 1; i < cols; i++) bars.push([lo + (w * i) / cols, (top + bottom) / 2, 0.014, top - bottom, M.dark]);
  for (let j = 1; j < rows; j++) bars.push([lo + w / 2, bottom + ((top - bottom) * j) / rows, w - 0.05, 0.014, M.dark]);
  bars.push([lo + 0.02, KAMOI / 2, 0.035, KAMOI, M.dark], [lo + w - 0.02, KAMOI / 2, 0.035, KAMOI, M.dark]);
  bars.push([lo + w / 2, top + 0.015, w, 0.03, M.dark]);
  if (koshi) bars.push([lo + w / 2, koshi / 2, w, koshi, M.lacquer]);
  for (const [c, cy, sa, sy, mat] of bars) {
    const geo = plane === 'z' ? new THREE.BoxGeometry(sa, sy, 0.014) : new THREE.BoxGeometry(0.014, sy, sa);
    const m = new THREE.Mesh(geo, mat);
    if (plane === 'z') m.position.set(c, cy, off); else m.position.set(off, cy, c);
    g.add(m);
    register(m, true, { receive: true }).castShadow = false;
  }
  root.add(g);
}

// Hipped roof (yosemune) on the eave slab (estimate): four slopes from the slab edge at yBase to a ridge along x.
// The hips are at 45° in plan, so the ridge is inset from each end by half the depth. The slab below keeps
// the eave at 2.75–2.85 and the overhang to z +2.4.
function hippedRoof(x0, x1, zFront, zBack, yBase, rise, mat, opts) {
  const zr = (zFront + zBack) / 2, half = Math.abs(zFront - zBack) / 2;
  const A = new THREE.Vector3(x0, yBase, zFront), B = new THREE.Vector3(x1, yBase, zFront);
  const C = new THREE.Vector3(x1, yBase, zBack), D = new THREE.Vector3(x0, yBase, zBack);
  const R1 = new THREE.Vector3(x0 + half, yBase + rise, zr), R2 = new THREE.Vector3(x1 - half, yBase + rise, zr);
  const centre = new THREE.Vector3((x0 + x1) / 2, yBase, zr);
  const pos = [];
  const tri = (a, b, c) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const mid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
    if (n.dot(mid.sub(centre)) < 0) [b, c] = [c, b];          // outward winding
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  tri(A, B, R2); tri(A, R2, R1);          // front slope
  tri(C, D, R1); tri(C, R1, R2);          // back slope
  tri(D, A, R1);                          // hip ends
  tri(B, C, R2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  addMesh(new THREE.Mesh(g, mat), true, opts);
}

function gableAlongZ(x0, x1, z0, z1, yBase, rise, mat) {
  const xc = (x0 + x1) / 2, hw = Math.abs(x1 - x0) / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0); shape.lineTo(hw, 0); shape.lineTo(0, rise); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(z1 - z0), bevelEnabled: false });
  const m = new THREE.Mesh(g, mat);
  m.position.set(xc, yBase, Math.min(z0, z1));
  addMesh(m, true);
}
