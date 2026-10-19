import * as THREE from 'three';
import { FN, FEXT, FCELL, vnoise, sstep, boxBlur } from './coastField.js';
import { coastUniforms, COAST_GLSL, makeWaterHeight } from './coastShading.js';

// ---------------------------------------------------------------------------
// Ocean surface + coastal wave field:
//  - Packs the 4-channel coast field texture (R = bed height incl. rocks,
//    G = signed shore distance, B = beachness, A = wave refraction phase)
//    into coastUniforms.uCoast using HalfFloatType so LinearFilter is natively
//    supported across all desktop and mobile WebGL2 GPUs.
//  - Renders the ocean with quality-adaptive detail (uQualityTier in coastUniforms)
//    so High runs at 60+ FPS on desktop and Medium runs at 30-60 FPS on mobile.
// ---------------------------------------------------------------------------

function buildCoastFieldTexture(data) {
  const C = data.coast;
  const N = FN, ext = FEXT, cell = FCELL;
  const rockProxRaw = new Float32Array(N * N);

  // Compute smooth proximity to waterline boulders in channel A (c.a) WITHOUT
  // ever corrupting channel R (c.r = true seabed/beach elevation C.H).
  // That way the 3D water surface stays 100% continuous right through the 3D rock
  // meshes (clipped pixel-perfectly by the hardware depth buffer, zero waterless holes!)
  // while waves surge and break naturally where crests meet the rocks.
  for (const r of (data.rocks || [])) {
    if (r.bottom > 0.36 || r.top < -0.48 || r.role === 'pebble') continue;
    const midY = 0.5 * (r.bottom + r.top);
    const halfH = Math.max(0.15, 0.5 * (r.top - r.bottom));
    const yRel = Math.min(0.85, Math.abs(midY) / halfH);
    const rWater = r.Rg * Math.sqrt(Math.max(0.20, 1.0 - yRel * yRel));
    const rad = rWater + 0.42;
    const awashK = sstep(-0.48, 0.02, r.top) * (1.0 - sstep(0.18, 0.36, r.bottom));
    if (awashK <= 0.01) continue;
    const i0 = Math.max(0, Math.floor((r.x - rad + ext) / cell));
    const i1 = Math.min(N - 1, Math.ceil((r.x + rad + ext) / cell));
    const j0 = Math.max(0, Math.floor((r.z - rad + ext) / cell));
    const j1 = Math.min(N - 1, Math.ceil((r.z + rad + ext) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = -ext + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = -ext + (i + 0.5) * cell;
        const d = Math.hypot(x - r.x, z - r.z);
        if (d > rad) continue;
        const p = (1.0 - sstep(rWater * 0.55, rad, d)) * awashK;
        const k = j * N + i;
        if (p > rockProxRaw[k]) rockProxRaw[k] = p;
      }
    }
  }
  const rockProx = boxBlur(rockProxRaw, N, 1, 1);

  // Full 1024×1024 half-float texture matching coastField 1:1 (zero downsampling mismatch with coast-ground)
  const M = N;
  const out = new Float32Array(M * M * 4);
  const half = new Uint16Array(M * M * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let kSrc = 0; kSrc < M * M; kSrc++) {
    const kDst = kSrc * 4;
    const h = C.H[kSrc];
    const sd = C.sd[kSrc];
    const bi = C.BI[kSrc];
    const rp = rockProx[kSrc];
    out[kDst]     = h;
    out[kDst + 1] = sd;
    out[kDst + 2] = bi;
    out[kDst + 3] = rp;
    half[kDst]     = toHalf(h);
    half[kDst + 1] = toHalf(sd);
    half[kDst + 2] = toHalf(bi);
    half[kDst + 3] = toHalf(rp);
  }
  const tex = new THREE.DataTexture(half, M, M, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { tex, data: out, M, ext };
}

function buildWaterGeometry(ext = 1500, coast = null) {
  // Dense non-uniform grid around the island, pocket beach, and offshore boat circuit
  const steps = [];
  let p = -ext;
  while (p < ext) {
    steps.push(p);
    const a = Math.abs(p);
    const s = a < 68 ? 1.05 : a < 152 ? 2.1 : a < 260 ? 5.5 : a < 520 ? 18 : 68;
    p = Math.min(ext, p + s);
  }
  steps.push(ext);
  const N = steps.length;
  const pos = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) {
    const z = steps[j];
    for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 3;
      pos[k] = steps[i];
      pos[k + 1] = 0;
      pos[k + 2] = z;
    }
  }
  const idx = [];
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      const x0 = steps[i], x1 = steps[i + 1], z0 = steps[j], z1 = steps[j + 1];
      // Skip cells buried deep inside the island seawall perimeter (keep a 2.4m overlap rim for storm surge overtopping)
      if (coast && x0 > -65 && x1 < 65 && z0 > -60 && z1 < 46) {
        if (
          coast.wallDist(x0, z0) < -2.4 &&
          coast.wallDist(x1, z0) < -2.4 &&
          coast.wallDist(x0, z1) < -2.4 &&
          coast.wallDist(x1, z1) < -2.4
        ) continue;
      } else if (x0 > -42 && x1 < 42 && z0 > -34 && z1 < 28) {
        continue;
      }
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeBoundingSphere();
  return geo;
}

