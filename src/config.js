import * as THREE from 'three';

// Units: metres. Scene coordinates (brief §3):
//   x along the facade, 0 = end wall, +x toward the room's right and toward Bischof
//   y up, 0 = floor level (veranda, sill and tatami level within ~2 cm)
//   z 0 = facade line, +z out toward the garden, −z into the building

export const KEN = 1.97;          // Kyōma 1 ken
export const KAMOI = 1.77;        // sill to kamoi — the scale anchor (measured)
export const GROUND = -0.55;      // ESTIMATE: veranda floor 0.55 m above ground

// Bischof's camera — measured (calibration, brief §3). Never adjust these to make something look better.
export const LENS = new THREE.Vector3(6.12, 0.68, 3.05);
export const VIEW_DIR = new THREE.Vector3(-0.7638, 0.0643, -0.6423).normalize();
export const VFOV = 39.31;

// Direction toward the sun — measured, about 40° elevation.
export const SUN_DIR = new THREE.Vector3(-0.829, 0.839, -0.559).normalize();

export const ROOM_X = 3 * KEN;      // 5.91, estimate (3 ken)
export const ROOM_Z = -2.5 * KEN;   // −4.925, estimate (2.5 ken)
