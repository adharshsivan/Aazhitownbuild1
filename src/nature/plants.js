import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { rng } from './random.js';
import { uvRect, uvBand, barkStrip, PLAIN_UV, frondProfile } from './atlas.js';

// Procedural plant generators. Every generator draws ALL random parameters from
// its seed first (independent of LOD) and then builds the requested LOD, so a
// LOD swap changes density, never silhouette.
//   lod 0: near (geometric leaflets, twigs, cupped clusters)
//   lod 1: mid (textured ribbons / fewer, larger clusters)
//   lod 2: far (minimal shells)
// Integrity rules: every leaf cluster hangs from a twig/stem point of the
// skeleton, and every plant's lowest geometry starts at (or slightly below)
// its local ground (y = 0) so nothing floats.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const range = (r, [a, b]) => a + r() * (b - a);
const dirAE = (az, el) => V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
const sideOf = (az) => V(-Math.sin(az), 0, Math.cos(az));
const plainStrip = { u0: PLAIN_UV[0], u1: PLAIN_UV[0] };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function randUnit(r) {
  const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
  return V(s * Math.cos(a), z, s * Math.sin(a));
}
function pickWeighted(r, list) {
  const tot = list.reduce((s, [, w]) => s + w, 0);
  let x = r() * tot;
  for (const [n, w] of list) { if ((x -= w) <= 0) return n; }
  return list[list.length - 1][0];
}
/** Perpendicular frame for a direction (side horizontal where possible). */
function frameFor(dir) {
  let side = new THREE.Vector3().crossVectors(dir, UP);
  if (side.lengthSq() < 1e-4) side = V(1, 0, 0); else side.normalize();
  const up = new THREE.Vector3().crossVectors(side, dir).normalize();
  if (up.y < 0) up.negate();
  return { side, up };
}

/** Gravity-bent midrib sampled into rows (shared by fronds, banana & strap leaves). */
function midrib(o, az, el, L, g, rows, minY = -Infinity) {
  const D = dirAE(az, el), side = sideOf(az);
  const out = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, s = t * L;
    const p = o.clone().addScaledVector(D, s).add(V(0, -g * s * s, 0));
    if (p.y < minY) p.y = minY;
    const T = D.clone().add(V(0, -2 * g * s, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, T).normalize();
    if (up.y < 0) up.negate();
    out.push({ t, p, T, up, side });
  }
  return out;
}
function sampleRib(rib, t) {
  const f = t * (rib.length - 1), i = Math.min(rib.length - 2, Math.floor(f)), k = f - i;
  const a = rib[i], b = rib[i + 1];
  return { p: a.p.clone().lerp(b.p, k), T: a.T.clone().lerp(b.T, k).normalize(), up: a.up.clone().lerp(b.up, k).normalize(), side: a.side };
}

/** Folded ribbon leaf (mid/far fronds, banana, strap leaves). */
function ribbonLeaf(b, rib, rect, wMax, widthFn, o) {
  const widen = o.widen || 1;
  b.ribbon(rib.map((rw) => ({
    p: rw.p, side: rw.side, up: rw.up, t: rw.t,
    w: wMax * widthFn(rw.t) * widen,
    fold: lerp(o.fold[0], o.fold[1], rw.t),
    color: mul(o.color, o.ao ? o.ao(rw.t) : 1),
    wind: o.wind(rw.t), flutter: (o.flutter || 0) * rw.t,
  })), rect, wMax * widen, o.upBias ?? 0.45);
}

// ---------------------------------------------------------------------------
// Palms
// ---------------------------------------------------------------------------
/**
 * Packs structural trunk/branch cantilever sway (`wTrunk` in 0..3.5) and foliar
 * frond/leaf whip (`wLeaf` in 0..0.95) + leaf translucency flag (`isLeaf` via sign)
 * into the single `wind` float attribute.
 */
export function packWind(wTrunk, wLeaf = 0, isLeaf = wLeaf > 0.0005) {
  const t = Math.round(Math.max(0, Math.min(3.5, wTrunk)) * 500);
  const l = Math.max(0, Math.min(0.95, wLeaf));
  const v = t + l;
  return isLeaf ? Math.max(0.001, v) : -v;
}

export const PALMS = {
  coconutTall: { height: [10.2, 13.0], lean: [0.06, 0.16], rBase: 0.21, rTop: 0.145, frondN: 20, frondL: 4.6, wMax: 0.95, elTop: 1.25, elBot: -0.58, g: [0.02, 0.105], dead: 0, nuts: true, leafletLen: 0.95, flex: 0.44 },
  coconutLean: { height: [8.4, 10.6], lean: [0.22, 0.38], rBase: 0.22, rTop: 0.145, frondN: 19, frondL: 4.4, wMax: 0.92, elTop: 1.22, elBot: -0.62, g: [0.02, 0.11], dead: 0, nuts: true, leafletLen: 0.92, flex: 0.42 },
  coconutMid: { height: [6.8, 8.8], lean: [0.08, 0.20], rBase: 0.22, rTop: 0.155, frondN: 20, frondL: 4.2, wMax: 0.9, elTop: 1.2, elBot: -0.52, g: [0.02, 0.1], dead: 0, nuts: true, leafletLen: 0.88, flex: 0.34 },
  coconutYoung: { height: [3.2, 4.6], lean: [0.05, 0.14], rBase: 0.26, rTop: 0.2, frondN: 16, frondL: 3.8, wMax: 0.85, elTop: 1.3, elBot: -0.22, g: [0.01, 0.07], dead: 0, nuts: false, leafletLen: 0.8, flex: 0.18 },
  areca: { isAreca: true, height: [8.0, 9.8], lean: [0.015, 0.04], rBase: 0.064, rTop: 0.048, frondN: 8, frondL: 1.72, wMax: 0.44, elTop: 1.36, elBot: 0.48, g: [0.012, 0.036], dead: 0, nuts: false, crownshaft: true, leafletLen: 0.42, flex: 0.46 },
};

const FROND_Q = [{ density: 1, widthK: 1.4, segs: 2, rachis: 4 }, { density: 0.55, widthK: 2.1, segs: 1, rachis: 3 }, { density: 0.3, widthK: 2.9, segs: 1, rachis: 0 }];
const leafletProfile = (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + 0.88 * t)), 0.6);

/** Near-LOD coconut frond: real rachis + individually modelled, drooping leaflets + continuous core web. */
function geometricFrond(b, rib, f, P, rr, dry, q = { density: 1, widthK: 1.4, segs: 2, rachis: 4 }, crownFlex = 0.4) {
  const dryStage = f.dryStage || (dry ? 1.0 : 0.0);
  const useDryAtlas = dry || dryStage > 0.62;
  const rectGreen = uvRect('leaflet', 3);
  const rectDry = uvRect('leafletDry', 3);
  const frondRect = uvRect(useDryAtlas ? 'frondDry' : 'frond', 6);
  const L = f.L;
  const trunkAt = (t) => crownFlex + 0.12 * t;
  const leafWhipAt = (t) => (0.03 * t + 0.34 * Math.pow(t, 1.55)) * (dry ? 0.72 : 1.0);
  // rachis (petiole thick at the base, whip-thin at the tip; welded to crownFlex at t = 0)
  const rachisGreen = [lerp(0.50, 0.64, f.yellow), lerp(0.60, 0.56, f.yellow), lerp(0.30, 0.24, f.yellow)];
  const rachisDry = f.weatheredGrey ? [0.54, 0.47, 0.38] : [0.58, 0.43, 0.25];
  const rachisBase = dryStage > 0 ? mix3(rachisGreen, rachisDry, clamp01(dryStage * 1.15)) : rachisGreen;
  if (q.rachis) b.tube(rib.map((x) => x.p), rib.map((x) => lerp(0.055, 0.01, Math.pow(x.t, 0.7))), {
    radial: q.rachis, strip: plainStrip, vPerM: 0, vOff: PLAIN_UV[1],
    color: (t) => mul(rachisBase, 0.82 + 0.18 * t),
    wind: (t) => packWind(trunkAt(t), leafWhipAt(t), false),
  });
  // Natural frond coloration: fresh emerald on upper fronds, warm olive-gold on older lower fronds,
  // and sun-cured ochre-tan / cinnamon-brown / weathered ash-brown on old senescent fronds
  let base;
  if (useDryAtlas) {
    // Tints the warm tan/brown frondDry & leafletDry atlas tiles across a realistic range of old frond hues
    const warmTan = [f.shade * 1.06, f.shade * 0.94, f.shade * 0.78];
    const deepRusset = [f.shade * 0.92, f.shade * 0.76, f.shade * 0.58];
    const greyBrown = [f.shade * 0.86, f.shade * 0.82, f.shade * 0.76];
    base = f.weatheredGrey
      ? mix3(warmTan, greyBrown, 0.65)
      : mix3(warmTan, deepRusset, clamp01((dryStage - 0.6) * 2.2));
  } else {
    base = [
      f.shade * lerp(0.84, 1.04, f.yellow),
      f.shade * lerp(0.92, 0.82, f.yellow * 0.75),
      f.shade * lerp(0.84, 0.46, f.yellow),
    ];
  }
  // continuous folded frond web along the rachis so crowns stay lush and full at all distances
  ribbonLeaf(b, rib, frondRect, P.wMax * (useDryAtlas ? 0.46 : 0.62), frondProfile, {
    widen: 1, fold: useDryAtlas ? [0.32, 0.62] : [0.22, 0.48], color: base, ao: (t) => 0.76 + 0.24 * t,
    wind: (t) => packWind(trunkAt(t), leafWhipAt(t), true), flutter: useDryAtlas ? 0.016 : 0.025, upBias: 0.55,
  });
  const N = Math.round(46 * (L / 4.4));
  const M = Math.max(6, Math.round(N * q.density));
  for (const sgn of [-1, 1]) {
    for (let m = 0; m < M; m++) {
      const i = Math.min(N - 1, Math.round((m + 0.5) * N / M - 0.5));
      const lq = rr[(sgn > 0 ? N : 0) + i];
      if (lq.miss && q.density > 0.5) continue;
      const t = 0.07 + 0.91 * (i + 0.5 + lq.j) / N;
      const s = sampleRib(rib, t);
      const ll = P.leafletLen * (L / P.frondL) * leafletProfile(t) * lq.len;
      if (ll < 0.06) continue;
      const isLeafletDry = useDryAtlas || Boolean(lq.dryPinna);
      const rect = isLeafletDry ? rectDry : rectGreen;
      const fold = lerp(0.28, 0.72, t) + lq.fold + (isLeafletDry ? 0.22 : 0);
      const out = s.side.clone().multiplyScalar(sgn * Math.cos(fold)).addScaledVector(s.up, -Math.sin(fold)).normalize();
      const fwd = 0.45 + 0.3 * t;
      const dir = out.clone().multiplyScalar(Math.cos(fwd)).addScaledVector(s.T, Math.sin(fwd)).normalize();
      const droop = ll * (0.08 + 0.28 * t + 0.2 * f.a + lq.droop + (isLeafletDry ? 0.20 : 0));
      const B = s.p.clone().addScaledVector(out, 0.02);
      const pts = [B, B.clone().addScaledVector(dir, ll * 0.5).add(V(0, -droop * 0.3, 0)), B.clone().addScaledVector(dir, ll).add(V(0, -droop, 0))];
      const hw = (0.028 * (ll / 0.9) + 0.009) * q.widthK * (isLeafletDry ? 0.88 : 1);
      const widths = q.segs === 1 ? [hw * 0.9, hw, hw * 0.35] : [hw * 0.78, hw, hw * 0.22];
      let pinnaBase = base;
      if (!useDryAtlas && isLeafletDry) {
        // Individual dried brown-gold pinna on a half-senescent transitional frond
        pinnaBase = [f.shade * 1.04, f.shade * 0.90, f.shade * 0.70];
      } else if (lq.amber && !useDryAtlas) {
        pinnaBase = [base[0] * 1.14, base[1] * 0.88, base[2] * 0.55];
      }
      const tint = mul(pinnaBase, lq.tint);
      const tipC = (isLeafletDry || f.yellow > 0.48)
        ? [tint[0] * 0.94, tint[1] * 0.84, tint[2] * 0.72]
        : mul(tint, 0.98);
      const ids = [];
      for (const k of (q.segs === 1 ? [0, 2] : [0, 1, 2])) {
        const seg = (k < 2 ? pts[k + 1].clone().sub(pts[k]) : pts[2].clone().sub(pts[1])).normalize();
        const leafUp = s.up.clone().addScaledVector(UP, 0.45).normalize();
        const wv = new THREE.Vector3().crossVectors(seg, leafUp).normalize();
        const nrm = new THREE.Vector3().crossVectors(wv, seg).normalize();
        if (nrm.y < 0) nrm.negate();
        nrm.addScaledVector(UP, 0.55).normalize();
        const col = k === 0 ? mul(tint, 0.76) : k === 1 ? tint : tipC;
        const w = packWind(trunkAt(t), leafWhipAt(t) + 0.08 * (k / 2), true);
        const u = rect.u0 + (rect.u1 - rect.u0) * (k / 2);
        ids.push(b.vert(pts[k].clone().addScaledVector(wv, widths[k]), nrm, u, rect.v0, col, w));
        ids.push(b.vert(pts[k].clone().addScaledVector(wv, -widths[k]), nrm, u, rect.v1, col, w));
      }
      for (let k = 0; k + 3 < ids.length; k += 2) b.quad(ids[k], ids[k + 2], ids[k + 3], ids[k + 1]);
    }
  }
}

