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
  uVoid: { value: new THREE.Color('#a08a88') },        // outside the stage slab: flat, the fog script's low haze
  // per-zone grading (see ZONES below); 0 = zone from the camera position (free view), 1 = per fragment (POV)
  uZoneMode: { value: 0 },
  uInteriorAO: { value: 0.3 },
  uZoneTint: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
  uZoneExposure: { value: new THREE.Vector4(1, 1, 1, 1) },
  uZoneFog: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
};

// Per-zone colour grading, Firewatch-style atmospheric volumes: veranda, room, court (beyond the end wall), garden.
// Each has a tint and an exposure (applied before tone mapping) and a fog tint (the haze colour in that zone).
// Free view: the zone the camera is in grades the whole frame. POV: each fragment takes the zone it sits in, so the
// frame grades by region. The cool slate shade and warm amber sun come from the lights and are kept.
export const ZONES = {
  veranda: { tint: '#f4f1ee', exposure: 3.4, fog: '#a8928e' },
  room: { tint: '#fbf6ef', exposure: 1.9, fog: '#a8928e' },
  court: { tint: '#f4f3f2', exposure: 1.25, fog: '#a99a95' },
  garden: { tint: '#f7f3ef', exposure: 0.72, fog: '#a8928e' },
};
export function applyZones() {
  ['veranda', 'room', 'court', 'garden'].forEach((k, i) => {
    const z = ZONES[k];
    atmos.uZoneTint.value[i].set(z.tint);
    atmos.uZoneFog.value[i].set(z.fog);
    atmos.uZoneExposure.value.setComponent(i, z.exposure);
  });
}
applyZones();

