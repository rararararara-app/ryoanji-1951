import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LENS, VIEW_DIR, VFOV, GROUND } from './config.js';
import { atmos, makeSky, ZONES, applyZones } from './atmosphere.js';
import { M } from './materials.js';
import { applyTextures } from './textures.js';
import { root, buildArchitecture, setEstimatedView, updateCutaway } from './geometry.js';
import { buildFurniture, buildLantern, buildBischof, buildFrustum } from './props.js';
import { buildPriest } from './priest.js';
import { buildLights, buildGodRay } from './lighting.js';
import { Interaction } from './interaction.js';
import { Soundscape } from './audio.js';
import { DriftingLeaves } from './leaves.js';
import { buildMaple } from './foliage.js';
import { buildCourt } from './court.js';
import { buildStage, SLAB } from './stage.js';
import { Evidence } from './evidence.js';

const params = new URLSearchParams(location.search);
const DEV = params.has('dev');
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

// ---------- renderer, scene, camera
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.domElement.id = 'scene';
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor('#1d232c');   // letterbox around the POV frame
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.add(root);
scene.add(makeSky());

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
camera.position.set(1.2, 1.3, 7.0);              // starts framed on the veranda, not the roof (left of the maple trunk)
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(2.7, 0.45, 0.2);
Object.assign(controls, {
  enableDamping: true, dampingFactor: 0.08, zoomSpeed: 1.6, screenSpacePanning: true,
  minDistance: 0.6, maxDistance: 20, maxPolarAngle: Math.PI * 0.53,
});
if (innerWidth < innerHeight) {   // portrait: step back so the room fits the narrow frame
  camera.position.sub(controls.target).multiplyScalar(1.45).add(controls.target);
}

// ---------- world (textures first: hover and cutaway clone materials when objects are built)
applyTextures(M, renderer);
buildArchitecture();
const stage = buildStage();
const plants = stage.plants;
const court = buildCourt();
const priest = buildPriest();
const { bowl } = buildFurniture();
buildLantern();
const maple = buildMaple();
const { person: bischof, cam: rolleiflex } = buildBischof();
const frustum = buildFrustum();
frustum.visible = false;
scene.add(frustum);
const lights = buildLights(scene, { shadowSize: mobile ? 1024 : 2048 });
const godRay = buildGodRay();
scene.add(godRay);
const leaves = new DriftingLeaves(mobile ? 45 : 80);   // sparse
scene.add(leaves.mesh);

// ---------- UI state
const $ = (id) => document.getElementById(id);
const btnPov = $('btn-pov'), btnEst = $('btn-est'), btnSound = $('btn-sound');
const photo = $('photo'), overlay = $('overlay');
let pov = false, estView = false, saved = null;

const sound = new Soundscape('audio/');
const interaction = new Interaction({
  camera, dom: renderer.domElement, targets: { priest, bowl, bischof, rolleiflex },
  isEstimatedView: () => estView,
});

btnPov.addEventListener('click', () => setPov(!pov));
function setPov(on) {
  pov = on;
  btnPov.setAttribute('aria-pressed', on);
  btnPov.textContent = on ? 'Back to free view' : "View through Bischof's camera";
  document.body.classList.toggle('pov', on);
  photo.hidden = !(on && DEV);
  bischof.visible = rolleiflex.visible = !on;      // the lens sits inside the camera model
  frustum.visible = estView && !on;
  if (on) {
    saved = { p: camera.position.clone(), t: controls.target.clone(), f: camera.fov };
    controls.enabled = false;
    camera.position.copy(LENS);
    camera.up.set(0, 1, 0);
    camera.lookAt(LENS.clone().add(VIEW_DIR));
    camera.fov = VFOV;
    sound.onPov();
  } else {
    controls.enabled = true;
    camera.position.copy(saved.p);
    controls.target.copy(saved.t);
    camera.fov = saved.f;
  }
  interaction.clear();
  resize();
}

btnEst.addEventListener('click', () => {
  estView = !estView;
  btnEst.setAttribute('aria-pressed', estView);
  setEstimatedView(estView);
  $('legend').hidden = !estView;
  document.body.classList.toggle('legend-open', estView);
  frustum.visible = estView && !pov;
  interaction.clear();
});

btnSound.addEventListener('click', async () => {
  const on = await sound.toggle();
  btnSound.setAttribute('aria-pressed', on);
  btnSound.textContent = on ? 'Sound: on' : 'Sound: off';
  btnSound.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
});

