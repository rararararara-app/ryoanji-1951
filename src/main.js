import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LENS, VIEW_DIR, VFOV, GROUND } from './config.js';
import { atmos, makeSky } from './atmosphere.js';
import { root, buildArchitecture, setEstimatedView, updateCutaway } from './geometry.js';
import { buildPriest, buildFurniture, buildLantern, buildBischof, buildFrustum } from './props.js';
import { buildLights, buildGodRay } from './lighting.js';
import { Interaction } from './interaction.js';
import { Soundscape } from './audio.js';
import { Petals } from './petals.js';

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
renderer.setClearColor('#1d232c');
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.add(root);
scene.add(makeSky());

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
camera.position.set(10.2, 2.6, 8.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(2.2, 0.6, -1.2);
Object.assign(controls, {
  enableDamping: true, dampingFactor: 0.08, zoomSpeed: 1.6, screenSpacePanning: true,
  minDistance: 0.6, maxDistance: 20, maxPolarAngle: Math.PI * 0.53,
});
if (innerWidth < innerHeight) {   // portrait: step back so the room fits the narrow frame
  camera.position.sub(controls.target).multiplyScalar(1.45).add(controls.target);
}

// ---------- world
const { plants } = buildArchitecture();
const priest = buildPriest();
const { bowl } = buildFurniture();
buildLantern();
const { person: bischof, cam: rolleiflex } = buildBischof();
const frustum = buildFrustum();
frustum.visible = false;
scene.add(frustum);
buildLights(scene, { shadowSize: mobile ? 1024 : 2048 });
const godRay = buildGodRay();
scene.add(godRay);
const petals = new Petals(mobile ? 90 : 170);
scene.add(petals.mesh);

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
    godRay.visible = petals.mesh.visible = !e.target.checked;
  });
  Object.assign(window, { THREE, scene, camera, controls, renderer, setPov, interaction });
}

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.defaultPrevented && pov) setPov(false);
});

// ---------- layout: POV is a square frame, letterboxed
let frame = { x: 0, y: 0, s: 0 };
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  if (pov) {
    const s = Math.floor(Math.min(w, h) * 0.94), x = Math.floor((w - s) / 2), y = Math.floor((h - s) / 2);
    frame = { x, y, s };
    camera.aspect = 1;
    Object.assign(photo.style, { left: x + 'px', top: y + 'px', width: s + 'px', height: s + 'px' });
  } else camera.aspect = w / h;
  camera.updateProjectionMatrix();
  interaction.setViewport(pov ? frame : null);
}
addEventListener('resize', resize);
resize();

// ---------- camera limits: roughly 10–20 m around the room, never under the ground
const tMin = new THREE.Vector3(-7, GROUND + 0.1, -9), tMax = new THREE.Vector3(14, 3.2, 9);
function clampCamera() {
  controls.target.clamp(tMin, tMax);
  const floor = GROUND + 0.25;
  if (camera.position.y < floor) camera.position.y = floor;
}

// ---------- loop
const clock = new THREE.Clock();
let frames = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (!pov) { controls.update(); clampCamera(); }
  updateCutaway(camera, estView);
  // depth bands follow the subject: the veranda stays clean, the room cools, the court hazes out
  const subject = pov ? 7.8 : camera.position.distanceTo(controls.target);
  atmos.uAtmosStart.value = Math.max(3, subject - 3.5);
  atmos.uAtmosFar.value = atmos.uAtmosStart.value + 15;
  godRay.material.uniforms.uTime.value = t;
  petals.update(dt, t, pov);
  for (let i = 0; i < plants.length; i++) plants[i].rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.03 * petals.gust;
  interaction.update();

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
    const done = () => $('loader').classList.add('done');
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(done);
  }
});
