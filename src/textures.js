import * as THREE from 'three';

// Code-generated painted textures (Firewatch approach): a painted diffuse in two or three soft tone bands plus a
// subtle normal map derived from the same height field (Sobel). Flat shapes and abstract internal detail, no
// photographic noise. 512 px, generated once at startup, cached, mipmapped.
// Geometry UVs are in metres; each texture's `tile` gives the metres covered by one repeat.

const SIZE = 512;
let cache = null;

// ---------- small helpers
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
// tileable value noise: pu × pv cells over the unit square (different periods stretch it without breaking tiling)
function noise2(seed, pu, pv = pu) {
  const r = rng(seed), g = new Float32Array(pu * pv).map(() => r());
  const at = (i, j) => g[((j % pv + pv) % pv) * pu + ((i % pu + pu) % pu)];
  const s = (t) => t * t * (3 - 2 * t);
  return (u, v) => {                              // periodic in u and v with period 1
    const x = u * pu, y = v * pv, i = Math.floor(x), j = Math.floor(y), fx = s(x - i), fy = s(y - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// soft posterise: 2–3 tone bands with a narrow blend between them
function bands(x, levels) {
  let out = levels[0][1];
  for (let i = 1; i < levels.length; i++) out += (levels[i][1] - levels[i - 1][1]) * smooth(levels[i][0] - 0.04, levels[i][0] + 0.04, x);
  return out;
}

// Paint: height(u,v) in [0,1] and tone(u,v,h) → [r,g,b] 0..1 (a grey multiplier on the material colour, or a colour)
function paint({ height, tone, alpha }) {
  const h = new Float32Array(SIZE * SIZE);
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const cx = c.getContext('2d'), img = cx.createImageData(SIZE, SIZE), d = img.data;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE, i = y * SIZE + x;
    const hv = height(u, v); h[i] = hv;
    const [r, g, b] = tone(u, v, hv);
    d[i * 4] = r * 255; d[i * 4 + 1] = g * 255; d[i * 4 + 2] = b * 255; d[i * 4 + 3] = alpha ? alpha(u, v) * 255 : 255;
  }
  cx.putImageData(img, 0, 0);
  return { canvas: c, h };
}

function normalFromHeight(h, strength) {
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const cx = c.getContext('2d'), img = cx.createImageData(SIZE, SIZE), d = img.data;
  const H = (x, y) => h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    // Sobel
    const gx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const gy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -gx * strength, ny = gy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * SIZE + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  return c;
}

function texture(canvas, srgb, aniso) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const grey = (g) => [g, g, g];

// ---------- the painters
const PAINTERS = {
  // veranda planks: grain streaks along u, four planks per repeat (0.135 m each → 0.54 m in v)
  wood: {
    tile: [1.2, 0.54], normal: 2.0,
    make() {
      const n1 = noise2(3, 8), n2 = noise2(4, 6, 96);          // n2: long streaks along u
      return paint({
        height: (u, v) => {
          const plank = Math.floor(v * 4), pv = v * 4 - plank;
          const grain = n2(u + plank * 0.37, v);
          const seam = 1 - smooth(0.0, 0.03, pv) * smooth(1.0, 0.97, pv);
          return clamp01(0.55 + 0.25 * (grain - 0.5) + 0.2 * (n1(u, v) - 0.5) - 0.5 * seam);
        },
        tone: (u, v, h) => grey(bands(h, [[0, 0.74], [0.42, 0.88], [0.62, 1.0]])),
      });
    },
  },
  // posts, beams, rails: quieter grain along the long axis of each face
  darkwood: {
    tile: [1.5, 0.5], normal: 1.2,
    make() {
      const n = noise2(9, 4, 48), m = noise2(10, 6);
      return paint({
        height: (u, v) => clamp01(0.5 + 0.3 * (n(u, v) - 0.5) + 0.2 * (m(u, v) - 0.5)),
        tone: (u, v, h) => grey(bands(h, [[0, 0.82], [0.5, 0.94], [0.66, 1.0]])),
      });
    },
  },
  // tatami: rush weave along the mat length plus dark cloth borders (heri) on the long sides. One repeat = one mat.
  tatami: {
    tile: [1.97, 0.985], normal: 1.6,
    make() {
      const n = noise2(5, 6);
      return paint({
        height: (u, v) => {
          const weave = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 64);                // rush rows along u
          const stitch = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 18);                 // cross threads
          const border = v < 0.06 || v > 0.94;
          return border ? 0.35 : clamp01(0.45 + 0.25 * weave * 0.6 + 0.1 * stitch + 0.15 * (n(u, v) - 0.5));
        },
        tone: (u, v, h) => {
          if (v < 0.06 || v > 0.94) return [0.26, 0.24, 0.22];                     // cloth border
          return grey(bands(h, [[0, 0.84], [0.55, 0.95], [0.7, 1.0]]));
        },
      });
    },
  },
  // shoji paper: faint fibres, almost flat
  paper: {
    tile: [0.6, 0.6], normal: 0.6,
    make() {
      const n = noise2(7, 40, 12), m = noise2(8, 5);
      return paint({
        height: (u, v) => clamp01(0.5 + 0.35 * (n(u, v) - 0.5) + 0.2 * (m(u, v) - 0.5)),
        tone: (u, v, h) => grey(bands(h, [[0, 0.95], [0.55, 1.0]])),
      });
    },
  },
  // plaster: broad trowel blotches, two bands
  plaster: {
    tile: [2.0, 2.0], normal: 1.0,
    make() {
      const n = noise2(11, 5), m = noise2(12, 22, 14);
      return paint({
        height: (u, v) => clamp01(0.5 + 0.35 * (n(u, v) - 0.5) + 0.2 * (m(u, v) - 0.5)),
        tone: (u, v, h) => grey(bands(h, [[0, 0.93], [0.5, 0.98], [0.62, 1.0]])),
      });
    },
  },
  // J-tile: per-tile tone (265 × 235 mm tiles), the geometry carries the corrugation
  jtile: {
    tile: [0.265 * 4, 0.235 * 4], normal: 1.0,
    make() {
      const r = rng(13), cell = Array.from({ length: 16 }, () => r()), m = noise2(14, 8);
      return paint({
        height: (u, v) => {
          const i = Math.floor(u * 4), j = Math.floor(v * 4), fv = v * 4 - j;
          return clamp01(0.45 + 0.3 * (cell[j * 4 + i] - 0.5) + 0.2 * (m(u, v) - 0.5) + 0.25 * smooth(0.9, 1.0, fv));
        },
        tone: (u, v, h) => grey(bands(h, [[0, 0.8], [0.45, 0.92], [0.62, 1.0]])),
      });
    },
  },
  // bark: vertical fissures (v along the trunk)
  bark: {
    tile: [0.4, 0.8], normal: 2.2,
    make() {
      const n = noise2(15, 16, 3), m = noise2(16, 4);          // n: fissures along v
      return paint({
        height: (u, v) => clamp01(0.55 + 0.45 * (Math.abs(n(u, v) - 0.5) * 2 - 0.5) + 0.2 * (m(u, v) - 0.5)),
        tone: (u, v, h) => grey(bands(h, [[0, 0.62], [0.45, 0.85], [0.6, 1.0]])),
      });
    },
  },
};

