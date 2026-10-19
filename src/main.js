import './index.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batch } from './geom.js';
import { makeTextures, setMaxAnisotropy } from './textures.js';
import { makeMaterials } from './materials.js';
import { SPAWN, WALK, CAFE, SHOP } from './layout.js';
import { buildTerrain } from './world/terrain.js';
import { buildMetro, stationFootprint } from './world/metro.js';
import { buildBuildings } from './world/buildings.js';
import { buildProps } from './world/props.js';
import { buildNature } from './nature/index.js';
import { windUniforms } from './nature/materials.js';
import { buildWater } from './world/water.js';
import { Atmosphere, QUALITY_PROFILES } from './atmosphere/index.js';
import { initDevPanel } from './atmosphere/devPanel.js';
import { coastUniforms, patchUnderwater } from './world/coastShading.js';
import { makeBeachDetail } from './world/coastTextures.js';
import { buildTraffic } from './traffic.js';
import { TrafficLightSystem } from './world/trafficLights.js';
import { Player, buildWalkMesh } from './player.js';
import { EventBus } from './core/events/EventBus';
import { GlobalSettings } from './core/config/GlobalSettings';
import { InputService } from './input/InputService';
import { createAazhiLokamBridge } from './app/game/LokamGame';
import { mountLokamHUD } from './ui/mountLokamHUD';

// ---------------------------------------------------------------------------
// Viewport & hardware / Mobile Preview detection
// ---------------------------------------------------------------------------
function getViewport() {
  const w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 375);
  const h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 667);
  return [w, h];
}
function calcFov(aspect) {
  return aspect < 1 ? Math.min(55, 32 / Math.pow(Math.max(0.35, aspect), 0.56)) : 32;
}

const [initW, initH] = getViewport();
const isTouchDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && Math.min(initW, initH) < 900);
const mobile = isTouchDevice || initW <= 640;
document.body.classList.toggle('mobile-ui', mobile);

const urlQuality = new URLSearchParams(location.search).get('quality');
const initialQuality = (urlQuality && QUALITY_PROFILES[urlQuality])
  ? urlQuality
  : (mobile ? 'medium' : 'high');
const initProf = QUALITY_PROFILES[initialQuality];

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, initProf.dpr));
renderer.setSize(initW, initH);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = initProf.shadows;
renderer.shadowMap.type = initProf.shadowType;
renderer.shadowMap.autoUpdate = false;
renderer.domElement.className = 'w-full h-full block touch-none';
renderer.domElement.tabIndex = 0;
document.body.insertBefore(renderer.domElement, document.getElementById('root'));
setMaxAnisotropy(Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
const horizon = new THREE.Color('#f1d9b8');
scene.fog = new THREE.Fog(horizon, 280, 950);
scene.background = horizon;

const initAspect = initW / initH;
const camera = new THREE.PerspectiveCamera(calcFov(initAspect), initAspect, 0.3, 3500);

// key light: the atmosphere drives it as the sun by day and the moon by night
const sunDir = new THREE.Vector3(-0.78, 0.52, 0.36).normalize();
const sun = new THREE.DirectionalLight(0xffd6a4, 3.1);
sun.position.copy(sunDir).multiplyScalar(135);
sun.castShadow = initProf.shadows;
sun.shadow.mapSize.setScalar(initProf.shadowSize);
const sc = sun.shadow.camera;
sc.left = -35; sc.right = 35; sc.top = 35; sc.bottom = -35; sc.near = 25; sc.far = 250;
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.022;
sun.shadow.radius = 1.35;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x8a7656, 1.15);
scene.add(hemi);

// ---------------------------------------------------------------------------
// World build
// ---------------------------------------------------------------------------
const T = makeTextures();
const M = makeMaterials(T);
const maxAniso = Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
const ctx = { scene, T, M, batch: new Batch(), walk: [], colliders: [], data: {}, maxAniso };
ctx.data.stationFootprint = stationFootprint();
coastUniforms.uSunDirW.value.copy(sunDir);
coastUniforms.uSkyHorizon.value.copy(horizon);
for (const k of ['stone', 'woodDark', 'hullWhite', 'hullBlue', 'hullRed', 'buoy', 'concrete']) patchUnderwater(M[k], k);

