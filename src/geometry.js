import * as THREE from 'three';
import { KEN, KAMOI, GROUND, ROOM_X, ROOM_Z } from './config.js';
import { M, GHOST, GHOST_EDGE } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
// BoxGeometry UVs in metres, so painted textures keep one texel density; the texture's u (grain) runs along
// each face's longer side. Face order: +x, -x, +y, -y, +z, -z (4 vertices each).
export function uvMetres(g, w, h, d) {
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f], swap = dv > du;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k, u = uv.getX(i) * du, v = uv.getY(i) * dv;
      if (swap) uv.setXY(i, v, u); else uv.setXY(i, u, v);
    }
  }
  return g;
}

export function box(x0, x1, y0, y1, z0, z1, mat, est = false, opts) {
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
  const g = uvMetres(new THREE.BoxGeometry(w, h, d), w, h, d);
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
  // posts: 0.121 m section (4 sun), re-fitted to the full-res photo
  const P = 0.121;
  box(-0.06, 0.06, 0, 2.55, 0, P, M.dark);                           // corner post, veranda side of the facade line (measured)
  box(0.81 - P / 2, 0.81 + P / 2, 0, 2.55, -P / 2, P / 2, M.dark);    // post at x 0.81 (measured)
  box(1.94 - P / 2, 1.94 + P / 2, 0, 2.55, -P / 2, P / 2, M.dark, true); // post at x 1.94: position measured, section estimated
  for (let x = ROOM_X; x < X2 + 0.01; x += KEN) box(x - 0.075, x + 0.075, 0, 2.55, -0.075, 0.075, M.dark, true);
  box(0, ROOM_X, KAMOI, KAMOI + 0.1, -0.07, 0.07, M.dark);           // kamoi at 1.77 m — scale anchor
  box(ROOM_X, X2, KAMOI, KAMOI + 0.1, -0.07, 0.07, M.dark, true);
  box(0, ROOM_X, 2.30, 2.55, -0.1, 0.1, M.dark);                     // upper beam 2.30–2.55
  box(ROOM_X, X2, 2.30, 2.55, -0.1, 0.1, M.dark, true);
  box(0, X2, KAMOI + 0.1, 2.30, -0.02, 0.02, M.paper, true);         // ranma band (detail estimated)
  // ranma lattice, kamoi to upper beam: struts at the posts and every half ken. Bar spacing per bay, counted
  // against the photo: ~6 columns per bay left of x 1.94, ~7 over 1.94–2.93, ~10 over 2.93–3.91, ~8 beyond
  const struts = [0.81, 1.94]; for (let x = 1.94 + KEN / 2; x < X2; x += KEN / 2) struts.push(x);
  const facadeSpacing = (a0) => (a0 < 1.9 ? 0.16 : a0 < 2.9 ? 0.14 : a0 < 3.9 ? 0.09 : 0.12);
  ranma('z', 0, X2, 0.03, KAMOI + 0.1, 2.30, facadeSpacing, [1 / 3, 2 / 3], struts);
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
  // end-wall ranma above the side opening: two panels either side of a strut at z −2.61 → −2.87, bars ~0.13 m
  ranma('x', 0, ROOM_Z, 0.03, KAMOI + 0.1, 2.52, 0.13, [0.35, 0.8], [-1.71, -2.74, -3.66]);
  box(0.01, 0.06, KAMOI + 0.1, 2.52, -2.61, -2.87, M.dark, true);
  for (const z of [-1.71, -3.66]) box(-0.07, 0.07, 0, KAMOI, z, z + 0.07, M.dark);   // jambs, as rev4
  box(0.08, 0.1, 0, 1.72, -3.28, -3.62, M.cloth);                    // hanging curtain inside the opening
  shoji('x', -1.50, -1.71, 0.037, 1, 10, 0.12);
  shoji('x', -3.66, -4.68, 0.037, 4, 10, 0.3);

  // ---------- partitions, back wall, ceiling, roof (not in frame — estimates)
  box(ROOM_X - 0.02, ROOM_X + 0.02, 0, 2.55, 0, ROOM_Z, M.paper, true);
  box(X2 - 0.05, X2 + 0.05, 0, 2.55, 0, ROOM_Z, M.plaster, true);
  box(0, X2, 0, 2.55, ROOM_Z, ROOM_Z - 0.05, M.plaster, true);
  box(0, X2, 2.55, 2.6, 0, ROOM_Z, M.ceiling, true, { cutaway: true });         // board ceiling ≈ 2.6
  // battens (sao-buchi) under the boards, running along z, ~0.45 m apart (board-and-batten ceiling, estimated)
  for (let x = 0.3; x < X2; x += 0.45) box(x - 0.02, x + 0.02, 2.51, 2.55, 0, ROOM_Z, M.dark, true, { cutaway: true });
  box(0, X2, 2.47, 2.55, -0.05, 0.02, M.dark, true, { cutaway: true });                 // cornice rail along the facade
  box(0.02, 0.1, 2.47, 2.55, 0, ROOM_Z, M.dark, true, { cutaway: true });               // and along the end wall
  box(-0.6, 12.9, 2.75, 2.85, 2.4, ROOM_Z - 0.9, M.dark, true, { cutaway: true });  // eave slab, overhang to z +2.4
  hippedRoof(-0.6, 12.9, 2.4, ROOM_Z - 0.9, 2.85, 1.7, M.tile, { cutaway: true });

  // the court beyond the end wall (neighbouring building, court tree, fence) is built in court.js

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
  const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i], pos[i + 2]);   // planar, metres
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  addMesh(new THREE.Mesh(g, mat), true, opts);
}

// Ranma lattice (estimated pattern at measured positions): vertical bars at `spacing` (m, or a function of the bay start), horizontal bars at the given
// fractions of the band height, heavier struts at `struts`. plane 'z': on the facade (a = x); 'x': on the end wall (a = z).
function ranma(plane, a0, a1, off, y0, y1, spacing, hfrac, struts) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), h = y1 - y0, bars = [];
  const stops = [lo, ...struts.filter((s) => s > lo && s < hi).sort((p, q) => p - q), hi];
  for (let i = 0; i < stops.length - 1; i++) {
    const s0 = stops[i], s1 = stops[i + 1], sp = typeof spacing === 'function' ? spacing(s0) : spacing;
    const n = Math.max(1, Math.round((s1 - s0) / sp));
    for (let k = 1; k < n; k++) bars.push([s0 + ((s1 - s0) * k) / n, 0.014, 0.012]);
  }
  for (const s of stops) bars.push([s, 0.06, 0.02]);                            // struts and end posts
  const geo = [];
  const make = (ca, cy, sa, sy, depth) => {
    const g = plane === 'z' ? new THREE.BoxGeometry(sa, sy, depth) : new THREE.BoxGeometry(depth, sy, sa);
    if (plane === 'z') g.translate(ca, cy, off); else g.translate(off, cy, ca);
    geo.push(g);
  };
  for (const [a, w, dpt] of bars) make(a, y0 + h / 2, w, h, dpt);
  for (const f of hfrac) make((lo + hi) / 2, y0 + h * f, hi - lo, 0.014, 0.012);
  make((lo + hi) / 2, y0 + 0.012, hi - lo, 0.024, 0.02); make((lo + hi) / 2, y1 - 0.012, hi - lo, 0.024, 0.02);
  const m = new THREE.Mesh(mergeGeometries(geo), M.dark);
  root.add(m);
  register(m, true, { receive: true }).castShadow = true;
}
