import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LENS, VIEW_DIR, VFOV, SUN_DIR, KAMOI, KEN } from './config.js';
import { registry } from './geometry.js';

// Evidence layer (research mode): a stepper through how the reconstruction was measured. Each step moves the camera,
// shows its evidence in 3D (or on the photo plane), and one caption line with the numbers. Slide palette.
const C = { facade: '#ff5a1f', depth: '#2ea3ff', vertical: '#ffffff', horizon: '#ff2d55', rejected: '#c653ff', sun: '#ffc46b' };
const PHOTO_W = 1140, PHOTO_H = 1142;
const VP_FACADE = [-777, 674], VP_DEPTH = [2475, 674], HORIZON_Y = 674;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Evidence {
  constructor(ctx) {
    this.ctx = ctx;                       // { scene, camera, controls, renderer, setPov, isPov, setFrameOverride, getFrame, onChange }
    this.active = false;
    this.step = 0;
    this.group = new THREE.Group();
    this.group.visible = false;
    ctx.scene.add(this.group);
    this.lineMats = [];
    this.labels = [];
    this.goal = null;
    this.buildDom();
    this.steps = this.defineSteps();
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'ArrowRight') this.go(this.step + 1);
      else if (e.key === 'ArrowLeft') this.go(this.step - 1);
    });
  }

  // ---------------------------------------------------------------- DOM
  buildDom() {
    const $ = (id) => document.getElementById(id);
    this.panel = $('evidence');
    this.titleEl = $('ev-title');
    this.captionEl = $('ev-caption');
    this.noteEl = $('ev-note');
    this.counter = $('ev-count');
    this.labelLayer = $('ev-labels');
    this.svg = $('ev-svg');
    $('ev-prev').addEventListener('click', () => this.go(this.step - 1));
    $('ev-next').addEventListener('click', () => this.go(this.step + 1));
    $('ev-close').addEventListener('click', () => this.close());
  }

  // ---------------------------------------------------------------- primitives
  line(points, color, width = 2.5, opts = {}) {
    const g = new LineGeometry();
    g.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
    const m = new LineMaterial({ color, linewidth: width, transparent: true, opacity: opts.opacity ?? 0.95, depthTest: opts.depthTest ?? true, dashed: !!opts.dashed, dashSize: 0.08, gapSize: 0.05 });
    const l = new Line2(g, m);
    if (opts.dashed) l.computeLineDistances();
    l.renderOrder = 20;
    l.raycast = () => {};
    this.lineMats.push(m);
    this.stepGroup.add(l);
    return l;
  }
  plane(w, h, color, opacity, pos, rot, depthTest = true) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, depthTest }));
    m.position.copy(pos); if (rot) m.rotation.set(...rot);
    m.renderOrder = 19; m.raycast = () => {};
    this.stepGroup.add(m);
    return m;
  }
  label(pos, text, color = '#fff', cls = '') {
    const el = document.createElement('div');
    el.className = 'ev-label ' + cls;
    el.textContent = text;
    el.style.borderColor = color;
    el.style.color = color === '#ffffff' ? '#fff' : color;
    this.labelLayer.appendChild(el);
    this.labels.push({ el, pos: pos.clone() });
  }
  dimension(a, b, color, text, tick = V(0, 0.06, 0)) {
    this.line([a, b], color, 2.5, { depthTest: false });
    for (const p of [a, b]) this.line([p.clone().sub(tick), p.clone().add(tick)], color, 2.5, { depthTest: false });
    this.label(a.clone().lerp(b, 0.5), text, color);
  }

  // model edges of axis-aligned boxes, sorted into the three line families
  boxEdges() {
    const out = { x: [], y: [], z: [] }, bb = new THREE.Box3();
    const inArea = (b) => b.max.x > -0.2 && b.min.x < 6.1 && b.max.z > -5.0 && b.min.z < 1.45 && b.min.y > -0.25 && b.max.y < 2.65;
    for (const m of [...registry.measured, ...registry.estimated]) {
      if (!m.geometry || m.geometry.type !== 'BoxGeometry' || !m.visible) continue;
      m.updateWorldMatrix(true, false);
      bb.setFromObject(m);
      if (!inArea(bb)) continue;
      const s = bb.getSize(new THREE.Vector3());
      const thin = [s.x, s.y, s.z].filter((v) => v < 0.03).length >= 2;
      if (thin && m.userData.estimated) continue;                 // kumiko and lattice bars: pattern, not structure
      const { min: a, max: b } = bb;
      if (s.x > 0.3) for (const [y, z] of [[a.y, a.z], [a.y, b.z], [b.y, a.z], [b.y, b.z]]) out.x.push([V(a.x, y, z), V(b.x, y, z)]);
      if (s.z > 0.3) for (const [x, y] of [[a.x, a.y], [a.x, b.y], [b.x, a.y], [b.x, b.y]]) out.z.push([V(x, y, a.z), V(x, y, b.z)]);
      if (s.y > 0.5 && !thin) for (const [x, z] of [[a.x, a.z], [a.x, b.z], [b.x, a.z], [b.x, b.z]]) out.y.push([V(x, a.y, z), V(x, b.y, z)]);
    }
    return out;
  }
  // nudge an edge 1 cm toward the lens so it wins the depth test against the surface it lies on
  toward(p, cam) { return p.clone().add(cam.clone().sub(p).normalize().multiplyScalar(0.01)); }

  // ---------------------------------------------------------------- photo-plane (SVG) drawing, in photo px
  photoToScreen([px, py]) {
    const f = this.ctx.getFrame();
    return [f.x + (px / PHOTO_W) * f.s, f.y + (py / PHOTO_H) * f.s];
  }
  worldToPhoto(p) {
    const q = p.clone().project(this.ctx.camera);
    return [((q.x + 1) / 2) * PHOTO_W, ((1 - q.y) / 2) * PHOTO_H];
  }
  svgClear() { this.svg.innerHTML = ''; }
  svgLine(a, b, color, w = 1.5, dash = '') {
    const [x1, y1] = this.photoToScreen(a), [x2, y2] = this.photoToScreen(b);
    this.svg.insertAdjacentHTML('beforeend', `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-opacity="0.9"/>`);
  }
  svgDot(p, color, r = 6, text = '', dx = 10, dy = -10) {
    const [x, y] = this.photoToScreen(p);
    this.svg.insertAdjacentHTML('beforeend', `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="2" fill="${color}"/>` +
      (text ? `<text x="${x + dx}" y="${y + dy}" fill="${color}" font-size="12" font-family="Zen Kaku Gothic New, system-ui, sans-serif">${text}</text>` : ''));
  }
  svgFrame(color = 'rgba(255,255,255,.55)') {
    const [x0, y0] = this.photoToScreen([0, 0]), [x1, y1] = this.photoToScreen([PHOTO_W, PHOTO_H]);
    this.svg.insertAdjacentHTML('beforeend', `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="${color}" stroke-width="1"/>`);
  }

  // ---------------------------------------------------------------- steps
  defineSteps() {
    const lensFree = (p, t) => ({ pov: false, pos: V(...p), target: V(...t) });
    return [
      {
        title: '01 Line families', view: { pov: true },
        caption: 'Photo: 54 facade / 13 depth / 17 vertical segments (Hough, slides 01–02). Here: the model’s own edges, sorted the same way.',
        build: () => {
          const e = this.boxEdges(), cam = LENS;
          for (const [a, b] of e.x) this.line([this.toward(a, cam), this.toward(b, cam)], C.facade, 2);
          for (const [a, b] of e.z) this.line([this.toward(a, cam), this.toward(b, cam)], C.depth, 2);
          for (const [a, b] of e.y) this.line([this.toward(a, cam), this.toward(b, cam)], C.vertical, 1.5, { opacity: 0.8 });
        },
      },
      {
        title: '02 Vanishing points', view: { pov: true, wide: true },
        caption: 'Facade VP (−777, 674) · depth VP (2475, 674) · horizon y = 674 · f ≈ 1600 px, 75 mm Tessar on 6×6',
        note: 'model edges extended; photo segments in slides 02–03',
        svg: () => {
          const e = this.boxEdges();
          const pick = (list, n) => list.map(([a, b]) => [this.worldToPhoto(a), this.worldToPhoto(b)])
            .filter(([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1]) > 60).sort((p, q) => Math.hypot(q[0][0] - q[1][0], q[0][1] - q[1][1]) - Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1])).slice(0, n);
          const extend = ([a, b], vpx) => {                          // extend the edge's own line to the VP's x
            const t = (vpx - a[0]) / (b[0] - a[0]);
            return [a, [vpx, a[1] + t * (b[1] - a[1])]];
          };
          this.svgLine([-900, HORIZON_Y], [2600, HORIZON_Y], C.horizon, 2);
          for (const seg of pick(e.x, 22)) { const [p, q] = extend(seg, VP_FACADE[0]); this.svgLine(seg[1][0] > seg[0][0] ? seg[1] : seg[0], q, C.facade, 1); }
          for (const seg of pick(e.z, 12)) { const [p, q] = extend(seg, VP_DEPTH[0]); this.svgLine(seg[1][0] < seg[0][0] ? seg[1] : seg[0], q, C.depth, 1); }
          this.svgFrame();
          this.svgDot(VP_FACADE, C.facade, 7, 'facade VP (−777, 674)', 10, -12);
          this.svgDot(VP_DEPTH, C.depth, 7, 'depth VP (2475, 674)', -150, -12);
          const [, hy] = this.photoToScreen([0, HORIZON_Y]);
          this.svg.insertAdjacentHTML('beforeend', `<text x="${this.photoToScreen([PHOTO_W / 2, 0])[0] - 40}" y="${hy + 16}" fill="${C.horizon}" font-size="12" font-family="system-ui">horizon y 674</text>`);
        },
      },
      {
        title: '03 Lens height', view: lensFree([8.8, 2.4, 5.2], [1.8, 0.7, -1.6]),
        caption: 'horizon = lens height, 0.68 m (40% and 36% of the openings)',
        build: () => {
          const y = LENS.y;
          this.plane(9.5, 9, C.horizon, 0.18, V(2.6, y, -1.2), [-Math.PI / 2, 0, 0]);
          this.line([V(-2, y, 0.06), V(7, y, 0.06)], C.horizon, 2.5);                         // across the facade and the near leaf
          this.line([V(0.06, y, 1.3), V(0.06, y, -5)], C.horizon, 2.5);                       // along the end wall, through the side opening
          this.line([LENS, LENS.clone().addScaledVector(V(VIEW_DIR.x, 0, VIEW_DIR.z).normalize(), 5.5)], C.horizon, 1.5, { dashed: true });
          this.label(V(4.2, y + 0.08, 0.1), '0.68 m on the near leaf', C.horizon);
          this.label(V(0.1, y + 0.08, -2.7), '0.68 m in the side opening', C.horizon);
          this.label(LENS.clone().add(V(0, 0.12, 0)), 'lens 0.68 m', C.horizon);
        },
      },
      {
        title: '04 Scale', view: lensFree([5.6, 2.1, 1.25], [0.9, 1.0, -1.9]),
        caption: 'kamoi 1.77 m is the anchor · side opening 1.95 m and first bay 1.94 m are independent checks · 1 ken = 1.97 m',
        build: () => {
          this.dimension(V(3.2, 0, 0.14), V(3.2, KAMOI, 0.14), C.vertical, 'kamoi 1.77 m (anchor)', V(0.06, 0, 0));
          this.dimension(V(0.14, 1.95, -1.71), V(0.14, 1.95, -3.66), C.depth, 'side opening 1.95 m (check)', V(0, 0.06, 0));
          this.dimension(V(0, 2.0, 0.16), V(1.94, 2.0, 0.16), C.facade, 'first bay 1.94 m (check)');
          this.dimension(V(0, 0.02, 1.0), V(KEN, 0.02, 1.0), C.facade, '1 ken = 1.97 m (Kyōma)', V(0, 0, 0.06));
        },
      },
      {
        title: '05 Camera', view: lensFree([10.5, 5.2, 7.5], [3.2, 0.3, -0.6]),
        caption: 'lens (6.12, 0.68, 3.05) · 40.0° off the facade, 3.7° up · 7.8 m to the priest · 1.70 m outside the veranda edge',
        build: () => {
          const t = Math.tan((VFOV * Math.PI) / 360), d = 9, fw = VIEW_DIR.clone();
          const rt = V().crossVectors(fw, V(0, 1, 0)).normalize(), up = V().crossVectors(rt, fw).normalize();
          const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => LENS.clone().addScaledVector(fw, d).addScaledVector(rt, a * t * d).addScaledVector(up, b * t * d));
          for (const c of cs) this.line([LENS, c], C.vertical, 1.2, { opacity: 0.6 });
          this.line([...cs, cs[0]], C.vertical, 1.2, { opacity: 0.6 });
          const priest = V(0.43, 0.3, -2.28), edge = V(LENS.x, LENS.y, 1.35);
          this.line([LENS, priest], C.depth, 2.5, { depthTest: false });
          this.label(LENS.clone().lerp(priest, 0.55), '7.8 m to the priest', C.depth);
          this.line([LENS, edge], C.facade, 3, { depthTest: false });
          this.line([edge.clone().add(V(-0.3, 0, 0)), edge.clone().add(V(0.3, 0, 0))], C.facade, 2, { depthTest: false });
          this.label(LENS.clone().lerp(edge, 0.5).add(V(0.05, 0.1, 0)), '1.70 m outside the veranda edge', C.facade);
        },
      },
      {
        title: '06 Sun', view: lensFree([6.5, 3.4, 4.2], [0.4, 0.2, -1.2]),
        caption: 'sun about 40° (jamb shadows 37–41°, tatami fit 41–45°), two patches reproduced: corner slot → veranda, side opening → tatami',
        build: () => {
          const ray = (p) => this.line([p.clone().addScaledVector(SUN_DIR, 4.2), p], C.sun, 1.8, { opacity: 0.85, depthTest: false });   // through walls: they are light paths
          for (const p of [V(0.99, 0, 0.5), V(0.75, 0, 0.32), V(1.2, 0, 0.75), V(0.55, 0, 0.12)]) ray(p);
          for (const p of [V(1.0, 0, -2.0), V(0.75, 0, -2.6), V(1.35, 0, -1.55), V(0.5, 0, -2.9), V(1.6, 0, -1.2)]) ray(p);
          this.label(V(0.9, 0.05, 0.45), 'veranda patch (corner slot)', C.sun);
          this.label(V(1.0, 0.05, -2.1), 'lit tatami (side opening)', C.sun);
          this.label(V(0.99, 0, 0.5).addScaledVector(SUN_DIR, 4.2), 'toward the sun, 40°', C.sun);
        },
      },
      {
        title: '07 Corrections', view: { pov: true },
        caption: 'measurement replaced by better measurement: the VP at (397, 878) had 3 supporting segments; the opening is in the side wall, not a rear wall',
        note: 'violet = rejected; the 3 segments are drawn to show the idea (the real ones are in slide 06)',
        build: () => {
          this.plane(5.9, 1.77, C.rejected, 0.22, V(2.95, KAMOI / 2, -4.9), null, false);   // a ghost: drawn through the leaves
          const rw = [V(0, 0, -4.9), V(5.9, 0, -4.9), V(5.9, KAMOI, -4.9), V(0, KAMOI, -4.9)];
          this.line([...rw, rw[0]], C.rejected, 2, { depthTest: false, dashed: true });
          this.label(V(3.6, 1.2, -4.9), 'rejected: a “rear wall” opening', C.rejected);
          const o = [V(0.06, 0, -1.71), V(0.06, KAMOI, -1.71), V(0.06, KAMOI, -3.66), V(0.06, 0, -3.66)];
          this.line([...o, o[0]], C.depth, 3, { depthTest: false });
          this.label(V(0.08, 1.1, -2.7), 'real: side (end) wall opening, 1 ken', C.depth);
        },
        svg: () => {
          const vp = [397, 878];
          for (const [a, t] of [[[150, 1020], 0.62], [[720, 1100], 0.55], [[1020, 1000], 0.5]]) this.svgLine(a, [a[0] + (vp[0] - a[0]) * t, a[1] + (vp[1] - a[1]) * t], C.rejected, 3);
          for (const a of [[150, 1020], [720, 1100], [1020, 1000]]) this.svgLine(a, vp, C.rejected, 1, '4 4');
          this.svgDot(vp, C.rejected, 8, 'rejected VP (397, 878)', 12, -12);
        },
      },
      {
        title: '08 Priest', view: lensFree([2.6, 1.6, -0.3], [0.45, 0.2, -2.3]),
        caption: 'facing 50° toward the facade, back to the room · head 10 px left of the back’s peak; crown faces the camera',
        build: () => {
          const c = V(0.43, 0.02, -2.28), f = V(Math.cos((50 * Math.PI) / 180), 0, Math.sin((50 * Math.PI) / 180));
          const tip = c.clone().addScaledVector(f, 0.9);
          this.line([c, tip], C.vertical, 3, { depthTest: false });
          const side = V(-f.z, 0, f.x);
          this.line([tip, tip.clone().addScaledVector(f, -0.12).addScaledVector(side, 0.07)], C.vertical, 3, { depthTest: false });
          this.line([tip, tip.clone().addScaledVector(f, -0.12).addScaledVector(side, -0.07)], C.vertical, 3, { depthTest: false });
          this.line([c, c.clone().add(V(0.9, 0, 0))], C.facade, 1.5, { dashed: true, depthTest: false });
          this.label(tip.clone().add(V(0, 0.06, 0)), '50° toward the facade', C.vertical);
          this.line([c, V(LENS.x, 0.02, LENS.z)], C.depth, 1.2, { dashed: true, depthTest: false, opacity: 0.7 });
          this.label(c.clone().add(V(0, 0.5, 0)), 'body centre (0.43, −2.28), top of back 0.44 m', C.vertical);
        },
      },
      {
        title: '09 Court', view: lensFree([-1.2, 1.6, -2.2], [-6.2, 1.9, -7.6]),
        caption: 'depth from the JIS 53A tile course (235 mm): gable at x −5.7, range −5.7 to −7.2 shown · verge through photo px (518, 530) and (615, 495)',
        build: () => {
          const court = this.ctx.court.neighbour.userData.court, [a, b] = court.verge;
          const dir = b.clone().sub(a).normalize(), e0 = a.clone().addScaledVector(dir, -0.35), e1 = b.clone().addScaledVector(dir, 0.6);
          this.line([e0, e1], C.facade, 3, { depthTest: false });
          for (const p of [a, b]) this.line([p.clone().add(V(0, -0.05, 0)), p.clone().add(V(0, 0.05, 0))], C.vertical, 3, { depthTest: false });
          this.label(a.clone().add(V(0, -0.15, 0)), 'px (518, 530)', C.vertical);
          this.label(b.clone().add(V(0, 0.12, 0)), 'px (615, 495)', C.vertical);
          for (let s = 0; s < 1.6; s += 0.235) {                     // tile steps along the verge
            const p = e0.clone().addScaledVector(dir, s + 0.2);
            this.line([p, p.clone().add(V(0, -0.07, 0))], C.facade, 2, { depthTest: false });
          }
          const zc = (court.zE1 + court.zE2) / 2, w = Math.abs(court.zE1 - court.zE2);
          const bandGeo = new THREE.BoxGeometry(1.5, court.yR + 0.55, w);
          const band = new THREE.Mesh(bandGeo, new THREE.MeshBasicMaterial({ color: C.depth, transparent: true, opacity: 0.2, depthWrite: false, depthTest: false }));
          band.position.set(-6.45, (court.yR - 0.55) / 2, zc); band.renderOrder = 18; band.raycast = () => {};
          this.stepGroup.add(band);
          for (const x of [-5.7, -7.2]) {                                                     // the two ends of the range
            const r = [V(x, -0.55, court.zE1), V(x, 2.0, court.zE1), V(x, court.yR, (court.zE1 + court.zE2) / 2), V(x, 2.0, court.zE2), V(x, -0.55, court.zE2)];
            this.line(r, C.depth, 2, { depthTest: false, dashed: x < -6 });
          }
          this.label(V(-6.45, 0.6, zc), 'gable plane range x −5.7 … −7.2', C.depth);
          this.label(a.clone().lerp(b, 0.5).add(V(0, -0.22, 0)), 'tile course 0.235 m', C.facade);
        },
      },
    ];
  }

  // ---------------------------------------------------------------- flow
  open() {
    const { camera, controls, isPov } = this.ctx;
    this.saved = { pov: isPov(), pos: camera.position.clone(), target: controls.target.clone() };
    this.active = true;
    this.panel.hidden = false;
    document.body.classList.add('evidence');
    this.group.visible = true;
    this.go(0);
    this.ctx.onChange?.(true);
  }
  close() {
    if (!this.active) return;
    this.clearStep();
    this.active = false;
    this.panel.hidden = true;
    document.body.classList.remove('evidence');
    this.group.visible = false;
    this.ctx.setFrameOverride(null);
    const s = this.saved;
    if (this.ctx.isPov() !== s.pov) this.ctx.setPov(s.pov);
    if (!s.pov) { this.ctx.camera.position.copy(s.pos); this.ctx.controls.target.copy(s.target); }
    this.goal = null;
    this.ctx.onChange?.(false);
  }
  clearStep() {
    if (this.stepGroup) {
      this.stepGroup.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      this.group.remove(this.stepGroup);
    }
    this.stepGroup = new THREE.Group();
    this.group.add(this.stepGroup);
    this.lineMats = [];
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    this.svgClear();
  }
  go(i) {
    if (i < 0 || i >= this.steps.length) return;
    this.step = i;
    const st = this.steps[i];
    this.clearStep();
    // view
    this.ctx.setFrameOverride(st.view.wide ? this.wideFrame : null);
    if (st.view.pov) { if (!this.ctx.isPov()) this.ctx.setPov(true); else this.ctx.relayout(); this.goal = null; }
    else {
      if (this.ctx.isPov()) this.ctx.setPov(false);
      this.goal = { pos: st.view.pos, target: st.view.target };
    }
    st.build?.();
    this.titleEl.textContent = st.title;
    this.captionEl.textContent = st.caption;
    this.noteEl.textContent = st.note || '';
    this.noteEl.hidden = !st.note;
    this.counter.textContent = `${i + 1} / ${this.steps.length}`;
    document.getElementById('ev-prev').disabled = i === 0;
    document.getElementById('ev-next').disabled = i === this.steps.length - 1;
    this.svgDirty = true;
  }
  // POV frame small enough that both vanishing points fit on screen
  wideFrame(w, h) {
    const spanX = (VP_DEPTH[0] - VP_FACADE[0] + 260) / PHOTO_W;
    const s = Math.floor(Math.min((w - 32) / spanX, h * 0.7));
    const x = Math.floor(16 + ((-VP_FACADE[0] + 130) / PHOTO_W) * s), y = Math.floor((h - s) / 2 - h * 0.04);
    return { x, y, s };
  }

  update(dt) {
    if (!this.active) return;
    const { camera, controls } = this.ctx;
    if (this.goal) {
      const k = 1 - Math.pow(0.02, dt);                           // ease toward the step's pose
      camera.position.lerp(this.goal.pos, k);
      controls.target.lerp(this.goal.target, k);
      if (camera.position.distanceTo(this.goal.pos) < 0.01) this.goal = null;
    }
    // line widths follow the drawing viewport
    const f = this.ctx.isPov() ? this.ctx.getFrame() : { s: 0 };
    const res = this.ctx.isPov() ? [f.s, f.s] : [innerWidth, innerHeight];
    for (const m of this.lineMats) m.resolution.set(res[0], res[1]);
    // labels
    for (const { el, pos } of this.labels) {
      const q = pos.clone().project(camera);
      const vis = q.z < 1 && Math.abs(q.x) < 1.2 && Math.abs(q.y) < 1.2;
      el.hidden = !vis;
      if (!vis) continue;
      let x, y;
      if (this.ctx.isPov()) { x = f.x + ((q.x + 1) / 2) * f.s; y = f.y + ((1 - q.y) / 2) * f.s; }
      else { x = ((q.x + 1) / 2) * innerWidth; y = ((1 - q.y) / 2) * innerHeight; }
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
    const st = this.steps[this.step];
    if (st.svg && this.ctx.isPov()) { this.svgClear(); st.svg(); }
  }
}
