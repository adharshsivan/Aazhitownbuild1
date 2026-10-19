import * as THREE from 'three';
import { boxGeo, rng } from '../geom.js';
import { WALK, APARTMENT, GRAFFITI, CAFE, PAVILION, SHOP, BUS_SHELTERS } from '../layout.js';

const box = (ctx, w, h, d, mat, x, y, z, ry = 0, tw = 1, th = tw, o = {}) =>
  ctx.batch.add(boxGeo(w, h, d, tw, th), mat, x, y, z, ry, o);

/** Small shrub clumps placed on balconies/roofs; consumed by vegetation.js. */
function plant(ctx, x, y, z, s = 0.5) { (ctx.data.smallPlants ||= []).push([x, y, z, s]); }

export function buildBuildings(ctx) {
  apartment(ctx);
  graffiti(ctx);
  shop(ctx);
  cafe(ctx);
  pavilion(ctx);
  BUS_SHELTERS.forEach((b) => busShelter(ctx, b));
  pierHut(ctx);
}

// ---------------------------------------------------------------------------
function apartment(ctx) {
  const { M } = ctx;
  const A = APARTMENT;
  const H = A.floors * A.floorH;
  const y0 = WALK;
  box(ctx, A.w, H, A.d, M.aptWall, A.x, y0 + H / 2, A.z, 0, 3, A.floorH);
  ctx.colliders.push({ type: 'box', x: A.x, z: A.z, hw: A.w / 2 + 0.1, hd: A.d / 2 + 0.1, rot: 0 });
  const r = rng(101);
  for (let f = 1; f <= A.floors; f++) {
    const y = y0 + f * A.floorH;
    box(ctx, A.w + 0.5, 0.28, A.d + 0.5, M.aptSlab, A.x, y - 0.14, A.z);
    if (f === A.floors) break;
    // south balconies (two per floor), east balcony strip
    for (const bx of [-3.8, 3.8]) {
      const cx = A.x + bx, cz = A.z + A.d / 2 + 0.75;
      box(ctx, 6.6, 0.25, 1.5, M.aptSlab, cx, y - 0.12, cz);
      box(ctx, 6.6, 0.9, 0.12, M.aptSlab, cx, y + 0.45, cz + 0.7);
      box(ctx, 6.2, 0.35, 0.44, M.soil, cx, y + 1.05, cz + 0.48);
      for (let k = 0; k < 4; k++) plant(ctx, cx - 2.4 + k * 1.6 + (r() - 0.5) * 0.25, y + 1.22, cz + 0.48, 0.34 + r() * 0.12);
    }
    {
      const cx = A.x + A.w / 2 + 0.7, cz = A.z;
      box(ctx, 1.4, 0.25, A.d - 2, M.aptSlab, cx, y - 0.12, cz);
      box(ctx, 0.12, 0.9, A.d - 2, M.aptSlab, cx + 0.65, y + 0.45, cz);
      box(ctx, 0.44, 0.35, A.d - 2.6, M.soil, cx + 0.42, y + 1.05, cz);
      for (let k = 0; k < 3; k++) plant(ctx, cx + 0.42, y + 1.22, cz - 3.4 + k * 3.4 + (r() - 0.5) * 0.4, 0.34 + r() * 0.12);
    }
    // wood fins
    for (const fx of [-A.w / 2 + 0.2, 0, A.w / 2 - 0.2]) box(ctx, 0.25, A.floorH - 0.3, 0.3, M.aptAccent, A.x + fx, y - A.floorH / 2, A.z + A.d / 2 + 0.05);
  }
  // roof: penthouse, garden, tank (exact 4x3 bay penthouse so zero windows are cropped)
  const roofY = y0 + H;
  box(ctx, A.w + 0.2, 1.0, A.d + 0.2, M.aptSlab, A.x, roofY + 0.5, A.z, 0, 1);
  box(ctx, 8.0, 3.2, 6.0, M.aptWall, A.x - 2.5, roofY + 1.6, A.z - 1.5, 0, 2.0, 3.2);
  box(ctx, 8.6, 0.3, 6.6, M.aptSlab, A.x - 2.5, roofY + 3.35, A.z - 1.5);
  box(ctx, 5, 0.5, 4, M.leafPlanter, A.x + 4.2, roofY + 1.15, A.z + 2.8);
  for (let k = 0; k < 6; k++) plant(ctx, A.x + 2.5 + r() * 3.4, roofY + 1.4, A.z + 1.3 + r() * 3.0, 0.45 + r() * 0.25);
  ctx.batch.add(new THREE.CylinderGeometry(1, 1, 1.8, 14), M.whitePaint, A.x + 3.8, roofY + 1.9, A.z - 3.5);
  // entrance (south, at grade): glass doors + canopy
  box(ctx, 3.2, 2.6, 0.2, M.darkGlass, A.x, WALK + 1.3, A.z + A.d / 2 + 0.05);
  box(ctx, 4.4, 0.18, 2.2, M.aptSlab, A.x, WALK + 2.9, A.z + A.d / 2 + 1.1);
  // exterior rainwater downpipes + ground storm catch-pits on building corners
  const aptPipeGeo = new THREE.CylinderGeometry(0.045, 0.045, H, 6);
  for (const [px, pz] of [[A.x - A.w / 2 + 0.35, A.z + A.d / 2 + 0.06], [A.x + A.w / 2 - 0.35, A.z + A.d / 2 + 0.06], [A.x - A.w / 2 + 0.35, A.z - A.d / 2 - 0.06]]) {
    const cx = px, cz = pz + Math.sign(pz - A.z) * 0.12;
    ctx.batch.add(aptPipeGeo, M.metalDark, px, WALK + H / 2, pz);
    box(ctx, 0.34, 0.06, 0.34, M.curb, cx, WALK + 0.03, cz);
    box(ctx, 0.26, 0.045, 0.26, M.drainSump, cx, WALK + 0.025, cz);
    box(ctx, 0.24, 0.012, 0.24, M.drainGrate, cx, WALK + 0.054, cz);
  }
}

