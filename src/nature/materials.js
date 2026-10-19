import * as THREE from 'three';
import { ATLAS_W, ATLAS_H } from './atlas.js';
import { coastUniforms, COAST_GLSL } from '../world/coastShading.js';

// Shared nature materials (one for all vegetation, one for all rocks).

export const windUniforms = {
  uTime: { value: 0 },
  uWindTime: { value: 0 },
  uWind: { value: 0.72 },
  uWindSpeed: { value: 1.0 },
  uWindDir: { value: new THREE.Vector2(0.84, 0.54).normalize() },
  uWindGust: { value: 0.48 },
  uWindTurb: { value: 0.42 },
  uSunDir: { value: new THREE.Vector3(-0.78, 0.52, 0.36).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.84, 0.64) },
};

/**
 * Vegetation: atlas map + vertex colour (tint/AO) + per-instance colour.
 * - Unpacks `wind` attribute into:
 *     - `isLeaf` (sign >= 0 for leaves/fronds, < 0 for woody trunks/branches)
 *     - `wTrunk` (floor(abs(wind)) * 0.002): continuous cantilever trunk & branch sway
 *     - `wLeaf`  (fract(abs(wind))): cohesive foliar sway, bobbing & frond flutter
 * - Combines a 2D travelling wind-gust wave across the island with irrational-ratio
 *   multi-harmonic sway so trunks, bark, branches, and leaves visibly bend and sway
 *   with natural rhythm, never repeating on a loop and softly saturating in storms.
 */
