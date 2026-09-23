import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LENS, VIEW_DIR, VFOV, GROUND } from './config.js';
import { M, CAM_LINE } from './materials.js';
import { root, box, addMesh } from './geometry.js';

function part(geo, mat, x, y, z, parent, est) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  addMesh(m, est, undefined, parent);
  return m;
}
function limb(a, b, r, mat, parent, est) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 0.001), 6, 12), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  addMesh(m, est, undefined, parent);
  return m;
}

// ---------- cushion stack, low table, bowl (measured positions)
export function buildFurniture() {
  const c = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.25, 0.5, 3, 0.05), M.cushion);
  c.position.set(1.30, 0.125, -0.66);
  addMesh(c, false);

  box(2.12, 2.22, 0, 0.25, -1.55, -1.65, M.lacquer);            // front-left leg, measured
  for (const [x, z] of [[2.48, -1.55], [2.12, -1.80], [2.48, -1.80]])
    box(x, x + 0.1, 0, 0.25, z, z - 0.1, M.lacquer, true);      // other legs, estimated
  box(2.1, 2.6, 0.25, 0.28, -1.5, -1.85, M.lacquer);            // top at 0.28 m

  const bowl = new THREE.Group();
  bowl.position.set(2.20, 0.28, -1.75);          // re-measured from the photo (was 2.35, −1.68: hidden behind the near-leaf stile)
  root.add(bowl);
  const prof = [[0, 0], [0.032, 0], [0.034, 0.012], [0.03, 0.014], [0.05, 0.03], [0.06, 0.055], [0.062, 0.075],
    [0.056, 0.075], [0.054, 0.056], [0.045, 0.034], [0.0, 0.028]].map(([r, y]) => new THREE.Vector2(r, y));
  part(new THREE.LatheGeometry(prof, 40), M.bowl, 0, 0, 0, bowl, false);
  const tea = part(new THREE.CircleGeometry(0.053, 32), M.matcha, 0, 0.058, 0, bowl, true);
  tea.rotation.x = -Math.PI / 2;
  bowl.userData.hover = 'bowl';
  return { bowl };
}

// ---------- hanging lantern on its measured viewing ray; depth assumes the veranda edge
export function buildLantern() {
  // Openwork hanging lantern (tsuri-dōrō) inside the measured envelope: 0.27 m wide, 0.80 → 1.17 m high.
  // Posts, base and cap make the silhouette (measured size); slats, rails and finial are estimated detail.
  const g = new THREE.Group();
  g.position.set(3.53, 0, 1.35);
  root.add(g);
  const W = 0.27, H0 = 0.80, BODY_TOP = 1.06, CAP_TOP = 1.13, TOP = 1.17;
  const hw = 0.115, bar = 0.014, iron = M.iron;
  part(new THREE.BoxGeometry(W - 0.02, 0.025, W - 0.02), iron, 0, H0 + 0.0125, 0, g, false);          // base tray
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])                                            // corner posts
    part(new THREE.BoxGeometry(0.018, BODY_TOP - H0, 0.018), iron, x * hw, (H0 + BODY_TOP) / 2, z * hw, g, false);
  // openwork sides: three rails and four slats per side, open between them
  for (const side of [0, 1, 2, 3]) {
    const rot = (side * Math.PI) / 2, s = new THREE.Group();
    s.rotation.y = rot;
    g.add(s);
    for (const y of [H0 + 0.05, (H0 + BODY_TOP) / 2 + 0.02, BODY_TOP - 0.012])
      part(new THREE.BoxGeometry(2 * hw, bar, bar), iron, 0, y, hw, s, true);
    for (let i = 1; i <= 4; i++)
      part(new THREE.BoxGeometry(bar * 0.7, BODY_TOP - H0 - 0.06, bar * 0.7), iron, -hw + (2 * hw * i) / 5, (H0 + BODY_TOP) / 2 + 0.01, hw, s, true);
  }
  // curved cap with upturned corners: concave four-sided roof, corners lifted
  const capGeo = new THREE.PlaneGeometry(2, 2, 24, 24);
  const pos = capGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i), v = pos.getY(i), m = Math.max(Math.abs(u), Math.abs(v));
    const y = BODY_TOP + (CAP_TOP - BODY_TOP) * Math.pow(1 - m, 1.8) + 0.035 * Math.pow(Math.abs(u * v), 4);
    pos.setXYZ(i, u * (W / 2), y, v * (W / 2));
  }
  capGeo.computeVertexNormals();
  const capMat = iron.clone();
  capMat.side = THREE.DoubleSide;
  capMat.onBeforeCompile = iron.onBeforeCompile; capMat.customProgramCacheKey = iron.customProgramCacheKey;
  part(capGeo, capMat, 0, 0, 0, g, false);
  // finial: small bud and the ring the hanger passes through
  part(new THREE.SphereGeometry(0.016, 12, 8), iron, 0, CAP_TOP + 0.012, 0, g, true);
  const ring = part(new THREE.TorusGeometry(0.014, 0.004, 6, 16), iron, 0, TOP - 0.014, 0, g, true);
  ring.rotation.y = Math.PI / 4;
  part(new THREE.CylinderGeometry(0.004, 0.004, 2.75 - TOP, 6), iron, 0, (TOP + 2.75) / 2, 0, g, true);  // hanger up to the eave
  return g;
}