/**
 * Areca frond: compact, V-keeled (upward-angled pinnae forming a crisp V-trough above
 * the rachis), brightly sunlit lime-emerald foliage, stiffly ascending shuttlecock habit.
 */
function arecaFrond(b, rib, f, P, rr, q = { density: 1, widthK: 1.4, segs: 2, rachis: 4 }, crownFlex = 0.4, scale = 1) {
  const rect = uvRect('leaflet', 3);
  const frondRect = uvRect('frond', 6);
  const L = f.L;
  const trunkAt = (t) => crownFlex + 0.10 * t;
  const leafWhipAt = (t) => 0.025 * t + 0.24 * Math.pow(t, 1.5);
  const rachisCol = [0.46, 0.68, 0.26];
  if (q.rachis) b.tube(rib.map((x) => x.p), rib.map((x) => lerp(0.028 * scale, 0.006 * scale, Math.pow(x.t, 0.75))), {
    radial: q.rachis, strip: plainStrip, vPerM: 0, vOff: PLAIN_UV[1],
    color: (t) => mul(rachisCol, 0.86 + 0.16 * t),
    wind: (t) => packWind(trunkAt(t), leafWhipAt(t), false),
  });
  // Fresh, vibrant tropical lime-emerald hue distinct from darker coastal coconut fronds
  const base = [
    f.shade * lerp(0.84, 0.96, f.yellow),
    f.shade * lerp(0.96, 0.92, f.yellow * 0.5),
    f.shade * lerp(0.70, 0.54, f.yellow),
  ];
  // Upward-cupped V-keel ribbon web (negative fold opens upward into a V-trough)
  ribbonLeaf(b, rib, frondRect, P.wMax * scale * 0.68, frondProfile, {
    widen: 1, fold: [-0.36, -0.52], color: base, ao: (t) => 0.82 + 0.18 * t,
    wind: (t) => packWind(trunkAt(t), leafWhipAt(t), true), flutter: 0.02, upBias: 0.65,
  });
  const N = Math.max(14, Math.round(28 * (L / 1.75)));
  const M = Math.max(6, Math.round(N * q.density));
  for (const sgn of [-1, 1]) {
    for (let m = 0; m < M; m++) {
      const i = Math.min(N - 1, Math.round((m + 0.5) * N / M - 0.5));
      const lq = rr[(sgn > 0 ? N : 0) + i] || rr[i % rr.length];
      const t = 0.10 + 0.88 * (i + 0.5 + lq.j * 0.5) / N;
      const s = sampleRib(rib, t);
      const ll = P.leafletLen * scale * leafletProfile(t) * lq.len;
      if (ll < 0.045) continue;
      // Upward V-keel angle (+Math.sin(fold) along s.up so pinnae rise in a V above the midrib!)
      const vLift = lerp(0.38, 0.56, t) + lq.fold * 0.5;
      const out = s.side.clone().multiplyScalar(sgn * Math.cos(vLift)).addScaledVector(s.up, Math.sin(vLift)).normalize();
      const fwd = 0.60 + 0.24 * t;
      const dir = out.clone().multiplyScalar(Math.cos(fwd)).addScaledVector(s.T, Math.sin(fwd)).normalize();
      const tipArch = ll * (0.03 + 0.09 * t * t);
      const B = s.p.clone().addScaledVector(out, 0.012);
      const pts = [
        B,
        B.clone().addScaledVector(dir, ll * 0.52).add(V(0, tipArch * 0.25, 0)),
        B.clone().addScaledVector(dir, ll).add(V(0, -tipArch * 0.45, 0)),
      ];
      const hw = (0.024 * (ll / 0.42) + 0.008) * q.widthK;
      const widths = q.segs === 1 ? [hw * 0.88, hw, hw * 0.38] : [hw * 0.78, hw * 1.04, hw * 0.26];
      const tint = mul(base, lq.tint);
      const tipC = [tint[0] * 0.99, tint[1] * 0.97, tint[2] * 0.84];
      const ids = [];
      for (const k of (q.segs === 1 ? [0, 2] : [0, 1, 2])) {
        const seg = (k < 2 ? pts[k + 1].clone().sub(pts[k]) : pts[2].clone().sub(pts[1])).normalize();
        const leafUp = s.up.clone().addScaledVector(UP, 0.55).normalize();
        const wv = new THREE.Vector3().crossVectors(seg, leafUp).normalize();
        const nrm = new THREE.Vector3().crossVectors(wv, seg).normalize();
        if (nrm.y < 0) nrm.negate();
        nrm.addScaledVector(UP, 0.6).normalize();
        const col = k === 0 ? mul(tint, 0.80) : k === 1 ? tint : tipC;
        const w = packWind(trunkAt(t), leafWhipAt(t) + 0.06 * (k / 2), true);
        const u = rect.u0 + (rect.u1 - rect.u0) * (k / 2);
        ids.push(b.vert(pts[k].clone().addScaledVector(wv, widths[k]), nrm, u, rect.v0, col, w));
        ids.push(b.vert(pts[k].clone().addScaledVector(wv, -widths[k]), nrm, u, rect.v1, col, w));
      }
      for (let k = 0; k + 3 < ids.length; k += 2) b.quad(ids[k], ids[k + 2], ids[k + 3], ids[k + 1]);
    }
  }
}

/**
 * Dedicated Areca Palm generator (Areca catechu / clustered bamboo-cane palm):
 * - 2 to 3 ultra-slender, vertical, bamboo-ringed stems of graduated heights rising from a tight clump
 *   (silver-grey lower trunk with crisp white nodal rings -> celadon mid-trunk -> green upper internodes)
 * - Long, sleek, glossy emerald-jade tubular crownshaft fully exposed below the ascending fronds
 * - Compact, upright, V-keeled shuttlecock plume of recurved feathery fronds + young basal cane shoots
 */
function arecaPalm(seed, lod, P) {
  const r = rng(seed);
  const lodIdx = Math.min(2, Math.max(0, lod | 0));
  const segs = lodIdx === 0 ? 16 : lodIdx === 1 ? 10 : 7;
  const radial = lodIdx === 0 ? 8 : lodIdx === 1 ? 6 : 5;
  const ribRows = lodIdx === 0 ? 8 : lodIdx === 1 ? 5 : 4;

  // Pre-draw all random parameters for 3 graduated stems + basal shoots so LOD0/1/2 share identical silhouettes
  const nStems = 2 + (seed % 2); // 2 or 3 graduated ringed canes per clump
  const clumpAz0 = r() * Math.PI * 2;
  const mainH = range(r, P.height);
  const stems = [];

  for (let si = 0; si < nStems; si++) {
    const heightScale = si === 0 ? 1.0 : si === 1 ? 0.66 + 0.10 * r() : 0.42 + 0.09 * r();
    const H = mainH * heightScale;
    const stemScale = si === 0 ? 1.0 : si === 1 ? 0.84 : 0.70;
    const az = clumpAz0 + si * ((Math.PI * 2) / nStems) + (r() - 0.5) * 0.35;
    const baseOffset = si === 0 ? 0.04 : (0.14 + 0.05 * r()) * (si === 1 ? 1 : 1.12);
    // Pencil-straight vertical habit with gentle outward separation between companion canes
    const lean = si === 0 ? 0.015 + r() * 0.022 : (0.042 + r() * 0.032) * (si === 1 ? 1 : 1.15);
    const wob = (r() - 0.5) * 0.06;
    const rBase = P.rBase * stemScale * (0.94 + 0.12 * r());
    const rTop = P.rTop * stemScale * (0.94 + 0.12 * r());
    const vOff = r();
    const nFronds = Math.max(6, Math.round((P.frondN + (si === 0 ? 2 : 0)) * (0.82 + 0.18 * stemScale)));
    const fronds = [];
    for (let k = 0; k < nFronds; k++) {
      const a = k / Math.max(1, nFronds - 1);
      const N = 34;
      const leaflets = [];
      for (let i = 0; i < 2 * N + 2; i++) {
        leaflets.push({
          j: (r() - 0.5) * 0.3,
          len: 0.92 + r() * 0.16,
          fold: (r() - 0.5) * 0.10,
          tint: 0.94 + r() * 0.12,
        });
      }
      // Steeply ascending shuttlecock crown (all fronds angle upward, keeping the long green crownshaft 100% visible)
      fronds.push({
        a,
        az: k * 2.39996 + si * 1.1 + (r() - 0.5) * 0.28,
        el: lerp(P.elTop, P.elBot, Math.pow(a, 0.78)) + (r() - 0.5) * 0.10,
        L: P.frondL * (0.76 + 0.24 * stemScale) * (0.92 + 0.16 * r()) * (a < 0.22 ? 0.78 + 1.0 * a : 1.0),
        g: lerp(P.g[0], P.g[1], a) * (0.88 + 0.24 * r()),
        shade: 0.92 + 0.14 * r(),
        yellow: Math.pow(a, 1.8) * 0.24 + r() * 0.06,
        leaflets,
      });
    }
    stems.push({ si, H, stemScale, az, baseOffset, lean, wob, rBase, rTop, vOff, fronds });
  }

  // Basal young palm shoots at ground level
  const nShoots = 5;
  const shoots = [];
  for (let i = 0; i < nShoots; i++) {
    shoots.push({
      az: i * 2.39996 + r() * 0.4,
      el: 0.82 + r() * 0.38,
      L: 0.72 + r() * 0.36,
      g: 0.06 + r() * 0.05,
    });
  }

  const b = new GeoBuilder();
  const arecaBark = barkStrip('arecaBark');

  for (const st of stems) {
    const { H, stemScale, az, baseOffset, lean, wob, rBase, rTop, vOff, fronds } = st;
    const stemFlex = (P.flex || 0.46) * (H / 9.2);
    const ld = V(Math.cos(az), 0, Math.sin(az));
    const wd = V(-Math.sin(az), 0, Math.cos(az));
    const path = [], radii = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // Straight, slender bamboo-like column with gentle outward separation and slight phototropic lift near the top
      const outReach = baseOffset + lean * H * (Math.pow(t, 1.12) - 0.18 * Math.pow(t, 2.4));
      const lat = wob * H * Math.sin(Math.PI * t) * 0.025;
      path.push(V(0, H * t - (i === 0 ? 0.10 : 0), 0).addScaledVector(ld, outReach).addScaledVector(wd, lat));
      // Almost uniform cylindrical bamboo cane (only minimal basal root collar)
      const rootCollar = rBase * 0.14 * Math.pow(Math.max(0, 1 - (t * H) / 0.45), 2);
      radii.push(lerp(rBase, rTop, Math.pow(t, 0.85)) + rootCollar);
    }

    // Ringed Areca trunk: weathered silver-grey lower cane -> celadon mid-trunk -> fresh bamboo-green upper internodes
    b.tube(path, radii, {
      radial,
      strip: arecaBark,
      vPerM: 1 / (1.85 * stemScale),
      vOff,
      flatBase: true,
      color: (t) => {
        const greenTop = Math.pow(clamp01((t - 0.52) / 0.48), 1.3);
        const col = [
          lerp(0.86, 0.56, greenTop),
          lerp(0.88, 0.88, greenTop),
          lerp(0.82, 0.46, greenTop),
        ];
        const baseAo = 0.76 + 0.24 * Math.min(1, (t * H) / 0.8);
        return mul(col, baseAo);
      },
      wind: (t) => packWind(stemFlex * Math.pow(t, 1.7), 0, false),
    });

    const top = path[segs];
    const T = path[segs].clone().sub(path[segs - 1]).normalize();

    // Long, sleek, glossy emerald-jade tubular crownshaft (1.35m on main stem, completely exposed below the upright fronds)
    const csLen = 1.38 * (0.78 + 0.22 * stemScale);
    const cs = [0, 0.18, 0.52, 0.86, 1.0].map((s) => top.clone().addScaledVector(T, s * csLen));
    const csRadii = [
      rTop * 1.04,
      rTop * 1.30,
      rTop * 1.22,
      rTop * 1.12,
      rTop * 0.94,
    ];
    b.tube(cs, csRadii, {
      radial,
      strip: plainStrip,
      vPerM: 0,
      vOff: PLAIN_UV[1],
      color: (t) => [lerp(0.24, 0.36, t), lerp(0.56, 0.70, t), lerp(0.18, 0.24, t)],
      wind: (t) => packWind(stemFlex * (1 + 0.05 * t), 0, false),
    });
    const crown = cs[4];

    // Erect, V-keeled shuttlecock fronds emerging from the apex of the crownshaft
    for (const f of fronds) {
      const o = crown.clone().add(V(Math.cos(f.az) * rTop * 0.55, -0.02, Math.sin(f.az) * rTop * 0.55));
      arecaFrond(b, midrib(o, f.az, f.el, f.L, f.g, ribRows), f, P, f.leaflets, FROND_Q[lodIdx], stemFlex, 0.78 + 0.22 * stemScale);
    }
  }

  // Young feathery basal palm shoots grounding the multi-stem Areca clump
  const frondRect = uvRect('frond', 6);
  for (const sh of shoots) {
    const o = V(Math.cos(sh.az) * 0.12, 0.02, Math.sin(sh.az) * 0.12);
    ribbonLeaf(b, midrib(o, sh.az, sh.el, sh.L, sh.g, 5, 0.05), frondRect, 0.22, frondProfile, {
      widen: 1,
      fold: [-0.30, -0.45],
      color: [0.88, 1.04, 0.72],
      ao: (t) => 0.72 + 0.28 * t,
      wind: (t) => packWind(0.05 * t, 0.06 + 0.16 * t * t, true),
      flutter: 0.018,
      upBias: 0.6,
    });
  }

  const g = b.build();
  g.userData.height = mainH + 1.5;
  g.userData.leanAz = clumpAz0;
  g.userData.canopy = P.frondL * 0.85;
  return g;
}

