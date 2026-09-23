import * as THREE from 'three';
import { LENS, VIEW_DIR, VFOV, GROUND } from './config.js';
import { M } from './materials.js';
import { withAtmos } from './atmosphere.js';
import { root, addMesh, uvMetres } from './geometry.js';
import { paintedTextures, leafQuad } from './textures.js';

// The court beyond the end wall, seen through the side opening and the corner slot. ALL ESTIMATED (BRIEF §5).
// Things are placed the way they were measured: a photo px (1140 × 1142) plus a depth plane, back-projected
// through Bischof's calibrated camera.

const PHOTO_W = 1140, PHOTO_H = 1142;
const T = Math.tan((VFOV * Math.PI) / 360), FW = VIEW_DIR.clone();
const RT = new THREE.Vector3().crossVectors(FW, new THREE.Vector3(0, 1, 0)).normalize();
const UP = new THREE.Vector3().crossVectors(RT, FW).normalize();
function rayDir(px, py) {
  return FW.clone().addScaledVector(RT, ((px / PHOTO_W) * 2 - 1) * T).addScaledVector(UP, (1 - (py / PHOTO_H) * 2) * T).normalize();
}
// the point where the ray through photo px meets the plane x = X
export function pxAtX(px, py, X) {
  const d = rayDir(px, py);
  return LENS.clone().addScaledVector(d, (X - LENS.x) / d.x);
}

function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
const est = (mesh, parent, opts) => addMesh(mesh, true, opts, parent);
const boxMesh = (x0, x1, y0, y1, z0, z1, mat) => {
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
  const m = new THREE.Mesh(uvMetres(new THREE.BoxGeometry(w, h, d), w, h, d), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
};

// ---------------------------------------------------------------- neighbouring building
// Gable face on the plane x = −5.7 (calculated range −5.7 to −7.2; −5.7 assumes JIS 53A tiles, 235 mm course).
// Ridge along x, gable facing +x. Pitch 19°, eave 2.0 m above our floor. The verge line is the one through
// photo px (518, 530) and (615, 495) on that plane; its 2.0 m point fixes the near eave.
const GX = -5.7, PITCH = THREE.MathUtils.degToRad(19), EAVE_Y = 2.0;
const COURSE = 0.235, TILE_W = 0.265;            // JIS 53A: 235 mm course (work length), 265 mm work width
const HALF_W = 1.65, LENGTH = 3.25, WALL_INSET = 0.35;   // length ends at the slab edge (x −9)

function jTileSlope(x0, length, zEave, zRidge, yEave, sideSign, mat) {
  // sideSign +1: slope faces +z (eave at the larger z); −1: faces −z
  const S = Math.abs(zRidge - zEave) / Math.cos(PITCH);
  const nu = Math.ceil((length / TILE_W) * 8), nv = Math.ceil((S / COURSE) * 6);
  const geo = new THREE.PlaneGeometry(1, 1, nu, nv);
  const pos = geo.attributes.position;
  const n = new THREE.Vector3(0, Math.cos(PITCH), sideSign * Math.sin(PITCH));
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + 0.5) * length, v = (pos.getY(i) + 0.5) * S;
    const wave = 0.5 - 0.5 * Math.cos((2 * Math.PI * u) / TILE_W);            // pan and roll
    const step = (v / COURSE) % 1;                                           // each course's lower edge stands proud
    const h = 0.05 + 0.03 * wave + 0.014 * (1 - step);
    pos.setXYZ(i, x0 - u, yEave + v * Math.sin(PITCH) + n.y * h, zEave - sideSign * v * Math.cos(PITCH) + n.z * h);
    geo.attributes.uv.setXY(i, u, v);                                        // metres
  }
  geo.computeVertexNormals();
  // make the normals face up (PlaneGeometry winding flips depending on sideSign)
  const nn = geo.attributes.normal;
  if (nn.getY(0) < 0) { geo.index.array.reverse(); geo.computeVertexNormals(); }
  return new THREE.Mesh(geo, mat);
}

