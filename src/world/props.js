import * as THREE from 'three';
import { boxGeo, pointInPolys, ringArea, rng, toExPolys, Polyline, Batch } from '../geom.js';
import { G, WALK, ROADS, JUNCTIONS, PATHS, APARTMENT, GRAFFITI, CAFE, SHOP, BUS_SHELTERS, BEACH } from '../layout.js';
import { beachHeight } from './terrain.js';
import { coastUniforms, COAST_GLSL } from './coastShading.js';

// Street furniture, drainage infrastructure, utility powerlines, beach dressing and boats.
export function buildProps(ctx) {
  streetLights(ctx);
  drainage(ctx);
  powerLines(ctx);
  benches(ctx);
  beach(ctx);
  return boats(ctx);
}

function lampParts() {
  const pole = new THREE.CylinderGeometry(0.07, 0.11, 6.4, 8); pole.translate(0, 3.2, 0);
  const arm = boxGeo(0.08, 0.08, 1.6, 1); arm.translate(0, 6.3, 0.75);
  const head = boxGeo(0.32, 0.12, 0.6, 1); head.translate(0, 6.22, 1.5);
  const glow = boxGeo(0.26, 0.03, 0.5, 1); glow.translate(0, 6.15, 1.5);
  return { pole, arm, head, glow };
}

function streetLights(ctx) {
  const { M, data: D } = ctx;
  const L = lampParts();
  const ring = D.roads.ring;
  const outSign = ringArea(ring.pts) > 0 ? 1 : -1;
  const avoid = [...D.crossings.map((c) => [c.x, c.z, c.width / 2 + 3.5])];
  for (const name of ['avenue', 'lane']) {
    const r = D.roads[name];
    for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) avoid.push([p[0], p[1], 13]);
  }
  const ok = (x, z) => avoid.every(([ax, az, d]) => Math.hypot(ax - x, az - z) > d);
  D.lamps = [];
  const place = (x, z, fx, fz) => {
    if (!ok(x, z)) return;
    D.lamps.push([x, z]);
    const ry = Math.atan2(fx, fz);
    for (const [g, m] of [[L.pole, M.metalDark], [L.arm, M.metalDark], [L.head, M.metalDark]]) ctx.batch.add(g, m, x, WALK, z, ry);
    ctx.batch.add(L.glow, M.lampGlow, x, WALK, z, ry, { noShadow: true });
    ctx.colliders.push({ type: 'circle', x, z, r: 0.22 });
  };
  // outer edge of the ring road, arm reaching over the carriageway
  for (let s = 4; s < ring.pl.length; s += 17) {
    const p = ring.pl.at(s);
    const nx = p.tz * outSign, nz = -p.tx * outSign;
    const off = ROADS.ring.width / 2 + 0.6;
    place(p.x + nx * off, p.z + nz * off, -nx, -nz);
  }
  // avenue east side
  const av = D.roads.avenue;
  for (let s = 9; s < av.pl.length - 6; s += 16) {
    const p = av.pl.at(s);
    const nx = -p.tz, nz = p.tx; // right-hand normal (east for southbound)
    const off = ROADS.avenue.width / 2 + 0.6;
    place(p.x - nx * off, p.z - nz * off, nx, nz);
  }
}