export function palm(seed, lod, P) {
  if (P.isAreca || P.nuts === 'areca') return arecaPalm(seed, lod, P);
  const r = rng(seed);
  const H = range(r, P.height), lean = range(r, P.lean), leanAz = r() * Math.PI * 2;
  const curveStyle = seed % 4; // 0: classic S-curve, 1: sweeping coastal arc, 2: lower dogleg crook, 3: double wave
  const wob = (r() - 0.5) * 0.65, wobAz = leanAz + Math.PI / 2 + (r() - 0.5) * 0.4;
  const rBase = P.rBase * (0.9 + 0.2 * r()), rTop = P.rTop * (0.9 + 0.2 * r());
  const vOff = r();
  const palmFlex = (P.flex || 0.4) * (H / 10.5);
  const n = P.frondN + Math.floor(r() * 4);
  const crownAz0 = r() * Math.PI * 2; // Randomize phyllotaxis start angle so no two trees share frond directions

  // Natural old-frond distribution:
  // - Roughly half of coconut palms have 0 old fronds (clean green crown).
  // - The other half get 1 to 3 irregular old fronds (some sun-cured brown & hanging low, some transitional
  //   ochre/bronze-yellow with mixed dry pinnae) placed at non-uniform lower-crown slots so it never reads as a pattern.
  const isMatureCoconut = Boolean(P.nuts && P.nuts !== 'areca');
  const oldRoll = r();
  let nOldFronds = 0;
  if (isMatureCoconut) {
    // Irregular per-seed roll: ~46% have 0 old fronds, ~28% have 1, ~18% have 2, ~8% have 3
    if (oldRoll >= 0.46 && oldRoll < 0.74) nOldFronds = 1;
    else if (oldRoll >= 0.74 && oldRoll < 0.92) nOldFronds = 2;
    else if (oldRoll >= 0.92) nOldFronds = 3;
  } else {
    // Young coconut palms: ~75% completely clean, ~25% have 1 small aging/dry lower frond
    if (oldRoll > 0.75) nOldFronds = 1;
  }

  // Pick irregular slots among the lowest 6 fronds (with randomized senescence stage per picked frond)
  const oldSlotMap = new Map();
  if (nOldFronds > 0) {
    const pool = [n - 1, n - 2, n - 3, n - 4, n - 5].filter((idx) => idx >= Math.floor(n * 0.65));
    for (let c = 0; c < nOldFronds && pool.length > 0; c++) {
      // Bias slightly toward lower indices but allow gaps so old fronds don't form a neat consecutive sequence
      const pickIdx = Math.min(pool.length - 1, Math.floor(Math.pow(r(), 1.35) * pool.length));
      const slot = pool.splice(pickIdx, 1)[0];
      // Stage: either a fully dried hanging brown frond (0.72..1.0) or a transitional golden-bronze/half-brown frond (0.45..0.72)
      const dryStage = c === 0
        ? (r() < 0.72 ? 0.76 + 0.24 * r() : 0.48 + 0.24 * r())
        : 0.44 + 0.54 * r();
      oldSlotMap.set(slot, {
        dryStage,
        weatheredGrey: dryStage > 0.82 && r() < 0.35,
        azJitter: (r() - 0.5) * 0.95, // break spiral regularity for drooping old fronds
        extraDroopEl: 0.14 + dryStage * (0.18 + 0.26 * r()),
        lenMult: 0.74 + 0.22 * r(),   // old fronds often have slightly weathered/broken tips
        gravMult: 1.15 + dryStage * (0.22 + 0.28 * r()),
      });
    }
  }

  const fronds = [];
  for (let k = 0; k < n; k++) {
    const a = k / (n - 1);
    const oldInfo = oldSlotMap.get(k) || null;
    const dryStage = oldInfo ? oldInfo.dryStage : 0;
    const isDry = dryStage > 0.65;
    const isAging = dryStage > 0 && !isDry;
    const N = Math.round(46 * 1.25);
    const leaflets = [];
    for (let i = 0; i < 2 * N + 2; i++) {
      leaflets.push({
        miss: r() < (isDry ? 0.05 + 0.07 * r() : isAging ? 0.03 : 0.012),
        j: (r() - 0.5) * 0.4,
        len: (0.90 + r() * 0.18) * (isDry ? 0.84 + 0.16 * r() : 1),
        fold: (r() - 0.5) * 0.14 + (oldInfo ? 0.08 * dryStage : 0),
        droop: (r() - 0.5) * 0.08 + (oldInfo ? 0.10 * dryStage : 0),
        tint: 0.90 + r() * 0.18,
        amber: isAging && r() < 0.42,
        dryPinna: isAging && r() < (0.25 + 0.45 * dryStage),
      });
    }
    const yellowAmt = oldInfo
      ? clamp01(0.55 + 0.45 * dryStage + (r() - 0.5) * 0.12)
      : Math.pow(a, 1.8) * 0.18 + r() * 0.05;
    const baseEl = lerp(P.elTop, P.elBot, Math.pow(a, 0.85)) + (r() - 0.5) * 0.22;
    fronds.push({
      a,
      az: crownAz0 + k * 2.39996 + (oldInfo ? oldInfo.azJitter : (r() - 0.5) * 0.48),
      el: oldInfo ? Math.max(-1.18, Math.min(P.elBot - 0.08, baseEl - oldInfo.extraDroopEl)) : baseEl,
      L: P.frondL * (0.86 + 0.28 * r()) * (a < 0.25 ? 0.65 + 1.4 * a : oldInfo ? oldInfo.lenMult : 1),
      g: lerp(P.g[0], P.g[1], a) * (0.82 + 0.36 * r()) * (oldInfo ? oldInfo.gravMult : 1),
      shade: (oldInfo ? 0.84 + 0.20 * r() : 0.9 + 0.14 * r()),
      yellow: yellowAmt,
      dry: isDry,
      dryStage,
      weatheredGrey: Boolean(oldInfo && oldInfo.weatheredGrey),
      leaflets,
    });
  }

  const b = new GeoBuilder();
  const lodIdx = Math.min(2, Math.max(0, lod | 0));
  const segs = lodIdx === 0 ? 20 : lodIdx === 1 ? 12 : 8;
  const radial = lodIdx === 0 ? 11 : lodIdx === 1 ? 7 : 5;
  const ribRows = lodIdx === 0 ? 9 : lodIdx === 1 ? 6 : 4;
  const ld = V(Math.cos(leanAz), 0, Math.sin(leanAz)), wd = V(Math.cos(wobAz), 0, Math.sin(wobAz));
  const path = [], radii = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    let h;
    if (curveStyle === 0) {
      // Classic Kerala coastal S-curve: emerges upright from soil then sweeps gracefully
      h = lean * H * (Math.pow(t, 1.45) * 1.32 - 0.38 * Math.pow(t, 2.5));
    } else if (curveStyle === 1) {
      // Sweeping graceful coastal arc
      h = lean * H * Math.pow(t, 1.55) * 0.92;
    } else if (curveStyle === 2) {
      // Gentle lower curve then straighter upper trunk
      h = lean * H * Math.pow(t, 1.30) * (1 - 0.28 * t);
    } else {
      // Smooth coastal inflection
      h = lean * H * (Math.pow(t, 1.45) * 0.85 + 0.08 * Math.sin(Math.PI * 1.5 * t) * t);
    }
    const latSway = wob * Math.sin(Math.PI * t) * t * 0.038 * H;
    path.push(V(0, H * t - 0.12, 0).addScaledVector(ld, h).addScaledVector(wd, latSway));
    radii.push(rTop + (rBase - rTop) * Math.pow(1 - t, 1.35) + rBase * 0.38 * Math.pow(Math.max(0, 1 - (t * H) / 0.70), 2));
  }
  const tint = P.trunkTint || [1, 1, 1];
  b.tube(path, radii, {
    radial, strip: barkStrip('palmBark'), vPerM: 1 / 4.2, vOff, flatBase: true,
    color: (t) => mul([lerp(0.78, 0.96, Math.min(1, t * 1.8)) * tint[0], lerp(0.75, 0.92, Math.min(1, t * 1.8)) * tint[1], lerp(0.70, 0.85, Math.min(1, t * 1.8)) * tint[2]],
      0.72 + 0.28 * Math.min(1, (t * H) / 0.9)),
    wind: (t) => packWind(palmFlex * Math.pow(t, 1.75), 0, false),
  });
  const top = path[segs], T = path[segs].clone().sub(path[segs - 1]).normalize();
  const cs = [-0.15, 0.15, 0.45, 0.62].map((s) => top.clone().addScaledVector(T, s));
  b.tube(cs, [rTop * 1.05, rTop * 1.75, rTop * 1.45, rTop * 0.5], {
    radial, strip: barkStrip('palmBark'), vPerM: 0.8, vOff,
    color: () => [0.55, 0.46, 0.34],
    wind: () => packWind(palmFlex, 0, false),
  });
  const crown = cs[2];
  fronds.forEach((f) => {
    const o = crown.clone().add(V(Math.cos(f.az) * 0.1, f.dryStage > 0.5 ? -0.13 : -0.08, Math.sin(f.az) * 0.1));
    geometricFrond(b, midrib(o, f.az, f.el, f.L, f.g, ribRows), f, P, f.leaflets, Boolean(f.dry), FROND_Q[lodIdx], palmFlex);
  });

  // Coconut bunches: 2-3 tight peduncle stalks hanging directly under the woven crown (`crown`) with clustered ovoid tender green/golden coconuts
  if (P.nuts) {
    const nBunches = 2 + (seed % 2);
    const bunchAz0 = r() * Math.PI * 2;
    const isGoldenVar = seed % 3 === 1;
    const nutBase = isGoldenVar ? [0.62, 0.52, 0.18] : [0.40, 0.52, 0.18];
    for (let bi = 0; bi < nBunches; bi++) {
      const bAz = bunchAz0 + (bi / nBunches) * Math.PI * 2 + (r() - 0.5) * 0.45;
      const outDir = V(Math.cos(bAz), 0, Math.sin(bAz));
      const sideDir = V(-outDir.z, 0, outDir.x);
      const stalkStart = crown.clone().add(V(0, -0.06, 0)).addScaledVector(outDir, rTop * 0.9);
      const stalkMid = stalkStart.clone().addScaledVector(outDir, 0.16).add(V(0, -0.10, 0));
      const stalkEnd = stalkMid.clone().addScaledVector(outDir, 0.09).add(V(0, -0.18, 0));
      b.tube([stalkStart, stalkMid, stalkEnd], [0.032, 0.022, 0.014], {
        radial: 5, strip: plainStrip, vPerM: 0, vOff: PLAIN_UV[1],
        color: () => [0.54, 0.48, 0.24],
        wind: () => packWind(palmFlex, 0.02, false),
      });
      const nNuts = 3 + Math.floor(r() * 3);
      for (let k = 0; k < nNuts; k++) {
        const ka = (k / nNuts) * Math.PI * 2 + r() * 0.35;
        const center = stalkMid.clone().lerp(stalkEnd, 0.35 + 0.55 * (k / nNuts))
          .addScaledVector(outDir, Math.cos(ka) * 0.075)
          .addScaledVector(sideDir, Math.sin(ka) * 0.075)
          .add(V(0, -0.03 * (k % 2), 0));
        const col = mul(nutBase, 0.88 + r() * 0.22);
        b.sphere(center, 0.095 + r() * 0.018, 8, 6, PLAIN_UV, col, packWind(palmFlex, 0.02, false), 1.24);
      }
    }
  }
  const g = b.build();
  g.userData.height = H;
  g.userData.leanAz = leanAz;
  g.userData.canopy = P.frondL * 0.8;
  return g;
}

