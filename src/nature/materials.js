import * as THREE from 'three';
import { coastUniforms, COAST_GLSL } from '../world/coastShading.js';

// ---------------------------------------------------------------------------
// Shared materials for all nature batches.
//  - Vegetation: 1 material for every tree, palm, shrub, fern, grass & litter
//    instance across the island. Driven by vertex color (per-part variation
//    + AO), a per-instance tint attribute, and a 2-tier wind displacement in
//    the vertex shader (`wind` attribute: integer part = trunk sway, fractional
//    part = leaf/frond flutter; sign encodes leaf vs bark for translucency).
//  - Rocks: 1 material for every boulder, block, shelf & pebble. World-space
//    triplanar detail + waterline darkening/wetness + distance-attenuated bump.
// ---------------------------------------------------------------------------

export const windUniforms = {
  uTime: { value: 0 },
  uWindTime: { value: 0 },
  uWind: { value: 0.42 },
  uWindGust: { value: 0.25 },
  uWindTurb: { value: 0.2 },
  uWindSpeed: { value: 1.0 },
  uWindDir: { value: new THREE.Vector2(0.85, 0.52) },
  uSunDir: { value: new THREE.Vector3(0.55, 0.78, 0.30).normalize() },
  uSunColor: { value: new THREE.Color(0xfff1d6) },
};

/** Pack trunk sway weight [0..1], leaf flutter weight [0..1], and isLeaf flag into one float. */
export function packWind(trunk, leaf, isLeaf = true) {
  const v = Math.round(Math.min(1, Math.max(0, trunk)) * 500) + Math.min(0.95, Math.max(0, leaf));
  return isLeaf ? v : -v;
}

