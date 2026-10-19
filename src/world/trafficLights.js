import * as THREE from 'three';
import { boxGeo, pointInPolys } from '../geom.js';
import { G, WALK } from '../layout.js';
import { atmoUniforms } from '../atmosphere/atmoShared.js';

// ---------------------------------------------------------------------------
// Minimal Single-Pole Cantilever Traffic Signal with Direction Sign:
//  - Strictly ONE clean, minimal cantilever traffic signal pole placed on the
//    North-East sidewalk of the main Ring Road & Station Avenue junction.
//  - Unified satin galvanized-steel pole & tapered horizontal mast arm with a
//    low-profile circular bolted anchor flange (zero ugly gusset blocks, zero
//    wires, zero secondary post boxes, zero countdown timer boxes, zero yellow
//    backplate slabs).
//  - Features ONLY the sleek cantilever pole, the inline retroreflective Road
//    Direction Sign on the mast arm, and the minimal 3-aspect (R/Y/G) traffic
//    signal head at the outer end of the mast arm.
//  - Static geometry is batched into `ctx.batch` (0 extra static draw calls),
//    plus 1 draw call for the direction sign face, 1 draw call for the LED
//    signal face, and 1 draw call for the active lens glow.
// ---------------------------------------------------------------------------

export const PHASE_CONFIG = {
  EW_GREEN:  18.0, // Ring Road East-West green
  EW_AMBER:   3.5, // Ring Road amber warning
  CLEAR_1:    1.5, // All-red clearance interval
  NS_GREEN:  14.0, // Station Avenue / Crosswalk green
  NS_AMBER:   3.5, // Station Avenue amber warning
  CLEAR_2:    1.5, // All-red clearance interval
};

export const TOTAL_CYCLE =
  PHASE_CONFIG.EW_GREEN +
  PHASE_CONFIG.EW_AMBER +
  PHASE_CONFIG.CLEAR_1 +
  PHASE_CONFIG.NS_GREEN +
  PHASE_CONFIG.NS_AMBER +
  PHASE_CONFIG.CLEAR_2;

const _m4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

function composeMat(x, y, z, ry = 0, rx = 0, rz = 0) {
  _euler.set(rx, ry, rz, 'YXZ');
  _quat.setFromEuler(_euler);
  _pos.set(x, y, z);
  return _m4.compose(_pos, _quat, _scl).clone();
}