// ---------------------------------------------------------------------------
function graffiti(ctx) {
  const { M } = ctx;
  const B = GRAFFITI;
  const H = B.floors * B.floorH;
  box(ctx, B.w, H, B.d, M.grafWall, B.x, WALK + H / 2, B.z, 0, 3, B.floorH);
  ctx.colliders.push({ type: 'box', x: B.x, z: B.z, hw: B.w / 2 + 0.1, hd: B.d / 2 + 0.1, rot: 0 });
  // mural on the south face (faces the island centre / default camera)
  const mural = new THREE.PlaneGeometry(B.w, H);
  ctx.batch.add(mural, M.mural, B.x, WALK + H / 2, B.z + B.d / 2 + 0.03, 0, { noShadow: true });
  // floor bands + east balconies
  const r = rng(202);
  for (let f = 1; f < B.floors; f++) {
    const y = WALK + f * B.floorH;
    box(ctx, B.w + 0.3, 0.22, B.d + 0.06, M.concrete, B.x + 0.15, y, B.z - 0.03);
    for (const bz of [-3, 3]) {
      const cx = B.x + B.w / 2 + 0.6, cz = B.z + bz;
      box(ctx, 1.2, 0.2, 4.6, M.concrete, cx, y, cz);
      for (let k = 0; k <= 5; k++) box(ctx, 0.05, 1.0, 0.05, M.metalDark, cx + 0.55, y + 0.5, cz - 2.25 + k * 0.9);
      box(ctx, 0.06, 0.06, 4.6, M.metalDark, cx + 0.55, y + 1.0, cz);
      if (r() > 0.5) {
        const pz = cz + (r() - 0.5) * 2.6;
        box(ctx, 0.46, 0.28, 0.46, M.concrete, cx + 0.15, y + 0.24, pz);
        box(ctx, 0.38, 0.06, 0.38, M.soil, cx + 0.15, y + 0.36, pz);
        plant(ctx, cx + 0.15, y + 0.38, pz, 0.34);
      }
    }
  }
  // roof slab + parapet, AC units, tank (solid concrete roof cap prevents facade windows from appearing on top face)
  const roofY = WALK + H;
  box(ctx, B.w + 0.2, 0.24, B.d + 0.2, M.concrete, B.x, roofY + 0.12, B.z);
  box(ctx, B.w + 0.3, 0.8, 0.3, M.concrete, B.x, roofY + 0.4, B.z - B.d / 2);
  box(ctx, B.w + 0.3, 0.8, 0.3, M.concrete, B.x, roofY + 0.4, B.z + B.d / 2);
  box(ctx, 0.3, 0.8, B.d, M.concrete, B.x - B.w / 2, roofY + 0.4, B.z);
  box(ctx, 0.3, 0.8, B.d, M.concrete, B.x + B.w / 2, roofY + 0.4, B.z);
  for (const [ax, az] of [[-2, -2], [0, -2], [2.5, 1.5]]) box(ctx, 1.4, 1.0, 1.0, M.acUnit, B.x + ax, roofY + 0.72, B.z + az);
  box(ctx, 3, 2.6, 3, M.concrete, B.x - 3, roofY + 1.4, B.z + 3, 0, 1);
  ctx.batch.add(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12), M.blueRoof, B.x + 3.5, roofY + 0.95, B.z - 3.5);
  // east entrance (faces the inner lane)
  box(ctx, 0.2, 2.6, 3.0, M.darkGlass, B.x + B.w / 2 + 0.05, WALK + 1.3, B.z);
  box(ctx, 2.0, 0.18, 4.0, M.concrete, B.x + B.w / 2 + 1.0, WALK + 2.9, B.z);
  // rainwater downpipes + ground catch-pits
  const grafPipeGeo = new THREE.CylinderGeometry(0.042, 0.042, H, 6);
  for (const [px, pz] of [[B.x + B.w / 2 + 0.06, B.z - B.d / 2 + 0.4], [B.x - B.w / 2 - 0.06, B.z + B.d / 2 - 0.4]]) {
    const cx = px + Math.sign(px - B.x) * 0.12, cz = pz;
    ctx.batch.add(grafPipeGeo, M.metalDark, px, WALK + H / 2, pz);
    box(ctx, 0.34, 0.06, 0.34, M.curb, cx, WALK + 0.03, cz);
    box(ctx, 0.26, 0.045, 0.26, M.drainSump, cx, WALK + 0.025, cz);
    box(ctx, 0.24, 0.012, 0.24, M.drainGrate, cx, WALK + 0.054, cz);
  }
}

