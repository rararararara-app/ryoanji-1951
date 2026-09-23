import * as THREE from 'three';
import { GROUND, LENS } from './config.js';
import { withAtmos } from './atmosphere.js';
import { paintedTextures, leafQuad } from './textures.js';

// Sparse drifting Acer palmatum leaves, mostly outside and in the court. The photo dates from summer to about
// 30 October 1951 (sun at 40°), so no blossom: green leaves, a few yellowing.
const VOLUMES = [
  { w: 0.6, min: new THREE.Vector3(-2, GROUND, 1.7), max: new THREE.Vector3(13, 3.6, 9) },     // garden in front
  { w: 0.4, min: new THREE.Vector3(-7, GROUND, -6.5), max: new THREE.Vector3(-0.4, 3.6, 2.5) }, // court beyond the end wall
];
const COLORS = ['#4c6a33', '#5a7a3a', '#3f5a2c', '#647d37', '#6f8a3c', '#4c6a33', '#a89a3a', '#c3a640'];   // last two: yellowing

export class DriftingLeaves {
  constructor(count) {
    const geo = leafQuad(0, 0.08);
    geo.translate(0, -0.035, 0);                       // spin about the leaf's middle, not its stem
    const mat = withAtmos(new THREE.MeshStandardMaterial({ map: paintedTextures.cached().leaves.map, alphaTest: 0.5, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.castShadow = false;
    this.p = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const s = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), phase: Math.random() * 10 };
      this.spawn(s, true);
      this.p.push(s);
      this.mesh.setColorAt(i, c.set(COLORS[i % COLORS.length]));
    }
    this.dummy = new THREE.Object3D();
    this.gust = 0;
  }

  spawn(s, anywhere) {
    const v = Math.random() < VOLUMES[0].w ? VOLUMES[0] : VOLUMES[1];
    s.pos.set(
      THREE.MathUtils.lerp(v.min.x, v.max.x, Math.random()),
      anywhere ? THREE.MathUtils.lerp(v.min.y, v.max.y, Math.random()) : v.max.y,
      THREE.MathUtils.lerp(v.min.z, v.max.z, Math.random()));
    s.fall = 0.10 + Math.random() * 0.14;              // leaves glide slower than they would drop
    s.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    s.spin.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(2);
  }

  blocked(p) {
    // keep them out of the building and away from Bischof's lens
    if (p.x > -0.15 && p.x < 12.1 && p.z < 1.4 && p.z > -5.2 && p.y < 3.0) return true;
    return p.distanceToSquared(LENS) < 6.25;              // 2.5 m: a leaf closer than that fills the POV frame
  }

  update(dt, t, pov) {
    // slow wind with occasional gusts, blowing along +x and slightly toward the garden
    this.gust = 0.5 + 0.5 * Math.sin(t * 0.13) * Math.sin(t * 0.071 + 1.3);
    const wx = 0.18 + 0.45 * this.gust, wz = 0.06 + 0.1 * Math.sin(t * 0.05);
    const d = this.dummy;
    for (let i = 0; i < this.p.length; i++) {
      const s = this.p[i];
      s.pos.x += (wx + Math.sin(t * 1.3 + s.phase) * 0.12) * dt;
      s.pos.z += (wz + Math.cos(t * 1.1 + s.phase) * 0.1) * dt;
      s.pos.y -= (s.fall + Math.sin(t * 2 + s.phase) * 0.05) * dt;
      s.rot.x += s.spin.x * dt; s.rot.y += s.spin.y * dt; s.rot.z += s.spin.z * dt;
      if (s.pos.y < GROUND + 0.02 || s.pos.x > 14 || s.pos.x < -8 || s.pos.z > 10 || s.pos.z < -7 || this.blocked(s.pos)) this.spawn(s, false);
      d.position.copy(s.pos); d.rotation.copy(s.rot);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
