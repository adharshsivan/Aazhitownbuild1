import * as THREE from 'three';
import { atmoUniforms } from './atmoShared.js';

// Sky dome: single inverted sphere covering both hemispheres, rendered in one pass
// with dynamic uCloudSteps so Low / Medium / High / Max quality modes scale raymarching
// cost without recompiling the shader.

export function buildSkyDome(scene, { lowQuality = false } = {}) {
  const geo = new THREE.SphereGeometry(2800, 48, 28);
  const uniforms = {
    uZen: { value: new THREE.Color('#1668cc') },
    uHor: { value: new THREE.Color('#add4f4') },
    uGlow: { value: new THREE.Color('#fff0d4') },
    uFogCol: { value: new THREE.Color('#b8d8f2') },
    uBelt: { value: new THREE.Color('#000000') },
    uSunGlowCol: { value: new THREE.Color('#ffe4b8') },
    uSunDisc: { value: new THREE.Color('#ffdcad') },
    uSunDir: { value: new THREE.Vector3(-0.78, 0.52, 0.36).normalize() },
    uMoonDir: { value: new THREE.Vector3(0.5, 0.4, -0.7).normalize() },
    uMoonCol: { value: new THREE.Color('#f4f1e8') },
    uMoonGlow: { value: new THREE.Color('#b8cdf5') },
    uMoonPhaseAngle: { value: Math.PI },
    uStarVis: { value: 0 },
    uStarTime: { value: 0 },
    uStarBasis: { value: new THREE.Matrix3() },
    uCloudLit: { value: new THREE.Color('#fffaf2') },
    uCloudAmb: { value: new THREE.Color('#8eaad0') },
    uCloudDark: { value: new THREE.Color('#3e5270') },
    uDark: { value: 0 },
    uCirrus: { value: 0.25 },
    uScud: { value: 0 },
    uRain: { value: 0 },
    uRainCol: { value: new THREE.Color('#6b737e') },
    uHaze: { value: 0.2 },
    uCityGlow: { value: new THREE.Color('#000000') },
    uFlash: { value: 0 },
    uFlashDir: { value: new THREE.Vector3(1, 0.25, 0) },
    uCloudSteps: { value: lowQuality ? 8 : 12 },
    uCloudTex: atmoUniforms.uCloudTex,
    uCloudOffset: atmoUniforms.uCloudOffset,
    uScudOffset: atmoUniforms.uScudOffset,
    uCloudCover: atmoUniforms.uCloudCover,
    uCloudSoft: atmoUniforms.uCloudSoft,
    uCloudScale: atmoUniforms.uCloudScale,
    uCloudAlt: atmoUniforms.uCloudAlt,
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec3 wp = position + cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        gl_Position.z = gl_Position.w * 0.99999;
      }`,
    fragmentShader: /* glsl */`
      #define MAX_CLOUD_STEPS 16
      uniform vec3 uZen, uHor, uGlow, uFogCol, uBelt, uSunGlowCol, uSunDisc, uSunDir, uMoonDir, uMoonCol, uMoonGlow;
      uniform vec3 uCloudLit, uCloudAmb, uCloudDark, uRainCol, uCityGlow, uFlashDir;
      uniform mat3 uStarBasis;
      uniform float uMoonPhaseAngle, uStarVis, uStarTime, uDark, uCirrus, uScud, uRain, uHaze, uFlash;
      uniform float uCloudCover, uCloudSoft, uCloudScale, uCloudAlt;
      uniform vec2 uCloudOffset, uScudOffset;
      uniform int uCloudSteps;
      uniform sampler2D uCloudTex;
      varying vec3 vDir;

      vec4 texNoise(vec2 p) { return texture2D(uCloudTex, p); }

      vec3 hash33(vec3 p3) {
        p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yxz + 33.33);
        return fract((p3.xxy + p3.yzz) * p3.zyx);
      }

      // 3D spherical pinpoint star layer: zero projection distortion, strictly ~1px pinpoint Airy profile,
      // sparse astronomical magnitude distribution (subtle pinpricks + a few navigational stars).
      vec3 starLayer3D(vec3 sd, float scale, float densityThresh, float pxAng, float minLum, float maxLum, float magPow, float twinkleK) {
        vec3 p = sd * scale;
        vec3 i = floor(p);
        vec3 f = fract(p) - 0.5;
        vec3 h = hash33(i);
        if (h.z < densityThresh) return vec3(0.0);
        vec3 offset = (h - 0.5) * 0.52;
        // Project 3D cell offset perpendicular to view ray sd so stars are perfectly circular at any angle
        vec3 delta = f - offset;
        delta -= sd * dot(delta, sd);
        float dist = length(delta);
        float mag = clamp((h.z - densityThresh) / max(1e-4, 1.0 - densityThresh), 0.0, 1.0);
        // Strictly ~1 screen pixel radius (never fat circles or blobs)
        float rad = clamp(pxAng * scale * (0.88 + 0.22 * pow(mag, 2.0)), 0.028, 0.082);
        float uDist = dist / rad;
        if (uDist >= 1.0) return vec3(0.0);
        float airy = exp(-uDist * uDist * 5.6) * (1.0 - uDist * uDist);
        float tw = 1.0 - twinkleK * 0.18 * (0.5 + 0.5 * sin(uStarTime * (2.0 + h.x * 2.2) + h.y * 41.0));
        float lum = airy * mix(minLum, maxLum, pow(mag, magPow)) * tw;
        float temp = fract(h.x * 7.3 + h.y * 3.1);
        vec3 tint = mix(vec3(1.0, 0.88, 0.74), vec3(0.76, 0.88, 1.0), temp);
        return tint * lum;
      }

      vec3 stars(vec3 d, float y) {
        vec3 sd = normalize(uStarBasis * d);
        float pxAng = clamp(length(fwidth(d)), 0.00042, 0.0019);
        float horFade = smoothstep(0.04, 0.28, y);
        float zenithClear = smoothstep(0.10, 0.45, y);
        // Rotated second basis for background stardust
        vec3 sd2 = vec3(sd.x * 0.80 - sd.z * 0.60, sd.y, sd.x * 0.60 + sd.z * 0.80) + vec3(3.17, 1.91, 5.43);

        // Layer 1: Sparse primary stars (mostly faint 3rd/4th-mag pinpricks, top ~6% are crisp 1st-mag stars)
        vec3 s1 = starLayer3D(sd, 64.0, 0.966, pxAng, 0.05, 0.92, 3.6, 0.8);
        // Layer 2: Delicate, barely-visible background stardust high near zenith
        vec3 s2 = starLayer3D(sd2, 112.0, 0.962, pxAng, 0.02, 0.24, 3.4, 0.3) * zenithClear;
        return (s1 + s2) * horFade;
      }

      // Natural high-altitude multi-octave cumulus density + 3D billow relief (early-out after 2 taps in clear sky)
      float cloudDensity(vec2 p, float h, float cov) {
        if (cov <= 0.005) return 0.0;
        vec2 drift = uCloudOffset * 0.000135;
        vec2 uv = p * 0.000135 + drift;

        mat2 rotA = mat2(0.80, -0.60, 0.60, 0.80);
        vec2 roll1 = vec2(uStarTime * 0.00055, -uStarTime * 0.00042);

        // Tap 1 & 2: macro systems + primary cumulus towers (use s0.gb for organic domain curl with zero extra texture fetch)
        vec4 s0 = texNoise(uv * 0.55 + roll1 * 0.25);
        vec2 curl = (s0.gb - 0.5) * 0.032;
        vec4 s1 = texNoise(rotA * uv * 1.22 + curl + roll1 * 0.6 + vec2(0.19, 0.43));

        float macro = smoothstep(0.23, 0.77, s0.r * 0.56 + s1.r * 0.44);
        float towers = smoothstep(0.20, 0.78, s1.b * 0.58 + s0.a * 0.42);
        float field = macro * 0.64 + towers * 0.36;

        float thresh = clamp(0.75 - cov * 0.66, 0.10, 0.71);
        float soft = max(0.11, uCloudSoft * 0.95);
        float covEnv = smoothstep(thresh - soft * 0.48, thresh + soft * 0.68, field);
        if (covEnv <= 0.002) return 0.0;

        // Tap 3: only fetched inside active clouds for cauliflower billows & fine florets
        mat2 rotB = mat2(0.60, 0.80, -0.80, 0.60);
        vec2 roll2 = vec2(-uStarTime * 0.00095, uStarTime * 0.00078);
        vec4 s2 = texNoise(rotB * uv * 2.75 - drift * 0.38 + roll2 + vec2(h * 0.022, -h * 0.016));

        float turretBoost = smoothstep(0.28, 0.82, s1.g * 0.55 + s2.b * 0.45);
        float domeCrown = clamp(0.28 + 0.72 * covEnv * (0.65 + 0.55 * turretBoost), 0.22, 1.0);
        float baseRamp = smoothstep(0.0, 0.20, h);
        float topRamp = smoothstep(domeCrown, max(0.06, domeCrown - 0.42), h);
        float prof = baseRamp * topRamp;

        float florets = smoothstep(0.18, 0.82, s2.g * 0.52 + s2.r * 0.30 + s2.a * 0.18);
        float edgeMask = (1.0 - covEnv * 0.68) * (0.28 + 0.72 * h);
        float d = max(0.0, covEnv * prof - (1.0 - florets) * 0.26 * edgeMask);
        return clamp(d * 2.25, 0.0, 1.0);
      }

      // Fast 2-tap shadow density sample along light ray
      float cloudShadowTap(vec2 p, float h, float cov) {
        vec2 drift = uCloudOffset * 0.000135;
        vec2 uv = p * 0.000135 + drift;
        mat2 rotA = mat2(0.80, -0.60, 0.60, 0.80);
        vec2 roll1 = vec2(uStarTime * 0.00055, -uStarTime * 0.00042);
        vec4 s0 = texNoise(uv * 0.55 + roll1 * 0.25);
        vec4 s1 = texNoise(rotA * uv * 1.22 + (s0.gb - 0.5) * 0.032 + roll1 * 0.6 + vec2(0.19, 0.43));
        float field = smoothstep(0.23, 0.77, s0.r * 0.56 + s1.r * 0.44) * 0.64
                    + smoothstep(0.20, 0.78, s1.b * 0.58 + s0.a * 0.42) * 0.36;
        float thresh = clamp(0.75 - cov * 0.66, 0.10, 0.71);
        float soft = max(0.11, uCloudSoft * 0.95);
        float covEnv = smoothstep(thresh - soft * 0.48, thresh + soft * 0.68, field);
        float prof = smoothstep(0.0, 0.20, h) * smoothstep(0.95, 0.45, h);
        return clamp(covEnv * prof * 2.0, 0.0, 1.0);
      }

      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;

        // 1. Rich 3-zone tropical sky gradient (Zenith -> Mid Cerulean -> Horizon)
        float t = clamp(y, 0.0, 1.0);
        vec3 midSky = mix(uHor, uZen, 0.62) * vec3(0.95, 1.01, 1.05);
        vec3 sky = mix(uHor, midSky, smoothstep(0.0, 0.24, t));
        sky = mix(sky, uZen, pow(smoothstep(0.08, 0.92, t), 0.72));

        // Anti-solar Belt of Venus & rich, vibrant orange sunset horizon glow
        float muS = max(0.0, dot(d, uSunDir));
        float antiS = max(0.0, dot(vec2(d.x, d.z), -normalize(uSunDir.xz + vec2(1e-4))));
        sky += uBelt * exp(-abs(y - 0.07) * 9.5) * (0.35 + 0.65 * antiS);
        float sunSetK = smoothstep(0.46, -0.02, uSunDir.y);
        float glowBand = exp(-abs(y) * mix(4.0, 2.35, sunSetK));
        float sunDirGlow = (0.14 + 0.86 * pow(muS, mix(2.4, 1.20, sunSetK)));
        sky = mix(sky, uGlow, clamp(glowBand * sunDirGlow * (1.0 + 0.28 * sunSetK), 0.0, 0.96));
        // Extra warm tangerine-orange atmospheric scattering around the low sun
        if (sunSetK > 0.01 && uSunDir.y > -0.06) {
          float sunsetBloom = pow(muS, 3.2) * exp(-max(0.0, y) * 3.2) * sunSetK * smoothstep(-0.06, 0.02, uSunDir.y);
          sky += vec3(1.0, 0.36, 0.04) * sunsetBloom * 0.38 * (1.0 - uCloudCover * 0.65);
        }
        sky += uCityGlow * exp(-max(0.0, y) * 6.5) * smoothstep(-0.04, 0.02, y);

        // 2. Compute 3D Moon disc & Lunar Phase before stars so the physical Moon sphere occludes background stars
        float muM = max(0.0, dot(d, uMoonDir));
        float moonAng = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
        float moonHorIllusion = pow(smoothstep(0.25, -0.02, uMoonDir.y), 1.3);
        float moonRad = mix(0.0125, 0.0180, moonHorIllusion);
        float moonHorFade = smoothstep(-0.015, 0.035, y) * smoothstep(-0.04, 0.03, uMoonDir.y);
        float moonDisk = smoothstep(moonRad * 1.05, moonRad * 0.90, moonAng) * moonHorFade;

        // 3. Crisp 1px pinpoint night stars (occluded by Moon sphere and clouds)
        if (uStarVis > 0.01 && y > 0.03) {
          vec3 stCol = stars(d, y);
          float moonWash = 1.0 - 0.68 * pow(muM, 14.0) * smoothstep(-0.02, 0.1, uMoonDir.y);
          sky += stCol * uStarVis * moonWash * (1.0 - moonDisk);
        }

        // 4. Proper 3D Spherical Moon with Lunar Phases, Lunar Maria, Craters & Earthshine
        if (moonHorFade > 0.001) {
          vec3 mUpRef = abs(uMoonDir.y) < 0.98 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 mRight = normalize(cross(mUpRef, uMoonDir));
          vec3 mUp = cross(uMoonDir, mRight);
          vec2 mUv = vec2(dot(d, mRight), dot(d, mUp)) / moonRad;
          float r2 = dot(mUv, mUv);

          if (r2 < 1.08 && moonDisk > 0.001) {
            float mz = sqrt(max(0.0, 1.0 - min(1.0, r2)));
            vec3 mNorm = normalize(vec3(mUv.x, mUv.y, mz));

            vec2 sphereUv = mNorm.xy * (0.68 + 0.32 / (0.35 + mz));
            vec4 mTex1 = texNoise(sphereUv * 0.42 + vec2(0.31, 0.57));
            vec4 mTex2 = texNoise(sphereUv * 1.15 + vec2(0.73, 0.19));

            float mareImbrium = exp(-dot(mUv - vec2(-0.22, 0.26), mUv - vec2(-0.22, 0.26)) * 11.0);
            float mareSeren = exp(-dot(mUv - vec2(0.16, 0.22), mUv - vec2(0.16, 0.22)) * 13.0);
            float mareTranq = exp(-dot(mUv - vec2(0.32, 0.02), mUv - vec2(0.32, 0.02)) * 12.0);
            float oceanProc = exp(-dot(mUv - vec2(-0.42, -0.05), mUv - vec2(-0.42, -0.05)) * 7.5);
            float mariaBasins = clamp((mareImbrium + mareSeren * 0.9 + mareTranq * 0.85 + oceanProc * 0.8) * (0.65 + 0.55 * mTex1.r), 0.0, 1.0);
            float craters = (mTex2.g - 0.5) * 0.20 + (mTex2.b - 0.5) * 0.12;
            float tychoRay = exp(-dot(mUv - vec2(-0.08, -0.52), mUv - vec2(-0.08, -0.52)) * 28.0) * 0.24;

            vec2 bump = (mTex2.gb - 0.5) * 0.14;
            vec3 bumpedN = normalize(vec3(mNorm.x + bump.x, mNorm.y + bump.y, mNorm.z));

            vec3 phaseLight = normalize(vec3(sin(uMoonPhaseAngle), 0.12 * sin(uMoonPhaseAngle), -cos(uMoonPhaseAngle)));
            float nl = dot(bumpedN, phaseLight);
            float terminator = smoothstep(-0.08, 0.14, nl);

            float lommel = max(0.0, nl) / max(0.18, max(0.0, nl) + mz * 0.65);
            float regolith = mix(lommel, pow(max(0.0, nl), 0.65), 0.55) * terminator;

            vec3 highlandCol = uMoonCol * vec3(1.04, 1.01, 0.94);
            vec3 mareCol = uMoonCol * vec3(0.54, 0.58, 0.66);
            vec3 surfAlbedo = mix(highlandCol, mareCol, mariaBasins * 0.78) * (1.0 + craters + tychoRay);

            vec3 earthshine = vec3(0.055, 0.085, 0.15) * (0.45 + 0.55 * (1.0 - mariaBasins * 0.5)) * (0.4 + 0.6 * mz);
            float rimLight = pow(1.0 - mz, 3.0) * smoothstep(-0.25, 0.25, nl) * 0.25;

            vec3 moonSurf = surfAlbedo * (regolith * 1.35 + rimLight) + earthshine * (1.0 - terminator * 0.85);
            sky = mix(sky, moonSurf, moonDisk * (1.0 - uCloudCover * 0.78));
          }

          float moonHalo = (pow(muM, 24.0) * 0.12 + pow(muM, 180.0) * 0.45 + exp(-moonAng * 48.0) * 0.25);
          sky += uMoonGlow * moonHalo * moonHorFade * (1.0 - uCloudCover * 0.65);
        }

        // 5. Physical Sun: compact high in the sky, swelling into a large, radiant orange sunset disc near the horizon
        float sunFade = smoothstep(-0.025, 0.022, y) * smoothstep(-0.04, 0.02, uSunDir.y);
        float sunAng = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
        if (sunFade > 0.001) {
          float lowSun = smoothstep(0.52, 0.0, uSunDir.y);
          float horizonSun = smoothstep(0.28, -0.02, uSunDir.y);
          float horizonSwell = pow(smoothstep(0.30, -0.015, uSunDir.y), 1.35);

          // Compact overhead (0.0080), swelling naturally to a large sunset disc (0.0255) near the horizon
          float sunRad = mix(0.0080, 0.0255, horizonSwell);
          float rSun = sunAng / sunRad;
          float clearFactor = 1.0 - smoothstep(0.55, 0.98, uCloudCover) * 0.78;

          // Purely additive atmospheric Mie scatter & tight solar aureole (monotonically decreasing outward, never darkens the sky)
          vec3 coronaCol = mix(vec3(1.0, 0.70, 0.26), vec3(1.0, 0.38, 0.05), pow(lowSun, 0.75));
          float wideMie = pow(muS, mix(8.0, 4.5, lowSun)) * (0.16 + 0.24 * lowSun);
          float edgeDist = max(0.0, rSun - 0.92);
          float tightAureole = exp(-edgeDist * mix(2.6, 3.8, horizonSwell)) * (0.42 + 0.22 * (1.0 - horizonSwell));
          sky += coronaCol * (wideMie + tightAureole) * sunFade * clearFactor;

          // Crisp spherical solar photosphere with subtle physical limb darkening (never a blurry circular bullseye gradient)
          float discMask = smoothstep(1.04, 0.93, rSun);
          if (discMask > 0.001) {
            float mu = sqrt(max(0.0, 1.0 - min(1.0, rSun * rSun)));
            // Subtle vertical atmospheric extinction across the large setting solar disc
            float vertTint = clamp((y - uSunDir.y) / max(0.008, sunRad) * 0.5 + 0.5, 0.0, 1.0);
            vec3 sunsetDisc = mix(vec3(2.6, 0.78, 0.08), vec3(3.2, 1.38, 0.22), vertTint);
            vec3 goldDisc = vec3(3.5, 2.05, 0.55);
            vec3 dayDisc = vec3(4.2, 3.55, 2.35);
            vec3 baseDisc = mix(mix(dayDisc, goldDisc, lowSun), sunsetDisc, horizonSun);

            // Physical Eddington limb darkening keeps 85%+ of the disc uniformly incandescent with a warm spherical rim
            float limbDark = mix(0.82, 0.74, horizonSun) + mix(0.18, 0.26, horizonSun) * pow(mu, 0.38);
            vec3 limbWarmth = mix(vec3(1.0, 0.86, 0.65), vec3(1.0, 1.0, 1.0), pow(mu, 0.45));
            vec3 photosphere = max(sky * 1.08, baseDisc * limbDark * limbWarmth);
            sky = mix(sky, photosphere, discMask * sunFade * clearFactor);
          }
        }

        // 6. High cirrus wisps (drifting with upper-troposphere wind shear)
        if (y > 0.02 && uCirrus > 0.01) {
          float yCir = pow(max(0.02, y), 0.68) + 0.12;
          vec2 cirDrift = uCloudOffset * 0.000065 + vec2(uStarTime * 0.00035, -uStarTime * 0.00022);
          vec2 cp = d.xz / yCir * 0.055 + cirDrift;
          float cirRaw = texNoise(cp).a * 0.68 + texNoise(cp * 2.3 - cirDrift * 0.5).g * 0.32;
          float cir = smoothstep(0.52, 0.88, cirRaw) * uCirrus * smoothstep(0.025, 0.22, y);
          vec3 cirCol = mix(uCloudAmb, uCloudLit, 0.80);
          sky = mix(sky, cirCol, cir * 0.42);
        }

        // 7. Volumetric 3D cumulus deck (curved dome projection prevents flat horizontal squashing + 3D normal shading)
        if (y > 0.006 && uCloudCover > 0.01) {
          float yDome = pow(max(0.015, y), 0.64) + 0.14;
          float baseH = uCloudAlt * 2.4;
          float tBase = baseH / yDome;
          vec2 pBase = d.xz * tBase;
          vec2 plumeStepXZ = d.xz * (145.0 + uDark * 40.0) * (0.40 + 0.60 * smoothstep(0.02, 0.45, y));

          int steps = clamp(uCloudSteps, 4, MAX_CLOUD_STEPS);
          float trans = 1.0;
          vec3 acc = vec3(0.0);

          vec3 lDir = uSunDir.y > -0.05 ? uSunDir : uMoonDir;
          float muL = max(0.0, dot(d, lDir));
          float hg = mix(0.20, 1.45, pow(muL, 4.2));
          float stepExtK = (3.6 + uDark * 1.8) / float(steps) * (1.0 + 0.30 * (1.0 - clamp(y, 0.0, 1.0)));

          for (int i = 0; i < MAX_CLOUD_STEPS; i++) {
            if (i >= steps) break;
            float fi = (float(i) + 0.5) / float(steps);
            vec2 pXZ = pBase + plumeStepXZ * fi;
            float dens = cloudDensity(pXZ, fi, uCloudCover);
            if (dens > 0.003) {
              vec2 spXZ = pXZ + lDir.xz * (155.0 + 75.0 * fi);
              float sh = cloudShadowTap(spXZ, clamp(fi + max(0.15, lDir.y) * 0.28, 0.0, 1.0), uCloudCover);

              float gradLight = clamp((dens - sh) * 2.2, -0.6, 0.8);
              float gradUp = clamp((fi - 0.32) * 1.65 + (dens - 0.35) * 0.65, -0.5, 0.9);
              float beer = exp(-sh * (1.75 + uDark * 1.40));
              float powder = 1.0 - 0.52 * exp(-dens * 3.8);
              float heightAO = smoothstep(0.0, 0.72, fi);

              float directTerm = clamp(beer * (0.28 + 0.72 * heightAO + 0.35 * gradLight + 0.22 * gradUp) * mix(1.0, powder, 0.45), 0.0, 1.0);

              vec3 baseShade = mix(uCloudDark, uCloudAmb, smoothstep(0.0, 0.52, fi + gradUp * 0.25) * (1.0 - uDark * 0.55));
              vec3 cCol = mix(baseShade, uCloudLit, smoothstep(0.06, 0.84, directTerm));
              cCol += uCloudLit * hg * beer * exp(-sh * 1.1) * (1.0 - exp(-dens * 3.2)) * 0.42;

              if (uFlash > 0.01) {
                float fDot = max(0.0, dot(d, uFlashDir));
                cCol += vec3(0.75, 0.82, 1.0) * uFlash * pow(fDot, 4.0) * (1.1 - fi * 0.5);
              }
              float a = 1.0 - exp(-dens * stepExtK);
              acc += trans * a * cCol;
              trans *= 1.0 - a;
              if (trans < 0.02) break;
            }
          }
          if (uScud > 0.02 && trans > 0.05) {
            vec2 sp = pBase * 0.00018 + uScudOffset * 0.00018;
            float sc = smoothstep(0.56 - uScud * 0.16, 0.88, texNoise(sp).g * 0.65 + texNoise(sp * 2.1).b * 0.35);
            float scA = sc * uScud * 0.42 * smoothstep(0.015, 0.18, y);
            acc += trans * scA * uCloudDark;
            trans *= (1.0 - scA);
          }
          float aerial = exp(-tBase * 0.000032) * smoothstep(0.008, 0.10, y);
          float alpha = (1.0 - trans) * smoothstep(0.006, 0.07, y);
          vec3 cloudRaw = acc / max(1e-4, 1.0 - trans);
          vec3 cloudFinal = mix(mix(uHor, uFogCol, 0.42), cloudRaw, clamp(aerial, 0.22, 1.0));
          sky = mix(sky, cloudFinal, alpha);
        }

        // 8. Distant rain shafts & horizon fog blend
        if (uRain > 0.02 && y > -0.02 && y < 0.35) {
          float shaft = 0.65 + 0.35 * texNoise(vec2(atan(d.z, d.x) * 3.5 + uCloudOffset.x * 0.0002, y * 1.5)).r;
          float rMask = smoothstep(0.35, 0.02, y) * smoothstep(-0.02, 0.04, y) * uRain * shaft * 0.55;
          sky = mix(sky, uRainCol, rMask);
        }

        float fogBand = 1.0 - smoothstep(-0.02, 0.045 + uHaze * 0.045, y);
        sky = mix(sky, uFogCol, fogBand);
        sky += vec3(0.68, 0.75, 0.98) * uFlash * 0.32;

        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  // Render after opaque world geometry (renderOrder = 1) with depthTest = true and LessEqualDepth
  // so GPU Early-Z rejects 60%+ of sky pixels occluded by terrain, buildings, and trees!
  mat.depthFunc = THREE.LessEqualDepth;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, uniforms };
}