// Leaf alpha atlas, 2 × 2: cells 0–2 maple (Acer palmatum, five to seven lobes), cell 3 an ovate broadleaf.
function leafAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const cx = c.getContext('2d');
  cx.clearRect(0, 0, SIZE, SIZE);
  const cell = SIZE / 2;
  const maple = (ox, oy, lobes, depth, seed) => {
    const r = rng(seed), cxm = ox + cell / 2, cym = oy + cell * 0.6;
    cx.save(); cx.translate(cxm, cym);
    cx.beginPath();
    const N = lobes * 2;
    for (let i = 0; i <= N; i++) {
      const a = -Math.PI / 2 + ((i / N) * 2 - 1) * Math.PI * 0.92;
      const rr = (i % 2 ? 0.46 + r() * 0.03 - Math.abs(i - lobes) * 0.012 : 0.46 * (1 - depth)) * cell;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      i === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
    }
    cx.closePath();
    cx.fillStyle = '#f2f2f2'; cx.fill();
    // veins: one tone darker, flat
    cx.strokeStyle = '#c8c8c8'; cx.lineWidth = cell * 0.018;
    for (let k = 0; k < lobes; k++) {
      const a = -Math.PI / 2 + ((((k * 2 + 1) / N) * 2 - 1) * Math.PI * 0.92);
      cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(Math.cos(a) * cell * 0.38, Math.sin(a) * cell * 0.38); cx.stroke();
    }
    cx.strokeStyle = '#8a8a8a'; cx.lineWidth = cell * 0.02;                                   // stalk
    cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(0, cell * 0.36); cx.stroke();
    cx.restore();
  };
  maple(0, 0, 5, 0.62, 1); maple(cell, 0, 7, 0.7, 2); maple(0, cell, 5, 0.5, 3);
  // ovate broadleaf
  cx.save(); cx.translate(cell * 1.5, cell * 1.5);
  cx.beginPath(); cx.ellipse(0, -cell * 0.05, cell * 0.2, cell * 0.4, 0, 0, Math.PI * 2);
  cx.fillStyle = '#f0f0f0'; cx.fill();
  cx.strokeStyle = '#c4c4c4'; cx.lineWidth = cell * 0.02; cx.beginPath(); cx.moveTo(0, cell * 0.35); cx.lineTo(0, -cell * 0.42); cx.stroke();
  cx.restore();
  return c;
}

