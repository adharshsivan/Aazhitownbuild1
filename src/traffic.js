import * as THREE from 'three';
import { G } from './layout.js';
import { fbm } from './world/coastField.js';
import { coastUniforms } from './world/coastShading.js';
import { atmoUniforms } from './atmosphere/atmoShared.js';

// ---------------------------------------------------------------------------
// Ring-road & metro-corridor traffic with physically grounded wheel kinematics,
// hydrodynamic wading, aerated multi-octave droplet spray plumes, nearby-vehicle
// splash deflection, soft-hull clearance feathering, and dynamic GPU instancing.
// ---------------------------------------------------------------------------

const ss = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function makeWheelGeo(r = 0.33, w = 0.22) {
  const g = new THREE.CylinderGeometry(r, r, w, 16);
  g.rotateX(Math.PI / 2);
  return g;
}

function makeVehicle(kind, color, T) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a2129, roughness: 0.15, metalness: 0.5 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e7,
    emissive: 0xffe8b0,
    emissiveIntensity: 0.7,
    roughness: 0.2,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2a22,
    emissive: 0xd91b16,
    emissiveIntensity: 0.65,
    roughness: 0.25,
  });

  const add = (geo, mat, x, y, z, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    g.add(m);
    return m;
  };

  const wheels = [];
  const addWheel = (x, y, z, r, w, side, front) => {
    const m = add(makeWheelGeo(r, w), tyre, x, y, z, true);
    wheels.push({ mesh: m, x, y, z, r, w, side, front });
    return m;
  };

  let length = 4.2;
  let halfW = 0.88;
  let frontWheelX = 1.35;
  let rearWheelX = -1.35;
  let wheelTrackZ = 0.80;

  if (kind === 'car') {
    add(new THREE.BoxGeometry(4.2, 0.7, 1.75), paint, 0, 0.6, 0);
    add(new THREE.BoxGeometry(2.3, 0.62, 1.6), dark, -0.25, 1.25, 0);
    add(new THREE.BoxGeometry(2.0, 0.08, 1.55), paint, -0.3, 1.58, 0);
    // Headlights & taillights
    const lampGeo = new THREE.BoxGeometry(0.06, 0.14, 0.28);
    for (const z of [-0.62, 0.62]) {
      add(lampGeo, headMat, 2.11, 0.62, z, false);
      add(lampGeo, tailMat, -2.11, 0.64, z, false);
    }
    for (const x of [-1.35, 1.35]) {
      for (const z of [-0.8, 0.8]) {
        addWheel(x, 0.33, z, 0.33, 0.22, z < 0 ? -1 : 1, x > 0);
      }
    }
  } else if (kind === 'auto') {
    length = 2.7;
    halfW = 0.65;
    frontWheelX = 1.1;
    rearWheelX = -0.8;
    wheelTrackZ = 0.60;
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.6 });
    add(new THREE.BoxGeometry(2.6, 0.75, 1.3), yellow, 0, 0.65, 0);
    add(new THREE.BoxGeometry(0.7, 0.9, 1.2), dark, 0.95, 1.45, 0);
    add(new THREE.BoxGeometry(2.0, 0.12, 1.4), black, -0.1, 1.95, 0);
    add(new THREE.BoxGeometry(0.08, 0.9, 1.3), black, -1.05, 1.45, 0);
    add(new THREE.BoxGeometry(0.06, 0.14, 0.18), headMat, 1.31, 0.62, 0, false);
    for (const z of [-0.46, 0.46]) {
      add(new THREE.BoxGeometry(0.05, 0.11, 0.18), tailMat, -1.31, 0.58, z, false);
    }
    addWheel(1.1, 0.25, 0, 0.25, 0.15, 0, true);
    for (const z of [-0.6, 0.6]) {
      addWheel(-0.8, 0.25, z, 0.25, 0.15, z < 0 ? -1 : 1, false);
    }
  } else if (kind === 'bus') {
    length = 10.5;
    halfW = 1.25;
    frontWheelX = 3.4;
    rearWheelX = -3.4;
    wheelTrackZ = 1.05;
    const side = new THREE.MeshStandardMaterial({ map: T.busSide, roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 });
    add(new THREE.BoxGeometry(10.5, 2.7, 2.5), [dark, white, white, tyre, side, side], 0, 1.75, 0);
    const lampGeo = new THREE.BoxGeometry(0.07, 0.18, 0.34);
    for (const z of [-0.92, 0.92]) {
      add(lampGeo, headMat, 5.26, 0.78, z, false);
      add(lampGeo, tailMat, -5.26, 0.82, z, false);
    }
    for (const x of [-3.4, 3.4]) {
      for (const z of [-1.05, 1.05]) {
        addWheel(x, 0.48, z, 0.48, 0.3, z < 0 ? -1 : 1, x > 0);
      }
    }
  }

  g.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
  });

  return {
    group: g,
    length,
    halfL: length * 0.5,
    halfW,
    frontWheelX,
    rearWheelX,
    wheelTrackZ,
    wheels,
    headMat,
    tailMat,
  };
}

