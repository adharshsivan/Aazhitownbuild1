import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const STEP_UP = 0.6;     // max climb per move (curbs, stairs, planters)
const STEP_DOWN = 0.65;  // max drop: prevents walking off seawalls, platforms, piers
const RADIUS = 0.3;

/** Merge walkable geometries (positions only) into one BVH-accelerated mesh. */
export function buildWalkMesh(geos) {
  let total = 0;
  const parts = geos.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    total += ng.attributes.position.array.length;
    return ng.attributes.position.array;
  });
  const arr = new Float32Array(total);
  let o = 0;
  for (const a of parts) { arr.set(a, o); o += a.length; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.computeBoundsTree();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  return mesh;
}

function makeCharacter() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x2f7d6d, roughness: 0.8 });
  const mundu = new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1b1612, roughness: 0.9 });
  const mk = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const torso = mk(new THREE.CapsuleGeometry(0.2, 0.45, 4, 8), shirt, 0, 1.22, 0);
  torso.scale.set(1.05, 1, 0.75);
  mk(new THREE.SphereGeometry(0.13, 12, 10), skin, 0, 1.68, 0);
  mk(new THREE.SphereGeometry(0.135, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 1.7, -0.01);
  const legs = [], knees = [], arms = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.9, 0); g.add(hip);
    // Upper leg (thigh)
    mk(new THREE.CylinderGeometry(0.085, 0.078, 0.44, 8), mundu, 0, -0.21, 0, hip);
    // Knee joint
    const knee = new THREE.Group(); knee.position.set(0, -0.42, 0); hip.add(knee);
    // Lower leg (calf/shin) + shoe
    mk(new THREE.CylinderGeometry(0.076, 0.068, 0.44, 8), mundu, 0, -0.22, 0, knee);
    mk(new THREE.BoxGeometry(0.12, 0.06, 0.24), hair, 0, -0.45, 0.04, knee);
    legs.push(hip);
    knees.push(knee);
    const sh = new THREE.Group(); sh.position.set(s * 0.27, 1.45, 0); g.add(sh);
    mk(new THREE.CylinderGeometry(0.05, 0.045, 0.62, 8), skin, 0, -0.31, 0, sh);
    arms.push(sh);
  }
  return { group: g, legs, knees, arms, torso };
}

function makePortableChair() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9b6b43, roughness: 0.75 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.8 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x262b30, roughness: 0.6, metalness: 0.3 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  // Seat cushion slab at y = 0.42 (top at 0.45)
  add(new THREE.BoxGeometry(0.46, 0.06, 0.46), wood, 0, 0.42, 0.08);
  // Backrest behind player's back (local -Z is behind player)
  add(new THREE.BoxGeometry(0.46, 0.46, 0.05), woodDark, 0, 0.68, -0.13);
  // 4 legs
  for (const lx of [-0.19, 0.19]) {
    for (const lz of [-0.11, 0.25]) {
      add(new THREE.BoxGeometry(0.045, 0.40, 0.045), legMat, lx, 0.20, lz);
    }
  }
  g.visible = false;
  return g;
}

const MAX_STEPS = 48;

