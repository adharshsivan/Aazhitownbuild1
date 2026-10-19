import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared coastal shading: one wave model (GLSL + an exact JS twin for floating
// props), a depth-aware underwater term applied by every submerged surface
// (seabed, rocks, seawall, piles, hulls), and the sand / seabed material.
//
// Coast field texture (half float, world [-ext, ext]^2):
//   R = bed height incl. rocks (m)   G = signed distance to shore (m, + seaward)
//   B = beachness (0 rocky .. 1 sand) A = wave phase offset (rad, refraction wobble)
// ---------------------------------------------------------------------------

const placeholder = (() => {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

export const coastUniforms = {
  uWTime: { value: 0 },
  uSeaState: { value: 1.0 },
  uSeaLevel: { value: 0.0 },
  uQualityTier: { value: 2.0 },
  uCoast: { value: placeholder },
  uCoastExt: { value: 160 },
  uSunDirW: { value: new THREE.Vector3(-0.78, 0.52, 0.36).normalize() },
  uSunColW: { value: new THREE.Color(1.0, 0.84, 0.64) },
  uSkyTop: { value: new THREE.Color('#4f8fcf') },
  uSkyHorizon: { value: new THREE.Color('#f1d9b8') },
  // Marine coastal sea optics matching the reference ocean color (#2f6b83 -> #46798e):
  // strong red absorption, moderate green absorption, low blue absorption
  uAbsorb: { value: new THREE.Vector3(0.45, 0.095, 0.045) },
  uInscatter: { value: new THREE.Color('#135870') },
  uScatterK: { value: 0.22 },
  uFoamCol: { value: new THREE.Color('#eef3f5') },
  uCoastTex: { value: placeholder },
  uNoiseTex: { value: placeholder },
  uBoatWake: { value: new THREE.Vector4(106, 5, 0, 1) },
  uBoatParams: { value: new THREE.Vector4(1.0, 0.0, 0.0, 0.0) },
};

// Directional 3D swell components [dirX, dirZ, wavelength, amplitude, phase, steepness].
// Broad, multi-directional coastal swells at incommensurate angles (no S-curve phase warps or lattice chop).
export const SWELLS = [
  [ 0.932, -0.362, 44.0, 0.115, 0.0, 0.16],
  [ 0.643, -0.766, 29.0, 0.078, 1.7, 0.15],
  [ 0.985,  0.174, 19.5, 0.054, 4.1, 0.14],
  [ 0.259, -0.966, 13.8, 0.038, 0.9, 0.13],
  [ 0.788,  0.616, 22.5, 0.028, 2.8, 0.12],
  [-0.423,  0.906, 10.4, 0.020, 5.2, 0.10],
];
// Shore-following (refracted) shoaling rollers: psi = w t + k G + m A + p
export const SHORE = { w1: 1.18, k1: 0.54, a1: 0.145, w2: 1.50, k2: 0.80, m2: 1.35, p2: 2.1, a2: 0.055 };

const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const swellGlsl = SWELLS.map(([dx, dz, L, A, ph, stp]) => {
  const k = (2 * Math.PI) / L, w = Math.sqrt(9.81 * k);
  return `{
      float th = ${f(k)} * dot(vec2(${f(dx)}, ${f(dz)}), p) - ${f(w)} * t + ${f(ph)};
      float s1 = sin(th);
      float wave = s1 + ${f(stp)} * (s1 * s1 - 0.5);
      h += ${f(A)} * wave;
    }`;
}).join('\n    ');

const swellGerstnerGlsl = SWELLS.slice(0, 4).map(([dx, dz, L, A, ph]) => {
  const k = (2 * Math.PI) / L, w = Math.sqrt(9.81 * k);
  return `{
      float th = ${f(k)} * dot(vec2(${f(dx)}, ${f(dz)}), p) - ${f(w)} * t + ${f(ph)};
      disp -= vec2(${f(dx)}, ${f(dz)}) * (${(A * 0.85).toFixed(3)} * cos(th));
    }`;
}).join('\n    ');

export const COAST_GLSL = /* glsl */`
uniform float uWTime;
uniform float uSeaState;
uniform float uSeaLevel;
uniform float uQualityTier;
uniform sampler2D uCoast;
uniform float uCoastExt;
uniform vec3 uSunDirW;
uniform vec3 uSunColW;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uAbsorb;
uniform vec3 uInscatter;
uniform float uScatterK;
uniform vec3 uFoamCol;
uniform sampler2D uCoastTex;
uniform sampler2D uNoiseTex;
uniform vec4 uBoatWake;
uniform vec4 uBoatParams;

vec4 coastAt(vec2 xz) {
  vec2 uv = (xz + uCoastExt) / (2.0 * uCoastExt);
  if (uv.x <= 0.002 || uv.y <= 0.002 || uv.x >= 0.998 || uv.y >= 0.998) {
    vec4 edge = texture2D(uCoast, clamp(uv, 0.002, 0.998));
    float outDist = length(max(abs(xz) - (uCoastExt - 1.0), 0.0));
    float blend = clamp(outDist / 24.0, 0.0, 1.0);
    return mix(edge, vec4(-13.5, edge.g + outDist, 0.0, 0.0), blend);
  }
  return texture2D(uCoast, uv);
}
float swellH(vec2 p, float t) {
  float h = 0.0;
  ${swellGlsl}
  return h * uSeaState;
}
// Horizontal Gerstner orbital displacement for 3D rolling wave geometry (locked near shoreline, rocks & overtopped seawall)
vec2 waterGerstnerXZ(vec2 p, float t, vec4 c) {
  float depth = max(uSeaLevel - c.r, 0.0);
  float surgeCoastDamp = mix(1.0, smoothstep(0.0, 5.5, c.g), clamp((uSeaLevel - 0.3) * 0.7, 0.0, 1.0));
  float deepEnv = smoothstep(0.35, 3.2, depth) * smoothstep(2.0, 12.0, c.g) * (1.0 - 0.85 * c.a) * surgeCoastDamp;
  vec2 disp = vec2(0.0);
  ${swellGerstnerGlsl}
  return disp * deepEnv * uSeaState;
}
float shoreEnv(float G) { return (1.0 - smoothstep(8.0, 42.0, G)) * smoothstep(-2.2, 0.4, G); }
float shoreGroup(vec2 p, float t) { return 0.76 + 0.24 * sin(t * 0.083 + p.x * 0.019 - p.y * 0.015); }
float shoreShoal(vec4 c) {
  float depth = max(uSeaLevel - c.r, 0.0);
  return 1.35 * (1.0 - smoothstep(0.0, 3.2, depth)) * smoothstep(-1.2, 18.0, c.g);
}
float shorePsi1(vec4 c, float t) { return ${f(SHORE.w1)} * t + ${f(SHORE.k1)} * c.g + shoreShoal(c); }
float shorePsi2(vec4 c, float t) { return ${f(SHORE.w2)} * t + ${f(SHORE.k2)} * c.g + shoreShoal(c) * ${f(SHORE.m2)} + ${f(SHORE.p2)}; }

// Water surface height: 3D multi-directional swells + shoaling shore rollers + rock run-up surge
float waterEta(vec2 p, float t, vec4 c) {
  float depth = max(uSeaLevel - c.r, 0.0);
  float env = shoreEnv(c.g);
  // When sea level surges up to meet the island, waves break across the beach/seawall and level into the island flood sheet
  float surgeCoastDamp = mix(1.0, smoothstep(0.0, 5.5, c.g), clamp((uSeaLevel - 0.3) * 0.7, 0.0, 1.0));
  // Green's law shoaling boost before breaking in the shallows
  float shoalBoost = 1.0 + 0.28 * smoothstep(7.5, 1.4, depth) * smoothstep(0.25, 1.2, depth);
  // On sandy beaches (c.b > 0), swells damp across the shallow foreshore; on rocky coasts, swells keep full 3D motion right up to the boulders
  float dampDepth = mix(smoothstep(0.02, 0.65, depth), smoothstep(0.05, 2.0, depth), c.b);
  float sw = swellH(p, t) * dampDepth * shoalBoost * (1.0 - 0.45 * env * c.b) * surgeCoastDamp;
  float psi1 = shorePsi1(c, t);
  float psi2 = shorePsi2(c, t);
  // Asymmetric pitched shore wave: steep forward face toward the shore, long sloping back
  float wShore1 = sin(psi1) + 0.22 * sin(2.0 * psi1 - 0.48);
  float wShore2 = sin(psi2) + 0.16 * sin(2.0 * psi2 - 0.35);
  float swashDamp = smoothstep(-0.18, 0.42, depth);
  float sh = env * swashDamp * (${f(SHORE.a1)} * shoreGroup(p, t) * wShore1 + ${f(SHORE.a2)} * wShore2) * (0.85 + 0.22 * uSeaState) * surgeCoastDamp;
  float baseEta = uSeaLevel + sw + sh;
  // Hydrodynamic wave run-up surge where incoming wave crests wash onto waterline boulders (c.a = rockProx)
  float rockSurge = c.a * max(0.0, baseEta - uSeaLevel + 0.05) * 0.28 * surgeCoastDamp;
  return baseEta + rockSurge;
}

// Shared parametric offshore boat trajectory (rate = 0.112 rad/s)
vec2 boatCenter(float tau) {
  return vec2(
    106.0 + cos(tau) * 34.0 + sin(tau * 2.0) * 4.2,
    5.0 + sin(tau) * 50.0
  );
}
vec2 boatVelocity(float tau) {
  return vec2(
    -sin(tau) * 34.0 + cos(tau * 2.0) * 8.4,
    cos(tau) * 50.0
  ) * 0.1120;
}

// Exact curved-trajectory 3D Kelvin wake & turbulent propeller wash field (zero Voronoi / snake-skin!)
vec2 boatWakeField(vec2 xz, float t) {
  vec2 rel0 = xz - uBoatWake.xy;
  if (abs(rel0.x) > 40.0 || abs(rel0.y) > 40.0) return vec2(0.0);

  float tauNow = uBoatParams.z;
  vec2 bVel0 = boatVelocity(tauNow);
  float curSpd = max(length(bVel0), 0.5);
  vec2 bFwd0 = bVel0 / curSpd;

  // Project world point xz onto the exact historical boat curve via 2 fast Newton steps
  float sEst = clamp(-dot(rel0, bFwd0), -3.4, 34.0);
  float tauH = tauNow - (sEst / curSpd) * 0.1120;
  vec2 pH = boatCenter(tauH);
  vec2 vH = boatVelocity(tauH);
  tauH += clamp(dot(xz - pH, vH) / max(dot(vH, vH), 0.2) * 0.1120, -0.25, 0.25);
  pH = boatCenter(tauH);
  vH = boatVelocity(tauH);
  tauH += clamp(dot(xz - pH, vH) / max(dot(vH, vH), 0.2) * 0.1120, -0.12, 0.12);
  pH = boatCenter(tauH);
  vH = boatVelocity(tauH);

  float vLen = max(length(vH), 0.5);
  vec2 spineFwd = vH / vLen;
  vec2 spineRight = vec2(-spineFwd.y, spineFwd.x);
  vec2 dVec = xz - pH;

  // Curvilinear distance s behind boat center (-3.1m at bow tip .. +33m astern)
  float dtBack = (tauNow - tauH) / 0.1120;
  float s = (dtBack < 0.05) ? -dot(xz - uBoatWake.xy, bFwd0) : dtBack * vLen;
  if (s < -3.3 || s > 33.5) return vec2(0.0);

  float sFromBow = s + 2.95; // 0 at bow stem, ~6.0m at stern transom
  if (sFromBow < -0.4) return vec2(0.0);
  float sPos = max(sFromBow, 0.0);

  float across = abs(dot(dVec, spineRight));
  float maxWakeW = 1.4 + sPos * 0.38;
  if (across > maxWakeW) return vec2(0.0);

  float trailEnv = smoothstep(-0.3, 0.7, sFromBow) * (1.0 - smoothstep(12.0, 33.0, sPos));

  // 1. 3D Kelvin diverging V-wave & transverse stern wave elevation
  float vArmPos = 0.62 + pow(sPos, 0.86) * 0.27;
  float vDist = across - vArmPos;
  float divWave = exp(-vDist * vDist * 1.45) * cos(vDist * 2.85 - sPos * 0.35);
  float behindStern = s - 3.05;
  float sternEnv = smoothstep(-0.6, 1.2, behindStern) * (1.0 - smoothstep(6.0, 28.0, behindStern));
  float transWave = sin(behindStern * 1.65 - t * 3.2) * exp(-across * across * 0.24) * sternEnv;
  float propTrough = exp(-across * across * 1.1) * smoothstep(-0.3, 0.8, behindStern) * (1.0 - smoothstep(3.0, 16.0, behindStern));
  float bowWave = exp(-pow((sFromBow - 1.1) * 0.85, 2.0)) * exp(-pow((across - 0.82) * 1.6, 2.0));

  float spd = uBoatParams.x;
  float h = (divWave * 0.11 + transWave * 0.055 - propTrough * 0.075 + bowWave * 0.13) * trailEnv * spd;

  // 2. Unified turbulent wake envelope (filled churning slipstream + soft Kelvin V-arms, NOT 3 separate stripes)
  float propHalfW = 0.42 + max(0.0, behindStern) * 0.115;
  float propCore = exp(-pow(across / propHalfW, 1.85)) * smoothstep(-0.4, 0.7, behindStern) * (1.0 - smoothstep(6.0, 31.0, behindStern));
  // Turbulent water filling between the prop wash and the Kelvin V-arms so there is no artificial empty gap
  float wakeFill = smoothstep(vArmPos + 0.55, 0.0, across) * smoothstep(1.2, 4.5, sPos) * (1.0 - smoothstep(8.0, 26.0, sPos)) * 0.42;
  float bowChineFoam = exp(-vDist * vDist * 1.85) * smoothstep(0.1, 1.1, sPos) * (1.0 - smoothstep(6.5, 24.0, sPos)) * 0.68;

  float foam = clamp((propCore * 0.95 + bowChineFoam + wakeFill) * spd, 0.0, 1.0);
  return vec2(h, foam);
}
vec3 skyColor(vec3 R) {
  float h = clamp(R.y, 1e-4, 1.0);
  vec3 col = mix(uSkyHorizon, uSkyTop, pow(h, 0.55));
  float s = clamp(dot(R, uSunDirW), 0.0, 1.0);
  float s2 = s * s;
  float s4 = s2 * s2;
  return col + uSunColW * (s4 * s4 * s4) * 0.32;
}
// Light reaching a submerged surface and travelling back up through the water:
// two-way Beer-Lambert absorption, in-scattering towards the water body colour,
// and animated caustics fading with depth.
vec3 underwater(vec3 col, vec3 wp, float sunFacing) {
  if (wp.y > 0.85 + uSeaLevel) return col;                   // above the highest wave: skip the lookups
  vec4 c = coastAt(wp.xz);
  float d = (waterEta(wp.xz, uWTime, c) + boatWakeField(wp.xz, uWTime).x) - wp.y;
  if (d <= 0.0) return col;
  vec3 V = normalize(cameraPosition - wp);
  float cv = sqrt(max(0.05, 1.0 - (1.0 - V.y * V.y) * 0.5625));
  float cl = sqrt(max(0.05, 1.0 - (1.0 - uSunDirW.y * uSunDirW.y) * 0.5625));
  float path = d / max(cv, 0.28) + d / max(cl, 0.28);
  float sunStr = clamp(dot(uSunColW, vec3(0.3333)), 0.0, 1.0);
  if (uQualityTier >= 0.5 && d < 4.5 && sunStr > 0.02) {
    vec2 cp = wp.xz;
    float c1 = texture2D(uCoastTex, cp * 0.17 + vec2(uWTime * 0.019, uWTime * 0.011)).g;
    float caus;
    if (uQualityTier >= 1.5) {
      float c2 = texture2D(uCoastTex, mat2(0.8, -0.6, 0.6, 0.8) * cp * 0.21 - vec2(uWTime * 0.014, -uWTime * 0.017)).g;
      float patchy = texture2D(uNoiseTex, cp * 0.031 + vec2(uWTime * 0.004, 0.0)).b;
      caus = (min(c1, c2) * 2.2 + c1 * c2 * 1.2) * (0.35 + 0.9 * smoothstep(0.3, 0.75, patchy));
    } else {
      caus = c1 * c1 * 2.1;
    }
    float cAmt = smoothstep(0.08, 0.55, d) * (1.0 - smoothstep(2.4, 4.4, d)) * exp(-d * 0.65) * sunFacing * sunStr;
    col *= 1.0 + caus * cAmt * 0.26;
  }
  float soft = smoothstep(0.0, 0.32, d);
  col = col * mix(vec3(1.0), exp(-uAbsorb * path), soft) + uInscatter * (1.0 - exp(-uScatterK * path)) * soft;
  // subtle coastal turbidity softening with optical depth
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(lum) * vec3(0.78, 0.95, 1.02), 0.14 * (1.0 - exp(-path * 0.28)) * soft);
  return max(col, vec3(0.0));
}
`;

/** Patch a built-in lit material so fragments below the waterline get the underwater term (plus world-space coastal moss on the seawall). */
export function patchUnderwater(mat, key) {
  const isStoneWall = key === 'stone';
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, coastUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 uwp = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            uwp = batchingMatrix * uwp;
          #endif
          #ifdef USE_INSTANCING
            uwp = instanceMatrix * uwp;
          #endif
          vUWPos = (modelMatrix * uwp).xyz;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vUWPos;\n${isStoneWall ? 'float vSeawallMoss;\nfloat vSeawallWet;\n' : ''}${COAST_GLSL}`);
    if (isStoneWall) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            // World-space, non-repetitive coastal seawall moss & tidal wetting:
            // - Uses multi-scale world-space noise (uNoiseTex) so patterns never repeat with the 3m stone UV tile
            // - Colonizes recessed mortar joints & stone crevices first, plus irregular wave-splash cushions near the waterline
            vec4 cField = coastAt(vUWPos.xz);
            float baseH = max(-0.06, cField.r);
            float hRel = vUWPos.y - baseH;
            float seaExp = 1.0 - 0.52 * clamp(cField.b, 0.0, 1.0);

            // Detect recessed mortar joints and stone crevices from the stone block albedo
            float stoneLum = dot(diffuseColor.rgb, vec3(0.3333));
            float mortarMask = 1.0 - smoothstep(0.105, 0.225, stoneLum);

            // Multi-octave incommensurate world-space noise around the perimeter
            vec4 nMacro = texture2D(uNoiseTex, vUWPos.xz * 0.014 + vec2(0.19, 0.47));
            vec4 nMacro2 = texture2D(uNoiseTex, vUWPos.xz * 0.037 + vec2(0.61, 0.23));
            float colonyWave = 0.58 * nMacro.r + 0.42 * nMacro2.g;

            vec2 wpA = vec2(vUWPos.x * 0.78 - vUWPos.z * 0.62, vUWPos.y * 1.15);
            vec2 wpB = vec2(vUWPos.z * 0.78 + vUWPos.x * 0.62, vUWPos.y * 1.22);
            vec4 nMesoA = texture2D(uNoiseTex, wpA * 0.15 + nMacro.rg * 0.32);
            vec4 nMesoB = texture2D(uNoiseTex, wpB * 0.21 + nMacro2.ba * 0.32);
            float patchField = 0.54 * nMesoA.r + 0.46 * nMesoB.g;

            vec4 nMicro = texture2D(uNoiseTex, (wpA + wpB * 0.65) * 0.78 + nMesoA.ba * 0.24);
            float tuftGrain = 0.62 * nMicro.b + 0.38 * nMicro.a;

            // 1. Tidal wave-wash & spray zone moss band (undulating upper reach 0.30m..1.05m above waterline/sand)
            float splashTop = 0.28 + 0.76 * smoothstep(0.26, 0.76, colonyWave);
            float tidalBand = smoothstep(-0.30, 0.04, hRel) * (1.0 - smoothstep(0.10, splashTop, hRel));
            float tidalColony = smoothstep(0.41, 0.67, patchField * 0.62 + colonyWave * 0.38 + mortarMask * 0.26);

            // 2. Sparse mortar-joint & damp seepage moss higher on the wall (only in scattered weathered pockets)
            float upperPocket = smoothstep(0.50, 0.75, colonyWave * 0.54 + patchField * 0.46);
            float copingDrip = smoothstep(1.15, 1.56, vUWPos.y) * smoothstep(0.46, 0.72, patchField);
            float creviceMoss = mortarMask * max(upperPocket * 0.76, copingDrip * 0.68) * smoothstep(0.2, 1.55, vUWPos.y);

            float rawMoss = max(tidalBand * tidalColony, creviceMoss);
            float mossAmt = smoothstep(0.24, 0.62, rawMoss * (0.72 + 0.42 * tuftGrain)) * seaExp;
            mossAmt = clamp(mossAmt, 0.0, 0.78);

            // Tidal capillary wetting band just above the waterline
            float wallWet = (1.0 - smoothstep(-0.08, 0.46 + 0.22 * colonyWave, hRel)) * (1.0 - 0.68 * clamp(cField.b, 0.0, 1.0));
            diffuseColor.rgb *= mix(1.0, 0.68, wallWet);

            // Natural 3-tone coastal bryophyte palette (deep damp olive in crevices -> mid cushion green -> warm olive tips)
            vec3 mossDark = vec3(0.036, 0.080, 0.025);
            vec3 mossMid  = vec3(0.074, 0.142, 0.040);
            vec3 mossTip  = vec3(0.122, 0.172, 0.050);
            float toneMix = clamp(tuftGrain * (1.0 - 0.45 * mortarMask) + 0.22 * clamp(hRel, 0.0, 1.0), 0.0, 1.0);
            vec3 mossCol = mix(mossDark, mossMid, smoothstep(0.16, 0.66, toneMix));
            mossCol = mix(mossCol, mossTip, smoothstep(0.58, 0.88, tuftGrain) * smoothstep(0.18, 0.85, hRel) * (1.0 - mortarMask * 0.65));
            mossCol *= mix(1.0, 0.72, wallWet);

            diffuseColor.rgb = mix(diffuseColor.rgb, mossCol, mossAmt);
            vSeawallMoss = mossAmt;
            vSeawallWet = wallWet;
          }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.38, vSeawallWet);
          roughnessFactor = mix(roughnessFactor, 0.94, vSeawallMoss * (1.0 - vSeawallWet * 0.65));`);
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <opaque_fragment>', `outgoingLight = underwater(outgoingLight, vUWPos, 0.6);\n#include <opaque_fragment>`);
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => `${prevKey()}|uw-v3-${key}`;
  return mat;
}

// ---------------------------------------------------------------------------
// JS twin of the GLSL wave model (boats, buoys and wakes ride the same surface)
// ---------------------------------------------------------------------------
export function makeWaterHeight(fieldData, N, ext) {
  const cell = (2 * ext) / N;
  const sample = (x, z, out) => {
    let fx = (x + ext) / cell - 0.5, fz = (z + ext) / cell - 0.5;
    if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) { out[0] = -13.5; out[1] = 300; out[2] = 0; out[3] = 0; return out; }
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const k = (j * N + i) * 4, k2 = k + N * 4;
    for (let c = 0; c < 4; c++) {
      const a = fieldData[k + c], b = fieldData[k + 4 + c], cc = fieldData[k2 + c], d = fieldData[k2 + 4 + c];
      out[c] = (a + (b - a) * tx) * (1 - tz) + (cc + (d - cc) * tx) * tz;
    }
    return out;
  };
  const tmp = [0, 0, 0, 0];
  const sw = SWELLS.map(([dx, dz, L, A, ph, stp]) => {
    const k = (2 * Math.PI) / L;
    return { dx, dz, k, w: Math.sqrt(9.81 * k), A, ph, stp };
  });
  const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  return (x, z, t) => {
    const c = sample(x, z, tmp);
    const seaState = coastUniforms.uSeaState.value || 1.0;
    let h = 0;
    for (const s of sw) {
      const th = s.k * (s.dx * x + s.dz * z) - s.w * t + s.ph;
      const s1 = Math.sin(th);
      const wave = s1 + s.stp * (s1 * s1 - 0.5);
      h += s.A * wave;
    }
    h *= seaState;
    const seaLevel = coastUniforms.uSeaLevel ? (coastUniforms.uSeaLevel.value || 0) : 0;
    const depth = Math.max(seaLevel - c[0], 0);
    const surgeClamp = Math.min(1, Math.max(0, (seaLevel - 0.3) * 0.7));
    const surgeCoastDamp = (1 - surgeClamp) + surgeClamp * ss(0.0, 5.5, c[1]);
    const env = (1 - ss(8, 42, c[1])) * ss(-2.2, 0.4, c[1]);
    const shoalBoost = 1.0 + 0.28 * ss(7.5, 1.4, depth) * ss(0.25, 1.2, depth);
    const dampDepth = ss(0.02, 0.65, depth) * (1 - c[2]) + ss(0.05, 2.0, depth) * c[2];
    h *= dampDepth * shoalBoost * (1 - 0.45 * env * c[2]) * surgeCoastDamp;
    const grp = 0.76 + 0.24 * Math.sin(t * 0.083 + x * 0.019 - z * 0.015);
    const shoal = 1.35 * (1.0 - ss(0.0, 3.2, depth)) * ss(-1.2, 18.0, c[1]);
    const p1 = SHORE.w1 * t + SHORE.k1 * c[1] + shoal;
    const p2 = SHORE.w2 * t + SHORE.k2 * c[1] + shoal * SHORE.m2 + SHORE.p2;
    const wShore1 = Math.sin(p1) + 0.22 * Math.sin(2.0 * p1 - 0.48);
    const wShore2 = Math.sin(p2) + 0.16 * Math.sin(2.0 * p2 - 0.35);
    const swashDamp = ss(-0.18, 0.42, depth);
    const baseEta = seaLevel + h + env * swashDamp * (SHORE.a1 * grp * wShore1 + SHORE.a2 * wShore2) * (0.85 + 0.22 * seaState) * surgeCoastDamp;
    const rockSurge = c[3] * Math.max(0.0, baseEta - seaLevel + 0.05) * 0.28 * surgeCoastDamp;
    return baseEta + rockSurge;
  };
}

// ---------------------------------------------------------------------------
// Sand + seabed material (single terrain mesh from dry berm to offshore floor)
// ---------------------------------------------------------------------------
export function makeCoastGroundMaterial(T) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  const U = {
    uSandA: { value: T.sandA },
    uSandN: { value: T.sandN },
    uBeachDetail: { value: placeholder },
    uBeachRect: { value: new THREE.Vector4(-37, 40, 13, 60) },
    uBeachTexel: { value: new THREE.Vector2(1 / 1536, 1 / 640) },
    uDryCol: { value: new THREE.Color('#d6c29d') },
    uDampCol: { value: new THREE.Color('#b09976') },
    uWetCol: { value: new THREE.Color('#78644c') },
    uBedCol: { value: new THREE.Color('#4e4234') },
    uRubbleCol: { value: new THREE.Color('#383632') },
    uWeedCol: { value: new THREE.Color('#2e3820') },
    uMineralCol: { value: new THREE.Color('#433b33') },
    uFoamCol: { value: new THREE.Color('#cfd8d5') },
  };
  m.userData.uniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, coastUniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\nvarying vec3 vGN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;
        varying vec3 vGN;
        ${COAST_GLSL}
        uniform sampler2D uSandA;
        uniform sampler2D uSandN;
        uniform sampler2D uBeachDetail;
        uniform vec4 uBeachRect;
        uniform vec2 uBeachTexel;
        uniform vec3 uDryCol, uDampCol, uWetCol, uBedCol, uRubbleCol, uWeedCol, uMineralCol;
        vec2 rot2(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
        // Swash: completely smooth, continuous wave run-up and pullback across the beach face (zero step discontinuities)
        float swashState(vec3 wp, vec4 c, float etaNow, out float gloss, out float residue) {
          float t = uWTime;
          float env = shoreEnv(c.g);
          float a1 = max(0.08, ${f(SHORE.a1)} * shoreGroup(wp.xz, t) * env * 1.35);
          float yRel = wp.y - etaNow;
          float runupH = a1 * 1.45 + 0.07;
          float u = yRel / runupH;
          // Continuous smooth transition across yRel = 0 (no if-branch jump at the waterline!)
          float soak = 1.0 - smoothstep(-0.15, 1.15, u);
          float psi = shorePsi1(c, t);
          float receding = 0.5 + 0.5 * cos(psi);
          float uPos = max(0.0, u);
          gloss = exp(-uPos * 2.6) * mix(0.55, 0.32 + 0.45 * receding, smoothstep(-0.10, 0.15, u)) * (1.0 - smoothstep(0.65, 1.15, u));
          residue = exp(-uPos * 3.8) * (1.0 - smoothstep(0.45, 1.0, u)) * smoothstep(-0.15, 0.05, u) * env * 0.45;
          return clamp(max(soak * 0.85, gloss), 0.0, 1.0);
        }`)
      .replace('#include <map_fragment>', `
        vec2 gxz = vGW.xz;
        float gy = vGW.y;
        float gCam = length(cameraPosition - vGW);
        vec4 gC = coastAt(gxz);
        float gBeach = gC.b;
        float etaNow = waterEta(gxz, uWTime, gC);
        float dWaterNow = etaNow - gy;
        vec4 nM = texture2D(uNoiseTex, gxz * 0.012);
        vec4 nS = texture2D(uNoiseTex, gxz * 0.067 + 0.31);
        // ---- moisture zones: wide, gradual, organic transitions (no sharp inner or outer lines!)
        float gGloss, gResidue;
        float gSwash = swashState(vGW, gC, etaNow, gGloss, gResidue);
        float wetTop = 0.18 + 0.05 * nS.b;
        float dampTop = 0.52 + 0.09 * nS.r;
        float gDamp = 1.0 - smoothstep(wetTop - 0.10, dampTop, gy);
        float gWet = max((1.0 - smoothstep(wetTop - 0.22, wetTop + 0.22, gy)) * 0.78, gSwash);
        float gSub = smoothstep(-0.12, 0.48, dWaterNow);
        // ---- colours: smooth, velvety coastal sand without noisy micrograin or blotchy streaks
        vec3 dryC = uDryCol * (0.95 + 0.10 * nM.r) * mix(vec3(1.0), vec3(1.02, 1.0, 0.95), nS.g);
        vec3 dampC = uDampCol * (0.95 + 0.10 * nM.g);
        vec3 wetC = uWetCol * (0.94 + 0.12 * nM.g);
        float rubble = (1.0 - gBeach * 0.92) * (1.0 - smoothstep(1.5, 9.0 + 5.0 * nS.a, gC.g));
        float weed = smoothstep(0.66, 0.82, nS.a * 0.6 + nM.a * 0.4) * (1.0 - smoothstep(-3.0, -1.2, gy)) * (1.0 - rubble) * 0.6;
        vec3 bedC = uBedCol * (0.88 + 0.22 * nM.b);
        bedC = mix(bedC, uRubbleCol * (0.75 + 0.45 * nS.b), rubble);
        bedC = mix(bedC, uWeedCol * (0.8 + 0.4 * nS.g), weed * 0.4);
        vec3 gCol = mix(dryC, dampC, gDamp);
        gCol = mix(gCol, wetC, gWet);
        gCol = mix(gCol, bedC, gSub);
        // Whisper-soft macro tonal warmth (no harsh micrograin speckles or dark wrack/mineral clutter)
        vec3 det = texture2D(uSandA, gxz * 0.14).rgb * 2.0;
        gCol *= mix(vec3(1.0), det, 0.25 * (1.0 - 0.55 * gWet) * (1.0 - smoothstep(50.0, 140.0, gCam)));
        // ---- rock & palm trunk contact occlusion
        vec2 gSlope = vec2(0.0);
        vec2 fuv = (gxz - uBeachRect.xy) / (uBeachRect.zw - uBeachRect.xy);
        if (fuv.x > 0.0 && fuv.y > 0.0 && fuv.x < 1.0 && fuv.y < 1.0) {
          vec4 f0 = texture2D(uBeachDetail, fuv);
          gCol *= mix(0.64, 1.0, f0.g);
        }
        // ---- subtle fading swash bubble residue on freshly washed sand
        vec2 swUv = gxz * 0.14 + vec2(0.0, uWTime * 0.008);
        vec4 swN1 = texture2D(uNoiseTex, swUv);
        vec4 swN2 = texture2D(uNoiseTex, rot2(gxz, 0.68) * 0.34 + swN1.rg * 0.25);
        float lace = swN1.r * 0.45 + swN2.g * 0.55;
        float gRes = gResidue * (1.0 - gSub) * gBeach;
        float resF = smoothstep(0.58 - gRes * 0.22, 0.88 - gRes * 0.16, lace) * gRes;
        gCol = mix(gCol, uFoamCol * 0.78, resF * 0.28);
        diffuseColor.rgb = gCol;
        // ---- gentle wind-swept sand undulation (smooth, zero gritty pits or corduroy stripes)
        float ripFade = 1.0 - smoothstep(28.0, 95.0, gCam);
        vec4 rA = texture2D(uSandN, rot2(gxz, 0.55) * 0.18);
        vec2 sA = rot2(rA.rg * 2.0 - 1.0, -0.55);
        float ripK = mix(mix(0.26, 0.06, gWet), 0.35, gSub) * ripFade;
        gSlope += sA * ripK * 0.14;
        vec3 gN = normalize(vGN);
        vec3 gNw = normalize(vec3(gN.x + gSlope.x * gN.y, gN.y, gN.z + gSlope.y * gN.y));
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(0.95, 0.84, gDamp), 0.48, gWet);
        roughnessFactor = mix(roughnessFactor, 0.22, gGloss * (1.0 - gSub));
        roughnessFactor = mix(roughnessFactor, 0.72, gSub);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(gNw, 0.0)).xyz);`)
      .replace('#include <opaque_fragment>', `
        {
          // glossy wet sand mirrors the sky subtly without creating a bright band
          vec3 Vw = normalize(cameraPosition - vGW);
          vec3 Rw = reflect(-Vw, gNw);
          Rw.y = max(Rw.y, 0.05);
          float f1 = clamp(1.0 - dot(gNw, Vw), 0.0, 1.0);
          float f2 = f1 * f1;
          float fr = 0.02 + 0.98 * f2 * f2 * f1;
          float wetRefl = clamp((gWet * 0.07 + gGloss * 0.16) * (1.0 - gSub) * fr, 0.0, 0.22);
          outgoingLight = mix(outgoingLight, skyColor(Rw) * 0.82, wetRefl);
          outgoingLight = underwater(outgoingLight, vGW, max(dot(gNw, uSunDirW), 0.0));
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'aazhi-coast-ground-v4';
  return m;
}