// ---------------------------------------------------------------------------
// Aerated 3D Wheel-Arch & Bow-Wave Water Spray System
//  - Single instanced draw call with dynamic instance compaction (zero GC)
//  - Multi-octave FBM noise droplet & lacy filament breakup (zero oily blobs)
//  - GPU soft-hull distance feathering against all nearby vehicles so spray quads
//    never hard-clip through their own fenders or passing vehicles' doors
// ---------------------------------------------------------------------------
function buildVehicleSpraySystem(scene, sharedUniforms) {
  const MAX_P = 960; // 3D velocity-aligned wheel-arch water plumes & fine mist

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)
  );
  geo.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)
  );
  geo.setIndex([0, 1, 2, 0, 2, 3]);

  const posSize = new Float32Array(MAX_P * 4);
  const velLife = new Float32Array(MAX_P * 4);
  const meta = new Float32Array(MAX_P * 4);

  const aPosSize = new THREE.InstancedBufferAttribute(posSize, 4);
  const aVelLife = new THREE.InstancedBufferAttribute(velLife, 4);
  const aMeta = new THREE.InstancedBufferAttribute(meta, 4);
  aPosSize.setUsage(THREE.DynamicDrawUsage);
  aVelLife.setUsage(THREE.DynamicDrawUsage);
  aMeta.setUsage(THREE.DynamicDrawUsage);

  geo.setAttribute('aPosSize', aPosSize);
  geo.setAttribute('aVelLife', aVelLife);
  geo.setAttribute('aMeta', aMeta);
  geo.instanceCount = 0;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedUniforms.uTime,
      uAmb: sharedUniforms.uAmb,
      uSunCol: sharedUniforms.uSunCol,
      uSkyZen: atmoUniforms.uSkyZenW,
      uSkyHor: atmoUniforms.uSkyHorW,
      uLightDir: atmoUniforms.uLightDirW,
      uLampLevel: atmoUniforms.uLampLevel,
      uLampMap: atmoUniforms.uLampMap,
      uLampRect: atmoUniforms.uLampRect,
      uNoiseTex: coastUniforms.uNoiseTex,
      uFoamCol: coastUniforms.uFoamCol,
      uQualityTier: coastUniforms.uQualityTier,
      uFogCol: sharedUniforms.uFogCol,
      uFogNear: sharedUniforms.uFogNear,
      uFogFar: sharedUniforms.uFogFar,
      uVehCount: sharedUniforms.uVehCount,
      uVehPose: sharedUniforms.uVehPose,
      uVehWake: sharedUniforms.uVehWake,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      precision highp float;
      attribute vec4 aPosSize; // xyz = world pos, w = base size
      attribute vec4 aVelLife; // xyz = world vel, w = normalized life [0..1]
      attribute vec4 aMeta;    // x = kind (0=sheet plume, 1=fine mist, 2=bow surge), y = opacity, z = seed, w = waterY

      varying vec2 vUv;
      varying vec3 vWPos;
      varying vec3 vWorldNorm;
      varying float vLife;
      varying float vKind;
      varying float vAlpha;
      varying float vSeed;
      varying float vWaterY;
      varying float vUpDot;

      void main() {
        float life = aVelLife.w;
        float baseSize = aPosSize.w;
        if (baseSize <= 0.001 || aMeta.y <= 0.002) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

        vUv = uv;
        vLife = life;
        vKind = aMeta.x;
        vAlpha = aMeta.y;
        vSeed = aMeta.z;
        vWaterY = aMeta.w;

        vec3 center = aPosSize.xyz;
        vec3 vel = aVelLife.xyz;

        vec3 toCam = normalize(cameraPosition - center);
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

        // Project 3D velocity onto screen plane for smooth velocity-aligned spray plumes
        vec2 v2 = vec2(dot(vel, camRight), dot(vel, camUp));
        float v2Len = length(v2);
        float alignK = smoothstep(0.15, 1.80, v2Len);
        vec2 safeV2 = v2Len > 0.001 ? (v2 / v2Len) : vec2(0.0, 1.0);
        vec2 dir2 = normalize(mix(vec2(0.0, 1.0), normalize(safeV2 + vec2(0.0, 0.22)), alignK * 0.85));
        vec2 perp2 = vec2(-dir2.y, dir2.x);

        vec3 axisAlong = camRight * dir2.x + camUp * dir2.y;
        vec3 axisAcross = camRight * perp2.x + camUp * perp2.y;

        float lenScale;
        float widScale;
        if (vKind < 0.5) {
          // Kind 0: Wheel-arch water spray plume
          float stretch = 1.08 + clamp(v2Len * 0.14, 0.0, 1.10) * (1.0 - life * 0.45);
          lenScale = baseSize * stretch * mix(0.62, 1.32, pow(life, 0.52));
          widScale = baseSize * mix(0.58, 1.28, pow(life, 0.60));
        } else if (vKind < 1.5) {
          // Kind 1: Fine atomized rooster-tail mist
          lenScale = baseSize * mix(0.70, 1.42, pow(life, 0.55));
          widScale = baseSize * mix(0.72, 1.45, pow(life, 0.60));
        } else {
          // Kind 2: Front bow-wave whitewater surge
          lenScale = baseSize * (0.76 + 0.42 * life);
          widScale = baseSize * (1.18 + 0.55 * pow(life, 0.55));
        }

        vec3 worldPos = center + axisAlong * ((position.y + 0.10) * lenScale) + axisAcross * (position.x * widScale);
        vWorldNorm = normalize(toCam * 0.58 + axisAlong * (position.y * 0.75) + axisAcross * (position.x * 0.75));
        vUpDot = clamp(0.5 + 0.5 * position.y, 0.0, 1.0);
        vWPos = worldPos;
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      precision highp int;
      uniform float uTime, uLampLevel, uFogNear, uFogFar, uQualityTier;
      uniform vec3 uAmb, uSunCol, uSkyZen, uSkyHor, uLightDir, uFogCol, uFoamCol;
      uniform vec4 uLampRect;
      uniform sampler2D uLampMap;
      uniform sampler2D uNoiseTex;
      uniform int uVehCount;
      uniform vec4 uVehPose[12];
      uniform vec4 uVehWake[12];

      varying vec2 vUv;
      varying vec3 vWPos;
      varying vec3 vWorldNorm;
      varying float vLife;
      varying float vKind;
      varying float vAlpha;
      varying float vSeed;
      varying float vWaterY;
      varying float vUpDot;

      void main() {
        // 1. Seamless waterline blend so quads never show a flat bottom edge on the water surface
        float hAboveWater = vWPos.y - vWaterY;
        float waterClearance = smoothstep(-0.005, 0.055, hAboveWater);
        if (waterClearance <= 0.004) discard;

        // 2. Strictly bounded Gaussian plume envelope that reaches 0 well inside [-1, 1] quad bounds
        vec2 p = vUv * 2.0 - 1.0;
        float y01 = clamp(vUv.y, 0.0, 1.0);
        // Slightly narrower at the base, fanning out smoothly upward without exceeding quad width
        float fanScale = mix(1.18, 0.88, y01);
        vec2 q = vec2(p.x * fanScale, p.y);
        float r2 = dot(q, q);
        if (r2 >= 0.96) discard;
        float r = sqrt(r2);

        // Smooth Gaussian + cubic radial falloff guarantees zero hard quad borders
        float radialEnv = exp(-r2 * 2.85) * smoothstep(0.96, 0.18, r);

        // 3. Soft-hull distance feathering against all nearby vehicles so spray never clips inside doors/fenders
        float hullClearance = 1.0;
        for (int i = 0; i < 12; i++) {
          if (i >= uVehCount) break;
          vec4 pose = uVehPose[i];
          vec2 d = vWPos.xz - pose.xy;
          if (abs(d.x) > 6.2 || abs(d.y) > 6.2) continue;
          vec4 wk = uVehWake[i];
          float along = abs(d.x * pose.z + d.y * pose.w) - wk.x;
          float across = abs(-d.x * pose.w + d.y * pose.z) - wk.y;
          float boxDist = length(max(vec2(along, across), 0.0)) + min(max(along, across), 0.0);
          float hFade = smoothstep(-0.02, 0.14, boxDist);
          hullClearance = min(hullClearance, hFade);
        }
        if (hullClearance <= 0.005) discard;

        // 4. Seamless Cartesian domain-warped FBM water wisp texture (zero atan branch-cut or polka-dot blobs)
        vec2 sOff = vec2(vSeed * 7.13, fract(vSeed * 3.71) * 11.3);
        // Stretch noise slightly along the upward jet axis (vUv.y) for fibrous liquid motion
        vec2 baseUv = vec2(q.x * 0.42, q.y * 0.24 - vLife * 0.22) + sOff;
        vec4 nA = texture2D(uNoiseTex, baseUv);
        vec2 warp = (nA.rg - 0.5) * 0.14;
        vec4 nB = texture2D(uNoiseTex, baseUv * 2.15 + warp + vec2(0.37, -vLife * 0.18));

        float fbm = nA.r * 0.56 + nB.g * 0.44;
        float fineMist = nA.b * 0.50 + nB.a * 0.50;

        // Soft cloud-like erosion as the spray plume expands and dissipates
        float wisp = mix(fbm, fineMist, 0.35 + 0.35 * vLife);
        float density = radialEnv * smoothstep(0.12 + 0.22 * vLife, 0.68, wisp * 0.65 + radialEnv * 0.55);
        float crestSparkle = smoothstep(0.42, 0.78, wisp) * smoothstep(0.15, 0.85, y01);

        float lifeEnv = sin(pow(vLife, 0.58) * 3.14159265);
        float alpha = clamp(density * lifeEnv * waterClearance * hullClearance * vAlpha * 1.25, 0.0, 0.42);
        if (alpha < 0.006) discard;

        // 5. Physical Water & Foam Shading: Translucent aquamarine interior -> soft white water spray crest
        vec3 V = normalize(cameraPosition - vWPos);
        vec3 L = normalize(uLightDir);
        vec3 H = normalize(V + L);
        float nl = clamp(dot(vWorldNorm, L) * 0.5 + 0.5, 0.0, 1.0);
        float fwdScatter = pow(max(0.0, dot(V, -L)), 2.5);
        float specGlint = pow(max(0.0, dot(vWorldNorm, H)), 18.0) * (0.25 + 0.55 * crestSparkle);
        float sunUpK = smoothstep(-0.05, 0.22, L.y);

        vec3 skyIllum = mix(uSkyHor, uSkyZen, 0.38 + 0.32 * vUpDot);
        vec3 envLight = max(uAmb * 0.92 + skyIllum * 0.45, vec3(0.48, 0.54, 0.60) * (0.35 + 0.65 * sunUpK));
        vec3 aquaCore = vec3(0.70, 0.84, 0.92) * envLight;
        vec3 foamWhite = vec3(0.97, 0.99, 1.0) * envLight;

        vec3 col = mix(aquaCore, foamWhite, clamp(0.32 + 0.38 * nl + 0.35 * crestSparkle + 0.20 * vUpDot, 0.0, 1.0));
        col = max(col, uFoamCol * (0.76 + 0.20 * crestSparkle));
        col += uSunCol * (0.22 * vUpDot + 0.35 * fwdScatter + 0.40 * specGlint) * sunUpK;

        if (uLampLevel > 0.01 && vWPos.y < 5.0) {
          vec2 luv = (vWPos.xz - uLampRect.xy) / (uLampRect.zw - uLampRect.xy);
          if (luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0) {
            float lPool = texture2D(uLampMap, luv).r * 1.25;
            col += vec3(1.0, 0.82, 0.52) * (lPool * uLampLevel * (0.50 + 0.35 * crestSparkle));
          }
        }

        float camDist = length(cameraPosition - vWPos);
        col = mix(col, uFogCol, smoothstep(uFogNear, uFogFar, camDist));

        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  scene.add(mesh);

  const pool = Array.from({ length: MAX_P }, (_, i) => ({
    alive: false,
    x: 0, y: -200, z: 0,
    vx: 0, vy: 0, vz: 0,
    size: 0,
    age: 0,
    maxAge: 1,
    kind: 0,
    opacity: 0,
    seed: ((i * 0.61803398875) % 1),
    waterY: G,
  }));

  let cursor = 0;
  let activeCount = 0;

  function spawn(x, y, z, vx, vy, vz, size, maxAge, kind, opacity, _silt, waterY) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX_P;
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.size = size;
    p.age = 0;
    p.maxAge = maxAge;
    p.kind = kind;
    p.opacity = opacity;
    p.waterY = waterY;
  }

  function update(dt, windX, windZ, activeVehs) {
    let aliveN = 0;
    const g = 13.0;
    const sheetDrag = Math.exp(-2.3 * dt);
    const mistDrag = Math.exp(-3.1 * dt);
    const nVeh = activeVehs ? activeVehs.length : 0;

    for (let i = 0; i < MAX_P; i++) {
      const p = pool[i];
      if (!p.alive) continue;

      p.age += dt;
      if (p.age >= p.maxAge) {
        p.alive = false;
        continue;
      }

      if (p.kind === 0) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx = p.vx * sheetDrag + windX * 0.12 * dt;
        p.vz = p.vz * sheetDrag + windZ * 0.12 * dt;
        p.vy -= g * 0.90 * dt;

        if (p.vy < 0 && p.y <= p.waterY + 0.01) {
          p.alive = false;
          continue;
        }
      } else if (p.kind === 1) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx = p.vx * mistDrag + windX * 0.18 * dt;
        p.vz = p.vz * mistDrag + windZ * 0.18 * dt;
        p.vy -= g * 0.70 * dt;
        if (p.vy < 0 && p.y < p.waterY + 0.01) {
          p.alive = false;
          continue;
        }
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= sheetDrag;
        p.vz *= sheetDrag;
        p.vy = p.vy * mistDrag - 5.5 * dt;
        if (p.y < p.waterY + 0.01) {
          p.y = p.waterY + 0.015;
          p.vy = 0;
        }
      }

      // Fast 2D oriented bounding-box deflection so airborne spray never enters a passing vehicle's hull
      for (let vIdx = 0; vIdx < nVeh; vIdx++) {
        const v = activeVehs[vIdx];
        const dx = p.x - v.x;
        const dz = p.z - v.z;
        if (Math.abs(dx) > 6.0 || Math.abs(dz) > 6.0) continue;
        const along = dx * v.hx + dz * v.hz;
        const across = -dx * v.hz + dz * v.hx;
        const padL = v.halfL + 0.12;
        const padW = v.halfW + 0.14;
        if (Math.abs(along) < padL && Math.abs(across) < padW) {
          const sSign = across >= 0 ? 1 : -1;
          const pushOut = (padW - Math.abs(across)) + 0.04;
          const rx = -v.hz, rz = v.hx;
          p.x += rx * sSign * pushOut;
          p.z += rz * sSign * pushOut;
          const vn = p.vx * rx * sSign + p.vz * rz * sSign;
          if (vn < 0.3) {
            p.vx += rx * sSign * (0.4 - vn);
            p.vz += rz * sSign * (0.4 - vn);
            p.vy += 0.25;
          }
        }
      }

      const o = aliveN * 4;
      posSize[o] = p.x;
      posSize[o + 1] = p.y;
      posSize[o + 2] = p.z;
      posSize[o + 3] = p.size;

      velLife[o] = p.vx;
      velLife[o + 1] = p.vy;
      velLife[o + 2] = p.vz;
      velLife[o + 3] = p.age / p.maxAge;

      meta[o] = p.kind;
      meta[o + 1] = p.opacity;
      meta[o + 2] = p.seed;
      meta[o + 3] = p.waterY;
      aliveN++;
    }

    activeCount = aliveN;
    geo.instanceCount = aliveN;
    mesh.visible = aliveN > 0;
    if (aliveN > 0) {
      const floatCount = aliveN * 4;
      aPosSize.clearUpdateRanges();
      aPosSize.addUpdateRange(0, floatCount);
      aPosSize.needsUpdate = true;

      aVelLife.clearUpdateRanges();
      aVelLife.addUpdateRange(0, floatCount);
      aVelLife.needsUpdate = true;

      aMeta.clearUpdateRanges();
      aMeta.addUpdateRange(0, floatCount);
      aMeta.needsUpdate = true;
    }
  }

  return { mesh, spawn, update, getActiveCount: () => activeCount };
}

