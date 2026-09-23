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
  // Hanging lantern (tsuri-dōrō): a mostly solid dark silhouette, as in the photo. Envelope kept: 0.27 m across
  // the cap, 0.80 → 1.174 m high, hanging at (3.53, 1.35). The body is narrower (~0.19 m, the photo's ~115 px at
  // that depth), with two small lit panes per face; flared, curled cap with corner pendants; flared base.
  // Outline and size are the measured envelope; the ornament is estimated detail.
  const g = new THREE.Group();
  g.position.set(3.53, 0, 1.35);
  // it hangs free and, in the photo, shows one face square to the lens (two panes side by side, body ~92 px wide)
  g.rotation.y = Math.atan2(LENS.x - 3.53, LENS.z - 1.35);
  root.add(g);
  // vertical layout checked against photo columns: dark mass from photo y 424 (cap peak ≈ 1.165 m) to 612 (base 0.80)
  const iron = M.iron, H0 = 0.80, BASE_TOP = 0.835, BODY_TOP = 1.075, CAP_TOP = 1.165, TOP = 1.235, CAP_HW = 0.135, PANE_Y = 0.955;
  // flared base: a wide foot tapering up into the body
  const base = part(new THREE.CylinderGeometry(0.098 * Math.SQRT2, 0.12 * Math.SQRT2, BASE_TOP - H0, 4), iron, 0, (H0 + BASE_TOP) / 2, 0, g, false);
  base.rotation.y = Math.PI / 4;
  // body: solid, dark
  part(new THREE.BoxGeometry(0.19, BODY_TOP - BASE_TOP, 0.19), iron, 0, (BASE_TOP + BODY_TOP) / 2, 0, g, false);
  // two small lit panes on each face (paper behind a lattice window)
  const paneGeo = new THREE.PlaneGeometry(0.034, 0.058);
  for (let side = 0; side < 4; side++) {
    const a = (side * Math.PI) / 2, nx = Math.sin(a), nz = Math.cos(a);
    for (const off of [-0.035, 0.035]) {
      const pane = new THREE.Mesh(paneGeo, M.lanternPane);
      pane.position.set(nx * 0.0955 + nz * off, PANE_Y, nz * 0.0955 - nx * off);
      pane.rotation.y = a;
      addMesh(pane, true, undefined, g);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.058, 0.004), iron);   // one mullion per pane
      bar.position.copy(pane.position).add(new THREE.Vector3(nx * 0.002, 0, nz * 0.002)); bar.rotation.y = a;
      addMesh(bar, true, undefined, g);
    }
  }
  // flared cap: concave four-sided roof with strongly upturned corners
  const capGeo = new THREE.PlaneGeometry(2, 2, 28, 28);
  const pos = capGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i), v = pos.getY(i), m = Math.max(Math.abs(u), Math.abs(v));
    const y = BODY_TOP + (CAP_TOP - BODY_TOP) * Math.pow(1 - m, 2.2) + 0.045 * Math.pow(Math.abs(u * v), 3);
    pos.setXYZ(i, u * CAP_HW, y, v * CAP_HW);
  }
  capGeo.computeVertexNormals();
  const capMat = iron.clone();
  capMat.side = THREE.DoubleSide;
  capMat.onBeforeCompile = iron.onBeforeCompile; capMat.customProgramCacheKey = iron.customProgramCacheKey;
  part(capGeo, capMat, 0, 0, 0, g, false);
  // curls at the cap corners (warabi-te) and the pendants hanging from them
  const corner = (CAP_HW - 0.008);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.004, 6, 12, Math.PI * 1.4), iron);
    curl.position.set(sx * corner, BODY_TOP + 0.055, sz * corner);
    curl.rotation.set(0, Math.atan2(sx, sz) + Math.PI / 2, 0);
    addMesh(curl, true, undefined, g);
    const pend = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.03, 6), iron);
    pend.position.set(sx * (corner - 0.004), BODY_TOP - 0.005, sz * (corner - 0.004));
    pend.rotation.x = Math.PI;                                     // pointing down
    addMesh(pend, true, undefined, g);
  }
  // finial and the hanging ring (the ring sits just above the 0.37 m envelope, as in the photo), hanger
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