buildTerrain(ctx);
const train = buildMetro(ctx);
buildBuildings(ctx);
const boats = buildProps(ctx);
const trafficLights = new TrafficLightSystem(ctx);
ctx.batch.build(scene);
const nature = buildNature(ctx, { maxAniso, mobile });
const beachW = 256;
const beachH = 128;
M.coastGround.userData.uniforms.uBeachTexel.value.set(1 / beachW, 1 / beachH);
M.coastGround.userData.uniforms.uBeachDetail.value = makeBeachDetail({
  rect: M.coastGround.userData.uniforms.uBeachRect.value.toArray(),
  height: ctx.data.coast.height,
  rocks: ctx.data.rocks,
  trees: nature.stats.beachTrees || [],
  W: beachW,
  Hh: beachH,
});
const water = buildWater(scene, ctx.data, ctx.coastT, scene.fog);
const traffic = buildTraffic(scene, ctx.data, T, trafficLights);

const walkMesh = buildWalkMesh(ctx.walk);
const player = new Player(scene, walkMesh, ctx.colliders);
player.spawn(SPAWN.x, SPAWN.z, SPAWN.heading);

// sky, day-night, weather, and optimization controller
const atmo = new Atmosphere({
  scene, renderer, camera, sun, hemi, fog: scene.fog, materials: M, data: ctx.data, walkMesh, water,
  nature, traffic, coastUniforms, windUniforms, puddleNoise: ctx.coastT.noiseTex, waterNormal: ctx.coastT.waterN,
  quality: initialQuality,
});

// Connect player stride footsteps to procedural surface-aware audio
let mode = 'explore';
let isFPV = false;
const controlsConfig = { sensitivity: 1.0, invertY: false };

player.onStep = (pos, running) => {
  if (mode !== 'explore') return;
  let surface = 'pavement';
  if (pos.y < 1.32) {
    surface = 'sand';
  } else if (ctx.data.pier && Math.abs(pos.y - ctx.data.pier.deckTop) < 0.12 && ctx.data.coast.wallDist(pos.x, pos.z) > 0) {
    surface = 'wood';
  } else if (pos.y > 1.92 && pos.y < 2.25) {
    surface = 'grass';
  }
  const wetness = Math.max(atmo.weather.wet, atmo.weather.puddle, atmo.flood?.running ? 0.85 : 0);
  atmo.audio.footstep(surface, running, wetness);
};

scene.updateMatrixWorld(true);
nature.lod.update(camera, initH, true, player.pos);
renderer.shadowMap.needsUpdate = true;

// ---------------------------------------------------------------------------
// Cameras: explore (third person / FPV photo mode) and overview (diorama orbit)
// ---------------------------------------------------------------------------
const OVERVIEW = { pos: new THREE.Vector3(-66, 112, 150), target: new THREE.Vector3(4, 0, 0) };
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.enablePan = true;
orbit.minDistance = 25;
orbit.maxDistance = 320;
orbit.maxPolarAngle = Math.PI * 0.46;
orbit.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
orbit.target.copy(OVERVIEW.target);
orbit.enabled = false;

const follow = { yaw: SPAWN.heading + Math.PI, pitch: 0.28, dist: 7.5 };
let blend = 1;
const blendFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const curLook = new THREE.Vector3().copy(player.pos).add(new THREE.Vector3(0, 1.5, 0));

// Position initial third-person camera behind player
{
  const cp = Math.cos(follow.pitch);
  camera.position.set(
    player.pos.x + Math.sin(follow.yaw) * cp * follow.dist,
    player.pos.y + 1.5 + Math.sin(follow.pitch) * follow.dist,
    player.pos.z + Math.cos(follow.yaw) * cp * follow.dist
  );
  camera.lookAt(curLook);
}

