import * as THREE from 'three';
import { skyState, phaseName, localToUtcMs, utcMsToLocal, SYNODIC } from './astro.js';
import { makePalette, samplePalette } from './palette.js';
import { WeatherSim, WEATHER } from './weather.js';
import { atmoUniforms, makeCloudTexture } from './atmoShared.js';
import { buildSkyDome, buildLensFlare } from './skyDome.js';
import { installSurfaceFx, makeLampMap } from './surfaceFx.js';
import { buildRain, buildSplashes, bakeSurfaceHeights, buildBolt } from './precip.js';
import { WeatherAudio } from './audio.js';
import { FloodEvent } from './flood.js';
import { WALK, APARTMENT, GRAFFITI, CAFE, SHOP, PAVILION, METRO } from '../layout.js';

// ---------------------------------------------------------------------------
// Optimization tiers (Low, Medium, High, Max) designed for mobile & web GPUs:
//  - Low:    battery / ultra-fast mobile (no dynamic shadow map, contact AO
//            kept, 0.85x DPR cap, aggressive LOD bias 0.45, 3 cloud steps,
//            fast water/surface shaders)
//  - Medium: 30-60 FPS mobile target (1.05x DPR cap, 1024px PCF shadow map
//            throttled to every 4th frame, rock shadows off, LOD bias 0.68,
//            5 cloud steps)
//  - High:   60+ FPS desktop browser target without needing a heavy discrete
//            GPU (1.25x DPR cap to prevent 4K/Retina fill-rate bottlenecks,
//            1536px PCF shadow map updated every 2nd frame, rock shadows off,
//            balanced LOD bias 1.0, 7 cloud steps)
//  - Max:    ultra showcase quality (up to 2.0x DPR, 2048px PCFSoft shadows
//            every frame, all rock shadows on, 1.45 LOD bias, 10 cloud steps)
// ---------------------------------------------------------------------------

export const QUALITY_MODES = ['low', 'medium', 'high', 'max'];

export const QUALITY_PROFILES = {
  low: {
    id: 'low',
    label: 'Low',
    short: 'LOW',
    desc: 'Max FPS · Mobile battery saver · Contact AO only · Fast shaders',
    dpr: 0.85,
    shadows: false,
    shadowSize: 1024,
    shadowType: THREE.BasicShadowMap,
    shadowSkip: 0,
    rockShadows: false,
    vehicleShadows: false,
    lodBias: 0.45,
    cloudSteps: 4,
    rainCount: 5500,
    splashes: false,
    surfaceQuality: 0.0,
    waterQuality: 0.0,
    boatWakeSkip: 3,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    short: 'MED',
    desc: 'Mobile 30–60 FPS · 1536px soft shadows · Balanced shaders & LOD',
    dpr: 1.05,
    shadows: true,
    shadowSize: 1536,
    shadowType: THREE.PCFSoftShadowMap,
    shadowSkip: 3,
    rockShadows: false,
    vehicleShadows: false,
    lodBias: 0.68,
    cloudSteps: 6,
    rainCount: 9500,
    splashes: true,
    surfaceQuality: 1.0,
    waterQuality: 1.0,
    boatWakeSkip: 2,
  },
  high: {
    id: 'high',
    label: 'High',
    short: 'HIGH',
    desc: 'Desktop 60+ FPS · 2048px soft shadows · Full coastal & wet shaders',
    dpr: 1.25,
    shadows: true,
    shadowSize: 2048,
    shadowType: THREE.PCFSoftShadowMap,
    shadowSkip: 2,
    rockShadows: false,
    vehicleShadows: true,
    lodBias: 1.0,
    cloudSteps: 8,
    rainCount: 15000,
    splashes: true,
    surfaceQuality: 2.0,
    waterQuality: 2.0,
    boatWakeSkip: 1,
  },
  max: {
    id: 'max',
    label: 'Max',
    short: 'MAX',
    desc: 'Ultra showcase · Native HiDPI · 4096px soft shadows every frame · Max LOD',
    dpr: 2.0,
    shadows: true,
    shadowSize: 4096,
    shadowType: THREE.PCFSoftShadowMap,
    shadowSkip: 1,
    rockShadows: true,
    vehicleShadows: true,
    lodBias: 1.45,
    cloudSteps: 12,
    rainCount: 22000,
    splashes: true,
    surfaceQuality: 3.0,
    waterQuality: 3.0,
    boatWakeSkip: 1,
  },
};

const MOON_COL = new THREE.Color('#a9bde8');
const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const DEG = 180 / Math.PI;