// ---------------------------------------------------------------------------
function shop(ctx) {
  const { M } = ctx;
  const S = SHOP;
  // Walkable Tea Kiosk room on the west side of the pergola (x: -36.4..-30.2, z: 14.4..18.6)
  const rx = S.x - 1.3; // -33.3
  const rz = S.z;       // 16.5
  const rw = 6.2;
  const rd = 4.2;
  const rh = 2.95;
  const x0 = rx - rw / 2; // -36.4
  const x1 = rx + rw / 2; // -30.2
  const z0 = rz - rd / 2; // 14.4
  const z1 = rz + rd / 2; // 18.6

  // Walkable interior tile floor
  const floorMesh = box(ctx, rw - 0.12, 0.06, rd - 0.12, M.aptSlab, rx, WALK + 0.03, rz, 0, 3, 2);
  ctx.walk.push(floorMesh);

  // Ceiling slab
  box(ctx, rw, 0.18, rd, M.plainWall, rx, WALK + rh - 0.09, rz, 0, 2, 2);

  // North back wall + wood wainscoting
  box(ctx, rw, rh, 0.22, M.plainWall, rx, WALK + rh / 2, z0 + 0.11, 0, 3, 2.8);
  box(ctx, rw - 0.3, 1.0, 0.05, M.woodDark, rx, WALK + 0.5, z0 + 0.24);
  ctx.colliders.push({ type: 'box', x: rx, z: z0 + 0.11, hw: rw / 2, hd: 0.18, rot: 0 });

  // West wall + wood wainscoting
  box(ctx, 0.22, rh, rd, M.plainWall, x0 + 0.11, WALK + rh / 2, rz, 0, 2.1, 2.8);
  box(ctx, 0.05, 1.0, rd - 0.3, M.woodDark, x0 + 0.24, WALK + 0.5, rz);
  ctx.colliders.push({ type: 'box', x: x0 + 0.11, z: rz, hw: 0.18, hd: rd / 2, rot: 0 });

  // East wall with clear window facing pergola terrace
  box(ctx, 0.22, 0.85, rd, M.plainWall, x1 - 0.11, WALK + 0.425, rz);
  box(ctx, 0.22, 0.65, rd, M.plainWall, x1 - 0.11, WALK + rh - 0.325, rz);
  box(ctx, 0.05, 1.45, rd - 0.4, M.glassClear, x1 - 0.11, WALK + 1.575, rz, 0, 2, 1, { noShadow: true });
  ctx.colliders.push({ type: 'box', x: x1 - 0.11, z: rz, hw: 0.18, hd: rd / 2, rot: 0 });

  // South front wall: glazed left bay (x: -36.4..-33.1) + open doorway on right bay (x: -33.1..-30.9, center -32.0)
  box(ctx, rw, 0.55, 0.22, M.plainWall, rx, WALK + rh - 0.275, z1 - 0.11);
  // Left window section (width 3.3m, center x = -34.75)
  box(ctx, 3.3, 0.85, 0.22, M.plainWall, x0 + 1.65, WALK + 0.425, z1 - 0.11);
  box(ctx, 3.1, 1.55, 0.05, M.glassClear, x0 + 1.65, WALK + 1.625, z1 - 0.11, 0, 2, 1, { noShadow: true });
  ctx.colliders.push({ type: 'box', x: x0 + 1.65, z: z1 - 0.11, hw: 1.65, hd: 0.18, rot: 0 });
  // Right doorway corner post (x = -30.55, width 0.7m)
  box(ctx, 0.7, rh, 0.22, M.plainWall, x1 - 0.35, WALK + rh / 2, z1 - 0.11);
  ctx.colliders.push({ type: 'box', x: x1 - 0.35, z: z1 - 0.11, hw: 0.35, hd: 0.18, rot: 0 });
  // Open glass door leaf & dark metal door frame around doorway (x = -32.0)
  box(ctx, 0.08, 2.4, 0.24, M.metalDark, -33.1, WALK + 1.2, z1 - 0.11);
  box(ctx, 0.08, 2.4, 0.24, M.metalDark, -30.9, WALK + 1.2, z1 - 0.11);
  box(ctx, 0.06, 2.35, 0.85, M.darkGlass, -33.05, WALK + 1.2, z1 - 0.52);

  // Exterior green awning & TEA & SNACKS sign above front entrance
  box(ctx, rw + 0.3, 0.55, 0.18, M.awning, rx, WALK + 2.68, z1 + 0.06);
  ctx.batch.add(new THREE.PlaneGeometry(4.4, 0.48), M.signTea, rx, WALK + 2.68, z1 + 0.16, 0, { noShadow: true });

  // Minimal Interior inside SHOP kiosk:
  // 1. Tea Counter & Samovar on North-West side (x: -34.6, z: 15.35)
  box(ctx, 2.5, 1.0, 0.85, M.woodDark, -34.6, WALK + 0.5, 15.35);
  box(ctx, 2.62, 0.07, 0.96, M.aptSlab, -34.6, WALK + 1.035, 15.35);
  ctx.colliders.push({ type: 'box', x: -34.6, z: 15.35, hw: 1.3, hd: 0.5, rot: 0 });
  // Brass Samovar / Tea Kettle
  ctx.batch.add(new THREE.CylinderGeometry(0.18, 0.15, 0.52, 12), M.guyGuard, -35.3, WALK + 1.33, 15.35);
  ctx.batch.add(new THREE.CylinderGeometry(0.12, 0.18, 0.1, 12), M.steel, -35.3, WALK + 1.64, 15.35);
  // Glass snack display vitrine
  box(ctx, 0.95, 0.42, 0.5, M.glassClear, -34.1, WALK + 1.28, 15.35, 0, 1, 1, { noShadow: true });
  box(ctx, 0.82, 0.04, 0.38, M.guyGuard, -34.1, WALK + 1.18, 15.35);
  // Back wall tea shelf & interior sign
  ctx.batch.add(new THREE.PlaneGeometry(2.4, 0.34), M.signTea, -34.6, WALK + 2.25, z0 + 0.25, 0, { noShadow: true });
  box(ctx, 2.2, 0.06, 0.24, M.wood, -34.6, WALK + 1.68, z0 + 0.34);
  for (let i = 0; i < 4; i++) {
    ctx.batch.add(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 8), i % 2 === 0 ? M.teal : M.buoy, -35.3 + i * 0.45, WALK + 1.82, z0 + 0.34);
  }
  // Indoor seating table (east interior corner)
  table(ctx, -31.35, 15.65, false);
  // Warm ceiling pendant lamp
  ctx.batch.add(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), M.metalDark, rx, WALK + rh - 0.35, rz);
  ctx.batch.add(new THREE.SphereGeometry(0.14, 10, 8), M.lampGlow, rx, WALK + rh - 0.58, rz);

  // Pergola rafters & glass roof over full SHOP footprint
  for (const px of [S.w / 2 - 0.2]) for (const pz of [-S.d / 2 + 0.2, S.d / 2 - 0.2]) {
    box(ctx, 0.18, 3.0, 0.18, M.metalDark, S.x + px, WALK + 1.5, S.z + pz);
    ctx.colliders.push({ type: 'circle', x: S.x + px, z: S.z + pz, r: 0.25 });
  }
  for (let k = 0; k <= 6; k++) box(ctx, 0.1, 0.16, S.d, M.metalDark, S.x - S.w / 2 + k * (S.w / 6), WALK + 3.05, S.z);
  box(ctx, S.w, 0.05, S.d, M.glassClear, S.x, WALK + 3.15, S.z, 0, S.w / 6, S.d / 3, { noShadow: true });
  // Outdoor pergola table on east bay
  table(ctx, S.x + 3.2, S.z + 0.2, false);
}

