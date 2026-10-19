import * as THREE from 'three';
import { makeRng } from './weather.js';
import { atmoUniforms } from './atmoShared.js';

// ---------------------------------------------------------------------------
// Rain: multi-scale instanced raindrops + subtle monsoon mist wisps in a
// world-anchored box ahead of the camera.
//  - Slender, translucent refractive water streaks (never thick white chalk lines)
//  - Exponentially tapering wake behind a tiny leading droplet bead
//  - Night-aware shading: dark atmospheric slate-blue drops in the night sky
//    that catch warm amber-gold glints when falling through streetlamp pools.
// ---------------------------------------------------------------------------
export function buildRain(scene, count) {
  const geo = new THREE.InstancedBufferGeometry();
  // y = 0 is the leading bottom tip of the falling drop; y = 1 is the top trailing wake
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, 0,
     0.5, 0, 0,
     0.5, 1, 0,
    -0.5, 1, 0,
  ], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);

  const r = makeRng(3301);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const k = i * 4;
    seeds[k]     = r(); // tier & x position seed
    seeds[k + 1] = r(); // y position seed + phase
    seeds[k + 2] = r(); // z position seed + lateral turbulence
    seeds[k + 3] = r(); // activation threshold (0..1)
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;

  const uniforms = {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uFwd: { value: new THREE.Vector3(0, 0, -1) },
    uCenter: { value: new THREE.Vector3() },
    uSize: { value: new THREE.Vector3(48, 30, 48) },
    uFall: { value: 16.2 },
    uWind: { value: new THREE.Vector2() },
    uGust: { value: 0.4 },
    uLen: { value: 0.72 },
    uPx: { value: 0.0024 },
    uAmount: { value: 0 },
    uColor: { value: new THREE.Color(0.68, 0.75, 0.82) },
    uTint: { value: new THREE.Color(0.52, 0.60, 0.68) },
    uAlpha: { value: 0.28 },
    uLampMap: atmoUniforms.uLampMap,
    uLampRect: atmoUniforms.uLampRect,
    uLampLevel: atmoUniforms.uLampLevel,
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime, uFall, uLen, uPx, uAmount, uGust, uLampLevel;
      uniform sampler2D uLampMap;
      uniform vec4 uLampRect;
      uniform vec3 uCamPos, uFwd, uCenter, uSize;
      uniform vec2 uWind;
      varying float vA;
      varying float vSheet;
      varying float vDistK;
      varying float vSizeClass;
      varying float vLamp;
      varying vec2 vUv;

      void main() {
        float activeLim = clamp(0.10 + 0.90 * pow(clamp(uAmount, 0.0, 1.0), 0.88), 0.0, 1.0);
        if (uAmount <= 0.005 || aSeed.w > activeLim) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

        float rndClass = fract(aSeed.x * 19.37 + aSeed.y * 7.13);
        float rndVar = fract(aSeed.z * 31.71 + aSeed.w * 11.3);

        vec3 boxCenter;
        vec3 boxSize;
        float localX;
        float isSheet = 0.0;

        vec3 horizFwd = normalize(vec3(uFwd.x, 0.0, uFwd.z) + vec3(1e-5, 0.0, 0.0));
        if (aSeed.x < 0.52) {
          localX = aSeed.x / 0.52;
          boxSize = vec3(19.0, 14.0, 19.0);
          boxCenter = uCamPos + horizFwd * 6.8 + vec3(0.0, 0.6, 0.0);
        } else if (aSeed.x < 0.94) {
          localX = (aSeed.x - 0.52) / 0.42;
          boxSize = uSize;
          boxCenter = uCenter;
        } else {
          localX = (aSeed.x - 0.94) / 0.06;
          boxSize = uSize * 1.25;
          boxCenter = uCenter;
          if (rndClass > 0.72 && uAmount > 0.45) isSheet = 1.0;
        }
        vSheet = isSheet;

        float sizeClass = smoothstep(0.0, 0.95, rndClass);
        vSizeClass = sizeClass;

        float levelSpeed = 0.82 + 0.34 * smoothstep(0.05, 0.95, uAmount);
        float sp = (0.82 + 0.40 * sizeClass + 0.14 * rndVar) * levelSpeed * (isSheet > 0.5 ? 0.65 : 1.0);

        float flutter = sin(uTime * (2.2 + rndVar * 1.8) + aSeed.y * 25.0) * (0.14 + 0.18 * uGust);
        vec2 windEff = uWind * (0.84 + 0.30 * (1.0 - sizeClass * 0.45)) + vec2(-uWind.y, uWind.x) * (flutter * 0.10);
        vec3 vel = vec3(windEff.x, -uFall * sp, windEff.y);

        vec3 seedPos = vec3(localX, aSeed.y, aSeed.z);
        vec3 p = seedPos * boxSize + vel * uTime;
        vec3 bmin = boxCenter - boxSize * 0.5;
        p = bmin + mod(p - bmin, boxSize);

        float gustWave = 0.86 + 0.14 * sin(dot(p.xz, vec2(0.075, 0.055)) - uTime * 3.4 + aSeed.y * 4.0) * clamp(uGust, 0.2, 1.0);

        vec3 vd = normalize(vel);
        vec3 toCam = cameraPosition - p;
        float dist = max(0.1, length(toCam));
        vec3 side = normalize(cross(vd, toCam / dist));

        float w;
        float len;
        if (isSheet > 0.5) {
          w = (2.2 + 2.0 * rndVar) * (0.65 + 0.35 * uAmount);
          len = (4.2 + 3.5 * rndVar) * (0.7 + 0.3 * uAmount);
        } else {
          // Slender, delicate water-streak width (~1.35..1.85 px) tapering toward the top wake
          float taper = mix(1.0, 0.38, position.y);
          float pxW = dist * uPx * (1.35 + 0.68 * sizeClass) * (0.88 + 0.18 * uAmount);
          w = clamp(pxW, 0.0032, 0.022) * taper;

          // Natural shutter-angle streak length (0.42m .. 1.05m)
          float baseL = uLen * (0.58 + 0.52 * sizeClass) * (0.72 + 0.38 * smoothstep(0.04, 0.95, uAmount));
          len = baseL * (0.85 + 0.28 * rndVar);
        }

        vec3 wp = p + side * (position.x * w) - vd * (position.y * len);
        vUv = vec2(position.x, position.y);

        // Streetlamp illumination on falling raindrops at night / dusk via baked streetlamp map
        float lampGlow = 0.0;
        if (uLampLevel > 0.02 && p.y > 0.0 && p.y < 8.2) {
          vec2 luv = (p.xz - uLampRect.xy) / (uLampRect.zw - uLampRect.xy);
          if (luv.x > 0.0 && luv.y > 0.0 && luv.x < 1.0 && luv.y < 1.0) {
            float hK = smoothstep(8.2, 4.0, p.y) * smoothstep(-0.2, 0.8, p.y);
            lampGlow = texture2D(uLampMap, luv).r * hK * 1.45;
          }
        }
        vLamp = clamp(lampGlow * uLampLevel, 0.0, 1.25);

        vec3 q = abs(p - boxCenter) / (boxSize * 0.5);
        float edge = 1.0 - smoothstep(0.82, 1.0, max(max(q.x, q.y), q.z));

        float nearFade = smoothstep(0.65, 2.2, dist);
        float farFade = 1.0 - smoothstep(28.0, 88.0, dist) * 0.82;
        float dropBright = (0.55 + 0.45 * sizeClass) * (0.88 + 0.12 * sin(uTime * 4.5 + aSeed.w * 40.0));
        vDistK = clamp(dist / 70.0, 0.0, 1.0);

        if (isSheet > 0.5) {
          float sheetRamp = smoothstep(0.45, 0.95, uAmount);
          vA = edge * smoothstep(6.0, 16.0, dist) * (1.0 - smoothstep(45.0, 110.0, dist)) * sheetRamp * gustWave * 0.075;
        } else {
          vA = edge * nearFade * farFade * dropBright * gustWave;
        }

        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform vec3 uTint;
      uniform float uAlpha;
      varying float vA;
      varying float vSheet;
      varying float vDistK;
      varying float vSizeClass;
      varying float vLamp;
      varying vec2 vUv;

      void main() {
        float x = abs(vUv.x * 2.0);
        if (x >= 1.0) discard;

        if (vSheet > 0.5) {
          float sx = (1.0 - x) * (1.0 - x);
          float sy = sin(clamp(vUv.y, 0.0, 1.0) * 3.14159265);
          float a = uAlpha * vA * sx * sy * sy;
          if (a < 0.002) discard;
          vec3 col = mix(uColor, uTint, 0.65);
          gl_FragColor = vec4(col, a);
        } else {
          // Soft cylindrical water-thread profile across the drop width
          float oneMinusX2 = max(0.0, 1.0 - x * x);
          float across = oneMinusX2 * sqrt(oneMinusX2);

          // Delicate teardrop head + rapidly fading translucent water wake (never a solid white line)
          float y = clamp(vUv.y, 0.0, 1.0);
          float tipFade = smoothstep(0.0, 0.06, y);
          float dy = (y - 0.10) / 0.12;
          float bead = tipFade * exp(-dy * dy);
          float invY = max(0.0, 1.0 - y);
          float wake = tipFade * invY * invY * 0.58;
          float along = max(bead * 0.92, wake);

          // Boost visibility slightly only where illuminated by warm streetlamps at night
          float lampBoost = 1.0 + vLamp * 0.85;
          float a = clamp(uAlpha * vA * across * along * lampBoost, 0.0, 0.44);
          if (a < 0.005) discard;

          float specK = bead * oneMinusX2 * (0.4 + 0.6 * vSizeClass) * (1.0 - vDistK * 0.5);
          vec3 baseCol = mix(uTint, uColor, 0.35 + 0.65 * invY);
          vec3 col = mix(baseCol, uColor * 1.18, specK * 0.45);
          col = mix(col, uTint, vDistK * 0.45);

          // Warm golden-amber streetlamp refraction on drops falling through lamp pools at night
          vec3 lampCol = vec3(1.0, 0.78, 0.46) * (0.38 + 0.42 * bead);
          col = mix(col, lampCol, clamp(vLamp * 0.72, 0.0, 0.78));

          gl_FragColor = vec4(col, a);
        }
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, uniforms };
}

// ---------------------------------------------------------------------------
// Splashes: a world-anchored grid of cells around the focus; each cell fires
// short-lived impact beads + delicate expanding concentric rings at random
// sub-positions on walkable surfaces.
// ---------------------------------------------------------------------------
export function bakeSurfaceHeights(walkMesh, rect = [-66, -58, 66, 66], N = 128) {
  const [x0, z0, x1, z1] = rect;
  const data = new Float32Array(N * N * 4);
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = true;
  const o = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    o.set(x0 + ((i + 0.5) / N) * (x1 - x0), 40, z0 + ((j + 0.5) / N) * (z1 - z0));
    ray.set(o, down); ray.far = 60;
    const hit = ray.intersectObject(walkMesh, false)[0];
    const k = (j * N + i) * 4;
    if (!hit || hit.point.y < 0.05) { data[k + 1] = 0; continue; }
    const y = hit.point.y;
    // hard paving splashes crisply, lawns and sand swallow most of it
    const kind = y > 1.5 && y < 1.82 ? 1 : y > 1.95 && y < 2.2 ? 0.25 : y < 1.4 ? 0.3 : 0.75;
    data[k] = y; data[k + 1] = kind;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
  t.needsUpdate = true;
  return { tex: t, rect };
}

export function buildSplashes(scene, heights, grid) {
  const count = grid * grid;
  const geo = new THREE.InstancedBufferGeometry();
  // Vertical billboard quad anchored at ground contact (y = 0..1) for subtle raindrop micro-bounces
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0.0, 0.0,
     0.5, 0.0, 0.0,
     0.5, 1.0, 0.0,
    -0.5, 1.0, 0.0,
  ], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const idx = new Float32Array(count * 2);
  for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) { idx[(j * grid + i) * 2] = i; idx[(j * grid + i) * 2 + 1] = j; }
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(idx, 2));
  geo.instanceCount = count;
  const uniforms = {
    uTime: { value: 0 },
    uFocus: { value: new THREE.Vector3() },
    uGrid: { value: grid },
    uCell: { value: 0.68 },
    uAmount: { value: 0 },
    uHeights: { value: heights.tex },
    uRect: { value: new THREE.Vector4(...heights.rect) },
    uColor: { value: new THREE.Color(0.78, 0.84, 0.90) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec2 aCell;
      uniform float uTime, uGrid, uCell, uAmount;
      uniform vec3 uFocus;
      uniform sampler2D uHeights;
      uniform vec4 uRect;
      varying vec2 vUv;
      varying float vPh, vA, vInt;
      float h21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec2 base = floor(uFocus.xz / uCell) - uGrid * 0.5;
        vec2 cell = base + aCell;
        float hs = h21(cell);
        float speedK = 1.10 + 0.55 * uAmount;
        float period = (0.42 + hs * 0.38) / speedK;
        float tt = uTime / period + hs * 19.37;
        float cyc = floor(tt);
        float ph = fract(tt);
        float fire = h21(cell + vec2(cyc * 1.73, cyc * 2.91));
        // Wide multi-cell scatter (-1.8..+1.8 cells) breaks any grid or row alignment
        vec2 jit = (vec2(h21(cell + cyc * 1.37 + 0.5), h21(cell - cyc * 0.93 + 2.1)) - 0.5) * 3.6;
        vec2 xz = (cell + 0.5 + jit) * uCell;
        vec2 uv = (xz - uRect.xy) / (uRect.zw - uRect.xy);
        vec4 hs4 = texture2D(uHeights, uv);
        float kind = (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) ? hs4.g : 0.0;
        vec3 basePos = vec3(xz.x, hs4.r + 0.002, xz.y);
        vec3 toCam = cameraPosition - basePos;
        float dist = length(toCam);
        float density = clamp(0.06 + pow(clamp(uAmount, 0.0, 1.0), 1.15) * 0.28, 0.0, 0.34);
        float on = step(fire, density) * step(0.01, kind) * step(ph, 0.36) * (1.0 - smoothstep(10.0, 22.0, dist));
        if (uAmount <= 0.01 || on < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

        float life = ph / 0.36;
        float arc = 4.0 * life * (1.0 - life);
        float sizeVar = 0.55 + 0.65 * pow(h21(cell + cyc * 0.71), 1.8);
        float scale = (0.65 + 0.35 * uAmount) * sizeVar;
        float w = (0.016 + 0.022 * life) * scale;
        float h = (0.012 + 0.020 * arc) * scale;

        vec3 camRight = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
        vec3 wp = basePos + camRight * (position.x * w) + vec3(0.0, position.y * h, 0.0);

        vUv = vec2(position.x * 2.0, position.y); // x in [-1, 1], y in [0, 1]
        vPh = life;
        vA = kind * (1.0 - smoothstep(9.0, 20.0, dist));
        vInt = uAmount;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vPh, vA, vInt;
      void main() {
        // Soft translucent micro-droplet bead + horizontal contact mist (zero prongs/grass blades, zero rings)
        float x = vUv.x;
        float y = vUv.y;
        float arc = 4.0 * vPh * (1.0 - vPh);
        // Tiny rounded bounce bead rising and falling along y
        float yc = 0.22 + 0.36 * arc;
        float dy = (y - yc) / 0.28;
        float bead = exp(-(x * x * 4.5 + dy * dy * 2.2));
        // Soft low-profile contact glint right at the surface (y near 0)
        float contactGlint = exp(-x * x * 2.4) * exp(-y * y * 14.0) * (1.0 - vPh * 0.65);

        float shape = (bead * 0.75 + contactGlint * 0.65) * arc;
        float a = shape * vA * (0.14 + 0.16 * vInt);
        if (a < 0.005) discard;
        gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.22));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, uniforms };
}