export class Atmosphere {
  constructor({ scene, renderer, camera, sun, hemi, fog, materials: M, data: D, walkMesh, water, nature, traffic, coastUniforms, windUniforms, puddleNoise, waterNormal, quality = 'high' }) {
    Object.assign(this, { scene, renderer, camera, sun, hemi, fog, M, D, walkMesh, water, nature, traffic, coastUniforms, windUniforms });
    this.quality = QUALITY_PROFILES[quality] ? quality : 'high';
    this.qualityProfile = QUALITY_PROFILES[this.quality];
    this.qualityListeners = [];
    this._frameCount = 0;
    const low = this.quality === 'low' || this.quality === 'medium';

    // ---- clock: local Kochi time, default today 16:30 (the island's original light)
    const now = new Date();
    this.ms = localToUtcMs(now.getFullYear(), now.getMonth() + 1, now.getDate(), 16.5);
    this.timeScale = 30;              // game seconds per real second (1 day = 48 min)
    this.moonShift = 0;               // days, dev override of the lunar age
    this.weather = new WeatherSim('scattered');
    this.pal = makePalette();
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this._prevLightDir = new THREE.Vector3(0, 1, 0);
    this.cloudOffset = new THREE.Vector2();
    this.scudOffset = new THREE.Vector2();
    this.windAngle = Math.atan2(-0.36, 0.93);
    this.windDirOverride = null;   // radians (direction the wind blows towards), dev override
    this.realTime = 0;

    // ---- shared resources
    atmoUniforms.uCloudTex.value = makeCloudTexture(256);
    atmoUniforms.uPuddleNoise.value = puddleNoise;
    const lampRect = [-70, -66, 70, 70];
    atmoUniforms.uLampRect.value.set(...lampRect);
    atmoUniforms.uLampMap.value = makeLampMap(this.lampSpots(), lampRect);

    this.sky = buildSkyDome(scene, { lowQuality: low });
    this.lensFlare = buildLensFlare(scene);
    this._flareVis = 0;
    this._flareOcclusionTarget = 1;
    this._flareRaycaster = new THREE.Raycaster();
    this._flareRaycaster.firstHitOnly = true;
    this._flareRaycaster.near = 0.4;
    this._flareRaycaster.far = 150;
    this._flareBoxes = null;
    this._treeSpheres = null;
    this._sunWorldTmp = new THREE.Vector3();
    this._camFwdTmp = new THREE.Vector3();

    // Allocate max buffer once so switching Low -> Max at runtime never reallocates GPU buffers
    this.rain = buildRain(scene, 22000);
    this.splash = buildSplashes(scene, bakeSurfaceHeights(walkMesh), 56);
    this.allowSplashes = true;
    this.bolt = buildBolt(scene);
    this.audio = new WeatherAudio();
    this.env = {
      ambient: new THREE.Color(0.8, 0.8, 0.8), sunColor: new THREE.Color(), fog, flash: 0, rain: 0, windX: 0, windZ: 0,
      isLand: (x, z) => D.coast.wallDist(x, z) < 0 || D.coast.height(x, z) > 0.05,
    };
    this.flood = new FloodEvent(scene, { walkMesh, data: D, lowQuality: low, waterN: waterNormal, coastTex: coastUniforms.uCoastTex.value, traffic });
    if (traffic) traffic.atmo = this;
    this.flash = { pulses: [], level: 0, dir: new THREE.Vector3(1, 0.25, 0), dist: 2000, near: 0, next: 6, boltUntil: 0, boltK: 0 };

    // ---- materials: per-material wetness profiles (roads pool water, walls only darken)
    const P = new Map();
    const set = (k, prof) => { if (M[k]) P.set(M[k], prof); };
    set('asphalt', { dark: 0.42, rough: 0.16, side: 0.3, refl: 0.35, puddle: 1 });
    set('paving', { dark: 0.36, rough: 0.2, side: 0.3, refl: 0.28, puddle: 0.55 });
    for (const k of ['lineWhite', 'lineYellow']) set(k, { dark: 0.22, rough: 0.22, side: 0.3, refl: 0.26, puddle: 0.75 });
    for (const k of ['curb', 'concrete', 'concreteDark', 'stone', 'powerPole', 'cementManhole', 'cementManholeDark']) set(k, { dark: 0.28, rough: 0.42, side: 0.4, refl: 0.10 });
    for (const k of ['roofTiles', 'planks', 'wood', 'woodDark']) set(k, { dark: 0.32, rough: 0.3, side: 0.35, refl: 0.18 });
    set('grass', { dark: 0.18, rough: 0.58, side: 0.4, refl: 0.04, puddle: 0 });
    for (const k of ['drainGrate', 'drainIronRim', 'drainSump']) set(k, { dark: 0.12, rough: 0.46, side: 0.5, refl: 0.10 });
    for (const k of ['railing', 'metalDark', 'steel', 'transformer', 'powerWire', 'insulator', 'guyGuard', 'solar', 'blueRoof', 'teal', 'awning', 'whitePaint']) set(k, { dark: 0.08, rough: 0.24, side: 0.6, refl: 0.20 });
    const noWet = new Set([M.coastGround].filter(Boolean));     // shoreline keeps its own wet/dry logic
    this.patched = installSurfaceFx(scene, (m) => {
      if (noWet.has(m)) return null;
      if (P.has(m)) return P.get(m);
      if (m.map && m.map.isTexture && m.alphaTest > 0) return { dark: 0.19, rough: 0.64, side: 0.60, refl: 0.0 };    // foliage deepens naturally when wet with a subtle damp sheen
      if (m.vertexColors && m.name !== 'player') return null;                                                        // rocks etc. (shore)
      return { dark: 0.18, rough: 0.35, side: 0.4, refl: 0.12 };                                                    // walls, misc.
    });

    // remember base values we modulate
    this.base = {
      inscatter: coastUniforms.uInscatter.value.clone(),
      foamWater: water.mesh.material.uniforms.uFoamCol.value.clone(),
      foamGround: M.coastGround?.userData.uniforms?.uFoamCol.value.clone(),
      lampGlow: M.lampGlow?.emissiveIntensity ?? 0.6,
      signTea: M.signTea?.emissiveIntensity ?? 0.35,
      signMetro: M.signMetro?.emissiveIntensity ?? 0.3,
    };
    this.tmp = { a: new THREE.Color(), b: new THREE.Color(), c: new THREE.Color(), grey: new THREE.Color() };
    this.info = {};
    this.setQuality(this.quality);
    this.update(0, camera, new THREE.Vector3());
  }

  onQualityChange(fn) {
    this.qualityListeners.push(fn);
  }