document.body.classList.add('explore-mode');

function setMode(m) {
  mode = m;
  blend = 0;
  blendFrom.pos.copy(camera.position);
  blendFrom.look.copy(curLook);
  orbit.enabled = m === 'overview';
  document.body.classList.toggle('explore-mode', m === 'explore');
  if (m === 'explore') {
    const d = new THREE.Vector3().subVectors(camera.position, player.pos);
    if (d.lengthSq() > 0.1) follow.yaw = Math.atan2(d.x, d.z);
    player.mesh.visible = !isFPV;
  } else {
    player.mesh.visible = true;
    orbit.target.copy(player.pos).setY(0);
  }
  window.__syncDevCamButtons?.(m);
}

function focusJunctionCam() {
  if (mode !== 'overview') setMode('overview');
  blend = 0;
  blendFrom.pos.copy(camera.position);
  blendFrom.look.copy(curLook);
  OVERVIEW.pos.set(17.5, 7.2, -7.2);
  OVERVIEW.target.set(8.85, 4.3, -13.2);
  orbit.target.set(8.85, 4.3, -13.2);
  orbit.update();
  window.__syncDevCamButtons?.('junction');
}

function setFPVMode(enabled) {
  isFPV = Boolean(enabled);
  if (isFPV && mode !== 'explore') {
    setMode('explore');
    blend = 1;
  }
  player.mesh.visible = !isFPV;
}

function getFPVMode() {
  return isFPV;
}

const cafeInteriorLight = new THREE.PointLight(0xffe4b5, 2.4, 16, 1.2);
cafeInteriorLight.position.set(CAFE.x, WALK + 3.4, CAFE.z);
scene.add(cafeInteriorLight);

const shopInteriorLight = new THREE.PointLight(0xffe4b5, 1.8, 10, 1.2);
shopInteriorLight.position.set(SHOP.x - 1.3, WALK + 2.4, SHOP.z);
scene.add(shopInteriorLight);

let activeVehicle = null;

function getIndoorZone(pos) {
  if (
    pos.x >= CAFE.x - CAFE.w / 2 &&
    pos.x <= CAFE.x + CAFE.w / 2 &&
    pos.z >= CAFE.z - CAFE.d / 2 &&
    pos.z <= CAFE.z + CAFE.d / 2
  ) {
    return {
      id: 'cafe',
      x0: CAFE.x - CAFE.w / 2 + 0.55,
      x1: CAFE.x + CAFE.w / 2 - 0.55,
      z0: CAFE.z - CAFE.d / 2 + 0.55,
      z1: CAFE.z + CAFE.d / 2 - 0.55,
      maxY: WALK + CAFE.h - 0.52,
      maxDist: 3.1,
    };
  }
  if (
    pos.x >= -36.4 &&
    pos.x <= -30.2 &&
    pos.z >= 14.4 &&
    pos.z <= 18.6
  ) {
    return {
      id: 'shop',
      x0: -35.95,
      x1: -30.65,
      z0: 14.85,
      z1: 18.15,
      maxY: WALK + 2.55,
      maxDist: 2.35,
    };
  }
  return null;
}

function enterTeaShop(promptId = 'cafe_enter') {
  if (mode !== 'explore') {
    setMode('explore');
  }
  if (activeVehicle) {
    activeVehicle = null;
  }
  player.standUp?.();
  player.mesh.visible = !isFPV;
  if (promptId === 'shop_enter') {
    const gy = player.groundAt(-32.8, 17.2, 10, 0, 20) ?? (WALK + 0.06);
    player.pos.set(-32.8, gy, 17.2);
    player.targetY = gy;
    player.heading = 2.35;
    player.sync();
    follow.yaw = -0.75;
    follow.pitch = 0.16;
    blend = 1;
  } else {
    const gy = player.groundAt(45.6, 4.8, 10, 0, 20) ?? (WALK + 0.06);
    player.pos.set(45.6, gy, 4.8);
    player.targetY = gy;
    player.heading = Math.PI / 2;
    player.sync();
    follow.yaw = -Math.PI / 2 + 0.12;
    follow.pitch = 0.16;
    blend = 1;
  }
}

