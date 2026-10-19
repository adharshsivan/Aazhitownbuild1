import * as THREE from 'three';
import { G, WALK, GREEN_TOP, APARTMENT, GRAFFITI, CAFE, SHOP, PAVILION, METRO } from '../layout.js';
import { fbm } from '../world/coastField.js';
import { coastUniforms, COAST_GLSL } from '../world/coastShading.js';
import { atmoUniforms } from './atmoShared.js';
import { makeRng } from './weather.js';

// ---------------------------------------------------------------------------
// Unified Coastal Storm Surge & Urban Flood Simulation:
//  - Sea level physically rises up from the ocean over the beach, beach stairs,
//    seawall, and promenade to meet the city roads as ONE continuous water body.
//  - Standard Flood / Surge Mode: Sea level rises to +1.92m (0.32m on roads,
//    0.17m on sidewalks/promenade), submerging the beach & pier and meeting
//    the city roads seamlessly while raised green park beds (2.05m) stay dry.
//  - Extreme Flood Mode: Sea level rises to +2.48m (0.88m on roads = half of
//    standard 1.76m person height), overtopping the entire island including lawns.
//  - Zero Sawtooth & Zero Grass Bleed: Water planes extend horizontally as a
//    uniform sheet (uFloodLevel) right into 3D concrete curbs, garden walls,
//    planters, and building plinths so the GPU hardware Z-buffer clips every
//    waterline along the exact smooth 3D geometry at native pixel resolution,
//    with zero triangle-slope striping on flat surfaces like grass or sidewalks!
//  - Buttery Smooth 60 FPS Transitions: Exponential spring-damped water level
//    smoothing (seaLevelRise + sheetHeight) updated every rendered frame.
// ---------------------------------------------------------------------------

const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const RECT = [-64, -58, 64, 50];

export class FloodEvent {
  constructor(scene, { walkMesh, data, lowQuality = false, waterN, coastTex, traffic = null }) {
    Object.assign(this, { scene, walkMesh, data, D: data, low: lowQuality, waterN, coastTex, traffic });
    this.settings = { depth: 0.32, rain: 0.85, flow: 1.0, recession: 1.0 };
    this.phase = 'idle';
    this.running = false;
    this.paused = false;
    this.isExtreme = false;
    this.seaLevelRise = 0.0;
    this.seaLevelVel = 0.0;
    this.targetSeaLevel = 0.0;
    this.sheetHeight = G - 0.15;
    this.w = 0;
    this.stats = { mean: 0, max: 0, area: 0 };
    this.grid = null;
    this.acc = 0;
  }

  // ---- controls --------------------------------------------------------------------
  start() {
    this.ensure();
    this.isExtreme = false;
    if (this.settings.depth < 0.22 || this.settings.depth > 0.65) {
      this.settings.depth = 0.32;
    }
    this.targetSeaLevel = Math.max(1.86, G + this.settings.depth);
    this.running = true;
    this.paused = false;
    this.phase = 'rising';
  }

  startExtreme() {
    this.ensure();
    this.isExtreme = true;
    this.settings.depth = 0.88; // 88 cm on roads = half of standard 1.76m person height
    this.settings.rain = 1.0;
    this.settings.flow = 1.35;
    this.targetSeaLevel = G + this.settings.depth;
    this.running = true;
    this.paused = false;
    this.phase = 'rising';
  }

  toggleExtreme(on = !this.isExtreme) {
    if (on) this.startExtreme();
    else {
      this.isExtreme = false;
      this.settings.depth = 0.32;
      this.targetSeaLevel = G + this.settings.depth;
      if (this.running) this.phase = 'rising';
    }
  }

  pause(on = !this.paused) { this.paused = on; }

  recede() {
    if (this.running) {
      this.phase = 'receding';
      this.targetSeaLevel = 0.0;
    }
  }

  reset() {
    this.running = false;
    this.phase = 'idle';
    this.w = 0;
    this.isExtreme = false;
    this.targetSeaLevel = 0.0;
    this.seaLevelRise = 0.0;
    this.seaLevelVel = 0.0;
    this.sheetHeight = G - 0.15;
    if (coastUniforms && coastUniforms.uSeaLevel) {
      coastUniforms.uSeaLevel.value = 0.0;
    }
    if (this.grid) {
      for (const a of [this.grid.d, this.grid.fl, this.grid.fr, this.grid.ft, this.grid.fb, this.grid.vx, this.grid.vz, this.grid.foam]) a.fill(0);
      this.upload();
    }
    if (this.mesh) this.mesh.visible = false;
  }

  // ---- grid ---------------------------------------------------------------------------
  ensure() {
    if (this.grid) return;
    const cs = this.low ? 0.60 : 0.45;
    const [x0, z0, x1, z1] = RECT;
    const nx = Math.round((x1 - x0) / cs), nz = Math.round((z1 - z0) / cs), N = nx * nz;
    const h = new Float32Array(N), g = new Float32Array(N), kind = new Uint8Array(N);
    const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
    const o = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    const D = this.D;

    // Inset solid building checks by -0.25m (inside the opaque 3D walls) so the water plane
    // always reaches 100% flush to the outer 3D building walls and is clipped by the hardware Z-buffer.
    const inRect = (x, z, b, pad = -0.25) => Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad;
    const shopKiosk = { x: SHOP.x - 2.2, z: SHOP.z, w: 4.2, d: 3.2 };
    const blds = [APARTMENT, GRAFFITI, CAFE, shopKiosk];

    // Enclosed ground-level Metro ticket concourse hall on the south sidewalk
    const mLen = Math.hypot(1, METRO.slope);
    const mdx = 1 / mLen, mdz = METRO.slope / mLen;
    const inMetroHall = (x, z) => {
      const dx = x - METRO.station[0], dz = z - METRO.station[1];
      const u = dx * mdx + dz * mdz;
      const v = -dx * mdz + dz * mdx;
      return u > -6.95 && u < 6.95 && v > 8.20 && v < 11.30;
    };

    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = x0 + (i + 0.5) * cs, z = z0 + (j + 0.5) * cs;
      const wDist = D.coast.wallDist(x, z);

      // Outside the island seawall overlap zone
      if (wDist > 1.2) {
        h[k] = 10.0; kind[k] = 0; continue;
      }
      // Strictly inside enclosed opaque 3D building walls
      if (blds.some((b) => inRect(x, z, b, -0.25)) || inMetroHall(x, z)) {
        h[k] = 10.0; kind[k] = 0; continue;
      }
      // Raised pavilion plinth (solid 3D box up to WALK + 0.32 = 2.07m)
      if (Math.abs(x - PAVILION.x) < PAVILION.size / 2 - 0.18 && Math.abs(z - PAVILION.z) < PAVILION.size / 2 - 0.18) {
        h[k] = WALK + 0.32; kind[k] = 3; continue;
      }
      // Raised palm tree-pit planters
      if ((D.palmSpots || []).some(([px, pz]) => Math.abs(px - x) < 0.48 && Math.abs(pz - z) < 0.48)) {
        h[k] = WALK + 0.21; kind[k] = 3; continue;
      }

      // Along the seawall perimeter rim (-0.55m .. +1.2m), treat ground as promenade level WALK (1.75m)
      if (wDist > -0.55) {
        h[k] = WALK;
        kind[k] = 2;
        continue;
      }

      // Raycast from y = 2.5m downward (below the 9.1m elevated metro viaduct deck)
      o.set(x, 2.5, z); ray.set(o, down); ray.far = 2.2;
      const hit = ray.intersectObject(this.walkMesh, false)[0];
      if (!hit) {
        h[k] = WALK; kind[k] = 2; continue;
      }
      const y = hit.point.y;

      if (y > GREEN_TOP - 0.08) {
        h[k] = GREEN_TOP;
        kind[k] = 3; // raised garden beds / park lawns (2.05m)
      } else if (Math.abs(y - G) < 0.075) {
        h[k] = G;
        kind[k] = 1; // carriageway / city road (1.60m)
      } else {
        h[k] = WALK;
        kind[k] = 2; // sidewalk / pedestrian promenade / plaza (1.75m)
      }
    }

