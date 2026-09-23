import * as THREE from 'three';
import { withAtmos } from './atmosphere.js';

// Clean chiseled forms: MeshStandardMaterial, smooth shading, roughness 0.85–0.95, metalness 0 (brief §6).
function std(color, opts = {}) {
  return withAtmos(new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0, flatShading: false, ...opts,
  }));
}

export const M = {
  wood: std('#7a6a5a', { roughness: 0.88 }),       // veranda deck, fascia — low saturation so shade reads slate, sun amber
  dark: std('#463c35', { roughness: 0.9 }),        // posts, beams, sill, kamoi
  paper: std('#e9dfc8', { roughness: 0.95, side: THREE.DoubleSide }),
  tatami: std('#bdae7a', { roughness: 0.95 }),
  tatamiEdge: std('#3c3a33', { roughness: 0.95 }),
  cloth: std('#dcd4c3', { roughness: 0.92, side: THREE.DoubleSide }),
  robe: std('#e8e2d6', { roughness: 0.9 }),
  skin: std('#c89a7a', { roughness: 0.88 }),
  cushion: std('#5a4a52', { roughness: 0.93 }),
  lacquer: std('#3a2a22', { roughness: 0.85 }),
  matcha: std('#6f8a3c', { roughness: 0.85 }),
  bowl: std('#8a5a3c', { roughness: 0.86 }),
  iron: std('#2e2a27', { roughness: 0.85 }),
  ground: std('#4a473a', { roughness: 0.95 }),     // scaled down with the stronger sun
  moss: std('#56643e', { roughness: 0.95 }),
  plant: std('#4c6338', { roughness: 0.92 }),
  bamboo: std('#8c7c50', { roughness: 0.9 }),
  plaster: std('#e6e0d3', { roughness: 0.95 }),
  plasterFar: std('#a39c92', { roughness: 0.95 }), // neighbouring building: weathered, so the court stays a backdrop
  tile: std('#40444c', { roughness: 0.9 }),
  stone: std('#8a8578', { roughness: 0.95 }),
  coat: std('#3b3833', { roughness: 0.9 }),
  trousers: std('#4a4640', { roughness: 0.9 }),
  shoe: std('#262320', { roughness: 0.88 }),
  hair: std('#2a2420', { roughness: 0.9 }),
  camBody: std('#1d1c1b', { roughness: 0.85 }),
  camTrim: std('#9b9a96', { roughness: 0.85 }),
  camGlass: std('#20262c', { roughness: 0.85 }),
};

// "Show measured vs estimated": estimated geometry turns into this tinted ghost.
// Shadows still come from the mesh itself (castShadow is untouched), so the sun never leaks through.
export const GHOST = new THREE.MeshStandardMaterial({
  color: '#5f8fc4', roughness: 1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide,
});
export const GHOST_EDGE = new THREE.LineBasicMaterial({ color: '#7fb0e6', transparent: true, opacity: 0.75 });
export const MEASURED_EDGE = new THREE.LineBasicMaterial({ color: '#f0b45a', transparent: true, opacity: 0.55 });
export const CAM_LINE = new THREE.LineBasicMaterial({ color: '#e0674a' });