function exitTeaShop(promptId = 'cafe_exit') {
  if (mode !== 'explore') {
    setMode('explore');
  }
  player.standUp?.();
  player.mesh.visible = !isFPV;
  if (promptId === 'shop_exit') {
    const gy = player.groundAt(-32.0, 20.2, 10, 0, 20) ?? WALK;
    player.pos.set(-32.0, gy, 20.2);
    player.targetY = gy;
    player.heading = 0;
    player.sync();
    follow.yaw = Math.PI;
    follow.pitch = 0.24;
    blend = 1;
  } else {
    const gy = player.groundAt(40.2, 3.0, 10, 0, 20) ?? WALK;
    player.pos.set(40.2, gy, 3.0);
    player.targetY = gy;
    player.heading = -Math.PI / 2;
    player.sync();
    follow.yaw = Math.PI / 2;
    follow.pitch = 0.24;
    blend = 1;
  }
}

function enterVehicle(veh) {
  if (!veh) return;
  if (mode !== 'explore') {
    setMode('explore');
  }
  player.standUp?.();
  activeVehicle = veh;
  player.mesh.visible = false;
  player.pos.set(veh.x, veh.group.position.y + 0.35, veh.z);
  player.heading = Math.atan2(veh.hx, veh.hz);
  follow.yaw = Math.atan2(-veh.hx, -veh.hz);
  follow.pitch = 0.22;
  blend = 1;
}

function exitVehicle() {
  if (!activeVehicle) return;
  const veh = activeVehicle;
  activeVehicle = null;
  player.mesh.visible = !isFPV;
  // Step out to the left side of the vehicle onto road/sidewalk
  const sideX = veh.hz * (veh.halfW + 0.95);
  const sideZ = -veh.hx * (veh.halfW + 0.95);
  const tx = veh.x + sideX;
  const tz = veh.z + sideZ;
  const gy = player.groundAt(tx, tz, 15, 0, 30);
  if (gy !== null && gy > 0.2) {
    player.pos.set(tx, gy, tz);
    player.targetY = gy;
    player.sync();
  } else {
    teleportPlayer(veh.x, veh.z);
  }
  blend = 1;
}

function toggleEnterExit() {
  if (activeVehicle) {
    exitVehicle();
    return;
  }
  const indoor = getIndoorZone(player.pos);
  if (indoor) {
    exitTeaShop(indoor.id === 'shop' ? 'shop_exit' : 'cafe_exit');
    return;
  }

  // Player is outside: check proximity to vehicles vs buildings
  let nearestVeh = null;
  let minVehDist = Infinity;
  if (traffic && traffic.vehicles) {
    for (const v of traffic.vehicles) {
      const d = Math.hypot(v.x - player.pos.x, v.z - player.pos.z);
      if (d < minVehDist) {
        minVehDist = d;
        nearestVeh = v;
      }
    }
  }

  const dCafe = Math.hypot(42.75 - player.pos.x, 3.0 - player.pos.z);
  const dShop = Math.hypot(-32.0 - player.pos.x, 18.65 - player.pos.z);
  const minBldgDist = Math.min(dCafe, dShop);
  const nearestBldgId = dShop < dCafe ? 'shop_enter' : 'cafe_enter';

  // If near a car/vehicle and closer to it than a building doorway, enter the vehicle
  if (nearestVeh && minVehDist <= 11.5 && minVehDist < minBldgDist) {
    enterVehicle(nearestVeh);
    return;
  }
  // Otherwise enter the Tea Shop building (or nearest vehicle if closer)
  if (minBldgDist <= 22.0 || !nearestVeh || minBldgDist <= minVehDist) {
    enterTeaShop(nearestBldgId);
  } else {
    enterVehicle(nearestVeh);
  }
}