  /** Apply an optimization mode ('low' | 'medium' | 'high' | 'max') immediately at runtime. */
  setQuality(mode) {
    const prof = QUALITY_PROFILES[mode] || QUALITY_PROFILES.high;
    this.quality = prof.id;
    this.qualityProfile = prof;

    // 1. Pixel ratio (prevents 4K/Retina & mobile fill-rate bottlenecks)
    const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 375);
    const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 667);
    const dpr = Math.min(window.devicePixelRatio || 1, prof.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(vw, vh);

    // 2. Shadow map configuration & frame-skip throttling
    const sm = this.renderer.shadowMap;
    if (sm.enabled !== prof.shadows || sm.type !== prof.shadowType) {
      sm.enabled = prof.shadows;
      sm.type = prof.shadowType;
    }
    sm.autoUpdate = false;
    this.sun.castShadow = prof.shadows;
    if (prof.shadows) {
      const maxTex = this.renderer.capabilities?.maxTextureSize || 4096;
      const targetSize = Math.min(prof.shadowSize, maxTex);
      this.sun.shadow.radius = 1.35;
      this.sun.shadow.bias = -0.00025;
      this.sun.shadow.normalBias = 0.022;
      if (this.sun.shadow.mapSize.x !== targetSize) {
        this.sun.shadow.mapSize.setScalar(targetSize);
        if (this.sun.shadow.map) {
          this.sun.shadow.map.dispose();
          this.sun.shadow.map = null;
        }
      }
      sm.needsUpdate = true;
    }

    // 3. Rock & vehicle shadow casters + screen-space LOD bias
    if (this.nature) {
      if (this.nature.batches?.rocks?.mesh) {
        this.nature.batches.rocks.mesh.castShadow = prof.rockShadows;
      }
      if (this.nature.lod) {
        this.nature.lod.setBias(prof.lodBias);
        this.nature.lod.update(this.camera, vh, true);
      }
      if (this.nature.surfaceLeaves) {
        const leafScale = prof.id === 'low' ? 0.45 : prof.id === 'medium' ? 0.72 : 1.0;
        this.nature.surfaceLeaves.setQualityScale(leafScale);
      }
    }
    if (this.traffic?.vehicles) {
      for (const v of this.traffic.vehicles) {
        v.group.traverse((o) => { if (o.isMesh) o.castShadow = prof.vehicleShadows; });
      }
    }

    // 4. Shader quality uniforms & raymarching steps
    this.sky.uniforms.uCloudSteps.value = prof.cloudSteps;
    this.rain.mesh.geometry.instanceCount = prof.rainCount;
    this.allowSplashes = prof.splashes;
    atmoUniforms.uSurfaceQuality.value = prof.surfaceQuality;
    this.coastUniforms.uQualityTier.value = prof.waterQuality;

    for (const fn of this.qualityListeners) fn(prof.id, prof);
  }

  lampSpots() {
    return (this.D.lamps || []).map(([x, z]) => {
      // lamp arms reach over the carriageway: nudge the pool towards the nearest road
      const r = this.D.roads?.ring?.pl;
      if (!r) return [x, z];
      const p = r.at(r.project(x, z));
      const dx = p.x - x, dz = p.z - z, l = Math.hypot(dx, dz) || 1;
      return [x, z, dx / l, dz / l];
    });
  }

  // ---- dev API -------------------------------------------------------------------
  get local() { return utcMsToLocal(this.ms); }
  setHours(h) { const L = this.local; this.ms = localToUtcMs(L.year, L.month, L.day, h); }
  setDate(y, m, d) { const L = this.local; this.ms = localToUtcMs(y, m, d, L.hours); }
  setMoonAge(age) {
    if (age === null) { this.moonShift = 0; return; }
    const cur = skyState(this.ms, 0).age;
    let delta = age - cur;
    delta -= Math.round(delta / SYNODIC) * SYNODIC;
    this.moonShift = delta * (SYNODIC / (SYNODIC - 1));   // moon gains ~1 synodic day per (synodic-1) days
  }
  strike(near = false) { this.flash.next = 0; this.flash.forceNear = near; }

  _initFlareOccluders() {
    if (this._flareBoxes) return;
    // Pre-pack 3D AABB bounds [minX, minY, minZ, maxX, maxY, maxZ] for all buildings + roofs + pavilion
    this._flareBoxes = [
      [APARTMENT.x - APARTMENT.w * 0.52, WALK, APARTMENT.z - APARTMENT.d * 0.52, APARTMENT.x + APARTMENT.w * 0.52, WALK + APARTMENT.h + 2.4, APARTMENT.z + APARTMENT.d * 0.52],
      [GRAFFITI.x - GRAFFITI.w * 0.52, WALK, GRAFFITI.z - GRAFFITI.d * 0.52, GRAFFITI.x + GRAFFITI.w * 0.52, WALK + GRAFFITI.h + 1.8, GRAFFITI.z + GRAFFITI.d * 0.52],
      [CAFE.x - CAFE.w * 0.52, WALK, CAFE.z - CAFE.d * 0.52, CAFE.x + CAFE.w * 0.52, WALK + CAFE.h + 1.8, CAFE.z + CAFE.d * 0.52],
      [SHOP.x - SHOP.w * 0.52, WALK, SHOP.z - SHOP.d * 0.52, SHOP.x + SHOP.w * 0.52, WALK + SHOP.h + 0.9, SHOP.z + SHOP.d * 0.52],
      [PAVILION.x - PAVILION.size * 0.52, WALK, PAVILION.z - PAVILION.size * 0.52, PAVILION.x + PAVILION.size * 0.52, WALK + 4.8, PAVILION.z + PAVILION.size * 0.52],
    ];
    // Pre-pack flat Float32Array of tree canopy spheres [x, y, z, rSq] for zero-allocation <0.003ms checks
    const trees = this.nature?.trees || [];
    const sph = new Float32Array(trees.length * 4);
    for (let i = 0; i < trees.length; i++) {
      const tr = trees[i];
      const rC = (tr.r || 2.5) * 0.78;
      const k = i * 4;
      sph[k]     = tr.x;
      sph[k + 1] = tr.y + tr.h * 0.68;
      sph[k + 2] = tr.z;
      sph[k + 3] = rC * rC;
    }
    this._treeSpheres = sph;
  }

  _isSunOccluded(camPos, sunDir, focus) {
    this._initFlareOccluders();
    const ox = camPos.x, oy = camPos.y, oz = camPos.z;
    const dx = sunDir.x, dy = sunDir.y, dz = sunDir.z;
    const invX = Math.abs(dx) > 1e-6 ? 1 / dx : 1e9;
    const invY = Math.abs(dy) > 1e-6 ? 1 / dy : 1e9;
    const invZ = Math.abs(dz) > 1e-6 ? 1 / dz : 1e9;

    // 1. Fast analytical 3D Ray-AABB check against buildings & roofs (< 0.001ms)
    const boxes = this._flareBoxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const tx1 = (b[0] - ox) * invX, tx2 = (b[3] - ox) * invX;
      let tmin = Math.min(tx1, tx2), tmax = Math.max(tx1, tx2);
      const ty1 = (b[1] - oy) * invY, ty2 = (b[4] - oy) * invY;
      tmin = Math.max(tmin, Math.min(ty1, ty2));
      tmax = Math.min(tmax, Math.max(ty1, ty2));
      if (tmax < 0.3 || tmin > tmax) continue;
      const tz1 = (b[2] - oz) * invZ, tz2 = (b[5] - oz) * invZ;
      tmin = Math.max(tmin, Math.min(tz1, tz2));
      tmax = Math.min(tmax, Math.max(tz1, tz2));
      if (tmax >= Math.max(0.3, tmin) && tmin < 150.0) return true;
    }

    // 2. Fast analytical check against the elevated Metro viaduct deck & station canopy
    if (oy < METRO.deckY + 7.2 && dy > -0.05) {
      // Check intersection with viaduct slab plane y in [METRO.deckY - 1.2, METRO.deckY + 1.2]
      if (Math.abs(dy) > 1e-4) {
        const tDeck = (METRO.deckY - oy) / dy;
        if (tDeck > 0.4 && tDeck < 140.0) {
          const hx = ox + dx * tDeck, hz = oz + dz * tDeck;
          if (hx > -62 && hx < 62) {
            const zCenter = METRO.zAtX(hx);
            if (Math.abs(hz - zCenter) < 4.9) return true;
          }
        }
        // Station roof canopy at METRO.station
        const tRoof = (METRO.deckY + 5.2 - oy) / dy;
        if (tRoof > 0.4 && tRoof < 140.0) {
          const hx = ox + dx * tRoof, hz = oz + dz * tRoof;
          if (Math.abs(hx - METRO.station[0]) < 19.0 && Math.abs(hz - METRO.station[1]) < 8.5) return true;
        }
      }
    }

    // 3. Check if player character body/head occludes the sun from camera
    if (focus) {
      const pvx = focus.x - ox, pvy = (focus.y + 0.95) - oy, pvz = focus.z - oz;
      const tPlayer = pvx * dx + pvy * dy + pvz * dz;
      if (tPlayer > 0.4 && tPlayer < 25.0) {
        const d2Player = (pvx * pvx + pvy * pvy + pvz * pvz) - tPlayer * tPlayer;
        if (d2Player < 0.45 * 0.45) return true;
      }
    }

    // 4. Check packed tree canopy spheres along the sun ray (< 0.003ms)
    const sph = this._treeSpheres;
    if (sph) {
      for (let i = 0, n = sph.length; i < n; i += 4) {
        const vx = sph[i] - ox, vy = sph[i + 1] - oy, vz = sph[i + 2] - oz;
        const tProj = vx * dx + vy * dy + vz * dz;
        if (tProj > 1.0 && tProj < 140.0) {
          const d2 = (vx * vx + vy * vy + vz * vz) - tProj * tProj;
          if (d2 < sph[i + 3]) return true;
        }
      }
    }

    // 5. BVH-accelerated raycast against walkable terrain / seawall / steps only (< 0.008ms)
    if (this.walkMesh && oy < 11.0) {
      this._flareRaycaster.set(camPos, sunDir);
      const hits = this._flareRaycaster.intersectObject(this.walkMesh, false);
      if (hits.length > 0) return true;
    }

    return false;
  }

  // ---- per frame -------------------------------------------------------------------
  update(dtReal, camera, focus) {
    this._frameCount++;
    const { pal, tmp, sun, hemi, fog } = this;
    const U = this.sky.uniforms, A = atmoUniforms;
    this.realTime += dtReal;
    const dtGame = dtReal * this.timeScale;
    this.ms += dtGame * 1000;
    const L = this.local;
    const st = skyState(this.ms, this.moonShift);
    const sunV = tmp.sv || (tmp.sv = new THREE.Vector3());
    const moonV = tmp.mv || (tmp.mv = new THREE.Vector3());
    sunV.fromArray(st.sun); moonV.fromArray(st.moon);
    const sunEl = Math.asin(sunV.y) * DEG, moonEl = Math.asin(moonV.y) * DEG;
    const evening = ss(0.15, -0.15, sunV.x);
    samplePalette(pal, sunEl, evening);

    // ---- weather, then the flood scenario layered on top of it
    const W0 = this.weather.update(dtReal, dtGame / 60, { month: L.month, hour: L.hours, sunUp: sunEl > 0 });
    const env = this.env;
    env.rain = W0.rain;
    const fl = this.flood.update(dtReal, camera, env);
    const W = { ...W0 };
    if (fl && fl.weight > 0) {
      for (const [k, v] of Object.entries(fl.params)) W[k] += (v - W[k]) * fl.weight;
    }
    this.weather.soak(W, dtReal, dtGame / 60);
    this.scenario = { fl };
    const cover = W.cover, dark = W.dark;
    const dayK = ss(-6, 4, sunEl), night = 1 - ss(-12, -3, sunEl);
    const moonUp = ss(-1.5, 6, moonEl);
    const moonLight = moonUp * (0.1 + 0.9 * st.illum);

    // ---- lightning (Poisson strikes, multi-pulse flashes, delayed thunder)
    const F = this.flash;
    const stormEff = Math.max(0, W.storm - 0.24);
    const stormRate = Math.pow(stormEff, 1.3) / 6.5;
    F.next -= dtReal;
    if (F.next <= 0 && (stormRate > 0.002 || F.forceNear !== undefined)) {
      this.spawnStrike(camera, focus, W);
      F.next = stormRate > 0.002 ? -Math.log(1 - Math.random()) / stormRate + 1.2 : 1e9;
      F.forceNear = undefined;
    } else if (stormRate <= 0.002 && F.next > 30) F.next = 8;
    let flash = 0;
    F.pulses = F.pulses.filter((p) => this.realTime - p.t < p.d + 0.6);
    for (const p of F.pulses) {
      const k = this.realTime - p.t;
      if (k >= 0) flash = Math.max(flash, p.a * (k < 0.02 ? k / 0.02 : Math.exp(-(k - 0.02) / p.d)));
    }
    F.level = flash;
    this.bolt.set(F.boltUntil > this.realTime ? flash * F.boltK : 0);

    // ---- active light: the sun by day, the moon by night
    // Keep a minimum 13.5° elevation (y >= 0.235) for directional shadow projection so grazing
    // horizon angles never stretch shadow map texels into jagged rectangular blocks or cause acne.
    const sunVis = sunEl > -1.2;
    const useSun = pal.sunI > 0.02 || !moonUp;
    this.lightDir.copy(useSun ? sunV : moonV);
    if (this.lightDir.y < 0.235) this.lightDir.y = 0.235;
    this.lightDir.normalize();
    const veil = (1 - 0.32 * W.haze - 0.25 * W.fog) * (1 - 0.55 * dark);
    const moonCol = MOON_COL;
    let lightI, lightCol = tmp.a;
    if (useSun) {
      lightI = pal.sunI * veil;
      lightCol.copy(pal.sun);
      // Warm Rayleigh golden/crimson shift on world sunlight as the sun approaches the horizon
      const sunsetTintK = ss(18, -1, sunEl);
      if (sunsetTintK > 0.01) {
        lightCol.lerp(tmp.c.set('#ff6b2b'), sunsetTintK * 0.42);
      }
    } else {
      lightI = 0.95 * moonLight * night * veil;
      lightCol.copy(moonCol);
    }
    sun.color.copy(lightCol);
    sun.intensity = lightI;
    const shadowFade = ss(0.04, 0.35, lightI);
    sun.shadow.intensity = shadowFade * Math.max(0.12, 1 - 0.7 * Math.pow(cover, 1.6) - 0.45 * W.fog - 0.3 * W.haze);

    // Throttled shadow map update based on active optimization profile (or immediate when light moves significantly)
    if (this.qualityProfile.shadows && this.qualityProfile.shadowSkip > 0) {
      const lightMoved = this.lightDir.distanceToSquared(this._prevLightDir) > 0.000015;
      if (lightMoved || (this._frameCount % this.qualityProfile.shadowSkip) === 0) {
        this.renderer.shadowMap.needsUpdate = true;
        this._prevLightDir.copy(this.lightDir);
      }
    }

    // ---- ambient: greyer under cloud, brighter on moonlit nights, flashes
    tmp.grey.setScalar(lum(pal.hemiSky));
    hemi.color.copy(pal.hemiSky).lerp(tmp.grey.multiply(tmp.b.setRGB(0.94, 1.0, 1.04)), Math.min(0.78, cover * 0.62 + W.rain * 0.16));
    hemi.groundColor.copy(pal.hemiGnd).multiplyScalar(1 - 0.28 * cover * dayK);
    const fd = camera.position.distanceTo(focus);
    hemi.intensity = pal.hemiI * (1 + 0.32 * cover * dayK) * (1 - 0.48 * dark) + 0.16 * moonLight * night + flash * 2.4 * F.near;
    this.renderer.toneMappingExposure = 1.05 + 0.22 * night;

    // ---- sky & cloud colours (weather-adjusted, preserving rich orange sunset saturation in fair/partly-cloudy skies)
    const goldenPreserve = ss(24, 3, sunEl) * ss(-8, -1, sunEl);
    const stormOvercast = ss(0.58, 0.95, cover);
    const desatWeather = Math.min(1, stormOvercast * 0.55 + W.rain * 0.40 + W.fog * 0.48) * (1 - goldenPreserve * (1 - stormOvercast) * 0.75);

    const deck = tmp.b.copy(pal.cloudAmb).lerp(tmp.grey.setScalar(lum(pal.cloudAmb)), 0.45).multiplyScalar(1 - 0.52 * dark);
    U.uZen.value.copy(pal.zen).lerp(deck, ss(0.62, 1.0, cover) * 0.80);
    const fogC = fog.color.copy(pal.fog);
    tmp.grey.setScalar(lum(pal.fog));
    fogC.lerp(tmp.grey.multiply(tmp.c.setRGB(0.95, 0.99, 1.03)), desatWeather);
    fogC.multiplyScalar(1 - 0.64 * dark * (1 - W.fog * 0.5));
    // under a heavy storm deck the distance turns slate grey rather than glowing
    fogC.lerp(tmp.c.set('#556272').multiplyScalar(0.25 + 0.75 * dayK), ss(0.45, 1.0, dark) * 0.6 * (1 - W.fog * 0.5));
    if (W.fog > 0.01) fogC.lerp(tmp.c.copy(pal.hemiSky).multiplyScalar(0.92), W.fog * 0.35 * dayK);
    U.uHor.value.copy(pal.hor).lerp(fogC, Math.min(0.65, W.haze * 0.22 + stormOvercast * 0.42 + W.fog * 0.38));
    const twilightGlowK = ss(-9.5, 0.5, sunEl);
    const glowClearK = Math.max(0, 1 - Math.pow(cover, 1.65) * 0.75);
    U.uGlow.value.copy(U.uHor.value).lerp(pal.glow, twilightGlowK * glowClearK);
    U.uFogCol.value.copy(fogC);
    U.uBelt.value.set('#e07a96').multiplyScalar(0.30 * ss(-7.5, -1, sunEl) * (1 - ss(-1, 5.5, sunEl)) * (1 - stormOvercast));
    const sunUp = sunVis ? 1 : 0;
    U.uSunGlowCol.value.copy(pal.glow).lerp(pal.sun, 0.45).multiplyScalar(0.75 * sunUp * Math.pow(1 - cover * 0.78, 1.3) * (1 - W.fog * 0.6));
    U.uSunDisc.value.copy(pal.sun).multiplyScalar(2.6 * sunUp * (1 - W.haze * 0.35) * (1 - W.fog * 0.78));
    U.uSunDir.value.copy(sunV);
    U.uMoonDir.value.copy(moonV);
    U.uMoonPhaseAngle.value = (st.age / SYNODIC) * Math.PI * 2;
    U.uMoonCol.value.set('#f4f0e6').multiplyScalar((0.48 + 0.82 * night) * (1 - W.fog * 0.8) * ss(-2, 1, moonEl));
    U.uMoonGlow.value.set('#b8cff5').multiplyScalar((0.18 + 0.82 * st.illum) * night * (0.42 + 0.75 * W.haze) * moonUp);
    U.uStarVis.value = night * (1 - W.haze * 0.45) * (1 - W.fog * 0.88);
    U.uStarTime.value = this.realTime;
    const [ex, ey, ez] = st.starBasis;
    U.uStarBasis.value.set(ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2]);

    // Sculpted 3D cloud colors: strong sunlit/moonlit crowns vs deep shadowed undersides
    U.uCloudLit.value.copy(pal.cloudLit).multiplyScalar((0.20 + 0.92 * dayK) * (1 - 0.50 * dark) * (useSun ? 1 : 0.78))
      .add(tmp.c.copy(moonCol).multiplyScalar((0.28 + 0.56 * moonLight) * night));
    U.uCloudAmb.value.copy(pal.cloudAmb).multiplyScalar(0.84 * (1 - 0.48 * dark))
      .add(tmp.c.set('#1a2d52').multiplyScalar(0.26 * moonLight * night));
    U.uCloudDark.value.set('#30435f').multiplyScalar(0.14 + 0.86 * dayK).lerp(tmp.c.set('#050c1a'), night * 0.90).multiplyScalar(1 - 0.32 * W.storm);
    U.uDark.value = dark;
    U.uCirrus.value = W.cirrus * (1 - cover * 0.65) * 0.72;
    U.uScud.value = W.scud;
    U.uRain.value = W.rain;
    U.uRainCol.value.copy(U.uCloudDark.value).lerp(fogC, 0.45);
    U.uHaze.value = Math.min(1, W.haze * 0.55 + W.fog * 0.4);
    // Subtle cool coastal night airglow (never orange/red pollution that turns midnight sky red)
    U.uCityGlow.value.set('#0a1832').multiplyScalar(0.008 * night * (0.35 + 0.65 * cover));
    U.uFlash.value = flash;
    U.uFlashDir.value.copy(F.dir);

    // ---- clouds drift visibly across the sky with upper-troposphere wind
    const veer = Math.atan2(-0.36, 0.93) + 0.35 * Math.sin(this.weather.clock * 0.011);
    const goal = this.windDirOverride ?? veer;
    this.windAngle += Math.atan2(Math.sin(goal - this.windAngle), Math.cos(goal - this.windAngle)) * Math.min(1, dtReal * 1.5 + (dtReal === 0 ? 1 : 0));
    const wdx = Math.cos(this.windAngle), wdz = Math.sin(this.windAngle);
    const aloft = (5.5 + 10.5 * W.wind) * dtReal * (0.85 + Math.min(this.timeScale, 360) / 200);
    this.cloudOffset.x -= wdx * aloft; this.cloudOffset.y -= wdz * aloft;
    this.scudOffset.x -= wdx * aloft * 1.65; this.scudOffset.y -= wdz * aloft * 1.65;
    A.uCloudOffset.value.copy(this.cloudOffset);
    A.uScudOffset.value.copy(this.scudOffset);
    A.uCloudCover.value = cover;
    A.uCloudSoft.value = W.soft;
    A.uCloudShadowK.value = (useSun ? 0.84 : 0.7) * (1 - 0.3 * W.fog);
    A.uLightDirW.value.copy(this.lightDir);
    A.uAtmoTime.value = this.realTime;

    // ---- Optical Camera Lens Flare on direct sun line-of-sight contact
    if (this.lensFlare) {
      const lfU = this.lensFlare.uniforms;
      camera.getWorldDirection(this._camFwdTmp);
      const sunDotCam = this._camFwdTmp.dot(sunV);
      const sunAboveHor = ss(-0.5, 2.5, sunEl);
      const weatherClear = Math.max(0, 1 - Math.pow(cover, 1.15) * 0.94) * (1 - W.fog * 0.92) * (1 - W.rain * 0.88);

      if (sunAboveHor > 0.01 && sunDotCam > 0.28 && weatherClear > 0.02) {
        this._sunWorldTmp.copy(camera.position).addScaledVector(sunV, 1000);
        this._sunWorldTmp.project(camera);
        const sx = this._sunWorldTmp.x;
        const sy = this._sunWorldTmp.y;
        const inScreen = Math.abs(sx) < 1.08 && Math.abs(sy) < 1.08 && this._sunWorldTmp.z < 1.0;

        if (inScreen) {
          lfU.uSunScreen.value.set(sx, sy);
          lfU.uAspect.value = camera.aspect || 1.77;
          lfU.uTime.value = this.realTime;

          // Ultra-fast (<0.015ms) analytical + BVH line-of-sight check against buildings, metro, terrain, player, and trees
          if ((this._frameCount % 2) === 0 || dtReal === 0) {
            const blocked = this._isSunOccluded(camera.position, sunV, focus);
            this._flareOcclusionTarget = blocked ? 0.0 : 1.0;
          }

          const viewEdgeFade = ss(1.08, 0.62, Math.max(Math.abs(sx), Math.abs(sy))) * ss(0.28, 0.68, sunDotCam);
          const targetVis = this._flareOcclusionTarget * sunAboveHor * weatherClear * viewEdgeFade;
          const lerpRate = dtReal > 0 ? Math.min(1, dtReal * 14) : 1;
          this._flareVis += (targetVis - this._flareVis) * lerpRate;
        } else {
          this._flareVis *= Math.max(0, 1 - dtReal * 12);
        }
      } else {
        this._flareVis *= Math.max(0, 1 - dtReal * 12);
      }

      if (this._flareVis > 0.003) {
        const sunsetK = ss(24, 0, sunEl);
        lfU.uSunsetK.value = sunsetK;
        lfU.uFlareCol.value.set('#ffb85c').lerp(tmp.c.set('#ff6e1a'), ss(28, 5, sunEl)).lerp(tmp.b.set('#ff3800'), ss(7, -1, sunEl));
        lfU.uIntensity.value = this._flareVis * (0.46 + 0.14 * ss(18, 1, sunEl));
        this.lensFlare.mesh.visible = true;
      } else {
        lfU.uIntensity.value = 0;
        this.lensFlare.mesh.visible = false;
      }
    }

    // ---- fog & mist: visibility falls in rain/fog, while keeping a crisp 38m+ near-field so nearby trees & foliage stay vivid
    const v = Math.min(1, W.haze * 0.18 + W.rain * 0.42 + W.fog * 0.85);
    const nearW = 280 + (38 - 280) * Math.pow(v, 0.85), farW = 950 + (260 - 950) * Math.pow(v, 0.78);
    fog.near = Math.max(nearW, Math.min(fd * 0.65, 280));
    fog.far = Math.max(farW, Math.min(fd * 2.6, 950), fog.near + 95);
    const mistD = (W.mist * 0.032 + W.fog * 0.014) * (0.6 + 0.4 * (1 - dayK * 0.5));
    A.uMistDensity.value = mistD;
    A.uMistHeight.value = 3.5 + 6.5 * W.fog;
    this.scene.background = fogC;

    // ---- surfaces
    const wx = this.weather;
    A.uWet.value = Math.max(wx.wet, fl ? fl.surfaces : 0);
    A.uPuddle.value = Math.max(wx.puddle, fl ? fl.surfaces : 0);
    A.uRainNow.value = W.rain;
    A.uSkyZenW.value.copy(U.uZen.value);
    A.uSkyHorW.value.copy(U.uHor.value);
    const lamps = Math.max(1 - ss(-5, 3, sunEl), dark * 0.55 * dayK, W.fog * 0.35 * (1 - dayK * 0.5));
    A.uLampLevel.value = lamps;
    if (this.M.lampGlow) this.M.lampGlow.emissiveIntensity = this.base.lampGlow + 2.8 * lamps;
    if (this.M.signTea) this.M.signTea.emissiveIntensity = this.base.signTea + 0.9 * lamps;
    if (this.M.signMetro) this.M.signMetro.emissiveIntensity = this.base.signMetro + 0.9 * lamps;

    // ---- vegetation wind (smoothly bounded and phase-integrated so even storms feel natural)
    const wu = this.windUniforms;
    const rawW = Math.max(0, W.wind);
    const normW = rawW / (1.0 + rawW * 0.42); // lively in fair breezes, smoothly saturates in storms
    this.windTime = (this.windTime || 0) + dtReal * (1.05 + normW * 0.55);
    wu.uWindTime.value = this.windTime;
    wu.uWind.value = 0.35 + normW * 0.65;
    wu.uWindGust.value = Math.min(1.0, 0.35 + W.gust * 0.48);
    wu.uWindTurb.value = Math.min(0.95, 0.30 + W.gust * 0.42);
    if (wu.uWindSpeed) wu.uWindSpeed.value = 1.05 + normW * 0.55;
    wu.uWindDir.value.set(wdx, wdz);
    wu.uSunDir.value.copy(this.lightDir);
    wu.uSunColor.value.copy(lightCol).multiplyScalar(Math.min(1, lightI / 3.1));

    // ---- water: reflect this sky and this light
    const cu = this.coastUniforms;
    cu.uSunDirW.value.copy(this.lightDir);
    cu.uSunColW.value.copy(lightCol).multiplyScalar(Math.min(1.1, lightI / 3.1) * (1 - 0.8 * cover));
    cu.uSkyTop.value.copy(U.uZen.value).addScalar(flash * 0.4);
    cu.uSkyHorizon.value.copy(U.uHor.value);
    const amb = Math.min(1.15, Math.max(0.02, (hemi.intensity * lum(hemi.color) + lightI * 0.08) / (1.15 * 0.83 + 3.1 * 0.08)));
    const nightSeaScale = (0.018 + 0.038 * moonLight) * (1 - 0.45 * dark);
    const daySeaScale = amb * (1 - 0.42 * dark) * (1 - 0.30 * cover);
    const inscatterScale = dayK * daySeaScale + (1 - dayK) * nightSeaScale;
    const overcastDesat = Math.min(0.76, cover * 0.58 + W.rain * 0.25 + W.fog * 0.25);
    const foamLight = Math.min(0.92, dayK * amb * (1 - 0.48 * dark) + (1 - dayK) * (0.025 + 0.045 * moonLight) * (1 - 0.45 * dark));
    tmp.grey.setScalar(lum(this.base.inscatter));
    cu.uInscatter.value.copy(this.base.inscatter)
      .lerp(tmp.grey.multiply(tmp.b.setRGB(0.84, 0.95, 1.04)), overcastDesat)
      .multiplyScalar(Math.max(0.015, inscatterScale));
    this.water.mesh.material.uniforms.uFoamCol.value.copy(this.base.foamWater).lerp(fogC, 0.28).multiplyScalar(foamLight);
    if (this.base.foamGround) this.M.coastGround.userData.uniforms.uFoamCol.value.copy(this.base.foamGround).lerp(fogC, 0.28).multiplyScalar(foamLight);
    const wu2 = this.water.mesh.material.uniforms;
    let wNear = fog.near, wFar = fog.far;
    if (mistD > 0.0005) {   // fold the ground mist into the sea's linear fog
      const H = A.uMistHeight.value, hc = Math.max(camera.position.y, 0.01);
      const avg = (1 - Math.exp(-hc / H)) * H / hc;
      wFar = Math.min(wFar, Math.max(wNear + 25, 2.4 / (mistD * avg)));
      wNear = Math.min(wNear, wFar * 0.3);
    }
    wu2.uFogNear.value = wNear; wu2.uFogFar.value = wFar;

    // ---- rain + splashes (level-adaptive: drizzle -> light -> steady -> monsoon -> squall)
    const R = this.rain.uniforms;
    const rainOn = W.rain > 0.01;
    this.rain.mesh.visible = rainOn;
    // Day rain is softly sky-lit; night rain stays dark and moody in the open sky (streetlamps light nearby drops via vLamp)
    const rainLight = dayK * (0.62 - 0.24 * dark) + (1 - dayK) * (0.08 + 0.14 * moonLight);
    if (rainOn) {
      const fwd = tmp.fw || (tmp.fw = new THREE.Vector3());
      camera.getWorldDirection(fwd);
      const D = Math.min(44, Math.max(15, fd * 0.36));
      const S = Math.min(64, Math.max(38, D * 1.45));
      R.uCamPos.value.copy(camera.position);
      R.uFwd.value.copy(fwd);
      R.uCenter.value.copy(camera.position).addScaledVector(fwd, D);
      R.uSize.value.set(S, S * 0.68, S);
      R.uTime.value = this.realTime;
      R.uAmount.value = Math.min(1, W.rain);
      R.uGust.value = W.gust;
      const gust = 1 + 0.28 * Math.sin(this.realTime * 0.85) * W.gust;
      // Gentle slant in drizzle/light rain, stronger wind tilt in monsoon/squall
      const windTilt = (0.85 + 2.45 * W.wind * (0.55 + 0.45 * W.rain)) * gust;
      R.uWind.value.set(wdx, wdz).multiplyScalar(windTilt);
      R.uLen.value = 0.56 + 0.48 * Math.pow(W.rain, 0.75);
      R.uPx.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, this.renderer.domElement.height / this.renderer.getPixelRatio());

      // Translucent atmospheric water-drop palette: blends with sky/fog so drops never look like white chalk lines
      R.uColor.value.setRGB(0.68, 0.75, 0.82).lerp(hemi.color, 0.35).lerp(fogC, 0.25).multiplyScalar(rainLight + flash * 0.55);
      R.uTint.value.setRGB(0.48, 0.56, 0.65).lerp(fogC, 0.48).multiplyScalar(rainLight * 0.88 + flash * 0.35);
      const nightAlphaScale = 0.62 + 0.38 * dayK;
      R.uAlpha.value = (0.21 + 0.17 * Math.pow(W.rain, 0.70)) * nightAlphaScale;
    }
    const S2 = this.splash.uniforms;
    this.splash.mesh.visible = this.allowSplashes && rainOn && fd < 95;
    if (this.splash.mesh.visible) {
      S2.uTime.value = this.realTime;
      S2.uFocus.value.copy(focus);
      S2.uAmount.value = W.rain;
      S2.uColor.value.setRGB(0.68, 0.76, 0.84).lerp(hemi.color, 0.30).multiplyScalar(rainLight * 0.95 + 0.06);
    }
    // Spatial context for procedural ambient audio (shore surf, tree canopy rustle, birds, crickets)
    const wallD = Math.abs(this.D.coast ? this.D.coast.wallDist(focus.x, focus.z) : 18);
    const shoreProx = Math.max(0.15, Math.exp(-wallD / 28));
    const treeProx = focus.y < 6 ? 0.78 : 0.45;
    this.audio.update(W.rain, W.wind, {
      dt: dtReal,
      sunEl,
      shoreProx,
      treeProx,
      camY: camera.position.y,
    });

    // environment snapshot the scenarios use next frame
    env.ambient.copy(hemi.color).multiplyScalar(hemi.intensity * 0.85).add(tmp.c.copy(lightCol).multiplyScalar(lightI * 0.12));
    env.sunColor.copy(lightCol).multiplyScalar(Math.min(1, lightI / 3.1));
    env.flash = flash; env.rain = W.rain;
    env.windX = wdx * W.wind * 3; env.windZ = wdz * W.wind * 3;

    // ---- dev readout
    const hh = Math.floor(L.hours), mm = Math.floor((L.hours - hh) * 60);
    Object.assign(this.info, {
      time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      date: `${L.year}-${String(L.month).padStart(2, '0')}-${String(L.day).padStart(2, '0')}`,
      hours: L.hours, sunEl, moonEl, moonAge: st.age, illum: st.illum, phase: phaseName(st.age),
      weather: this.weather.describe(), state: this.weather.state, params: W, wet: A.uWet.value, puddle: A.uPuddle.value,
      flood: this.flood.running || this.flood.stats.max > 0.003
        ? `${this.flood.phase}${this.flood.paused ? ' (paused)' : ''} · road ${Math.round(this.flood.stats.mean * 100)} cm · max ${Math.round(this.flood.stats.max * 100)} cm` : null,
    });
  }

  spawnStrike(camera, focus) {
    const F = this.flash;
    const near = F.forceNear === true;
    const dist = near ? 420 + Math.random() * 380 : 450 + Math.pow(Math.random(), 0.75) * 5200;
    const az = (Math.random() < 0.6 ? Math.PI + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2);
    const dx = Math.cos(az), dz = Math.sin(az);
    const ground = new THREE.Vector3(focus.x + dx * dist, 0, focus.z + dz * dist);
    F.dir.set(ground.x - camera.position.x, 0, ground.z - camera.position.z).normalize();
    F.dir.y = 0.3; F.dir.normalize();
    F.dist = dist;
    F.near = Math.min(1, 1500 / (dist + 600));
    const strength = (0.55 + 0.45 * Math.random()) * Math.min(1, 2200 / (dist + 900));
    const n = 1 + Math.floor(Math.random() * 3.5);
    let t = this.realTime;
    for (let i = 0; i < n; i++) {
      F.pulses.push({ t, d: 0.06 + Math.random() * 0.12, a: strength * (i === 0 ? 1 : 0.5 + Math.random() * 0.5) });
      t += 0.06 + Math.random() * 0.22;
    }
    const cg = near || (dist < 3200 && Math.random() < 0.6);
    if (cg) {
      const top = ground.clone().add(new THREE.Vector3((Math.random() - 0.5) * 160, atmoUniforms.uCloudAlt.value - 30, (Math.random() - 0.5) * 160));
      this.bolt.strike(ground, top, camera.position);
      F.boltUntil = t + 0.2;
      F.boltK = Math.exp(-dist / 4000) * 1.4;
    }
    this.audio.thunder(dist);
  }
}

export { WEATHER };