function buildFootstepDecals(scene) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0.0, -0.5,
     0.5, 0.0, -0.5,
     0.5, 0.0,  0.5,
    -0.5, 0.0,  0.5,
  ], 3));
  geo.setIndex([0, 2, 1, 0, 3, 2]);

  const stepPos = new Float32Array(MAX_STEPS * 4);   // x, y, z, heading
  const stepNorm = new Float32Array(MAX_STEPS * 3);  // nx, ny, nz
  const stepMeta = new Float32Array(MAX_STEPS * 4);  // birthTime, sideSign (-1/+1), maxLife, strength
  for (let i = 0; i < MAX_STEPS; i++) {
    stepPos[i * 4 + 1] = -100;
    stepNorm[i * 3 + 1] = 1;
  }

  const aStepPos = new THREE.InstancedBufferAttribute(stepPos, 4);
  const aStepNorm = new THREE.InstancedBufferAttribute(stepNorm, 3);
  const aStepMeta = new THREE.InstancedBufferAttribute(stepMeta, 4);
  aStepPos.setUsage(THREE.DynamicDrawUsage);
  aStepNorm.setUsage(THREE.DynamicDrawUsage);
  aStepMeta.setUsage(THREE.DynamicDrawUsage);

  geo.setAttribute('aStepPos', aStepPos);
  geo.setAttribute('aStepNorm', aStepNorm);
  geo.setAttribute('aStepMeta', aStepMeta);
  geo.instanceCount = MAX_STEPS;

  const uniforms = {
    uTime: { value: 0 },
    uSeaLevel: { value: 0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    vertexShader: /* glsl */`
      attribute vec4 aStepPos;
      attribute vec3 aStepNorm;
      attribute vec4 aStepMeta;
      uniform float uTime;
      uniform float uSeaLevel;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vSide;

      void main() {
        float birth = aStepMeta.x;
        float side = aStepMeta.y;
        float maxLife = aStepMeta.z;
        float strength = aStepMeta.w;
        float age = max(0.0, uTime - birth);

        // Wash away sand footprints when rising sea level submerges them
        float washOut = 1.0 - smoothstep(-0.15, 0.12, uSeaLevel - aStepPos.y);

        if (strength <= 0.001 || washOut <= 0.001 || aStepPos.y < -50.0 || age >= maxLife) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

        float lifeLeft = clamp(1.0 - age / maxLife, 0.0, 1.0);
        float fade = smoothstep(0.0, 0.25, lifeLeft) * washOut;
        // Subtle gamey pop-in and gentle shrink as old footsteps fade away
        float popIn = smoothstep(0.0, 0.08, age);
        float scaleAnim = (0.86 + 0.14 * smoothstep(0.0, 0.22, lifeLeft)) * (0.92 + 0.08 * popIn);

        vec3 N = normalize(aStepNorm);
        float hd = aStepPos.w;
        vec3 fwd0 = vec3(sin(hd), 0.0, cos(hd));
        vec3 fwd = normalize(fwd0 - N * dot(fwd0, N));
        vec3 right = normalize(cross(N, fwd));

        float w = 0.145 * scaleAnim;
        float l = 0.265 * scaleAnim;
        vec3 wp = aStepPos.xyz + right * (position.x * w) + fwd * (position.z * l) + N * 0.007;

        float camDist = length(cameraPosition - wp);
        float distFade = 1.0 - smoothstep(26.0, 52.0, camDist);

        vUv = vec2(position.x * 2.0, position.z * 2.0); // [-1, 1]^2
        vSide = side;
        vAlpha = strength * fade * distFade;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying float vAlpha;
      varying float vSide;

      void main() {
        // u: +1 on inner (medial) arch side, -1 on outer side; v: -1 at heel .. +1 at toe
        float u = vUv.x * vSide;
        float v = vUv.y;

        // 1. Simplified, iconic 2-part game shoe print:
        //    Part A: Rounded forefoot pad (v in [-0.02, +0.78])
        float tF = clamp((v + 0.02) / 0.80, 0.0, 1.0);
        float uForeCenter = -0.045 * (1.0 - smoothstep(0.0, 0.48, tF));
        float wFore = 0.47 + 0.09 * sin(tF * 3.14159265);
        float vc = clamp(v, 0.06, 0.52);
        float dForeCore = length(vec2((u - uForeCenter) / wFore, (v - vc) / 0.28)) - 1.0;
        float dForeBack = (-0.02 + 0.035 * u) - v;
        float dFore = max(dForeCore, dForeBack * 2.4);

        //    Part B: Clean D-shaped rear heel block (v in [-0.78, -0.20])
        float vh = clamp(v, -0.56, -0.26);
        float dHeelCore = length(vec2((u + 0.015) / 0.43, (v - vh) / 0.23)) - 1.0;
        float dHeelFront = v - (-0.20 + 0.025 * u);
        float dHeel = max(dHeelCore, dHeelFront * 2.6);

        float dShoe = min(dFore, dHeel);
        float mask = 1.0 - smoothstep(-0.07, 0.09, dShoe);
        if (mask < 0.01) discard;

        // Soft inner-edge shadow bevel for a crisp, readable gamey pressed-sand look (zero raised grey rims!)
        float innerBevel = smoothstep(-0.42, -0.02, dShoe);
        float a = mask * (0.70 + 0.30 * innerBevel) * vAlpha;
        if (a < 0.004) discard;

        vec3 col = vec3(0.09, 0.07, 0.05);
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.32));
      }`,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);

  return { mesh, uniforms, stepPos, stepNorm, stepMeta, aStepPos, aStepNorm, aStepMeta, cursor: 0 };
}