function toggleSit() {
  if (activeVehicle) return;
  if (mode !== 'explore') {
    setMode('explore');
  }
  player.toggleSit(ctx.seats || []);
}

function getInteractionState() {
  const indoor = getIndoorZone(player.pos);
  return {
    isInside: Boolean(activeVehicle || indoor),
    inVehicle: Boolean(activeVehicle),
    inBuilding: Boolean(indoor),
    isSitting: Boolean(player.isSitting),
  };
}

function teleportPlayer(tx, tz) {
  if (activeVehicle) {
    activeVehicle = null;
  }
  player.standUp?.();
  player.mesh.visible = !isFPV;
  // Search outward in small concentric rings if the exact coordinate is blocked by a building collider
  for (let r = 0; r <= 18; r += 2) {
    const steps = r === 0 ? 1 : 12;
    for (let s = 0; s < steps; s++) {
      const ang = (s / steps) * Math.PI * 2;
      const cx = tx + Math.cos(ang) * r;
      const cz = tz + Math.sin(ang) * r;
      const [colX, colZ] = player.collide(cx, cz, 2.2);
      if (Math.hypot(colX - cx, colZ - cz) > 0.05) continue;
      const gy = player.groundAt(cx, cz, 25, 0, 50);
      if (gy !== null && gy > 0.2) {
        player.pos.set(cx, gy, cz);
        player.targetY = gy;
        player.sync();
        blend = 1;
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Input: Lokam InputService + Keyboard + Camera Look Drag
// ---------------------------------------------------------------------------
const eventBus = new EventBus();
const settings = new GlobalSettings();
const inputService = new InputService(eventBus);

addEventListener('keydown', (e) => {
  // Do not hijack keys when typing in chat or support feedback inputs
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (e.code === 'KeyC' && !e.repeat) setMode(mode === 'overview' ? 'explore' : 'overview');
  if (e.code === 'KeyT' && !e.repeat) focusJunctionCam();
  if (e.code === 'KeyE' && !e.repeat && mode === 'explore') {
    for (const p of trafficLights.poles) {
      if (p.pos.distanceTo(player.pos) < 5.0) {
        trafficLights.requestPedestrianWalk();
        atmo.audio?.footstep('wood', false, 0);
        break;
      }
    }
  }
});

// Camera look-around drag in explore mode (supports multi-touch simultaneous with VirtualJoystick)
let lookPointerId = null, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (lookPointerId !== null) return;
  lookPointerId = e.pointerId;
  lastX = e.clientX;
  lastY = e.clientY;
});
addEventListener('pointerup', (e) => { if (e.pointerId === lookPointerId) lookPointerId = null; });
addEventListener('pointercancel', (e) => { if (e.pointerId === lookPointerId) lookPointerId = null; });
addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookPointerId || mode !== 'explore') return;
  const sens = controlsConfig.sensitivity || 1.0;
  const inv = controlsConfig.invertY ? -1 : 1;
  follow.yaw -= (e.clientX - lastX) * 0.006 * sens;
  follow.pitch = Math.min(1.2, Math.max(-0.35, follow.pitch + (e.clientY - lastY) * 0.004 * sens * inv));
  lastX = e.clientX; lastY = e.clientY;
});
renderer.domElement.addEventListener('wheel', (e) => {
  if (mode !== 'explore' || isFPV) return;
  follow.dist = Math.min(22, Math.max(3, follow.dist * (1 + Math.sign(e.deltaY) * 0.1)));
}, { passive: true });