function vergeRow(zEave, zRidge, yEave, sideSign, parent) {
  // barge tiles along the gable edge, one step per 0.235 m course
  const S = Math.abs(zRidge - zEave) / Math.cos(PITCH), count = Math.ceil(S / COURSE);
  const geo = new THREE.BoxGeometry(0.17, 0.075, COURSE + 0.02);
  const inst = new THREE.InstancedMesh(geo, M.jtile, count);
  const d = new THREE.Object3D();
  const n = new THREE.Vector3(0, Math.cos(PITCH), sideSign * Math.sin(PITCH));
  for (let k = 0; k < count; k++) {
    const v = (k + 0.5) * COURSE;
    d.position.set(GX - 0.085, yEave + v * Math.sin(PITCH), zEave - sideSign * v * Math.cos(PITCH)).addScaledVector(n, 0.09);
    d.rotation.set(sideSign * (PITCH + THREE.MathUtils.degToRad(4)), 0, 0);   // extra tilt: the lower edge steps out
    d.updateMatrix();
    inst.setMatrixAt(k, d.matrix);
  }
  est(inst, parent, { edges: false });
}

function buildNeighbour() {
  const g = new THREE.Group(); root.add(g);
  // near eave from the measured verge line
  const a = pxAtX(518, 530, GX), b = pxAtX(615, 495, GX);
  const slope = (b.y - a.y) / Math.abs(b.z - a.z);                            // 0.343 → 18.9°, agrees with 19°
  const zE1 = a.z + (a.y - EAVE_Y) / slope;                                     // ≈ −6.14
  const zR = zE1 - HALF_W, zE2 = zE1 - 2 * HALF_W, yR = EAVE_Y + HALF_W * Math.tan(PITCH);
  g.userData.court = { zE1, zR, zE2, yR, verge: [a, b], slope };

  // roof: two J-tile slopes, underside boards, ridge cap, stepped verge rows
  est(jTileSlope(GX, LENGTH, zE1, zR, EAVE_Y, +1, M.jtile), g);
  est(jTileSlope(GX, LENGTH, zE2, zR, EAVE_Y, -1, M.jtile), g);
  const boardMat = M.timber.clone();
  boardMat.side = THREE.DoubleSide;
  boardMat.onBeforeCompile = M.timber.onBeforeCompile; boardMat.customProgramCacheKey = M.timber.customProgramCacheKey;
  for (const [ze, s] of [[zE1, 1], [zE2, -1]]) {
    // roof boards under the tiles: the soffit seen from under the eave
    const S = HALF_W / Math.cos(PITCH);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(LENGTH, S), boardMat);
    board.rotation.x = -s * (Math.PI / 2 - PITCH);          // plane y → up the slope
    board.position.set(GX - LENGTH / 2, EAVE_Y + (S / 2) * Math.sin(PITCH) - 0.005, ze - s * (S / 2) * Math.cos(PITCH));
    est(board, g);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, LENGTH + 0.1, 12), M.jtile);
  cap.rotation.z = Math.PI / 2; cap.position.set(GX - LENGTH / 2, yR + 0.07, zR);
  est(cap, g);
  vergeRow(zE1, zR, EAVE_Y, +1, g);
  vergeRow(zE2, zR, EAVE_Y, -1, g);

  // walls: white plaster gable with one dark timber post; to its right an opening into a dim storeroom
  const zW1 = zE1 - WALL_INSET, zW2 = zE2 + WALL_INSET;
  const under = (z) => EAVE_Y + (Math.abs(zR - zE1) - Math.abs(z - zR)) * Math.tan(PITCH) - 0.03;
  const post = pxAtX(664, 600, GX);                                             // photo x 657–672
  const zPost = post.z, OPEN_TOP = 1.75;
  const aOf = (z) => -z;                                                        // gable shape x = −z
  const shape = new THREE.Shape();
  shape.moveTo(aOf(zW1), GROUND);
  shape.lineTo(aOf(zPost - 0.06), GROUND);
  shape.lineTo(aOf(zPost - 0.06), OPEN_TOP);
  shape.lineTo(aOf(zW2), OPEN_TOP);
  shape.lineTo(aOf(zW2), under(zW2));
  shape.lineTo(aOf(zR), under(zR));
  shape.lineTo(aOf(zW1), under(zW1));
  shape.closePath();
  const gable = new THREE.Mesh(new THREE.ShapeGeometry(shape), M.plasterFar);
  gable.rotation.y = Math.PI / 2;                 // shape x → world −z, face → +x
  gable.position.x = GX - 0.05;
  est(gable, g);
  est(boxMesh(GX - 0.08, GX + 0.02, GROUND, under(zPost), zPost + 0.06, zPost - 0.06, M.timber), g);        // timber post
  est(boxMesh(GX - 0.08, GX + 0.0, OPEN_TOP, OPEN_TOP + 0.1, zPost - 0.06, zW2, M.timber), g);             // lintel
  est(boxMesh(GX - 0.08, GX + 0.0, GROUND, GROUND + 0.18, zW1, zPost, M.timber), g);                     // sill board
  // long walls and the far gable (hidden)
  est(boxMesh(GX - 0.05, GX - LENGTH, GROUND, under(zW1), zW1, zW1 - 0.1, M.plasterFar), g);
  est(boxMesh(GX - 0.05, GX - LENGTH, GROUND, under(zW2), zW2, zW2 + 0.1, M.plasterFar), g);
  est(boxMesh(GX - LENGTH, GX - LENGTH + 0.1, GROUND, 2.5, zW1, zW2, M.plasterFar), g);

  // dim storeroom behind the opening: dark walls, horizontal beams, shelving, a tub
  est(boxMesh(GX - 0.1, GX - LENGTH + 0.1, GROUND, GROUND + 0.02, zW1, zW2, M.interior), g);
  est(boxMesh(GX - 0.1, GX - LENGTH + 0.1, GROUND, 2.2, zW2 + 0.12, zW2 + 0.1, M.interior), g);
  est(boxMesh(GX - 2.6, GX - 2.7, GROUND, 2.2, zW1, zW2, M.interior), g);                              // partition, closes the view
  for (const [x, y] of [[GX - 0.45, 1.32], [GX - 0.45, 1.95], [GX - 1.35, 1.62]])                     // beams across the room
    est(boxMesh(x - 0.05, x + 0.05, y, y + 0.12, zW1 - 0.1, zW2 + 0.1, M.timber), g);   // stops inside the walls (no z-fighting)
  const zShelf = zW2 + 0.38;
  for (const x of [GX - 0.25, GX - 1.3, GX - 2.4]) est(boxMesh(x - 0.03, x + 0.03, GROUND, 1.3, zShelf - 0.18, zShelf + 0.18, M.shelf), g);
  for (const y of [-0.2, 0.2, 0.6, 1.0]) est(boxMesh(GX - 0.2, GX - 2.45, y, y + 0.03, zShelf - 0.18, zShelf + 0.18, M.shelf), g);
  const rand = rng(53);
  for (let i = 0; i < 9; i++) {                                                  // stored things on the shelves
    const y = [-0.2, 0.2, 0.6, 1.0][i % 4] + 0.03, x = GX - 0.4 - rand() * 1.8;
    const h = 0.12 + rand() * 0.2;
    est(boxMesh(x - 0.12, x + 0.12, y, y + h, zShelf - 0.12, zShelf + 0.12, rand() < 0.5 ? M.shelf : M.interior), g);
  }
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.32, 16), M.shelf);
  tub.position.set(GX - 0.55, GROUND + 0.16, zW2 + 0.75);
  est(tub, g);
  return g;
}

