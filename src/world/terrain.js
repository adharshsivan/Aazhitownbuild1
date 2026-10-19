import * as THREE from 'three';
import {
  sampleCurve, Polyline, bufferLines, offsetPolys, union, difference, intersection, closePolys, openPolys,
  slabGeometry, flatGeometry, curbGeometry, boxGeo, rectPoly, circlePoly, ringArea, pointInPolys, rng,
  cleanCurbRing, toExPolys,
} from '../geom.js';
import {
  G, WALK, GREEN_TOP, OUTLINE, BEACH, ROADS, JUNCTIONS, CROSSINGS, PLAZAS, PATHS, METRO,
  APARTMENT, GRAFFITI, CAFE, PAVILION, SHOP, BUS_SHELTERS, PIER,
} from '../layout.js';
import { buildCoastField, buildCoastMesh, axisSamples, FEXT as FIELD_EXT } from './coastField.js';
import { makeCoastTextures } from './coastTextures.js';
import { coastUniforms, makeCoastGroundMaterial } from './coastShading.js';

let coastField = null;
/** Ground height of the coastal terrain (beach sand / seabed) at (x, z). */
export const beachHeight = (x, z) => coastField.height(x, z);

function addMesh(ctx, geo, mat, { walk = false, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.castShadow = shadow;
  m.matrixAutoUpdate = false;
  ctx.scene.add(m);
  if (walk) ctx.walk.push(geo);
  return m;
}

/** Footprints that planting must avoid (buildings + margin). Filled in by buildings.js data. */
export function buildingFootprints(stationPoly) {
  return [
    rectPoly(APARTMENT.x, APARTMENT.z, APARTMENT.w + 4, APARTMENT.d + 4),
    rectPoly(GRAFFITI.x, GRAFFITI.z, GRAFFITI.w + 4, GRAFFITI.d + 4),
    rectPoly(CAFE.x, CAFE.z, CAFE.w + 4, CAFE.d + 4),
    rectPoly(PAVILION.x, PAVILION.z, PAVILION.size + 3, PAVILION.size + 3),
    rectPoly(SHOP.x, SHOP.z, SHOP.w + 3, SHOP.d + 3),
    ...BUS_SHELTERS.map((b) => rectPoly(b.x, b.z, 6.5, 3.5, b.rot)),
    ...stationPoly,
  ];
}

export function buildTerrain(ctx) {
  const { M } = ctx;
  const D = ctx.data;

  // --- outline & plate ------------------------------------------------------
  const outline = sampleCurve(OUTLINE, true, 0.6);
  const outlinePL = new Polyline(outline, true);
  const plate = [outline];
  D.outline = outline; D.outlinePL = outlinePL; D.plate = plate;

  // --- roads ----------------------------------------------------------------
  const roads = {};
  for (const [name, r] of Object.entries(ROADS)) {
    const pts = sampleCurve(r.pts, r.closed, 0.25);
    const pl = new Polyline(pts, r.closed);
    const poly = r.closed
      ? bufferLines([pts], r.width / 2, { closedLines: true, round: true })
      : bufferLines([pts], r.width / 2, { round: false });
    roads[name] = { ...r, pts, pl, poly };
  }
  D.roads = roads;
  let roadUnion = [];
  for (const r of Object.values(roads)) roadUnion = union(roadUnion, r.poly);

  // Carve out the raised central median strip (width 2.76m, v in [-1.38, +1.38]) along the metro alignment
  // so the metro pillars stand in a curbed central island with twin carriageways on either side.
  const mLen = Math.hypot(1, METRO.slope);
  const mAngle = Math.atan2(-METRO.slope / mLen, 1 / mLen);
  const metroMedianPoly = [rectPoly(METRO.station[0], METRO.station[1], 190, 2.76, mAngle)];
  D.metroMedianPoly = metroMedianPoly;

  const roadsClosed = difference(intersection(closePolys(roadUnion, 2.2), plate), metroMedianPoly);
  D.roadsClosed = roadsClosed;

  // asphalt (top only, realistic 4.2m tile scale for fine aggregate)
  addMesh(ctx, slabGeometry(roadsClosed, G - 0.3, G, { uvTop: 4.2, sides: false }), M.asphalt, { walk: true, shadow: false });

  // pedestrian paving (4.4m tile = ~1.1m x 1.1m large architectural concrete promenade slabs, inset behind the 24cm road kerb)
  const roadCurbOuter = offsetPolys(roadsClosed, 0.23, true);
  const paving = difference(plate, roadCurbOuter);
  const pavingGeo = slabGeometry(paving, G - 0.3, WALK, { uvTop: 4.4, uvSide: 1.8, sides: false });
  addMesh(ctx, pavingGeo, M.paving, { walk: true, shadow: false });

  // solid 3D precast concrete roadside kerb (24cm wide, battered road face rising from G to bullnose top at WALK + 0.016)
  const roadCurbProfile = [
    [0.0, G - 0.02, 0.0],
    [0.022, WALK - 0.012, 0.39],
    [0.055, WALK + 0.016, 0.45],
    [0.235, WALK + 0.016, 0.90],
    [0.245, WALK - 0.02, 1.0],
  ];
  addMesh(ctx, curbGeometry(roadsClosed, roadCurbProfile, { uvStep: 1.85 }), M.curb, { walk: true, shadow: false });

  // concrete roadside stormwater gutter channel + contact shading along the inner foot of the kerb
  const roadGutterSoleProfile = [
    [0.005, G + 0.004, 0.0],
    [-0.44, G + 0.003, 0.65],
  ];
  addMesh(ctx, curbGeometry(roadsClosed, roadGutterSoleProfile, { uvStep: 1.85 }), M.concreteDark, { shadow: false });
  const roadGutterBlendProfile = [
    [0.0, G + 0.006, 0.0],
    [-0.54, G + 0.006, 1.0],
  ];
  addMesh(ctx, curbGeometry(roadsClosed, roadGutterBlendProfile, { uvStep: 1.85 }), M.gutter, { shadow: false });

  // continuous base stone coping along outer seawall perimeter (seals stair/pier thresholds at WALK + 0.018)
  const seawallCopingProfile = [
    [-0.42, WALK - 0.02, 0.96],
    [-0.40, WALK + 0.018, 0.88],
    [-0.02, WALK + 0.018, 0.46],
    [0.0, WALK - 0.01, 0.38],
    [0.0, G - 0.3, 0.0],
  ];
  addMesh(ctx, curbGeometry(plate, seawallCopingProfile, { uvStep: 1.85 }), M.curb, { walk: true, shadow: false });

  // seawall faces
  addMesh(ctx, slabGeometry(plate, -3.2, G - 0.3, { top: false, uvSide: 3 }), M.stone, { shadow: false });

  // --- markings (analytic quad-strip geometry: zero Earcut slivers or boolean fragments) ---
  const MARK_Y = G + 0.012;
  const crossingRects = [];
  D.crossings = [];
  for (const c of CROSSINGS) {
    const r = roads[c.road];
    let s = r.pl.project(c.at[0], c.at[1]);
    // Keep the north avenue crossing just south of the ring-road curb return bellmouth
    if (c.road === 'avenue' && s < 7.0) s = 6.85;
    const p = r.pl.at(s);
    const rot = Math.atan2(-p.tz, p.tx);
    crossingRects.push(rectPoly(p.x, p.z, 3.3, r.width + 0.4, rot));
    D.crossings.push({ road: c.road, s, x: p.x, z: p.z, tx: p.tx, tz: p.tz, width: r.width });
  }

  // Helper to append a 2D polyline ribbon of constant half-width as a clean flat quad strip at MARK_Y
  const makeMarkingPool = () => ({ pos: [], nor: [], uv: [] });
  const pushRibbon = (pool, pts, halfW, uvScale = 1.0) => {
    const N = pts.length;
    if (N < 2) return;
    const tangents = [];
    const cum = [0];
    for (let i = 0; i < N; i++) {
      if (i > 0) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(N - 1, i + 1)];
      let tx = next[0] - prev[0], tz = next[1] - prev[1];
      const l = Math.hypot(tx, tz) || 1;
      tangents.push([tx / l, tz / l]);
    }
    for (let i = 0; i < N - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const tA = tangents[i], tB = tangents[i + 1];
      // Right-hand normal (tz, -tx) and left-hand normal (-tz, tx)
      const nAx = -tA[1], nAz = tA[0];
      const nBx = -tB[1], nBz = tB[0];
      const p00 = [a[0] - nAx * halfW, a[1] - nAz * halfW];
      const p01 = [a[0] + nAx * halfW, a[1] + nAz * halfW];
      const p11 = [b[0] + nBx * halfW, b[1] + nBz * halfW];
      const p10 = [b[0] - nBx * halfW, b[1] - nBz * halfW];
      // Ensure +Y normal winding
      const cy = (p10[1] - p00[1]) * (p11[0] - p00[0]) - (p10[0] - p00[0]) * (p11[1] - p00[1]);
      const tris = cy < 0 ? [[p00, p11, p10], [p00, p01, p11]] : [[p00, p10, p11], [p00, p11, p01]];
      for (const tri of tris) {
        for (const P of tri) {
          pool.pos.push(P[0], MARK_Y, P[1]);
          pool.nor.push(0, 1, 0);
          pool.uv.push(P[0] / uvScale, -P[1] / uvScale);
        }
      }
    }
  };
  const poolToGeo = (pool) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pool.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pool.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(pool.uv, 2));
    return g;
  };

  // 1. Continuous yellow road-edge lines: subdivide roadsClosed boundary rings into <=0.28m steps
  //    so edge lines follow curves and junction curb returns cleanly and stop crisply at every crossing
  const inCrossingBand = (x, z) => D.crossings.some((c) => {
    const dx = x - c.x, dz = z - c.z;
    const along = Math.abs(dx * c.tx + dz * c.tz);
    const across = Math.abs(dx * (-c.tz) + dz * c.tx);
    return along < 1.82 && across < c.width * 0.5 + 2.6;
  });
  const nearSeawallEdge = (x, z) => {
    const p = outlinePL.at(outlinePL.project(x, z));
    return Math.hypot(p.x - x, p.z - z) < 0.75;
  };
  const subRingPolys = roadsClosed.map((ring) => {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(dist / 0.28));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  });
  const yellowLineProfile = [
    [-0.58, MARK_Y, 0.0],
    [-0.45, MARK_Y, 1.0],
  ];
  addMesh(ctx, curbGeometry(subRingPolys, yellowLineProfile, {
    uvStep: 1.0,
    filterSeg: (x, z) => !inCrossingBand(x, z) && !nearSeawallEdge(x, z),
  }), M.lineYellow, { shadow: false });

  // 2. White road markings: center dashes, zebra crossings, approaching-lane stop bars, and junction give-way lines
  const whitePool = makeMarkingPool();

  // Precompute junction points on major and minor roads
  const junctionInfo = JUNCTIONS.map((j) => {
    const mi = roads[j.minor], ma = roads[j.major];
    const endPt = j.end === 'start' ? mi.pts[0] : mi.pts[mi.pts.length - 1];
    const sMajor = ma.pl.project(endPt[0], endPt[1]);
    const pMajor = ma.pl.at(sMajor);
    return { ...j, mi, ma, endPt, sMajor, pMajor };
  });

  const arcDist = (pl, s1, s2) => {
    const d = Math.abs(s1 - s2);
    return pl.closed ? Math.min(d, pl.length - d) : d;
  };

  // Check whether arc-length station s on road `name` is clear for center-line dashes
  const isDashClear = (name, r, s) => {
    if (!r.closed && (s < 1.5 || s > r.pl.length - 1.5)) return false;
    // Stay clear of pedestrian crossings and their approaching stop bars
    for (const c of D.crossings) {
      if (c.road === name && arcDist(r.pl, s, c.s) < 3.85) return false;
    }
    const p = r.pl.at(s);
    for (const j of junctionInfo) {
      if (j.minor === name) {
        // Minor road throat: stay clear of major road + curb-return bellmouth
        const sEnd = j.end === 'start' ? 0 : r.pl.length;
        if (Math.abs(s - sEnd) < j.ma.width * 0.5 + 4.1) return false;
      }
      if (j.major === name) {
        // Major road passing a T-junction mouth: interrupt center dashes across the junction throat
        if (arcDist(r.pl, s, j.sMajor) < j.mi.width * 0.5 + 2.75) return false;
      }
      if (Math.hypot(p.x - j.pMajor.x, p.z - j.pMajor.z) < j.ma.width * 0.5 + 2.5) return false;
    }
    return true;
  };

  // Emit complete, unchopped curved center-line dashes within every clear road span
  for (const [name, r] of Object.entries(roads)) {
    const L = r.pl.length;
    const step = 0.20;
    const nSamples = Math.floor(L / step);
    const flags = new Uint8Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      flags[i] = isDashClear(name, r, (i + 0.5) * step) ? 1 : 0;
    }
    // Extract contiguous clear intervals [s0, s1]
    const spans = [];
    let i = 0;
    while (i < nSamples) {
      while (i < nSamples && !flags[i]) i++;
      if (i >= nSamples) break;
      const startIdx = i;
      while (i < nSamples && flags[i]) i++;
      spans.push([startIdx * step, i * step]);
    }
    // If closed road wraps around s = 0 and both ends are clear, merge first and last spans
    if (r.closed && spans.length > 1 && spans[0][0] === 0 && spans[spans.length - 1][1] >= nSamples * step - 1e-4) {
      const first = spans.shift();
      const last = spans.pop();
      spans.push([last[0], L + first[1]]);
    }
    const dashLen = 2.35, gapLen = 3.05, period = dashLen + gapLen;
    for (const [s0, s1] of spans) {
      const spanLen = s1 - s0;
      if (spanLen < 1.85) continue;
      const count = Math.max(1, Math.floor((spanLen + gapLen) / period));
      const actualDash = Math.min(dashLen, spanLen);
      const totalUsed = count * actualDash + (count - 1) * gapLen;
      const offset0 = s0 + Math.max(0, (spanLen - totalUsed) * 0.5);
      for (let k = 0; k < count; k++) {
        const dStart = offset0 + k * (actualDash + gapLen);
        const dEnd = dStart + actualDash;
        if (dEnd > s1 + 0.05) break;
        const pts = r.pl.slice(dStart, dEnd, 0.25);
        pushRibbon(whitePool, pts, 0.075);
      }
    }
  }

  // Emit T-junction stop & give-way lines on minor road throats that do NOT already have a zebra crossing
  for (const j of junctionInfo) {
    const { mi, ma } = j;
    const sEnd = j.end === 'start' ? 0 : mi.pl.length;
    const hasThroatCrossing = D.crossings.some((c) => c.road === j.minor && Math.abs(c.s - sEnd) < 9.5);
    if (hasThroatCrossing) continue;

    const targetDist = ma.width * 0.5 + 2.35;
    const L = mi.pl.length;
    let sGW = sEnd;
    for (let k = 0; k <= L; k += 0.1) {
      const s = j.end === 'start' ? k : L - k;
      const p = mi.pl.at(s);
      const sp = ma.pl.at(ma.pl.project(p.x, p.z));
      if (Math.hypot(sp.x - p.x, sp.z - p.z) >= targetDist) { sGW = s; break; }
    }
    const p = mi.pl.at(sGW);
    // Vehicle approaching the junction travels toward sEnd: heading = dirToJunc * (p.tx, p.tz)
    // In left-hand traffic (+x east, +z south), driver's left is (hz, -hx)
    const dirToJunc = j.end === 'start' ? -1 : 1;
    const hx = p.tx * dirToJunc, hz = p.tz * dirToJunc;
    const leftX = hz, leftZ = -hx;
    const maxOff = mi.width * 0.5 - 0.52;

    // Solid stop bar across the approaching left-hand lane
    pushRibbon(whitePool, [
      [p.x + leftX * 0.14, p.z + leftZ * 0.14],
      [p.x + leftX * maxOff, p.z + leftZ * maxOff],
    ], 0.15);

    // Dashed give-way teeth across the opposing lane (right-hand side = -left)
    for (let o = 0.28; o <= maxOff - 0.35; o += 0.78) {
      const o1 = Math.min(o + 0.46, maxOff);
      pushRibbon(whitePool, [
        [p.x - leftX * o, p.z - leftZ * o],
        [p.x - leftX * o1, p.z - leftZ * o1],
      ], 0.12);
    }
  }

  // Emit zebra crossings + left-hand approaching lane stop lines
  for (const c of D.crossings) {
    const r = roads[c.road];
    const nx = -c.tz, nz = c.tx;
    const stripeHalfLen = 1.28;
    const maxStripeOff = c.width * 0.5 - 0.78;
    const nStripes = Math.max(4, Math.floor((maxStripeOff * 2) / 0.92) + 1);
    const span = (nStripes - 1) * 0.92;
    for (let i = 0; i < nStripes; i++) {
      const o = -span * 0.5 + i * 0.92;
      const cx = c.x + nx * o, cz = c.z + nz * o;
      pushRibbon(whitePool, [
        [cx - c.tx * stripeHalfLen, cz - c.tz * stripeHalfLen],
        [cx + c.tx * stripeHalfLen, cz + c.tz * stripeHalfLen],
      ], 0.22);
    }

    // Stop line 2.05m before zebra crossing on each approaching left-hand lane
    for (const side of [-1, 1]) {
      const sStop = c.s + side * 2.05;
      if (!r.closed && (sStop < 2.8 || sStop > r.pl.length - 2.8)) continue;
      const ps = r.pl.at(sStop);
      // Skip stop line if it falls inside a T-junction throat
      const inJunc = junctionInfo.some((j) => Math.hypot(ps.x - j.pMajor.x, ps.z - j.pMajor.z) < j.ma.width * 0.5 + 2.4);
      if (inJunc) continue;

      // Vehicle approaching the crossing from `side` travels with dir = -side along the polyline
      const travelDir = -side;
      const hx = ps.tx * travelDir, hz = ps.tz * travelDir;
      // Driver's left in world XZ (+x east, +z south) is (hz, -hx)
      const leftX = hz, leftZ = -hx;
      const maxOff = r.width * 0.5 - 0.52;
      pushRibbon(whitePool, [
        [ps.x + leftX * 0.18, ps.z + leftZ * 0.18],
        [ps.x + leftX * maxOff, ps.z + leftZ * maxOff],
      ], 0.14);
    }
  }
  addMesh(ctx, poolToGeo(whitePool), M.lineWhite, { shadow: false });

  // --- coast: one heightfield for beach, foreshore and seabed --------------------------
  const stairS = outlinePL.project(-10, 43);
  const sp = outlinePL.at(stairS);
  const outSign = ringArea(outline) > 0 ? 1 : -1;
  // outward normal (right of travel when ring is CCW in x/z math sense)
  const onx = sp.tz * outSign, onz = -sp.tx * outSign;
  const nSteps = 8, tread = 0.3, stairW = 3.2;
  const stairFoot = [sp.x + onx * (nSteps * tread + 0.4), sp.z + onz * (nSteps * tread + 0.4)];
  // rocky points framing the pocket beach, curving slightly in to enclose the bay
  const headlands = [[BEACH.x0 - 1.2, -0.25, 8.5], [BEACH.x1 + 1.4, 0.2, 7.5]].map(([hx, turn, len]) => {
    const p = outlinePL.at(outlinePL.project(hx, 46));
    let nx = p.tz * outSign, nz = -p.tx * outSign;
    const c = Math.cos(turn), s = Math.sin(turn);
    [nx, nz] = [nx * c - nz * s, nx * s + nz * c];
    return { x: p.x, z: p.z, nx, nz, len };
  });
  D.headlands = headlands;
  coastField = buildCoastField({ outline, stairFoot, headlands });
  D.coast = coastField;
  const CT = makeCoastTextures(ctx.maxAniso || 4);
  ctx.coastT = CT;
  coastUniforms.uCoastTex.value = CT.coastTex;
  coastUniforms.uNoiseTex.value = CT.noiseTex;
  M.coastGround = makeCoastGroundMaterial(CT);
  const coastMesh = buildCoastMesh(coastField, {
    xs: axisSamples(-FIELD_EXT, FIELD_EXT, -50, 26, 0.42, -80, 80, 1.4, 8, 1.18),
    zs: axisSamples(-FIELD_EXT, FIELD_EXT, 30, 74, 0.42, -72, 82, 1.4, 8, 1.18),
    walkRect: [-50, 30, 26, 74],
  });
  const ground = addMesh(ctx, coastMesh.geometry, M.coastGround, { shadow: false });
  ground.name = 'coast-ground';
  ctx.walk.push(coastMesh.walkGeometry);
  D.coastStats = { verts: coastMesh.verts, tris: coastMesh.tris };

  // dry-sand polygon: march out from the seawall along its normal to the still-water line
  {
    const shore = [], back = [];
    for (let s = 0; s < outlinePL.length; s += 0.5) {
      const p = outlinePL.at(s);
      if (coastField.beachWidthAt(p.x, p.z) < 0.35) continue;
      const nx = p.tz * outSign, nz = -p.tx * outSign;
      let t = 0;
      while (t < 24 && coastField.height(p.x + nx * t, p.z + nz * t) > 0) t += 0.1;
      shore.push([p.x + nx * t, p.z + nz * t]);
      back.push([p.x - nx * 1.2, p.z - nz * 1.2]);
    }
    D.beachPoly = [[...shore, ...back.reverse()]];
  }
  const beachPoly = D.beachPoly;

  // --- beach stairs -------------------------------------------------------------
  const stairRot = Math.atan2(onx, onz);         // local +z -> outward
  const bottomY = beachHeight(sp.x + onx * nSteps * tread, sp.z + onz * nSteps * tread) + 0.05;
  const rise = (WALK - bottomY) / nSteps;
  const stairMat = new THREE.Matrix4().compose(new THREE.Vector3(sp.x, 0, sp.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), stairRot), new THREE.Vector3(1, 1, 1));
  for (let k = 1; k <= nSteps; k++) {
    const top = WALK - k * rise;
    const h = top + 0.6;
    const g = ctx.batch.add(boxGeo(stairW, h, tread + 0.02, 1), M.concrete, 0, top - h / 2, (k - 0.5) * tread - 0.02, 0, { parent: stairMat });
    ctx.walk.push(g);
  }
  // cheek walls + handrails
  for (const sx of [-1, 1]) {
    const len = nSteps * tread;
    const cheek = new THREE.Shape([new THREE.Vector2(0, WALK + 0.05), new THREE.Vector2(len, bottomY + 0.05),
      new THREE.Vector2(len, -0.4), new THREE.Vector2(0, -0.4)]);
    const cg = new THREE.ExtrudeGeometry(cheek, { depth: 0.25, bevelEnabled: false });
    cg.rotateY(-Math.PI / 2);
    ctx.batch.add(cg, M.concrete, sx * (stairW / 2 + 0.125) + 0.125, 0, 0, 0, { parent: stairMat });
    for (let k = 0; k <= 3; k++) {
      const d = (k / 3) * len;
      const y = WALK + (bottomY - WALK) * (d / len);
      ctx.batch.add(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), M.railing, sx * (stairW / 2 + 0.12), y + 0.55, d, 0, { parent: stairMat });
    }
    const rail = new THREE.CylinderGeometry(0.035, 0.035, Math.hypot(len, WALK - bottomY), 6);
    ctx.batch.add(rail, M.railing, sx * (stairW / 2 + 0.12), (WALK + bottomY) / 2 + 1.05, len / 2, 0,
      { parent: stairMat, rx: Math.PI / 2 + Math.atan2(WALK - bottomY, len) });
  }
  D.beachStair = { x: sp.x, z: sp.z, nx: onx, nz: onz };

  // --- pier -------------------------------------------------------------------
  const pierS = outlinePL.project(PIER.root[0], PIER.root[1]);
  const pr = outlinePL.at(pierS);
  const deckTop = PIER.deckTop;
  const pieces = [
    { cx: 28, cz: (pr.z - 0.6 + 48) / 2, w: 3, d: 48 - (pr.z - 0.6), rot: 0 },
    { cx: 28, cz: 51, w: 9, d: 7, rot: 0 },
  ];
  const armA = [32.4, 52.2], armB = [50, 57.2];
  const armLen = Math.hypot(armB[0] - armA[0], armB[1] - armA[1]);
  const armRot = Math.atan2(-(armB[1] - armA[1]), armB[0] - armA[0]);
  pieces.push({ cx: (armA[0] + armB[0]) / 2, cz: (armA[1] + armB[1]) / 2, w: armLen + 0.4, d: 3, rot: armRot });
  pieces.push({ cx: armB[0] + Math.cos(armRot) * 1.6, cz: armB[1] - Math.sin(armRot) * 1.6, w: 3.4, d: 8, rot: armRot });
  D.pier = { pieces, armRot, deckTop, root: [pr.x, pr.z] };
  const piles = [];
  for (const p of pieces) {
    const plankTh = p.d / Math.max(1, Math.round(p.d / 1.5));
    const g = ctx.batch.add(boxGeo(p.w, 0.25, p.d, 2.5, plankTh), M.planks, p.cx, deckTop - 0.125, p.cz, p.rot);
    ctx.walk.push(g);
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    // edge beams
    for (const v of [-p.d / 2 + 0.12, p.d / 2 - 0.12]) {
      ctx.batch.add(boxGeo(p.w, 0.3, 0.2, 1), M.woodDark, p.cx + v * s, deckTop - 0.4, p.cz + v * c, p.rot);
    }
    for (let u = -p.w / 2 + 0.3; u <= p.w / 2 - 0.2; u += 2.8) {
      for (const v of [-p.d / 2 + 0.25, p.d / 2 - 0.25]) {
        const x = p.cx + u * c + v * s, z = p.cz - u * s + v * c;
        if (z < pr.z + 0.3) continue;
        piles.push([x, z]);
      }
    }
  }
  D.pier.piles = piles;
  const pileGeo = new THREE.CylinderGeometry(0.17, 0.2, 1, 7);
  for (const [x, z] of piles) {
    const top = deckTop - 0.25, bot = -3;
    ctx.batch.add(pileGeo, M.woodDark, x, (top + bot) / 2, z, 0, { sy: top - bot });
  }
  // pier railings: approach (both sides), arm north side
  const railLine = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 2));
    const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      ctx.batch.add(boxGeo(0.12, 1.0, 0.12, 1), M.wood, a[0] + (b[0] - a[0]) * t, deckTop + 0.5, a[1] + (b[1] - a[1]) * t);
    }
    for (const h of [0.55, 1.0]) {
      ctx.batch.add(boxGeo(0.08, 0.08, len, 1), M.wood, (a[0] + b[0]) / 2, deckTop + h, (a[1] + b[1]) / 2, ry);
    }
  };
  railLine([26.6, pr.z + 0.4], [26.6, 47.6]);
  railLine([29.4, pr.z + 0.4], [29.4, 47.6]);
  railLine([23.6, 47.6], [26.6, 47.6]);
  railLine([29.4, 47.6], [32.4, 47.6]);
  railLine([23.6, 47.6], [23.6, 54.4]);
  {
    const c = Math.cos(armRot), s = Math.sin(armRot);
    const off = (u, v) => [armA[0] + (armB[0] - armA[0]) * u + v * s, armA[1] + (armB[1] - armA[1]) * u + v * c];
    railLine(off(0, -1.4), off(1, -1.4));
  }

  // --- raised coastal promenade kerb & seawall railings --------------------------
  const gaps = [
    { s: stairS, half: stairW / 2 + 0.35 },
    { s: pierS, half: 1.9 },
  ];
  const inGap = (s) => gaps.some((g) => {
    let d = Math.abs(s - g.s); d = Math.min(d, outlinePL.length - d);
    return d < g.half;
  });
  // Believable raised concrete promenade kerb ledge (42cm wide, 14cm high above the cobblestone walkway,
  // with darker weathered battered inner face and sun-bleached concrete top ledge, open at stair/pier thresholds)
  const promenadeKerbProfile = [
    [-0.43, WALK - 0.02, 0.0],
    [-0.40, WALK + 0.115, 0.39],
    [-0.36, WALK + 0.14, 0.45],
    [-0.03, WALK + 0.14, 0.89],
    [0.0, WALK + 0.11, 0.95],
    [0.0, WALK - 0.01, 1.0],
  ];
  addMesh(ctx, curbGeometry(plate, promenadeKerbProfile, {
    uvStep: 1.85,
    filterSeg: (x, z) => !inGap(outlinePL.project(x, z)),
  }), M.curb, { walk: true, shadow: false });

  const postGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.92, 6);
  const railH = [0.54, 1.00];
  const step = 2.0;
  const n = Math.floor(outlinePL.length / step);
  const inset = 0.24;
  const railPt = (s) => {
    const p = outlinePL.at(s);
    return [p.x - p.tz * outSign * inset, p.z + p.tx * outSign * inset];
  };
  for (let i = 0; i < n; i++) {
    const s0 = i * step, s1 = (i + 1) * step;
    if (inGap(s0)) continue;
    const a = railPt(s0);
    ctx.batch.add(postGeo, M.railing, a[0], WALK + 0.56, a[1]);
    if (inGap(s1)) continue;
    const b = railPt(s1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
    for (const h of railH) {
      ctx.batch.add(boxGeo(0.06, 0.06, len + 0.04, 1), M.railing, (a[0] + b[0]) / 2, WALK + h, (a[1] + b[1]) / 2, ry);
    }
  }

  // --- planting beds --------------------------------------------------------------
  const footprints = buildingFootprints(ctx.data.stationFootprint || []);
  D.footprints = footprints;
  const pathLines = PATHS.map((p) => p.pts);
  let green = offsetPolys(plate, -3.2, true);
  green = difference(green, offsetPolys(roadsClosed, 2.6, true));
  green = difference(green, offsetPolys(footprints, 0.45, true));
  green = difference(green, offsetPolys(PLAZAS, 0.45, true));
  green = difference(green, bufferLines(pathLines, 1.2, { round: true }));
  green = difference(green, crossingRects.map((r) => r).flatMap((r) => offsetPolys([r], 3.2, true)));
  green = difference(green, offsetPolys(beachPoly, 0.5, true));
  green = closePolys(openPolys(green, 0.75), 0.65);
  green = green.filter((r) => Math.abs(ringArea(r)) > 10 || ringArea(r) < 0);
  D.green = green;

  // Clean curb rings so the 28cm concrete curb and interior lawn share exact vertex-boundary alignment
  const cleanGreen = toExPolys(green).map((e) => cleanCurbRing(e.outer));
  // Tropical lawn surface safely inset 22cm inside the 28cm sitting curb (can never jut out past the curb)
  const greenGrassPoly = offsetPolys(cleanGreen, -0.22, true);
  addMesh(ctx, slabGeometry(greenGrassPoly, WALK, GREEN_TOP, { uvTop: 3.8, sides: false }), M.grass, { walk: true });

  // solid 3D 28cm-wide coastal masonry/concrete garden sitting kerb wall rising from WALK to GREEN_TOP + 0.018
  const greenCurbProfile = [
    [-0.28, GREEN_TOP - 0.03, 1.0],
    [-0.27, GREEN_TOP + 0.018, 0.90],
    [-0.04, GREEN_TOP + 0.018, 0.45],
    [-0.012, GREEN_TOP - 0.012, 0.39],
    [0.01, WALK - 0.02, 0.0],
  ];
  addMesh(ctx, curbGeometry(cleanGreen, greenCurbProfile, { uvStep: 1.85 }), M.curb, { walk: true });

  // building foundation stone plinth trim (open at doorways)
  const bldgBases = [
    rectPoly(APARTMENT.x, APARTMENT.z, APARTMENT.w, APARTMENT.d),
    rectPoly(GRAFFITI.x, GRAFFITI.z, GRAFFITI.w, GRAFFITI.d),
    rectPoly(CAFE.x, CAFE.z, CAFE.w, CAFE.d),
    rectPoly(PAVILION.x, PAVILION.z, PAVILION.size, PAVILION.size),
    rectPoly(-33.3, 16.5, 6.2, 4.2), // Tea Kiosk room base
  ];
  const plinthProfile = [
    [-0.02, WALK + 0.08, 0.92],
    [0.04, WALK + 0.08, 0.46],
    [0.06, WALK + 0.055, 0.39],
    [0.07, WALK - 0.02, 0.0],
  ];
  // Filter out plinth stone across open doorways
  const isDoorwayLedge = (x, z) => {
    // Cafe main west entrance (x: 43.0, z: 1.6..4.4)
    if (Math.abs(x - (CAFE.x - CAFE.w / 2)) < 0.35 && z > 1.6 && z < 4.4) return true;
    // Shop kiosk south entrance (z: 18.6, x: -33.4..-30.6)
    if (Math.abs(z - 18.6) < 0.35 && x > -33.4 && x < -30.6) return true;
    // Apartment south entrance
    if (Math.abs(z - (APARTMENT.z + APARTMENT.d / 2)) < 0.35 && Math.abs(x - APARTMENT.x) < 2.0) return true;
    // Graffiti east entrance
    if (Math.abs(x - (GRAFFITI.x + GRAFFITI.w / 2)) < 0.35 && Math.abs(z - GRAFFITI.z) < 2.0) return true;
    return false;
  };
  addMesh(ctx, curbGeometry(bldgBases, plinthProfile, { uvStep: 1.85, filterSeg: (x, z) => !isDoorwayLedge(x, z) }), M.curb, { shadow: false });

  // --- palm tree-pit planters along the promenade --------------------------------
  const r = rng(77);
  D.palmSpots = [];
  const palmFrames = [];
  const promenadeOff = 1.78;
  for (let s = 0; s < outlinePL.length; s += 8.5 + r() * 3) {
    if (inGap(s) || gaps.some((g) => Math.min(Math.abs(s - g.s), outlinePL.length - Math.abs(s - g.s)) < 4)) continue;
    const p = outlinePL.at(s);
    const x = p.x - p.tz * outSign * promenadeOff, z = p.z + p.tx * outSign * promenadeOff;
    if (pointInPolys(x, z, offsetPolys(roadsClosed, 0.6))) continue;
    if (pointInPolys(x, z, PLAZAS)) continue;
    if (D.crossings.some((c) => Math.hypot(c.x - x, c.z - z) < c.width / 2 + 3)) continue;
    if (pointInPolys(x, z, bufferLines(pathLines, 2.4, { round: true }))) continue;   // keep path ends open
    D.palmSpots.push([x, z]);
    palmFrames.push({ x, z, rot: Math.atan2(-p.tz, p.tx) });
  }
  // Promenade-aligned chamfered-square concrete tree-pit kerbs (1.42m x 1.42m, 20cm high, 22cm wide kerb wall)
  const planters = palmFrames.flatMap(({ x, z, rot }) => offsetPolys([rectPoly(x, z, 1.18, 1.18, rot)], 0.12, true));
  const planterSoil = palmFrames.flatMap(({ x, z, rot }) => offsetPolys([rectPoly(x, z, 0.84, 0.84, rot)], 0.08, true));
  if (planters.length) {
    addMesh(ctx, slabGeometry(planterSoil, WALK, WALK + 0.18, { uvTop: 1, sides: false }), M.soil, { walk: false });
    const planterCurbProfile = [
      [-0.22, WALK + 0.15, 1.0],
      [-0.21, WALK + 0.21, 0.90],
      [-0.03, WALK + 0.21, 0.45],
      [-0.01, WALK + 0.185, 0.39],
      [0.01, WALK - 0.02, 0.0],
    ];
    addMesh(ctx, curbGeometry(planters, planterCurbProfile, { uvStep: 1.45 }), M.curb, { walk: false });
    for (const [x, z] of D.palmSpots) ctx.colliders.push({ type: 'circle', x, z, r: 0.92 });
  }

  // shoreline rocks + all planting are generated by src/nature (procedural asset system)
}