export class Player {
  constructor(scene, walkMesh, colliders) {
    this.walkMesh = walkMesh;
    this.colliders = colliders;
    this.ray = new THREE.Raycaster();
    this.ray.firstHitOnly = true;
    const c = makeCharacter();
    this.mesh = c.group; this.legs = c.legs; this.knees = c.knees; this.arms = c.arms; this.torso = c.torso;
    scene.add(this.mesh);
    this.portableChair = makePortableChair();
    scene.add(this.portableChair);
    this.footsteps = buildFootstepDecals(scene);
    this.elapsed = 0;
    this.wetShoes = 0;
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.phase = 0;
    this.speed = 0;
    this.jumpY = 0;
    this.jumpVel = 0;
    this.punchTimer = 0;
    this.activeEmote = null;
    this.emoteTimer = 0;
    this.rideBoostTimer = 0;
    this.isSitting = false;
  }

  getPosition() {
    return this.pos;
  }

  getHeading() {
    return this.heading;
  }

  sitOnChair(seats = []) {
    this.activeEmote = null;
    this.speed = 0;
    this.jumpY = 0;
    this.jumpVel = 0;

    // Find the nearest chair in the room/area
    let bestSeat = null;
    let bestDist = 14.0;
    for (const s of seats) {
      const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
      if (d < bestDist) {
        bestDist = d;
        bestSeat = s;
      }
    }

    if (bestSeat) {
      const gy = this.groundAt(bestSeat.x, bestSeat.z, this.pos.y + 1.5) ?? bestSeat.y;
      this.pos.set(bestSeat.x, gy, bestSeat.z);
      this.targetY = gy;
      this.heading = bestSeat.heading;
      this.portableChair.visible = false;
    } else {
      // Place portable 3D wooden chair right beneath the player so they can sit anywhere cleanly
      this.portableChair.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.portableChair.rotation.y = this.heading;
      this.portableChair.visible = true;
    }

    this.isSitting = true;
    this.sync();
  }

  standUp() {
    if (!this.isSitting) return;
    this.isSitting = false;
    this.portableChair.visible = false;
    this.legs[0].rotation.set(0, 0, 0);
    this.legs[1].rotation.set(0, 0, 0);
    this.knees[0].rotation.set(0, 0, 0);
    this.knees[1].rotation.set(0, 0, 0);
    // Step forward cleanly so the standing character does not clip through the chair seat
    const stepFwd = 0.42;
    const nx = this.pos.x + Math.sin(this.heading) * stepFwd;
    const nz = this.pos.z + Math.cos(this.heading) * stepFwd;
    this.tryMove(nx, nz);
    this.sync();
  }

  toggleSit(seats = []) {
    if (this.isSitting) {
      this.standUp();
    } else {
      this.sitOnChair(seats);
    }
  }

  triggerPunch() {
    if (this.punchTimer <= 0.05) {
      this.punchTimer = 0.36;
    }
  }

  triggerJump() {
    if (this.isSitting) {
      this.standUp();
    }
    if (this.jumpY <= 0.02) {
      this.jumpVel = 5.6;
      this.activeEmote = null;
    }
  }

  playEmote(emoteId) {
    if (this.isSitting) this.standUp();
    this.activeEmote = emoteId;
    this.emoteTimer = 5.0;
  }

  triggerRideBoost() {
    this.rideBoostTimer = 8.0;
  }

  groundAt(x, z, fromY, up = STEP_UP, down = STEP_DOWN) {
    this.ray.set(new THREE.Vector3(x, fromY + up, z), new THREE.Vector3(0, -1, 0));
    this.ray.far = up + down;
    const hit = this.ray.intersectObject(this.walkMesh, false)[0];
    if (!hit) return null;
    const seaY = this.seaLevel || 0;
    // Block walking into deep water, unless moving uphill toward higher ground
    if (hit.point.y < seaY - 0.95 && hit.point.y <= fromY + 0.002) return null;
    return hit.point.y;
  }