function table(ctx, x, z, umbrella = true) {
  const { M } = ctx;
  if (!ctx.seats) ctx.seats = [];
  ctx.batch.add(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 12), M.whitePaint, x, WALK + 0.75, z);
  ctx.batch.add(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), M.metalDark, x, WALK + 0.375, z);
  for (const side of [-1, 1]) {
    const cx = x + side * 0.78;
    const cz = z;
    // Chair seat slab (top at WALK + 0.45)
    box(ctx, 0.42, 0.06, 0.42, M.wood, cx, WALK + 0.42, cz);
    // Chair backrest on outer edge
    box(ctx, 0.06, 0.44, 0.42, M.woodDark, cx + side * 0.18, WALK + 0.67, cz);
    // 4 chair legs
    for (const lx of [-0.16, 0.16]) {
      for (const lz of [-0.16, 0.16]) {
        box(ctx, 0.05, 0.40, 0.05, M.metalDark, cx + lx, WALK + 0.20, cz + lz);
      }
    }
    // Register seat facing the table center
    ctx.seats.push({
      x: cx,
      y: WALK,
      z: cz,
      heading: side < 0 ? Math.PI / 2 : -Math.PI / 2,
    });
  }
  if (umbrella) {
    ctx.batch.add(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), M.metalDark, x, WALK + 1.2, z);
    ctx.batch.add(new THREE.ConeGeometry(1.4, 0.5, 8, 1, true), M.umbrellaWhite, x, WALK + 2.4, z);
  }
  ctx.colliders.push({ type: 'circle', x, z, r: 0.38 });
}