// ---------------------------------------------------------------------------
// Realistic Full-Scale Municipal Roadside Stormwater Drainage:
//  - Heavy-duty twin-bay cast-iron slotted gully grates (1.24m × 0.40m) set inside
//    a 1.34m × 0.43m precast concrete catch-basin apron and paired with a recessed
//    curb-face side-inlet throat & concrete lintel hood flush with the 24cm kerb.
//  - Snapped directly to straight segments of `D.roadsClosed` so every grate sits
//    100% parallel and flush inside the 0.44m roadside gutter channel, clear of the
//    yellow road-edge line at -0.45m .. -0.58m.
//  - Full-size 0.96m municipal storm-sewer manhole covers offset from centerlines.
// ---------------------------------------------------------------------------
function drainage(ctx) {
  const { M, data: D } = ctx;

  // Full-size municipal twin-bay gutter grate & catch-basin parts
  // Local +z points toward the concrete curb face; local x is along the curb tangent.
  const apronGeo = boxGeo(1.34, 0.0045, 0.425, 1);
  const sumpGeo = boxGeo(1.16, 0.038, 0.33, 1);
  const frameLong = boxGeo(1.24, 0.012, 0.036, 1);
  const frameShort = boxGeo(0.042, 0.012, 0.40, 1);
  const centerTransom = boxGeo(0.048, 0.014, 0.36, 1);
  const grateSpine = boxGeo(1.18, 0.010, 0.028, 1);
  const grateBar = boxGeo(0.038, 0.012, 0.34, 1);

  // ---------------------------------------------------------------------------
  // Realistic Full 3D Curb Drainage Hole (Municipal Side-Inlet Scupper Opening):
  //  - Concrete Lintel Hood (Header beam bridging the top of the hole, flush with WALK)
  //  - Left & Right Concrete Abutment Cheeks (structural curb jamb returns)
  //  - Sloping Concrete Invert Sill (channeling gutter runoff downward into the mouth)
  //  - Deep Hollow Drainage Chamber Cavity (pitch-dark recessed sump pocket, 22cm deep)
  //  - Cast-Iron Mouth Flange Collar (framed iron throat lining)
  //  - Heavy Cast-Iron Debris Deflector Bars & Central Vane across the open mouth
  // ---------------------------------------------------------------------------
  const curbHoodGeo = boxGeo(1.04, 0.090, 0.28, 1);
  const curbCheekGeo = boxGeo(0.12, (WALK - G) + 0.004, 0.26, 1);
  const curbThroatCavityGeo = boxGeo(0.74, 0.140, 0.18, 1);
  const curbSillGeo = boxGeo(0.76, 0.018, 0.08, 1);
  const throatBarGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.74, 8);
  throatBarGeo.rotateZ(Math.PI * 0.5);
  const throatVaneGeo = boxGeo(0.022, 0.140, 0.045, 1);
  const throatIronLipGeo = boxGeo(0.76, 0.014, 0.032, 1);

  const placedDrains = [];
  const juncPts = JUNCTIONS.map((j) => {
    const mi = D.roads[j.minor], ma = D.roads[j.major];
    const ep = j.end === 'start' ? mi.pts[0] : mi.pts[mi.pts.length - 1];
    const p = ma.pl.at(ma.pl.project(ep[0], ep[1]));
    return [p.x, p.z, ma.width * 0.5 + 5.2];
  });
  const lamps = D.lamps || [];

  const isOnMainRoadCurb = (x, z) => {
    for (const name of ['ring', 'avenue', 'lane']) {
      const r = D.roads[name];
      if (!r) continue;
      const s = r.pl.project(x, z);
      if (!r.closed && (s < 4.5 || s > r.pl.length - 4.5)) continue;
      const p = r.pl.at(s);
      const dist = Math.hypot(p.x - x, p.z - z);
      if (Math.abs(dist - r.width * 0.5) < 0.055) return true;
    }
    return false;
  };

  const canPlaceGully = (kx, kz) => {
    if (!isOnMainRoadCurb(kx, kz)) return false;
    if (D.crossings.some((c) => Math.hypot(c.x - kx, c.z - kz) < c.width * 0.5 + 3.4)) return false;
    if (juncPts.some(([jx, jz, rad]) => Math.hypot(jx - kx, jz - kz) < rad)) return false;
    if (lamps.some(([lx, lz]) => Math.hypot(lx - kx, lz - kz) < 2.2)) return false;
    if (BUS_SHELTERS.some((b) => Math.hypot(b.x - kx, b.z - kz) < 4.8)) return false;
    if (placedDrains.some(([dx, dz]) => Math.hypot(dx - kx, dz - kz) < 14.0)) return false;
    return true;
  };

  const emitGullyAtCurb = (kx, kz, nx, nz) => {
    // Place grate center 21.5cm into the road from the curb base (off = -0.215m):
    // Grate (0.40m wide) spans -0.015m (curb side) to -0.415m (road side), nestled
    // inside the 0.44m concrete gutter sole and clear of the yellow edge line at -0.45m.
    const gx = kx - nx * 0.215;
    const gz = kz - nz * 0.215;
    placedDrains.push([kx, kz]);

    const ry = Math.atan2(nx, nz);
    const parent = new THREE.Matrix4().compose(
      new THREE.Vector3(gx, G, gz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
      new THREE.Vector3(1, 1, 1)
    );
    const addPart = (geo, mat, lx, ly, lz) =>
      ctx.batch.add(geo, mat, lx, ly, lz, 0, { parent, noShadow: true });

    // Concrete catch-basin apron + dark recessed sump + heavy cast-iron twin-bay frame
    addPart(apronGeo, M.concreteDark, 0, 0.0038, 0);
    addPart(sumpGeo, M.drainSump, 0, 0.0052, 0);
    addPart(frameLong, M.drainGrate, 0, 0.0072, -0.182);
    addPart(frameLong, M.drainGrate, 0, 0.0072, 0.182);
    addPart(frameShort, M.drainGrate, -0.599, 0.0072, 0);
    addPart(frameShort, M.drainGrate, 0.599, 0.0072, 0);
    addPart(centerTransom, M.drainIronRim, 0, 0.0080, 0);
    addPart(grateSpine, M.drainGrate, 0, 0.0068, -0.06);
    addPart(grateSpine, M.drainGrate, 0, 0.0068, 0.06);

    // 14 heavy cast-iron transverse bars across the left and right bays
    for (const baySign of [-1, 1]) {
      const bayCenter = baySign * 0.30;
      for (let i = -3; i <= 3; i++) {
        addPart(grateBar, M.drainIronRim, bayCenter + i * 0.076, 0.0084, 0);
      }
    }

    // ── Full 3D Curb Drainage Hole (Recessed Inlet Throat, Lintel Hood, Cheeks, Bars) ──
    // 1. Concrete Lintel Hood (Header beam bridging top of the opening, flush with WALK)
    addPart(curbHoodGeo, M.curb, 0, (WALK - G) - 0.045, 0.335);

    // 2. Concrete structural curb abutment cheeks on left and right framing the throat
    addPart(curbCheekGeo, M.curb, -0.42, (WALK - G) * 0.5, 0.335);
    addPart(curbCheekGeo, M.curb, 0.42, (WALK - G) * 0.5, 0.335);

    // 3. Deep recessed drainage chamber interior cavity (pitch-black 20cm deep pocket)
    addPart(curbThroatCavityGeo, M.drainSump, 0, 0.075, 0.370);

    // 4. Sloping gutter invert apron sill leading into the opening
    addPart(curbSillGeo, M.concreteDark, 0, 0.006, 0.175);

    // 5. Cast-iron mouth frame lips (top and bottom edges of the rectangular opening)
    addPart(throatIronLipGeo, M.drainGrate, 0, 0.144, 0.220);
    addPart(throatIronLipGeo, M.drainGrate, 0, 0.007, 0.215);

    // 6. Cast-iron protective debris guard bars across the mouth (horizontal rebar)
    addPart(throatBarGeo, M.drainIronRim, 0, 0.102, 0.225);
    addPart(throatBarGeo, M.drainIronRim, 0, 0.048, 0.225);

    // 7. Central vertical cast-iron support strut / divider vane
    addPart(throatVaneGeo, M.drainIronRim, 0, 0.075, 0.230);
  };

  // Walk the actual D.roadsClosed kerb rings by arc-length so every gully grate matches the 3D curb geometry 1:1
  const ex = toExPolys(D.roadsClosed || []);
  for (const { outer, holes } of ex) {
    for (const ring of [outer, ...holes]) {
      if (ring.length < 4) continue;
      const isHole = ring !== outer;
      const ccw = ringArea(ring) > 0;
      const rightIsOutside = (ccw && !isHole) || (!ccw && isHole);
      const pl = new Polyline(ring, true);
      if (pl.length < 10) continue;
      for (let s = 2.0; s < pl.length; s += 0.5) {
        const p0 = pl.at(s - 0.68);
        const p = pl.at(s);
        const p1 = pl.at(s + 0.68);
        // Require the 1.36m kerb span around the 1.24m twin-bay grate to be straight or gently curved
        const dot0 = p.tx * p0.tx + p.tz * p0.tz;
        const dot1 = p.tx * p1.tx + p.tz * p1.tz;
        if (dot0 < 0.996 || dot1 < 0.996) continue;

        let nx = p.tz, nz = -p.tx;
        if (!rightIsOutside) { nx = -nx; nz = -nz; }
        if (canPlaceGully(p.x, p.z)) {
          emitGullyAtCurb(p.x, p.z, nx, nz);
        }
      }
    }
  }

  // =========================================================================
  // Heavy-Duty Cast-Iron Municipal Storm-Sewer Manhole Cover:
  //  - Embedded chamfered cast-iron frame collar (eliminates flat paper-thin look)
  //  - Recessed dark seating pocket with deep annular perimeter shadow groove
  //  - Solid 3D cast-iron disc lid with authentic raised diamond/checker anti-skid lugs
  //  - Raised circular rim bead and central embossed medallion boss
  //  - Two real 3D recessed lifting pick slots (pry keyholes) with cast iron crossbars
  //  - Full shadow casting & receiving for tangible depth and physical realism
  // =========================================================================
  // 1. Heavy precast concrete outer frame collar embedded flush into pavement
  const frameCollarGeo = new THREE.CylinderGeometry(0.428, 0.452, 0.026, 32);
  // 2. Annular perimeter shadow seam ring in the gap between lid and frame collar (hollow center, NO overlapping disk)
  const seamRingGeo = new THREE.RingGeometry(0.380, 0.398, 32);
  seamRingGeo.rotateX(-Math.PI * 0.5);
  // 3. Solid heavy precast reinforced cement concrete disc lid
  const lidPlateGeo = new THREE.CylinderGeometry(0.380, 0.380, 0.022, 32);
  // 4. Outer raised rim lip ring
  const rimRingGeo = new THREE.TorusGeometry(0.354, 0.008, 8, 32);
  rimRingGeo.rotateX(Math.PI * 0.5);
  // 5. Middle concentric traction rib ring
  const midTractionRingGeo = new THREE.TorusGeometry(0.240, 0.007, 8, 32);
  midTractionRingGeo.rotateX(Math.PI * 0.5);
  // 6. Inner concentric traction rib ring
  const innerTractionRingGeo = new THREE.TorusGeometry(0.128, 0.006, 8, 28);
  innerTractionRingGeo.rotateX(Math.PI * 0.5);
  // 7. Central embossed boss medallion
  const centerBossGeo = new THREE.CylinderGeometry(0.058, 0.065, 0.008, 20);

  // 8. Molded cement anti-skid traction cleats / blocks
  const outerLugGeo = boxGeo(0.044, 0.007, 0.018, 1);
  const midLugGeo = boxGeo(0.036, 0.007, 0.016, 1);

  // 9. Two authentic recessed lifting pick slots (pry keyholes) with dark steel rebar pins
  const pickPocketGeo = boxGeo(0.062, 0.010, 0.024, 1);
  const pickBarGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.022, 6);
  pickBarGeo.rotateX(Math.PI * 0.5);

  const manholeSpots = [
    [6.35, 12.0, G],
    [-26.0, -9.2, G],
    [25.0, -9.2, G],
    [13.5, -16.2, WALK],
    [43.2, 6.0, WALK],
  ];

  for (const [mx, mz, my] of manholeSpots) {
    // Precast concrete outer frame collar embedded flush into pavement
    ctx.batch.add(frameCollarGeo, M.cementManholeDark, mx, my + 0.011, mz, 0);
    // Dark recessed perimeter seating gap & expansion seam (annular ring, zero overlap with lid)
    ctx.batch.add(seamRingGeo, M.drainSump, mx, my + 0.013, mz, 0);
    // Solid heavy precast reinforced cement concrete disc lid
    ctx.batch.add(lidPlateGeo, M.cementManhole, mx, my + 0.013, mz, 0);

    // Raised cement rim bead and concentric molded traction rings (sit cleanly on top of lid)
    ctx.batch.add(rimRingGeo, M.cementManholeDark, mx, my + 0.0245, mz, 0);
    ctx.batch.add(midTractionRingGeo, M.cementManholeDark, mx, my + 0.0245, mz, 0);
    ctx.batch.add(innerTractionRingGeo, M.cementManholeDark, mx, my + 0.0245, mz, 0);
    ctx.batch.add(centerBossGeo, M.cementManholeDark, mx, my + 0.025, mz, 0);

    // 16 outer radial molded cement traction cleats
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.35;
      const lx = mx + Math.cos(a) * 0.298;
      const lz = mz + Math.sin(a) * 0.298;
      ctx.batch.add(outerLugGeo, M.cementManhole, lx, my + 0.025, lz, -a);
    }

    // 12 middle radial molded cement traction cleats
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.35 + Math.PI / 12;
      const lx = mx + Math.cos(a) * 0.184;
      const lz = mz + Math.sin(a) * 0.184;
      ctx.batch.add(midLugGeo, M.cementManhole, lx, my + 0.025, lz, -a);
    }

    // Two authentic recessed lifting pick holes (pry keyholes) with dark steel rebar pins
    for (const side of [-1, 1]) {
      const a = 0.35 + (side > 0 ? 0 : Math.PI);
      const px = mx + Math.cos(a) * 0.208;
      const pz = mz + Math.sin(a) * 0.208;
      ctx.batch.add(pickPocketGeo, M.drainSump, px, my + 0.023, pz, -a);
      ctx.batch.add(pickBarGeo, M.metalDark, px, my + 0.025, pz, -a);
    }
  }
}