  stampFootstep(fx, fz, heading, isLeft, { fromY = 10, maxLife = 15.0, strength = 0.25 } = {}) {
    this.ray.set(new THREE.Vector3(fx, fromY + 1.5, fz), new THREE.Vector3(0, -1, 0));
    this.ray.far = 6.0;
    const hit = this.ray.intersectObject(this.walkMesh, false)[0];
    if (!hit || hit.point.y < -0.15) return;

    const F = this.footsteps;
    const idx = F.cursor;
    F.cursor = (F.cursor + 1) % MAX_STEPS;

    const i4 = idx * 4, i3 = idx * 3;
    F.stepPos[i4] = fx;
    F.stepPos[i4 + 1] = hit.point.y;
    F.stepPos[i4 + 2] = fz;
    F.stepPos[i4 + 3] = heading;

    let nx = 0, ny = 1, nz = 0;
    if (hit.face && hit.face.normal) {
      nx = hit.face.normal.x;
      ny = hit.face.normal.y;
      nz = hit.face.normal.z;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    }
    F.stepNorm[i3] = nx;
    F.stepNorm[i3 + 1] = ny;
    F.stepNorm[i3 + 2] = nz;

    // Steps near the active shoreline wash out faster
    const life = hit.point.y < 0.22 ? Math.min(maxLife, 5.5) : maxLife;
    F.stepMeta[i4] = this.elapsed;
    F.stepMeta[i4 + 1] = isLeft ? -1.0 : 1.0;
    F.stepMeta[i4 + 2] = life;
    F.stepMeta[i4 + 3] = strength;

    F.aStepPos.needsUpdate = true;
    F.aStepNorm.needsUpdate = true;
    F.aStepMeta.needsUpdate = true;
  }

  seedBeachSteps() {
    // One neat, subtle 8-step gamey trail on the sand toward the beach umbrella
    const ax = -9.4, az = 47.4, bx = -7.0, bz = 51.8;
    const hd = Math.atan2(bx - ax, bz - az);
    const ch = Math.cos(hd), sh = Math.sin(hd);
    const n = 8;
    for (let s = 0; s < n; s++) {
      const t = s / (n - 1);
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const isLeft = (s & 1) === 0;
      const side = isLeft ? 1 : -1;
      const fx = px + ch * 0.105 * side;
      const fz = pz - sh * 0.105 * side;
      this.stampFootstep(fx, fz, hd - side * 0.04, isLeft, { fromY: 4, maxLife: 99999, strength: 0.22 });
    }
  }

  spawn(x, z, heading) {
    const y = this.groundAt(x, z, 50, 0, 100);
    this.pos.set(x, y ?? 2, z);
    this.heading = heading;
    this.seedBeachSteps();
    this.sync();
  }