// ---------------------------------------------------------------------------
function cafe(ctx) {
  const { M } = ctx;
  const C = CAFE;
  const x0 = C.x - C.w / 2; // 43.0 (West)
  const x1 = C.x + C.w / 2; // 56.0 (East)
  const z0 = C.z - C.d / 2; // 0.0  (North)
  const z1 = C.z + C.d / 2; // 11.0 (South)

  // 1. Walkable Interior Tile Floor Slab & Ceiling Slab (flush with exterior sidewalk threshold)
  const cafeFloor = box(ctx, C.w - 0.16, 0.04, C.d - 0.16, M.aptSlab, C.x, WALK + 0.015, C.z, 0, 5, 4);
  ctx.walk.push(cafeFloor);
  // Warm wooden floor runner leading from West entrance to the Tea Counter
  const runnerFloor = box(ctx, 7.6, 0.045, 2.2, M.planks, C.x - 1.2, WALK + 0.02, C.z - 2.5, 0, 3, 1);
  ctx.walk.push(runnerFloor);

  // Ceiling / Roof structural slab
  box(ctx, C.w, 0.28, C.d, M.plainWall, C.x, WALK + C.h - 0.14, C.z, 0, 3, 3);

  // 2. Perimeter Walls with Open West Entrance & Storefront Glazing
  // North Wall (solid + interior wood wainscoting)
  box(ctx, C.w, C.h, 0.28, M.plainWall, C.x, WALK + C.h / 2, z0 + 0.14, 0, 3, 3.2);
  box(ctx, C.w - 0.4, 1.15, 0.06, M.woodDark, C.x, WALK + 0.575, z0 + 0.30);
  ctx.colliders.push({ type: 'box', x: C.x, z: z0 + 0.14, hw: C.w / 2, hd: 0.22, rot: 0 });

  // East Wall (solid + interior wood wainscoting behind Tea Counter)
  box(ctx, 0.28, C.h, C.d, M.plainWall, x1 - 0.14, WALK + C.h / 2, C.z, 0, 3, 3.2);
  box(ctx, 0.06, 1.15, C.d - 0.4, M.woodDark, x1 - 0.30, WALK + 0.575, C.z);
  ctx.colliders.push({ type: 'box', x: x1 - 0.14, z: C.z, hw: 0.22, hd: C.d / 2, rot: 0 });

  // South Wall (storefront window wall overlooking umbrella terrace)
  box(ctx, C.w, 1.4, 0.28, M.plainWall, C.x, WALK + 3.9, z1 - 0.14, 0, 3, 1.2);
  box(ctx, C.w, 0.85, 0.26, M.plainWall, C.x, WALK + 0.425, z1 - 0.14, 0, 3, 0.8);
  box(ctx, C.w - 0.3, 0.06, 0.32, M.woodDark, C.x, WALK + 0.86, z1 - 0.14);
  box(ctx, C.w - 0.5, 2.35, 0.06, M.glassClear, C.x, WALK + 2.025, z1 - 0.14, 0, 5, 2, { noShadow: true });
  for (let m = -2; m <= 2; m++) {
    box(ctx, 0.1, 2.4, 0.16, M.metalDark, C.x + m * 2.4, WALK + 2.025, z1 - 0.14);
  }
  ctx.colliders.push({ type: 'box', x: C.x, z: z1 - 0.14, hw: C.w / 2, hd: 0.22, rot: 0 });

  // West Wall (Main Entrance Doorway at z = C.z - 2.5 = 3.0, width 2.4m: z from 1.8 to 4.2)
  box(ctx, 0.28, 1.4, C.d, M.plainWall, x0 + 0.14, WALK + 3.9, C.z, 0, 3, 1.2);
  // North-of-door wall segment (z: 0.0..1.8, center z = 0.9, length = 1.8)
  box(ctx, 0.28, 3.2, 1.8, M.plainWall, x0 + 0.14, WALK + 1.6, 0.9, 0, 1, 2.5);
  ctx.colliders.push({ type: 'box', x: x0 + 0.14, z: 0.9, hw: 0.22, hd: 0.9, rot: 0 });
  // South-of-door glazed segment (z: 4.2..11.0, center z = 7.6, length = 6.8)
  box(ctx, 0.26, 0.85, 6.8, M.plainWall, x0 + 0.14, WALK + 0.425, 7.6, 0, 2, 0.8);
  box(ctx, 0.32, 0.06, 6.7, M.woodDark, x0 + 0.14, WALK + 0.86, 7.6);
  box(ctx, 0.06, 2.35, 6.5, M.glassClear, x0 + 0.14, WALK + 2.025, 7.6, 0, 3, 2, { noShadow: true });
  for (const mz of [4.25, 6.5, 8.75, 10.85]) {
    box(ctx, 0.16, 2.4, 0.1, M.metalDark, x0 + 0.14, WALK + 2.025, mz);
  }
  ctx.colliders.push({ type: 'box', x: x0 + 0.14, z: 7.6, hw: 0.22, hd: 3.4, rot: 0 });
  // Doorway header & open double glass doors at z = 3.0
  box(ctx, 0.28, 0.6, 2.4, M.plainWall, x0 + 0.14, WALK + 2.9, 3.0);
  box(ctx, 0.22, 2.6, 0.1, M.metalDark, x0 + 0.14, WALK + 1.3, 1.82);
  box(ctx, 0.22, 2.6, 0.1, M.metalDark, x0 + 0.14, WALK + 1.3, 4.18);
  // Swung-open glass doors inviting player inside
  box(ctx, 0.85, 2.45, 0.06, M.darkGlass, x0 + 0.55, WALK + 1.25, 1.88);
  box(ctx, 0.85, 2.45, 0.06, M.darkGlass, x0 + 0.55, WALK + 1.25, 4.12);

  // Exterior fascia & TEA & SNACKS signs (readable from outside)
  box(ctx, 0.3, 1.1, C.d + 0.4, M.metalDark, x0 - 0.2, WALK + 3.75, C.z);
  box(ctx, C.w + 0.4, 1.1, 0.3, M.metalDark, C.x, WALK + 3.75, z1 + 0.2);
  ctx.batch.add(new THREE.PlaneGeometry(8, 0.9), M.signTea, C.x, WALK + 3.75, z1 + 0.37, 0, { noShadow: true });
  ctx.batch.add(new THREE.PlaneGeometry(8, 0.9), M.signTea, x0 - 0.37, WALK + 3.75, C.z, -Math.PI / 2, { noShadow: true });

  // 3. Minimal Tea Shop Interior (Counter, Brass Samovar, Snack Vitrine, Menu Board, Tables & Warm Lighting)
  // Main Wooden Tea Service Counter along East side (x = 53.0, z = 4.2)
  const cx = 53.0, cz = 4.2, cw = 1.15, cd = 5.8, ch = 1.05;
  box(ctx, cw, ch, cd, M.woodDark, cx, WALK + ch / 2, cz);
  box(ctx, 0.06, ch - 0.16, cd - 0.2, M.aptAccent, cx - cw / 2 - 0.02, WALK + ch / 2, cz);
  box(ctx, cw + 0.24, 0.08, cd + 0.24, M.aptSlab, cx, WALK + ch + 0.04, cz);
  ctx.colliders.push({ type: 'box', x: cx, z: cz, hw: cw / 2 + 0.15, hd: cd / 2 + 0.1, rot: 0 });

  // Traditional Kerala Brass Chaya Samovar / Tea Boiler on Counter
  ctx.batch.add(new THREE.CylinderGeometry(0.24, 0.19, 0.68, 14), M.guyGuard, cx - 0.05, WALK + ch + 0.42, 2.3);
  ctx.batch.add(new THREE.CylinderGeometry(0.15, 0.24, 0.14, 14), M.steel, cx - 0.05, WALK + ch + 0.83, 2.3);
  ctx.batch.add(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8), M.guyGuard, cx - 0.05, WALK + ch + 0.98, 2.3);
  // Tea glasses ready on counter tray
  box(ctx, 0.38, 0.03, 0.55, M.steel, cx - 0.1, WALK + ch + 0.095, 3.15);
  for (const gz of [2.98, 3.15, 3.32]) {
    ctx.batch.add(new THREE.CylinderGeometry(0.045, 0.035, 0.11, 8), M.glassClear, cx - 0.1, WALK + ch + 0.16, gz);
  }

  // Glass Snack Display Showcase (Pazham Pori / Samosa / Vada trays)
  box(ctx, 0.65, 0.52, 1.65, M.glassClear, cx - 0.08, WALK + ch + 0.34, 4.35, 0, 1, 1, { noShadow: true });
  box(ctx, 0.54, 0.04, 1.48, M.wood, cx - 0.08, WALK + ch + 0.18, 4.35);
  box(ctx, 0.50, 0.04, 1.44, M.guyGuard, cx - 0.08, WALK + ch + 0.36, 4.35);

  // Order Register on South end of Counter
  box(ctx, 0.42, 0.32, 0.46, M.metalDark, cx - 0.08, WALK + ch + 0.24, 6.2);
  box(ctx, 0.04, 0.22, 0.36, M.teal, cx - 0.30, WALK + ch + 0.26, 6.2);

  // Back Wall Illuminated Menu Board & Tea Canister Shelves (on East interior wall x = 55.65)
  ctx.batch.add(new THREE.PlaneGeometry(4.4, 0.55), M.signTea, x1 - 0.32, WALK + 2.95, cz, -Math.PI / 2, { noShadow: true });
  for (const sy of [WALK + 1.65, WALK + 2.2]) {
    box(ctx, 0.32, 0.06, 4.2, M.wood, x1 - 0.46, sy, cz);
    for (let k = 0; k < 6; k++) {
      const jarMat = k % 3 === 0 ? M.teal : (k % 3 === 1 ? M.buoy : M.whitePaint);
      ctx.batch.add(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 10), jarMat, x1 - 0.46, sy + 0.16, cz - 1.65 + k * 0.66);
    }
  }

  // Interior Dining Tables & Chairs (3 tables with generous walking clearance)
  table(ctx, 49.2, 5.6, false);
  table(ctx, 47.0, 8.5, false);
  table(ctx, 48.2, 1.85, false);

  // Warm Interior Ceiling Pendant Lamps
  for (const [lx, lz] of [[46.8, 3.4], [46.8, 7.6], [51.2, 3.4], [51.2, 7.6]]) {
    ctx.batch.add(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6), M.metalDark, lx, WALK + C.h - 0.55, lz);
    ctx.batch.add(new THREE.ConeGeometry(0.28, 0.18, 10), M.metalDark, lx, WALK + C.h - 0.82, lz);
    ctx.batch.add(new THREE.SphereGeometry(0.13, 10, 8), M.lampGlow, lx, WALK + C.h - 0.90, lz);
  }

  // 4. Roof terrace: parapet, planters, AC units, small stair hut
  const roofY = WALK + C.h;
  box(ctx, C.w, 0.7, 0.25, M.whitePaint, C.x, roofY + 0.35, C.z - C.d / 2);
  box(ctx, C.w, 0.7, 0.25, M.whitePaint, C.x, roofY + 0.35, z1);
  box(ctx, 0.25, 0.7, C.d, M.whitePaint, x0, roofY + 0.35, C.z);
  box(ctx, 0.25, 0.7, C.d, M.whitePaint, C.x + C.w / 2, roofY + 0.35, C.z);
  box(ctx, C.w - 1, 0.45, 0.8, M.soil, C.x, roofY + 0.25, z1 - 0.6);
  box(ctx, 0.8, 0.45, C.d - 1, M.soil, x0 + 0.6, roofY + 0.25, C.z);
  const r = rng(303);
  for (let k = 0; k < 9; k++) plant(ctx, x0 + 1 + k * 1.3, roofY + 0.47, z1 - 0.6, 0.36 + r() * 0.16);
  for (let k = 0; k < 6; k++) plant(ctx, x0 + 0.6, roofY + 0.47, C.z - 4 + k * 1.6, 0.36 + r() * 0.16);
  for (const [ax, az] of [[3.5, -3], [5, -3], [3.5, -1.2], [5, -1.2]]) box(ctx, 1.2, 0.9, 1.0, M.acUnit, C.x + ax, roofY + 0.45, C.z + az);
  box(ctx, 3, 2.4, 2.6, M.plainWall, C.x - 2, roofY + 1.2, C.z - 3, 0, 3, 2.4);
  // terrace with umbrella tables (south)
  for (const [tx, tz] of [[-4, 3], [0, 3.2], [4, 3], [-2, 6], [2.2, 6.2]]) table(ctx, C.x + tx, z1 + tz);
  // planter strip edging the terrace
  box(ctx, C.w + 1, 0.5, 0.64, M.concrete, C.x, WALK + 0.25, z1 + 8.6);
  box(ctx, C.w + 0.76, 0.08, 0.46, M.soil, C.x, WALK + 0.48, z1 + 8.6);
  for (let k = 0; k < 8; k++) plant(ctx, C.x - C.w / 2 + 0.35 + k * 1.75, WALK + 0.51, z1 + 8.6, 0.38);
  ctx.colliders.push({ type: 'box', x: C.x, z: z1 + 8.6, hw: (C.w + 1) / 2, hd: 0.35, rot: 0 });
  // cafe roof rainwater downpipes + catch-boxes
  const cafePipeGeo = new THREE.CylinderGeometry(0.038, 0.038, C.h, 6);
  for (const [px, pz] of [[C.x + C.w / 2 + 0.05, C.z - C.d / 2 + 0.4], [C.x + C.w / 2 + 0.05, z1 - 0.4]]) {
    const cx = px + 0.12, cz = pz;
    ctx.batch.add(cafePipeGeo, M.metalDark, px, WALK + C.h / 2, pz);
    box(ctx, 0.32, 0.06, 0.32, M.curb, cx, WALK + 0.03, cz);
    box(ctx, 0.24, 0.045, 0.24, M.drainSump, cx, WALK + 0.025, cz);
    box(ctx, 0.22, 0.012, 0.22, M.drainGrate, cx, WALK + 0.054, cz);
  }
}