// URL hash presets for quick inspection: #top, #walk
function applyHash() {
  if (location.hash === '#top') {
    setMode('overview'); blend = 1;
    camera.position.set(0, 230, 0.01); orbit.target.set(0, 0, 0); orbit.update();
  } else if (location.hash.startsWith('#cam=')) {
    setMode('overview'); blend = 1;
    const v = location.hash.slice(5).split(',').map(Number);
    camera.position.set(v[0], v[1], v[2]); orbit.target.set(v[3], v[4], v[5]); orbit.update();
  } else if (location.hash === '#walk') {
    setMode('explore'); blend = 1;
  }
}
applyHash();

// ---------------------------------------------------------------------------
// Responsive resize handling
// ---------------------------------------------------------------------------
let lastW = initW, lastH = initH;
function syncViewportSize() {
  const [w, h] = getViewport();
  if (w === lastW && h === lastH) return;
  lastW = w;
  lastH = h;
  const nowMobile = isTouchDevice || w <= 640;
  if (nowMobile !== document.body.classList.contains('mobile-ui')) {
    document.body.classList.toggle('mobile-ui', nowMobile);
    if (!new URLSearchParams(location.search).get('quality')) {
      atmo.setQuality(nowMobile ? 'medium' : 'high');
    }
  }
  const aspect = w / h;
  camera.aspect = aspect;
  camera.fov = calcFov(aspect);
  camera.updateProjectionMatrix();
  const dpr = Math.min(window.devicePixelRatio || 1, atmo.qualityProfile.dpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  const curFocus = mode === 'explore' ? player.pos : orbit.target;
  nature.lod.update(camera, h, true, curFocus);
}
addEventListener('resize', syncViewportSize);
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => syncViewportSize());
  ro.observe(document.documentElement);
}

// ---------------------------------------------------------------------------
// Mount Lokam UI HUD + Dev Debug Panel
// ---------------------------------------------------------------------------
const aazhiApi = {
  scene,
  camera,
  player,
  ctx,
  get mode() { return mode; },
  setMode,
  focusJunctionCam,
  setFPVMode,
  getFPVMode,
  teleportPlayer,
  enterTeaShop,
  exitTeaShop,
  toggleEnterExit,
  toggleSit,
  getInteractionState,
  getIndoorZone,
  controlsConfig,
  nature,
  renderer,
  windUniforms,
  water,
  coastUniforms,
  orbit,
  follow,
  atmo,
  trafficLights,
};

