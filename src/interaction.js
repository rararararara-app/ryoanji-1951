import * as THREE from 'three';

// ---------- copy (brief §7, §8)
const BOWL_LINES = [
  'matcha girlie since 1191',
  'L-theanine era, zero crash',
  "the priest's pre-workout",
];

const BISCHOF_HTML = `
<h2>Werner Bischof, 1916–1954</h2>
<p>Swiss photojournalist, the first new photographer to join Magnum's founders, in 1949.</p>
<p>Sent to cover the Korean War in summer 1951, he passed through Japan, was captivated, and stayed almost a year.</p>
<p>Photographer Kimura Ihei guided him through temples and shrines; Kimura later wrote that they became “like brothers”.</p>
<p>He died on 16 May 1954 when his car went into a ravine in the Peruvian Andes. His book <i>Japan</i> appeared just after his death and won the Prix Nadar in 1955.</p>
<p class="note">In this frame: lens 0.68 m above the floor, 7.8 m from the priest.</p>`;

const ROLLEI_HTML = `
<h2>Rolleiflex Automat X (K4/50)</h2>
<p>Twin-lens reflex, made October 1949 to May 1951, the first Automat with flash X-sync.</p>
<p>Zeiss Tessar 75 mm f/3.5, 12 square 6×6 frames per roll of 120 film, shutter 1 s to 1/500, about 965 g, waist-level finder with a sports finder.</p>
<p>You look down into the finder, and the image there is mirrored left to right.</p>`;

const CARDS = { bischof: BISCHOF_HTML, rolleiflex: ROLLEI_HTML };