// ---------- Bischof and his Rolleiflex (estimates, anchored on the measured lens)
export function buildBischof() {
  const f = new THREE.Vector3(VIEW_DIR.x, 0, VIEW_DIR.z).normalize();
  const bodyC = LENS.clone().addScaledVector(f, -0.22);
  const person = new THREE.Group();
  person.position.set(bodyC.x, GROUND, bodyC.z);
  person.rotation.y = Math.atan2(f.x, f.z);           // local +z faces the view direction
  root.add(person);

  // standing, ~1.72 m, body 0.22 m behind the lens (local coords: y from the ground, +z forward)
  for (const s of [-1, 1]) {
    part(new RoundedBoxGeometry(0.11, 0.07, 0.26, 2, 0.03), M.shoe, s * 0.1, 0.035, 0.04, person, true);
    limb([s * 0.1, 0.1, 0], [s * 0.1, 0.5, 0.01], 0.065, M.trousers, person, true);
    limb([s * 0.1, 0.5, 0.01], [s * 0.1, 0.9, 0], 0.075, M.trousers, person, true);
  }
  part(new RoundedBoxGeometry(0.38, 0.56, 0.24, 3, 0.09), M.coat, 0, 1.14, 0, person, true);     // torso
  part(new RoundedBoxGeometry(0.4, 0.22, 0.26, 3, 0.09), M.coat, 0, 0.9, 0, person, true);       // hips / coat hem
  limb([0, 1.42, 0], [0, 1.5, 0.02], 0.05, M.skin, person, true);                                // neck
  const head = part(new THREE.SphereGeometry(0.105, 24, 16), M.skin, 0, 1.6, 0.06, person, true); // bowed toward the finder
  head.scale.set(0.92, 1.08, 1);
  const hair = part(new THREE.SphereGeometry(0.108, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, 0, 1.615, 0.04, person, true);
  hair.rotation.x = -0.5;
  const lensLocalY = LENS.y - GROUND;                 // 1.23 m above the estimated ground
  for (const s of [-1, 1]) {
    limb([s * 0.21, 1.38, 0], [s * 0.2, 1.12, 0.06], 0.05, M.coat, person, true);
    limb([s * 0.2, 1.12, 0.06], [s * 0.07, lensLocalY + 0.01, 0.15], 0.044, M.coat, person, true);
    part(new THREE.SphereGeometry(0.035, 12, 8), M.skin, s * 0.065, lensLocalY + 0.01, 0.16, person, true);
  }
  person.userData.hover = 'bischof';

  // Rolleiflex Automat: taking lens at the measured lens position, pitched up 3.7°, no roll
  const cam = new THREE.Group();
  cam.position.copy(LENS);
  cam.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), VIEW_DIR.clone().negate(), new THREE.Vector3(0, 1, 0)));
  root.add(cam);
  // local: +z forward (lens axis), y up. Taking lens centre at the origin.
  part(new RoundedBoxGeometry(0.097, 0.118, 0.085, 2, 0.012), M.camBody, 0, 0.03, -0.055, cam, true);
  part(new THREE.BoxGeometry(0.1, 0.012, 0.088), M.camTrim, 0, 0.095, -0.055, cam, true);
  const hood = part(new THREE.BoxGeometry(0.08, 0.05, 0.075), M.camBody, 0, 0.125, -0.055, cam, true);
  hood.scale.set(1, 1, 1);
  for (const [y, r] of [[0, 0.024], [0.053, 0.022]]) {         // taking lens, viewing lens
    const barrel = part(new THREE.CylinderGeometry(r, r, 0.03, 24), M.camBody, 0, y, 0.0, cam, true);
    barrel.rotation.x = Math.PI / 2;
    const ring = part(new THREE.TorusGeometry(r, 0.003, 8, 24), M.camTrim, 0, y, 0.015, cam, true);
    ring.rotation.set(0, 0, 0);
    const glass = part(new THREE.CircleGeometry(r * 0.72, 24), M.camGlass, 0, y, 0.0155, cam, true);
    glass.rotation.set(0, 0, 0);
  }
  cam.userData.hover = 'rolleiflex';
  return { person, cam };
}

// ---------- Bischof's field of view (shown with "measured vs estimated")
export function buildFrustum() {
  const g = new THREE.Group();
  const t = Math.tan((VFOV * Math.PI) / 360), d = 9, fw = VIEW_DIR.clone(), up = new THREE.Vector3(0, 1, 0);
  const rt = new THREE.Vector3().crossVectors(fw, up).normalize(), u2 = new THREE.Vector3().crossVectors(rt, fw).normalize();
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => LENS.clone().addScaledVector(fw, d).addScaledVector(rt, a * t * d).addScaledVector(u2, b * t * d));
  for (const p of c) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([LENS, p]), CAM_LINE));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([...c, c[0]]), CAM_LINE));
  g.children.forEach((l) => (l.raycast = () => {}));
  return g;
}