// ---------------------------------------------------------------------------
function pavilion(ctx) {
  const { M } = ctx;
  const P = PAVILION;
  const s = P.size;
  // Stepped architectural plinth with overhanging concrete coping slab (replaces cropped stone wall texture on horizontal floor)
  const plinthTop = WALK + 0.32;
  box(ctx, s - 0.12, 0.24, s - 0.12, M.concreteDark, P.x, WALK + 0.12, P.z, 0, 2);
  const g = box(ctx, s + 0.08, 0.08, s + 0.08, M.curb, P.x, WALK + 0.28, P.z, 0, 2);
  ctx.walk.push(g);
  // posts
  const postY = plinthTop + 1.4;
  for (const px of [-1, 1]) for (const pz of [-1, 1]) {
    box(ctx, 0.28, 2.8, 0.28, M.woodDark, P.x + px * (s / 2 - 0.5), postY, P.z + pz * (s / 2 - 0.5));
    ctx.colliders.push({ type: 'circle', x: P.x + px * (s / 2 - 0.5), z: P.z + pz * (s / 2 - 0.5), r: 0.3 });
  }
  for (const px of [-1, 1]) box(ctx, 0.25, 0.25, s - 0.6, M.woodDark, P.x + px * (s / 2 - 0.5), plinthTop + 2.85, P.z);
  for (const pz of [-1, 1]) box(ctx, s - 0.6, 0.25, 0.25, M.woodDark, P.x, plinthTop + 2.85, P.z + pz * (s / 2 - 0.5));
  // two-tier Kerala hip roof (pyramids rotated 45deg with integer horizontal terracotta tile courses)
  const roof1 = new THREE.ConeGeometry((s + 1.6) / Math.SQRT2, 1.5, 4, 1, true);
  const roof2 = new THREE.ConeGeometry((s - 1.2) / Math.SQRT2, 1.6, 4, 1, false);
  const ruv = (gm, ku, kv) => { const uv = gm.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv); };
  ruv(roof1, 8, 3); ruv(roof2, 6, 3);
  ctx.batch.add(roof1, M.roofTiles, P.x, plinthTop + 3.6, P.z, Math.PI / 4);
  ctx.batch.add(roof2, M.roofTiles, P.x, plinthTop + 4.55, P.z, Math.PI / 4);
  box(ctx, 0.5, 0.6, 0.5, M.woodDark, P.x, plinthTop + 5.4, P.z);
  // benches
  for (const pz of [-1, 1]) {
    box(ctx, s - 2.2, 0.12, 0.5, M.wood, P.x, plinthTop + 0.45, P.z + pz * (s / 2 - 1.1));
    ctx.colliders.push({ type: 'box', x: P.x, z: P.z + pz * (s / 2 - 1.1), hw: (s - 2.2) / 2, hd: 0.3, rot: 0 });
  }
}

