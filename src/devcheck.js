// ?dev only: POV region check against the reference photo (dev-reference/bischof-ryoanji-1951.jpg, 1140 × 1142).
// Regions are in photo px. Both images are reduced to greyscale with the same weights (ITU-R 601, as Pillow's
// convert('L')), so the numbers compare directly with measurements taken on the photo file.
import * as THREE from 'three';

export const PHOTO_W = 1140, PHOTO_H = 1142;

// [name, x0, y0, x1, y1, target] — targets are the photo's own means; tolerance ±15 %
export const REGIONS = [
  ['veranda shade', 300, 1000, 1100, 1100, 74],
  ['veranda sun patch', 120, 860, 220, 900, 211],
  ['lit tatami', 560, 820, 780, 850, 206],
  ['court', 530, 480, 640, 640, 108],
  ['corner slot', 190, 450, 258, 820, 148],
  ['right screens', 930, 250, 1120, 800, 102],
  ['priest', 600, 700, 712, 818, 108],
  ['lantern', 345, 450, 425, 560, 16],
];

const grey = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

export function installDevCheck({ scene, camera, renderer, setPov, photo, out, viewUpdate }) {
  let photoPx = null;
  const loadPhoto = () => {
    if (photoPx || !photo.complete || !photo.naturalWidth) return photoPx;
    const c = document.createElement('canvas'); c.width = PHOTO_W; c.height = PHOTO_H;
    const cx = c.getContext('2d'); cx.drawImage(photo, 0, 0, PHOTO_W, PHOTO_H);
    photoPx = cx.getImageData(0, 0, PHOTO_W, PHOTO_H).data;
    return photoPx;
  };

  // Render the POV frame directly (works while the animation loop is paused) and read it back at frame resolution.
  function renderPov() {
    if (!document.body.classList.contains('pov')) setPov(true);
    const w = innerWidth, h = innerHeight, s = Math.floor(Math.min(w, h) * 0.94), x = Math.floor((w - s) / 2), y = Math.floor((h - s) / 2);
    const gl = renderer.getContext(), pr = renderer.getPixelRatio();
    camera.aspect = 1; camera.updateProjectionMatrix();
    viewUpdate();
    scene.updateMatrixWorld(true);
    renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    renderer.setScissor(x, h - y - s, s, s); renderer.setViewport(x, h - y - s, s, s);
    renderer.render(scene, camera);
    const S = Math.round(s * pr), px = new Uint8Array(S * S * 4);
    gl.readPixels(Math.round(x * pr), Math.round((h - y - s) * pr), S, S, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // accessor in photo px (top-left origin)
    const at = (qx, qy) => { const i = ((S - 1 - Math.floor((qy / PHOTO_H) * S)) * S + Math.floor((qx / PHOTO_W) * S)) * 4; return grey(px[i], px[i + 1], px[i + 2]); };
    return { at, S };
  }

  const photoAt = (qx, qy) => { const p = loadPhoto(); if (!p) return NaN; const i = (Math.floor(qy) * PHOTO_W + Math.floor(qx)) * 4; return grey(p[i], p[i + 1], p[i + 2]); };
  const mean = (f, x0, y0, x1, y1, step = 2) => { let s = 0, n = 0; for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) { s += f(x, y); n++; } return s / n; };

  function regionCheck() {
    const r = renderPov();
    return REGIONS.map(([name, x0, y0, x1, y1, target]) => {
      const render = mean(r.at, x0, y0, x1, y1), ph = mean(photoAt, x0, y0, x1, y1);
      return { region: name, render: +render.toFixed(1), photo: +ph.toFixed(1), target, ok: Math.abs(render - target) <= 0.15 * target };
    });
  }

  // world point → photo px
  const toPhotoPx = (v) => { const p = new THREE.Vector3(...v).project(camera); return [+(((p.x + 1) / 2) * PHOTO_W).toFixed(1), +(((1 - p.y) / 2) * PHOTO_H).toFixed(1)]; };
  // greyscale profile along a photo row, render and photo side by side
  function rowProfile(y, x0, x1, step = 1) {
    const r = renderPov(), rows = [];
    for (let x = x0; x <= x1; x += step) rows.push([x, Math.round(r.at(x, y)), Math.round(photoAt(x, y))]);
    return rows;
  }

  function print() {
    const rows = regionCheck();
    const pad = (s, n) => String(s).padEnd(n);
    out.textContent = pad('region', 19) + pad('render', 8) + pad('photo', 8) + 'target ±15%\n' +
      rows.map((r) => pad(r.region, 19) + pad(r.render, 8) + pad(r.photo, 8) + `${r.target} ${r.ok ? '✓' : '✗'}`).join('\n');
    return rows;
  }

  // photo | render crop side by side, enlarged, as a DOM overlay (for close silhouette comparison). cropCompare() removes it.
  function cropCompare(x0, y0, x1, y1, scale = 4) {
    document.getElementById('crop-compare')?.remove();
    if (x0 === undefined) return;
    const r = renderPov(), w = x1 - x0, h = y1 - y0;
    const c = document.createElement('canvas'); c.id = 'crop-compare'; c.width = w * 2 + 6; c.height = h;
    Object.assign(c.style, { position: 'fixed', left: '4px', top: '4px', zIndex: 50, width: `${(w * 2 + 6) * scale}px`, height: `${h * scale}px`, imageRendering: 'pixelated', background: '#000' });
    const cx = c.getContext('2d'), img = cx.createImageData(c.width, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = photoAt(x0 + x, y0 + y), q = r.at(x0 + x, y0 + y);
      for (const [ox, v] of [[x, p], [x + w + 6, q]]) { const i = (y * c.width + ox) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    }
    cx.putImageData(img, 0, 0);
    document.body.appendChild(c);
    return 'photo | render';
  }

  // run evidence step i to completion and draw one frame (works while the animation loop is paused)
  function evStep(i) {
    const { evidence, controls, atmos } = window;
    if (!evidence.active) evidence.open();
    evidence.go(i);
    const isP = () => document.body.classList.contains('pov');
    for (let k = 0; k < 200; k++) { evidence.update(0.05); if (!isP()) controls.update(); }
    const w = innerWidth, h = innerHeight;
    if (isP()) {
      const fr = evidence.ctx.getFrame();
      camera.aspect = 1; camera.updateProjectionMatrix(); viewUpdate();
      renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
      renderer.setScissor(fr.x, h - fr.y - fr.s, fr.s, fr.s); renderer.setViewport(fr.x, h - fr.y - fr.s, fr.s, fr.s);
    } else {
      camera.aspect = w / h; camera.updateProjectionMatrix(); viewUpdate();
      renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
    }
    scene.updateMatrixWorld(true); camera.updateMatrixWorld();
    evidence.update(0.016);
    renderer.render(scene, camera);
    return document.getElementById('ev-title').textContent;
  }

  Object.assign(window, { regionCheck, renderPov, toPhotoPx, rowProfile, photoAt, printRegions: print, cropCompare, evStep });
  return { print };
}