    // Distance (m) from road cells to the carriageway edge -> gentle gutter camber
    const de = new Float32Array(N).fill(1e9);
    for (let k = 0; k < N; k++) if (kind[k] !== 1) de[k] = 0;
    const pass = (k, n, w) => { if (de[n] + w < de[k]) de[k] = de[n] + w; };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i) pass(k, k - 1, 1);
      if (j) pass(k, k - nx, 1);
      if (i && j) pass(k, k - nx - 1, 1.414);
      if (j && i < nx - 1) pass(k, k - nx + 1, 1.414);
    }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      if (i < nx - 1) pass(k, k + 1, 1);
      if (j < nz - 1) pass(k, k + nx, 1);
      if (i < nx - 1 && j < nz - 1) pass(k, k + nx + 1, 1.414);
      if (j < nz - 1 && i) pass(k, k + nx - 1, 1.414);
    }
    for (let k = 0; k < N; k++) {
      if (!kind[k]) { g[k] = h[k]; continue; }
      const i = k % nx, j = (k / nx) | 0, x = x0 + (i + 0.5) * cs, z = z0 + (j + 0.5) * cs;
      const dm = de[k] * cs;
      let rel = 0;
      if (kind[k] === 1) {
        rel = -0.006 * Math.exp(-dm / 1.1) + 0.003 * (1 - Math.exp(-dm / 3.0));
        rel += 0.003 * (fbm(x * 0.04, z * 0.04, 71, 2) - 0.5) * 2;
      }
      g[k] = h[k] + rel;
    }

    // Storm-drain inlets along the gutters
    const r = makeRng(5150);
    const cand = [];
    for (let k = 0; k < N; k++) if (kind[k] === 1 && de[k] * cs < 1.0) cand.push(k);
    for (let i = cand.length - 1; i > 0; i--) { const q = Math.floor(r() * (i + 1)); [cand[i], cand[q]] = [cand[q], cand[i]]; }
    const drains = [];
    const pos = (k) => [x0 + ((k % nx) + 0.5) * cs, z0 + (((k / nx) | 0) + 0.5) * cs];
    for (const k of cand) {
      const [x, z] = pos(k);
      if (drains.every((q) => Math.hypot(q.x - x, q.z - z) > 12)) {
        const ci = k % nx, cj = (k / nx) | 0, rad = Math.ceil(2.2 / cs);
        const cells = [];
        let wSum = 0;
        for (let jj = cj - rad; jj <= cj + rad; jj++) for (let ii = ci - rad; ii <= ci + rad; ii++) {
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const nk = jj * nx + ii;
          if (kind[nk] !== 1) continue;
          const d2 = ((ii - ci) ** 2 + (jj - cj) ** 2) * cs * cs;
          if (d2 > 4.84) continue;
          const w = Math.exp(-d2 / 1.6);
          cells.push([nk, w]);
          wSum += w;
        }
        if (wSum > 0) {
          for (const c of cells) c[1] /= wSum;
          drains.push({ k, x, z, q: 0, cells });
        }
      }
    }

    let nRoad = 0;
    for (let k = 0; k < N; k++) if (kind[k] === 1) nRoad++;
    const Z = () => new Float32Array(N);
    this.grid = {
      cs, nx, nz, N, x0, z0, h, g, kind,
      d: Z(), fl: Z(), fr: Z(), ft: Z(), fb: Z(), vx: Z(), vz: Z(), foam: Z(), surf: Z(),
      drains, nRoad,
    };

    // LinearFilter for smooth continuous sampling across the island
    this.tex = new THREE.DataTexture(new Float32Array(N * 4), nx, nz, THREE.RGBAFormat, THREE.FloatType);
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;

    this.foamTex = new THREE.DataTexture(new Float32Array(N), nx, nz, THREE.RedFormat, THREE.FloatType);
    this.foamTex.wrapS = this.foamTex.wrapT = THREE.ClampToEdgeWrapping;
    this.foamTex.magFilter = this.foamTex.minFilter = THREE.LinearFilter;
    this.foamTex.generateMipmaps = false;

    const MAX_VEH = 12;
    this.maxVeh = MAX_VEH;
    this.uVehPoseArr = Array.from({ length: MAX_VEH }, () => new THREE.Vector4(0, 0, 1, 0));
    this.uVehWakeArr = Array.from({ length: MAX_VEH }, () => new THREE.Vector4(2.1, 0.88, 0, 0));
    this.uVehExtraArr = Array.from({ length: MAX_VEH }, () => new THREE.Vector4(1.35, -1.35, 0.80, 0));

    this.buildMesh();
    this.upload();
  }

  // ---- simulation -----------------------------------------------------------------------
  step(dt) {
    const S = this.grid, s = this.settings;
    const { nx, nz, N, cs, h, g, d, kind, fl, fr, ft, fb } = S;
    const area = cs * cs;
    const C = 9.81 * Math.max(0.15, s.flow) * cs * 0.5, damp = 0.985;

    if (this.running && this.phase !== 'receding') {
      this.targetSeaLevel = Math.max(1.86, G + s.depth);
    }

    const seaY = this.seaLevelRise;
    const sheetY = this.sheetHeight;

    for (let k = 0; k < N; k++) {
      const kd = kind[k];
      if (!kd) continue;
      // Smoothly couple every terrace (road 1.60m, sidewalk 1.75m, lawn 2.05m) to the continuous flood sheet height
      const targetY = kd === 1 ? sheetY : seaY;
      const targetD = Math.max(0, targetY - g[k]);
      const rate = targetD >= d[k] ? 8.5 : (5.5 * Math.max(0.4, s.recession));
      d[k] += (targetD - d[k]) * (1 - Math.exp(-dt * rate));
      if (d[k] < 1e-4 && targetD <= 0) d[k] = 0;
    }

    // Shallow-water pipe fluxes for realistic flow velocities & gutter currents
    for (let j = 0; j < nz; j++) {
      const row = j * nx;
      for (let i = 0; i < nx; i++) {
        const k = row + i;
        if (!kind[k] || d[k] <= 1e-4) { fl[k] = fr[k] = ft[k] = fb[k] = 0; continue; }
        const H = g[k] + d[k];
        let n;
        n = k - 1; fl[k] = i > 0 && kind[n] && H > g[n] + d[n] ? Math.max(0, fl[k] * damp + dt * C * (H - g[n] - d[n])) : 0;
        n = k + 1; fr[k] = i < nx - 1 && kind[n] && H > g[n] + d[n] ? Math.max(0, fr[k] * damp + dt * C * (H - g[n] - d[n])) : 0;
        n = k - nx; ft[k] = j > 0 && kind[n] && H > g[n] + d[n] ? Math.max(0, ft[k] * damp + dt * C * (H - g[n] - d[n])) : 0;
        n = k + nx; fb[k] = j < nz - 1 && kind[n] && H > g[n] + d[n] ? Math.max(0, fb[k] * damp + dt * C * (H - g[n] - d[n])) : 0;
        const sum = fl[k] + fr[k] + ft[k] + fb[k];
        if (sum > 0) {
          const K = Math.min(1, (d[k] * area) / (sum * dt));
          fl[k] *= K; fr[k] *= K; ft[k] *= K; fb[k] *= K;
        }
      }
    }

    let sumRoad = 0, mx = 0, wetN = 0;
    const vx = S.vx, vz = S.vz, foam = S.foam;
    for (let j = 0; j < nz; j++) {
      const row = j * nx;
      for (let i = 0; i < nx; i++) {
        const k = row + i;
        if (!kind[k]) continue;
        const inL = i > 0 ? fr[k - 1] : 0, inR = i < nx - 1 ? fl[k + 1] : 0;
        const inT = j > 0 ? fb[k - nx] : 0, inB = j < nz - 1 ? ft[k + nx] : 0;
        const out = fl[k] + fr[k] + ft[k] + fb[k];
        const dn = Math.max(0, d[k] + (dt * (inL + inR + inT + inB - out)) / area);
        d[k] = dn;
        const dd = Math.max(dn, 0.04) * cs;
        const ux = (inL - fl[k] + fr[k] - inR) * 0.5 / dd;
        const uz = (inT - ft[k] + fb[k] - inB) * 0.5 / dd;
        vx[k] = vx[k] * 0.72 + Math.max(-0.8, Math.min(0.8, ux)) * 0.28;
        vz[k] = vz[k] * 0.72 + Math.max(-0.8, Math.min(0.8, uz)) * 0.28;
        foam[k] *= 0.90;
        if (kind[k] === 1) sumRoad += dn;
        const effD = Math.max(0, (g[k] + dn) - h[k]);
        if (effD > mx) mx = effD;
        if (effD > 0.01) wetN++;
      }
    }
    const mean = sumRoad / Math.max(1, S.nRoad);
    if (this.phase === 'rising' && Math.abs(this.seaLevelRise - this.targetSeaLevel) < 0.03 && mean >= s.depth * 0.95) {
      this.phase = 'peak';
    }
    this.stampVehicles(dt);
    this.stats = { mean, max: mx, area: wetN * area };
    if (this.phase === 'receding' && mx < 0.003 && this.seaLevelRise < 0.03) {
      this.phase = 'idle';
      this.running = false;
      this.seaLevelRise = 0;
      this.seaLevelVel = 0;
      this.sheetHeight = G - 0.15;
      if (coastUniforms && coastUniforms.uSeaLevel) coastUniforms.uSeaLevel.value = 0;
      d.fill(0);
    }
  }

  stampVehicles(dt) {
    const S = this.grid;
    const vehicles = this.traffic?.vehicles;
    if (!S || !vehicles || !vehicles.length) return;
    const { nx, nz, cs, x0, z0, kind, d, vx, vz, foam } = S;
    for (const veh of vehicles) {
      if (!veh || veh.v < 0.25) continue;
      const hx = veh.hx || 1, hz = veh.hz || 0;
      const rx = -hz, rz = hx;
      const halfL = (veh.length || 4.2) * 0.5;
      const halfW = veh.kind === 'bus' ? 1.22 : (veh.kind === 'auto' ? 0.65 : 0.88);
      const spdK = Math.min(1.2, veh.v / 7.5);
      const reachL = halfL + 4.5, reachW = halfW + 2.4;
      const rad = Math.ceil(Math.hypot(reachL, reachW) / cs);
      const ci = Math.floor((veh.x - x0) / cs), cj = Math.floor((veh.z - z0) / cs);

      for (let jj = Math.max(0, cj - rad); jj <= Math.min(nz - 1, cj + rad); jj++) {
        const z = z0 + (jj + 0.5) * cs;
        const dz = z - veh.z;
        for (let ii = Math.max(0, ci - rad); ii <= Math.min(nx - 1, ci + rad); ii++) {
          const nk = jj * nx + ii;
          if (!kind[nk] || d[nk] < 0.005) continue;
          const x = x0 + (ii + 0.5) * cs;
          const dx = x - veh.x;
          const along = dx * hx + dz * hz;
          const across = dx * rx + dz * rz;
          if (along < -halfL - 4.2 || along > halfL + 1.0 || Math.abs(across) > reachW) continue;

          if (Math.abs(along) < halfL * 0.75 && Math.abs(across) < halfW * 0.75) continue;

          const depK = Math.min(1.0, d[nk] / 0.06);
          const absAcross = Math.abs(across);
          const sideSign = across >= 0 ? 1 : -1;

          const trailDist = Math.max(0, halfL * 0.5 - along);
          const wakeW = halfW * 0.85 + trailDist * 0.16;
          const wakeEnv = expClose(absAcross, wakeW) * Math.min(1.0, trailDist / 1.2) * expClose(trailDist, 3.2);

          const pushSpd = 0.28 * spdK * depK * wakeEnv;
          vx[nk] = Math.max(-0.85, Math.min(0.85, vx[nk] + rx * sideSign * pushSpd * dt * 6.0));
          vz[nk] = Math.max(-0.85, Math.min(0.85, vz[nk] + rz * sideSign * pushSpd * dt * 6.0));

          const addFoam = Math.min(0.28, 0.55 * spdK * depK * wakeEnv * dt * 3.5);
          foam[nk] = Math.min(0.48, foam[nk] + (0.48 - foam[nk]) * addFoam);
        }
      }
    }
  }

  syncVehicleUniforms(camera) {
    if (!this.mesh) return;
    const U = this.mesh.material.uniforms;
    const vehicles = this.traffic?.vehicles;
    if (!vehicles || !vehicles.length) {
      U.uVehCount.value = 0;
      return;
    }
    const camPos = camera?.position;
    let count = 0;
    for (let i = 0; i < vehicles.length && count < this.maxVeh; i++) {
      const v = vehicles[i];
      if (!v || v.v < 0.25) continue;
      const effFlood = Math.max(v.floodDepth || 0, this.sheetHeight - G);
      if (effFlood < 0.004) continue;
      if (camPos) {
        const dx = v.x - camPos.x, dz = v.z - camPos.z;
        if (dx * dx + dz * dz > 130 * 130) continue;
      }
      const spdK = ss(0.3, 8.8, v.v);
      const floodK = ss(0.004, 0.14, effFlood);
      this.uVehPoseArr[count].set(v.x, v.z, v.hx || 1, v.hz || 0);
      this.uVehWakeArr[count].set(v.halfL || 2.1, v.halfW || 0.88, spdK, floodK);
      const wheelZ = v.kind === 'auto' ? -(v.wheelTrackZ || 0.6) : (v.wheelTrackZ || 0.8);
      this.uVehExtraArr[count].set(v.frontWheelX || 1.35, v.rearWheelX || -1.35, wheelZ, v.turnCurve || 0);
      count++;
    }
    U.uVehCount.value = count;
  }

  upload() {
    const S = this.grid;
    const { nx, nz, N, h, g, d, kind, vx, vz, surf } = S;
    const out = this.tex.image.data, fo = this.foamTex.image.data;
    const sheetY = this.sheetHeight;

    // 1. Compute true water surface elevation `surf[k]` for every submerged cell
    for (let k = 0; k < N; k++) {
      if (!kind[k]) { surf[k] = -1e9; continue; }
      const rawSurf = Math.max(g[k] + d[k], kind[k] === 1 ? sheetY : this.seaLevelRise);
      const effDepth = rawSurf - h[k];
      surf[k] = effDepth > 0.002 ? Math.max(rawSurf, h[k] + 0.014) : -1e9;
    }

    // 2. Store ground elevation `h[k]` in `out[o + 1]` (s.g) and smooth water surface `ws` in `out[o]` (s.r).
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, o = k * 4;
        fo[k] = S.foam[k];
        const s0 = surf[k];
        const groundH = h[k];

        if (s0 > -1e8) {
          let sSum = s0 * 2.0, wSum = 2.0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue;
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
            const ns = surf[jj * nx + ii];
            if (ns > -1e8) { sSum += ns; wSum += 1.0; }
          }
          out[o] = sSum / wSum;
          out[o + 1] = groundH;
          out[o + 2] = vx[k];
          out[o + 3] = vz[k];
          continue;
        }

        // Dry cell: dilate the adjacent horizontal water surface elevation `ws` without tilting it!
        let sWeighted = 0, wTotal = 0;
        for (let dj = -4; dj <= 4; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= nz) continue;
          for (let di = -4; di <= 4; di++) {
            const ii = i + di;
            if (ii < 0 || ii >= nx) continue;
            const nk = jj * nx + ii;
            const ns = surf[nk];
            if (ns > -1e8) {
              const dist2 = di * di + dj * dj;
              const w = 1.0 / (1.0 + dist2);
              sWeighted += ns * w;
              wTotal += w;
            }
          }
        }

        out[o] = wTotal > 0 ? (sWeighted / wTotal) : sheetY;
        out[o + 1] = groundH;
        out[o + 2] = 0;
        out[o + 3] = 0;
      }
    }
    this.tex.needsUpdate = true;
    this.foamTex.needsUpdate = true;
  }

  sample(x, z) {
    const S = this.grid;
    if (!S) return null;
    const i = Math.floor((x - S.x0) / S.cs), j = Math.floor((z - S.z0) / S.cs);
    if (i < 0 || j < 0 || i >= S.nx || j >= S.nz) return null;
    const k = j * S.nx + i;
    const surfY = Math.max(S.g[k] + S.d[k], S.kind[k] === 1 ? this.sheetHeight : this.seaLevelRise);
    const effD = Math.max(0, surfY - S.h[k]);
    return { d: effD, y: S.h[k] + effD, vx: S.vx[k], vz: S.vz[k], kind: S.kind[k] };
  }

  sampleSmooth(x, z) {
    const S = this.grid;
    if (!S || (!this.running && this.stats.max <= 0.002 && this.seaLevelRise <= 0.01)) return null;
    const gx = (x - S.x0) / S.cs - 0.5;
    const gz = (z - S.z0) / S.cs - 0.5;
    const i0 = Math.floor(gx), j0 = Math.floor(gz);
    if (i0 < 0 || j0 < 0 || i0 >= S.nx - 1 || j0 >= S.nz - 1) return this.sample(x, z);
    const fx = gx - i0, fz = gz - j0;
    const { nx, g, d, h, vx, vz, kind } = S;
    let dSum = 0, ySum = 0, vxSum = 0, vzSum = 0, wSum = 0;
    for (let dj = 0; dj <= 1; dj++) {
      const wy = dj === 0 ? (1 - fz) : fz;
      for (let di = 0; di <= 1; di++) {
        const wx = di === 0 ? (1 - fx) : fx;
        const k = (j0 + dj) * nx + (i0 + di);
        if (!kind[k]) continue;
        const w = wx * wy;
        const surfY = Math.max(g[k] + d[k], kind[k] === 1 ? this.sheetHeight : this.seaLevelRise);
        const effD = Math.max(0, surfY - h[k]);
        dSum += effD * w;
        ySum += (h[k] + effD) * w;
        vxSum += vx[k] * w;
        vzSum += vz[k] * w;
        wSum += w;
      }
    }
    if (wSum <= 0.001) return null;
    return {
      d: dSum / wSum,
      y: ySum / wSum,
      vx: vxSum / wSum,
      vz: vzSum / wSum,
      kind: 1,
    };
  }

  // ---- per frame ----------------------------------------------------------------------------
  update(dt, camera, env) {
    const dtClamped = Math.min(dt, 0.05);
    const active = this.running || (this.grid && (this.stats.max > 0.002 || this.seaLevelRise > 0.005));
    const targetW = (this.running && this.phase !== 'receding') ? 1 : 0;
    this.w += (targetW - this.w) * (1 - Math.exp(-dtClamped / (this.running ? 4.0 : 6.0)));
    if (!this.grid || (!active && this.w < 0.002)) return this.w > 0.002 ? this.override() : null;

    // 1. Buttery-smooth critically damped spring-lerp for seaLevelRise & sheetHeight every rendered frame (60 FPS!)
    const targetSea = (this.running && this.phase !== 'receding') ? Math.max(1.86, G + this.settings.depth) : 0.0;
    this.targetSeaLevel = targetSea;

    if (!this.paused) {
      const omega = this.phase === 'receding' ? (1.15 * Math.max(0.4, this.settings.recession)) : 1.45;
      const diff = targetSea - this.seaLevelRise;
      this.seaLevelVel += (diff * omega * omega - 2.0 * omega * this.seaLevelVel) * dtClamped;
      this.seaLevelRise += this.seaLevelVel * dtClamped;
      if (this.seaLevelRise < 0.0005 && targetSea <= 0.001) {
        this.seaLevelRise = 0;
        this.seaLevelVel = 0;
      }

      if (coastUniforms && coastUniforms.uSeaLevel) {
        coastUniforms.uSeaLevel.value = this.seaLevelRise;
      }

      const seaY = this.seaLevelRise;
      let targetSheetY;
      if (this.phase !== 'receding') {
        const earlyRoadSheet = G - 0.02 + ss(0.04, 1.65, seaY) * 0.15;
        targetSheetY = Math.max(earlyRoadSheet, seaY);
      } else {
        const drainSheet = G - 0.04 + ss(0.02, 1.62, seaY) * 0.08;
        targetSheetY = Math.max(drainSheet, seaY);
      }
      this.sheetHeight += (targetSheetY - this.sheetHeight) * (1 - Math.exp(-dtClamped * 12.0));
    }

    // 2. Run 20 Hz shallow-water velocity & vehicle wake grid step
    if (this.running && !this.paused) {
      this.acc += dtClamped;
      const step = 1 / 20;
      let n = 0;
      while (this.acc >= step && n < 3) { this.step(step); this.acc -= step; n++; }
      if (n) this.upload();
    } else if (this.grid && (this.stats.max > 0.003 || this.seaLevelRise > 0.01) && this.traffic?.vehicles) {
      this.acc += dtClamped;
      const step = 1 / 20;
      if (this.acc >= step) {
        this.acc %= step;
        const { N, foam, vx, vz } = this.grid;
        for (let k = 0; k < N; k++) {
          foam[k] *= 0.90;
          vx[k] *= 0.92;
          vz[k] *= 0.92;
        }
        this.stampVehicles(step);
        const out = this.tex.image.data, fo = this.foamTex.image.data;
        for (let k = 0; k < N; k++) {
          fo[k] = foam[k];
          out[k * 4 + 2] = vx[k];
          out[k * 4 + 3] = vz[k];
        }
        this.tex.needsUpdate = true;
        this.foamTex.needsUpdate = true;
      }
    }

    const vis = this.sheetHeight > G + 0.002 || this.stats.max > 0.002;
    this.mesh.visible = vis;
    if (vis) {
      this.syncVehicleUniforms(camera);
    }
    const U = this.mesh.material.uniforms;
    U.uTime.value += dtClamped;
    U.uFloodLevel.value = this.sheetHeight;
    U.uAmb.value.copy(env.ambient);
    U.uSunCol.value.copy(env.sunColor);
    U.uRain.value = env.rain;
    U.uFlow.value = this.settings.flow;
    U.uFogCol.value.copy(env.fog.color); U.uFogNear.value = env.fog.near; U.uFogFar.value = env.fog.far;
    return this.override();
  }

  override() {
    const s = this.settings, rec = this.phase === 'receding';
    if (this.isExtreme) {
      return {
        weight: this.w,
        params: {
          cover: 1.0,
          dark: 0.88,
          rain: rec ? 0.35 : 1.0,
          storm: 0.85,
          wind: 3.2,
          gust: 2.2,
          haze: 0.95,
          fog: 0.65,
          mist: 0.45,
          scud: 1.0,
          cirrus: 0,
        },
        surfaces: this.w,
      };
    }
    return {
      weight: this.w,
      params: { cover: 1, dark: 0.74, rain: rec ? 0.15 : s.rain, storm: 0.12, wind: 1.8, gust: 1.0, haze: 0.85, fog: 0.4, mist: 0.15, scud: 0.85, cirrus: 0 },
      surfaces: this.w,
    };
  }

  // ---- rendering ------------------------------------------------------------------------------
  buildMesh() {
    const S = this.grid;
    const { nx, nz, cs, x0, z0 } = S;
    const pos = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      pos[k] = x0 + (i + 0.5) * cs; pos[k + 1] = 0; pos[k + 2] = z0 + (j + 0.5) * cs;
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let o = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = e;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...coastUniforms,
        uState: { value: this.tex },
        uFoam: { value: this.foamTex },
        uX0: { value: x0 },
        uZ0: { value: z0 },
        uCs: { value: cs },
        uNx: { value: nx },
        uNz: { value: nz },
        uTime: { value: 0 },
        uFloodLevel: { value: G - 0.15 },
        uWaterN: { value: this.waterN },
        uAmb: { value: new THREE.Color() },
        uSunCol: { value: new THREE.Color() },
        uRain: { value: 0 },
        uFlow: { value: 1 },
        uSkyZen: atmoUniforms.uSkyZenW,
        uSkyHor: atmoUniforms.uSkyHorW,
        uLightDir: atmoUniforms.uLightDirW,
        uFogCol: { value: new THREE.Color() },
        uFogNear: { value: 200 },
        uFogFar: { value: 900 },
        uVehCount: { value: 0 },
        uVehPose: { value: this.uVehPoseArr },
        uVehWake: { value: this.uVehWakeArr },
        uVehExtra: { value: this.uVehExtraArr },
      },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
      vertexShader: /* glsl */`
        precision highp float;
        precision highp int;
        ${COAST_GLSL}
        uniform sampler2D uState;
        uniform float uX0, uZ0, uCs, uNx, uNz, uFloodLevel;
        uniform int uVehCount;
        uniform vec4 uVehPose[12];
        uniform vec4 uVehWake[12];
        varying vec3 vW;
        varying vec2 vGridUv;
        varying vec2 vVel;

        void main() {
          vec2 uv = (position.xz - vec2(uX0, uZ0)) / (vec2(uNx, uNz) * uCs);
          vGridUv = uv;
          vec4 s = texture2D(uState, uv);
          vVel = s.ba;
          vec4 c = coastAt(position.xz);
          float overtop = smoothstep(1.72, 1.85, uSeaLevel);
          float perimMix = smoothstep(-1.5, -0.15, c.g) * overtop;
          float localRipple = clamp(s.r - uFloodLevel, -0.012, 0.012);

          // Subtle bow-wave water cushion directly ahead of each moving vehicle
          float vehLift = 0.0;
          if (uFloodLevel - s.g > 0.015) {
            for (int i = 0; i < 12; i++) {
              if (i >= uVehCount) break;
              vec4 pose = uVehPose[i];
              vec2 d = position.xz - pose.xy;
              if (abs(d.x) > 8.0 || abs(d.y) > 8.0) continue;
              vec4 wk = uVehWake[i];
              float along = d.x * pose.z + d.y * pose.w;
              float across = -d.x * pose.w + d.y * pose.z;
              float zn = across / max(0.35, wk.y);
              float bowArcX = wk.x + 0.10 - 0.18 * zn * zn;
              float dBow = along - bowArcX;
              float bowCrest = exp(-(dBow * dBow) / 0.18) * exp(-max(0.0, abs(zn) - 1.05) * 2.2);
              vehLift += bowCrest * 0.022 * wk.z * wk.w;
            }
          }
          vehLift = clamp(vehLift, 0.0, 0.032);

          float yIsland = uFloodLevel + localRipple * 0.35 + vehLift;
          float ySurf = mix(yIsland, uSeaLevel, perimMix);
          vec3 wp = vec3(position.x, ySurf, position.z);
          vW = wp;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        precision highp int;
        ${COAST_GLSL}
        uniform float uTime, uRain, uFlow, uFogNear, uFogFar, uFloodLevel;
        uniform float uX0, uZ0, uCs, uNx, uNz;
        uniform sampler2D uState;
        uniform sampler2D uWaterN;
        uniform sampler2D uFoam;
        uniform vec3 uAmb, uSunCol, uSkyZen, uSkyHor, uLightDir, uFogCol;
        uniform int uVehCount;
        uniform vec4 uVehPose[12];
        uniform vec4 uVehWake[12];
        uniform vec4 uVehExtra[12];
        varying vec3 vW;
        varying vec2 vGridUv;
        varying vec2 vVel;

        vec2 rotW(vec2 v, float a) {
          float c = cos(a), s = sin(a);
          return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
        }

        vec2 aperiodicWaveSlope(vec2 xz, float t, float nearFade, float midFade, float farAtten, vec4 macA, vec4 macB, vec2 vel) {
          vec2 w1 = (macA.rg - 0.5) * 3.4 + (macB.ba - 0.5) * 1.6 - vel * (t * 0.25);
          vec2 w2 = (macA.ba - 0.5) * 2.2 - (macB.rg - 0.5) * 1.4 - vel * (t * 0.18);

          vec2 n1 = texture2D(uWaterN, (xz + w1) * 0.043 + vec2(t * 0.016, -t * 0.011)).rg * 2.0 - 1.0;
          vec2 n2 = texture2D(uWaterN, rotW(xz - w1 * 0.7, 1.14) * 0.071 + vec2(-t * 0.014, t * 0.018)).rg * 2.0 - 1.0;
          vec2 n3 = texture2D(uWaterN, rotW(xz + w2, 2.399) * 0.118 + vec2(t * 0.021, t * 0.015)).rg * 2.0 - 1.0;

          vec2 s1 = n1;
          vec2 s2 = rotW(n2, -1.14);
          vec2 s3 = rotW(n3, -2.399);

          float b12 = smoothstep(0.20, 0.80, macA.b * 0.6 + macB.r * 0.4);
          vec2 grad = mix(s1, s2, b12) * (0.048 * farAtten) + s3 * (0.036 * midFade * (0.55 + 0.45 * macB.g));

          if (nearFade > 0.005) {
            vec2 n4 = texture2D(uWaterN, rotW(xz - w2 * 0.6, 4.05) * 0.195 + vec2(-t * 0.025, -t * 0.019)).rg * 2.0 - 1.0;
            vec2 n5 = texture2D(uWaterN, rotW(xz + w1 * 0.4, 5.41) * 0.285 + vec2(t * 0.029, -t * 0.022)).rg * 2.0 - 1.0;
            float b45 = smoothstep(0.25, 0.75, macB.a * 0.55 + macA.r * 0.45);
            vec2 cap = mix(rotW(n4, -4.05), rotW(n5, -5.41), b45);
            grad += cap * (0.042 * nearFade);
          }

          return grad * (0.80 + 0.22 * uSeaState);
        }

        float organicSeaFoam(vec2 xz, vec2 flowDir, float t) {
          vec2 p1 = xz * 0.095 - flowDir * (t * 0.08);
          vec4 n1 = texture2D(uNoiseTex, p1);
          vec2 warp = (n1.rg - 0.5) * 0.55;
          vec4 n2 = texture2D(uNoiseTex, rotW(xz, 0.72) * 0.23 - flowDir * (t * 0.13) + warp);
          vec4 n3 = texture2D(uNoiseTex, rotW(xz, -0.54) * 0.52 + flowDir * (t * 0.06) - warp * 0.7);
          return n1.b * 0.34 + n2.r * 0.40 + n3.g * 0.26;
        }

        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        vec2 ring(vec2 p, float t, float seed) {
          vec2 g = p * 1.65 + seed;
          vec2 cell = floor(g), f = fract(g) - 0.5;
          float h = hash12(cell + seed);
          float tt = t * (1.1 + h * 0.55) + h * 13.7;
          float cyc = floor(tt);
          float ph = fract(tt);
          if (hash12(cell + cyc * 1.91 + seed) > 0.32) return vec2(0.0);
          vec2 jit = (vec2(hash12(cell + cyc * 2.31 + 1.7), hash12(cell + cyc * 4.13 + 7.1)) - 0.5) * 0.46;
          vec2 d = f - jit;
          float r2 = dot(d, d);
          float life = 4.0 * ph * (1.0 - ph) * (1.0 - ph);
          float env = exp(-r2 * 28.0) * life;
          return -d * (14.0 * env);
        }

        void main() {
          vec2 xz = vW.xz;
          vec4 c = coastAt(xz);

          // Seamless perimeter handoff to water.js using the continuous 1024x1024 signed distance field c.g
          float overtop = smoothstep(1.72, 1.85, uSeaLevel);
          if (c.g >= mix(-0.12, -0.24, overtop)) discard;

          vec4 s = texture2D(uState, vGridUv);
          float groundH = s.g;
          vec4 edgeN = texture2D(uNoiseTex, xz * 0.045 + vec2(0.17, 0.31));
          float meniscusJitter = (edgeN.r - 0.5) * 0.016;
          float rawDepth = vW.y - groundH + meniscusJitter;
          if (rawDepth <= 0.001) discard;

          float depth = max(0.0, vW.y - groundH);
          float filmFade = smoothstep(0.001, 0.048, rawDepth);

          vec2 vel = clamp(vVel * uFlow, vec2(-0.85), vec2(0.85));
          float spd = length(vel);
          float gridFoam = clamp(texture2D(uFoam, vGridUv).r, 0.0, 1.0);

          float camDist = length(cameraPosition - vW);
          float nearFade = 1.0 - smoothstep(10.0, 38.0, camDist);
          float midFade  = 1.0 - smoothstep(45.0, 210.0, camDist);
          float farAtten = 1.0 - smoothstep(140.0, 980.0, camDist) * 0.65;

          // Sample multi-scale water turbulence first so vehicle wakes are organically warbled (never geometric bands)
          vec4 macA = texture2D(uNoiseTex, xz * 0.0029 + vec2(uWTime * 0.0012, -uWTime * 0.0009));
          vec4 macB = texture2D(uNoiseTex, rotW(xz, 0.93) * 0.0067 + vec2(-uWTime * 0.0015, uWTime * 0.0011));
          vec4 turbN = texture2D(uNoiseTex, xz * 0.34 - vel * (uWTime * 0.18) + vec2(uWTime * 0.04, -uWTime * 0.03));
          float gustPatch = 0.62 + 0.58 * smoothstep(0.22, 0.78, macA.r * 0.55 + macB.g * 0.45);

          // Evaluate unified, turbulence-warped vehicle wakes (zero hard box cutoffs, zero double-stripe banding)
          vec2 vehSlope = vec2(0.0);
          float vehFoam = 0.0;
          if (uVehCount > 0 && camDist < 110.0 && depth > 0.004) {
            float distAtten = 1.0 - smoothstep(65.0, 110.0, camDist);
            vec2 turbWarp = (turbN.rg - 0.5) * 0.42;

            for (int i = 0; i < 12; i++) {
              if (i >= uVehCount) break;
              vec4 pose = uVehPose[i];
              vec2 d = xz - pose.xy;
              if (abs(d.x) > 15.0 || abs(d.y) > 15.0) continue;
              vec4 wk = uVehWake[i];
              vec4 ex = uVehExtra[i];
              float halfL = wk.x, halfW = wk.y, spdK = wk.z, floodK = wk.w;

              float along = d.x * pose.z + d.y * pose.w;
              float across = -d.x * pose.w + d.y * pose.z;
              if (along < -halfL - 9.5 || along > halfL + 1.4 || abs(across) > halfW + 4.8) continue;

              // Smooth outer window guarantees wake always fades to 0.000 long before the bounding box edge
              float windowFade = smoothstep(-halfL - 9.2, -halfL - 2.8, along)
                               * smoothstep(halfL + 1.35, halfL + 0.35, along)
                               * smoothstep(halfW + 4.6, halfW + 1.6, abs(across));
              if (windowFade <= 0.002) continue;

              // Curve trailing slipstream smoothly with vehicle yaw rate + organic water turbulence
              float behind = max(0.0, halfL * 0.55 - along);
              float warpedAcross = across - ex.w * behind * behind * 0.015 + turbWarp.x * min(1.0, behind * 0.28);
              float warpedAlong = along + turbWarp.y * 0.35;
              vec2 lxz = vec2(warpedAlong, warpedAcross);

              // Mask out interior of solid vehicle chassis box
              float inX = smoothstep(halfL * 0.88, halfL * 0.58, abs(along));
              float inZ = smoothstep(halfW * 0.82, halfW * 0.50, abs(across));
              float hullMask = 1.0 - inX * inZ * 0.96;

              // 1. Soft Crescent Front Bow Ripple
              float zn = lxz.y / max(0.38, halfW);
              float bowCurveX = halfL + 0.08 - 0.20 * zn * zn;
              float dBow = lxz.x - bowCurveX;
              float bowSpan = smoothstep(1.42, 0.45, abs(zn));
              float bowCrest = exp(-(dBow * dBow) / 0.16) * bowSpan * floodK;

              // 2. Single Unified Hull V-Wake & Churned Slipstream (no double front/rear wheel stripe loops!)
              float wakeSpread = halfW * 0.84 + behind * (0.18 + 0.08 * spdK);
              float dWakeEdge = abs(lxz.y) - wakeSpread;
              float edgeWidth = 0.26 + behind * 0.14;
              float longitudinalDecay = smoothstep(-0.35, 0.45, behind) * exp(-behind / (2.2 + 2.4 * spdK));

              // Soft V-shoulder ripple + aerated center-rear churn behind the wheels
              float vShoulder = exp(-(dWakeEdge * dWakeEdge) / (edgeWidth * edgeWidth)) * longitudinalDecay;
              float rearChurn = exp(-(lxz.y * lxz.y) / (wakeSpread * wakeSpread * 0.95))
                              * smoothstep(halfL * 0.2, -halfL * 0.6, along)
                              * exp(-max(0.0, -along - halfL * 0.5) / (1.8 + 2.0 * spdK));

              float vIntensity = spdK * floodK * hullMask * windowFade * distAtten;
              float localFoam = (bowCrest * 0.65 + vShoulder * 0.48 + rearChurn * 0.42) * vIntensity;
              vehFoam = vehFoam + localFoam * (1.0 - min(0.75, vehFoam));

              // Subtle, turbulent water surface normal perturbation (no smooth plastic trenches)
              float sxLocal = (-dBow * 1.8 * bowCrest) * 0.055 * vIntensity;
              float szLocal = (-dWakeEdge / max(0.12, edgeWidth) * vShoulder * sign(lxz.y)) * 0.050 * vIntensity;
              vehSlope += vec2(
                sxLocal * pose.z - szLocal * pose.w,
                sxLocal * pose.w + szLocal * pose.z
              );
            }
          }

          float totalFoam = clamp(gridFoam * 0.65 + vehFoam * 0.82, 0.0, 0.85);

          // Damp wave normals in ultra-thin water films (< 4cm) so grass/pavement overtopping looks like a calm sheet
          float waveDepthEnv = smoothstep(0.004, 0.065, rawDepth);
          vec2 slope = aperiodicWaveSlope(xz, uWTime, nearFade, midFade, farAtten, macA, macB, vel)
                     * gustPatch * waveDepthEnv * (0.85 + 0.55 * min(spd, 1.0) + 0.25 * totalFoam)
                     + clamp(vehSlope, vec2(-0.10), vec2(0.10)) * waveDepthEnv;

          if (camDist < 34.0 && uRain > 0.02) {
            float rFade = (1.0 - camDist / 34.0) * waveDepthEnv;
            mat2 rotF = mat2(0.788, -0.616, 0.616, 0.788);
            vec2 rRot = rotF * xz * 1.37 + vec2(5.3, 2.9);
            slope += (ring(xz, uTime, 0.0) + ring(rRot, uTime * 1.09, 4.1) * 0.85) * (0.028 * uRain * rFade);
          }

          vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
          vec3 V = normalize(cameraPosition - vW);
          float NoV = clamp(dot(N, V), 0.001, 1.0);

          // Identical marine coastal water body optics to water.js
          vec3 submergedBed = vec3(0.14, 0.15, 0.14);
          vec3 skyAmb = mix(uSkyHorizon, uSkyTop, 0.35) * 0.30 + uSunColW * max(uSunDirW.y, 0.0) * 0.32;
          vec3 bedLit = submergedBed * skyAmb;

          float sunStr = clamp(dot(uSunColW, vec3(0.3333)), 0.0, 1.0);
          if (uQualityTier >= 0.5 && sunStr > 0.02 && depth > 0.04) {
            float c1 = texture2D(uCoastTex, xz * 0.17 + vec2(uWTime * 0.019, uWTime * 0.011)).g;
            float c2 = texture2D(uCoastTex, mat2(0.8, -0.6, 0.6, 0.8) * xz * 0.21 - vec2(uWTime * 0.014, -uWTime * 0.017)).g;
            float caus = min(c1, c2) * 2.2 + c1 * c2 * 1.2;
            bedLit *= 1.0 + caus * smoothstep(0.05, 0.35, depth) * exp(-depth * 0.8) * sunStr * 0.20;
          }

          float cv = sqrt(max(0.05, 1.0 - (1.0 - V.y * V.y) * 0.5625));
          float cl = sqrt(max(0.05, 1.0 - (1.0 - uSunDirW.y * uSunDirW.y) * 0.5625));
          float effOptD = depth + 0.32 * overtop * smoothstep(0.02, 0.16, depth);
          float optPath = effOptD / max(cv, 0.28) + effOptD / max(cl, 0.28);
          vec3 refr = bedLit * exp(-uAbsorb * optPath) + uInscatter * (1.0 - exp(-uScatterK * optPath));

          float deepBlend = smoothstep(0.10, 1.10, effOptD);
          vec3 deepBody = uInscatter * 0.94 + skyAmb * vec3(0.015, 0.048, 0.072);
          refr = mix(refr, deepBody, deepBlend * 0.76);

          // Pure physical Sky Fresnel reflection + sun specular glitter matching water.js
          vec3 R = reflect(-V, N);
          R.y = max(R.y, 0.015);
          float f1 = clamp(1.0 - NoV, 0.0, 1.0);
          float f2 = f1 * f1;
          float fres = 0.02 + 0.88 * f2 * f2 * f1;
          vec3 skyR = skyColor(R);
          vec3 H = normalize(V + uSunDirW);
          float NoH = clamp(dot(N, H), 0.0, 1.0);
          float spec = pow(max(NoH, 1e-4), 220.0) * step(1e-3, NoH) * smoothstep(-0.02, 0.12, uSunDirW.y);
          vec3 col = mix(refr, skyR, clamp(fres * 0.82, 0.0, 0.84)) + uSunColW * spec * 1.35 * farAtten * filmFade;

          // Fine, natural aerated micro-bubble wake foam (never contour-banded stripes!)
          if (totalFoam > 0.008) {
            float foamField = organicSeaFoam(xz, vec2(0.85, -0.45) + vel * 0.65, uWTime * 1.15);
            float microBubble = texture2D(uNoiseTex, xz * 0.95 - vel * (uWTime * 0.35)).r;
            float fineBubbles = texture2D(uNoiseTex, rotW(xz, 1.1) * 2.1 + vec2(uWTime * 0.12, -uWTime * 0.15)).g;
            float wakeLace = foamField * 0.35 + microBubble * 0.38 + fineBubbles * 0.27;

            vec3 cleanFoamCol = max(uFoamCol, vec3(0.76, 0.84, 0.88) * max(0.38, dot(uAmb, vec3(0.333))));
            float foamAlpha = totalFoam * smoothstep(0.22, 0.78, wakeLace) * (0.42 + 0.38 * fineBubbles);
            col = mix(col, cleanFoamCol * 0.94, clamp(foamAlpha * filmFade, 0.0, 0.58));
          }

          // Smooth meniscus alpha transition so rising/falling water glides over flat surfaces without hard edges
          float alpha = clamp(filmFade * (0.74 + 0.26 * smoothstep(0.04, 0.28, effOptD) + fres * 0.22 + vehFoam * 0.16), 0.0, 1.0);

          col = mix(col, uFogCol, smoothstep(uFogNear, uFogFar, camDist));
          gl_FragColor = vec4(max(col, vec3(0.0)), alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }
}

function expClose(v, w) {
  const d = v / w;
  return Math.exp(-d * d);
}