// ---------------------------------------------------------------------------
function busShelter(ctx, b) {
  const { M } = ctx;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(b.x, WALK, b.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot), new THREE.Vector3(1, 1, 1));
  const add = (geo, mat, x, y, z, o = {}) => ctx.batch.add(geo, mat, x, y, z, 0, { ...o, parent: m });
  const L = 5, Dp = 1.8;
  // back faces local -z; open side local +z faces the road (exact 2x1 and 1x1 glass panels so frames never crop)
  add(boxGeo(L, 2.1, 0.05, L / 2, 2.1), M.glassClear, 0, 1.2, -Dp / 2 + 0.1, { noShadow: true });
  for (const x of [-L / 2 + 0.1, 0, L / 2 - 0.1]) add(boxGeo(0.08, 2.6, 0.08, 1), M.metalDark, x, 1.3, -Dp / 2 + 0.1);
  add(boxGeo(L + 0.4, 0.12, Dp + 0.4, 1), M.whitePaint, 0, 2.66, 0.1, { rx: -0.06 });
  add(boxGeo(0.06, 2.1, Dp - 0.3, Dp - 0.3, 2.1), M.glassClear, L / 2 - 0.1, 1.2, 0, { noShadow: true });
  add(boxGeo(0.12, 1.8, 1.1, 1), M.teal, -L / 2 + 0.1, 1.2, -0.1);
  add(boxGeo(3.2, 0.08, 0.45, 1), M.wood, 0, 0.48, -Dp / 2 + 0.45);
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const wx = (lx, lz) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
  const [bx, bz] = wx(0, -Dp / 2 + 0.3);
  ctx.colliders.push({ type: 'box', x: bx, z: bz, hw: L / 2, hd: 0.35, rot: b.rot });
  // flag pole stop sign
  const [px, pz] = wx(L / 2 + 0.6, 0.6);
  ctx.batch.add(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), M.metalDark, px, WALK + 1.3, pz);
  ctx.batch.add(boxGeo(0.6, 0.6, 0.04, 0.6), M.teal, px, WALK + 2.4, pz, b.rot);
}