// ---------------------------------------------------------------------------
// Official dgreenheck/ez-tree Procedural Tree & Shrub Generator:
//  - Exact port of `dgreenheck/ez-tree` (`src/lib/rng.js`, `src/lib/tree.js`,
//    and all 15 preset JSONs in `src/lib/presets/*.json`).
//  - Supports both `TreeType.Deciduous` and `TreeType.Evergreen` (conical whorl
//    taper `1 - childBranchStart`, monopodial spire trunk).
//  - Runs skeleton growth in ez-tree's native coordinate space so nonlinear
//    `gnarliness / sqrt(radius)` and `force.strength / radius` curves match
//    `eztree.dev` 1:1, then scales uniformly to world meters.
//  - Built-in 3-tier LOD optimization (`lod = 0, 1, 2`) for BatchedMesh rendering.
// ---------------------------------------------------------------------------
class EzRNG {
  constructor(seed) {
    this.m_w = (123456789 + seed) & 0xffffffff;
    this.m_z = (987654321 - seed) & 0xffffffff;
  }
  random(max = 1, min = 0) {
    this.m_z = (36969 * (this.m_z & 65535) + (this.m_z >> 16)) & 0xffffffff;
    this.m_w = (18000 * (this.m_w & 65535) + (this.m_w >> 16)) & 0xffffffff;
    let result = ((this.m_z << 16) + (this.m_w & 65535)) >>> 0;
    result /= 4294967296;
    return (max - min) * result + min;
  }
}

function hexToEzTint(hex) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return [0.30 + 0.56 * r, 0.30 + 0.56 * g, 0.30 + 0.56 * b];
}