// ---------------------------------------------------------------------------
// Natural Coastal Overhead Powerline Network:
//  - Tapered concrete/steel utility poles along roadside verges (ring, avenue, lane)
//  - Galvanized steel crossarms, diagonal V-braces, and glazed ceramic pin insulators
//  - Pole-mounted distribution transformers & corner stay/guy wires with yellow guards
//  - Multi-conductor 3D catenary wire spans + slack service drops to buildings
// ---------------------------------------------------------------------------
function powerLines(ctx) {
  const { M, data: D } = ctx;
  const POLE_H = 7.45;
  const UPPER_Y = POLE_H - 0.32; // 7.13m above WALK
  const LOWER_Y = POLE_H - 1.18; // 6.27m above WALK
  const UPPER_OFFS = [-0.62, 0.0, 0.62];
  const LOWER_OFFS = [-0.38, 0.38];

  // Reusable pole hardware geometries
  const poleShaft = new THREE.CylinderGeometry(0.072, 0.128, POLE_H, 8);
  poleShaft.translate(0, POLE_H * 0.5, 0);
  const polePlinth = new THREE.CylinderGeometry(0.165, 0.19, 0.42, 8);
  polePlinth.translate(0, 0.21, 0);
  const poleCap = new THREE.CylinderGeometry(0.04, 0.076, 0.12, 8);
  poleCap.translate(0, POLE_H + 0.06, 0);
  const upperArm = boxGeo(1.48, 0.075, 0.075, 1);
  upperArm.translate(0, UPPER_Y, 0);
  const lowerArm = boxGeo(0.96, 0.065, 0.065, 1);
  lowerArm.translate(0, LOWER_Y, 0);
  const insPin = new THREE.CylinderGeometry(0.036, 0.046, 0.14, 7);
  const insSkirt = new THREE.CylinderGeometry(0.056, 0.032, 0.055, 7);

  // Check whether a candidate verge point (x, z) is clear of roads, crossings, paths,lamps, and buildings
  const pathSegs = PATHS.flatMap((p) => p.pts.slice(0, -1).map((a, i) => [a, p.pts[i + 1], p.w * 0.5 + 0.85]));
  const segDist = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
  };
  const isPoleClear = (x, z) => {
    if (!pointInPolys(x, z, D.plate)) return false;
    if (pointInPolys(x, z, D.roadsClosed)) return false;
    if (D.crossings.some((c) => Math.hypot(c.x - x, c.z - z) < c.width * 0.5 + 2.6)) return false;
    if ((D.lamps || []).some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 2.5)) return false;
    if ((D.palmSpots || []).some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.2)) return false;
    if (BUS_SHELTERS.some((b) => Math.hypot(b.x - x, b.z - z) < 4.2)) return false;
    if ((D.footprints || []).some((poly) => pointInPolys(x, z, [poly]))) return false;
    if (pathSegs.some(([a, b, d]) => segDist(x, z, a, b) < d)) return false;
    // Keep utility poles & wires away from the North Main Junction traffic signal validation area
    if (Math.hypot(x - 5.0, z - (-10.5)) < 17.5) return false;
    return true;
  };

  // Find a valid verge position near station s0 along road `r` on side `sideSign` (+1 or -1)
  const sampleRoadPole = (r, s0, sideSign, offset) => {
    for (const ds of [0, 1.8, -1.8, 3.4, -3.4, 5.0, -5.0]) {
      const s = r.closed ? (s0 + ds + r.pl.length) % r.pl.length : Math.max(2.5, Math.min(r.pl.length - 2.5, s0 + ds));
      const p = r.pl.at(s);
      const nx = -p.tz * sideSign, nz = p.tx * sideSign;
      const x = p.x + nx * offset, z = p.z + nz * offset;
      if (isPoleClear(x, z)) return { x, z, tx: p.tx, tz: p.tz, s };
    }
    return null;
  };

  const poles = [];
  const addPoleNode = (pt, tag = '') => {
    if (!pt) return -1;
    // Reuse existing pole if already very close
    const existing = poles.findIndex((q) => Math.hypot(q.x - pt.x, q.z - pt.z) < 4.5);
    if (existing >= 0) return existing;
    const idx = poles.length;
    poles.push({ ...pt, id: idx, tag, deg: 0, dirs: [] });
    return idx;
  };

  // 1. Ring road inner verge feeder loop (runs along the inner sidewalk verge, opposite outer streetlamps)
  const ring = D.roads.ring;
  const ringOutSign = ringArea(ring.pts) > 0 ? 1 : -1;
  // Inner normal of ring road:
  // In sampleRoadPole, nx = -p.tz * sideSign, nz = p.tx * sideSign.
  // Outer normal is (p.tz * ringOutSign, -p.tx * ringOutSign), so inner normal has sideSign = ringOutSign!
  const ringIds = [];
  const ringStep = ring.pl.length / 10;
  for (let i = 0; i < 10; i++) {
    const pt = sampleRoadPole(ring, i * ringStep + 3.0, ringOutSign, ROADS.ring.width * 0.5 + 0.78);
    const id = addPoleNode(pt, i === 1 ? 'transformer' : 'ring');
    if (id >= 0) ringIds.push(id);
  }

  // 2. Avenue west-verge feeder branch (connects north ring feeder across the island to south ring feeder)
  const av = D.roads.avenue;
  const avIds = [];
  for (const s of [8.2, 18.5, 27.2]) {
    // West side of southbound avenue: p.tx=0, p.tz=1 -> (-p.tz, p.tx) = (-1, 0) = West -> sideSign = +1
    const pt = sampleRoadPole(av, s, 1, ROADS.avenue.width * 0.5 + 0.78);
    const id = addPoleNode(pt, 'avenue');
    if (id >= 0) avIds.push(id);
  }

  // 3. Lane verge branch feeder (past Graffiti block & Shop kiosk to south-west ring)
  const ln = D.roads.lane;
  const laneIds = [];
  for (let i = 0; i < 3; i++) {
    const s = 9.0 + i * 9.2;
    const pt = sampleRoadPole(ln, s, -1, ROADS.lane.width * 0.5 + 0.76);
    const id = addPoleNode(pt, i === 1 ? 'transformer' : 'lane');
    if (id >= 0) laneIds.push(id);
  }

  // 4. Outer east feeder spur to serve the Cafe on the east terrace
  const cafePoleId = addPoleNode({ x: 41.2, z: -2.2, tx: 0, tz: 1 }, 'cafeSpur');

  // Helper to find closest pole in a subset to a world point
  const closestPole = (ids, x, z) => {
    let best = -1, bestD = Infinity;
    for (const id of ids) {
      const d = Math.hypot(poles[id].x - x, poles[id].z - z);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  };

  // Build span edges between poles
  const spans = [];
  const link = (a, b) => {
    if (a < 0 || b < 0 || a === b) return;
    if (spans.some(([u, v]) => (u === a && v === b) || (u === b && v === a))) return;
    // Never string overhead wires across the North Main Junction validation zone
    if (segDist(5.0, -10.5, [poles[a].x, poles[a].z], [poles[b].x, poles[b].z]) < 15.0) return;
    spans.push([a, b]);
    const dx = poles[b].x - poles[a].x, dz = poles[b].z - poles[a].z;
    const l = Math.hypot(dx, dz) || 1;
    poles[a].dirs.push([dx / l, dz / l]);
    poles[b].dirs.push([-dx / l, -dz / l]);
  };

  for (let i = 0; i < ringIds.length; i++) {
    link(ringIds[i], ringIds[(i + 1) % ringIds.length]);
  }
  if (avIds.length) {
    const northRingId = closestPole(ringIds, poles[avIds[0]].x, poles[avIds[0]].z);
    const southRingId = closestPole(ringIds, poles[avIds[avIds.length - 1]].x, poles[avIds[avIds.length - 1]].z);
    link(northRingId, avIds[0]);
    for (let i = 0; i < avIds.length - 1; i++) link(avIds[i], avIds[i + 1]);
    link(avIds[avIds.length - 1], southRingId);
  }
  if (laneIds.length) {
    const startAnchor = closestPole(avIds.length ? avIds : ringIds, poles[laneIds[0]].x, poles[laneIds[0]].z);
    const endAnchor = closestPole(ringIds, poles[laneIds[laneIds.length - 1]].x, poles[laneIds[laneIds.length - 1]].z);
    link(startAnchor, laneIds[0]);
    for (let i = 0; i < laneIds.length - 1; i++) link(laneIds[i], laneIds[i + 1]);
    link(laneIds[laneIds.length - 1], endAnchor);
  }
  if (cafePoleId >= 0 && ringIds.length) {
    link(closestPole(ringIds, poles[cafePoleId].x, poles[cafePoleId].z), cafePoleId);
  }

  // Compute each pole's crossarm yaw (perpendicular to the average conductor run direction)
  for (const p of poles) {
    if (p.dirs.length === 1) {
      p.fx = p.dirs[0][0];
      p.fz = p.dirs[0][1];
    } else if (p.dirs.length >= 2) {
      // Align tangent along the main through-line (d0 - d1)
      let tx = p.dirs[0][0] - p.dirs[1][0], tz = p.dirs[0][1] - p.dirs[1][1];
      const l = Math.hypot(tx, tz);
      if (l > 0.15) {
        p.fx = tx / l; p.fz = tz / l;
      } else {
        p.fx = p.dirs[0][0]; p.fz = p.dirs[0][1];
      }
    } else {
      p.fx = p.tx || 1;
      p.fz = p.tz || 0;
    }
    // Crossarm local +X axis is (rz, -rx) where ry = atan2(fx, fz):
    // In THREE Euler Y rotation by ry = atan2(fx, fz):
    // local (1, 0, 0) -> world (cos(ry), 0, -sin(ry)) = (fz, 0, -fx)
    // local (0, 0, 1) -> world (sin(ry), 0,  cos(ry)) = (fx, 0,  fz)
    p.ry = Math.atan2(p.fx, p.fz);
    p.armX = p.fz;
    p.armZ = -p.fx;
  }

  // Instantiate utility poles, crossarms, insulators, transformers, and guy wires
  D.powerPoles = poles.map((p) => [p.x, p.z]);
  for (const p of poles) {
    const parent = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, WALK, p.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.ry),
      new THREE.Vector3(1, 1, 1)
    );
    const addP = (geo, mat, lx = 0, ly = 0, lz = 0, opts = {}) =>
      ctx.batch.add(geo, mat, lx, ly, lz, 0, { ...opts, parent });

    addP(polePlinth, M.curb);
    addP(poleShaft, M.powerPole);
    addP(poleCap, M.metalDark);
    addP(upperArm, M.metalDark);
    addP(lowerArm, M.metalDark);

    for (const ox of UPPER_OFFS) {
      addP(insPin, M.metalDark, ox, UPPER_Y + 0.08, 0);
      addP(insSkirt, M.insulator, ox, UPPER_Y + 0.13, 0);
    }
    for (const ox of LOWER_OFFS) {
      addP(insPin, M.metalDark, ox, LOWER_Y + 0.07, 0);
      addP(insSkirt, M.insulator, ox, LOWER_Y + 0.11, 0);
    }

    // Pole-mounted distribution transformer + HV bushings + junction cabinet + riser conduit on key feeder poles
    if (p.tag === 'transformer') {
      addP(boxGeo(0.58, 0.78, 0.46, 1), M.transformer, 0, 4.55, -0.34);
      // Cooling fins on sides of transformer tank
      for (const sx of [-0.31, 0.31]) {
        addP(boxGeo(0.04, 0.64, 0.36, 1), M.metalDark, sx, 4.55, -0.34);
      }
      // 3 HV porcelain bushings on top of transformer
      for (const bx of [-0.16, 0, 0.16]) {
        addP(insSkirt, M.insulator, bx, 5.02, -0.38);
      }
      // Lower distribution switch/meter box + vertical steel conduit pipe
      addP(boxGeo(0.32, 0.48, 0.18, 1), M.steel, 0, 1.85, -0.18);
      const conduit = new THREE.CylinderGeometry(0.022, 0.022, 4.6, 6);
      addP(conduit, M.metalDark, 0.09, 3.8, -0.13);
    }

    ctx.colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.20 });
  }

  // Build a single merged 3D tubular mesh for all catenary conductor spans and building service drops
  const wirePos = [], wireNor = [], wireUv = [], wireIdx = [];
  const addCatenaryTube = (p0, p1, sag, radius = 0.019, segs = 8) => {
    const sides = 4;
    const baseV = wirePos.length / 3;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // Parabolic/catenary gravity sag: 4 * t * (1 - t) peaks at t = 0.5
      const s = 4.0 * t * (1.0 - t) * sag;
      pts.push([
        p0[0] + (p1[0] - p0[0]) * t,
        p0[1] + (p1[1] - p0[1]) * t - s,
        p0[2] + (p1[2] - p0[2]) * t,
      ]);
    }
    for (let i = 0; i <= segs; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(segs, i + 1)];
      let tx = next[0] - prev[0], ty = next[1] - prev[1], tz = next[2] - prev[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      // Orthonormal frame (rx, ry, rz) and (ux, uy, uz) perpendicular to tangent
      let rx = -tz, ry = 0, rz = tx;
      const rl = Math.hypot(rx, rz) || 1;
      rx /= rl; rz /= rl;
      const ux = ty * rz - tz * ry;
      const uy = tz * rx - tx * rz;
      const uz = tx * ry - ty * rx;

      const P = pts[i];
      for (let c = 0; c < sides; c++) {
        const ang = (c / sides) * Math.PI * 2 + Math.PI * 0.25;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const nx = rx * ca + ux * sa;
        const ny = ry * ca + uy * sa;
        const nz = rz * ca + uz * sa;
        wirePos.push(P[0] + nx * radius, P[1] + ny * radius, P[2] + nz * radius);
        wireNor.push(nx, ny, nz);
        wireUv.push(i / segs, c / sides);
      }
    }
    for (let i = 0; i < segs; i++) {
      const r0 = baseV + i * sides;
      const r1 = r0 + sides;
      for (let c = 0; c < sides; c++) {
        const c1 = (c + 1) % sides;
        wireIdx.push(r0 + c, r1 + c, r1 + c1, r0 + c, r1 + c1, r0 + c1);
      }
    }
  };

  // Emit 3 upper phase conductors + 2 lower secondary conductors for every pole-to-pole span
  for (const [ia, ib] of spans) {
    const A = poles[ia], B = poles[ib];
    const dist = Math.hypot(B.x - A.x, B.z - A.z);
    // Align wire attachment order so conductors never cross in mid-span
    const dotArm = A.armX * B.armX + A.armZ * B.armZ;
    const flipB = dotArm < 0 ? -1 : 1;
    const baseSag = Math.min(0.78, 0.14 + dist * 0.024);

    for (let k = 0; k < UPPER_OFFS.length; k++) {
      const oa = UPPER_OFFS[k], ob = UPPER_OFFS[k] * flipB;
      const p0 = [A.x + A.armX * oa, WALK + UPPER_Y + 0.16, A.z + A.armZ * oa];
      const p1 = [B.x + B.armX * ob, WALK + UPPER_Y + 0.16, B.z + B.armZ * ob];
      addCatenaryTube(p0, p1, baseSag + (k === 1 ? -0.03 : 0.02), 0.019, 8);
    }
    for (let k = 0; k < LOWER_OFFS.length; k++) {
      const oa = LOWER_OFFS[k], ob = LOWER_OFFS[k] * flipB;
      const p0 = [A.x + A.armX * oa, WALK + LOWER_Y + 0.14, A.z + A.armZ * oa];
      const p1 = [B.x + B.armX * ob, WALK + LOWER_Y + 0.14, B.z + B.armZ * ob];
      addCatenaryTube(p0, p1, baseSag * 0.92 + k * 0.03, 0.016, 7);
    }
  }

  // Emit natural overhead building service-drop cables + wall weatherhead brackets
  const allPoleIds = poles.map((_, i) => i);
  const serviceTargets = [
    // Apartment south-east facade weatherhead bracket
    { x: APARTMENT.x + APARTMENT.w * 0.5 - 1.2, y: WALK + 5.2, z: APARTMENT.z + APARTMENT.d * 0.5 + 0.08, nx: 0, nz: 1 },
    // Graffiti building east facade near entrance canopy
    { x: GRAFFITI.x + GRAFFITI.w * 0.5 + 0.08, y: WALK + 5.0, z: GRAFFITI.z - 2.2, nx: 1, nz: 0 },
    // Shop kiosk rear fascia post
    { x: SHOP.x - 4.1, y: WALK + 3.05, z: SHOP.z - 1.4, nx: -1, nz: 0 },
    // Cafe west facade near roof parapet
    { x: CAFE.x - CAFE.w * 0.5 - 0.08, y: WALK + 4.35, z: CAFE.z - 3.6, nx: -1, nz: 0 },
  ];
  const bracketGeo = boxGeo(0.16, 0.12, 0.22, 1);
  for (const tgt of serviceTargets) {
    const pid = closestPole(allPoleIds, tgt.x, tgt.z);
    if (pid < 0) continue;
    const P = poles[pid];
    const dist = Math.hypot(P.x - tgt.x, P.z - tgt.z);
    if (dist > 32) continue;
    // Wall-mounted insulator bracket
    const ry = Math.atan2(tgt.nx, tgt.nz);
    ctx.batch.add(bracketGeo, M.metalDark, tgt.x + tgt.nx * 0.08, tgt.y, tgt.z + tgt.nz * 0.08, ry);
    ctx.batch.add(insSkirt, M.insulator, tgt.x + tgt.nx * 0.16, tgt.y + 0.08, tgt.z + tgt.nz * 0.16);
    // Twin twisted service drop cable from the pole's lower service rack
    const sag = Math.min(0.68, 0.22 + dist * 0.025);
    addCatenaryTube(
      [P.x + P.armX * 0.22, WALK + LOWER_Y + 0.12, P.z + P.armZ * 0.22],
      [tgt.x + tgt.nx * 0.16, tgt.y + 0.10, tgt.z + tgt.nz * 0.16],
      sag,
      0.015,
      7
    );
  }

  if (wirePos.length) {
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePos, 3));
    wGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wireNor, 3));
    wGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wireUv, 2));
    wGeo.setIndex(wireIdx);
    wGeo.computeBoundingSphere();
    const wMesh = new THREE.Mesh(wGeo, M.powerWire);
    wMesh.castShadow = false;
    wMesh.receiveShadow = true;
    wMesh.matrixAutoUpdate = false;
    ctx.scene.add(wMesh);
  }
}