function shown(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export class Interaction {
  constructor({ camera, dom, targets, isEstimatedView }) {
    this.camera = camera;
    this.dom = dom;
    this.isEstimatedView = isEstimatedView;
    this.targets = targets;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.pointer = null;          // client coords of the last pointer position
    this.dirty = false;
    this.hovered = null;
    this.lastBowl = -1;
    this.viewport = null;
    this.inspectOpen = false;
    this.label = document.getElementById('label');
    this.card = document.getElementById('card');

    // hover objects get their own material copies so emissive brightening stays local
    this.meshes = [];
    for (const [key, group] of Object.entries(targets)) {
      group.userData.hover = key;
      group.traverse((o) => {
        if (!o.isMesh) return;
        const base = o.userData.baseMaterial || o.material;
        const copy = base.clone();
        copy.onBeforeCompile = base.onBeforeCompile;
        copy.customProgramCacheKey = base.customProgramCacheKey;
        if (o.material === base) o.material = copy;
        o.userData.baseMaterial = copy;
        this.meshes.push(o);
      });
    }

    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointer = { x: e.clientX, y: e.clientY };
      this.dirty = true;
    });
    dom.addEventListener('pointerleave', () => { this.pointer = null; this.dirty = true; });
    dom.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    dom.addEventListener('pointerup', (e) => {
      const d = this.down;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
      this.tap(e);
    });

    this.setupInspect();
  }

  setViewport(frame) { this.viewport = frame; this.dirty = true; }

  pick(x, y) {
    let nx, ny;
    if (this.viewport) {
      const { x: fx, y: fy, s } = this.viewport;
      if (x < fx || x > fx + s || y < fy || y > fy + s) return null;
      nx = ((x - fx) / s) * 2 - 1; ny = -((y - fy) / s) * 2 + 1;
    } else { nx = (x / innerWidth) * 2 - 1; ny = -(y / innerHeight) * 2 + 1; }
    this.ndc.set(nx, ny);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.sceneRoots(), true);
    for (const h of hits) {
      if (h.object.isLineSegments || !shown(h.object)) continue;
      let o = h.object;
      while (o && !o.userData.hover) o = o.parent;
      return o ? o.userData.hover : null;      // first visible surface wins: occluders block hover
    }
    return null;
  }

  sceneRoots() {
    let o = this.targets.priest;
    while (o.parent) o = o.parent;
    return o.children;
  }

  tap(e) {
    if (this.inspectOpen) return;
    const key = this.pick(e.clientX, e.clientY);
    if (e.pointerType === 'touch') {
      // first tap shows the label, a second tap on the same object opens the panel
      if (key && key === this.hovered && CARDS[key]) return this.openInspect(key);
      this.pointer = { x: e.clientX, y: e.clientY };
      this.setHover(key);
      return;
    }
    if (key && CARDS[key]) this.openInspect(key);
  }

  setHover(key) {
    if (key === this.hovered) return;
    this.hovered = key;
    for (const m of this.meshes) {
      const mat = m.userData.baseMaterial;
      if (!mat.emissive) continue;
      let o = m; while (o && !o.userData.hover) o = o.parent;
      const on = o && o.userData.hover === key;
      mat.emissive.copy(mat.color).multiplyScalar(on ? 0.28 : 0);
    }
    this.dom.style.cursor = key && CARDS[key] ? 'pointer' : key ? 'help' : '';
    this.label.hidden = this.card.hidden = true;
    if (!key) return;
    if (CARDS[key]) {
      this.card.innerHTML = CARDS[key] + `<p class="more">${matchMedia('(pointer: coarse)').matches ? 'Tap again' : 'Click'} to inspect</p>`;
      this.card.hidden = false;
    } else {
      let text = 'ommmmm';
      if (key === 'bowl') {
        let i; do { i = Math.floor(Math.random() * BOWL_LINES.length); } while (i === this.lastBowl);
        this.lastBowl = i; text = BOWL_LINES[i];
      }
      this.label.textContent = text;
      this.label.hidden = false;
    }
  }

  place() {
    if (!this.pointer) return;
    const { x, y } = this.pointer;
    if (!this.label.hidden) Object.assign(this.label.style, { left: x + 'px', top: y + 'px' });
    if (!this.card.hidden) {
      const r = this.card.getBoundingClientRect(), pad = 16;
      let left = x + 18, top = y + 18;
      if (left + r.width > innerWidth - pad) left = x - r.width - 18;
      if (top + r.height > innerHeight - pad) top = innerHeight - pad - r.height;
      Object.assign(this.card.style, { left: Math.max(pad, left) + 'px', top: Math.max(pad, top) + 'px' });
    }
  }

  clear() { this.setHover(null); }

  update() {
    if (this.dirty && !this.inspectOpen) {
      this.dirty = false;
      this.setHover(this.pointer ? this.pick(this.pointer.x, this.pointer.y) : null);
    }
    this.place();
    if (this.inspectOpen) this.renderInspect();
  }

  // ---------- inspect panel: a render of our own model on the left, text on the right
  setupInspect() {
    this.panel = document.getElementById('inspect');
    this.body = document.getElementById('inspect-body');
    this.canvas = document.getElementById('inspect-canvas');
    document.getElementById('inspect-close').addEventListener('click', () => this.closeInspect());
    this.panel.addEventListener('pointerdown', (e) => { if (e.target === this.panel) this.closeInspect(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.inspectOpen) { e.preventDefault(); this.closeInspect(); } });
  }

  ensurePreview() {
    if (this.pr) return;
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight('#b9c6dd', '#5a4838', 1.4));
    const key = new THREE.DirectionalLight('#ffd09a', 2.6); key.position.set(-2, 3, 2);
    const rim = new THREE.DirectionalLight('#8fb0ff', 1.2); rim.position.set(2, 1.5, -3);
    s.add(key, rim);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    this.pr = { r, s, cam, pivot: new THREE.Group() };
    s.add(this.pr.pivot);
  }

  openInspect(key) {
    this.ensurePreview();
    const { pivot, cam } = this.pr;
    pivot.clear();
    const src = key === 'bischof' ? [this.targets.bischof, this.targets.rolleiflex] : [this.targets.rolleiflex];
    const holder = new THREE.Group();
    for (const obj of src) {
      obj.updateWorldMatrix(true, true);
      const c = obj.clone(true);
      c.visible = true;
      obj.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      // clone() JSON-copies userData, so take materials from the source meshes, in traversal order
      const nodes = [];
      obj.traverse((o) => nodes.push(o));
      let i = 0;
      c.traverse((o) => {
        const so = nodes[i++];
        o.visible = !o.isLineSegments;
        if (o.isMesh) o.material = so.userData.baseMaterial || so.material;
      });
      holder.add(c);
    }
    // face the viewer: undo the scene yaw of Bischof's stance
    const yaw = this.targets.bischof.rotation.y;
    holder.rotation.y = -yaw;
    const wrap = new THREE.Group(); wrap.add(holder);
    const b = new THREE.Box3().setFromObject(wrap), c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
    holder.position.sub(c);
    pivot.add(wrap);
    this.fit = size;
    this.fitAspect = 0;             // recompute framing on the next render
    // restore normal (non-hover) look in the preview
    for (const m of this.meshes) m.userData.baseMaterial.emissive?.setScalar(0);
    this.hovered = null;
    this.label.hidden = this.card.hidden = true;

    this.body.innerHTML = CARDS[key].replace('<h2>', '<h2 id="inspect-title">');
    this.lastFocus = document.activeElement;
    this.panel.hidden = false;
    this.inspectOpen = true;
    this.t0 = performance.now();
    document.getElementById('inspect-close').focus();
  }

  closeInspect() {
    this.panel.hidden = true;
    this.inspectOpen = false;
    this.dirty = true;
    this.lastFocus?.focus?.();
  }

  renderInspect() {
    const { r, s, cam, pivot } = this.pr;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.floor(w * r.getPixelRatio()) || this.canvas.height !== Math.floor(h * r.getPixelRatio())) r.setSize(w, h, false);
    if (this.fitAspect !== w / h) {
      // fit the turntable's bounding radius to the canvas, whichever way it is narrower
      this.fitAspect = cam.aspect = w / h;
      cam.updateProjectionMatrix();
      const rad = Math.hypot(Math.max(this.fit.x, this.fit.z) / 2, this.fit.y / 2);
      const tv = Math.tan((cam.fov * Math.PI) / 360), th = tv * cam.aspect;
      const d = (rad / Math.min(tv, th)) * 1.08;
      cam.position.set(0, d * 0.1, d);
      cam.lookAt(0, 0, 0);
    }
    pivot.rotation.y = Math.sin((performance.now() - this.t0) / 2600) * 0.9;
    r.render(s, cam);
  }
}