/** Minimum distance from (x, z) to any boundary segment of a polygon set. */
function minDistToPolyEdges(x, z, polys) {
  let minD = Infinity;
  for (const ring of polys) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
      const px = a[0] + dx * t;
      const pz = a[1] + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

/**
 * Ensures (x, z) sits cleanly on the pedestrian sidewalk outside `roadsClosed`
 * with at least `minClearance` metres from the asphalt edge.
 */
function ensureSidewalkClearance(x, z, pushDirX, pushDirZ, roadsClosed, minClearance = 1.15) {
  if (!roadsClosed || !roadsClosed.length) return [x, z];
  let cx = x;
  let cz = z;
  const len = Math.hypot(pushDirX, pushDirZ) || 1;
  const ux = pushDirX / len;
  const uz = pushDirZ / len;

  for (let step = 0; step < 24; step++) {
    const inRoad = pointInPolys(cx, cz, roadsClosed);
    const edgeDist = minDistToPolyEdges(cx, cz, roadsClosed);
    if (!inRoad && edgeDist >= minClearance) break;
    cx += ux * 0.25;
    cz += uz * 0.25;
  }
  return [cx, cz];
}

// High-resolution procedural canvas texture for the mast-arm Road Direction Sign
function makeDirectionSignMaterial(maxAniso = 8) {
  const w = 512;
  const h = 224;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  // Retroreflective traffic-sign blue background with subtle vertical sheen
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0f56b3');
  bg.addColorStop(0.5, '#0c4799');
  bg.addColorStop(1, '#09397d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Outer white retroreflective border with rounded corners
  const pad = 10;
  const r = 16;
  ctx.strokeStyle = '#f5f8fc';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(pad + r, pad);
  ctx.lineTo(w - pad - r, pad);
  ctx.quadraticCurveTo(w - pad, pad, w - pad, pad + r);
  ctx.lineTo(w - pad, h - pad - r);
  ctx.quadraticCurveTo(w - pad, h - pad, w - pad - r, h - pad);
  ctx.lineTo(pad + r, h - pad);
  ctx.quadraticCurveTo(pad, h - pad, pad, h - pad - r);
  ctx.lineTo(pad, pad + r);
  ctx.quadraticCurveTo(pad, pad, pad + r, pad);
  ctx.closePath();
  ctx.stroke();

  // Left-side upward/through & left-turn directional arrow graphic
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Vertical ahead arrow shaft + chevron head
  const ax = 86;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(ax, 174);
  ctx.lineTo(ax, 58);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(ax, 38);
  ctx.lineTo(ax - 24, 72);
  ctx.lineTo(ax + 24, 72);
  ctx.closePath();
  ctx.fill();

  // Branching left-turn arrow to Station Ave
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(ax, 128);
  ctx.quadraticCurveTo(ax, 102, ax - 26, 102);
  ctx.lineTo(ax - 44, 102);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(ax - 62, 102);
  ctx.lineTo(ax - 38, 84);
  ctx.lineTo(ax - 38, 120);
  ctx.closePath();
  ctx.fill();

  // Vertical divider line
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(142, 34, 3, h - 68);

  // Clean, minimal road direction typography + bottom horizontal direction arrow
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '700 44px "Segoe UI", Arial, sans-serif';
  ctx.fillText('RING ROAD', 168, 76);

  ctx.font = '600 27px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#dceaff';
  ctx.fillText('STATION AVE', 168, 124);

  // Clean horizontal direction arrow bar underneath text (matching reference sign layout)
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(172, 166);
  ctx.lineTo(426, 166);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(452, 166);
  ctx.lineTo(418, 149);
  ctx.lineTo(418, 183);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;

  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.32,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

// Push a world-space display quad into the merged display geometry arrays
function pushDisplayQuad(pool, parentMat, lx, ly, lz, w, h, approachId) {
  const hw = w * 0.5;
  const hh = h * 0.5;
  const corners = [
    [-hw, -hh, 0, 0, 0],
    [ hw, -hh, 0, 1, 0],
    [ hw,  hh, 0, 1, 1],
    [-hw,  hh, 0, 0, 1],
  ];
  const nWorld = new THREE.Vector3(0, 0, 1).transformDirection(parentMat).normalize();
  const pts = corners.map(([cx, cy, cz, u, v]) => {
    const p = new THREE.Vector3(lx + cx, ly + cy, lz + cz).applyMatrix4(parentMat);
    return { p, u, v };
  });

  const indices = [0, 1, 2, 0, 2, 3];
  for (const idx of indices) {
    const { p, u, v } = pts[idx];
    pool.pos.push(p.x, p.y, p.z);
    pool.nor.push(nWorld.x, nWorld.y, nWorld.z);
    pool.uv.push(u, v);
    pool.meta.push(0, approachId, 0, 0);
  }
}

// Push an additive corona quad into the merged glow pool
function pushGlowQuad(pool, parentMat, lx, ly, lz, w, h, approachId, aspectState, intensity, isGroundPool = 0) {
  const hw = w * 0.5;
  const hh = h * 0.5;
  const corners = isGroundPool
    ? [
        [-hw, 0,  hh, 0, 0],
        [ hw, 0,  hh, 1, 0],
        [ hw, 0, -hh, 1, 1],
        [-hw, 0, -hh, 0, 1],
      ]
    : [
        [-hw, -hh, 0, 0, 0],
        [ hw, -hh, 0, 1, 0],
        [ hw,  hh, 0, 1, 1],
        [-hw,  hh, 0, 0, 1],
      ];

  const pts = corners.map(([cx, cy, cz, u, v]) => {
    const p = new THREE.Vector3(lx + cx, ly + cy, lz + cz).applyMatrix4(parentMat);
    return { p, u, v };
  });

  const indices = [0, 1, 2, 0, 2, 3];
  for (const idx of indices) {
    const { p, u, v } = pts[idx];
    pool.pos.push(p.x, p.y, p.z);
    pool.uv.push(u, v);
    pool.meta.push(approachId, aspectState, intensity, isGroundPool);
  }
}

function buildDisplayMesh(pool, uniforms) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pool.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(pool.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(pool.uv, 2));
  geo.setAttribute('aMeta', new THREE.Float32BufferAttribute(pool.meta, 4));
  geo.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: /* glsl */`
      precision highp float;
      attribute vec4 aMeta;
      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWPos;

      void main() {
        vUv = uv;
        vMeta = aMeta;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uEwState;   // 0 = RED, 1 = AMBER, 2 = GREEN
      uniform float uNsState;   // 0 = RED, 1 = AMBER, 2 = GREEN
      uniform vec3 uFogCol;
      uniform float uFogNear;
      uniform float uFogFar;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWPos;

      void main() {
        float app = vMeta.y;
        float state = app < 0.5 ? uEwState : uNsState;

        // Clean matte dark signal face background
        vec3 col = vec3(0.06, 0.07, 0.08);

        // 3-Aspect Vehicle Signal Face (Red top, Amber mid, Green bot)
        vec2 p = vec2((vUv.x - 0.5) * 2.0, (vUv.y - 0.5) * 6.0);
        int lampIdx = -1;
        vec2 lp = vec2(0.0);
        if (p.y > 1.0) {
          lampIdx = 0; // Red (top)
          lp = vec2(p.x, p.y - 2.0);
        } else if (p.y > -1.0) {
          lampIdx = 1; // Amber (mid)
          lp = vec2(p.x, p.y);
        } else {
          lampIdx = 2; // Green (bot)
          lp = vec2(p.x, p.y + 2.0);
        }

        float r = length(lp);
        if (r < 0.80) {
          float bezel = smoothstep(0.80, 0.73, r);
          bool isLit = (lampIdx == 0 && state < 0.5) ||
                       (lampIdx == 1 && abs(state - 1.0) < 0.4) ||
                       (lampIdx == 2 && state > 1.5);

          vec3 lampCol = lampIdx == 0
            ? vec3(1.0, 0.14, 0.06)
            : (lampIdx == 1 ? vec3(1.0, 0.68, 0.04) : vec3(0.05, 0.96, 0.44));

          float fresnel = 0.86 + 0.14 * sin(r * 38.0);
          vec2 ledCell = fract(lp * 7.0) - 0.5;
          float ledBead = smoothstep(0.45, 0.14, length(ledCell));

          if (isLit) {
            float core = exp(-r * r * 2.0);
            vec3 litRgb = mix(lampCol, vec3(1.0, 0.98, 0.92), core * 0.52 + ledBead * 0.24);
            litRgb *= (1.32 + 0.40 * ledBead) * fresnel;
            col = mix(vec3(0.04, 0.05, 0.06), litRgb, bezel);
          } else {
            vec3 offRgb = vec3(0.045, 0.055, 0.065) + lampCol * (0.04 * fresnel + 0.02 * ledBead);
            col = mix(vec3(0.03, 0.04, 0.05), offRgb, bezel);
          }
        }

        float camDist = length(cameraPosition - vWPos);
        col = mix(col, uFogCol, smoothstep(uFogNear, uFogFar, camDist));

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function buildGlowMesh(pool, uniforms) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pool.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(pool.uv, 2));
  geo.setAttribute('aGlowMeta', new THREE.Float32BufferAttribute(pool.meta, 4));
  geo.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uWet: atmoUniforms.uWet,
      uLampLevel: atmoUniforms.uLampLevel,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      precision highp float;
      attribute vec4 aGlowMeta; // x: approachId, y: aspectState (0=R,1=A,2=G, -1=ground), z: intensity, w: isGroundPool
      uniform float uEwState;
      uniform float uNsState;

      varying vec2 vUv;
      varying vec3 vGlowCol;
      varying float vIntensity;

      vec3 stateToCol(float st) {
        if (st > 1.5) return vec3(0.05, 0.98, 0.42);
        if (st > 0.5) return vec3(1.0, 0.65, 0.04);
        return vec3(1.0, 0.15, 0.06);
      }

      void main() {
        float app = aGlowMeta.x;
        float targetState = aGlowMeta.y;
        float curState = app < 0.5 ? uEwState : uNsState;

        if (aGlowMeta.w < 0.5 && abs(curState - targetState) > 0.35) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vUv = vec2(0.0);
          vGlowCol = vec3(0.0);
          vIntensity = 0.0;
          return;
        }

        vUv = uv;
        vGlowCol = stateToCol(curState);
        vIntensity = aGlowMeta.z;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uWet;
      uniform float uLampLevel;
      varying vec2 vUv;
      varying vec3 vGlowCol;
      varying float vIntensity;

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0 || vIntensity <= 0.001) discard;

        float falloff = exp(-r2 * 3.4) * (1.0 - r2);
        float boost = 0.68 + 0.42 * uLampLevel + 0.25 * uWet;
        float alpha = clamp(falloff * vIntensity * boost, 0.0, 0.68);
        gl_FragColor = vec4(vGlowCol, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 5;
  return mesh;
}

export class TrafficLightSystem {
  constructor(ctx) {
    this.scene = ctx.scene;
    this.colliders = ctx.colliders;
    this.materials = ctx.M;
    this.batch = ctx.batch;
    this.data = ctx.data;
    this.maxAniso = ctx.maxAniso || 8;

    this.cycleTime = 0;
    this.cycleSpeed = 1.0;
    this.pedestrianRequested = false;

    this.uniforms = {
      uTime: { value: 0 },
      uEwState: { value: 2 },   // 2 = GREEN
      uEwRemain: { value: 18 },
      uNsState: { value: 0 },   // 0 = RED
      uNsRemain: { value: 23 },
      uFogCol: { value: this.scene.fog ? this.scene.fog.color.clone() : new THREE.Color(0xf1d9b8) },
      uFogNear: { value: this.scene.fog ? this.scene.fog.near : 280 },
      uFogFar: { value: this.scene.fog ? this.scene.fog.far : 950 },
    };

    this.poles = [];
    this.buildSingleValidationPole();
  }

  buildSingleValidationPole() {
    const M = this.materials;
    const D = this.data;
    const roadsClosed = D.roadsClosed || [];

    const displayPool = { pos: [], nor: [], uv: [], meta: [] };
    const glowPool = { pos: [], uv: [], meta: [] };

    const addPart = (geo, mat, lx, ly, lz, parentMat, noShadow = false) => {
      this.batch.add(geo, mat, lx, ly, lz, 0, { parent: parentMat, noShadow });
    };

    // Unified satin galvanized steel material for the entire pole & cantilever arm
    // (eliminates the ugly dark-grey / bright-silver patchwork of the previous pole)
    const poleSteel = M.steel;
    const housingDark = M.metalDark;
    const trimWhite = M.whitePaint;

    // =========================================================================
    // SINGLE VALIDATION POLE AT NORTH MAIN JUNCTION (Ring Road & Station Avenue)
    // Placed on the North-East pedestrian sidewalk at (x = 8.85, z = -15.25),
    // 1.25m clear of the Ring Road northern asphalt edge (z = -14.0).
    // =========================================================================
    const [sx, sz] = ensureSidewalkClearance(8.85, -15.25, 0.3, -1.0, roadsClosed, 1.15);
    const poleMat = composeMat(sx, WALK, sz, 0);

    this.colliders.push({ type: 'circle', x: sx, z: sz, r: 0.24 });
    this.poles.push({ pos: new THREE.Vector3(sx, WALK, sz) });
    if (D.lamps) D.lamps.push([sx, sz]);

    // 1. Minimal, Clean Circular Concrete Pad & Bolted Steel Base Flange (no ugly box gussets)
    const padGeo = new THREE.CylinderGeometry(0.21, 0.22, 0.045, 20);
    addPart(padGeo, M.concrete, 0, 0.0225, 0, poleMat);

    const flangeGeo = new THREE.CylinderGeometry(0.175, 0.18, 0.024, 20);
    addPart(flangeGeo, poleSteel, 0, 0.057, 0, poleMat);

    const boltGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.022, 6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      addPart(boltGeo, poleSteel, Math.cos(a) * 0.142, 0.074, Math.sin(a) * 0.142, poleMat);
    }

    const baseCollarGeo = new THREE.CylinderGeometry(0.104, 0.126, 0.14, 20);
    addPart(baseCollarGeo, poleSteel, 0, 0.135, 0, poleMat);

    // 2. Clean Tapered Cylindrical Galvanized Steel Vertical Mast (5.42m tall) + Flush Cap
    const mastH = 5.42;
    const mastShaftGeo = new THREE.CylinderGeometry(0.086, 0.104, mastH, 20);
    addPart(mastShaftGeo, poleSteel, 0, 0.06 + mastH * 0.5, 0, poleMat);

    const mastCapGeo = new THREE.CylinderGeometry(0.088, 0.090, 0.036, 20);
    addPart(mastCapGeo, poleSteel, 0, 0.06 + mastH + 0.018, 0, poleMat);

    // 3. Sleek Horizontal Cantilever Mast Arm at y = WALK + 5.10m extending South (+Z) over Ring Road
    //    Connected with a clean sleeve collar & compact flange ring matching the reference pole
    const armY = WALK + 5.10;
    const armLen = 3.85;
    const armMat = composeMat(sx, armY, sz, 0);

    const sleeveGeo = new THREE.CylinderGeometry(0.098, 0.100, 0.24, 20);
    addPart(sleeveGeo, poleSteel, 0, 0, 0, armMat);

    const jointFlangeGeo = new THREE.CylinderGeometry(0.096, 0.096, 0.024, 16);
    jointFlangeGeo.rotateX(Math.PI * 0.5);
    addPart(jointFlangeGeo, poleSteel, 0, 0, 0.108, armMat);

    // Subtle, clean trapezoidal bracket web between collar and arm root
    const bracketWebGeo = boxGeo(0.016, 0.18, 0.16, 1);
    addPart(bracketWebGeo, poleSteel, 0, 0, 0.16, armMat);

    // Tapered horizontal tubular cantilever arm
    const armTubeGeo = new THREE.CylinderGeometry(0.048, 0.064, armLen, 16);
    armTubeGeo.rotateX(Math.PI * 0.5);
    addPart(armTubeGeo, poleSteel, 0, 0, 0.11 + armLen * 0.5, armMat);

    const armTipCapGeo = new THREE.CylinderGeometry(0.049, 0.050, 0.028, 16);
    armTipCapGeo.rotateX(Math.PI * 0.5);
    addPart(armTipCapGeo, poleSteel, 0, 0, 0.11 + armLen + 0.014, armMat);

    // 4. Inline Road Direction Sign Board on the Cantilever Arm (z = 1.38m from pole)
    //    Matches the reference pole with the rectangular blue/white direction sign next to the mast
    const signDist = 1.38;
    const signW = 1.12;
    const signH = 0.46;
    const signClampGeo = new THREE.CylinderGeometry(0.066, 0.066, 0.045, 14);
    signClampGeo.rotateX(Math.PI * 0.5);
    addPart(signClampGeo, poleSteel, 0, 0, signDist - 0.36, armMat);
    addPart(signClampGeo, poleSteel, 0, 0, signDist + 0.36, armMat);

    const signMat = composeMat(sx + 0.072, armY, sz + signDist, Math.PI * 0.5);
    const signBackingGeo = boxGeo(signW + 0.024, signH + 0.024, 0.018, 1);
    addPart(signBackingGeo, poleSteel, 0, 0, 0, signMat);

    // Rear horizontal stiffening ribs clamping the sign cleanly to the mast arm
    const signChannelGeo = boxGeo(signW * 0.86, 0.032, 0.022, 1);
    addPart(signChannelGeo, poleSteel, 0,  0.11, -0.016, signMat);
    addPart(signChannelGeo, poleSteel, 0, -0.11, -0.016, signMat);

    // Direction sign front & rear face mesh (1 draw call)
    const signFaceMat = makeDirectionSignMaterial(this.maxAniso);
    const signFaceGeo = new THREE.PlaneGeometry(signW, signH);
    const signMesh = new THREE.Mesh(signFaceGeo, signFaceMat);
    signMesh.applyMatrix4(composeMat(sx + 0.084, armY, sz + signDist, Math.PI * 0.5));
    signMesh.castShadow = false;
    signMesh.receiveShadow = true;
    signMesh.matrixAutoUpdate = false;
    this.scene.add(signMesh);
    this.signMesh = signMesh;

    // 5. Minimal Inline 3-Aspect Traffic Signal Head at the outer section of the arm (z = 3.22m)
    //    Mounted cleanly inline on the horizontal arm (no hanging pipe, no yellow slab, no timer box)
    const headDist = 3.22;
    const armBandGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.055, 14);
    armBandGeo.rotateX(Math.PI * 0.5);
    addPart(armBandGeo, poleSteel, 0, 0, headDist, armMat);

    const mountBracketGeo = boxGeo(0.075, 0.14, 0.075, 1);
    addPart(mountBracketGeo, poleSteel, 0.055, 0, headDist, armMat);

    const headMat = composeMat(sx + 0.125, armY, sz + headDist, Math.PI * 0.5);

    // Sleek compact 3-aspect housing + thin white perimeter frame (matching reference)
    const vehBodyGeo = boxGeo(0.32, 0.94, 0.13, 1);
    const vehBackRimGeo = boxGeo(0.35, 0.97, 0.014, 1);
    const vehDividerGeo = boxGeo(0.33, 0.016, 0.14, 1);
    addPart(vehBackRimGeo, trimWhite, 0, 0, -0.058, headMat, true);
    addPart(vehBodyGeo, housingDark, 0, 0, 0, headMat);
    addPart(vehDividerGeo, housingDark, 0,  0.155, 0.004, headMat);
    addPart(vehDividerGeo, housingDark, 0, -0.155, 0.004, headMat);

    // Compact curved sun visors over each circular lens (Red=+0.30m, Amber=0.0m, Green=-0.30m)
    const visorGeo = new THREE.CylinderGeometry(0.118, 0.122, 0.12, 14, 1, true, -Math.PI * 0.65, Math.PI * 1.30);
    visorGeo.rotateX(Math.PI * 0.5);
    for (const ly of [0.30, 0.0, -0.30]) {
      addPart(visorGeo, housingDark, 0, ly, 0.065 + 0.055, headMat);
    }

    // 3-aspect Fresnel LED face quad + optical lens coronas
    pushDisplayQuad(displayPool, headMat, 0, 0, 0.069, 0.29, 0.90, 0);
    pushGlowQuad(glowPool, headMat, 0,  0.30, 0.11, 0.48, 0.48, 0, 0, 0.62, 0);
    pushGlowQuad(glowPool, headMat, 0,  0.00, 0.11, 0.48, 0.48, 0, 1, 0.62, 0);
    pushGlowQuad(glowPool, headMat, 0, -0.30, 0.11, 0.48, 0.48, 0, 2, 0.62, 0);

    // Subtle ground light bounce pool on the junction asphalt beneath the cantilever arm
    pushGlowQuad(glowPool, composeMat(sx, G + 0.02, -10.5, 0), 0, 0, 0, 10.0, 8.0, 0, -1, 0.20, 1);

    // Build the single-draw-call GPU meshes
    this.displayMesh = buildDisplayMesh(displayPool, this.uniforms);
    this.glowMesh = buildGlowMesh(glowPool, this.uniforms);
    this.scene.add(this.displayMesh, this.glowMesh);
  }

  requestPedestrianWalk() {
    this.pedestrianRequested = true;
    const info = this.getCurrentPhaseInfo();
    if (info.phase === 'EW_GREEN' && info.ewRemaining > 4) {
      this.cycleTime = PHASE_CONFIG.EW_GREEN - 3.5;
    } else if (info.phase === 'NS_GREEN' && info.nsRemaining > 4) {
      this.cycleTime = PHASE_CONFIG.EW_GREEN + PHASE_CONFIG.EW_AMBER + PHASE_CONFIG.CLEAR_1 + PHASE_CONFIG.NS_GREEN - 3.5;
    }
  }

  getCurrentPhaseInfo() {
    let t = this.cycleTime % TOTAL_CYCLE;
    if (t < 0) t += TOTAL_CYCLE;

    const C = PHASE_CONFIG;
    let phase = 'EW_GREEN';
    let phaseElapsed = 0;
    let phaseDuration = C.EW_GREEN;

    if (t < C.EW_GREEN) {
      phase = 'EW_GREEN';
      phaseElapsed = t;
      phaseDuration = C.EW_GREEN;
    } else if (t < C.EW_GREEN + C.EW_AMBER) {
      phase = 'EW_AMBER';
      phaseElapsed = t - C.EW_GREEN;
      phaseDuration = C.EW_AMBER;
    } else if (t < C.EW_GREEN + C.EW_AMBER + C.CLEAR_1) {
      phase = 'CLEAR_1';
      phaseElapsed = t - (C.EW_GREEN + C.EW_AMBER);
      phaseDuration = C.CLEAR_1;
    } else if (t < C.EW_GREEN + C.EW_AMBER + C.CLEAR_1 + C.NS_GREEN) {
      phase = 'NS_GREEN';
      phaseElapsed = t - (C.EW_GREEN + C.EW_AMBER + C.CLEAR_1);
      phaseDuration = C.NS_GREEN;
    } else if (t < C.EW_GREEN + C.EW_AMBER + C.CLEAR_1 + C.NS_GREEN + C.NS_AMBER) {
      phase = 'NS_AMBER';
      phaseElapsed = t - (C.EW_GREEN + C.EW_AMBER + C.CLEAR_1 + C.NS_GREEN);
      phaseDuration = C.NS_AMBER;
    } else {
      phase = 'CLEAR_2';
      phaseElapsed = t - (C.EW_GREEN + C.EW_AMBER + C.CLEAR_1 + C.NS_GREEN + C.NS_AMBER);
      phaseDuration = C.CLEAR_2;
    }

    let ewState = 'RED';
    let ewRemaining = 0;
    if (phase === 'EW_GREEN') {
      ewState = 'GREEN';
      ewRemaining = C.EW_GREEN - phaseElapsed;
    } else if (phase === 'EW_AMBER') {
      ewState = 'AMBER';
      ewRemaining = C.EW_AMBER - phaseElapsed;
    } else {
      ewState = 'RED';
      if (phase === 'CLEAR_1') {
        ewRemaining = (C.CLEAR_1 - phaseElapsed) + C.NS_GREEN + C.NS_AMBER + C.CLEAR_2;
      } else if (phase === 'NS_GREEN') {
        ewRemaining = (C.NS_GREEN - phaseElapsed) + C.NS_AMBER + C.CLEAR_2;
      } else if (phase === 'NS_AMBER') {
        ewRemaining = (C.NS_AMBER - phaseElapsed) + C.CLEAR_2;
      } else {
        ewRemaining = C.CLEAR_2 - phaseElapsed;
      }
    }

    let nsState = 'RED';
    let nsRemaining = 0;
    if (phase === 'NS_GREEN') {
      nsState = 'GREEN';
      nsRemaining = C.NS_GREEN - phaseElapsed;
    } else if (phase === 'NS_AMBER') {
      nsState = 'AMBER';
      nsRemaining = C.NS_AMBER - phaseElapsed;
    } else {
      nsState = 'RED';
      if (phase === 'EW_GREEN') {
        nsRemaining = (C.EW_GREEN - phaseElapsed) + C.EW_AMBER + C.CLEAR_1;
      } else if (phase === 'EW_AMBER') {
        nsRemaining = (C.EW_AMBER - phaseElapsed) + C.CLEAR_1;
      } else if (phase === 'CLEAR_1') {
        nsRemaining = C.CLEAR_1 - phaseElapsed;
      } else {
        nsRemaining = (C.CLEAR_2 - phaseElapsed) + C.EW_GREEN + C.EW_AMBER + C.CLEAR_1;
      }
    }

    return {
      phase,
      phaseElapsed,
      phaseDuration,
      ewState,
      ewRemaining: Math.max(1, Math.ceil(ewRemaining)),
      nsState,
      nsRemaining: Math.max(1, Math.ceil(nsRemaining)),
    };
  }

  update(dt) {
    this.cycleTime += dt * this.cycleSpeed;
    const info = this.getCurrentPhaseInfo();

    const U = this.uniforms;
    U.uTime.value = this.cycleTime;
    U.uEwState.value = info.ewState === 'GREEN' ? 2.0 : (info.ewState === 'AMBER' ? 1.0 : 0.0);
    U.uEwRemain.value = info.ewRemaining;
    U.uNsState.value = info.nsState === 'GREEN' ? 2.0 : (info.nsState === 'AMBER' ? 1.0 : 0.0);
    U.uNsRemain.value = info.nsRemaining;

    if (this.scene.fog) {
      U.uFogCol.value.copy(this.scene.fog.color);
      U.uFogNear.value = this.scene.fog.near;
      U.uFogFar.value = this.scene.fog.far;
    }
  }

  // ---------------------------------------------------------------------------
  // Vehicle Traffic Stopping Logic at the North Main Junction Stop Bars
  // ---------------------------------------------------------------------------
  shouldVehicleStop(roadName, vehX, vehZ, vehDir) {
    const info = this.getCurrentPhaseInfo();

    if (roadName === 'ring') {
      // North Main Junction ([5, -10.5])
      if (Math.abs(vehZ - (-10.5)) < 4.2) {
        const ewRedOrAmber = info.ewState === 'RED' || info.ewState === 'AMBER';
        if (ewRedOrAmber) {
          if (vehDir === 1 && vehX > 6.5 && vehX < 25.0) {
            const distToStop = vehX - 9.5;
            if (distToStop > -0.4 && distToStop < 16.0) return { stop: true, dist: distToStop };
          } else if (vehDir === -1 && vehX < 3.5 && vehX > -15.0) {
            const distToStop = 0.5 - vehX;
            if (distToStop > -0.4 && distToStop < 16.0) return { stop: true, dist: distToStop };
          }
        }
      }
    } else if (roadName === 'avenue') {
      // Northbound Avenue vehicles approaching the North Main Junction stop bar
      if (vehDir === -1 && Math.abs(vehX - 5.0) < 3.8 && vehZ > -2.5 && vehZ < 14.0) {
        const nsRedOrAmber = info.nsState === 'RED' || info.nsState === 'AMBER';
        if (nsRedOrAmber) {
          const distToStop = vehZ - (-1.2);
          if (distToStop > -0.4 && distToStop < 15.0) return { stop: true, dist: distToStop };
        }
      }
    }

    return { stop: false, dist: Infinity };
  }
}