// ---------------------------------------------------------------- foliage helpers
// ovate broadleaf from the painted atlas (cell 3); len = blade length in metres
const ovateLeaf = (len = 0.07) => leafQuad(3, len * 1.25);
function leafMaterial() {
  const atlas = paintedTextures.cached().leaves.map;
  return withAtmos(new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }));
}
function leafCloud(centres, count, spread, geo, mat, colors, rand, parent) {
  const inst = new THREE.InstancedMesh(geo, mat, centres.length * count);
  const d = new THREE.Object3D(), c = new THREE.Color();
  let n = 0;
  for (const [p, r] of centres) {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.8, rand() - 0.5).normalize();
      d.position.copy(p).addScaledVector(dir, (r ?? spread) * Math.cbrt(rand()));
      d.rotation.set(rand() * 6.28, rand() * 6.28, rand() * 6.28);
      d.scale.setScalar(0.8 + rand() * 0.5);
      d.updateMatrix();
      inst.setMatrixAt(n, d.matrix);
      inst.setColorAt(n++, c.set(colors[Math.floor(rand() * colors.length)]));
    }
  }
  inst.count = n;
  est(inst, parent, { edges: false });
  return inst;
}
function tubeMesh(pts, r, mat) {
  // bark UVs in metres: v along the stem (fissures run along it), u around
  const curve = new THREE.CatmullRomCurve3(pts), g = new THREE.TubeGeometry(curve, 12, r, 6), L = curve.getLength(), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 2 * Math.PI * r, uv.getX(i) * L);
  return new THREE.Mesh(g, mat);
}

