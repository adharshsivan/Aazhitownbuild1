import * as THREE from 'three';
import { atmoUniforms, CLOUD_FN_GLSL } from './atmoShared.js';

// Bake warm street-lamp pools into a single 128×128 RGBA texture over `rect` = [x0, z0, x1, z1].
export function makeLampMap(spots = [], rect = [-70, -66, 70, 70], N = 128) {
  const [x0, z0, x1, z1] = rect;
  const sx = (x1 - x0) / N, sz = (z1 - z0) / N;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    const z = z0 + (j + 0.5) * sz;
    for (let i = 0; i < N; i++) {
      const x = x0 + (i + 0.5) * sx;
      let acc = 0;
      for (const s of spots) {
        const lx = s[0] + (s[2] || 0) * 1.1, lz = s[1] + (s[3] || 0) * 1.1;
        const d2 = (x - lx) * (x - lx) + (z - lz) * (z - lz);
        if (d2 > 144) continue;
        acc += Math.exp(-d2 / 24) * 0.85 + Math.exp(-d2 / 64) * 0.25;
      }
      const k = (j * N + i) * 4;
      data[k] = Math.min(255, Math.round(Math.min(1.4, acc) / 1.4 * 255));
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const COMMON_GLSL = /* glsl */`
${CLOUD_FN_GLSL}
uniform float uAtmoTime;
uniform float uMistDensity;
uniform float uMistHeight;
uniform float uWet;
uniform float uPuddle;
uniform float uRainNow;
uniform vec3 uSkyZenW;
uniform vec3 uSkyHorW;
uniform vec3 uLightDirW;
uniform float uLampLevel;
uniform vec4 uLampRect;
uniform sampler2D uLampMap;
uniform sampler2D uPuddleNoise;
uniform float uSurfaceQuality;
varying vec3 vAtmoWPos;
varying vec3 vAtmoWNorm;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Subtle, non-repeating rain-agitated puddle normal perturbation (soft Gaussian dimples + dual-rotated shimmer,
// zero high-frequency concentric rings or grid repetition).
vec2 rippleLayer(vec2 xz, float t, float rain, float seed) {
  vec2 cell = floor(xz);
  vec2 f = fract(xz) - 0.5;
  float h = hash12(cell + seed);
  float rate = 1.15 + 0.55 * h;
  float tt = t * rate + h * 13.37;
  float cyc = floor(tt);
  float ph = fract(tt);

  float fire = hash12(cell + vec2(cyc * 1.73 + seed, cyc * 3.19));
  float activeProb = clamp(0.10 + rain * 0.32, 0.08, 0.42);
  if (fire > activeProb) return vec2(0.0);

  vec2 jitter = (hash22(cell + vec2(cyc * 2.41 + seed, cyc * 5.17 + 8.3)) - 0.5) * 0.48;
  vec2 d = f - jitter;
  float r2 = dot(d, d);
  float life = 4.0 * ph * (1.0 - ph) * (1.0 - ph);
  float env = exp(-r2 * 26.0) * life;
  return -d * (8.5 * env);
}

vec2 puddleRippleField(vec2 xz, float t, float rain) {
  mat2 rot1 = mat2(0.88, -0.47, 0.47, 0.88);
  mat2 rot2 = mat2(0.36,  0.93, -0.93, 0.36);
  vec2 r1 = rippleLayer(rot1 * xz * 1.75, t, rain, 0.0);
  vec2 r2 = rippleLayer(rot2 * xz * 2.43 + vec2(7.1, 3.4), t * 1.13 + 1.9, rain, 17.3);
  vec2 n1 = vec2(0.88 * r1.x + 0.47 * r1.y, -0.47 * r1.x + 0.88 * r1.y);
  vec2 n2 = vec2(0.36 * r2.x - 0.93 * r2.y,  0.93 * r2.x + 0.36 * r2.y);
  return (n1 + n2 * 0.80) * 0.55;
}
`;

export function installSurfaceFx(scene, profileOf) {
  const seen = new Set();
  const patched = [];
  const visit = (m) => {
    if (!m || !m.isMeshStandardMaterial || seen.has(m)) return;
    seen.add(m);
    const prof = profileOf(m);
    if (!prof) return;
    patched.push(m);
    const dark = (prof.dark ?? 0.25).toFixed(3);
    const rough = (prof.rough ?? 0.25).toFixed(3);
    const side = (prof.side ?? 0.4).toFixed(3);
    const refl = (prof.refl ?? 0.2).toFixed(3);
    const hasPuddle = (prof.puddle ?? 0) > 0;
    const puddleK = (prof.puddle ?? 0).toFixed(3);

    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      Object.assign(sh.uniforms, atmoUniforms);

      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vAtmoWPos;\nvarying vec3 vAtmoWNorm;')
        .replace('#include <fog_vertex>', /* glsl */`#include <fog_vertex>
          {
            vec4 awp = vec4(transformed, 1.0);
            vec3 awn = vec3(objectNormal);
            #ifdef USE_BATCHING
              awp = batchingMatrix * awp;
              awn = mat3(batchingMatrix) * awn;
            #endif
            #ifdef USE_INSTANCING
              awp = instanceMatrix * awp;
              awn = mat3(instanceMatrix) * awn;
            #endif
            vAtmoWPos = (modelMatrix * awp).xyz;
            vAtmoWNorm = normalize(mat3(modelMatrix) * awn);
          }`);

      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + COMMON_GLSL)
        .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
          float atmoUp = clamp(vAtmoWNorm.y, 0.0, 1.0);
          float atmoWet = uWet * mix(${side}, 1.0, atmoUp);
          float atmoPud = 0.0;
          ${hasPuddle ? /* glsl */`
          if (uPuddle > 0.01 && uSurfaceQuality >= 0.5 && atmoUp > 0.92 && vAtmoWPos.y > 1.35 && vAtmoWPos.y < 1.92) {
            vec2 pUv1 = vAtmoWPos.xz * 0.029;
            vec2 pUv2 = mat2(0.80, -0.60, 0.60, 0.80) * vAtmoWPos.xz * 0.053 + vec2(0.37, 0.71);
            vec4 pn1 = texture2D(uPuddleNoise, pUv1);
            vec4 pn2 = texture2D(uPuddleNoise, pUv2);
            float pField = pn1.r * 0.55 + pn2.g * 0.45;
            float pAmt = clamp(uPuddle * ${puddleK}, 0.0, 1.0);
            float thresh = 0.68 - pAmt * 0.32;
            atmoPud = smoothstep(thresh - 0.14, thresh + 0.18, pField) * smoothstep(0.0, 0.28, pAmt) * smoothstep(0.92, 0.98, atmoUp);
          }` : ''}
          diffuseColor.rgb *= (1.0 - atmoWet * ${dark} - atmoPud * 0.12);
        `)
        .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, ${rough}, clamp(atmoWet * 0.85, 0.0, 1.0));
          roughnessFactor = mix(roughnessFactor, 0.06, atmoPud * 0.88);
        `)
        .replace('#include <opaque_fragment>', /* glsl */`
          {
            // 1. Drifting cloud shadows (skipped on Low quality tier)
            if (uSurfaceQuality >= 0.5 && uCloudCover > 0.02) {
              float cSh = cloudShadowFactor(vAtmoWPos, uLightDirW);
              outgoingLight *= cSh;
            }
            // 2. Warm street-lamp pools at dusk/night/storm (strong on ground, gentle warm rim on lower foliage)
            if (uLampLevel > 0.01 && vAtmoWPos.y < 5.2) {
              vec2 luv = (vAtmoWPos.xz - uLampRect.xy) / (uLampRect.zw - uLampRect.xy);
              if (luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0) {
                float lPool = texture2D(uLampMap, luv).r * 1.35;
                float gndMask = 1.0 - smoothstep(2.05, 3.8, vAtmoWPos.y);
                float hAtten = (1.0 - smoothstep(1.6, 5.0, vAtmoWPos.y)) * mix(0.28, 0.35 + 0.65 * max(0.0, vAtmoWNorm.y), gndMask);
                outgoingLight += diffuseColor.rgb * vec3(1.0, 0.76, 0.44) * (lPool * uLampLevel * hAtten * mix(0.68, 1.55, gndMask));
              }
            }
            // 3. Wet & puddle sky reflection + subtle refractive puddle-only rain agitation (no painted circles)
            if ((atmoPud > 0.01 || atmoWet > 0.08) && ${refl} > 0.005) {
              vec3 V = normalize(cameraPosition - vAtmoWPos);
              vec3 N = normalize(vAtmoWNorm + vec3(0.0, 1e-4, 0.0));
              ${hasPuddle ? /* glsl */`
              if (uSurfaceQuality >= 1.0 && atmoPud > 0.15 && uRainNow > 0.02) {
                float maxRipDist = uSurfaceQuality >= 2.5 ? 42.0 : 28.0;
                float camD = length(cameraPosition - vAtmoWPos);
                if (camD < maxRipDist) {
                  float distFade = (1.0 - smoothstep(maxRipDist * 0.45, maxRipDist, camD));
                  float pudMask = smoothstep(0.15, 0.65, atmoPud) * smoothstep(0.92, 0.99, atmoUp);
                  vec2 rip = puddleRippleField(vAtmoWPos.xz, uAtmoTime, uRainNow) * (uRainNow * pudMask * distFade);
                  N = normalize(vec3(N.x + rip.x * 0.065, 1.0, N.z + rip.y * 0.065));
                }
              }` : ''}
              vec3 R = reflect(-V, N);
              vec3 skyR = mix(uSkyHorW, uSkyZenW, pow(clamp(R.y, 0.0, 1.0), 0.55));
              float fres = 0.03 + 0.62 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
              float reflK = atmoPud * fres * 0.78 + atmoWet * fres * ${refl};
              outgoingLight = mix(outgoingLight, skyR, clamp(reflK, 0.0, 0.75));
            }
            // 4. Low-lying coastal ground mist (keeps a 22m clear near-field around the camera so nearby trees & props stay vivid)
            if (uMistDensity > 0.0005) {
              float dCam = max(0.0, length(cameraPosition - vAtmoWPos) - 22.0);
              float hAvg = max(0.2, 0.35 * cameraPosition.y + 0.65 * vAtmoWPos.y);
              float mOpt = uMistDensity * dCam * exp(-hAvg / max(1.0, uMistHeight));
              float mVis = 1.0 - exp(-mOpt);
              outgoingLight = mix(outgoingLight, uSkyHorW, clamp(mVis, 0.0, 0.58));
            }
          }
          #include <opaque_fragment>
        `);
    };
    const prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
    m.customProgramCacheKey = () => `${prevKey()}|sfx-v2-${hasPuddle ? 1 : 0}-${dark}`;
    m.needsUpdate = true;
  };

  scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (Array.isArray(o.material)) o.material.forEach(visit);
    else visit(o.material);
  });
  return patched;
}
