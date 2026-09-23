import * as THREE from 'three';
import { SUN_DIR, KAMOI } from './config.js';

// One shadow-casting sun (measured direction, ~40° elevation) plus a low hemisphere fill.
// Palette: warm amber where sunlit, deep cool slate in shade.
export function buildLights(scene, { shadowSize = 2048 } = {}) {
  const hemi = new THREE.HemisphereLight('#8ea8d6', '#4b4b4e', 2.1);   // cool sky, dark neutral ground: shade reads slate
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#ffc884', 8);                // the two sun patches are the brightest foreground
  sun.target.position.set(3, 0, -1.5);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: 4, far: 44 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.015;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  return { sun, hemi };
}

// Soft volumetric shaft through the side opening onto the tatami — the photo's real light path.
// The volume is the prism swept by sunlight from the open part of the side opening down to the floor.
// Front faces are rasterised; each fragment integrates density along the view ray through the prism.
export function buildGodRay() {
  const L = SUN_DIR.clone().negate();                 // light travel direction
  const zA = -3.28, zB = -1.71;                       // open part: curtain edge → jamb (curtain blocks −3.28 → −3.62)
  const T = KAMOI;
  const tTop = T / -L.y;
  const A1 = new THREE.Vector3(0, 0, zA), A2 = new THREE.Vector3(0, 0, zB);
  const B1 = new THREE.Vector3(0, T, zA), B2 = new THREE.Vector3(0, T, zB);
  const C1 = B1.clone().addScaledVector(L, tTop), C2 = B2.clone().addScaledVector(L, tTop);

  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  const centre = new THREE.Vector3().add(A1).add(A2).add(B1).add(B2).add(C1).add(C2).divideScalar(6);
  // faces, then fix winding so normals point outward
  const faces = [[A1, A2, B2, B1], [A1, C1, C2, A2], [B1, B2, C2, C1], [A1, B1, C1], [A2, C2, B2]];
  const planes = [];
  for (const f of faces) {
    const n = new THREE.Vector3().subVectors(f[1], f[0]).cross(new THREE.Vector3().subVectors(f[2], f[0])).normalize();
    if (n.dot(new THREE.Vector3().subVectors(f[0], centre)) < 0) { f.reverse(); n.negate(); }
    planes.push(new THREE.Vector4(n.x, n.y, n.z, n.dot(f[0])));
    f.length === 4 ? quad(...f) : tri(...f);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: {
      uPlanes: { value: planes },
      uColor: { value: new THREE.Color('#ffc27a') },
      uStrength: { value: 0.35 },
      uTime: { value: 0 },
      uLightDir: { value: L },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec4 uPlanes[5];
      uniform vec3 uColor, uLightDir;
      uniform float uStrength, uTime;
      varying vec3 vWorld;
      float inside( vec3 p ) {
        float m = 1e3;
        for ( int i = 0; i < 5; i++ ) m = min( m, uPlanes[i].w - dot( uPlanes[i].xyz, p ) );
        return m;
      }
      void main() {
        vec3 ro = cameraPosition;
        vec3 rd = normalize( vWorld - ro );
        float t0 = 0.0, t1 = 1e4;
        for ( int i = 0; i < 5; i++ ) {
          float den = dot( uPlanes[i].xyz, rd );
          float num = uPlanes[i].w - dot( uPlanes[i].xyz, ro );
          if ( abs( den ) < 1e-5 ) { if ( num < 0.0 ) discard; continue; }
          float t = num / den;
          if ( den < 0.0 ) t0 = max( t0, t ); else t1 = min( t1, t );
        }
        if ( t1 <= t0 ) discard;
        const int N = 12;
        float dt = ( t1 - t0 ) / float( N );
        float acc = 0.0;
        for ( int i = 0; i < N; i++ ) {
          vec3 p = ro + rd * ( t0 + ( float( i ) + 0.5 ) * dt );
          float e = smoothstep( 0.0, 0.12, inside( p ) );
          float along = dot( p, uLightDir );
          float shimmer = 0.85 + 0.15 * sin( along * 5.0 - uTime * 0.35 ) * sin( p.z * 3.1 + uTime * 0.21 );
          float lowFade = smoothstep( 0.0, 0.35, p.y );
          float off = smoothstep( 0.0, 0.3, p.x );        // not glued to the opening itself
          acc += e * shimmer * off * mix( 0.45, 1.0, lowFade ) * dt;
        }
        float a = 1.0 - exp( -acc * uStrength );
        gl_FragColor = vec4( uColor * a, 1.0 );
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  mesh.raycast = () => {};
  return mesh;
}