export function makeVegMaterial(atlas) {
  const m = new THREE.MeshStandardMaterial({
    map: atlas, vertexColors: true, side: THREE.DoubleSide,
    alphaTest: 0.46, alphaToCoverage: false, roughness: 0.88, metalness: 0,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float wind;
        uniform float uTime;
        uniform float uWindTime;
        uniform float uWind;
        uniform float uWindSpeed;
        uniform vec2 uWindDir;
        uniform float uWindGust;
        uniform float uWindTurb;
        varying float vLeaf;

        float wHash(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.5);
          return fract(p.x * p.y);
        }
        float wNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
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
          // Match packWind's * 500 scale (0.002 = 1/500)
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

          // Smoothly bounded wind strength: clearly visible in fair breezes, controlled in storms
          float wStr = clamp(uWind, 0.0, 1.20);
          float gustAmt = clamp(uWindGust, 0.0, 1.0);
          float turbAmt = clamp(uWindTurb, 0.0, 1.0);

          // Per-instance unique seed + continuous spatial lag across the crown
          float treeSeed = dot(wOrigin.xz, vec2(0.413, 0.619));
          float canopyLag = dot(wp0.xz - wOrigin.xz, dir) * 0.14;

          // 2D travelling wind-gust waves across the island (incommensurate drift -> never loops)
          vec2 uvA = wOrigin.xz * 0.036 - dir * (wt * 0.52) + perp * (wt * 0.15);
          vec2 uvB = wOrigin.xz * 0.082 - dir * (wt * 0.88) - perp * (wt * 0.27) + vec2(19.7, 7.3);
          float nGust = wNoise(uvA) * 0.62 + wNoise(uvB) * 0.38;
          float nEddy = (wNoise(uvA + vec2(37.2, 11.9)) - 0.5) * 1.2
                      + (wNoise(uvB + vec2(9.4, 51.3)) - 0.5) * 0.8;

          // Irrational-ratio multi-harmonic sway (1 : sqrt(2) : sqrt(5)) warped by travelling noise
          // Gives a graceful, visible swaying rhythm that never repeats on a loop
          float swayWave = 0.52 * sin(wt * 1.38 + treeSeed - canopyLag + nGust * 1.35)
                         + 0.31 * sin(wt * 1.95 - treeSeed * 1.37 - canopyLag * 1.25)
                         + 0.17 * cos(wt * 3.09 + treeSeed * 0.73);
          float crossWave = 0.60 * cos(wt * 1.22 + treeSeed * 1.71 - canopyLag * 0.85)
                          + 0.40 * sin(wt * 2.08 - treeSeed * 0.89);

          // 1. Expressive, continuous bark, trunk & branch bending (leaves & branches stay 100% welded)
          float steadyLean = 0.38 + 0.62 * nGust;
          float dynamicSway = swayWave * (0.58 + 0.42 * nGust) * (0.72 + 0.38 * gustAmt);
          float bendAlong = wTrunk * wStr * (0.68 * steadyLean + 0.88 * dynamicSway);
          float bendCross = wTrunk * wStr * (0.38 * crossWave + 0.24 * nEddy) * (0.55 + 0.45 * turbAmt);

          vec2 trunkDisp = dir * bendAlong + perp * bendCross;
          float hAbove = max(0.8, wp0.y - wOrigin.y);
          float radialReach = length(wp0.xz - wOrigin.xz);
          float boughBob = -wTrunk * wStr * (0.22 * dynamicSway + 0.12 * steadyLean) * clamp(radialReach * 0.22, 0.15, 1.0);
          float arcShorten = -min(hAbove * 0.10, dot(trunkDisp, trunkDisp) / (2.2 * hAbove));

          // 2. Cohesive leaf cluster & frond sway, bobbing & tip flutter (smooth spatial wavelength so quads never stretch)
          float leafPhase = dot(wp0.xz, dir) * 0.36 + wp0.y * 0.30 + treeSeed * 2.1;
          float fWave1 = sin(wt * 2.35 - leafPhase + nGust * 1.6);
          float fWave2 = sin(wt * 3.42 + dot(wp0.xz, perp) * 0.38 - wp0.y * 0.26 + treeSeed);
          float fWave3 = cos(wt * 4.65 - leafPhase * 1.25 + treeSeed * 0.7);
          float rustle = fWave1 * 0.52 + fWave2 * 0.31 + fWave3 * 0.17;
          float envLeaf = 0.68 + 0.52 * nGust * (0.6 + 0.4 * gustAmt);
          float leafAmp = wLeaf * wStr * envLeaf * (0.75 + 0.35 * turbAmt);

          float whipAlong = wLeaf * wStr * 0.26 * steadyLean + leafAmp * rustle * 0.68;
          float whipCross = leafAmp * (0.44 * fWave2 + 0.24 * fWave3);
          float whipVert = leafAmp * (0.50 * fWave1 - 0.16 * steadyLean);

          vec3 worldDelta = vec3(
            trunkDisp.x + dir.x * whipAlong + perp.x * whipCross,
            arcShorten + boughBob + whipVert,
            trunkDisp.y + dir.y * whipAlong + perp.y * whipCross
          );

          // Smooth soft-knee saturation so even extreme storms/tornadoes never tear or over-deform meshes
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
        // Keep a natural waxy cuticle sheen on leaves in sun & rain without heavy plastic white glare across broad leaf quads
        material.specularColor *= mix(1.0, 0.52, vLeaf);`)
      .replace('#include <alphatest_fragment>', `
        float camDist = length(vViewPosition);
        diffuseColor.a *= 1.0 + smoothstep(26.0, 95.0, camDist) * 0.24 * vLeaf;
        #include <alphatest_fragment>
        diffuseColor.a = 1.0;`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          vec3 Vv = normalize(vViewPosition);
          vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float back = pow(max(dot(-Vv, Lv), 0.0), 3.8);
          float wrap = max(dot(normal, Lv) * 0.5 + 0.5, 0.0);
          // Sky-dome canopy relief: shade interior/underside foliage (0.76) up to 1.00 at zenith without over-amplifying crown tops
          float skyDome = clamp(dot(normal, upV) * 0.5 + 0.5, 0.0, 1.0);
          outgoingLight *= mix(1.0, 0.76 + 0.24 * skyDome, vLeaf * 0.60);
          outgoingLight += diffuseColor.rgb * uSunColor * vLeaf * (back * 0.14 + wrap * 0.028);
        }
        diffuseColor.a = 1.0;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'aazhi-veg-v8';
  return m;
}

/**
 * Rocks: world-space triplanar detail texture (no stretching on any boulder
 * size), derivative bump from the same texture, wet/darker band and lower
 * roughness near the waterline, faint algae tint below it.
 */
export function makeRockMaterial({ albedo, normal: normalTex }) {
  const m = new THREE.MeshStandardMaterial({ map: albedo, vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRockNormal = { value: normalTex };
    Object.assign(sh.uniforms, coastUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockW;')
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
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRockW;
uniform sampler2D uRockNormal;
float rockH;
float vRockWetFilm;
${COAST_GLSL}
vec3 rotateRockCoord(vec3 p) {
  // Incommensurate 3D rotation to break up any multi-scale triplanar repetition across large boulders
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
          outgoingLight = underwater(outgoingLight, vRockW, max(dot(wNorm, uSunDirW), 0.0));
        }
        #include <opaque_fragment>`)
      .replace('#include <map_fragment>', `
        vec3 wn = inverseTransformDirection(normalize(vNormal), viewMatrix);
        vec3 tw = pow(abs(wn), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        vec3 tpA = vRockW * 0.34;
        vec3 tpB = rotateRockCoord(vRockW) * 0.89 + vec3(13.7, 7.1, 29.3);
        vec4 triA = texture2D(map, tpA.zy) * tw.x + texture2D(map, tpA.xz) * tw.y + texture2D(map, tpA.xy) * tw.z;
        vec4 triB = texture2D(map, tpB.zy) * tw.x + texture2D(map, tpB.xz) * tw.y + texture2D(map, tpB.xy) * tw.z;
        vec3 triRgb = mix(triA.rgb, triB.rgb, 0.44);
        rockH = dot(triRgb, vec3(0.333));
        diffuseColor.rgb *= triRgb * 2.85;
        diffuseColor.rgb *= mix(0.52, 1.0, smoothstep(-0.55, 0.45, wn.y));   // under-sides / joints between stones

        // Live wave-height interaction on the 3D boulder surface
        vec4 cRock = coastAt(vRockW.xz);
        float etaRock = waterEta(vRockW.xz, uWTime, cRock);
        float hAboveWave = vRockW.y - etaRock;
        // Tidal splash darkening + live wave-wash draining film (0..38cm above instantaneous wave surface)
        float tidalWet = 1.0 - smoothstep(0.05, 0.72, vRockW.y);
        float waveWash = 1.0 - smoothstep(-0.04, 0.38, hAboveWave);
        float wet = max(tidalWet * 0.78, waveWash);
        vRockWetFilm = waveWash * smoothstep(-0.08, 0.01, hAboveWave);
        diffuseColor.rgb *= mix(1.0, 0.52, wet);
        // Intertidal marine algae tint in the lower wave-washed zone
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.76, 0.91, 0.70), (1.0 - smoothstep(-0.35, 0.22, vRockW.y)) * 0.78);
        // Subtle 3D waterline contact meniscus where a rising wave crest meets the stone face
        float meniscusBand = exp(-pow(hAboveWave / 0.032, 2.0)) * smoothstep(-0.08, 0.18, etaRock);
        if (meniscusBand > 0.01) {
          float fNoise = texture2D(uNoiseTex, vRockW.xz * 0.28 + vec2(uWTime * 0.03, -uWTime * 0.02)).r;
          float mMask = smoothstep(0.32, 0.75, fNoise + meniscusBand * 0.35) * meniscusBand * 0.52;
          diffuseColor.rgb = mix(diffuseColor.rgb, uFoamCol * 0.88, mMask);
        }
        diffuseColor.rgb *= 1.0 + 0.12 * smoothstep(0.55, 0.95, wn.y) * smoothstep(0.6, 1.4, vRockW.y);
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor *= mix(1.0, 0.36, 1.0 - smoothstep(-0.1, 0.72, vRockW.y));
        roughnessFactor = mix(roughnessFactor, 0.15, vRockWetFilm * 0.85);
        roughnessFactor *= 0.9 + 0.2 * rockH;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // Dual-scale world-space triplanar normal mapping, whiteout blend (zero tiling or screen derivatives)
          vec3 gn = inverseTransformDirection(normal, viewMatrix);
          vec3 bw = pow(abs(gn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 tpA = vRockW * 0.34;
          vec3 tpB = rotateRockCoord(vRockW) * 0.89 + vec3(13.7, 7.1, 29.3);
          vec3 nXA = texture2D(uRockNormal, tpA.zy).xyz * 2.0 - 1.0;
          vec3 nYA = texture2D(uRockNormal, tpA.xz).xyz * 2.0 - 1.0;
          vec3 nZA = texture2D(uRockNormal, tpA.xy).xyz * 2.0 - 1.0;
          vec3 nXB = texture2D(uRockNormal, tpB.zy).xyz * 2.0 - 1.0;
          vec3 nYB = texture2D(uRockNormal, tpB.xz).xyz * 2.0 - 1.0;
          vec3 nZB = texture2D(uRockNormal, tpB.xy).xyz * 2.0 - 1.0;
          vec3 nX = normalize(mix(nXA, nXB, 0.42));
          vec3 nY = normalize(mix(nYA, nYB, 0.42));
          vec3 nZ = normalize(mix(nZA, nZB, 0.42));
          nX = vec3(nX.xy + gn.zy, abs(nX.z) * gn.x);
          nY = vec3(nY.xy + gn.xz, abs(nY.z) * gn.y);
          nZ = vec3(nZ.xy + gn.xy, abs(nZ.z) * gn.z);
          vec3 wN = normalize(nX.zyx * bw.x + nY.xzy * bw.y + nZ.xyz * bw.z);
          normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
        }`);
  };
  m.customProgramCacheKey = () => 'aazhi-rock-v5';
  return m;
}