export function buildWater(scene, data, coastT, fog) {
  const cf = buildCoastFieldTexture(data);
  coastUniforms.uCoast.value = cf.tex;
  coastUniforms.uCoastExt.value = cf.ext;

  const uniforms = {
    ...coastUniforms,
    uWaterN: { value: coastT.waterN },
    uFogCol: { value: fog.color },
    uFogNear: { value: fog.near },
    uFogFar: { value: fog.far },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: true,
    vertexShader: /* glsl */`
      ${COAST_GLSL}
      varying vec3 vW;
      varying float vEta;
      void main() {
        vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
        if (abs(wp.x) < 240.0 && abs(wp.z) < 240.0) {
          vec4 c = coastAt(wp.xz);
          vec2 gDisp = waterGerstnerXZ(wp.xz, uWTime, c);
          wp.xz += gDisp;
          vec4 cDisp = coastAt(wp.xz);
          float eta = waterEta(wp.xz, uWTime, cDisp) + boatWakeField(wp.xz, uWTime).x;
          float dVert = eta - cDisp.r;
          float surgeFade = 1.0 - smoothstep(0.6, 1.5, uSeaLevel);
          float beachLift = cDisp.b * 0.055 * smoothstep(-0.35, 0.05, dVert) * (1.0 - smoothstep(0.60, 2.40, dVert)) * surgeFade;
          wp.y = eta + beachLift;
          vEta = eta;
        } else {
          wp.y = uSeaLevel + swellH(wp.xz, uWTime);
          vEta = wp.y;
        }
        vW = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${COAST_GLSL}
      uniform sampler2D uWaterN;
      uniform vec3 uFogCol;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec3 vW;
      varying float vEta;

      vec2 rotW(vec2 v, float a) {
        float c = cos(a), s = sin(a);
        return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
      }

      // Smooth, aperiodic, golden-angle rotated water normal blend:
      // Combines 4 incommensurate rotations and scales of the multi-directional capillary spectrum
      // with gentle macro noise cross-blending so ripples feel like liquid water with zero grass streaks or tiling.
      vec2 aperiodicWaveSlope(vec2 xz, float t, float nearFade, float midFade, float farAtten, vec4 macA, vec4 macB) {
        vec2 w1 = (macA.rg - 0.5) * 3.4 + (macB.ba - 0.5) * 1.6;
        vec2 w2 = (macA.ba - 0.5) * 2.2 - (macB.rg - 0.5) * 1.4;

        // Broad swell-ripple octaves rotated by golden-ratio angles (0°, 65°, 137°) and irrational scales
        vec2 n1 = texture2D(uWaterN, (xz + w1) * 0.043 + vec2(t * 0.016, -t * 0.011)).rg * 2.0 - 1.0;
        vec2 n2 = texture2D(uWaterN, rotW(xz - w1 * 0.7, 1.14) * 0.071 + vec2(-t * 0.014, t * 0.018)).rg * 2.0 - 1.0;
        vec2 n3 = texture2D(uWaterN, rotW(xz + w2, 2.399) * 0.118 + vec2(t * 0.021, t * 0.015)).rg * 2.0 - 1.0;

        vec2 s1 = n1;
        vec2 s2 = rotW(n2, -1.14);
        vec2 s3 = rotW(n3, -2.399);

        float b12 = smoothstep(0.20, 0.80, macA.b * 0.6 + macB.r * 0.4);
        vec2 grad = mix(s1, s2, b12) * (0.048 * farAtten) + s3 * (0.036 * midFade * (0.55 + 0.45 * macB.g));

        // Close-range capillary shimmer (within 38m, rotated at 232° and 310°)
        if (nearFade > 0.005) {
          vec2 n4 = texture2D(uWaterN, rotW(xz - w2 * 0.6, 4.05) * 0.195 + vec2(-t * 0.025, -t * 0.019)).rg * 2.0 - 1.0;
          vec2 n5 = texture2D(uWaterN, rotW(xz + w1 * 0.4, 5.41) * 0.285 + vec2(t * 0.029, -t * 0.022)).rg * 2.0 - 1.0;
          float b45 = smoothstep(0.25, 0.75, macB.a * 0.55 + macA.r * 0.45);
          vec2 cap = mix(rotW(n4, -4.05), rotW(n5, -5.41), b45);
          grad += cap * (0.042 * nearFade);
        }

        return grad * (0.80 + 0.22 * uSeaState);
      }

      // Organic multi-octave FBM foam pattern (warped uNoiseTex — zero Voronoi honeycomb/snake-skin cells!)
      float organicSeaFoam(vec2 xz, vec2 flowDir, float t) {
        vec2 p1 = xz * 0.095 - flowDir * (t * 0.08);
        vec4 n1 = texture2D(uNoiseTex, p1);
        vec2 warp = (n1.rg - 0.5) * 0.55;
        vec4 n2 = texture2D(uNoiseTex, rotW(xz, 0.72) * 0.23 - flowDir * (t * 0.13) + warp);
        vec4 n3 = texture2D(uNoiseTex, rotW(xz, -0.54) * 0.52 + flowDir * (t * 0.06) - warp * 0.7);
        return n1.b * 0.34 + n2.r * 0.40 + n3.g * 0.26;
      }

      void main() {
        vec2 xz = vW.xz;
        vec4 c = coastAt(xz);
        // When sea level overtops the seawall (uSeaLevel > 1.75m), hand off to the island flood sheet at c.g = -0.24m
        float overtop = smoothstep(1.72, 1.85, uSeaLevel);
        float innerLim = mix(-0.22, -0.24, overtop);
        if (c.g < innerLim) discard;
        vec2 bw0 = boatWakeField(xz, uWTime);
        float e0 = waterEta(xz, uWTime, c) + bw0.x;
        float dWater = e0 - c.r;
        // Strict waterline cutoff on the monotonic beach foreshore (around rocky coasts c.r <= -0.95 so dWater > 0.5 everywhere)
        if (dWater <= 0.0 && overtop < 0.5) discard;
        dWater = max(dWater, overtop * max(0.0, uSeaLevel - 1.75));

        float camDist = length(cameraPosition - vW);
        float nearFade = 1.0 - smoothstep(10.0, 38.0, camDist);
        float midFade  = 1.0 - smoothstep(45.0, 210.0, camDist);
        float farAtten = 1.0 - smoothstep(140.0, 980.0, camDist) * 0.65;

        // 1. Wave surface normal: analytical finite difference of 3D wave heightfield + aperiodic wind-wave spectrum
        float eps = mix(0.32, 1.15, smoothstep(45.0, 280.0, camDist));
        vec2 px = xz + vec2(eps, 0.0);
        vec2 pz = xz + vec2(0.0, eps);
        bool hasWake = (abs(bw0.x) + bw0.y) > 0.0005 && camDist < 140.0;
        float bwx = hasWake ? boatWakeField(px, uWTime).x : 0.0;
        float bwz = hasWake ? boatWakeField(pz, uWTime).x : 0.0;
        float ex = (waterEta(px, uWTime, c) + bwx) - e0;
        float ez = (waterEta(pz, uWTime, c) + bwz) - e0;
        vec2 slope = vec2(-ex / eps, -ez / eps) * farAtten;

        // Two incommensurate macro noise samples for wind-gust patches & domain warping
        vec4 macA = texture2D(uNoiseTex, xz * 0.0029 + vec2(uWTime * 0.0012, -uWTime * 0.0009));
        vec4 macB = texture2D(uNoiseTex, rotW(xz, 0.93) * 0.0067 + vec2(-uWTime * 0.0015, uWTime * 0.0011));
        float gustPatch = 0.62 + 0.58 * smoothstep(0.22, 0.78, macA.r * 0.55 + macB.g * 0.45);

        float depthEnv = smoothstep(0.0, 0.45, dWater);
        slope += aperiodicWaveSlope(xz, uWTime, nearFade, midFade, farAtten, macA, macB) * gustPatch * depthEnv;
        vec3 N = normalize(vec3(slope.x, 1.0, slope.y));

        // 2. Water body optics: marine coastal blue-teal matching reference image (#2f6b83 -> #46798e)
        vec3 V = normalize(cameraPosition - vW);
        float NoV = clamp(dot(N, V), 0.001, 1.0);
        vec3 rockyBed = vec3(0.05, 0.07, 0.08);
        vec3 sandyBed = vec3(0.26, 0.22, 0.16);
        vec3 bedCol = mix(rockyBed, sandyBed, smoothstep(0.10, 0.85, c.b));
        vec3 skyAmb = mix(uSkyHorizon, uSkyTop, 0.35) * 0.30 + uSunColW * max(uSunDirW.y, 0.0) * 0.32;
        vec3 refr = underwater(bedCol * skyAmb, vec3(xz.x, c.r, xz.y), max(uSunDirW.y, 0.15));

        // Smoothly transition into deep marine body colour across all coasts
        float deepBlend = smoothstep(0.20, mix(1.8, 3.4, c.b), dWater);
        vec3 deepBody = uInscatter * 0.94 + skyAmb * vec3(0.015, 0.048, 0.072);
        refr = mix(refr, deepBody, deepBlend * 0.76);

        // 2b. Subtle sunlight-driven subsurface wave-crest scattering
        float sunStr = clamp(dot(uSunColW, vec3(0.3333)), 0.0, 1.0) * smoothstep(0.0, 0.22, uSunDirW.y);
        float crestH = max(0.0, e0 + 0.04);
        float sssView = pow(clamp(1.0 - NoV, 0.0, 1.0), 2.0) * (0.35 + 0.65 * max(0.0, dot(-V, uSunDirW)));
        vec3 sssCol = (uInscatter * vec3(0.90, 1.12, 1.18) + uSunColW * 0.04) * clamp(crestH * 1.25, 0.0, 0.65);
        refr += sssCol * sssView * sunStr * smoothstep(0.35, 2.6, dWater) * farAtten * 0.30;

        // Subtle macro variation in deep open water
        vec3 deepTint = mix(vec3(0.92, 0.97, 1.03), vec3(0.96, 1.01, 0.98), macA.b);
        refr *= mix(vec3(1.0), deepTint, smoothstep(1.5, 8.0, dWater) * 0.24);

        // 3. Pure physical Sky Fresnel reflection + sun/moon specular glitter
        vec3 R = reflect(-V, N);
        R.y = max(R.y, 0.015);
        float f1 = clamp(1.0 - NoV, 0.0, 1.0);
        float f2 = f1 * f1;
        float fres = 0.02 + 0.88 * f2 * f2 * f1;
        vec3 skyR = skyColor(R);
        vec3 H = normalize(V + uSunDirW);
        float NoH = clamp(dot(N, H), 0.0, 1.0);
        float spec = pow(max(NoH, 1e-4), 220.0) * step(1e-3, NoH) * smoothstep(-0.02, 0.12, uSunDirW.y);
        // Attenuate Fresnel in paper-thin beach swash so the water film blends invisibly into wet sand
        float swashFresAtten = mix(1.0, smoothstep(0.02, 0.45, dWater), c.b);
        vec3 col = mix(refr, skyR, clamp(fres * 0.82 * swashFresAtten, 0.0, 0.84)) + uSunColW * spec * 1.35 * farAtten * swashFresAtten;

        // 4. Continuous coastal surf & wave-rock crest impact (zero c.g/dWater branch cutoffs!)
        float rockProx = c.a;
        float foamField = organicSeaFoam(xz, vec2(0.85, -0.45), uWTime);
        float beachMask = smoothstep(0.05, 0.60, c.b);
        float surfZone = max(beachMask * (1.0 - smoothstep(1.4, 2.8, dWater)), rockProx);
        float surfFoamVis = 0.0;

        if (surfZone > 0.001) {
          float psi = shorePsi1(c, uWTime);
          float grp = 0.65 + 0.35 * shoreGroup(xz, uWTime);
          float wavePeak = max(0.0, sin(psi + 0.25));
          float wavePeak3 = wavePeak * wavePeak * wavePeak;

          // A. Sandy pocket beach: smooth pitching roller crest + delicate swash leading-edge lace
          float beachCrest = wavePeak3 * smoothstep(0.08, 0.65, dWater) * (1.0 - smoothstep(0.75, 2.2, dWater)) * beachMask;
          float swashLip = (1.0 - smoothstep(0.01, 0.26, dWater)) * smoothstep(0.0, 0.04, dWater) * (0.42 + 0.42 * sin(psi)) * beachMask;

          // B. Waterline boulders (c.a): foam forms when a 3D wave crest surges up against the rock
          float waveSurge = smoothstep(-0.04, 0.22, e0) * (0.55 + 0.45 * max(0.0, sin(psi + 0.15)));
          float rockImpact = smoothstep(0.18, 0.85, rockProx) * waveSurge;
          float rockDrain = smoothstep(0.48, 0.95, rockProx) * smoothstep(-0.14, 0.08, e0) * 0.26;

          float amt = clamp((beachCrest * 0.62 + swashLip * 0.44 + rockImpact * 0.66 + rockDrain) * grp, 0.0, 0.76);
          if (amt > 0.003) {
            vec3 aerSub = mix(refr, uFoamCol * vec3(0.68, 0.82, 0.80), 0.38);
            float subMask = smoothstep(0.28, 0.78, foamField + amt * 0.38) * amt * 0.42;
            float topMask = smoothstep(0.66 - amt * 0.34, 0.94 - amt * 0.22, foamField) * amt * 0.68;
            col = mix(col, aerSub, subMask);
            col = mix(col, uFoamCol * 0.90, topMask);
            surfFoamVis = max(subMask * 0.65, topMask);
          }
        }

        // 4a. Offshore wind-driven whitecaps on steep 3D open-ocean wave crests
        float slopeMag = length(slope);
        float whitecapEnv = smoothstep(0.18, 0.38, e0 + slopeMag * 0.35) * smoothstep(2.2, 6.5, dWater) * farAtten;
        if (whitecapEnv > 0.005) {
          float wcMask = smoothstep(0.58 - whitecapEnv * 0.35, 0.86 - whitecapEnv * 0.25, foamField) * whitecapEnv;
          col = mix(col, uFoamCol * 0.88, clamp(wcMask * 0.62, 0.0, 0.65));
        }

        // 4b. Clean, smooth boat Kelvin wake & prop-wash slipstream (zero noisy speckles!)
        if (bw0.y > 0.004) {
          float wakeTurb = organicSeaFoam(xz * 0.65, -uBoatWake.zw, uWTime * 0.85);
          // Smooth subsurface aerated sea-green plume in the slipstream
          vec3 aerCol = mix(refr, uFoamCol * vec3(0.64, 0.80, 0.78), 0.45);
          col = mix(col, aerCol, clamp(bw0.y * 0.48, 0.0, 0.44));
          // Silky white prop-wash core & Kelvin crest foam
          float wFoam = smoothstep(0.52 - bw0.y * 0.36, 0.86 - bw0.y * 0.24, wakeTurb) * bw0.y;
          col = mix(col, uFoamCol * 0.92, clamp(wFoam * 0.65 + bw0.y * bw0.y * 0.22, 0.0, 0.76));
        }

        // 5. Wide, gradual shoreline feathering on sandy beach (zero inner or outer sharp lines!)
        // When sea level surges over the seawall (overtop > 0), the beach is deeply submerged and
        // the ocean hands off cleanly to the island flood mesh at c.g = -0.24m without any alpha dip.
        float beachAlpha = smoothstep(0.0, 0.36, dWater) * (0.28 + 0.72 * smoothstep(0.05, 1.45, dWater));
        float rockAlpha = smoothstep(0.0, 0.02, dWater);
        float baseAlpha = max(mix(rockAlpha, beachAlpha, c.b * (1.0 - overtop * 0.85)), surfFoamVis * smoothstep(0.0, 0.06, dWater));
        float innerCut = mix(smoothstep(-0.22, -0.02, c.g), step(-0.24, c.g), overtop);
        float alpha = baseAlpha * innerCut;
        float fogK = smoothstep(uFogNear, uFogFar, camDist);
        col = mix(col, uFogCol, fogK);

        gl_FragColor = vec4(max(col, vec3(0.0)), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const mesh = new THREE.Mesh(buildWaterGeometry(1500, data.coast), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);

  const heightAt = makeWaterHeight(cf.data, cf.M, cf.ext);
  return {
    mesh,
    uniforms,
    heightAt,
    update(t) {
      coastUniforms.uWTime.value = t;
    },
  };
}