if (DEV) {
  $('dev').hidden = false;
  // served by the dev server only (vite.config.js); a static build has no photo, so the slider goes away
  photo.onerror = () => (overlay.closest('label').hidden = true);
  photo.src = 'reference/bischof-ryoanji-1951.jpg';
  overlay.addEventListener('input', () => (photo.style.opacity = overlay.value));
  photo.style.opacity = overlay.value;
  $('atmos-off').addEventListener('change', (e) => {
    atmos.uAtmosEnabled.value = e.target.checked ? 0 : 1;
    godRay.visible = leaves.mesh.visible = !e.target.checked;
  });
  Object.assign(window, { THREE, scene, camera, controls, renderer, setPov, interaction, lights, M, atmos, godRay, court, ZONES, applyZones });
  import('./devcheck.js').then(({ installDevCheck }) => {
    const dc = installDevCheck({ scene, camera, renderer, setPov, photo, out: $('dev-out'), viewUpdate });
    $('region-check').addEventListener('click', () => console.table(dc.print()));
  });
}

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.defaultPrevented && pov && !evidence.active) setPov(false);
});

// ---------- layout: POV is a square frame, letterboxed
let frame = { x: 0, y: 0, s: 0 };
let frameOverride = null;   // the evidence layer can shrink the POV frame (vanishing points off-frame)
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  if (pov) {
    frame = frameOverride ? frameOverride(w, h) : (() => { const s = Math.floor(Math.min(w, h) * 0.94); return { x: Math.floor((w - s) / 2), y: Math.floor((h - s) / 2), s }; })();
    const { x, y, s } = frame;
    camera.aspect = 1;
    Object.assign(photo.style, { left: x + 'px', top: y + 'px', width: s + 'px', height: s + 'px' });
  } else camera.aspect = w / h;
  camera.updateProjectionMatrix();
  interaction.setViewport(pov ? frame : null);
}
addEventListener('resize', resize);
resize();

// ---------- evidence layer (research mode)
const evidence = new Evidence({
  scene, camera, controls, renderer, court, setPov, isPov: () => pov, relayout: resize, getFrame: () => frame,
  setFrameOverride: (fn) => { frameOverride = fn; resize(); },
  onChange: (on) => { $('btn-evidence').setAttribute('aria-pressed', on); interaction.clear(); },
});
$('btn-evidence').addEventListener('click', () => (evidence.active ? evidence.close() : evidence.open()));
if (DEV) window.evidence = evidence;

// ---------- camera limits: roughly 10–20 m around the room, never under the ground
// the target stays inside the stage slab; the camera stays 0.3 m above it and below y 6
const tMin = new THREE.Vector3(SLAB.x0, GROUND, SLAB.z0), tMax = new THREE.Vector3(SLAB.x1, 3.2, SLAB.z1);
function clampCamera() {
  controls.target.clamp(tMin, tMax);
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, GROUND + 0.3, 6);
}

// camera-dependent state, shared by the loop and the ?dev region check
function viewUpdate() {
  updateCutaway(camera, estView);
  // depth bands follow the subject: the veranda stays clean, the room cools, the court hazes out
  const subject = pov ? 7.8 : camera.position.distanceTo(controls.target);
  atmos.uAtmosStart.value = Math.max(3, subject - 3.5);
  atmos.uAtmosFar.value = atmos.uAtmosStart.value + 15;
  atmos.uZoneMode.value = pov ? 1 : 0;   // POV grades by region (fragment position); free view by the camera's zone
}

// ---------- loop
const clock = new THREE.Clock();
let frames = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (!pov) { controls.update(); clampCamera(); }
  viewUpdate();
  godRay.material.uniforms.uTime.value = t;
  leaves.update(dt, t, pov);
  maple.update(t, leaves.gust);
  for (let i = 0; i < plants.length; i++) plants[i].rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.03 * leaves.gust;
  interaction.update();
  evidence.update(dt);

  if (pov) {
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    const y = innerHeight - frame.y - frame.s;
    renderer.setScissor(frame.x, y, frame.s, frame.s);
    renderer.setViewport(frame.x, y, frame.s, frame.s);
  } else {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
  }
  renderer.render(scene, camera);
  if (++frames === 3) {
    const done = () => $('loader')?.classList.add('done');
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(done);
  }
});
