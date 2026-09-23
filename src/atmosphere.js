import * as THREE from 'three';
import { SUN_DIR, GROUND } from './config.js';

// Custom height + distance fog with a depth-banded colour script (brief §6).
// Injected into every MeshStandardMaterial through onBeforeCompile — THREE.Fog is not used.
//   foreground (< start): untouched, so the lighting's amber/slate split reads clearly
//   midground: desaturated and cooled
//   background (> far): most hue-shifted and hazy, close to silhouette
export const atmos = {
  uAtmosStart: { value: 3.2 },
  uAtmosFar: { value: 17.0 },
  uAtmosMax: { value: 0.82 },
  uAtmosGround: { value: GROUND },
  uAtmosLow: { value: new THREE.Color('#d9a48c') },   // dawn haze near the ground: peach
  uAtmosHigh: { value: new THREE.Color('#7f8fae') },  // higher up: cool slate-violet
  uAtmosSunTint: { value: new THREE.Color('#f2c38a') },
  uAtmosSunDir: { value: SUN_DIR.clone() },
  uAtmosCool: { value: new THREE.Color('#8d9cb4') },  // midground cooling target
  uAtmosEnabled: { value: 1.0 },
};

const VERT_DECL = /* glsl */`
varying vec3 vAtmosWorld;
`;
const VERT_BODY = /* glsl */`
{
  vec4 atmosP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    atmosP = instanceMatrix * atmosP;
  #endif
  vAtmosWorld = ( modelMatrix * atmosP ).xyz;
}
`;
const FRAG_DECL = /* glsl */`
varying vec3 vAtmosWorld;
uniform float uAtmosStart, uAtmosFar, uAtmosMax, uAtmosGround, uAtmosEnabled;
uniform vec3 uAtmosLow, uAtmosHigh, uAtmosSunTint, uAtmosSunDir, uAtmosCool;
vec3 atmosColor( vec3 wp, vec3 viewDir ) {
  float h = smoothstep( uAtmosGround, uAtmosGround + 5.0, wp.y );
  vec3 c = mix( uAtmosLow, uAtmosHigh, h );
  float s = pow( max( dot( viewDir, uAtmosSunDir ), 0.0 ), 3.0 );
  // applied after colorspace_fragment, so bring the linear uniforms to display space
  return sRGBTransferOETF( vec4( mix( c, uAtmosSunTint, s * 0.6 ), 1.0 ) ).rgb;
}
`;
const FRAG_BODY = /* glsl */`
if ( uAtmosEnabled > 0.5 ) {
  vec3 toP = vAtmosWorld - cameraPosition;
  float d = length( toP );
  vec3 vd = toP / max( d, 1e-4 );
  float band = smoothstep( uAtmosStart, uAtmosFar, d );
  // height fog: thicker near the ground, thinner above the eaves
  float hf = exp( -max( vAtmosWorld.y - uAtmosGround, 0.0 ) * 0.35 );
  float f = clamp( band * mix( 0.7, 1.0, hf ), 0.0, 1.0 ) * uAtmosMax;
  vec3 col = gl_FragColor.rgb;
  float lum = dot( col, vec3( 0.299, 0.587, 0.114 ) );
  float mid = smoothstep( uAtmosStart * 0.8, uAtmosStart * 2.6, d );
  col = mix( col, vec3( lum ) * sRGBTransferOETF( vec4( uAtmosCool, 1.0 ) ).rgb * 1.15, mid * 0.28 );   // midground: desaturate, cool
  col = mix( col, atmosColor( vAtmosWorld, vd ), f );                // background: haze
  gl_FragColor.rgb = col;
}
`;

function onBeforeCompile(shader) {
  Object.assign(shader.uniforms, atmos);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_DECL)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
    .replace('#include <fog_fragment>', '#include <fog_fragment>\n' + FRAG_BODY);
}

export function withAtmos(material) {
  material.onBeforeCompile = onBeforeCompile;
  material.customProgramCacheKey = () => 'atmos';
  return material;
}

// Dawn sky dome. Not fogged; it is the fog's far colour.
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color('#5d6f93') },
      uMid: { value: new THREE.Color('#a7a7bf') },
      uHorizon: { value: new THREE.Color('#e7b394') },
      uSunTint: { value: new THREE.Color('#ffd9a0') },
      uSunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize( position );
        vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uMid, uHorizon, uSunTint, uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize( vDir );
        float h = d.y;
        vec3 c = mix( uHorizon, uMid, smoothstep( -0.05, 0.25, h ) );
        c = mix( c, uTop, smoothstep( 0.25, 0.9, h ) );
        float s = max( dot( d, uSunDir ), 0.0 );
        c += uSunTint * ( pow( s, 60.0 ) * 0.9 + pow( s, 6.0 ) * 0.22 );
        gl_FragColor = vec4( c, 1.0 );
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}