// ---------------------------------------------------------------------------
// Lightning: fractal cloud-to-ground bolt (with forks) built as camera-facing
// ribbons, plus a soft wide glow ribbon. Rebuilt per strike, shown for the
// flash pulses only.
// ---------------------------------------------------------------------------
export function buildBolt(scene) {
  const core = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.9, 0.92, 1.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
  }));
  const glow = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.45, 0.5, 1.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
  }));
  for (const m of [core, glow]) { m.frustumCulled = false; m.renderOrder = 2; m.visible = false; scene.add(m); }

  const ribbon = (paths, camPos, width) => {
    const pos = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), dirv = new THREE.Vector3(), side = new THREE.Vector3(), view = new THREE.Vector3();
    for (const { pts, w } of paths) {
      for (let i = 0; i < pts.length - 1; i++) {
        a.copy(pts[i]); b.copy(pts[i + 1]);
        dirv.subVectors(b, a).normalize();
        view.subVectors(camPos, a).normalize();
        side.crossVectors(dirv, view).normalize().multiplyScalar(width * w * (1 - (i / pts.length) * 0.4));
        pos.push(a.x - side.x, a.y - side.y, a.z - side.z, a.x + side.x, a.y + side.y, a.z + side.z, b.x + side.x, b.y + side.y, b.z + side.z);
        pos.push(a.x - side.x, a.y - side.y, a.z - side.z, b.x + side.x, b.y + side.y, b.z + side.z, b.x - side.x, b.y - side.y, b.z - side.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  };
  const r = makeRng(Date.now() & 0xffff);
  // midpoint displacement: big kinks at large scale, fine crackle at small scale
  const subdivide = (a, b, disp, levels) => {
    if (levels === 0) return [a];
    const m = a.clone().lerp(b, 0.4 + r() * 0.2);
    m.x += (r() - 0.5) * disp; m.z += (r() - 0.5) * disp; m.y += (r() - 0.5) * disp * 0.25;
    return [...subdivide(a, m, disp * 0.55, levels - 1), ...subdivide(m, b, disp * 0.55, levels - 1)];
  };
  const jag = (from, to, depth, out, spread) => {
    const pts = [...subdivide(from, to, spread * 3.2, depth === 0 ? 7 : 5), to.clone()];
    out.push({ pts, w: depth === 0 ? 1 : 0.45 });
    if (depth < 1) {
      for (let f = 0; f < 4; f++) {
        if (r() > 0.65) continue;
        const k = 4 + Math.floor(r() * (pts.length * 0.55));
        const s = pts[k];
        const e = s.clone().add(new THREE.Vector3((r() - 0.5) * 140, -(60 + r() * 140), (r() - 0.5) * 140));
        jag(s, e, depth + 1, out, spread * 0.6);
      }
    }
    return out;
  };
  return {
    strike(ground, top, camPos) {
      const paths = jag(top, ground, 0, [], 34);
      core.geometry.dispose(); glow.geometry.dispose();
      const dist = camPos.distanceTo(ground);
      core.geometry = ribbon(paths, camPos, Math.max(0.6, dist * 0.0011));
      glow.geometry = ribbon(paths, camPos, Math.max(5, dist * 0.008));
    },
    set(level) {
      core.visible = glow.visible = level > 0.01;
      core.material.opacity = Math.min(1, level * 1.4);
      glow.material.opacity = level * 0.35;
    },
  };
}