// ---------------------------------------------------------------- court tree and shrubs (side opening)
// A multi-stem broadleaf between the end wall and the building: trunk near photo x 585–600, crown top near
// photo y 540 → on the plane x = −3.0 that is 1.69 m above our floor (range 1.5–1.9).
function buildCourtTree() {
  const g = new THREE.Group(); root.add(g);
  const rand = rng(7);
  const TX = -3.0;
  const base = pxAtX(592, 700, TX); base.y = GROUND;
  const crownTop = pxAtX(592, 540, TX);
  const mat = leafMaterial();
  const bark = M.bark;
  // one crooked trunk (photo x 585–600) that forks about 1.0 m above the ground into three bending limbs
  const photoPt = (px, py, dx = 0) => pxAtX(px, py, TX + dx);
  const fork = photoPt(590, 640, 0.02);
  const trunk = [base, photoPt(596, 690, -0.04), photoPt(586, 668, 0.05), photoPt(595, 652, -0.02), fork];
  trunk[1].y = Math.max(trunk[1].y, GROUND + 0.35);
  est(tubeMesh(trunk, 0.045, bark), g);
  for (const [pts, r] of [
    [[fork, photoPt(578, 612, 0.08), photoPt(566, 585, -0.05), photoPt(560, 566, 0.1)], 0.026],
    [[fork, photoPt(598, 615, -0.06), photoPt(592, 582, 0.04), photoPt(600, 552, -0.08)], 0.028],
    [[fork, photoPt(606, 622, 0.1), photoPt(620, 598, 0.02), photoPt(626, 578, 0.12)], 0.022],
  ]) est(tubeMesh(pts, r, bark), g);
  // crown: clusters across photo x 560–630, y 540–600, pale (lit, hazy) with greener undersides
  const centres = [];
  for (const [px, py, r] of [[592, 552, 0.22], [572, 565, 0.2], [612, 562, 0.2], [585, 585, 0.22], [620, 590, 0.18], [560, 592, 0.18]])
    centres.push([pxAtX(px, py, TX + (rand() - 0.5) * 0.3), r]);
  leafCloud(centres, 140, 0.2, ovateLeaf(0.06), mat, ['#cfd3b9', '#c3c9a8', '#b1ba92', '#9aa77c', '#dcdcc6'], rand, g);
  // clamp: nothing above the crown-top height
  g.userData.crownTopY = crownTop.y;

  // low shrubs at the left of the opening (photo x 510–580, y 590–720)
  const shrubMat = leafMaterial();
  const shrubs = [];
  // and low foliage filling the lower court behind the priest (photo x ~600–690, y ~625–720)
  for (const [px, py, X, r] of [[520, 660, -1.9, 0.3], [548, 690, -2.1, 0.28], [575, 700, -2.4, 0.26], [530, 610, -2.6, 0.3], [505, 700, -1.7, 0.26],
    [615, 690, -3.3, 0.34], [650, 700, -3.6, 0.34], [685, 690, -3.9, 0.32], [630, 660, -4.1, 0.3], [670, 655, -4.4, 0.3]]) {
    const p = pxAtX(px, py, X);
    shrubs.push([p, r]);
  }
  leafCloud(shrubs, 300, 0.3, ovateLeaf(0.06), shrubMat, ['#33472a', '#3f5530', '#4b6236', '#3a4d2c'], rand, g);   // dense, dark: the photo's lower court
  return g;
}