export function buildTraffic(scene, data, T, trafficLights = null) {
  const ring = data.roads.ring;
  const metroNorth = data.roads.metroNorth;
  const metroSouth = data.roads.metroSouth;
  const avenue = data.roads.avenue;
  const specs = [
    // Ring road traffic (left-hand traffic on two-way ring)
    { road: ring, laneOff: 1.75, kind: 'bus', color: 0x1f6fb5, dir: 1, s: 0.08, speed: 7 },
    { road: ring, laneOff: 1.75, kind: 'car', color: 0xd9dde2, dir: 1, s: 0.35, speed: 9 },
    { road: ring, laneOff: 1.75, kind: 'auto', color: 0, dir: 1, s: 0.62, speed: 7 },
    { road: ring, laneOff: 1.75, kind: 'car', color: 0x8c1d22, dir: -1, s: 0.2, speed: 9.5 },
    { road: ring, laneOff: 1.75, kind: 'car', color: 0x2c3e50, dir: -1, s: 0.55, speed: 8.5 },
    { road: ring, laneOff: 1.75, kind: 'auto', color: 0, dir: -1, s: 0.85, speed: 6.5 },
    // Twin carriageways flanking the central metro pillars (Kochi left-hand dual carriageway:
    // north side flows eastbound dir=1, south side flows westbound dir=-1)
    ...(metroNorth ? [
      { road: metroNorth, laneOff: 0.95, kind: 'car', color: 0xe6e9ed, dir: 1, s: 0.18, speed: 8.5 },
      { road: metroNorth, laneOff: -0.95, kind: 'auto', color: 0, dir: 1, s: 0.64, speed: 7.0 },
    ] : []),
    ...(metroSouth ? [
      { road: metroSouth, laneOff: 0.95, kind: 'bus', color: 0x246a49, dir: -1, s: 0.32, speed: 7.2 },
      { road: metroSouth, laneOff: -0.95, kind: 'car', color: 0x3b526b, dir: -1, s: 0.78, speed: 9.0 },
    ] : []),
    // Station Avenue vehicles serving the junction
    ...(avenue ? [
      { road: avenue, laneOff: 1.2, kind: 'auto', color: 0, dir: -1, s: 0.55, speed: 7.0, isAvenue: true },
      { road: avenue, laneOff: -1.2, kind: 'car', color: 0x245a42, dir: 1, s: 0.20, speed: 8.0, isAvenue: true },
    ] : []),
  ];

  const MAX_VEH = 12;
  const uVehPoseArr = Array.from({ length: MAX_VEH }, () => new THREE.Vector4(0, 0, 1, 0));
  const uVehWakeArr = Array.from({ length: MAX_VEH }, () => new THREE.Vector4(2.1, 0.88, 0, 0));

  const sharedUniforms = {
    uTime: { value: 0 },
    uAmb: { value: new THREE.Color(0.85, 0.85, 0.85) },
    uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    uFogCol: { value: new THREE.Color(0.75, 0.84, 0.92) },
    uFogNear: { value: 180 },
    uFogFar: { value: 850 },
    uVehCount: { value: 0 },
    uVehPose: { value: uVehPoseArr },
    uVehWake: { value: uVehWakeArr },
  };

  const spraySys = buildVehicleSpraySystem(scene, sharedUniforms);

  const vehicles = specs.map((sp, idx) => {
    const v = makeVehicle(sp.kind, sp.color, T);
    scene.add(v.group);
    const L = sp.road.pl.length;
    return {
      ...sp,
      ...v,
      L,
      s: sp.s * L,
      v: sp.speed,
      seed: (idx + 1) * 3.71,
      yaw: 0,
      turnCurve: 0,
      floodDepth: 0,
      wetDepth: 0,
      waterY: G,
    };
  });

  const place = (veh, dt = 0) => {
    const p = veh.road.pl.at(veh.s);
    const hx = p.tx * veh.dir, hz = p.tz * veh.dir;
    const lx = hz, lz = -hx; // driver's left
    veh.x = p.x + lx * veh.laneOff;
    veh.z = p.z + lz * veh.laneOff;
    veh.hx = hx;
    veh.hz = hz;

    const newYaw = Math.atan2(-hz, hx);
    if (dt > 0.0001) {
      let dYaw = newYaw - veh.yaw;
      dYaw -= Math.round(dYaw / (Math.PI * 2)) * (Math.PI * 2);
      const rawCurve = dYaw / Math.max(0.5, veh.v * dt);
      veh.turnCurve += (Math.max(-1.2, Math.min(1.2, rawCurve)) - veh.turnCurve) * Math.min(1, dt * 8);
    }
    veh.yaw = newYaw;

    // Subtle hydrodynamic bow-wave nose lift & water-churn heave when wading through floodwater
    const depK = Math.min(1, veh.floodDepth / 0.16);
    const spdK = Math.min(1, veh.v / 8.0);
    const t = sharedUniforms.uTime.value;
    const wadeHeave = depK * spdK * (0.010 + 0.004 * Math.sin(t * 14.0 + veh.seed));
    const bowPitch = depK * spdK * (0.012 + 0.003 * Math.cos(t * 11.0 + veh.seed));
    const wadeRoll = depK * spdK * 0.006 * Math.sin(t * 8.5 + veh.seed * 1.7);

    veh.group.position.set(veh.x, G + wadeHeave, veh.z);
    veh.group.rotation.set(wadeRoll, newYaw, bowPitch);
  };

  vehicles.forEach((v) => place(v, 0));

  let rngState = 1337;
  const rand = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };

  const nearbyVehs = [];

  const api = {
    vehicles,
    atmo: null,
    trafficLights,
    update(dt, player, atmoArg) {
      const atmo = atmoArg || this.atmo;
      sharedUniforms.uTime.value += dt;

      const flood = atmo?.flood;
      const env = atmo?.env;
      const camPos = atmo?.camera?.position;
      const uWet = atmoUniforms.uWet.value;
      const uPuddle = atmoUniforms.uPuddle.value;
      const uRain = atmoUniforms.uRainNow.value;
      const lamps = atmoUniforms.uLampLevel.value;

      if (env) {
        sharedUniforms.uAmb.value.copy(env.ambient);
        sharedUniforms.uSunCol.value.copy(env.sunColor);
        if (env.fog) {
          sharedUniforms.uFogCol.value.copy(env.fog.color);
          sharedUniforms.uFogNear.value = env.fog.near;
          sharedUniforms.uFogFar.value = env.fog.far;
        }
      }

      const qualId = atmo?.qualityProfile?.id || 'high';
      const budgetScale = qualId === 'low' ? 0.45 : qualId === 'medium' ? 0.78 : qualId === 'max' ? 1.25 : 1.0;
      const maxSprayDistSq = (qualId === 'low' || qualId === 'medium') ? (66 * 66) : (96 * 96);

      const floodActive = Boolean(flood && flood.grid && (flood.running || flood.stats.max > 0.003 || flood.seaLevelRise > 0.01));
      const roadIsWet = floodActive || uWet > 0.14 || uPuddle > 0.06 || uRain > 0.02;

      nearbyVehs.length = 0;

      for (const veh of vehicles) {
        let centerFloodD = 0;
        let centerWaterY = G;
        if (floodActive) {
          const cs = flood.sampleSmooth ? flood.sampleSmooth(veh.x, veh.z) : flood.sample(veh.x, veh.z);
          if (cs && cs.d > 0.002) {
            centerFloodD = cs.d;
            centerWaterY = cs.y;
          }
        }
        veh.floodDepth += (centerFloodD - veh.floodDepth) * Math.min(1, dt * 10);
        veh.waterY = centerWaterY;

        let target = veh.speed;
        if (veh.floodDepth > 0.015) {
          const wadeSlowdown = 1.0 - Math.min(0.65, Math.max(0, veh.floodDepth - 0.015) * 0.90);
          target *= wadeSlowdown;
        }

        // Stop at red or amber junction traffic lights
        if (this.trafficLights) {
          const roadName = veh.road === ring ? 'ring' : (veh.isAvenue ? 'avenue' : (veh.road === metroNorth ? 'metroNorth' : 'metroSouth'));
          const tl = this.trafficLights.shouldVehicleStop(roadName, veh.x, veh.z, veh.dir, veh.v);
          if (tl.stop) {
            if (tl.dist <= 0.8) {
              target = 0;
            } else {
              target = Math.min(target, Math.max(0, (tl.dist - 0.8) * 0.85));
            }
          }
        }

        const L = veh.L;
        for (const o of vehicles) {
          if (o === veh || o.road !== veh.road || o.dir !== veh.dir) continue;
          if (Math.abs(o.laneOff - veh.laneOff) > 1.2) continue;
          let gap = (o.s - veh.s) * veh.dir;
          gap = ((gap % L) + L) % L;
          const need = (o.length + veh.length) / 2 + 4;
          if (gap < need + 8) target = Math.min(target, Math.max(0, (gap - need) * 0.8));
        }

        if (player) {
          const dx = player.x - veh.x, dz = player.z - veh.z;
          const ahead = dx * veh.hx + dz * veh.hz;
          const side = Math.abs(dx * -veh.hz + dz * veh.hx);
          if (ahead > 0 && ahead < veh.length / 2 + 7 && side < 2.6 && player.y < G + 1.0) target = 0;
        }

        const a = target > veh.v ? 2.5 : 7;
        veh.v += Math.sign(target - veh.v) * Math.min(Math.abs(target - veh.v), a * dt);
        if (veh.isAvenue) {
          veh.s += veh.v * dt * veh.dir;
          if (veh.s >= L - 2.0 && veh.dir > 0) {
            veh.s = L - 2.0;
            veh.dir = -1;
          } else if (veh.s <= 2.5 && veh.dir < 0) {
            veh.s = 2.5;
            veh.dir = 1;
          }
        } else {
          veh.s = (((veh.s + veh.v * dt * veh.dir) % L) + L) % L;
        }
        place(veh, dt);

        const lampBoost = Math.max(lamps, floodActive ? 0.65 : 0, uRain * 0.55);
        veh.headMat.emissiveIntensity = 0.6 + 2.4 * lampBoost;
        veh.tailMat.emissiveIntensity = 0.55 + 1.9 * lampBoost + (target < veh.v - 0.5 ? 1.5 : 0);

        const distStep = veh.v * dt;
        for (const w of veh.wheels) {
          w.mesh.rotation.z -= distStep / w.r;
        }
      }

      // Populate active vehicle hull bounds for GPU soft-hull feathering & CPU deflection
      let hullCount = 0;
      for (let i = 0; i < vehicles.length && hullCount < MAX_VEH; i++) {
        const v = vehicles[i];
        if (camPos) {
          const d2 = (v.x - camPos.x) ** 2 + (v.z - camPos.z) ** 2;
          if (d2 > 110 * 110) continue;
        }
        uVehPoseArr[hullCount].set(v.x, v.z, v.hx || 1, v.hz || 0);
        uVehWakeArr[hullCount].set(v.halfL || 2.1, v.halfW || 0.88, ss(0.3, 8.8, v.v), ss(0.004, 0.14, v.floodDepth));
        nearbyVehs.push(v);
        hullCount++;
      }
      sharedUniforms.uVehCount.value = hullCount;

      if (roadIsWet) {
        for (const veh of vehicles) {
          if (veh.v < 0.35) continue;
          if (camPos) {
            const camD2 = (veh.x - camPos.x) ** 2 + (veh.z - camPos.z) ** 2;
            if (camD2 > maxSprayDistSq) continue;
          }

          const hx = veh.hx, hz = veh.hz;
          const rx = -hz, rz = hx;
          const spd = veh.v;
          const spdK = ss(0.4, 8.8, spd);
          const isBus = veh.kind === 'bus';
          const vehScale = isBus ? 1.22 : (veh.kind === 'auto' ? 0.86 : 1.0);

          // Check lateral clearance to any passing or adjacent vehicle on left (-1) or right (+1)
          let leftBlock = 0;
          let rightBlock = 0;
          for (const other of nearbyVehs) {
            if (other === veh) continue;
            const dx = other.x - veh.x, dz = other.z - veh.z;
            if (Math.abs(dx) > 12 || Math.abs(dz) > 12) continue;
            const along = Math.abs(dx * hx + dz * hz) - (veh.halfL + other.halfL);
            if (along > 1.8) continue;
            const acrossSigned = dx * rx + dz * rz;
            const latGap = Math.abs(acrossSigned) - (veh.halfW + other.halfW);
            if (latGap < 2.8) {
              const blockK = 1.0 - Math.max(0, latGap / 2.8);
              if (acrossSigned < 0) leftBlock = Math.max(leftBlock, blockK);
              else rightBlock = Math.max(rightBlock, blockK);
            }
          }

          let maxWheelFloodD = veh.floodDepth;
          let avgWaterY = veh.waterY;
          let wyCount = 1;

          for (const w of veh.wheels) {
            const wx = veh.x + w.x * hx + w.z * rx;
            const wz = veh.z + w.x * hz + w.z * rz;

            let wFloodD = 0;
            let wSurfY = G;
            if (floodActive) {
              const ws = flood.sampleSmooth ? flood.sampleSmooth(wx, wz) : flood.sample(wx, wz);
              if (ws && ws.d > 0.002) {
                wFloodD = ws.d;
                wSurfY = ws.y;
                avgWaterY += ws.y;
                wyCount++;
              }
            }

            let puddleFilmD = 0;
            if (uPuddle > 0.04 || uWet > 0.14 || uRain > 0.02) {
              const pField = 0.65 * fbm(wx * 0.038, wz * 0.038, 17, 2) + 0.35 * fbm(wx * 0.076 + 11.3, wz * 0.076 - 7.1, 29, 2);
              const thresh = 0.70 - uPuddle * 0.36;
              const pudMask = ss(thresh, thresh + 0.09, pField);
              puddleFilmD = uWet * 0.004 + pudMask * uPuddle * 0.024 + uRain * 0.005;
            }

            const effD = Math.max(wFloodD, puddleFilmD);
            if (wFloodD > maxWheelFloodD) maxWheelFloodD = wFloodD;
            if (effD < 0.003) continue;

            const deepSubDamp = 1.0 - ss(0.34, 0.75, wFloodD) * 0.45;
            const floodIntensity = ss(0.004, 0.14, effD) * deepSubDamp;

            const wheelRate = (6.5 + 18.0 * floodIntensity) * spdK * vehScale * budgetScale;
            let toEmit = wheelRate * dt;
            if (rand() < (toEmit - Math.floor(toEmit))) toEmit += 1;
            const count = Math.min(3, Math.floor(toEmit));

            const outerHullZ = Math.max(veh.halfW + 0.06, Math.abs(w.z) + w.w * 0.5 + 0.04);

            for (let k = 0; k < count; k++) {
              const outSign = w.side !== 0 ? w.side : (rand() < 0.5 ? -1 : 1);
              const sideBlock = outSign < 0 ? leftBlock : rightBlock;
              const latScale = 1.0 - sideBlock * 0.68;
              const upBoost = 1.0 + sideBlock * 0.35;
              const roll = rand();

              if (effD > 0.006 && roll < 0.60) {
                // Stream A: Wheel-Arch Liquid Spray Plume (Kind 0)
                const pinchAlong = w.x + w.r * (-0.15 + 0.45 * rand());
                const pinchAcross = outSign * (w.side === 0 ? veh.halfW * 0.72 : (outerHullZ + 0.04 + 0.05 * rand()));
                const px = veh.x + hx * pinchAlong + rx * pinchAcross;
                const pz = veh.z + hz * pinchAlong + rz * pinchAcross;
                const py = wSurfY + 0.03 + Math.min(0.06, wFloodD * 0.18);

                const outSpd = (0.95 + 1.65 * spdK * (0.38 + 0.62 * floodIntensity)) * (0.85 + 0.30 * rand()) * vehScale * latScale;
                const fwdSpd = spd * (0.34 + 0.20 * rand()) + (w.front ? 0.20 : -0.15);
                const upSpd = (0.82 + 1.35 * spdK * (0.38 + 0.62 * floodIntensity)) * (0.84 + 0.32 * rand()) * vehScale * upBoost;

                const vx = hx * fwdSpd + rx * outSign * outSpd;
                const vz = hz * fwdSpd + rz * outSign * outSpd;
                const size = (0.32 + 0.36 * floodIntensity + 0.08 * rand()) * vehScale;
                const maxAge = 0.28 + 0.16 * floodIntensity + 0.07 * rand();
                const opacity = Math.min(0.46, (0.20 + 0.26 * floodIntensity) * spdK);

                spraySys.spawn(px, py, pz, vx, upSpd, vz, size, maxAge, 0, opacity, 0, wSurfY);
              } else {
                // Stream B: Rear Rooster-Tail Mist Plume (Kind 1)
                const rearAlong = w.x - w.r * (0.62 + 0.40 * rand());
                const rearAcross = w.side === 0
                  ? outSign * (veh.halfW * 0.55 + 0.08 * rand())
                  : outSign * (Math.max(Math.abs(w.z), veh.halfW - 0.05) + (rand() - 0.25) * w.w * 0.70);
                const px = veh.x + hx * rearAlong + rx * rearAcross;
                const pz = veh.z + hz * rearAlong + rz * rearAcross;
                const py = wSurfY + 0.04 + w.r * 0.16 * rand();

                const fwdCarry = spd * (0.16 + 0.16 * rand());
                const outDrift = outSign * (0.48 + 0.95 * floodIntensity) * spdK * (0.75 + 0.40 * rand()) * latScale;
                const upSpd = (0.78 + 1.25 * spdK * (0.38 + 0.62 * floodIntensity)) * (0.82 + 0.32 * rand()) * upBoost;

                const vx = hx * fwdCarry + rx * outDrift;
                const vz = hz * fwdCarry + rz * outDrift;
                const size = (0.34 + 0.38 * floodIntensity + 0.10 * rand()) * vehScale;
                const maxAge = 0.30 + 0.18 * floodIntensity + 0.08 * rand();
                const wetVis = ss(0.002, 0.018, effD);
                const opacity = Math.min(0.42, (0.18 + 0.24 * wetVis) * spdK);

                spraySys.spawn(px, py, pz, vx, upSpd, vz, size, maxAge, 1, opacity, 0, wSurfY);
              }
            }
          }

          const surfY = avgWaterY / wyCount;

          // Front Bumper Bow-Wave Surge when wading in floodwater >= 3cm
          if (maxWheelFloodD > 0.030 && spdK > 0.15) {
            const bowDepthK = ss(0.030, 0.18, maxWheelFloodD);
            const bowRate = (6.5 + 14.0 * bowDepthK) * spdK * vehScale * budgetScale;
            let bowEmit = bowRate * dt;
            if (rand() < (bowEmit - Math.floor(bowEmit))) bowEmit += 1;
            const bCount = Math.min(2, Math.floor(bowEmit));

            for (let b = 0; b < bCount; b++) {
              const u = (rand() * 2 - 1);
              const sideSign = u >= 0 ? 1 : -1;
              const sideBlock = sideSign < 0 ? leftBlock : rightBlock;
              const latScale = 1.0 - sideBlock * 0.65;

              const localX = veh.halfL + 0.14 - 0.12 * u * u;
              const localZ = u * (veh.halfW * 0.94);
              const px = veh.x + localX * hx + localZ * rx;
              const pz = veh.z + localX * hz + localZ * rz;
              const py = surfY + 0.025 + Math.min(0.05, maxWheelFloodD * 0.15);

              const fwdPush = spd * (0.44 + 0.16 * rand());
              const outPush = sideSign * (0.82 + 1.35 * Math.abs(u)) * spdK * (0.48 + 0.52 * bowDepthK) * vehScale * latScale;
              const upPush = (0.65 + 1.10 * spdK * bowDepthK) * (0.82 + 0.28 * rand()) * vehScale * (1.0 + sideBlock * 0.32);

              const vx = hx * fwdPush + rx * outPush;
              const vz = hz * fwdPush + rz * outPush;
              const size = (0.30 + 0.34 * bowDepthK + 0.08 * rand()) * vehScale;
              const maxAge = 0.25 + 0.15 * bowDepthK + 0.06 * rand();
              const opacity = Math.min(0.44, (0.20 + 0.24 * bowDepthK) * spdK);
              const kind = rand() < 0.45 ? 2 : 0;

              spraySys.spawn(px, py, pz, vx, upPush, vz, size, maxAge, kind, opacity, 0, surfY);
            }
          }
        }
      }

      const windX = env?.windX ?? 0;
      const windZ = env?.windZ ?? 0;
      spraySys.update(dt, windX, windZ, nearbyVehs);
    },
  };

  return api;
}