// ---------------------------------------------------------------------------
function pierHut(ctx) {
  const { M } = ctx;
  const deck = ctx.data.pier.deckTop;
  const cx = 28, cz = 51.6, s = 4.6;
  for (const px of [-1, 1]) for (const pz of [-1, 1]) {
    box(ctx, 0.22, 2.6, 0.22, M.wood, cx + px * s / 2, deck + 1.3, cz + pz * s / 2);
    ctx.colliders.push({ type: 'circle', x: cx + px * s / 2, z: cz + pz * s / 2, r: 0.25 });
  }
  const roof = new THREE.ConeGeometry((s + 1.4) / Math.SQRT2, 1.4, 4, 1, false);
  ctx.batch.add(roof, M.blueRoof, cx, deck + 3.3, cz, Math.PI / 4);
  box(ctx, s + 0.3, 0.2, s + 0.3, M.wood, cx, deck + 2.6, cz);
  box(ctx, s - 0.6, 0.1, 0.45, M.wood, cx, deck + 0.45, cz + s / 2 - 0.35);
  for (const px of [-1, 1]) box(ctx, 0.1, 0.45, 0.4, M.wood, cx + px * (s / 2 - 0.6), deck + 0.22, cz + s / 2 - 0.35);
  ctx.colliders.push({ type: 'box', x: cx, z: cz + s / 2 - 0.35, hw: s / 2 - 0.3, hd: 0.3, rot: 0 });
}