// ---------------------------------------------------------------- bamboo fence and the hazy tree (corner slot)
// Fence at x = −2.56: vertical bamboo to 0.81 m above our floor, rails at +0.45, +0.14 and −0.17 m.
function buildFence() {
  const g = new THREE.Group(); root.add(g);
  const FX = -2.56, TOP = 0.81, Z0 = -3.3, Z1 = 2.5;
  const PITCH_Z = 0.05;                                   // poles with narrow gaps: the photo shows light between them
  const count = Math.floor((Z1 - Z0) / PITCH_Z);
  const pole = new THREE.CylinderGeometry(0.014, 0.016, TOP - GROUND, 7);
  const inst = new THREE.InstancedMesh(pole, M.bamboo, count);
  const d = new THREE.Object3D(), c = new THREE.Color(), rand = rng(11);
  for (let i = 0; i < count; i++) {
    d.position.set(FX, (TOP + GROUND) / 2 - rand() * 0.02, Z0 + i * PITCH_Z + PITCH_Z / 2);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
    inst.setColorAt(i, c.set(M.bamboo.color).multiplyScalar(0.85 + rand() * 0.3));
  }
  est(inst, g, { edges: false });
  for (const y of [0.45, 0.14, -0.17]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, Z1 - Z0, 8), M.bamboo);
    rail.rotation.x = Math.PI / 2; rail.position.set(FX + 0.035, y, (Z0 + Z1) / 2);
    est(rail, g);
  }
  for (let z = Z0; z <= Z1; z += 1.8) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, TOP - GROUND + 0.05, 8), M.bamboo);
    post.position.set(FX - 0.03, (TOP + GROUND) / 2 + 0.025, z);
    est(post, g);
  }
  return g;
}

function buildSlotTree() {
  // behind the fence, seen through the corner slot (photo x 187–261): backlit, hazy, close to silhouette
  const g = new THREE.Group(); root.add(g);
  const rand = rng(29), X = -4.8;
  const base = pxAtX(222, 790, X); base.y = GROUND;
  const mat = leafMaterial();
  const trunkTop = pxAtX(236, 560, X);
  est(tubeMesh([base, base.clone().lerp(trunkTop, 0.5).add(new THREE.Vector3(0, 0, 0.08)), trunkTop], 0.05, M.bark), g);
  const centres = [];
  for (const [px, py] of [[236, 540], [205, 500], [250, 480], [220, 440], [196, 430], [245, 410], [215, 395], [200, 600], [252, 600]]) {
    const p = pxAtX(px, py, X + (rand() - 0.5) * 0.8);
    est(tubeMesh([trunkTop, trunkTop.clone().lerp(p, 0.5).add(new THREE.Vector3(0, 0.05, 0)), p], 0.012, M.bark), g);
    centres.push([p, 0.35]);
  }
  // backlit: the low sun comes through the leaves, so they glow a little instead of reading as a dark mass
  mat.emissive.set('#e8e4d2'); mat.emissiveIntensity = 0.6;
  leafCloud(centres, 110, 0.35, ovateLeaf(0.07), mat, ['#aeb59c', '#bcc2aa', '#a2ab8d', '#c6cab4'], rand, g);
  // low plants in front of the fence, backlit too (photo x 190–258, y 680–820)
  const plantMat = leafMaterial();
  plantMat.emissive.set('#dfe3c8'); plantMat.emissiveIntensity = 0.45;
  const plants = [];
  for (const [px, py] of [[200, 790], [232, 760], [214, 720], [246, 700], [205, 690]]) plants.push([pxAtX(px, py, -2.35), 0.16]);
  leafCloud(plants, 70, 0.16, ovateLeaf(0.05), plantMat, ['#8f9c6a', '#a2ad7c', '#7f8c5d'], rand, g);
  return g;
}

export function buildCourt() {
  const neighbour = buildNeighbour();
  const tree = buildCourtTree();
  const fence = buildFence();
  const slotTree = buildSlotTree();
  return { neighbour, tree, fence, slotTree };
}