// ---------------------------------------------------------------------------
// Clean, Soft Optical Camera Lens Flare (warm radial lens bloom + delicate bokeh ghosts, no spiky lines)
// ---------------------------------------------------------------------------
export function buildLensFlare(scene) {
  const geo = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    uSunScreen: { value: new THREE.Vector2(0, 0) },
    uAspect: { value: 1.77 },
    uIntensity: { value: 0.0 },
    uFlareCol: { value: new THREE.Color('#ff9d42') },
    uSunsetK: { value: 0.0 },
    uTime: { value: 0.0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vNdc;
      void main() {
        vNdc = position.xy;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec2 uSunScreen;
      uniform float uAspect;
      uniform float uIntensity;
      uniform float uSunsetK;
      uniform float uTime;
      uniform vec3 uFlareCol;
      varying vec2 vNdc;

      // Soft, out-of-focus coated lens bokeh ghost (smooth Gaussian orb)
      float softGhost(vec2 uv, vec2 center, float rad, float ringMix) {
        float r = length(uv - center) / max(1e-4, rad);
        if (r >= 1.25) return 0.0;
        float fill = exp(-r * r * 3.0) * (1.0 - ringMix * 0.40);
        float softRim = exp(-pow(r - 0.80, 2.0) * 20.0) * smoothstep(1.22, 0.72, r) * ringMix;
        return fill + softRim * 0.45;
      }

      void main() {
        if (uIntensity <= 0.002) discard;

        vec2 uv = vec2(vNdc.x * uAspect, vNdc.y);
        vec2 sPos = vec2(uSunScreen.x * uAspect, uSunScreen.y);
        vec2 toSun = uv - sPos;
        float dSun = length(toSun);

        // 1. Smooth, warm radial camera-lens bloom around the sun (zero artificial spiky lines!)
        vec3 warmGold = mix(vec3(1.0, 0.68, 0.24), vec3(1.0, 0.38, 0.06), uSunsetK);
        float radialVeil = exp(-dSun * 15.0) * 0.14 + exp(-dSun * 48.0) * 0.20;
        vec3 col = mix(uFlareCol, warmGold, 0.65) * radialVeil;

        // 2. Whisper-soft coated lens bokeh ghosts along the optical axis
        float axisLen = length(sPos);
        float offCenterFade = smoothstep(0.12, 0.38, axisLen);
        float sunClearance = smoothstep(0.10, 0.26, dSun);
        float ghostEnv = offCenterFade * sunClearance;

        if (ghostEnv > 0.005) {
          vec3 warmTint = mix(vec3(1.0, 0.76, 0.42), vec3(1.0, 0.48, 0.18), uSunsetK);
          vec3 cyanTint = mix(vec3(0.52, 0.86, 0.82), vec3(1.0, 0.66, 0.36), uSunsetK * 0.65);
          vec3 amberTint = mix(vec3(1.0, 0.62, 0.46), vec3(1.0, 0.42, 0.16), uSunsetK * 0.70);

          col += warmTint  * softGhost(uv,  sPos * 0.48, 0.038, 0.30) * 0.048 * ghostEnv;
          col += cyanTint  * softGhost(uv, -sPos * 0.28, 0.052, 0.40) * 0.038 * ghostEnv;
          col += warmTint  * softGhost(uv, -sPos * 0.58, 0.092, 0.50) * 0.032 * ghostEnv;
          col += amberTint * softGhost(uv, -sPos * 0.86, 0.042, 0.35) * 0.044 * ghostEnv;
        }

        float edgeVignette = smoothstep(1.02, 0.72, max(abs(vNdc.x), abs(vNdc.y)));
        col *= uIntensity * edgeVignette;

        float maxC = max(col.r, max(col.g, col.b));
        if (maxC < 0.0015) discard;

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 995;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, uniforms };
}
