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
  uAtmosMax: { value: 0.55 },                         // eased: background reads as silhouette, not glow
  uAtmosGround: { value: GROUND },
  uAtmosLow: { value: new THREE.Color('#a08a88') },   // dawn haze near the ground: muted rose-grey
  uAtmosHigh: { value: new THREE.Color('#7f8fae') },  // higher up: cool slate-violet
  uAtmosSunTint: { value: new THREE.Color('#f2c38a') },
  uAtmosSunDir: { value: SUN_DIR.clone() },
  uAtmosCool: { value: new THREE.Color('#8d9cb4') },  // midground cooling target
  uAtmosEnabled: { value: 1.0 },
  // sky colours, shared by the sky dome and the ground's horizon fade so they meet without a seam
  uSkyTop: { value: new THREE.Color('#5d6f93') },
  uSkyMid: { value: new THREE.Color('#a7a7bf') },
  uSkyHorizon: { value: new THREE.Color('#e7b394') },
  uSkySunTint: { value: new THREE.Color('#ffd9a0') },
};

// Sky colour for a view direction (linear). Used by the dome and by ATMOS_HORIZON materials.
const SKY_GLSL = /* glsl */`
uniform vec3 uSkyTop, uSkyMid, uSkyHorizon, uSkySunTint, uAtmosSunDir;
vec3 skyColor( vec3 d ) {
  vec3 c = mix( uSkyHorizon, uSkyMid, smoothstep( -0.05, 0.25, d.y ) );
  c = mix( c, uSkyTop, smoothstep( 0.25, 0.9, d.y ) );
  float s = max( dot( d, uAtmosSunDir ), 0.0 );
  return c + uSkySunTint * ( pow( s, 60.0 ) * 0.9 + pow( s, 6.0 ) * 0.22 );
}
`;

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
const FRAG_DECL = SKY_GLSL + /* glsl */`
varying vec3 vAtmosWorld;
uniform float uAtmosStart, uAtmosFar, uAtmosMax, uAtmosGround, uAtmosEnabled;
uniform vec3 uAtmosLow, uAtmosHigh, uAtmosSunTint, uAtmosCool;
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
  #ifdef ATMOS_HORIZON
    // far ground dissolves into the sky colour for the same view direction: no visible edge
    col = mix( col, sRGBTransferOETF( vec4( skyColor( vd ), 1.0 ) ).rgb, smoothstep( 25.0, 140.0, d ) );
  #endif
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
    uniforms: atmos,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = ( modelMatrix * vec4( position, 1.0 ) ).xyz - cameraPosition;   // view direction, not direction from the origin
        vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_Position = p.xyww;
      }`,
    fragmentShader: SKY_GLSL + /* glsl */`
      varying vec3 vDir;
      void main() {
        gl_FragColor = vec4( skyColor( normalize( vDir ) ), 1.0 );
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}