const lokamGame = createAazhiLokamBridge(aazhiApi, inputService, eventBus, settings);
mountLokamHUD(lokamGame);
initDevPanel(atmo);

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const fpsEl = document.getElementById('fps');
let thDotEl = null, swTlTxtEl = null;
let lastTlStr = '', lastThCol = '';
let fpsAcc = 0, fpsN = 0;
const desired = new THREE.Vector3(), look = new THREE.Vector3();
const _overviewTmp = new THREE.Vector3();
const _lookOffset = new THREE.Vector3();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (atmo?.flood) {
    const samp = atmo.flood.sampleSmooth ? atmo.flood.sampleSmooth(player.pos.x, player.pos.z) : atmo.flood.sample(player.pos.x, player.pos.z);
    player.waterDepth = samp ? samp.d : 0;
    player.seaLevel = coastUniforms.uSeaLevel ? coastUniforms.uSeaLevel.value : 0;
  }

  trafficLights.update(dt);
  const tlInfo = trafficLights.getCurrentPhaseInfo();
  if (!swTlTxtEl) swTlTxtEl = document.getElementById('sw-tl-txt');
  if (swTlTxtEl) {
    const tlStr = `Ring [${tlInfo.ewState} ${tlInfo.ewRemaining}s] · Ave [${tlInfo.nsState} ${tlInfo.nsRemaining}s]`;
    if (tlStr !== lastTlStr) {
      swTlTxtEl.textContent = tlStr;
      lastTlStr = tlStr;
    }
  }
  if (!thDotEl) thDotEl = document.getElementById('th-dot');
  if (thDotEl) {
    const isEwGreen = tlInfo.ewState === 'GREEN';
    const isEwAmber = tlInfo.ewState === 'AMBER';
    const thCol = isEwGreen ? '#00e65c' : (isEwAmber ? '#ffaa00' : '#ff3322');
    if (thCol !== lastThCol) {
      thDotEl.style.background = thCol;
      lastThCol = thCol;
    }
  }

  // Read input from Lokam InputService (VirtualJoystick + WASD + Action Buttons)
  const rawInput = inputService.current;
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  const moveX = typing ? 0 : rawInput.movement.x;
  const moveY = typing ? 0 : rawInput.movement.y;

  // If user moves the joystick or presses movement keys while in Overview mode, smoothly enter Explore mode
  if (mode !== 'explore' && (Math.abs(moveX) > 0.15 || Math.abs(moveY) > 0.15 || (!typing && (rawInput.jump || rawInput.primaryAction)))) {
    setMode('explore');
  }

  train.update(dt);
  traffic.update(dt, (mode === 'explore' && !activeVehicle) ? player.pos : null);

  if (activeVehicle) {
    player.mesh.visible = false;
    player.pos.set(activeVehicle.x, activeVehicle.group.position.y + 0.35, activeVehicle.z);
    player.targetY = player.pos.y;
    player.heading = Math.atan2(activeVehicle.hx, activeVehicle.hz);
    player.sync();
  } else if (mode === 'explore') {
    player.update(dt, {
      moveX,
      moveY,
      sprint: !typing && rawInput.sprint,
      jump: !typing && rawInput.jump,
      primaryAction: !typing && rawInput.primaryAction,
    }, follow.yaw);
  } else {
    player.update(dt, {}, follow.yaw);
  }

  water.update(time);
  boats.update(dt, time, water.heightAt);

  if (mode === 'explore') {
    if (isFPV) {
      // First-Person View (Photo / Camera Mode) at character eye level
      const eyeY = player.pos.y + (player.jumpY || 0) + (player.isSitting ? 1.24 : 1.62);
      camera.position.set(player.pos.x, eyeY, player.pos.z);
      const cp = Math.cos(follow.pitch);
      const lookX = player.pos.x - Math.sin(follow.yaw) * cp * 20;
      const lookY = eyeY - Math.sin(follow.pitch) * 20;
      const lookZ = player.pos.z - Math.cos(follow.yaw) * cp * 20;
      curLook.set(lookX, lookY, lookZ);
      camera.lookAt(curLook);
    } else {
      look.copy(player.pos);
      look.y += 1.5 + (player.jumpY || 0) * 0.5;
      const cp = Math.cos(follow.pitch);
      const indoor = !activeVehicle ? getIndoorZone(player.pos) : null;
      const activeDist = indoor ? Math.min(follow.dist, indoor.maxDist) : (activeVehicle ? Math.max(follow.dist, 7.5) : follow.dist);
      desired.set(Math.sin(follow.yaw) * cp, Math.sin(follow.pitch), Math.cos(follow.yaw) * cp)
        .multiplyScalar(activeDist).add(look);
      if (indoor) {
        desired.x = Math.max(indoor.x0, Math.min(indoor.x1, desired.x));
        desired.z = Math.max(indoor.z0, Math.min(indoor.z1, desired.z));
        desired.y = Math.min(indoor.maxY, Math.max(WALK + 1.15, desired.y));
      }
      if (blend < 1) {
        blend = Math.min(1, blend + dt / 1.2);
        const k = blend * blend * (3 - 2 * blend);
        camera.position.lerpVectors(blendFrom.pos, desired, k);
        curLook.lerpVectors(blendFrom.look, look, k);
      } else {
        camera.position.copy(desired);
        curLook.copy(look);
      }
      camera.lookAt(curLook);
    }
  } else {
    if (blend < 1) {
      blend = Math.min(1, blend + dt / 1.2);
      const k = blend * blend * (3 - 2 * blend);
      _overviewTmp.copy(OVERVIEW.pos).add(orbit.target).sub(OVERVIEW.target);
      camera.position.lerpVectors(blendFrom.pos, _overviewTmp, k);
      curLook.lerpVectors(blendFrom.look, orbit.target, k);
      camera.lookAt(curLook);
      if (blend >= 1) orbit.update();
    } else {
      orbit.update();
      curLook.copy(orbit.target);
    }
  }

  const focus = mode === 'explore' ? player.pos : orbit.target;
  nature.update(camera, time, lastH, focus);
  atmo.update(dt, camera, focus);
  if (focus.distanceToSquared(lastShadowFocus) > 12) {
    renderer.shadowMap.needsUpdate = true;
  }
  if (renderer.shadowMap.needsUpdate) {
    updateShadowFrustum(focus);
  }

  renderer.render(scene, camera);

  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) {
    if (fpsEl) {
      fpsEl.textContent = `[${Math.round(fpsN / fpsAcc)} fps · ${atmo.qualityProfile.short} · ${renderer.info.render.calls} draws]`;
    }
    fpsAcc = 0; fpsN = 0;
  }
  requestAnimationFrame(tick);
}