export const TREES = {
  // ---- ASH (ash_small.json, ash_medium.json, ash_large.json) ----
  ashSmall: {
    kind: 'ashSmall',
    family: 'ash',
    worldScale: 0.42,
    type: 'deciduous',
    bark: { type: 'ash', tint: 14733509 },
    branch: {
      levels: 3,
      angle: { 1: 68, 2: 56, 3: 58 },
      children: { 0: 5, 1: 5, 2: 6 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.024 },
      gnarliness: { 0: 0.14, 1: 0.2, 2: 0.16, 3: 0.11 },
      length: { 0: 16, 1: 10, 2: 6.5, 3: 1 },
      radius: { 0: 0.8, 1: 0.7, 2: 0.7, 3: 0.7 },
      sections: { 0: 10, 1: 8, 2: 6, 3: 4 },
      segments: { 0: 8, 1: 6, 2: 4, 3: 3 },
      start: { 1: 0.56, 2: 0.34, 3: 0.41 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'ash',
      billboard: 'double',
      angle: 33,
      count: 3,
      start: 0.12,
      size: 3.3,
      sizeVariance: 0.65,
      tint: 16777215,
    },
  },
  ashMedium: {
    kind: 'ashMedium',
    family: 'ash',
    worldScale: 0.36,
    type: 'deciduous',
    bark: { type: 'ash', tint: 14733509 },
    branch: {
      levels: 3,
      angle: { 1: 64, 2: 58, 3: 58 },
      children: { 0: 7, 1: 7, 2: 7 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.018 },
      gnarliness: { 0: 0.1, 1: 0.2, 2: 0.15, 3: 0.02 },
      length: { 0: 22, 1: 14.5, 2: 9.5, 3: 1 },
      radius: { 0: 1.4, 1: 0.7, 2: 0.7, 3: 0.7 },
      sections: { 0: 12, 1: 10, 2: 8, 3: 6 },
      segments: { 0: 8, 1: 6, 2: 4, 3: 3 },
      start: { 1: 0.54, 2: 0.34, 3: 0.32 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'ash',
      billboard: 'double',
      angle: 10,
      count: 1,
      start: 0.10,
      size: 3.1,
      sizeVariance: 0.65,
      tint: 13951649,
    },
  },
  ashLarge: {
    kind: 'ashLarge',
    family: 'ash',
    worldScale: 0.29,
    type: 'deciduous',
    bark: { type: 'ash', tint: 14733509 },
    branch: {
      levels: 3,
      angle: { 1: 50, 2: 56, 3: 58 },
      children: { 0: 7, 1: 6, 2: 4 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.018 },
      gnarliness: { 0: 0.1, 1: 0.13, 2: 0.09, 3: 0.02 },
      length: { 0: 32, 1: 23, 2: 13, 3: 1 },
      radius: { 0: 2, 1: 0.8, 2: 0.8, 3: 0.7 },
      sections: { 0: 12, 1: 10, 2: 8, 3: 6 },
      segments: { 0: 10, 1: 8, 2: 6, 3: 3 },
      start: { 1: 0.50, 2: 0.28, 3: 0.10 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: -0.06, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'ash',
      billboard: 'double',
      angle: 41,
      count: 3,
      start: 0.22,
      size: 4.2,
      sizeVariance: 0.65,
      tint: 13689525,
    },
  },

  // ---- ASPEN (aspen_small.json, aspen_medium.json, aspen_large.json — natural dark-grey/brown bark, no white trunks) ----
  aspenSmall: {
    kind: 'aspenSmall',
    family: 'aspen',
    worldScale: 0.34,
    type: 'deciduous',
    bark: { type: 'ash', tint: 14139828 },
    branch: {
      levels: 2,
      angle: { 1: 60, 2: 52, 3: 10 },
      children: { 0: 7, 1: 5, 2: 5 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.016 },
      gnarliness: { 0: 0.08, 1: 0.2, 2: -0.05, 3: 0.02 },
      length: { 0: 16, 1: 6, 2: 1.5, 3: 2 },
      radius: { 0: 0.6, 1: 0.5, 2: 0.7, 3: 0.7 },
      sections: { 0: 8, 1: 6, 2: 4, 3: 6 },
      segments: { 0: 6, 1: 4, 2: 4, 3: 3 },
      start: { 1: 0.52, 2: 0.34, 3: 0.3 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'aspen',
      billboard: 'double',
      angle: 28,
      count: 4,
      start: 0.10,
      size: 2.7,
      sizeVariance: 0.65,
      tint: 15132797,
    },
  },
  aspenMedium: {
    kind: 'aspenMedium',
    family: 'aspen',
    worldScale: 0.40,
    type: 'deciduous',
    bark: { type: 'ash', tint: 14139828 },
    branch: {
      levels: 3,
      angle: { 1: 64, 2: 52, 3: 10 },
      children: { 0: 7, 1: 7, 2: 5 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.016 },
      gnarliness: { 0: 0.08, 1: 0.2, 2: -0.05, 3: 0.02 },
      length: { 0: 22, 1: 10, 2: 8, 3: 2 },
      radius: { 0: 0.9, 1: 0.5, 2: 0.7, 3: 0.7 },
      sections: { 0: 12, 1: 8, 2: 6, 3: 4 },
      segments: { 0: 8, 1: 6, 2: 4, 3: 3 },
      start: { 1: 0.54, 2: 0.34, 3: 0.3 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'aspen',
      billboard: 'double',
      angle: 10,
      count: 1,
      start: 0.10,
      size: 2.3,
      sizeVariance: 0.65,
      tint: 14212437,
    },
  },
  aspenLarge: {
    kind: 'aspenLarge',
    family: 'aspen',
    worldScale: 0.35,
    type: 'deciduous',
    bark: { type: 'ash', tint: 14139828 },
    branch: {
      levels: 3,
      angle: { 1: 64, 2: 52, 3: 23 },
      children: { 0: 7, 1: 7, 2: 6 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.022 },
      gnarliness: { 0: 0.08, 1: 0.2, 2: -0.05, 3: 0.02 },
      length: { 0: 30, 1: 14, 2: 8, 3: 2 },
      radius: { 0: 1.3, 1: 0.5, 2: 0.7, 3: 0.7 },
      sections: { 0: 12, 1: 8, 2: 6, 3: 4 },
      segments: { 0: 8, 1: 6, 2: 4, 3: 3 },
      start: { 1: 0.54, 2: 0.34, 3: 0.3 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'aspen',
      billboard: 'double',
      angle: 35,
      count: 2,
      start: 0.24,
      size: 2.9,
      sizeVariance: 0.65,
      tint: 10086525,
    },
  },

  // ---- OAK (oak_small.json, oak_medium.json, oak_large.json) ----
  oakSmall: {
    kind: 'oakSmall',
    family: 'oak',
    worldScale: 0.32,
    type: 'deciduous',
    bark: { type: 'oak', tint: 14139828 },
    branch: {
      levels: 2,
      angle: { 1: 49, 2: 45, 3: 60 },
      children: { 0: 3, 1: 3, 2: 5 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.022 },
      gnarliness: { 0: 0.04, 1: 0.09, 2: 0.04, 3: 0.02 },
      length: { 0: 14, 1: 8, 2: 3, 3: 1 },
      radius: { 0: 0.9, 1: 0.7, 2: 0.7, 3: 0.7 },
      sections: { 0: 6, 1: 6, 2: 4, 3: 6 },
      segments: { 0: 8, 1: 6, 2: 4, 3: 3 },
      start: { 1: 0.65, 2: 0.39, 3: 0.3 },
      taper: { 0: 0.65, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'oak',
      billboard: 'double',
      angle: 10,
      count: 7,
      start: 0.14,
      size: 4.6,
      sizeVariance: 0.65,
      tint: 14021558,
    },
  },
  oakMedium: {
    kind: 'oakMedium',
    family: 'oak',
    worldScale: 0.36,
    type: 'deciduous',
    bark: { type: 'oak', tint: 14271154 },
    branch: {
      levels: 3,
      angle: { 1: 52, 2: 56, 3: 31 },
      children: { 0: 4, 1: 4, 2: 3 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.01 },
      gnarliness: { 0: 0.04, 1: 0.09, 2: 0.04, 3: 0.09 },
      length: { 0: 22, 1: 14, 2: 10, 3: 2 },
      radius: { 0: 1.3, 1: 0.7, 2: 0.8, 3: 0.7 },
      sections: { 0: 7, 1: 6, 2: 4, 3: 4 },
      segments: { 0: 8, 1: 6, 2: 4, 3: 3 },
      start: { 1: 0.56, 2: 0.44, 3: 0.10 },
      taper: { 0: 0.7, 1: 0.68, 2: 0.7, 3: 0.7 },
      twist: { 0: 0.06, 1: 0.14, 2: -0.17, 3: 0.03 },
    },
    leaves: {
      type: 'oak',
      billboard: 'double',
      angle: 10,
      count: 5,
      start: 0.14,
      size: 4.5,
      sizeVariance: 0.65,
      tint: 12768656,
    },
  },
  oakLarge: {
    kind: 'oakLarge',
    family: 'oak',
    worldScale: 0.26,
    type: 'deciduous',
    bark: { type: 'oak', tint: 14271154 },
    branch: {
      levels: 3,
      angle: { 1: 54, 2: 60, 3: 56 },
      children: { 0: 7, 1: 4, 2: 3 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.01 },
      gnarliness: { 0: 0.05, 1: 0.09, 2: 0.12, 3: 0.09 },
      length: { 0: 35, 1: 25, 2: 20, 3: 2 },
      radius: { 0: 2.3, 1: 0.7, 2: 0.8, 3: 0.7 },
      sections: { 0: 10, 1: 8, 2: 6, 3: 4 },
      segments: { 0: 11, 1: 6, 2: 4, 3: 3 },
      start: { 1: 0.60, 2: 0.30, 3: 0.10 },
      taper: { 0: 0.7, 1: 0.68, 2: 0.7, 3: 0.7 },
      twist: { 0: 0.06, 1: 0.14, 2: -0.17, 3: 0.03 },
    },
    leaves: {
      type: 'oak',
      billboard: 'double',
      angle: 48,
      count: 4,
      start: 0.14,
      size: 4.3,
      sizeVariance: 0.65,
      tint: 9614707,
    },
  },

  // ---- PINE (pine_small.json, pine_medium.json, pine_large.json) ----
  pineSmall: {
    kind: 'pineSmall',
    family: 'pine',
    worldScale: 0.42,
    type: 'evergreen',
    bark: { type: 'pine', tint: 16777215 },
    branch: {
      levels: 2,
      angle: { 1: 76, 2: 41, 3: 60 },
      children: { 0: 10, 1: 5, 2: 5 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.005 },
      gnarliness: { 0: 0.06, 1: 0.2, 2: 0.2, 3: 0.02 },
      length: { 0: 15, 1: 4.8, 2: 2, 3: 0.1 },
      radius: { 0: 0.5, 1: 0.7, 2: 0.7, 3: 0.7 },
      sections: { 0: 10, 1: 5, 2: 3, 3: 6 },
      segments: { 0: 8, 1: 6, 2: 4, 3: 3 },
      start: { 1: 0.40, 2: 0.08, 3: 0.3 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'pine',
      billboard: 'double',
      angle: 26,
      count: 2,
      start: 0.06,
      size: 3.3,
      sizeVariance: 0.65,
      tint: 16777215,
    },
  },
  pineMedium: {
    kind: 'pineMedium',
    family: 'pine',
    worldScale: 0.34,
    type: 'evergreen',
    bark: { type: 'pine', tint: 14271154 },
    branch: {
      levels: 2,
      angle: { 1: 78, 2: 50, 3: 60 },
      children: { 0: 14, 1: 7, 2: 5 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.005 },
      gnarliness: { 0: 0.06, 1: 0.2, 2: 0.2, 3: 0.02 },
      length: { 0: 25, 1: 6.6, 2: 3, 3: 0.1 },
      radius: { 0: 0.9, 1: 0.7, 2: 0.7, 3: 0.7 },
      sections: { 0: 10, 1: 5, 2: 3, 3: 6 },
      segments: { 0: 8, 1: 6, 2: 4, 3: 3 },
      start: { 1: 0.38, 2: 0.08, 3: 0.3 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'pine',
      billboard: 'double',
      angle: 26,
      count: 2,
      start: 0.06,
      size: 4.8,
      sizeVariance: 0.56,
      tint: 12706469,
    },
  },
  pineLarge: {
    kind: 'pineLarge',
    family: 'pine',
    worldScale: 0.29,
    type: 'evergreen',
    bark: { type: 'pine', tint: 14271154 },
    branch: {
      levels: 2,
      angle: { 1: 82, 2: 52, 3: 60 },
      children: { 0: 15, 1: 7, 2: 5 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.008 },
      gnarliness: { 0: 0.05, 1: 0.2, 2: 0.2, 3: 0.02 },
      length: { 0: 35, 1: 8.4, 2: 4, 3: 0.1 },
      radius: { 0: 1.2, 1: 0.5, 2: 0.7, 3: 0.7 },
      sections: { 0: 12, 1: 5, 2: 3, 3: 6 },
      segments: { 0: 8, 1: 6, 2: 4, 3: 3 },
      start: { 1: 0.34, 2: 0.08, 3: 0.3 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0.07, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'pine',
      billboard: 'double',
      angle: 26,
      count: 2,
      start: 0.06,
      size: 4.3,
      sizeVariance: 0.56,
      tint: 10073490,
    },
  },
};

const _ezUp = new THREE.Vector3(0, 1, 0);
const _ezRight = new THREE.Vector3(1, 0, 0);
const _ezFwd = new THREE.Vector3(0, 0, 1);

/**
 * Emits an EZ-Tree leaf spray (`single` or `double` orthogonal crossed quads)
 * anchored at `origin` on the branch and extending `length` along `dir`.
 */
function emitEzLeafSpray(b, { origin, dir, right, norm, width, length, rect, billboard, flip, nf, cf, wf }) {
  const u0 = flip ? rect.u1 : rect.u0;
  const u1 = flip ? rect.u0 : rect.u1;
  const v0 = rect.v0;
  const v1 = rect.v1;
  const hw = width * 0.5;

  const emitPlane = (axVec) => {
    const p00 = origin.clone().addScaledVector(axVec, -hw);
    const p10 = origin.clone().addScaledVector(axVec, hw);
    const p01 = p00.clone().addScaledVector(dir, length);
    const p11 = p10.clone().addScaledVector(dir, length);

    const i00 = b.vert(p00, nf(p00), u0, v1, cf(p00), wf(p00, 0.0));
    const i10 = b.vert(p10, nf(p10), u1, v1, cf(p10), wf(p10, 0.0));
    const i11 = b.vert(p11, nf(p11), u1, v0, cf(p11), wf(p11, 1.0));
    const i01 = b.vert(p01, nf(p01), u0, v0, cf(p01), wf(p01, 1.0));
    b.quad(i00, i10, i11, i01);
  };

  emitPlane(right);
  if (billboard === 'double') {
    emitPlane(norm);
  }
}

/**
 * Exact implementation of `dgreenheck/ez-tree` (`Tree.generate()`) for both
 * trees (`TREES`) and shrubs (`SHRUBS`), outputting into `GeoBuilder`.
 * - At least 30–35% of trees receive organic curved / wind-sculpted / S-curved trunks.
 * - Enforces a walkable pedestrian head-clearance skirt under tree crowns while
 *   keeping a full, natural canopy silhouette.
 */
export function buildEzPlant(seed, lod, S, isShrub = false) {
  const rng = new EzRNG(seed);
  const lodIdx = Math.min(2, Math.max(0, lod | 0));
  const B = S.branch;
  const L = S.leaves;
  const W = S.worldScale * (0.94 + 0.12 * rng.random());
  const isEvergreen = S.type === 'evergreen';
  const forceDir = new THREE.Vector3(B.force.direction.x, B.force.direction.y, B.force.direction.z).normalize();
  const qForce = new THREE.Quaternion().setFromUnitVectors(_ezUp, forceDir);

  const branchQueue = [];
  const meshedBranches = [];
  const leafQueue = [];

  // Deterministic trunk curvature profile: ~35% of trees get a pronounced sweeping arc or S-curve trunk
  const isCurvedTree = !isShrub && ((seed % 3 === 0) || (seed % 7 === 2));
  const curveStyle = seed % 2; // 0 = sweeping coastal lean + upper lift, 1 = sinuous S-curve trunk
  const curveAz = rng.random(Math.PI * 2, 0);
  const curveAxis = new THREE.Vector3(-Math.sin(curveAz), 0, Math.cos(curveAz));
  const initialLean = !isShrub
    ? (isCurvedTree ? rng.random(0.28, 0.18) : rng.random(0.08, 0.02))
    : 0;

  // Start root trunk (`level = 0`) slightly below ground so base is solidly planted
  const sinkUnscaled = (isShrub ? 0.07 : 0.12) / W;
  const rootQuat = new THREE.Quaternion().setFromAxisAngle(_ezUp, rng.random(Math.PI * 2, 0));
  if (initialLean > 0) {
    const qLean = new THREE.Quaternion().setFromAxisAngle(curveAxis, initialLean);
    rootQuat.premultiply(qLean);
  }
  branchQueue.push({
    origin: new THREE.Vector3(0, -sinkUnscaled, 0),
    orientation: new THREE.Euler().setFromQuaternion(rootQuat),
    length: B.length[0],
    radius: B.radius[0],
    level: 0,
    sectionCount: B.sections[0],
    segmentCount: B.segments[0],
  });

  const generateChildBranches = (count, level, sections) => {
    if (level > B.levels) return;
    const radialOffset = rng.random();
    for (let i = 0; i < count; i++) {
      const childBranchStart = rng.random(1.0, B.start[level]);
      const sectionIndex = Math.floor(childBranchStart * (sections.length - 1));
      const sectionA = sections[sectionIndex];
      const sectionB = sectionIndex === sections.length - 1 ? sectionA : sections[sectionIndex + 1];
      const alpha = (childBranchStart - sectionIndex / (sections.length - 1)) / (1 / (sections.length - 1));

      const childBranchOrigin = new THREE.Vector3().lerpVectors(sectionA.origin, sectionB.origin, alpha);
      const childBranchRadius = B.radius[level] * ((1 - alpha) * sectionA.radius + alpha * sectionB.radius);

      const qA = new THREE.Quaternion().setFromEuler(sectionA.orientation);
      const qB = new THREE.Quaternion().setFromEuler(sectionB.orientation);
      const parentOrientation = new THREE.Euler().setFromQuaternion(qB.slerp(qA, 1 - alpha));

      const radialAngle = 2.0 * Math.PI * (radialOffset + i / count);
      const q1 = new THREE.Quaternion().setFromAxisAngle(_ezRight, B.angle[level] / (180 / Math.PI));
      const q2 = new THREE.Quaternion().setFromAxisAngle(_ezUp, radialAngle);
      const q3 = new THREE.Quaternion().setFromEuler(parentOrientation);
      const childBranchOrientation = new THREE.Euler().setFromQuaternion(q3.multiply(q2.multiply(q1)));

      const childBranchLength = B.length[level] * (isEvergreen ? 1.0 - childBranchStart : 1.0);

      branchQueue.push({
        origin: childBranchOrigin,
        orientation: childBranchOrientation,
        length: childBranchLength,
        radius: childBranchRadius,
        level,
        sectionCount: B.sections[level],
        segmentCount: B.segments[level],
      });
    }
  };

  const generateLeaves = (sections) => {
    const radialOffset = rng.random();
    for (let i = 0; i < L.count; i++) {
      const leafStart = rng.random(1.0, L.start);
      const sectionIndex = Math.floor(leafStart * (sections.length - 1));
      const sectionA = sections[sectionIndex];
      const sectionB = sectionIndex === sections.length - 1 ? sectionA : sections[sectionIndex + 1];
      const alpha = (leafStart - sectionIndex / (sections.length - 1)) / (1 / (sections.length - 1));

      const leafOrigin = new THREE.Vector3().lerpVectors(sectionA.origin, sectionB.origin, alpha);
      const qA = new THREE.Quaternion().setFromEuler(sectionA.orientation);
      const qB = new THREE.Quaternion().setFromEuler(sectionB.orientation);
      const parentOrientation = new THREE.Euler().setFromQuaternion(qB.slerp(qA, 1 - alpha));

      const radialAngle = 2.0 * Math.PI * (radialOffset + i / L.count);
      const q1 = new THREE.Quaternion().setFromAxisAngle(_ezRight, L.angle / (180 / Math.PI));
      const q2 = new THREE.Quaternion().setFromAxisAngle(_ezUp, radialAngle);
      const q3 = new THREE.Quaternion().setFromEuler(parentOrientation);
      const qLeaf = q3.multiply(q2.multiply(q1));

      const variance = rng.random(L.sizeVariance, -L.sizeVariance);
      const leafSize = Math.max(0.35, L.size * (1 + variance * 0.45));

      const dir = _ezUp.clone().applyQuaternion(qLeaf).normalize();
      const right = _ezRight.clone().applyQuaternion(qLeaf).normalize();
      const norm = _ezFwd.clone().applyQuaternion(qLeaf).normalize();

      // Scale into world meters
      const worldOrigin = leafOrigin.multiplyScalar(W);
      const worldSize = leafSize * W;

      if (isShrub) {
        if (worldOrigin.y < 0.05) worldOrigin.y = 0.05;
        if (worldOrigin.y + dir.y * worldSize < 0.06) {
          dir.y = Math.max(0.18, dir.y);
          dir.normalize();
        }
      } else {
        // Walkable pedestrian & third-person camera head-clearance skirt under tree crowns (~2.15m..2.35m)
        const rHoriz = Math.hypot(worldOrigin.x, worldOrigin.z);
        const minSkirtY = 2.12 + 0.22 * clamp01((rHoriz - 0.70) / 2.1);
        if (worldOrigin.y < minSkirtY) {
          worldOrigin.y = minSkirtY + 0.08 * (minSkirtY - worldOrigin.y);
        }
        const tipY = worldOrigin.y + dir.y * worldSize;
        if (tipY < minSkirtY - 0.04) {
          dir.y = Math.max(0.12, (minSkirtY - worldOrigin.y) / Math.max(0.25, worldSize) + 0.08);
          dir.normalize();
        }
      }

      leafQueue.push({
        origin: worldOrigin,
        dir,
        right,
        norm,
        size: worldSize,
        flip: rng.random() < 0.5,
        rndTint: [0.95 + rng.random() * 0.10, 0.95 + rng.random() * 0.10, 0.94 + rng.random() * 0.10],
      });
    }
  };

  while (branchQueue.length > 0) {
    const branch = branchQueue.shift();
    const sectionOrigin = branch.origin.clone();
    const sectionOrientation = branch.orientation.clone();
    const levelDiv = !isEvergreen ? Math.max(1, B.levels - 1) : 1;
    const sectionLength = branch.length / branch.sectionCount / levelDiv;
    const sections = [];

    for (let i = 0; i <= branch.sectionCount; i++) {
      let sectionRadius = branch.radius;
      if (i === branch.sectionCount && branch.level === B.levels) {
        sectionRadius = 0.001;
      } else if (!isEvergreen) {
        sectionRadius *= 1 - B.taper[branch.level] * (i / branch.sectionCount);
      } else {
        sectionRadius *= 1 - (i / branch.sectionCount);
      }

      // Keep tree sub-branches gracefully arched above walkable pedestrian height (~2.08m..2.28m)
      if (!isShrub && branch.level >= 1 && i > 0) {
        const wY = sectionOrigin.y * W;
        const wR = Math.hypot(sectionOrigin.x * W, sectionOrigin.z * W);
        const minBrY = (2.06 + 0.22 * clamp01((wR - 0.65) / 2.1)) / W;
        if (sectionOrigin.y < minBrY) {
          sectionOrigin.y = minBrY;
          const qLift = new THREE.Quaternion().setFromEuler(sectionOrientation);
          qLift.rotateTowards(qForce, 0.22);
          sectionOrientation.setFromQuaternion(qLift);
        }
      }

      sections.push({
        origin: sectionOrigin.clone(),
        orientation: sectionOrientation.clone(),
        radius: Math.max(0.015, sectionRadius),
      });

      sectionOrigin.add(new THREE.Vector3(0, sectionLength, 0).applyEuler(sectionOrientation));

      const gnarliness = Math.max(1, 1 / Math.sqrt(Math.max(0.05, sectionRadius))) * B.gnarliness[branch.level];
      sectionOrientation.x += rng.random(gnarliness, -gnarliness);
      sectionOrientation.z += rng.random(gnarliness, -gnarliness);

      const qSection = new THREE.Quaternion().setFromEuler(sectionOrientation);
      // Apply organic trunk curvature on level 0 for curved trees
      if (!isShrub && branch.level === 0) {
        const tSec = i / Math.max(1, branch.sectionCount);
        if (isCurvedTree) {
          const bendStep = curveStyle === 0
            ? (tSec < 0.62 ? 0.042 : -0.028)
            : Math.cos(tSec * Math.PI * 1.35) * 0.058;
          const qCurve = new THREE.Quaternion().setFromAxisAngle(curveAxis, bendStep);
          qSection.premultiply(qCurve);
        } else {
          const qSubtle = new THREE.Quaternion().setFromAxisAngle(curveAxis, Math.cos(tSec * Math.PI) * 0.014);
          qSection.premultiply(qSubtle);
        }
      }
      const qTwist = new THREE.Quaternion().setFromAxisAngle(_ezUp, B.twist[branch.level]);
      qSection.multiply(qTwist);
      qSection.rotateTowards(qForce, B.force.strength / Math.max(0.08, sectionRadius));
      sectionOrientation.setFromQuaternion(qSection);
    }

    generateChildBranches(B.children[branch.level], branch.level + 1, sections);

    if (branch.level === B.levels) {
      generateLeaves(sections);
    } else if (!isEvergreen) {
      const lastSection = sections[sections.length - 1];
      branchQueue.push({
        origin: lastSection.origin.clone(),
        orientation: lastSection.orientation.clone(),
        length: B.length[branch.level + 1],
        radius: lastSection.radius,
        level: branch.level + 1,
        sectionCount: B.sections[branch.level + 1],
        segmentCount: B.segments[branch.level + 1],
      });
    }

    if (branch.level < B.levels) {
      meshedBranches.push({
        sections,
        segmentCount: branch.segmentCount,
        level: branch.level,
      });
    }
  }

  // Emit branch tubes into GeoBuilder (scaled by W into world meters)
  const b = new GeoBuilder();
  const bark = barkStrip('treeBark');
  const barkTint = S.bark.type === 'pine'
    ? [0.80, 0.58, 0.44]
    : S.bark.type === 'ash'
      ? [0.74, 0.66, 0.56]
      : S.bark.type === 'willow'
        ? [0.70, 0.64, 0.52]
        : [0.68, 0.58, 0.48];
  const vOff = rng.random();

  for (const br of meshedBranches) {
    const lvl = br.level;
    // Skip finest sub-branches at LOD2 to save triangles
    if (lodIdx === 2 && lvl >= 2 && B.levels >= 3) continue;

    const baseSegs = br.segmentCount || 4;
    const radial = lodIdx === 0
      ? baseSegs
      : lodIdx === 1
        ? Math.max(3, Math.round(baseSegs * 0.72))
        : Math.max(3, Math.round(baseSegs * 0.55));

    const pts = br.sections.map((s, idx) => {
      const p = s.origin.clone().multiplyScalar(W);
      if (lvl > 0 && idx === 0 && br.sections.length > 1) {
        const nextP = br.sections[1].origin.clone().multiplyScalar(W);
        const dir = nextP.sub(p).normalize();
        p.addScaledVector(dir, -s.radius * W * 0.35);
      }
      return p;
    });
    const radii = br.sections.map((s, idx) => {
      const rWorld = Math.max(0.008, s.radius * W);
      return (lvl === 0 && idx === 0 && !isShrub) ? rWorld * 1.24 : rWorld;
    });

    b.tube(pts, radii, {
      radial,
      strip: bark,
      vPerM: 0.44,
      vOff,
      flatBase: lvl === 0,
      cap: lvl === B.levels - 1 || (isEvergreen && lvl === 0),
      color: (t) => mul(barkTint, lvl === 0 ? 0.78 + 0.22 * Math.min(1, t * 1.6) : 0.84 + 0.16 * t),
      wind: (t) => {
        const wAmt = isShrub ? 0.08 * t : (0.06 * lvl + 0.12 * t);
        return packWind(wAmt, 0, false);
      },
    });
  }

  // Compute canopy bounding box & center for EZ-Tree rounded normals (`roundedNormals: true`)
  const cMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  const cMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const cSum = new THREE.Vector3();
  for (const lf of leafQueue) {
    const midP = lf.origin.clone().addScaledVector(lf.dir, lf.size * 0.5);
    cMin.min(midP);
    cMax.max(midP);
    cSum.add(midP);
  }
  const C = leafQueue.length > 0 ? cSum.divideScalar(leafQueue.length) : new THREE.Vector3(0, isShrub ? 0.6 : 3.5, 0);
  const rad = new THREE.Vector3(
    Math.max(isShrub ? 0.4 : 1.4, (cMax.x - cMin.x) * 0.55),
    Math.max(isShrub ? 0.35 : 1.2, (cMax.y - cMin.y) * 0.55),
    Math.max(isShrub ? 0.4 : 1.4, (cMax.z - cMin.z) * 0.55)
  );

  const nf = (lf) => (p) => {
    const domeN = p.clone().sub(C).divide(rad).normalize();
    return domeN.multiplyScalar(0.68).addScaledVector(lf.dir, 0.14).add(V(0, 0.46, 0)).normalize();
  };

  const baseTint = hexToEzTint(L.tint);
  const cf = (tintVec) => (p) => {
    const hr = clamp01((p.y - cMin.y) / Math.max(0.5, cMax.y - cMin.y));
    const rho = clamp01(p.clone().sub(C).divide(rad).length());
    const shade = 0.72 + 0.22 * clamp01(0.22 + 0.48 * hr + 0.30 * rho);
    return mul(tintVec, shade);
  };

  // Subsample leafQueue to target LOD budget while compensating leaf size so canopy volume stays identical
  const maxLeaves = isShrub
    ? (lodIdx === 0 ? 120 : lodIdx === 1 ? 64 : 32)
    : (lodIdx === 0 ? 310 : lodIdx === 1 ? 165 : 82);
  const totalLeaves = leafQueue.length;
  const keepCount = Math.min(totalLeaves, maxLeaves);
  const densityComp = totalLeaves > keepCount ? Math.pow(totalLeaves / keepCount, 0.28) : 1.0;
  const stride = totalLeaves > keepCount ? totalLeaves / keepCount : 1;
  const flutterAmp = S.family === 'aspen' ? 0.32 : isShrub ? 0.18 : 0.24;
  const rect = uvRect(L.type, 8);

  for (let k = 0; k < keepCount; k++) {
    const idx = Math.min(totalLeaves - 1, Math.floor(k * stride));
    const lf = leafQueue[idx];
    const sz = lf.size * densityComp;
    const tintVec = [
      baseTint[0] * lf.rndTint[0],
      baseTint[1] * lf.rndTint[1],
      baseTint[2] * lf.rndTint[2],
    ];
    const billboard = lodIdx === 0
      ? L.billboard
      : lodIdx === 1
        ? (k % 2 === 0 ? 'double' : 'single')
        : 'single';
    const hFrac = clamp01(lf.origin.y / Math.max(1.0, cMax.y));
    const wBranch = isShrub ? 0.08 * hFrac : 0.14 + 0.14 * hFrac;
    const wf = (p, vFrac) => packWind(wBranch, (0.08 + flutterAmp * vFrac), true);

    emitEzLeafSpray(b, {
      origin: lf.origin,
      dir: lf.dir,
      right: lf.right,
      norm: lf.norm,
      width: sz,
      length: sz,
      rect,
      billboard,
      flip: lf.flip,
      nf: nf(lf),
      cf: cf(tintVec),
      wf,
    });
  }

  const g = b.build();
  g.userData.height = Math.max(isShrub ? 0.8 : 4.2, cMax.y + 0.4);
  g.userData.canopy = Math.max(rad.x, rad.z);
  return g;
}

export function tree(seed, lod, S) {
  return buildEzPlant(seed, lod, S, false);
}

// ---------------------------------------------------------------------------
// Banana clump (pure lush green arched blades, proper width/UV mapping)
// ---------------------------------------------------------------------------
export function banana(seed) {
  const r = rng(seed);
  const stems = [];
  const ns = 1 + Math.floor(r() * 3);
  for (let s = 0; s < ns; s++) {
    const off = s === 0 ? V() : V((r() - 0.5) * 0.85, 0, (r() - 0.5) * 0.85);
    const h = s === 0 ? 2.4 + r() * 0.45 : 1.4 + r() * 0.9;
    const leaves = [];
    const m = s === 0 ? 8 + Math.floor(r() * 2) : 5 + Math.floor(r() * 2);
    for (let i = 0; i < m; i++) {
      const a = i / (m - 1);
      leaves.push({ az: i * 2.35 + r() * 0.4, el: lerp(1.12, -0.18, a) + (r() - 0.5) * 0.16, L: (h / 2.6) * (1.55 + r() * 0.45), g: lerp(0.05, 0.18, a) });
    }
    stems.push({ off, h, leaves, lean: V((r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2) });
  }
  const b = new GeoBuilder();
  const rect = uvRect('banana', 8);
  const prof = (t) => Math.pow(Math.max(0, Math.sin(Math.PI * (0.03 + 0.95 * t))), 0.38);
  for (const st of stems) {
    const k = st.h / 2.6;
    const pts = [-0.06, 0.5, 1].map((t) => st.off.clone().add(V(st.lean.x * Math.max(0, t), st.h * t, st.lean.z * Math.max(0, t))));
    const stemFlex = 0.28 * k;
    b.tube(pts, [0.16 * k, 0.115 * k, 0.085 * k], {
      radial: 8, strip: plainStrip, vPerM: 0, vOff: PLAIN_UV[1], flatBase: true,
      color: (t) => [0.36 + 0.06 * t, 0.46 + 0.10 * t, 0.22],
      wind: (t) => packWind(stemFlex * Math.pow(Math.max(0, t), 1.6), 0, false),
    });
    const top = pts[2];
    for (const lf of st.leaves) {
      const D = dirAE(lf.az, Math.max(lf.el, 0.35) + 0.2);
      const pet = top.clone().addScaledVector(D, 0.32);
      b.tube([top, pet], [0.034, 0.022], {
        radial: 4, strip: plainStrip, vPerM: 0, vOff: PLAIN_UV[1],
        color: () => [0.42, 0.54, 0.25],
        wind: (t) => packWind(stemFlex + 0.04 * t, 0, false),
      });
      ribbonLeaf(b, midrib(pet, lf.az, lf.el, lf.L, lf.g, 8, 0.25), rect, 0.28, prof, {
        widen: 1, fold: [0.14, 0.28],
        color: [0.96, 1, 0.93], ao: (t) => 0.76 + 0.24 * t,
        wind: (t) => packWind(stemFlex + 0.04 + 0.26 * Math.pow(t, 1.35), 0.12 + 0.42 * Math.pow(t, 1.45), true),
        flutter: 0.04, upBias: 0.62,
      });
    }
  }
  const g = b.build();
  g.userData.height = 3.4;
  g.userData.canopy = 1.7;
  return g;
}

// ---------------------------------------------------------------------------
// Coastal Screw Pine / Beach Palm Clump (Pandanus odorifer) – lush multi-stem
// coastal foliage clump with ringed sandy-grey stems and dense, gracefully
// arching sword-leaf rosettes (no tripod stick roots or bare spindly twigs).
// ---------------------------------------------------------------------------
export function pandanus(seed) {
  const r = rng(seed);
  const b = new GeoBuilder();
  const bark = barkStrip('palmBark');
  const vOff = r();
  const panFlex = 0.22;

  // 3-4 gracefully curving coastal stems rising from a grounded basal clump
  const nStems = 3 + (seed % 2);
  const baseAz0 = r() * Math.PI * 2;
  const crowns = [];

  for (let s = 0; s < nStems; s++) {
    const isMain = s === 0;
    const az = baseAz0 + (s / nStems) * Math.PI * 2 + (r() - 0.5) * 0.45;
    const H = isMain ? 2.15 + r() * 0.45 : 1.25 + r() * 0.65;
    const lean = isMain ? 0.22 + r() * 0.14 : 0.36 + r() * 0.22;
    const baseOff = isMain ? 0.04 : 0.14 + r() * 0.08;
    const dir = V(Math.cos(az), 0, Math.sin(az));
    const side = V(-dir.z, 0, dir.x);
    const wob = (r() - 0.5) * 0.14;

    const pts = [0, 0.25, 0.55, 0.82, 1].map((t) => {
      const reach = baseOff + lean * H * Math.pow(t, 1.35);
      const lat = wob * H * Math.sin(Math.PI * t);
      const y = t === 0 ? -0.14 : H * t;
      return V(0, y, 0).addScaledVector(dir, reach).addScaledVector(side, lat);
    });
    const r0 = isMain ? 0.14 : 0.105;
    const r1 = isMain ? 0.085 : 0.068;
    const radii = [r0 * 1.28, r0, lerp(r0, r1, 0.5), lerp(r0, r1, 0.85), r1];
    b.tube(pts, radii, {
      radial: 8, strip: bark, vPerM: 0.22, vOff: vOff + s * 0.23, flatBase: true,
      color: (t) => [lerp(0.72, 0.88, t), lerp(0.68, 0.84, t), lerp(0.60, 0.76, t)],
      wind: (t) => packWind(panFlex * (H / 2.2) * Math.pow(t, 1.5), 0, false),
    });

    const tip = pts[pts.length - 1];
    const T = tip.clone().sub(pts[pts.length - 2]).normalize();
    // Woven leaf-base collar beneath each rosette
    const collar = [-0.08, 0.06, 0.18].map((d) => tip.clone().addScaledVector(T, d));
    b.tube(collar, [r1 * 1.05, r1 * 1.38, r1 * 0.65], {
      radial: 7, strip: bark, vPerM: 0.35, vOff,
      color: () => [0.52, 0.48, 0.34],
      wind: () => packWind(panFlex * (H / 2.2), 0, false),
    });
    crowns.push({ p: collar[1], scale: isMain ? 1.0 : 0.78 + 0.16 * (H / 2.0), flex: panFlex * (H / 2.2) });
  }

  // Dense, layered spiral rosettes of wide, gracefully arching tropical sword leaves
  for (const cr of crowns) {
    const m = Math.round(28 * cr.scale);
    for (let i = 0; i < m; i++) {
      const a = i / (m - 1);
      const az = i * 2.39996 + (r() - 0.5) * 0.22;
      const el = lerp(1.22, -0.38, Math.pow(a, 0.82)) + (r() - 0.5) * 0.12;
      const L = (1.15 + r() * 0.38) * cr.scale * (a < 0.2 ? 0.68 + 1.6 * a : 1.0);
      const g = lerp(0.12, 0.34, a) * (0.88 + r() * 0.24);
      const band = r() < 0.55 ? 2 : 3; // lush green strap-leaf bands
      const origin = cr.p.clone().add(V(Math.cos(az) * 0.04, -0.04 * a, Math.sin(az) * 0.04));
      const leafShade = 0.88 + 0.16 * (1 - a * 0.5) + (r() - 0.5) * 0.06;
      const warm = a > 0.78 ? (a - 0.78) * 0.8 : 0;
      ribbonLeaf(
        b,
        midrib(origin, az, el, L, g, 8, 0.12),
        uvBand('strap', band, 4),
        0.095 * cr.scale,
        (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + 0.92 * t)), 0.45) * (1 - 0.35 * t),
        {
          widen: 1,
          fold: [0.24, 0.42],
          color: [leafShade * (0.94 + 0.12 * warm), leafShade, leafShade * (0.90 - 0.15 * warm)],
          ao: (t) => 0.70 + 0.30 * t,
          wind: (t) => packWind(cr.flex + 0.12 * t, 0.06 + 0.26 * Math.pow(t, 1.45), true),
          flutter: 0.022,
          upBias: 0.55,
        }
      );
    }
  }

  // Lush basal skirt of arching sword leaves at sand level so the base blends naturally into the beach
  const nSkirt = 14;
  for (let i = 0; i < nSkirt; i++) {
    const a = i / (nSkirt - 1);
    const az = i * 2.39996 + r() * 0.3;
    const el = lerp(0.88, 0.28, a) + (r() - 0.5) * 0.12;
    const L = 0.65 + r() * 0.32;
    const g = 0.22 + r() * 0.14;
    ribbonLeaf(
      b,
      midrib(V(Math.cos(az) * 0.10, 0.02, Math.sin(az) * 0.10), az, el, L, g, 6, 0.06),
      uvBand('strap', 2 + (i % 2), 4),
      0.068,
      (t) => Math.pow(Math.sin(Math.PI * (0.05 + 0.92 * t)), 0.42),
      {
        widen: 1,
        fold: [0.22, 0.36],
        color: [0.92, 0.98, 0.88],
        ao: (t) => 0.65 + 0.35 * t,
        wind: (t) => packWind(0.04 * t, 0.04 + 0.14 * t * t, true),
        flutter: 0.015,
        upBias: 0.55,
      }
    );
  }

  const g = b.build();
  g.userData.height = 3.1;
  g.userData.canopy = 1.65;
  return g;
}

// ---------------------------------------------------------------------------
// Strap-leaf rosette (crinum / spider-lily foliage: compact arched green blades)
// ---------------------------------------------------------------------------
export function lily(seed) {
  const r = rng(seed);
  const m = 14 + Math.floor(r() * 4);
  const leaves = [];
  for (let i = 0; i < m; i++) {
    leaves.push({
      az: i * 2.4 + r() * 0.35,
      el: lerp(1.18, 0.48, i / (m - 1)) + (r() - 0.5) * 0.15,
      L: 0.42 + r() * 0.22,
      g: 0.28 + r() * 0.18,
      band: r() < 0.5 ? 2 : 3,
    });
  }
  const b = new GeoBuilder();
  for (const lf of leaves) {
    ribbonLeaf(b, midrib(V(0, 0.02, 0), lf.az, lf.el, lf.L, lf.g, 6, 0.04), uvBand('strap', lf.band, 4), 0.048,
      (t) => Math.pow(Math.sin(Math.PI * (0.04 + 0.92 * t)), 0.38), {
        widen: 1, fold: [0.22, 0.35], color: [0.96, 1, 0.94], ao: (t) => 0.68 + 0.32 * t,
        wind: (t) => packWind(0.03 * t, 0.04 + 0.14 * t * t, true), flutter: 0.015,
      });
  }
  const g = b.build();
  g.userData.height = 0.65;
  return g;
}

// ---------------------------------------------------------------------------
// EZ-Tree Shrubs (`bush_1.json`, `bush_2.json`, `bush_3.json` from dgreenheck/ez-tree)
// ---------------------------------------------------------------------------
export const SHRUBS = {
  bush1: {
    kind: 'bush1',
    family: 'bush',
    worldScale: 0.28,
    type: 'deciduous',
    bark: { type: 'willow', tint: 14271154 },
    branch: {
      levels: 2,
      angle: { 1: 64, 2: 40, 3: 60 },
      children: { 0: 4, 1: 5, 2: 5 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.01 },
      gnarliness: { 0: 0.07, 1: 0.12, 2: 0.15, 3: 0.02 },
      length: { 0: 2, 1: 2, 2: 2, 3: 1 },
      radius: { 0: 0.2, 1: 0.5, 2: 0.7, 3: 0.7 },
      sections: { 0: 4, 1: 5, 2: 4, 3: 6 },
      segments: { 0: 6, 1: 4, 2: 4, 3: 3 },
      start: { 1: 0.14, 2: 0.12, 3: 0.3 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'ash',
      billboard: 'double',
      angle: 39,
      count: 6,
      start: 0.08,
      size: 2.1,
      sizeVariance: 0.37,
      tint: 10605687,
    },
  },
  bush2: {
    kind: 'bush2',
    family: 'bush',
    worldScale: 0.23,
    type: 'deciduous',
    bark: { type: 'willow', tint: 16777215 },
    branch: {
      levels: 3,
      angle: { 1: 54, 2: 56, 3: 48 },
      children: { 0: 5, 1: 5, 2: 3 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.01 },
      gnarliness: { 0: 0.15, 1: 0.2, 2: 0.3, 3: 0.02 },
      length: { 0: 4, 1: 4, 2: 4, 3: 1 },
      radius: { 0: 0.3, 1: 0.7, 2: 0.7, 3: 0.7 },
      sections: { 0: 5, 1: 4, 2: 3, 3: 2 },
      segments: { 0: 6, 1: 5, 2: 4, 3: 3 },
      start: { 1: 0.24, 2: 0.3, 3: 0.3 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'ash',
      billboard: 'double',
      angle: 39,
      count: 2,
      start: 0,
      size: 2.2,
      sizeVariance: 0.7,
      tint: 8566885,
    },
  },
  bush3: {
    kind: 'bush3',
    family: 'bush',
    worldScale: 0.22,
    type: 'deciduous',
    bark: { type: 'willow', tint: 16777215 },
    branch: {
      levels: 3,
      angle: { 1: 43, 2: 53, 3: 47 },
      children: { 0: 6, 1: 5, 2: 3 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.01 },
      gnarliness: { 0: 0.09, 1: 0.2, 2: 0.3, 3: 0.02 },
      length: { 0: 4, 1: 6, 2: 3, 3: 1 },
      radius: { 0: 0.3, 1: 0.7, 2: 0.7, 3: 0.7 },
      sections: { 0: 5, 1: 4, 2: 3, 3: 2 },
      segments: { 0: 6, 1: 5, 2: 4, 3: 3 },
      start: { 1: 0.14, 2: 0.25, 3: 0.08 },
      taper: { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'ash',
      billboard: 'double',
      angle: 32,
      count: 2,
      start: 0,
      size: 2.3,
      sizeVariance: 0.7,
      tint: 9159498,
    },
  },
};

export function shrub(seed, lod, T) {
  return buildEzPlant(seed, lod, T, true);
}

// ---------------------------------------------------------------------------
// Ground layer
// ---------------------------------------------------------------------------

/** Tropical grass clump patch made of multiple mini-tufts with varied blade height, direction, and low broadleaf groundcover. */
export function grassTuft(seed, lod, kind = 'lawn') {
  const r = rng(seed);
  const beach = kind === 'beach';
  const subClusters = beach ? 2 : 3 + (seed % 2);
  const centers = Array.from({ length: subClusters }, (_, i) => {
    const a = (i / subClusters) * Math.PI * 2 + r() * 0.9;
    const d = i === 0 ? 0.02 : (beach ? 0.08 : 0.11) + r() * 0.12;
    return [Math.cos(a) * d, Math.sin(a) * d, (r() - 0.5) * 0.5];
  });
  const nb = beach ? 14 : 22;
  const blades = [];
  for (let i = 0; i < nb; i++) {
    const [cx, cz, domAz] = centers[i % centers.length];
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * (beach ? 0.07 : 0.065);
    const heightVar = (i % 5 === 0) ? 1.22 : (0.72 + r() * 0.42);
    blades.push({
      base: V(cx + Math.cos(a) * rr, -0.015, cz + Math.sin(a) * rr),
      az: a + domAz + (r() - 0.5) * 1.1,
      lean: beach ? 0.22 + r() * 0.45 : 0.18 + r() * 0.48,
      len: (beach ? 0.28 + r() * 0.28 : 0.095 + r() * 0.10) * heightVar,
      w: beach ? 0.008 + r() * 0.004 : 0.0085 + r() * 0.0045,
      lush: r() < 0.45,
      shade: 0.88 + r() * 0.20,
    });
  }
  const b = new GeoBuilder();
  const segs = 2;
  for (const bl of blades) {
    const dir = V(Math.cos(bl.az), 0, Math.sin(bl.az));
    const side = V(-dir.z, 0, dir.x);
    const lo = beach ? [0.28, 0.38, 0.18] : [0.18, 0.29, 0.10];
    const hi = beach
      ? [0.46, 0.56, 0.28]
      : bl.lush
        ? [0.34, 0.48, 0.19]
        : [0.41, 0.52, 0.22];
    const ids = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const p = bl.base.clone()
        .add(V(0, bl.len * t * (1 - 0.22 * bl.lean * t), 0))
        .addScaledVector(dir, bl.len * Math.sin(bl.lean) * t * (0.45 + 0.55 * t));
      const w = bl.w * (1 - 0.78 * t * t) + 0.0012;
      const n = UP.clone().multiplyScalar(0.78).addScaledVector(dir, -0.22).normalize();
      const col = mul(mix3(lo, hi, t), bl.shade);
      const wnd = packWind((beach ? 0.10 : 0.03) * t * t, (beach ? 0.14 : 0.05) * t * t, true);
      ids.push(b.vert(p.clone().addScaledVector(side, w), n, PLAIN_UV[0], PLAIN_UV[1], col, wnd));
      ids.push(b.vert(p.clone().addScaledVector(side, -w), n, PLAIN_UV[0], PLAIN_UV[1], col, wnd));
    }
    for (let k = 0; k < segs; k++) b.quad(ids[k * 2], ids[k * 2 + 2], ids[k * 2 + 3], ids[k * 2 + 1]);
  }
  const g = b.build();
  g.userData.height = beach ? 0.5 : 0.22;
  return g;
}

/** Fern: compact volumetric rosette of arched fern pads above the soil (never dips below y = 0.04). */
export function fern(seed) {
  const r = rng(seed);
  const rect = uvRect('fern', 10);
  const n = 5;
  const h = 0.38 + r() * 0.12;
  const b = new GeoBuilder();
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r() * 0.45;
    const out = V(Math.cos(az), 0, Math.sin(az));
    const tilt = 0.35 + r() * 0.25;
    const ay = UP.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(out, Math.sin(tilt)).multiplyScalar(h * 0.46);
    const ax = V(-out.z, 0, out.x).multiplyScalar(h * 0.46);
    const nrm = new THREE.Vector3().crossVectors(ax, ay).normalize(); if (nrm.y < 0) nrm.negate();
    const center = V(out.x * h * 0.22, h * 0.46, out.z * h * 0.22);
    b.cuppedCard(center, ax, ay, nrm, h * 0.14, rect, () => nrm.clone().add(V(0, 0.65, 0)).normalize(),
      (p) => mul([0.95, 1, 0.92], 0.68 + 0.32 * clamp01(p.y / h)), (p, sy) => packWind(0.03 * clamp01(p.y / h), 0.05 * ((sy + 1) / 2), true), r() < 0.5, 'center');
  }
  const g = b.build();
  g.userData.height = h;
  return g;
}

/**
 * Sculpted 3D fallen leaf litter patch: 5-8 individual curled botanical leaves
 * (mango lanceolate, Indian almond obovate, ash/fig ovate) with V-folded midrib,
 * natural longitudinal curl, and warm ochre/russet/olive/tan leaf-litter colours.
 */
const LITTER_PALETTE = [
  [0.54, 0.40, 0.18], // sun-cured golden ochre
  [0.50, 0.27, 0.15], // warm russet / Indian almond terracotta
  [0.34, 0.41, 0.19], // weathered olive-green
  [0.43, 0.31, 0.17], // dry cinnamon-tan
  [0.48, 0.36, 0.16], // amber-bronze
];

export function litter(seed) {
  const r = rng(seed);
  const b = new GeoBuilder();
  const nLeaves = 5 + Math.floor(r() * 4);
  const segs = 4;

  for (let i = 0; i < nLeaves; i++) {
    const ang = (i / nLeaves) * Math.PI * 2 + (r() - 0.5) * 0.85;
    const dist = (0.04 + Math.sqrt(r()) * 0.34) * (i === 0 ? 0.25 : 1.0);
    const ox = Math.cos(ang) * dist;
    const oz = Math.sin(ang) * dist;
    const yaw = r() * Math.PI * 2;
    const fwd = V(Math.cos(yaw), 0, Math.sin(yaw));
    const side = V(-fwd.z, 0, fwd.x);

    const len = 0.095 + r() * 0.065; // 9.5cm .. 16cm real leaf length
    const maxW = len * (0.24 + r() * 0.14);
    const arch = 0.008 + r() * 0.014;
    const cup = (r() < 0.7 ? 1 : -0.6) * (0.006 + r() * 0.010);
    const roll = (r() - 0.5) * 0.28;
    const baseY = 0.005 + r() * 0.006;

    const baseCol = LITTER_PALETTE[Math.floor(r() * LITTER_PALETTE.length)];
    const shade = 0.84 + r() * 0.24;
    const midribCol = mul(baseCol, shade * 1.12);
    const bladeCol = mul(baseCol, shade);
    const edgeCol = mul(baseCol, shade * 0.82);

    // Build 3-column (left margin, midrib, right margin) x 5-row sculpted leaf mesh
    const rowIds = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      // Natural ovate-lanceolate leaf width profile (widest around t = 0.42, tapering to acuminate tip)
      const wProfile = Math.sin(Math.PI * Math.pow(t, 0.78)) * (1.0 - 0.18 * t);
      const hw = Math.max(0.002, maxW * wProfile);
      const yMid = baseY + arch * Math.sin(t * Math.PI) + 0.006 * t * t * t;
      const yL = yMid + Math.abs(cup) + hw * Math.sin(roll);
      const yR = yMid + Math.abs(cup) - hw * Math.sin(roll);

      const pMid = V(ox, yMid, oz).addScaledVector(fwd, (t - 0.35) * len);
      const pL = V(ox, yL, oz).addScaledVector(fwd, (t - 0.35) * len).addScaledVector(side, -hw);
      const pR = V(ox, yR, oz).addScaledVector(fwd, (t - 0.35) * len).addScaledVector(side, hw);

      const nMid = V(0, 1, 0);
      const nL = V(0, 0.88, 0).addScaledVector(side, -0.35).normalize();
      const nR = V(0, 0.88, 0).addScaledVector(side, 0.35).normalize();

      const wnd = packWind(0.010 * t, 0.036 * (0.3 + 0.7 * t), true);
      const cEdge = mix3(bladeCol, edgeCol, t * 0.7);
      const idL = b.vert(pL, nL, PLAIN_UV[0], PLAIN_UV[1], cEdge, wnd);
      const idM = b.vert(pMid, nMid, PLAIN_UV[0], PLAIN_UV[1], midribCol, wnd);
      const idR = b.vert(pR, nR, PLAIN_UV[0], PLAIN_UV[1], cEdge, wnd);
      rowIds.push([idL, idM, idR]);
    }

    for (let k = 0; k < segs; k++) {
      const [l0, m0, r0] = rowIds[k];
      const [l1, m1, r1] = rowIds[k + 1];
      b.quad(l0, m0, m1, l1);
      b.quad(m0, r0, r1, m1);
    }
  }

  const g = b.build();
  g.userData.height = 0.03;
  return g;
}