// Quad geometry for one atlas cell, stem at the origin, blade along +y. size in metres.
export function leafQuad(cellIndex, size) {
  const g = new THREE.PlaneGeometry(size, size);
  g.translate(0, size * 0.45, 0);                    // the atlas draws each stalk down to near the cell's bottom edge
  const uv = g.attributes.uv, cu = (cellIndex % 2) * 0.5, cv = 0.5 - Math.floor(cellIndex / 2) * 0.5;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) * 0.5, cv + uv.getY(i) * 0.5);
  return g;
}

// Build (once) and return every texture.
export function paintedTextures(renderer) {
  if (cache) return cache;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  cache = {};
  for (const [name, p] of Object.entries(PAINTERS)) {
    const { canvas, h } = p.make();
    const map = texture(canvas, true, aniso), normalMap = texture(normalFromHeight(h, p.normal), false, aniso);
    for (const t of [map, normalMap]) t.repeat.set(1 / p.tile[0], 1 / p.tile[1]);
    cache[name] = { map, normalMap, tile: p.tile };
  }
  const atlas = texture(leafAtlas(), true, aniso);
  atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
  cache.leaves = { map: atlas };
  return cache;
}

paintedTextures.cached = () => cache;

// Put the maps on the materials. Roughness stays 0.85–0.95; the normal maps are deliberately faint.
export function applyTextures(M, renderer) {
  const T = paintedTextures(renderer);
  const set = (mat, t, normalScale = 0.35) => {
    if (!mat) return;
    mat.map = t.map; mat.normalMap = t.normalMap; mat.normalScale = new THREE.Vector2(normalScale, normalScale);
    mat.roughness = THREE.MathUtils.clamp(mat.roughness, 0.85, 0.95);
    mat.needsUpdate = true;
  };
  set(M.wood, T.wood, 0.4);
  for (const k of ['dark', 'lacquer', 'timber', 'shelf', 'ceiling']) set(M[k], T.darkwood, 0.3);
  set(M.tatami, T.tatami, 0.35);
  set(M.paper, T.paper, 0.15);
  set(M.plaster, T.plaster, 0.25); set(M.plasterFar, T.plaster, 0.25);
  set(M.jtile, T.jtile, 0.3); set(M.tile, T.jtile, 0.3);
  set(M.bark, T.bark, 0.5); set(M.bamboo, T.darkwood, 0.25);
  return T;
}