const lastShadowFocus = new THREE.Vector3();
const _shLx = new THREE.Vector3();
const _shLy = new THREE.Vector3();
const _shLz = new THREE.Vector3();
const _shUp = new THREE.Vector3(0, 1, 0);
const _shCenter = new THREE.Vector3();

function updateShadowFrustum(focus) {
  lastShadowFocus.copy(focus);
  const camDist = camera.position.distanceTo(focus);
  const halfExt = mode === 'explore'
    ? Math.min(76, Math.max(34, Math.round(27 + camDist * 0.85)))
    : Math.min(92, Math.max(46, Math.round(camDist * 0.56)));

  if (sc.right !== halfExt) {
    sc.left = -halfExt;
    sc.right = halfExt;
    sc.top = halfExt;
    sc.bottom = -halfExt;
    sc.updateProjectionMatrix();
  }

  // Clamp focus within island bounds and snap to light-space texel grid to prevent shadow swimming
  const clampR = Math.max(0, 88 - halfExt * 0.55);
  _shCenter.set(
    Math.max(-clampR, Math.min(clampR, focus.x)),
    0,
    Math.max(-clampR, Math.min(clampR, focus.z))
  );

  _shLz.copy(atmo.lightDir).normalize();
  _shLx.crossVectors(_shUp, _shLz).normalize();
  _shLy.crossVectors(_shLz, _shLx).normalize();

  const mapSize = Math.max(512, sun.shadow.mapSize.x || 2048);
  const texelWorld = (halfExt * 2) / mapSize;
  const u = Math.round(_shCenter.dot(_shLx) / texelWorld) * texelWorld;
  const v = Math.round(_shCenter.dot(_shLy) / texelWorld) * texelWorld;
  const w = _shCenter.dot(_shLz);

  sun.target.position.set(0, 0, 0)
    .addScaledVector(_shLx, u)
    .addScaledVector(_shLy, v)
    .addScaledVector(_shLz, w);
  sun.position.copy(sun.target.position).addScaledVector(_shLz, 135);
  sun.target.updateMatrixWorld();
}

const view = (pos, tgt, hours) => {
  if (mode !== 'overview') setMode('overview');
  blend = 1; orbit.minDistance = 1; orbit.maxPolarAngle = Math.PI * 0.62;
  if (hours !== undefined) atmo.setHours(hours);
  camera.position.set(...pos); orbit.target.set(...tgt); orbit.update();
  atmo.update(0.016, camera, orbit.target);
  updateShadowFrustum(orbit.target);
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  return `${atmo.info.time} sun ${atmo.info.sunEl.toFixed(1)}° moon ${atmo.info.moonEl.toFixed(1)}° · ${atmo.info.weather}`;
};

aazhiApi.view = view;
window.__aazhi = aazhiApi;

const loading = document.getElementById('loading');
if (loading) {
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 600);
}
requestAnimationFrame(tick);