function benches(ctx) {
  const { M, data: D } = ctx;
  if (!ctx.seats) ctx.seats = [];
  const pl = D.outlinePL;
  const outSign = ringArea(D.outline) > 0 ? 1 : -1;
  const spots = [[-40, 37], [-20, 41], [12, 42.5], [-60, 0], [-56, -28], [56, 20], [-5, -50], [40, -44]];
  for (const [tx, tz] of spots) {
    const s = pl.project(tx, tz);
    const p = pl.at(s);
    const nx = p.tz * outSign, nz = -p.tx * outSign;
    const x = p.x - nx * 1.0, z = p.z - nz * 1.0;
    if (D.palmSpots.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.2)) continue;
    const ry = Math.atan2(nx, nz);   // seat faces the sea
    ctx.batch.add(boxGeo(1.8, 0.08, 0.45, 1), M.wood, x, WALK + 0.45, z, ry);
    ctx.batch.add(boxGeo(1.8, 0.4, 0.06, 1), M.wood, x - nx * 0.22, WALK + 0.72, z - nz * 0.22, ry);
    for (const sx of [-0.75, 0.75]) {
      ctx.batch.add(boxGeo(0.06, 0.45, 0.45, 1), M.metalDark, x + nz * sx, WALK + 0.22, z - nx * sx, ry);
    }
    ctx.seats.push({ x, y: WALK, z, heading: ry, isBench: true });
    ctx.colliders.push({ type: 'box', x, z, hw: 0.95, hd: 0.3, rot: ry });
  }
}