// Sky colour for a view direction (linear).
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
uniform float uZoneMode;
uniform vec3 uZoneTint[4], uZoneFog[4];
uniform vec4 uZoneExposure;
float zoneBox( vec3 p, vec3 lo, vec3 hi, float soft ) {
  vec3 a = smoothstep( lo - soft, lo + soft, p ) * ( 1.0 - smoothstep( hi - soft, hi + soft, p ) );
  return a.x * a.y * a.z;
}
// weights for veranda, room, court, garden
vec4 zoneWeights( vec3 p ) {
  float v = zoneBox( p, vec3( -0.1, -1.0, 0.0 ), vec3( 12.1, 3.0, 1.45 ), 0.12 );
  float r = zoneBox( p, vec3( 0.05, -1.0, -5.0 ), vec3( 11.9, 3.0, 0.0 ), 0.08 );
  float c = 1.0 - smoothstep( -0.25, 0.05, p.x );
  c *= 1.0 - smoothstep( 1.3, 1.6, p.z );                                         // court lies behind the end-wall line
  float g = max( 0.0, 1.0 - v - r - c );
  vec4 w = vec4( v, r, c, g );
  return w / max( dot( w, vec4( 1.0 ) ), 1e-4 );
}
vec4 zoneAt( vec3 fragWorld ) { return zoneWeights( mix( cameraPosition, fragWorld, uZoneMode ) ); }
// Interior occlusion of the sky fill: under the roof the hemisphere light (which has no occlusion of its own) fades
// from full at the facade line to uInteriorAO about 1.5 m into the room. Direct sun is untouched.
uniform float uInteriorAO;
float interiorAO( vec3 p ) {
  float inside = smoothstep( -0.1, 0.1, p.x ) * ( 1.0 - smoothstep( 11.8, 12.0, p.x ) ) * ( 1.0 - smoothstep( 2.5, 2.7, p.y ) )
               * smoothstep( -5.1, -4.9, p.z );
  return mix( 1.0, mix( 1.0, uInteriorAO, smoothstep( 0.0, 1.5, -p.z ) ), inside );
}
vec3 atmosColor( vec3 wp, vec3 viewDir ) {
  float h = smoothstep( uAtmosGround, uAtmosGround + 5.0, wp.y );
  vec4 zw = zoneAt( wp );
  vec3 low = zw.x * uZoneFog[0] + zw.y * uZoneFog[1] + zw.z * uZoneFog[2] + zw.w * uZoneFog[3];
  vec3 c = mix( low, uAtmosHigh, h );
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
  #ifndef ATMOS_PAPER
  col = mix( col, vec3( lum ) * sRGBTransferOETF( vec4( uAtmosCool, 1.0 ) ).rgb * 1.15, mid * 0.28 );   // midground: desaturate, cool
  #endif
  col = mix( col, atmosColor( vAtmosWorld, vd ), f );                // background: haze
  gl_FragColor.rgb = col;
}
`;

const INTERIOR_AO_BODY = /* glsl */`
if ( uAtmosEnabled > 0.5 ) {
  float iao = interiorAO( vAtmosWorld );
  reflectedLight.indirectDiffuse *= iao;
  reflectedLight.indirectSpecular *= iao;
}
`;

// zone tint and exposure, in linear light before tone mapping. Shoji paper is exempt from the cool shift:
// its hemisphere-blue is pulled back to warm neutral so it reads as paper, not blue glass.
const GRADE_BODY = /* glsl */`
if ( uAtmosEnabled > 0.5 ) {
  vec4 zw = zoneAt( vAtmosWorld );
  vec3 tint = zw.x * uZoneTint[0] + zw.y * uZoneTint[1] + zw.z * uZoneTint[2] + zw.w * uZoneTint[3];
  float ex = dot( zw, uZoneExposure );
  #ifdef ATMOS_PAPER
    float pl = dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, pl * vec3( 1.04, 1.0, 0.93 ), 0.8 );
    tint = vec3( 1.0 );
  #endif
  gl_FragColor.rgb *= tint * ex;
}
`;

function onBeforeCompile(shader) {
  Object.assign(shader.uniforms, atmos);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_DECL)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
    .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + INTERIOR_AO_BODY)
    .replace('#include <tonemapping_fragment>', GRADE_BODY + '\n#include <tonemapping_fragment>')
    .replace('#include <fog_fragment>', '#include <fog_fragment>\n' + FRAG_BODY);
}

export function withAtmos(material) {
  material.onBeforeCompile = onBeforeCompile;
  material.customProgramCacheKey = () => 'atmos';
  return material;
}

// Dawn sky dome. Not fogged; it is the fog's far colour.
// Painted sky (STYLIZATION, labelled in the UI): a banded Firewatch-style gradient with a few flat cloud bands.
// The sun stays on the measured SUN_DIR and no cloud crosses its disc (the photo's shadows are hard: clear sun).
// Below the horizon is the void around the stage, one flat colour. The POV frame shows no open sky.
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
      uniform vec3 uVoid;
      varying vec3 vDir;
      float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      float vnoise( vec2 p ) {
        vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), f.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), f.x ), f.y );
      }
      float fbm( vec2 p ) { return 0.55 * vnoise( p ) + 0.3 * vnoise( p * 2.1 ) + 0.15 * vnoise( p * 4.3 ); }
      void main() {
        vec3 d = normalize( vDir );
        float h = d.y;
        // below ~10° the sky is exactly the old smooth gradient: that is all the POV frame ever shows of it
        // (through the corner slot and above the neighbour's gable, −4° to +9°), so the POV does not change
        vec3 smoothSky = mix( uSkyHorizon, uSkyMid, smoothstep( -0.05, 0.25, h ) );
        smoothSky = mix( smoothSky, uSkyTop, smoothstep( 0.25, 0.9, h ) );
        // painted gradient higher up: the same sky stepped into soft bands
        float hq = mix( h, floor( h * 9.0 ) / 9.0 + 0.055, 0.65 );
        vec3 painted = mix( uSkyHorizon, uSkyMid, smoothstep( -0.05, 0.25, hq ) );
        painted = mix( painted, uSkyTop, smoothstep( 0.25, 0.9, hq ) );
        vec3 c = mix( smoothSky, painted, smoothstep( 0.16, 0.22, h ) );
        // stylised cloud bands: long flat streaks from ~9° up
        float az = atan( d.z, d.x );
        float band = smoothstep( 0.16, 0.22, h ) * ( 1.0 - smoothstep( 0.5, 0.6, h ) );
        float n = fbm( vec2( az * 2.2, h * 16.0 ) );
        float cloud = smoothstep( 0.6, 0.66, n ) * band;
        float s = max( dot( d, uAtmosSunDir ), 0.0 );
        cloud *= 1.0 - smoothstep( 0.93, 0.975, s );                   // never over the sun disc
        vec3 cloudCol = mix( uSkyMid * 1.08, uSkySunTint, 0.35 + 0.4 * smoothstep( 0.4, 0.9, s ) );
        c = mix( c, cloudCol, cloud * 0.85 );
        c += uSkySunTint * ( pow( s, 60.0 ) * 0.9 + pow( s, 6.0 ) * 0.22 );
        // the void beyond the slab: one flat colour, reached just below the horizon
        c = mix( uVoid, c, smoothstep( -0.03, 0.0, h ) );
        gl_FragColor = vec4( c, 1.0 );
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}