export function makeVegMaterial(atlas) {
  const m = new THREE.MeshStandardMaterial({
    map: atlas,
    alphaTest: 0.38,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.74,
    metalness: 0.0,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float wind;
        uniform float uTime;
        uniform float uWindTime;
        uniform float uWind;
        uniform float uWindGust;
        uniform float uWindTurb;
        uniform vec2 uWindDir;
        varying float vLeaf;
        float wHash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float wNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x),
            mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }`)
      .replace('#include <project_vertex>', `
        vLeaf = step(0.0, wind);
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          mvPosition = batchingMatrix * mvPosition;
        #endif
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        {
          float wAbs = abs(wind);
          float wTrunk = min(0.85, floor(wAbs) * 0.002);
          float wLeaf = min(0.65, fract(wAbs));

          vec4 wp0 = mvPosition;
          vec4 wOrigin = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_BATCHING
            wOrigin = batchingMatrix * wOrigin;
          #endif
          #ifdef USE_INSTANCING
            wOrigin = instanceMatrix * wOrigin;
          #endif

          vec2 dir = normalize(uWindDir + vec2(1e-5, 0.0));
          vec2 perp = vec2(-dir.y, dir.x);
          float wt = uWindTime > 0.001 ? uWindTime : uTime;

          float wStr = clamp(uWind, 0.0, 1.20);
          float gustAmt = clamp(uWindGust, 0.0, 1.0);
          float turbAmt = clamp(uWindTurb, 0.0, 1.0);

          float treeSeed = dot(wOrigin.xz, vec2(0.413, 0.619));
          float canopyLag = dot(wp0.xz - wOrigin.xz, dir) * 0.14;

          vec2 uvA = wOrigin.xz * 0.036 - dir * (wt * 0.52) + perp * (wt * 0.15);
          float nGust = wNoise(uvA);
          float nEddy = (wNoise(uvA + vec2(17.2, 11.9)) - 0.5) * 1.4;

          float swayWave = 0.58 * sin(wt * 1.38 + treeSeed - canopyLag + nGust * 1.35)
                         + 0.42 * sin(wt * 1.95 - treeSeed * 1.37 - canopyLag * 1.25);
          float crossWave = 0.65 * cos(wt * 1.22 + treeSeed * 1.71 - canopyLag * 0.85)
                          + 0.35 * sin(wt * 2.08 - treeSeed * 0.89);

          float steadyLean = 0.38 + 0.62 * nGust;
          float dynamicSway = swayWave * (0.58 + 0.42 * nGust) * (0.72 + 0.38 * gustAmt);
          float bendAlong = wTrunk * wStr * (0.68 * steadyLean + 0.88 * dynamicSway);
          float bendCross = wTrunk * wStr * (0.38 * crossWave + 0.24 * nEddy) * (0.55 + 0.45 * turbAmt);

          vec2 trunkDisp = dir * bendAlong + perp * bendCross;
          float hAbove = max(0.8, wp0.y - wOrigin.y);
          float radialReach = length(wp0.xz - wOrigin.xz);
          float boughBob = -wTrunk * wStr * (0.22 * dynamicSway + 0.12 * steadyLean) * clamp(radialReach * 0.22, 0.15, 1.0);
          float arcShorten = -min(hAbove * 0.10, dot(trunkDisp, trunkDisp) / (2.2 * hAbove));

          float leafPhase = dot(wp0.xz, dir) * 0.36 + wp0.y * 0.30 + treeSeed * 2.1;
          float fWave1 = sin(wt * 2.35 - leafPhase + nGust * 1.6);
          float fWave2 = sin(wt * 3.42 + dot(wp0.xz, perp) * 0.38 - wp0.y * 0.26 + treeSeed);
          float rustle = fWave1 * 0.62 + fWave2 * 0.38;
          float envLeaf = 0.68 + 0.52 * nGust * (0.6 + 0.4 * gustAmt);
          float leafAmp = wLeaf * wStr * envLeaf * (0.75 + 0.35 * turbAmt);

          float whipAlong = wLeaf * wStr * 0.26 * steadyLean + leafAmp * rustle * 0.68;
          float whipCross = leafAmp * (0.55 * fWave2);
          float whipVert = leafAmp * (0.50 * fWave1 - 0.16 * steadyLean);

          vec3 worldDelta = vec3(
            trunkDisp.x + dir.x * whipAlong + perp.x * whipCross,
            arcShorten + boughBob + whipVert,
            trunkDisp.y + dir.y * whipAlong + perp.y * whipCross
          );

          float maxDisp = 0.32 + 1.15 * clamp(wTrunk + wLeaf, 0.0, 1.0);
          float dLen = length(worldDelta);
          if (dLen > 1e-4) {
            float x = dLen / maxDisp;
            float softX = x / sqrt(1.0 + x * x);
            worldDelta *= (maxDisp * softX) / dLen;
          }

          mvPosition.xyz += worldDelta;
        }
        vec4 displacedWorld = mvPosition;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
        vec4 worldPosition = modelMatrix * displacedWorld;
      #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying float vLeaf;`)
      .replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.specularColor *= mix(1.0, 0.42, vLeaf);`)
      .replace('#include <alphatest_fragment>', `
        float camDist = length(vViewPosition);
        diffuseColor.a *= 1.0 + smoothstep(20.0, 80.0, camDist) * 0.28 * vLeaf;
        #include <alphatest_fragment>
        diffuseColor.a = 1.0;`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          vec3 Vv = normalize(vViewPosition);
          vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float back = pow(max(dot(-Vv, Lv), 0.0), 3.8);
          float wrap = max(dot(normal, Lv) * 0.5 + 0.5, 0.0);
          float skyDome = clamp(dot(normal, upV) * 0.5 + 0.5, 0.0, 1.0);
          outgoingLight *= mix(1.0, 0.78 + 0.22 * skyDome, vLeaf * 0.56);
          outgoingLight += diffuseColor.rgb * uSunColor * vLeaf * (back * 0.14 + wrap * 0.028);
        }
        diffuseColor.a = 1.0;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'aazhi-veg-v9-mobile';
  return m;
}

/**
 * Rocks: world-space triplanar detail texture (no stretching on any boulder
 * size), distance-attenuated bump from the normal texture (zero mobile normal
 * shimmering), wet/darker band and lower roughness near the waterline.
 */
export function makeRockMaterial({ albedo, normal: normalTex }) {
  const m = new THREE.MeshStandardMaterial({ map: albedo, vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRockNormal = { value: normalTex };
    Object.assign(sh.uniforms, coastUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockW;\nvarying float vRockDist;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            wp = batchingMatrix * wp;
          #endif
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          vRockW = (modelMatrix * wp).xyz;
          vRockDist = length(mvPosition.xyz);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRockW;
varying float vRockDist;
uniform sampler2D uRockNormal;
float rockH;
float vRockWetFilm;
${COAST_GLSL}
vec3 rotateRockCoord(vec3 p) {
  return vec3(
    p.x * 0.80 - p.z * 0.60,
    p.y * 0.88 + p.x * 0.28 + p.z * 0.38,
    p.x * 0.53 + p.z * 0.72 - p.y * 0.44
  );
}`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 wNorm = inverseTransformDirection(normal, viewMatrix);
          if (vRockWetFilm > 0.01 && vRockW.y < 0.85) {
            vec3 Vw = normalize(cameraPosition - vRockW);
            vec3 Rw = reflect(-Vw, wNorm);
            Rw.y = max(Rw.y, 0.04);
            float f1 = clamp(1.0 - max(dot(wNorm, Vw), 0.0), 0.0, 1.0);
            float fr = 0.03 + 0.92 * f1 * f1 * f1 * f1;
            outgoingLight = mix(outgoingLight, skyColor(Rw) * 0.85, clamp(vRockWetFilm * fr * 0.42, 0.0, 0.36));
          }
          if (vRockW.y < uSeaLevel + 0.15) {
            outgoingLight = underwater(outgoingLight, vRockW, max(dot(wNorm, uSunDirW), 0.0));
          }
        }
        #include <opaque_fragment>`)
      .replace('#include <map_fragment>', `
        vec3 wn = inverseTransformDirection(normalize(vNormal), viewMatrix);
        vec3 tw = pow(abs(wn), vec3(4.0)); tw /= (tw.x + tw.y + tw.z + 1e-5);
        vec4 tpA = texture2D(map, vRockW.yz * 0.34) * tw.x + texture2D(map, vRockW.xz * 0.34) * tw.y + texture2D(map, vRockW.xy * 0.34) * tw.z;
        vec4 tp = tpA;
        if (uQualityTier > 1.5 && vRockDist < 22.0) {
          vec3 rpB = rotateRockCoord(vRockW);
          vec4 tpB = texture2D(map, rpB.yz * 0.89 + 0.37) * tw.x + texture2D(map, rpB.xz * 0.89 + 0.37) * tw.y + texture2D(map, rpB.xy * 0.89 + 0.37) * tw.z;
          float microFade = 1.0 - smoothstep(12.0, 22.0, vRockDist);
          tp = mix(tpA, tpB, 0.38 * microFade);
        }
        rockH = dot(tp.rgb, vec3(0.333));
        diffuseColor.rgb *= mix(0.68, 1.28, rockH);
        float wSurf = waterSurf(vRockW.xz);
        float h = vRockW.y - wSurf;
        float sub = smoothstep(0.06, -0.10, h);
        float splash = smoothstep(0.95, -0.05, h) * (1.0 - 0.3 * rockH);
        float seep = smoothstep(0.42, 0.0, h) * smoothstep(0.55, 0.18, rockH);
        float wet = clamp(max(sub, max(splash * 0.90, seep)), 0.0, 1.0);
        float algae = smoothstep(0.28, -0.20, h) * (1.0 - smoothstep(-0.35, -1.2, h)) * smoothstep(0.58, 0.25, rockH);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.86, 0.64), algae * 0.48);
        float salt = smoothstep(0.35, 0.72, h) * (1.0 - smoothstep(0.75, 1.25, h)) * smoothstep(0.52, 0.80, rockH);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.15 + vec3(0.04, 0.04, 0.035), salt * 0.40);
        diffuseColor.rgb *= mix(1.0, 0.42, wet);
        vRockWetFilm = wet * (1.0 - sub * 0.75);
      `)
      .replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        float wSurfR = waterSurf(vRockW.xz);
        float wetR = smoothstep(0.92, -0.06, vRockW.y - wSurfR);
        roughnessFactor = mix(roughnessFactor, 0.14, wetR);
        roughnessFactor = clamp(roughnessFactor + (0.5 - rockH) * 0.14 * (1.0 - wetR * 0.6), 0.10, 0.98);
      `)
      .replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        {
          vec3 wn2 = inverseTransformDirection(normalize(vNormal), viewMatrix);
          vec3 tw2 = pow(abs(wn2), vec3(4.0)); tw2 /= (tw2.x + tw2.y + tw2.z + 1e-5);
          vec3 nA = (texture2D(uRockNormal, vRockW.yz * 0.34).xyz * tw2.x
                   + texture2D(uRockNormal, vRockW.xz * 0.34).xyz * tw2.y
                   + texture2D(uRockNormal, vRockW.xy * 0.34).xyz * tw2.z) * 2.0 - 1.0;
          vec3 n = nA;
          // Attenuate rock bump with distance so shoreline rocks never shimmer on mobile
          float bumpAtten = 1.0 - smoothstep(14.0, 38.0, vRockDist);
          vec3 wBump = vec3(n.y * wn2.x, n.x, n.x * wn2.z) * (0.42 * bumpAtten);
          normal = normalize(normal + (viewMatrix * vec4(wBump, 0.0)).xyz);
        }
      `);
  };
  m.customProgramCacheKey = () => 'aazhi-rock-v3-mobile';
  return m;
}