function beach(ctx) {
  const { M, data: D } = ctx;
  D.beachKeepOut = [];   // umbrella + lounger sets: rocks, pebbles and footprints stay clear
  for (const [x, z] of [[-21, 46.5], [-13, 48], [-4, 46.8]]) {
    D.beachKeepOut.push([x, z + 0.6, 2.3]);
    const y = beachHeight(x, z);
    ctx.batch.add(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 6), M.metalDark, x, y + 1.25, z);
    const cone = new THREE.ConeGeometry(1.5, 0.55, 12, 1, true);
    ctx.batch.add(cone, M.umbrellaBlue, x, y + 2.4, z);
    ctx.batch.add(new THREE.ConeGeometry(0.55, 0.22, 12, 1, true), M.umbrellaWhite, x, y + 2.62, z);
    ctx.colliders.push({ type: 'circle', x, z, r: 0.2 });
    for (const dx of [-0.9, 0.9]) {
      const lx = x + dx, lz = z + 1.2;
      const ly = beachHeight(lx, lz);
      ctx.batch.add(boxGeo(0.65, 0.08, 1.9, 1), M.whitePaint, lx, ly + 0.3, lz, 0, { rx: -0.08 });
      ctx.batch.add(boxGeo(0.65, 0.08, 0.7, 1), M.whitePaint, lx, ly + 0.55, lz - 0.85, 0, { rx: 0.9 });
      ctx.colliders.push({ type: 'box', x: lx, z: lz, hw: 0.35, hd: 1.0, rot: 0 });
    }
  }
}