  collide(x, z, y) {
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        if (c.y0 !== undefined && y < c.y0) continue;
        if (c.y1 !== undefined && y > c.y1) continue;
        if (c.type === 'circle') {
          const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + RADIUS;
          if (d < m && d > 1e-6) { x = c.x + dx / d * m; z = c.z + dz / d * m; }
        } else {
          const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
          // world -> local (local x -> (cos, -sin), local z -> (sin, cos))
          const dx = x - c.x, dz = z - c.z;
          let lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
          const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
          let ex = lx - qx, ez = lz - qz;
          const d = Math.hypot(ex, ez);
          if (d < RADIUS) {
            if (d > 1e-6) { lx = qx + ex / d * RADIUS; lz = qz + ez / d * RADIUS; }
            else {
              // inside the box: push out along the shallowest axis
              const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
              if (px < pz) lx = Math.sign(lx || 1) * (c.hw + RADIUS); else lz = Math.sign(lz || 1) * (c.hd + RADIUS);
            }
            x = c.x + lx * cs + lz * sn; z = c.z - lx * sn + lz * cs;
          }
        }
      }
    }
    return [x, z];
  }

  tryMove(nx, nz) {
    const [cx, cz] = this.collide(nx, nz, this.pos.y);
    const y = this.groundAt(cx, cz, this.pos.y);
    if (y === null) return false;
    this.pos.x = cx; this.pos.z = cz; this.targetY = y;
    return true;
  }

  update(dt, input, camYaw) {
    this.elapsed += dt;
    this.footsteps.uniforms.uTime.value = this.elapsed;
    this.footsteps.uniforms.uSeaLevel.value = this.seaLevel || 0;

    if (this.rideBoostTimer > 0) this.rideBoostTimer = Math.max(0, this.rideBoostTimer - dt);

    if (input.jump) this.triggerJump();
    if (input.primaryAction) this.triggerPunch();

    let mx = 0, mz = 0;
    if (typeof input.moveX === 'number' && typeof input.moveY === 'number' && (Math.abs(input.moveX) > 0.05 || Math.abs(input.moveY) > 0.05)) {
      mx = input.moveX;
      mz = -input.moveY;
    } else {
      if (input.forward) mz -= 1;
      if (input.back) mz += 1;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
    }

    const moveMag = Math.min(1, Math.hypot(mx, mz));
    const moving = moveMag > 0.05;

    // Stand up cleanly before moving so the character never slides around in a sitting pose
    if (moving && this.isSitting) {
      this.standUp();
    }

    const run = Boolean(input.run || input.sprint || moveMag > 0.82 || this.rideBoostTimer > 0);
    const waterD = this.waterDepth || 0;
    // Water wading drag: knee-to-waist deep water reduces forward speed realistically
    const wadeDrag = waterD > 0.15 ? Math.max(0.38, 1.0 - (waterD - 0.15) * 0.82) : 1.0;
    const boostMult = this.rideBoostTimer > 0 ? 1.35 : 1.0;
    const maxSpd = (run ? 6.2 : 3.2) * wadeDrag * boostMult;
    const target = moving ? maxSpd * Math.max(0.35, moveMag) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);

    if (moving) {
      this.activeEmote = null;
      const l = Math.hypot(mx, mz); mx /= l; mz /= l;
      // camera-relative: forward = away from camera
      const sx = Math.sin(camYaw), cx = Math.cos(camYaw);
      const wx = mx * cx + mz * sx, wz = -mx * sx + mz * cx;
      const want = Math.atan2(wx, wz);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 12);
    }
    if (this.speed > 0.01) {
      const step = this.speed * dt;
      const dx = Math.sin(this.heading) * step, dz = Math.cos(this.heading) * step;
      if (!this.tryMove(this.pos.x + dx, this.pos.z + dz)) {
        if (!this.tryMove(this.pos.x + dx, this.pos.z)) this.tryMove(this.pos.x, this.pos.z + dz);
      }
    }
    if (this.targetY !== undefined) {
      const k = this.targetY > this.pos.y ? 18 : 12;
      this.pos.y += (this.targetY - this.pos.y) * Math.min(1, dt * k);
    }

    // Jump vertical physics
    if (this.jumpY > 0 || this.jumpVel !== 0) {
      this.jumpY += this.jumpVel * dt;
      this.jumpVel -= 16.5 * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.jumpVel = 0;
      }
    }

    // walk cycle + footstep trigger at each stride plant
    const prevPhase = this.phase;
    this.phase += dt * this.speed * 2.6;
    if (this.speed > 0.35 && this.jumpY <= 0.05 && !this.isSitting) {
      const s0 = Math.floor((prevPhase + Math.PI * 0.35) / Math.PI);
      const s1 = Math.floor((this.phase + Math.PI * 0.35) / Math.PI);
      if (s1 > s0) {
        const isLeft = (s1 & 1) === 1;
        const onSand = this.pos.y < 1.32;
        if (onSand || waterD > 0.05) {
          this.wetShoes = 1.0;
        } else {
          this.wetShoes = Math.max(0, this.wetShoes - 0.18);
        }
        if (onSand || this.wetShoes > 0.05) {
          const side = isLeft ? 1 : -1;
          const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
          const fx = this.pos.x + ch * 0.105 * side + sh * 0.04;
          const fz = this.pos.z - sh * 0.105 * side + ch * 0.04;
          const str = onSand ? (this.speed > 4.4 ? 0.28 : 0.24) : 0.12 * this.wetShoes;
          const life = onSand ? 16.0 : 6.0;
          this.stampFootstep(fx, fz, this.heading - side * 0.04, isLeft, {
            fromY: this.pos.y,
            maxLife: life,
            strength: str,
          });
        }
        if (this.onStep) this.onStep(this.pos, this.speed > 4.4);
      }
    }

    // Limb & emote animations
    const sw = Math.sin(this.phase) * Math.min(1, this.speed / 3) * 0.55;
    const armBal = Math.min(0.48, waterD * 0.65);

    if (this.isSitting) {
      // Natural seated posture on 0.45m chair: thighs forward, knees bent 90 deg, hands resting on lap
      this.legs[0].rotation.x = -Math.PI * 0.5;
      this.legs[1].rotation.x = -Math.PI * 0.5;
      this.knees[0].rotation.x = Math.PI * 0.5;
      this.knees[1].rotation.x = Math.PI * 0.5;
      this.arms[0].rotation.set(-0.42, 0, 0.12);
      this.arms[1].rotation.set(-0.42, 0, -0.12);
    } else if (this.jumpY > 0.04) {
      // Mid-air jump pose
      this.legs[0].rotation.x = 0.48;
      this.legs[1].rotation.x = -0.25;
      this.knees[0].rotation.x = 0.25;
      this.knees[1].rotation.x = 0.35;
      this.arms[0].rotation.x = -0.85;
      this.arms[1].rotation.x = -0.85;
      this.arms[0].rotation.z = 0.25;
      this.arms[1].rotation.z = -0.25;
    } else if (this.activeEmote && this.emoteTimer > 0 && !moving) {
      this.emoteTimer = Math.max(0, this.emoteTimer - dt);
      const t = (5.0 - this.emoteTimer) * 4.0;
      this.legs[0].rotation.x = 0;
      this.legs[1].rotation.x = 0;
      this.knees[0].rotation.x = 0;
      this.knees[1].rotation.x = 0;
      if (this.activeEmote === 'wave') {
        this.arms[0].rotation.set(0, 0, armBal);
        this.arms[1].rotation.set(-Math.PI * 0.82, 0, -0.35 - Math.sin(t * 3) * 0.32);
      } else if (this.activeEmote === 'dance') {
        this.legs[0].rotation.x = Math.sin(t * 2) * 0.35;
        this.legs[1].rotation.x = -Math.sin(t * 2) * 0.35;
        this.arms[0].rotation.set(-0.6 + Math.sin(t) * 0.5, 0, 0.35);
        this.arms[1].rotation.set(-0.6 - Math.sin(t) * 0.5, 0, -0.35);
      } else if (this.activeEmote === 'cheer' || this.activeEmote === 'laugh') {
        this.arms[0].rotation.set(-Math.PI * 0.78 + Math.sin(t * 2.5) * 0.22, 0, 0.25);
        this.arms[1].rotation.set(-Math.PI * 0.78 + Math.sin(t * 2.5) * 0.22, 0, -0.25);
      } else if (this.activeEmote === 'namaste' || this.activeEmote === 'meditate') {
        this.arms[0].rotation.set(-Math.PI * 0.42, 0, -0.45);
        this.arms[1].rotation.set(-Math.PI * 0.42, 0, 0.45);
      } else {
        // flex / default celebratory pose
        this.arms[0].rotation.set(-Math.PI * 0.58, 0, 0.75);
        this.arms[1].rotation.set(-Math.PI * 0.58, 0, -0.75);
      }
      if (this.emoteTimer <= 0) this.activeEmote = null;
    } else {
      this.legs[0].rotation.x = sw;
      this.legs[1].rotation.x = -sw;
      this.knees[0].rotation.x = Math.max(0, -sw * 0.45);
      this.knees[1].rotation.x = Math.max(0, sw * 0.45);
      this.arms[0].rotation.set(-sw * 0.8, 0, armBal);
      this.arms[1].rotation.set(sw * 0.8, 0, -armBal);
    }

    if (this.punchTimer > 0) {
      this.punchTimer = Math.max(0, this.punchTimer - dt);
      const punchPhase = Math.sin((1 - this.punchTimer / 0.36) * Math.PI);
      this.arms[1].rotation.x = -Math.PI * 0.52 * punchPhase;
      this.arms[1].rotation.z = -0.1 * punchPhase;
    }

    this.sync();
  }

  sync() {
    const sitOffset = this.isSitting ? -0.38 : 0;
    this.mesh.position.set(this.pos.x, this.pos.y + (this.jumpY || 0) + sitOffset, this.pos.z);
    this.mesh.rotation.y = this.heading;
  }
}