// ---------------------------------------------------------------------------
// Sculpted marine hull & multi-part vessel builders
// ---------------------------------------------------------------------------
function hullGeometry(len, h, w, deadrise = 0.22, bowLiftAmt = 0.34) {
  const g = new THREE.BoxGeometry(len, h, w, 10, 3, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = x / (len / 2);                      // -1 stern .. +1 bow
    const zNorm = Math.abs(z) / (w / 2);          // 0 keel centerline .. 1 chine
    // Taper bow cleanly into a sharp V-stem; slight transom taper aft
    let k = t > 0.15
      ? 1 - Math.pow((t - 0.15) / 0.85, 1.65) * 0.96
      : (t < -0.7 ? 1 - Math.pow((-0.7 - t) / 0.3, 1.4) * 0.08 : 1);
    // Hull flare: upper gunwale flares outward near bow to deflect spray
    if (y > 0 && t > 0.1) k *= 1 + (t - 0.1) * 0.16;
    if (y < 0) k *= 0.68 + 0.12 * (1 - Math.max(0, t));
    // V-bottom deadrise along the keel
    const vDrop = y < 0 ? (1 - zNorm) * deadrise * (1 - Math.max(0, t) * 0.35) : 0;
    const bowLift = t > 0.25 ? Math.pow((t - 0.25) / 0.75, 1.45) * bowLiftAmt : (t < -0.5 ? (-0.5 - t) * 0.06 : 0);
    p.setXYZ(i, x, y + bowLift - vDrop, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function makeBoat(ctx, kind) {
  const { M } = ctx;
  const g = new THREE.Group();
  const boatBatch = new Batch();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    boatBatch.add(geo, mat, x, y, z, ry, { rx, rz });
  };
  if (kind === 'ferry') {
    // Primary sculpted displacement hull + blue sheer strake + dark rubber fender belt
    add(hullGeometry(9.6, 1.18, 3.25, 0.24, 0.36), M.hullWhite, 0, 0.34, 0);
    add(hullGeometry(9.72, 0.26, 3.32, 0.05, 0.36), M.hullBlue, 0, 0.76, 0);
    add(hullGeometry(9.78, 0.10, 3.36, 0.02, 0.36), M.metalDark, 0, 0.62, 0);
    // Recessed fore & aft wooden passenger decks
    add(boxGeo(8.2, 0.08, 2.75, 1), M.wood, -0.2, 0.90, 0);
    // Main passenger cabin superstructure + wrap-around dark glass windows
    add(boxGeo(5.5, 1.45, 2.65, 1), M.hullWhite, -0.55, 1.66, 0);
    add(boxGeo(5.62, 0.56, 2.72, 1), M.darkGlass, -0.55, 1.92, 0);
    // Raised wheelhouse forward + upper shade canopy roof
    add(boxGeo(1.65, 0.45, 2.1, 1), M.hullWhite, 1.55, 2.38, 0);
    add(boxGeo(1.72, 0.28, 2.16, 1), M.darkGlass, 1.55, 2.42, 0);
    add(boxGeo(6.7, 0.14, 3.15, 1), M.blueRoof, -0.35, 2.64, 0);
    // Radar dome, mast & orange lifebuoys on cabin sides
    add(new THREE.CylinderGeometry(0.32, 0.36, 0.22, 10), M.whitePaint, 1.5, 2.82, 0);
    add(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 6), M.steel, 1.85, 3.15, 0);
    for (const sz of [-1.38, 1.38]) {
      const ring = new THREE.TorusGeometry(0.24, 0.065, 8, 14);
      ring.rotateX(Math.PI / 2);
      add(ring, M.buoy, -1.6, 1.45, sz);
    }
  } else if (kind === 'skiff') {
    // Light coastal utility skiff with flared bow, wooden thwarts, and stern outboard
    add(hullGeometry(5.1, 0.68, 1.74, 0.18, 0.32), M.hullWhite, 0, 0.22, 0);
    add(hullGeometry(5.18, 0.14, 1.80, 0.04, 0.32), M.hullBlue, 0, 0.48, 0);
    add(boxGeo(3.6, 0.06, 1.35, 1), M.woodDark, -0.15, 0.26, 0);
    for (const bx of [-1.25, -0.1, 0.95]) {
      add(boxGeo(0.38, 0.07, 1.42, 1), M.wood, bx, 0.42, 0);
    }
    add(boxGeo(0.75, 0.46, 1.15, 1), M.darkGlass, 0.75, 0.72, 0, 0, 0, 0.28);
    // Stern outboard motor + tiller
    add(boxGeo(0.38, 0.42, 0.28, 1), M.metalDark, -2.58, 0.56, 0);
    add(boxGeo(0.14, 0.55, 0.12, 1), M.metalDark, -2.62, 0.18, 0, 0, 0, -0.15);
  } else {
    // Offshore deep-V planing speedboat (length ~6.2m, beam ~2.2m)
    add(hullGeometry(6.2, 0.82, 2.18, 0.28, 0.38), M.hullWhite, 0, 0.26, 0);
    add(hullGeometry(6.28, 0.18, 2.24, 0.06, 0.38), M.hullRed, 0, 0.56, 0);
    add(hullGeometry(6.32, 0.07, 2.28, 0.02, 0.38), M.metalDark, 0, 0.66, 0);
    // Foredeck + teak cockpit sole + aft sunpad
    add(hullGeometry(2.4, 0.14, 1.85, 0.0, 0.18), M.whitePaint, 1.65, 0.70, 0);
    add(boxGeo(2.8, 0.08, 1.68, 1), M.wood, -0.45, 0.38, 0);
    add(boxGeo(1.25, 0.24, 1.76, 1), M.whitePaint, -1.85, 0.68, 0);
    add(boxGeo(1.18, 0.07, 1.66, 1), M.hullRed, -1.85, 0.81, 0);
    // Raked wraparound tinted windshield
    add(boxGeo(1.35, 0.48, 1.72, 1), M.darkGlass, 0.48, 0.88, 0, 0, 0, 0.34);
    add(boxGeo(1.38, 0.06, 1.76, 1), M.steel, 0.42, 1.11, 0, 0, 0, 0.34);
    // Twin helm & companion bolster seats
    for (const sz of [-0.46, 0.46]) {
      add(boxGeo(0.46, 0.52, 0.48, 1), M.whitePaint, -0.22, 0.66, sz);
      add(boxGeo(0.12, 0.54, 0.46, 1), M.hullRed, -0.42, 0.70, sz);
    }
    // Twin high-output stern outboard engines
    for (const sz of [-0.38, 0.38]) {
      add(boxGeo(0.52, 0.48, 0.32, 1), M.whitePaint, -3.12, 0.66, sz, 0, 0, -0.12);
      add(boxGeo(0.54, 0.14, 0.33, 1), M.hullRed, -3.12, 0.76, sz, 0, 0, -0.12);
      add(boxGeo(0.22, 0.62, 0.12, 1), M.metalDark, -3.18, 0.20, sz, 0, 0, -0.18);
    }
  }
  const meshes = boatBatch.build(g);
  for (const m of meshes) m.matrixAutoUpdate = true;
  return g;
}

// ---------------------------------------------------------------------------
// Analytical offshore cruising trajectory (shared by JS boat physics + GPU
// curved Kelvin wake mesh + GPU 3D ballistic spray shader so zero vertex
// buffers need to be re-uploaded from the CPU each frame).
// ---------------------------------------------------------------------------
const BOAT_TAU_RATE = 0.112; // rad/s (~5.0 m/s scale planing speed)

function sampleBoatPath(tau) {
  const c1 = Math.cos(tau), s1 = Math.sin(tau);
  const c2 = Math.cos(tau * 2.0), s2 = Math.sin(tau * 2.0);
  const x = 106.0 + c1 * 34.0 + s2 * 4.2;
  const z = 5.0 + s1 * 50.0;
  // Derivatives w.r.t. tau
  const dx = -s1 * 34.0 + c2 * 8.4;
  const dz = c1 * 50.0;
  const ddx = -c1 * 34.0 - s2 * 16.8;
  const ddz = -s1 * 50.0;
  const ds = Math.hypot(dx, dz) || 1;
  const fwdX = dx / ds, fwdZ = dz / ds;
  // Right-hand (starboard) unit vector in world XZ
  const rightX = -fwdZ, rightZ = fwdX;
  // 2nd-order trajectory curvature (1/m): positive when turning toward starboard
  const curvature = 0.5 * (ddx * rightX + ddz * rightZ) / (ds * ds);
  const speed = ds * BOAT_TAU_RATE;
  const ry = Math.atan2(-dz, dx);
  return { x, z, fwdX, fwdZ, rightX, rightZ, curvature, speed, ds, ry };
}

// ---------------------------------------------------------------------------
// 1. GPU-Curved 3D Kelvin Wake Ribbon + Moored Hull Waterline Foam Collars
// ---------------------------------------------------------------------------
function buildWakeAndCollars(scene, coastT, fog, mooredHulls) {
  // Part A: 68 x 22 high-density ribbon for the cruising speedboat wake
  // Part B: 28 x 3 elliptical waterline collars around moored boats & buoys
  const segU = 68, segV = 22;
  const wakeVerts = (segU + 1) * (segV + 1);
  const collarSegU = 28, collarSegV = 2;
  const collarVertsPerHull = (collarSegU + 1) * (collarSegV + 1);
  const totalVerts = wakeVerts + mooredHulls.length * collarVertsPerHull;

  const pos = new Float32Array(totalVerts * 3);
  const uvAttr = new Float32Array(totalVerts * 2);
  const metaAttr = new Float32Array(totalVerts * 4); // x=kind(0 wake, 1 collar), y=rot/phase, z=halfL, w=halfB
  const indices = [];

  let vPtr = 0;
  // Populate Part A: cruising wake ribbon
  for (let iu = 0; iu <= segU; iu++) {
    const u = iu / segU;
    for (let iv = 0; iv <= segV; iv++) {
      const v = (iv / segV) * 2 - 1; // -1 port .. +1 starboard
      pos[vPtr * 3] = 106;
      pos[vPtr * 3 + 1] = 0;
      pos[vPtr * 3 + 2] = 5;
      uvAttr[vPtr * 2] = u;
      uvAttr[vPtr * 2 + 1] = v;
      metaAttr[vPtr * 4] = 0.0;
      metaAttr[vPtr * 4 + 1] = 0.0;
      metaAttr[vPtr * 4 + 2] = 0.0;
      metaAttr[vPtr * 4 + 3] = 0.0;
      vPtr++;
    }
  }
  for (let iu = 0; iu < segU; iu++) {
    for (let iv = 0; iv < segV; iv++) {
      const a = iu * (segV + 1) + iv;
      const b = a + 1;
      const c = a + (segV + 1);
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  // Populate Part B: moored hull waterline foam collars
  for (let hIdx = 0; hIdx < mooredHulls.length; hIdx++) {
    const h = mooredHulls[hIdx];
    const baseV = vPtr;
    const cR = Math.cos(h.rot), sR = Math.sin(h.rot);
    for (let iu = 0; iu <= collarSegU; iu++) {
      const u = iu / collarSegU;
      const ang = u * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (let iv = 0; iv <= collarSegV; iv++) {
        const v = iv / collarSegV; // 0 inner hull waterline .. 1 outer feather
        const rx = h.halfL * (0.88 + v * 0.55);
        const rz = h.halfB * (0.88 + v * 0.85);
        const lx = ca * rx, lz = sa * rz;
        const wx = h.x + lx * cR + lz * sR;
        const wz = h.z - lx * sR + lz * cR;
        pos[vPtr * 3] = wx;
        pos[vPtr * 3 + 1] = 0;
        pos[vPtr * 3 + 2] = wz;
        uvAttr[vPtr * 2] = u;
        uvAttr[vPtr * 2 + 1] = v;
        metaAttr[vPtr * 4] = 1.0;
        metaAttr[vPtr * 4 + 1] = h.phase;
        metaAttr[vPtr * 4 + 2] = h.halfL;
        metaAttr[vPtr * 4 + 3] = h.halfB;
        vPtr++;
      }
    }
    for (let iu = 0; iu < collarSegU; iu++) {
      for (let iv = 0; iv < collarSegV; iv++) {
        const a = baseV + iu * (collarSegV + 1) + iv;
        const b = a + 1;
        const c = a + (collarSegV + 1);
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvAttr, 2));
  geo.setAttribute('aMeta', new THREE.BufferAttribute(metaAttr, 4));
  geo.setIndex(indices);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...coastUniforms,
      uWaterN: { value: coastT.waterN },
      uFogCol: { value: fog.color },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    vertexShader: /* glsl */`
      ${COAST_GLSL}
      attribute vec4 aMeta;
      varying vec2 vWakeUv;
      varying vec3 vWPos;
      varying vec2 vFwd;
      varying float vKind;
      varying float vCrest;

      void main() {
        vWakeUv = uv;
        vKind = aMeta.x;
        vec3 wp = position;
        float crestLift = 0.0;

        if (aMeta.x < 0.5) {
          // Part A: Cruising speedboat curved Kelvin wake & bow-wave ribbon
          float u = uv.x; // 0 at bow tip .. 1 at 29m astern
          float v = uv.y; // -1 port .. +1 starboard
          float s = mix(-2.8, 26.0, pow(u, 1.08)); // distance behind boat center
          float tauNow = uBoatParams.z;
          vec2 curVel = boatVelocity(tauNow);
          float curSpeed = max(length(curVel), 0.1);
          // Historical parameter when the hull passed station s
          float dtBack = max(0.0, s) / curSpeed;
          float tauHist = tauNow - dtBack * ${BOAT_TAU_RATE.toFixed(4)};

          vec2 spinePos;
          vec2 spineFwd;
          if (s < 0.0) {
            spinePos = boatCenter(tauNow) - normalize(curVel) * s;
            spineFwd = normalize(curVel);
          } else {
            spinePos = boatCenter(tauHist);
            spineFwd = normalize(boatVelocity(tauHist));
          }
          vec2 spineRight = vec2(-spineFwd.y, spineFwd.x);
          vFwd = spineFwd;

          float sFromBow = s + 2.8; // 0 at bow stem .. 28.8m astern
          float halfW = 0.68 + pow(max(0.0, sFromBow), 0.82) * 0.32;
          float across = v * halfW;
          wp.xz = spinePos + spineRight * across;

          vec4 c = coastAt(wp.xz);
          float baseEta = waterEta(wp.xz, uWTime, c) + boatWakeField(wp.xz, uWTime).x;

          // Smooth 3D curling bow chine wave & subtle prop-wash swell
          float absV = abs(v);
          float chinePeak = exp(-pow((absV - 0.66) / 0.16, 2.0));
          float bowCurl = chinePeak * smoothstep(0.0, 1.2, sFromBow) * (1.0 - smoothstep(2.8, 12.0, sFromBow)) * 0.08;
          float propBoil = exp(-pow(absV / 0.20, 2.0)) * smoothstep(5.0, 6.5, sFromBow) * (1.0 - smoothstep(7.5, 18.0, sFromBow)) * 0.04;
          crestLift = bowCurl + propBoil;
          wp.y = baseEta + 0.022 + crestLift;
        } else {
          // Part B: Moored hull waterline collar
          vec4 c = coastAt(wp.xz);
          float baseEta = waterEta(wp.xz, uWTime, c);
          vFwd = vec2(0.0, 1.0);
          crestLift = (1.0 - uv.y) * 0.015;
          wp.y = baseEta + 0.016 + crestLift;
        }

        vCrest = crestLift;
        vWPos = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${COAST_GLSL}
      uniform sampler2D uWaterN;
      uniform vec3 uFogCol;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec2 vWakeUv;
      varying vec3 vWPos;
      varying vec2 vFwd;
      varying float vKind;
      varying float vCrest;

      void main() {
        vec2 xz = vWPos.xz;
        float camDist = length(cameraPosition - vWPos);
        vec3 foamBase = uFoamCol * 0.92;
        vec3 aerAqua = mix(uInscatter, uFoamCol * vec3(0.68, 0.82, 0.80), 0.42);

        float alpha = 0.0;
        vec3 col = foamBase;

        if (vKind < 0.5) {
          float u = vWakeUv.x;
          float v = vWakeUv.y;
          float absV = abs(v);
          float sFromBow = mix(0.0, 28.8, pow(u, 1.08));

          // Smooth, low-frequency laminar water flow (zero furry speckles)
          vec2 flowUv1 = xz * 0.055 - vFwd * (uWTime * 0.10);
          vec2 flowUv2 = vec2(u * 1.4 - uWTime * 0.16, v * 0.75);
          float n1 = texture2D(uNoiseTex, flowUv1).r;
          float n2 = texture2D(uNoiseTex, flowUv2).g;
          float silk = 0.82 + 0.18 * (n1 * 0.6 + n2 * 0.4);

          // 1. Sleek Kelvin V-arms peeling off the hull chines
          float armCenter1 = mix(0.44, 0.74, smoothstep(0.0, 9.0, sFromBow));
          float armWidth1 = mix(0.09, 0.18, u);
          float vArm1 = exp(-pow((absV - armCenter1) / armWidth1, 2.0))
                      * smoothstep(0.01, 0.08, u) * (1.0 - smoothstep(0.25, 0.85, u));

          // 2. Smooth central prop-wash slipstream behind stern
          float sternU = smoothstep(5.0, 6.2, sFromBow) * (1.0 - smoothstep(8.5, 27.0, sFromBow));
          float propSpread = mix(0.11, 0.30, smoothstep(5.0, 26.0, sFromBow));
          float propWash = exp(-pow(absV / propSpread, 2.0)) * sternU;

          float env = clamp(vArm1 * 0.68 + propWash * 0.78, 0.0, 1.0);
          float edgeFeather = (1.0 - smoothstep(0.82, 1.0, absV)) * smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.82, 1.0, u));
          env *= edgeFeather * silk;

          alpha = clamp(env * 0.52, 0.0, 0.56);
          float whiteMix = clamp(vArm1 * 0.55 + propWash * 0.48 + smoothstep(0.02, 0.08, vCrest) * 0.28, 0.0, 0.78);
          col = mix(aerAqua, foamBase, whiteMix);
        } else {
          // Part B: Subtle moored hull waterline meniscus (no noisy collar)
          float v = vWakeUv.y;
          float ringEnv = (1.0 - smoothstep(0.0, 0.42, v)) * smoothstep(0.0, 0.08, v);
          alpha = clamp(ringEnv * 0.12, 0.0, 0.14);
          col = mix(aerAqua, foamBase, 0.45);
        }

        if (alpha < 0.006) discard;

        float fogK = smoothstep(uFogNear, uFogFar, camDist);
        col = mix(col, uFogCol, fogK);

        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// 2. Continuous 3D Curved Bow-Chine Hydrodynamic Water Sheet (Zero Billboard Fur!)
// ---------------------------------------------------------------------------
function buildBoatSpray(scene, coastT, fog) {
  // Instead of instanced billboard puffs that look like fluffy white fur along the hull,
  // build a sleek, continuous 2-sided 3D curved water-sheet ribbon peeling smoothly off
  // the port and starboard bow chines and folding back into the water surface.
  const segU = 24, segV = 6;
  const vertsPerSide = (segU + 1) * (segV + 1);
  const totalVerts = vertsPerSide * 2;
  const pos = new Float32Array(totalVerts * 3);
  const uvAttr = new Float32Array(totalVerts * 2);
  const sideAttr = new Float32Array(totalVerts);
  const indices = [];

  let vPtr = 0;
  for (let sIdx = 0; sIdx < 2; sIdx++) {
    const side = sIdx === 0 ? -1.0 : 1.0;
    const baseV = vPtr;
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU; // 0 near bow stem .. 1 aft chine
      for (let iv = 0; iv <= segV; iv++) {
        const v = iv / segV; // 0 attached to chine .. 1 outer folding water edge
        pos[vPtr * 3] = 106;
        pos[vPtr * 3 + 1] = 0;
        pos[vPtr * 3 + 2] = 5;
        uvAttr[vPtr * 2] = u;
        uvAttr[vPtr * 2 + 1] = v;
        sideAttr[vPtr] = side;
        vPtr++;
      }
    }
    for (let iu = 0; iu < segU; iu++) {
      for (let iv = 0; iv < segV; iv++) {
        const a = baseV + iu * (segV + 1) + iv;
        const b = a + 1;
        const c = a + (segV + 1);
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvAttr, 2));
  geo.setAttribute('aSide', new THREE.BufferAttribute(sideAttr, 1));
  geo.setIndex(indices);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...coastUniforms,
      uFogCol: { value: fog.color },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      ${COAST_GLSL}
      attribute float aSide;
      varying vec2 vUv;
      varying vec3 vWPos;

      void main() {
        vUv = uv;
        float u = uv.x; // 0 forward bow stem .. 1 mid-hull chine
        float v = uv.y; // 0 hull contact .. 1 outer water landing
        float side = aSide;

        float tauNow = uBoatParams.z;
        vec2 bPos = boatCenter(tauNow);
        vec2 bVel = boatVelocity(tauNow);
        vec2 bFwd = normalize(bVel);
        vec2 bRight = vec2(-bFwd.y, bFwd.x);

        // Follow the flared V-hull chine from bow stem (along = +2.3m) to midships (along = -1.2m)
        float along = mix(2.25, -1.15, u);
        float hullHalfW = mix(0.22, 1.02, smoothstep(0.0, 0.65, u));
        // Sheet peels outward in a smooth parabolic arc and lands back on the water
        float sheetWidth = (0.35 + 0.65 * sin(u * 3.14159)) * (0.42 + 0.18 * clamp(uBoatParams.w, 0.0, 1.4));
        float outDist = hullHalfW + v * sheetWidth;

        vec2 worldXZ = bPos + bFwd * (along - v * 0.55) + bRight * (side * outDist);
        vec4 c = coastAt(worldXZ);
        float waterY = waterEta(worldXZ, uWTime, c) + boatWakeField(worldXZ, uWTime).x;

        // Smooth parabolic sheet arch: rises slightly off the chine and curves back down to waterY
        float arch = 4.0 * v * (1.0 - v) * sin(u * 3.14159) * 0.14;
        float chineLift = (1.0 - v) * 0.05 * sin(u * 3.14159);
        vWPos = vec3(worldXZ.x, waterY + 0.018 + arch + chineLift, worldXZ.y);

        gl_Position = projectionMatrix * viewMatrix * vec4(vWPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${COAST_GLSL}
      uniform vec3 uFogCol;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec2 vUv;
      varying vec3 vWPos;

      void main() {
        float u = vUv.x;
        float v = vUv.y;
        // Smooth, translucent glassy water sheet tapering at fore/aft ends and outer lip
        float envU = smoothstep(0.0, 0.18, u) * (1.0 - smoothstep(0.72, 1.0, u));
        float envV = smoothstep(0.0, 0.15, v) * (1.0 - smoothstep(0.55, 1.0, v));
        float lipHighlight = exp(-pow((v - 0.38) / 0.22, 2.0)) * envU;

        float alpha = (envU * envV * 0.26 + lipHighlight * 0.16);
        if (alpha < 0.005) discard;

        float sunElev = max(uSunDirW.y, 0.0);
        vec3 sheetAqua = mix(uInscatter, uFoamCol * (0.86 + 0.10 * sunElev), 0.58);
        vec3 col = mix(sheetAqua, uFoamCol * 0.92, clamp(lipHighlight * 0.65, 0.0, 0.75));

        float camDist = length(cameraPosition - vWPos);
        float fogK = smoothstep(uFogNear, uFogFar, camDist);
        col = mix(col, uFogCol, fogK);

        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.36));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  scene.add(mesh);
  return { mesh };
}

// ---------------------------------------------------------------------------
// 3. Boats & Hydrostatic/Hydrodynamic Physics Controller
// ---------------------------------------------------------------------------
function boats(ctx) {
  const { data: D, scene, M } = ctx;
  const items = [];
  const mooredHulls = [];
  const pier = D.pier;

  // Ferry moored on the south side of the pier arm
  const ferry = makeBoat(ctx, 'ferry');
  const c = Math.cos(pier.armRot), s = Math.sin(pier.armRot);
  const A = [32.4, 52.2], B = [50, 57.2];
  const u = 0.45, v = 3.4;
  const fx = A[0] + (B[0] - A[0]) * u + v * s;
  const fz = A[1] + (B[1] - A[1]) * u + v * c;
  ferry.position.set(fx, 0, fz);
  ferry.rotation.y = pier.armRot;
  scene.add(ferry);
  items.push({
    obj: ferry, base: ferry.position.clone(), rot: ferry.rotation.y, phase: 0.2,
    halfL: 4.1, halfB: 1.45, draft: 0.05,
    kHeave: 14, dHeave: 4.8, kPitch: 13, dPitch: 4.5, kRoll: 11, dRoll: 3.8,
    pitchGain: 0.95, rollGain: 1.05, surgeAmp: 0.13, swayAmp: 0.09, yawAmp: 0.025,
    y: 0, vy: 0, pitch: 0, vPitch: 0, roll: 0, vRoll: 0,
  });
  mooredHulls.push({ x: fx, z: fz, rot: pier.armRot, halfL: 4.9, halfB: 1.72, phase: 0.2 });

  // Small skiff by the platform
  const skiff = makeBoat(ctx, 'skiff');
  skiff.position.set(26, 0, 57.5);
  skiff.rotation.y = 0.2;
  scene.add(skiff);
  items.push({
    obj: skiff, base: skiff.position.clone(), rot: skiff.rotation.y, phase: 1.3,
    halfL: 2.1, halfB: 0.78, draft: 0.02,
    kHeave: 22, dHeave: 5.4, kPitch: 20, dPitch: 4.8, kRoll: 18, dRoll: 4.0,
    pitchGain: 1.15, rollGain: 1.25, surgeAmp: 0.18, swayAmp: 0.13, yawAmp: 0.045,
    y: 0, vy: 0, pitch: 0, vPitch: 0, roll: 0, vRoll: 0,
  });
  mooredHulls.push({ x: 26, z: 57.5, rot: 0.2, halfL: 2.65, halfB: 0.96, phase: 1.3 });

  // Mooring buoys
  for (const [bx, bz] of [[36, 63], [42, 64.5], [20, 60]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), M.buoy);
    b.position.set(bx, 0.1, bz);
    b.castShadow = true;
    scene.add(b);
    items.push({
      obj: b, base: b.position.clone(), rot: 0, phase: bx * 0.37,
      halfL: 0.38, halfB: 0.38, draft: -0.06,
      kHeave: 28, dHeave: 5.8, kPitch: 24, dPitch: 4.6, kRoll: 24, dRoll: 4.6,
      pitchGain: 1.35, rollGain: 1.35, surgeAmp: 0.20, swayAmp: 0.16, yawAmp: 0.0,
      y: 0.1, vy: 0, pitch: 0, vPitch: 0, roll: 0, vRoll: 0,
    });
    mooredHulls.push({ x: bx, z: bz, rot: 0, halfL: 0.42, halfB: 0.42, phase: bx * 0.37 });
  }

  // Cruising speedboat offshore (east) with dynamic planing trim, turn banking,
  // 4-point wave-slamming physics, curved 3D Kelvin wake, and 3D ballistic spray
  const speed = makeBoat(ctx, 'speed');
  scene.add(speed);
  const speedState = {
    tau: 0,
    y: 0.08, vy: 0,
    pitch: 0.085, vPitch: 0,
    roll: 0, vRoll: 0,
    sprayBurst: 0.35,
  };

  buildWakeAndCollars(scene, ctx.coastT, scene.fog, mooredHulls);
  const spray = buildBoatSpray(scene, ctx.coastT, scene.fog, mooredHulls);

  // 4-point spring-damper hydrostatic buoyancy for moored vessels & buoys
  const stepMooredBody = (it, dt, time, heightAt) => {
    const yaw = it.rot + Math.sin(time * 0.75 + it.phase) * it.yawAmp;
    const cY = Math.cos(yaw), sY = Math.sin(yaw);
    // Gentle orbital wave surge & sway around mooring anchor
    const surge = Math.sin(time * 0.92 + it.phase) * it.surgeAmp;
    const sway = Math.cos(time * 0.78 + it.phase * 1.3) * it.swayAmp;
    const x = it.base.x + cY * surge + sY * sway;
    const z = it.base.z - sY * surge + cY * sway;
    it.obj.position.x = x;
    it.obj.position.z = z;

    let hC = 0, hBow = 0, hStern = 0, hPort = 0, hStbd = 0;
    if (heightAt) {
      hC = heightAt(x, z, time);
      hBow = heightAt(x + cY * it.halfL, z - sY * it.halfL, time);
      hStern = heightAt(x - cY * it.halfL, z + sY * it.halfL, time);
      hPort = heightAt(x - sY * it.halfB, z - cY * it.halfB, time);
      hStbd = heightAt(x + sY * it.halfB, z + cY * it.halfB, time);
    } else {
      hC = Math.sin(time * 1.3 + it.phase) * 0.07;
      hBow = Math.sin(time * 1.3 + it.phase + 0.35) * 0.07;
      hStern = Math.sin(time * 1.3 + it.phase - 0.35) * 0.07;
      hPort = Math.sin(time * 1.1 + it.phase + 0.25) * 0.05;
      hStbd = Math.sin(time * 1.1 + it.phase - 0.25) * 0.05;
    }

    const hTarget = it.base.y + (hC * 2 + hBow + hStern + hPort + hStbd) / 6 - it.draft;
    const pitchTarget = Math.atan2(hBow - hStern, it.halfL * 2) * it.pitchGain;
    const rollTarget = Math.atan2(hPort - hStbd, it.halfB * 2) * it.rollGain;

    it.vy += ((hTarget - it.y) * it.kHeave - it.vy * it.dHeave) * dt;
    it.y += it.vy * dt;
    it.vPitch += ((pitchTarget - it.pitch) * it.kPitch - it.vPitch * it.dPitch) * dt;
    it.pitch += it.vPitch * dt;
    it.vRoll += ((rollTarget - it.roll) * it.kRoll - it.vRoll * it.dRoll) * dt;
    it.roll += it.vRoll * dt;

    it.obj.position.y = it.y;
    it.obj.rotation.set(0, yaw, 0);
    it.obj.rotateZ(it.pitch);
    it.obj.rotateX(it.roll);
  };

  return {
    update(dt, time, heightAt) {
      const stepDt = Math.min(dt, 0.04);

      // 1. Update moored ferry, skiff, and buoys with 4-point hydrostatic physics
      for (const it of items) {
        stepMooredBody(it, stepDt, time, heightAt);
      }

      // 2. Advance cruising speedboat along offshore circuit with planing & banking physics
      speedState.tau += stepDt * BOAT_TAU_RATE;
      const pose = sampleBoatPath(speedState.tau);
      const { x, z, fwdX, fwdZ, rightX, rightZ, curvature, ry } = pose;

      const halfL = 2.65, halfB = 0.95;
      let hC = 0, hBow = 0, hStern = 0, hPort = 0, hStbd = 0;
      if (heightAt) {
        hC = heightAt(x, z, time);
        hBow = heightAt(x + fwdX * halfL, z + fwdZ * halfL, time);
        hStern = heightAt(x - fwdX * halfL, z - fwdZ * halfL, time);
        hPort = heightAt(x - rightX * halfB, z - rightZ * halfB, time);
        hStbd = heightAt(x + rightX * halfB, z + rightZ * halfB, time);
      }

      // Hydrodynamic planing lift (+0.075m) + bow-up planing trim (+0.088 rad ~ 5 deg)
      const planingLift = 0.075;
      const planingTrim = 0.088;
      // Coordinated inward turn banking proportional to trajectory curvature
      const turnBank = Math.max(-0.28, Math.min(0.28, curvature * 16.5));

      const hWave = (hC * 2 + hBow + hStern + hPort + hStbd) / 6 + planingLift;
      const pitchWave = Math.atan2(hBow - hStern, halfL * 2) * 1.15 + planingTrim;
      const rollWave = Math.atan2(hPort - hStbd, halfB * 2) * 0.95 + turnBank;

      // Detect bow wave-slamming when slicing through an oncoming swell crest
      const bowWorldY = speedState.y + Math.sin(speedState.pitch) * halfL;
      const bowSlam = Math.max(0, (hBow + 0.12) - bowWorldY);

      speedState.vy += ((hWave - speedState.y) * 24 - speedState.vy * 6.2 + bowSlam * 3.8) * stepDt;
      speedState.y += speedState.vy * stepDt;

      speedState.vPitch += ((pitchWave - speedState.pitch) * 22 - speedState.vPitch * 5.6 + bowSlam * 4.5) * stepDt;
      speedState.pitch += speedState.vPitch * stepDt;

      speedState.vRoll += ((rollWave - speedState.roll) * 20 - speedState.vRoll * 5.4) * stepDt;
      speedState.roll += speedState.vRoll * stepDt;

      // Smoothly track wave-slamming spray burst intensity (0.25..1.45)
      const targetBurst = Math.min(1.45, 0.28 + bowSlam * 4.2 + Math.abs(speedState.vPitch) * 0.8);
      speedState.sprayBurst += (targetBurst - speedState.sprayBurst) * Math.min(1, stepDt * 7.5);

      speed.position.set(x, speedState.y, z);
      speed.rotation.set(0, ry, 0);
      speed.rotateZ(speedState.pitch);
      speed.rotateX(speedState.roll);

      // 3. Sync shared GPU boat uniforms for the ocean shader, curved 3D wake, and 3D bow sheet
      coastUniforms.uBoatWake.value.set(x, z, fwdX, fwdZ);
      coastUniforms.uBoatParams.value.set(1.0, curvature, speedState.tau, speedState.sprayBurst);
      spray.mesh.visible = coastUniforms.uQualityTier.value >= 0.5;
    },
  };
}

