import * as THREE from 'three';
import { rng } from './random.js';

// Shared 2048x2048 vegetation atlas (one material for every plant).
//  - Colour and coverage are painted on separate canvases and merged with
//    straight alpha; each tile is back-filled with its own mean leaf colour.
//  - Every tile is surrounded by a transparent gutter (>= 32px) and the opaque
//    bark strips sit 80px away from any foliage, so mip filtering can never
//    pull bark/neighbour texels into a leaf edge. The shader additionally clamps
//    the mip level (see materials.js).
//  - Leaves are painted large (no sub-pixel detail) so they stay clean when
//    minified instead of turning into aliasing noise.

export const ATLAS_W = 2048, ATLAS_H = 2048;
export const TILES = {
  frond: [0, 0, 1792, 128], frondDry: [0, 128, 1792, 128],
  arecaBark: [1836, 0, 52, 2048], palmBark: [1894, 0, 48, 2048], birchBark: [1946, 0, 46, 2048], treeBark: [1996, 0, 52, 2048],
  ash: [0, 288, 512, 512], pine: [544, 288, 512, 512], oak: [1088, 288, 512, 512],
  strap: [1632, 288, 192, 192], leaflet: [1632, 512, 192, 48], leafletDry: [1632, 592, 192, 48], plain: [1680, 672, 64, 64],
  aspen: [0, 832, 512, 512], shrub: [544, 832, 512, 512], round: [1088, 832, 512, 512], croton: [1632, 832, 192, 192],
  mango: [0, 1368, 384, 384], mangoB: [408, 1368, 384, 384], fine: [816, 1368, 384, 384], almond: [1224, 1368, 384, 384],
  fern: [0, 1776, 256, 256], banana: [280, 1776, 896, 240], litter: [1200, 1776, 256, 256], grassCard: [1480, 1776, 256, 256],
};

/** UV rectangle of a tile (v0 = top of the painted tile). */
export function uvRect(name, pad = 6) {
  const [x, y, w, h] = TILES[name];
  return { u0: (x + pad) / ATLAS_W, u1: (x + w - pad) / ATLAS_W, v0: (y + pad) / ATLAS_H, v1: (y + h - pad) / ATLAS_H };
}
/** Horizontal band i (of n) inside a tile. */
export function uvBand(name, i, n) {
  const [x, y, w, h] = TILES[name];
  const bh = h / n;
  return { u0: (x + 4) / ATLAS_W, u1: (x + w - 4) / ATLAS_W, v0: (y + bh * i + 3) / ATLAS_H, v1: (y + bh * (i + 1) - 3) / ATLAS_H };
}
export const PLAIN_UV = (() => { const [x, y, w, h] = TILES.plain; return [(x + w / 2) / ATLAS_W, (y + h / 2) / ATLAS_H]; })();
/** Bark strips wrap vertically (RepeatWrapping in T). */
export function barkStrip(name) { const [x, , w] = TILES[name]; return { u0: (x + 3) / ATLAS_W, u1: (x + w - 3) / ATLAS_W }; }
export const frondProfile = (t) => Math.max(0.06, Math.pow(Math.sin(Math.PI * (0.06 + 0.9 * t)), 0.65));

// ---------------------------------------------------------------------------
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
const jit = (r, v, a) => v + (r() - 0.5) * 2 * a;
function both(P, fn) { fn(P.c, false); fn(P.a, true); }

function leafPath(c, len, wid, shape) {
  c.moveTo(0, 0);
  if (shape === 'oak') {              // Lobed oak blade (3 rounded lobes per side)
    c.quadraticCurveTo(len * 0.14, -wid * 0.55, len * 0.24, -wid * 0.85);
    c.quadraticCurveTo(len * 0.31, -wid * 0.42, len * 0.38, -wid * 0.52);
    c.quadraticCurveTo(len * 0.48, -wid * 1.18, len * 0.58, -wid * 1.05);
    c.quadraticCurveTo(len * 0.66, -wid * 0.52, len * 0.72, -wid * 0.58);
    c.quadraticCurveTo(len * 0.82, -wid * 0.95, len * 0.92, -wid * 0.52);
    c.quadraticCurveTo(len * 1.03, 0, len * 0.92, wid * 0.52);
    c.quadraticCurveTo(len * 0.82, wid * 0.95, len * 0.72, wid * 0.58);
    c.quadraticCurveTo(len * 0.66, wid * 0.52, len * 0.58, wid * 1.05);
    c.quadraticCurveTo(len * 0.48, wid * 1.18, len * 0.38, wid * 0.52);
    c.quadraticCurveTo(len * 0.31, wid * 0.42, len * 0.24, wid * 0.85);
    c.quadraticCurveTo(len * 0.14, wid * 0.55, 0, 0);
  } else if (shape === 'cordate') {   // Quaking aspen / birch broad deltoid-cordate blade with pointed apex
    c.bezierCurveTo(len * 0.04, -wid * 1.38, len * 0.54, -wid * 1.22, len * 0.86, -wid * 0.28);
    c.quadraticCurveTo(len * 0.96, -wid * 0.05, len, 0);
    c.quadraticCurveTo(len * 0.96, wid * 0.05, len * 0.86, wid * 0.28);
    c.bezierCurveTo(len * 0.54, wid * 1.22, len * 0.04, wid * 1.38, 0, 0);
  } else if (shape === 'obovate') {   // widest towards the tip (Terminalia)
    c.bezierCurveTo(len * 0.2, -wid * 0.45, len * 0.62, -wid * 1.2, len * 0.95, -wid * 0.5);
    c.quadraticCurveTo(len * 1.04, 0, len * 0.95, wid * 0.5);
    c.bezierCurveTo(len * 0.62, wid * 1.2, len * 0.2, wid * 0.45, 0, 0);
  } else if (shape === 'round') {
    c.bezierCurveTo(len * 0.05, -wid * 1.25, len * 0.98, -wid * 1.25, len, 0);
    c.bezierCurveTo(len * 0.98, wid * 1.25, len * 0.05, wid * 1.25, 0, 0);
  } else if (shape === 'oblong') {
    c.bezierCurveTo(len * 0.08, -wid * 1.05, len * 0.86, -wid * 1.05, len, 0);
    c.bezierCurveTo(len * 0.86, wid * 1.05, len * 0.08, wid * 1.05, 0, 0);
  } else if (shape === 'ovate') {
    c.bezierCurveTo(len * 0.12, -wid * 1.3, len * 0.62, -wid * 1.0, len, 0);
    c.bezierCurveTo(len * 0.62, wid * 1.0, len * 0.12, wid * 1.3, 0, 0);
  } else { // lance
    c.bezierCurveTo(len * 0.22, -wid * 1.12, len * 0.68, -wid * 0.82, len, 0);
    c.bezierCurveTo(len * 0.68, wid * 0.82, len * 0.22, wid * 1.12, 0, 0);
  }
  c.closePath();
}

/**
 * One leaf: base->tip gradient, darker shaded half (fold), soft highlight,
 * midrib and a few low-contrast secondary veins (large enough not to alias).
 */
function leaf(P, x, y, ang, len, wid, shape, col, o = {}) {
  const [h, s, l] = col;
  both(P, (c, isA) => {
    c.save(); c.translate(x, y); c.rotate(ang);
    if (o.petiole) {
      c.strokeStyle = isA ? '#fff' : hsl(h - 8, s * 0.75, l * 0.85); c.lineWidth = Math.max(2.0, wid * 0.14); c.lineCap = 'round';
      c.beginPath(); c.moveTo(-o.petiole, 0); c.lineTo(1, 0); c.stroke();
    }
    c.beginPath(); leafPath(c, len, wid, shape);
    if (isA) { c.fillStyle = '#fff'; c.fill(); c.restore(); return; }
    const g = c.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, hsl(h, s, l * 0.9)); g.addColorStop(0.55, hsl(h, s, l)); g.addColorStop(1, hsl(h - 2, s * 0.96, l * 1.05));
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    // gentle folded shading without harsh high-frequency vein lines
    const g2 = c.createLinearGradient(0, -wid, 0, wid);
    g2.addColorStop(0, 'rgba(0,0,0,0.08)'); g2.addColorStop(0.48, 'rgba(0,0,0,0.02)'); g2.addColorStop(0.52, 'rgba(255,255,230,0.02)'); g2.addColorStop(1, 'rgba(255,255,230,0.0)');
    c.fillStyle = g2; c.fillRect(-2, -wid * 1.4, len + 4, wid * 2.8);
    if (o.veins && o.veinColor) {
      c.strokeStyle = o.veinColor; c.lineWidth = o.veinWidth || 1.6;
      for (let k = 1; k <= o.veins; k++) {
        const t = k / (o.veins + 1);
        for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(len * t, 0); c.quadraticCurveTo(len * t + wid * 0.3, sg * wid * 0.35, len * t + wid * 0.58, sg * wid * 0.68); c.stroke(); }
      }
    }
    c.restore();
    if (o.midrib !== 'rgba(0,0,0,0)') {
      c.strokeStyle = o.midrib || hsl(h - 10, s * 0.65, Math.min(48, l * 1.15), 0.25); c.lineWidth = Math.max(1.2, wid * 0.06);
      c.beginPath(); c.moveTo(2, 0); c.quadraticCurveTo(len * 0.45, wid * 0.02, len * 0.82, 0); c.stroke();
    }
    c.restore();
  });
}

function twig(P, pts, w0, w1, color) {
  both(P, (c, isA) => {
    c.strokeStyle = isA ? '#fff' : color; c.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      c.lineWidth = w0 + (w1 - w0) * (i / (pts.length - 1));
      c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke();
    }
  });
}
function blob(P, x, y, rx, ry, rot, color) {
  both(P, (c, isA) => { c.fillStyle = isA ? '#fff' : color; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill(); });
}

function tile(P, name, bleed, draw, inset = 12, pad = 16) {
  const [x, y, w, h] = TILES[name];
  P.c.fillStyle = bleed; P.c.fillRect(x - pad, y - pad, w + 2 * pad, h + 2 * pad);   // bleed colour into half the gutter (alpha stays 0)
  for (const c of [P.c, P.a]) { c.save(); c.beginPath(); c.rect(x + inset, y + inset, w - 2 * inset, h - 2 * inset); c.clip(); c.translate(x, y); }
  draw(w, h);
  P.c.restore(); P.a.restore();
}

/**
 * EZ-Tree style directional branchlet spray tile (`ezBranchletTile`):
 * - Anchored at bottom-center `(cx, h - 14 * sc)` where the crossed quads attach to the 3D branch.
 * - Central woody stem stays aligned near `cx` so `double` orthogonal crossed quads
 *   join seamlessly along the stem axis without floating gaps.
 * - 6–8 alternating lateral sub-twigs + terminal crown fork clothed in 3 depth tiers
 *   of crisp, botanically shaped leaves with airy sky gaps around the outer margin.
 */
function ezBranchletTile(P, name, o) {
  const r = rng(o.seed);
  tile(P, name, o.bleed, (w, h) => {
    const sc = w / 512;
    const cx = w * 0.5;
    const baseY = h - 14 * sc;
    const topY = 54 * sc;
    const mainLen = baseY - topY;
    const sway = (r() - 0.5) * 9 * sc;

    // 1. Central woody stem (kept tight to cx so double-crossed quads share the stem)
    const mainPts = [];
    const segs = 8;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = cx + Math.sin(t * Math.PI) * sway * t;
      const y = baseY - t * mainLen;
      mainPts.push([x, y, t]);
    }

    const subTwigs = [];
    const nLat = o.laterals || 6;
    for (let k = 0; k < nLat; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const tStart = 0.12 + (k / (nLat - 0.35)) * 0.72 + (r() - 0.5) * 0.03;
      const idx = Math.min(segs - 1, Math.max(0, Math.floor(tStart * segs)));
      const frac = tStart * segs - idx;
      const sx = mainPts[idx][0] + (mainPts[idx + 1][0] - mainPts[idx][0]) * frac;
      const sy = mainPts[idx][1] + (mainPts[idx + 1][1] - mainPts[idx][1]) * frac;
      const env = Math.sin(Math.PI * Math.min(0.95, Math.max(0.18, tStart * 0.88 + 0.10)));
      const reach = (w * 0.36) * (0.64 + 0.38 * env) * (0.90 + 0.16 * r());
      const baseAng = -Math.PI * 0.5 + side * (0.56 + 0.24 * (1 - tStart * 0.38) + (r() - 0.5) * 0.12);
      const midAng = baseAng + side * (0.09 + (r() - 0.5) * 0.08);
      const mx = sx + Math.cos(baseAng) * (reach * 0.52);
      const my = sy + Math.sin(baseAng) * (reach * 0.52);
      const ex = mx + Math.cos(midAng) * (reach * 0.48);
      const ey = my + Math.sin(midAng) * (reach * 0.48);
      subTwigs.push({
        pts: [[sx, sy], [mx, my], [ex, ey]],
        ang: midAng,
        side,
        tStart,
        reach,
      });
    }

    // Terminal fork twigs at the apex of the branchlet
    const tipPt = mainPts[segs];
    for (const side of [-1, 0, 1]) {
      const ang = -Math.PI * 0.5 + side * (0.40 + (r() - 0.5) * 0.10);
      const reach = w * (side === 0 ? 0.15 : 0.21);
      subTwigs.push({
        pts: [
          [tipPt[0], tipPt[1] + 22 * sc],
          [tipPt[0] + Math.cos(ang) * reach * 0.5, tipPt[1] + 22 * sc + Math.sin(ang) * reach * 0.5],
          [tipPt[0] + Math.cos(ang) * reach, tipPt[1] + 22 * sc + Math.sin(ang) * reach],
        ],
        ang,
        side: side || 1,
        tStart: 0.94,
        reach,
      });
    }

    // Collect leaves along sub-twigs and central axis
    const leaves = [];
    const safeMargin = 18 * sc;
    const clampLeafLen = (lx, ly, ang, desiredLen) => {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      let maxL = desiredLen;
      if (dx > 0.05) maxL = Math.min(maxL, (w - safeMargin - lx) / dx);
      if (dx < -0.05) maxL = Math.min(maxL, (lx - safeMargin) / -dx);
      if (dy > 0.05) maxL = Math.min(maxL, (h - safeMargin - ly) / dy);
      if (dy < -0.05) maxL = Math.min(maxL, (ly - safeMargin) / -dy);
      return Math.max(24 * sc, Math.min(desiredLen, maxL * 0.94));
    };

    const leavesPerTwig = o.leavesPerTwig || 12;
    for (const st of subTwigs) {
      const [p0, p1, p2] = st.pts;
      for (let i = 0; i < leavesPerTwig; i++) {
        const u = (i + 0.25 + r() * 0.45) / leavesPerTwig;
        const bx = u < 0.5
          ? p0[0] + (p1[0] - p0[0]) * (u * 2)
          : p1[0] + (p2[0] - p1[0]) * ((u - 0.5) * 2);
        const by = u < 0.5
          ? p0[1] + (p1[1] - p0[1]) * (u * 2)
          : p1[1] + (p2[1] - p1[1]) * ((u - 0.5) * 2);

        const sgn = i % 2 === 0 ? 1 : -1;
        const isTip = i >= leavesPerTwig - 2;
        const leafAng = isTip
          ? st.ang + (i === leavesPerTwig - 1 ? 0 : sgn * 0.36) + (r() - 0.5) * 0.16
          : st.ang + sgn * (0.58 + (1 - u) * 0.26 + (r() - 0.5) * 0.16);

        const rawLen = (o.len[0] + r() * (o.len[1] - o.len[0])) * sc * (0.84 + 0.24 * Math.sin(Math.PI * (0.15 + 0.75 * u)));
        const len = clampLeafLen(bx, by, leafAng, rawLen);
        const wid = (o.wid[0] + r() * (o.wid[1] - o.wid[0])) * sc * (len / rawLen) * (0.92 + 0.16 * r());
        const depth = Math.min(1, Math.max(0, 0.16 + st.tStart * 0.40 + u * 0.36 + (r() - 0.5) * 0.16));

        leaves.push({ x: bx, y: by, ang: leafAng, len, wid, depth });
      }
    }

    // Core rosette leaves along the main stem so the branchlet interior is lush and never looks skeletal
    const coreCount = o.coreLeaves || 22;
    for (let i = 0; i < coreCount; i++) {
      const t = 0.12 + (i / coreCount) * 0.80;
      const idx = Math.min(segs - 1, Math.floor(t * segs));
      const bx = mainPts[idx][0] + (r() - 0.5) * 22 * sc;
      const by = mainPts[idx][1] + (r() - 0.5) * 16 * sc;
      const side = i % 2 === 0 ? 1 : -1;
      const leafAng = -Math.PI * 0.5 + side * (0.28 + r() * 0.82);
      const rawLen = (o.len[0] + r() * (o.len[1] - o.len[0])) * sc * 0.94;
      const len = clampLeafLen(bx, by, leafAng, rawLen);
      const wid = (o.wid[0] + r() * (o.wid[1] - o.wid[0])) * sc * (len / rawLen);
      const depth = Math.min(1, Math.max(0, 0.14 + t * 0.58 + (r() - 0.5) * 0.18));
      leaves.push({ x: bx, y: by, ang: leafAng, len, wid, depth });
    }

    leaves.sort((a, b) => a.depth - b.depth);

    // Draw shaded under-leaves first, then woody twigs, then sunlit upper leaves
    const splitIdx = Math.floor(leaves.length * 0.42);
    for (let i = 0; i < splitIdx; i++) {
      const lf = leaves[i];
      leaf(P, lf.x, lf.y, lf.ang, lf.len, lf.wid, o.shape, o.color(r, lf.depth),
        { veins: o.veins, petiole: (o.petiole || 4) * sc, veinColor: o.veinColor, midrib: o.midrib });
    }

    const twigCol = o.twigColor || hsl(30, 26, 24);
    twig(P, mainPts, 8.0 * sc, 2.5 * sc, twigCol);
    for (const st of subTwigs) {
      twig(P, st.pts, 4.4 * sc, 1.6 * sc, twigCol);
    }

    for (let i = splitIdx; i < leaves.length; i++) {
      const lf = leaves[i];
      leaf(P, lf.x, lf.y, lf.ang, lf.len, lf.wid, o.shape, o.color(r, lf.depth),
        { veins: o.veins, petiole: (o.petiole || 4) * sc, veinColor: o.veinColor, midrib: o.midrib });
    }
  }, 8, 12);
}

/**
 * EZ-Tree Coniferous Pine Shoot & Needle Fascicle Tile (`ezPineTile`):
 * - Paints a resinous reddish-brown central shoot + whorled lateral shoots clothed in
 *   dense radiating fascicles of long, slender emerald/blue-green pine needles and small pinecones.
 */
function ezPineTile(P, name, o) {
  const r = rng(o.seed);
  tile(P, name, o.bleed, (w, h) => {
    const sc = w / 512;
    const cx = w * 0.5;
    const baseY = h - 14 * sc;
    const topY = 58 * sc;
    const mainLen = baseY - topY;

    const mainPts = [];
    const segs = 8;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      mainPts.push([cx + Math.sin(t * Math.PI) * 5 * sc, baseY - t * mainLen, t]);
    }

    const shoots = [{ pts: mainPts.map(([x, y]) => [x, y]), ang: -Math.PI * 0.5, tStart: 0.5 }];
    const nLat = 7;
    for (let k = 0; k < nLat; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const tStart = 0.14 + (k / (nLat - 0.3)) * 0.72;
      const idx = Math.min(segs - 1, Math.floor(tStart * segs));
      const sx = mainPts[idx][0], sy = mainPts[idx][1];
      const env = Math.sin(Math.PI * (0.18 + 0.78 * tStart));
      const reach = w * 0.35 * (0.62 + 0.38 * env) * (0.9 + 0.16 * r());
      const ang = -Math.PI * 0.5 + side * (0.52 + 0.22 * (1 - tStart * 0.4) + (r() - 0.5) * 0.10);
      const mx = sx + Math.cos(ang) * reach * 0.52;
      const my = sy + Math.sin(ang) * reach * 0.52;
      const ex = mx + Math.cos(ang - side * 0.10) * reach * 0.48;
      const ey = my + Math.sin(ang - side * 0.10) * reach * 0.48;
      shoots.push({ pts: [[sx, sy], [mx, my], [ex, ey]], ang: ang - side * 0.06, tStart });
    }

    // Collect pine needle fascicles along every shoot
    const needles = [];
    for (const sh of shoots) {
      const pts = sh.pts;
      const nBundles = pts.length > 3 ? 28 : 16;
      for (let b = 0; b < nBundles; b++) {
        const u = (b + 0.2 + r() * 0.6) / nBundles;
        const segF = u * (pts.length - 1);
        const i0 = Math.min(pts.length - 2, Math.floor(segF));
        const f = segF - i0;
        const bx = pts[i0][0] + (pts[i0 + 1][0] - pts[i0][0]) * f;
        const by = pts[i0][1] + (pts[i0 + 1][1] - pts[i0][1]) * f;
        const tangent = Math.atan2(pts[i0 + 1][1] - pts[i0][1], pts[i0 + 1][0] - pts[i0][0]);

        // Each fascicle has 3 slender needles fanning outward from the shoot
        for (const sgn of [-1, 0, 1]) {
          const spread = sgn === 0 ? (r() - 0.5) * 0.35 : sgn * (0.38 + r() * 0.42);
          const nAng = tangent + spread;
          const nLen = (52 + r() * 26) * sc * (0.78 + 0.26 * Math.sin(Math.PI * (0.15 + 0.8 * u)));
          const ex = Math.min(w - 14 * sc, Math.max(14 * sc, bx + Math.cos(nAng) * nLen));
          const ey = Math.min(h - 14 * sc, Math.max(14 * sc, by + Math.sin(nAng) * nLen));
          const depth = Math.min(1, Math.max(0, 0.15 + sh.tStart * 0.38 + u * 0.38 + (r() - 0.5) * 0.18));
          needles.push({ bx, by, ex, ey, depth, hue: 112 + (r() - 0.5) * 14, lit: (19 + r() * 10) * (0.78 + 0.36 * depth) });
        }
      }
    }

    needles.sort((a, b) => a.depth - b.depth);
    const drawNeedles = (from, to) => {
      both(P, (c, isA) => {
        c.lineCap = 'round';
        for (let i = from; i < to; i++) {
          const nd = needles[i];
          c.strokeStyle = isA ? '#fff' : hsl(nd.hue, 40, nd.lit);
          c.lineWidth = (isA ? 4.4 : 3.6) * sc;
          c.beginPath();
          c.moveTo(nd.bx, nd.by);
          c.lineTo(nd.ex, nd.ey);
          c.stroke();
        }
      });
    };

    const split = Math.floor(needles.length * 0.45);
    drawNeedles(0, split);

    // Resinous pine shoot wood + 2 small pinecones near lower forks
    const woodCol = hsl(24, 34, 24);
    twig(P, mainPts, 8.5 * sc, 2.8 * sc, woodCol);
    for (let i = 1; i < shoots.length; i++) {
      twig(P, shoots[i].pts, 4.6 * sc, 1.8 * sc, woodCol);
    }
    blob(P, cx - 12 * sc, baseY - mainLen * 0.32, 11 * sc, 16 * sc, -0.35, hsl(26, 38, 22));
    blob(P, cx + 13 * sc, baseY - mainLen * 0.48, 10 * sc, 15 * sc, 0.32, hsl(28, 36, 25));

    drawNeedles(split, needles.length);
  }, 8, 12);
}



function cluster(P, name, o) {
  const r = rng(o.seed);
  tile(P, name, o.bleed, (w, h) => {
    const cx = w * 0.5, cy = h * 0.5;
    const maxR = Math.min(w, h) * 0.43;
    const leaves = [];

    const nSprays = o.sprays || 7;
    const sprayCenters = [{ x: cx, y: cy, rScale: 0.78, dBias: 0.32, ang0: r() * Math.PI * 2 }];
    for (let s = 1; s < nSprays; s++) {
      const a = ((s - 1) / (nSprays - 1)) * Math.PI * 2 + (r() - 0.5) * 0.38;
      const dist = maxR * (0.42 + r() * 0.16);
      sprayCenters.push({
        x: cx + Math.cos(a) * dist,
        y: cy + Math.sin(a) * dist,
        rScale: 0.72 + r() * 0.18,
        dBias: (s % 2 === 0 ? 0.05 : 0.18) + r() * 0.15,
        ang0: a,
      });
    }

    const perSpray = Math.round((o.count || 150) / nSprays);
    for (const sp of sprayCenters) {
      for (let i = 0; i < perSpray; i++) {
        const layer = i / perSpray;
        const spreadAng = sp === sprayCenters[0]
          ? i * 2.39996 + (r() - 0.5) * 0.25
          : sp.ang0 + (r() - 0.5) * 2.35 + (i % 5 - 2) * 0.35;
        const baseOff = (4 + r() * 18) * (1 - layer * 0.45);
        const lx = sp.x + Math.cos(spreadAng) * baseOff;
        const ly = sp.y + Math.sin(spreadAng) * baseOff;
        const distFromTileCenter = Math.hypot(lx - cx, ly - cy);
        const availR = Math.max(18, maxR - distFromTileCenter);
        const rawLen = (o.len[0] + r() * (o.len[1] - o.len[0])) * sp.rScale * (0.98 - 0.16 * layer);
        const len = Math.min(availR, rawLen);
        const wid = (o.wid[0] + r() * (o.wid[1] - o.wid[0])) * (len / rawLen) * (0.92 + 0.12 * r());
        const depth = Math.min(1, Math.max(0, sp.dBias + layer * 0.72 + (r() - 0.5) * 0.10));
        leaves.push({
          x: lx,
          y: ly,
          ang: spreadAng + (r() - 0.5) * 0.22,
          len,
          wid,
          depth,
        });
      }
    }

    leaves.sort((a, b) => a.depth - b.depth);
    for (const lf of leaves) {
      const c = o.color(r, lf.depth);
      leaf(P, lf.x, lf.y, lf.ang, lf.len, lf.wid, o.shape, c,
        { veins: o.veins, petiole: o.petiole, veinColor: o.veinColor, midrib: o.midrib });
    }
  }, 10, 16);
}

function speckle(c, x, y, w, h, n, colors, r) {
  for (let i = 0; i < n; i++) { c.fillStyle = colors[Math.floor(r() * colors.length)]; c.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r() * 2); }
}

// coconut frond strip for mid/far LOD: dense overlapping leaflets + solid inner pinnae web so distant palms stay full
function paintFrond(P, name, dry, seed) {
  const r = rng(seed);
  const [, , W, H] = TILES[name];
  const bleedCol = dry ? hsl(34, 42, 26) : hsl(94, 40, 25);
  const webCol = dry ? hsl(34, 44, 28) : hsl(94, 42, 27);
  tile(P, name, bleedCol, () => {
    const cy = H / 2, x0 = 12, x1 = W - 12;
    both(P, (c, isA) => {
      c.beginPath();
      for (let i = 0; i <= 48; i++) {
        const t = i / 48, x = x0 + t * (x1 - x0);
        const hw = (H / 2 - 14) * frondProfile(t) * (dry ? 0.40 : 0.46);
        i ? c.lineTo(x, cy - hw) : c.moveTo(x, cy - hw);
      }
      for (let i = 48; i >= 0; i--) {
        const t = i / 48, x = x0 + t * (x1 - x0);
        const hw = (H / 2 - 14) * frondProfile(t) * (dry ? 0.40 : 0.46);
        c.lineTo(x, cy + hw);
      }
      c.closePath();
      c.fillStyle = isA ? '#fff' : webCol;
      c.fill();
    });
    const n = 58;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.25 + r() * 0.35) / n;
      const xb = x0 + t * (x1 - x0) * 0.985;
      for (const s of [-1, 1]) {
        if (dry && r() < 0.08) continue; // occasional missing/ragged pinna on old fronds
        const reach = (H / 2 - 8) * frondProfile(t) * jit(r, dry ? 0.90 : 0.97, dry ? 0.09 : 0.03);
        const fwd = (210 + r() * 40) * (0.48 + 0.52 * frondProfile(t));
        const bw = (dry ? 16 : 19) + r() * 5;
        const hue = dry ? jit(r, 34, 6) : jit(r, 94, 4);
        const sat = dry ? jit(r, 45, 7) : jit(r, 42, 5);
        const lit = (dry ? jit(r, 32, 4) : jit(r, 29, 3)) + t * (dry ? 3 : 4);
        both(P, (c, isA) => {
          c.beginPath();
          c.moveTo(xb - bw * 0.55, cy);
          c.quadraticCurveTo(xb + fwd * 0.42, cy + s * reach * 0.64, xb + fwd, cy + s * reach);
          c.quadraticCurveTo(xb + fwd * 0.5 + bw, cy + s * reach * 0.58, xb + bw * 0.85, cy);
          c.closePath();
          if (isA) { c.fillStyle = '#fff'; c.fill(); return; }
          const g = c.createLinearGradient(xb, cy, xb + fwd, cy + s * reach);
          g.addColorStop(0, hsl(hue, sat, lit * 0.86));
          g.addColorStop(0.65, hsl(hue, sat, lit));
          g.addColorStop(1, hsl(hue - 4, sat * (dry ? 0.88 : 1), lit * (dry ? 0.96 : 1.06)));
          c.fillStyle = g; c.fill();
        });
      }
    }
    both(P, (c, isA) => {
      for (let k = 0; k < 40; k++) {
        const t0 = k / 40;
        c.strokeStyle = isA ? '#fff' : (dry ? hsl(30, 38, 30 - t0 * 5) : hsl(74, 36, 35 - t0 * 5));
        c.lineWidth = 11 * (1 - t0) + 4;
        c.beginPath(); c.moveTo(x0 + t0 * (x1 - x0), cy); c.lineTo(x0 + (k + 1) / 40 * (x1 - x0), cy); c.stroke();
      }
    });
  }, 4, 12);
}

// single coconut leaflet for the near-LOD geometric fronds (fresh green vs sun-cured old tan/brown)
function paintLeaflet(P, name, dry) {
  tile(P, name, dry ? hsl(34, 42, 27) : hsl(94, 40, 28), (w, h) => {
    const cy = h / 2, x0 = 3, x1 = w - 3;
    const hw = (t) => (h / 2 - 3) * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.92)), 0.45) * (t < 0.1 ? 0.72 + t * 2.8 : 1);
    both(P, (c, isA) => {
      c.beginPath();
      for (let i = 0; i <= 40; i++) { const t = i / 40; const x = x0 + t * (x1 - x0); i ? c.lineTo(x, cy - hw(t)) : c.moveTo(x, cy - hw(t)); }
      for (let i = 40; i >= 0; i--) { const t = i / 40; c.lineTo(x0 + t * (x1 - x0), cy + hw(t)); }
      c.closePath();
      if (isA) { c.fillStyle = '#fff'; c.fill(); return; }
      const g = c.createLinearGradient(x0, 0, x1, 0);
      if (dry) {
        g.addColorStop(0, hsl(36, 44, 26));
        g.addColorStop(0.65, hsl(33, 46, 32));
        g.addColorStop(1, hsl(27, 38, 28));
      } else {
        g.addColorStop(0, hsl(96, 42, 25));
        g.addColorStop(0.7, hsl(92, 42, 31));
        g.addColorStop(1, hsl(84, 40, 35));
      }
      c.fillStyle = g; c.fill();
      c.save(); c.clip();
      c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(0, 0, w, cy);
      c.restore();
    });
  }, 2);
}

function strapLeaf(P, y0, bandH, w, o) {
  const cy = y0 + bandH / 2;
  both(P, (c, isA) => {
    c.beginPath();
    const N = 40;
    for (let i = 0; i <= N; i++) { const t = i / N; const x = 6 + t * (w - 12); const hw = o.hw(t); i ? c.lineTo(x, cy - hw) : c.moveTo(x, cy - hw); }
    for (let i = N; i >= 0; i--) { const t = i / N; c.lineTo(6 + t * (w - 12), cy + o.hw(t)); }
    c.closePath();
    if (isA) { c.fillStyle = '#fff'; c.fill(); return; }
    const g = c.createLinearGradient(0, cy - bandH / 2, 0, cy + bandH / 2);
    g.addColorStop(0, o.edge); g.addColorStop(0.5, o.mid); g.addColorStop(1, o.edge);
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(200,215,175,0.16)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(6, cy); c.lineTo(w - 12, cy); c.stroke();
  });
}

// ---------------------------------------------------------------------------
export function buildAtlas(maxAniso = 4) {
  const cc = document.createElement('canvas'), ac = document.createElement('canvas');
  cc.width = ac.width = ATLAS_W; cc.height = ac.height = ATLAS_H;
  const P = { c: cc.getContext('2d'), a: ac.getContext('2d') };
  P.a.fillStyle = '#000'; P.a.fillRect(0, 0, ATLAS_W, ATLAS_H);
  P.c.fillStyle = hsl(98, 34, 24); P.c.fillRect(0, 0, ATLAS_W, ATLAS_H);

  paintFrond(P, 'frond', false, 11);
  paintFrond(P, 'frondDry', true, 12);
  paintLeaflet(P, 'leaflet', false);
  paintLeaflet(P, 'leafletDry', true);

  // Distinct, botanically authentic EZ-Tree branchlet spray palettes with sunlit depth relief
  const green = (h0, h1, s0, l0, l1) => (r, d) => [
    h0 + r() * (h1 - h0) - d * 4,
    s0 + (r() - 0.5) * 6 + d * 4,
    (l0 + r() * (l1 - l0)) * (0.78 + 0.34 * d),
  ];
  // Mango (Mangifera indica): glossy forest-emerald lance leaves on forked branchlet sprays
  ezBranchletTile(P, 'mango', {
    seed: 21, bleed: hsl(108, 40, 23), laterals: 6, leavesPerTwig: 11, coreLeaves: 18,
    len: [54, 74], wid: [16, 23], shape: 'lance', veins: 3, veinColor: 'rgba(180,215,130,0.18)',
    color: green(104, 116, 42, 22, 31),
  });
  // Mango flush: emerald branchlet with warm golden-lime young terminal flush leaves
  ezBranchletTile(P, 'mangoB', {
    seed: 22, bleed: hsl(98, 40, 24), laterals: 6, leavesPerTwig: 11, coreLeaves: 18,
    len: [52, 72], wid: [16, 22], shape: 'lance', veins: 3, veinColor: 'rgba(195,220,130,0.18)',
    color: (r, d) => (d > 0.72 && r() < 0.45
      ? [78 + r() * 14, 48, (28 + r() * 7) * (0.82 + 0.28 * d)]
      : [102 + r() * 12, 42, (22 + r() * 8) * (0.78 + 0.34 * d)]),
  });
  // Rain tree / Ash-style airy compound spray (Samanea saman): delicate feathery small leaflets on spreading rachis
  ezBranchletTile(P, 'fine', {
    seed: 31, bleed: hsl(90, 42, 25), laterals: 8, leavesPerTwig: 13, coreLeaves: 20,
    len: [38, 52], wid: [13, 18], shape: 'ovate',
    color: green(84, 98, 44, 24, 33),
  });
  // Indian almond (Terminalia catappa): obovate coastal branchlets with occasional warm amber-russet accent leaves
  ezBranchletTile(P, 'almond', {
    seed: 33, bleed: hsl(96, 38, 24), laterals: 6, leavesPerTwig: 9, coreLeaves: 14,
    len: [58, 78], wid: [24, 32], shape: 'obovate', veins: 3, veinColor: 'rgba(195,215,135,0.20)',
    color: (r, d) => (d < 0.28 && r() < 0.14
      ? [42 + r() * 16, 48, (26 + r() * 6) * (0.80 + 0.30 * d)]
      : [94 + r() * 14, 40, (23 + r() * 9) * (0.78 + 0.34 * d)]),
  });
  cluster(P, 'shrub', { seed: 41, bleed: hsl(104, 38, 23), count: 160, sprays: 7,
    len: [38, 52], wid: [15, 21], shape: 'ovate',
    color: green(100, 112, 38, 22, 30) });
  // Coastal Fig / Banyan (Ficus): glossy jade-emerald ovate/round leaves on sturdy twigs
  ezBranchletTile(P, 'round', {
    seed: 42, bleed: hsl(110, 36, 24), laterals: 6, leavesPerTwig: 10, coreLeaves: 16,
    len: [52, 70], wid: [22, 30], shape: 'round', veins: 3, veinColor: 'rgba(175,210,145,0.18)',
    color: green(106, 120, 38, 23, 32),
  });
  // EZ-Tree Ash (Fraxinus) & Bush: opposite pinnate leaflets with vibrant neutral-green tone ready for preset tinting
  ezBranchletTile(P, 'ash', {
    seed: 61, bleed: hsl(96, 42, 28), laterals: 7, leavesPerTwig: 12, coreLeaves: 20,
    len: [46, 64], wid: [15, 21], shape: 'lance', veins: 2, veinColor: 'rgba(205,235,160,0.22)',
    color: green(94, 108, 44, 29, 39),
  });
  // EZ-Tree Pine (Pinus): coniferous pine shoots with dense radiating needle fascicles & small cones
  ezPineTile(P, 'pine', {
    seed: 62, bleed: hsl(116, 40, 26),
  });
  // EZ-Tree Oak (Quercus): deeply lobed oak leaves on sturdy woody branchlets
  ezBranchletTile(P, 'oak', {
    seed: 63, bleed: hsl(94, 42, 27), laterals: 6, leavesPerTwig: 11, coreLeaves: 18,
    len: [54, 74], wid: [22, 30], shape: 'oak', veins: 3, veinColor: 'rgba(205,225,145,0.24)',
    color: green(88, 104, 44, 28, 38),
  });
  // EZ-Tree Aspen (Populus tremuloides): cordate-deltoid trembling leaves ready for golden-lime & spring-green preset tints
  ezBranchletTile(P, 'aspen', {
    seed: 64, bleed: hsl(82, 46, 30), laterals: 7, leavesPerTwig: 11, coreLeaves: 18,
    len: [44, 60], wid: [22, 30], shape: 'cordate', veins: 2, veinColor: 'rgba(225,240,165,0.26)',
    twigColor: hsl(42, 16, 42),
    color: green(78, 94, 48, 31, 42),
  });
  // croton: vibrant tropical emerald and warm lime-gold variegated foliage (no dead brown)
  cluster(P, 'croton', { seed: 43, bleed: hsl(90, 40, 24), count: 56, sprays: 5,
    len: [28, 38], wid: [12, 16], shape: 'oblong', veins: 2, petiole: 3,
    veinColor: 'rgba(185,215,90,0.32)', veinWidth: 1.2, midrib: 'rgba(185,215,90,0.42)',
    color: (r, d) => (r() < 0.32 ? [jit(r, 76, 6), 46, 30 * (0.85 + 0.2 * d)] : [jit(r, 100, 5), 40, 24 * (0.85 + 0.2 * d)]) });
  // fern: full radial fern frond pad bounded strictly within the tile
  {
    const r = rng(45);
    tile(P, 'fern', hsl(98, 38, 24), (w, h) => {
      const sc = w / 512;
      const cx = w / 2, cy = h * 0.56;
      const nFronds = 14;
      for (let k = 0; k < nFronds; k++) {
        const a = (k / nFronds) * Math.PI * 2 + (r() - 0.5) * 0.18;
        const len = (175 + r() * 35) * sc;
        const pairs = 12, hue = jit(r, 98, 4), lit = jit(r, 27, 3);
        twig(P, [[cx, cy], [cx + Math.cos(a) * len, cy + Math.sin(a) * len]], 4 * sc, 1.5 * sc, hsl(88, 34, 26));
        for (let i = 1; i <= pairs; i++) {
          const t = i / (pairs + 1), pl = (48 * (1 - t * 0.72) + 14) * sc;
          const px = cx + Math.cos(a) * len * t, py = cy + Math.sin(a) * len * t;
          for (const s of [-1, 1]) leaf(P, px, py, a + s * 1.05, pl, Math.max(9 * sc, pl * 0.42), 'lance', [hue, 42, lit], { midrib: 'rgba(0,0,0,0)' });
        }
      }
    }, 6, 10);
  }
  // banana leaf: lush continuous tropical blade (no harsh black cuts that create floating fragments)
  {
    tile(P, 'banana', hsl(88, 38, 30), (w, h) => {
      const cy = h / 2, x0 = 14, x1 = w - 14;
      const hw = (t) => (h / 2 - 14) * Math.pow(Math.max(0, Math.sin(Math.PI * (0.03 + 0.95 * t))), 0.35);
      both(P, (c, isA) => {
        c.beginPath();
        for (let i = 0; i <= 80; i++) { const t = i / 80; const x = x0 + t * (x1 - x0); i ? c.lineTo(x, cy - hw(t)) : c.moveTo(x, cy - hw(t)); }
        for (let i = 80; i >= 0; i--) { const t = i / 80; c.lineTo(x0 + t * (x1 - x0), cy + hw(t)); }
        c.closePath();
        if (isA) { c.fillStyle = '#fff'; c.fill(); return; }
        const g = c.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, hsl(92, 42, 26)); g.addColorStop(0.6, hsl(88, 42, 32)); g.addColorStop(1, hsl(82, 38, 35));
        c.fillStyle = g; c.fill();
        c.save(); c.clip();
        c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(0, 0, w, cy);
        c.restore();
      });
      both(P, (c, isA) => { c.strokeStyle = isA ? '#fff' : hsl(72, 36, 42); c.lineWidth = 8; c.beginPath(); c.moveTo(x0, cy); c.lineTo(x1, cy); c.stroke(); });
    });
  }
  // strap leaves: pandanus x2, lily x2
  tile(P, 'strap', hsl(116, 28, 25), (w, h) => {
    const bh = h / 4;
    strapLeaf(P, 0, bh, w, { hw: (t) => 16 * (1 - t * 0.82) + 3, edge: hsl(118, 32, 25), mid: hsl(110, 36, 33) });
    strapLeaf(P, bh, bh, w, { hw: (t) => 14 * (1 - t * 0.78) + 3, edge: hsl(112, 32, 25), mid: hsl(106, 36, 33) });
    strapLeaf(P, bh * 2, bh, w, { hw: (t) => 19 * Math.pow(Math.sin(Math.PI * (0.02 + 0.96 * t)), 0.35), edge: hsl(100, 38, 24), mid: hsl(96, 42, 32) });
    strapLeaf(P, bh * 3, bh, w, { hw: (t) => 16 * Math.pow(Math.sin(Math.PI * (0.02 + 0.96 * t)), 0.4), edge: hsl(104, 36, 23), mid: hsl(98, 38, 30) });
  }, 4);
  cluster(P, 'litter', { seed: 47, bleed: hsl(100, 36, 22), count: 48, sprays: 5,
    len: [32, 46], wid: [14, 20], shape: 'ovate',
    color: green(96, 108, 38, 20, 26) });
  // far grass card
  {
    const r = rng(46);
    tile(P, 'grassCard', hsl(88, 32, 26), (w, h) => {
      for (let k = 0; k < 40; k++) {
        const bx = w / 2 + (r() - 0.5) * 120, len = 120 + r() * 110, lean = (r() - 0.5) * 110, bw = 5 + r() * 3;
        both(P, (c, isA) => {
          c.beginPath(); c.moveTo(bx - bw, h - 10); c.quadraticCurveTo(bx + lean * 0.3, h - len * 0.6, bx + lean, h - len);
          c.quadraticCurveTo(bx + lean * 0.3 + bw * 0.6, h - len * 0.6, bx + bw, h - 10); c.closePath();
          if (isA) { c.fillStyle = '#fff'; c.fill(); return; }
          const g = c.createLinearGradient(0, h, 0, h - len);
          g.addColorStop(0, hsl(95, 36, 18)); g.addColorStop(1, hsl(jit(r, 82, 5), 38, jit(r, 36, 4)));
          c.fillStyle = g; c.fill();
        });
      }
    });
  }
  // plain (solid geometry tinted by vertex colour: coconuts, stems, rachis, grass blades)
  {
    const [x, y, w, h] = TILES.plain;
    P.c.fillStyle = '#d8d8d4'; P.c.fillRect(x - 16, y - 16, w + 32, h + 32);
    P.a.fillStyle = '#fff'; P.a.fillRect(x, y, w, h);
  }

  // ---- bark strips (ringed bamboo-like areca cane, fibrous coconut cortex & continuous longitudinal hardwood bark) ----
  {
    const r = rng(50);
    const [x, , w] = TILES.arecaBark;
    const c = P.c;
    c.save(); c.beginPath(); c.rect(x - 3, 0, w + 6, ATLAS_H); c.clip();
    // Smooth silver-celadon bamboo/areca internode base
    c.fillStyle = hsl(94, 12, 56); c.fillRect(x - 3, 0, w + 6, ATLAS_H);
    // Fine vertical cane epidermal striations
    for (let k = 0; k < 240; k++) {
      const fx = x - 1 + r() * (w + 2), fy = r() * ATLAS_H, fl = 80 + r() * 160;
      c.strokeStyle = r() < 0.5 ? 'rgba(62,74,54,0.12)' : 'rgba(226,232,216,0.14)';
      c.lineWidth = 0.9 + r() * 1.0;
      c.beginPath();
      for (const dy of [-ATLAS_H, 0, ATLAS_H]) {
        c.moveTo(fx, fy + dy); c.lineTo(fx, fy + dy + fl);
      }
      c.stroke();
    }
    // Crisp, prominent horizontal pale cream-white nodal leaf-scar rings (characteristic Areca bamboo look)
    const rings = 36;
    for (let i = 0; i < rings; i++) {
      const y = ((i + 0.5) / rings) * ATLAS_H;
      const g = c.createLinearGradient(0, y - 14, 0, y + 16);
      g.addColorStop(0, 'rgba(54,66,46,0.0)');
      g.addColorStop(0.28, 'rgba(44,54,36,0.34)');
      g.addColorStop(0.42, 'rgba(244,246,234,0.85)');
      g.addColorStop(0.58, 'rgba(236,240,224,0.75)');
      g.addColorStop(0.72, 'rgba(48,58,40,0.40)');
      g.addColorStop(1, 'rgba(54,66,46,0.0)');
      c.fillStyle = g;
      c.fillRect(x - 3, y - 14, w + 6, 30);
    }
    c.restore();
  }
  {
    const r = rng(51);
    const [x, , w] = TILES.palmBark;
    const c = P.c;
    c.save(); c.beginPath(); c.rect(x - 4, 0, w + 8, ATLAS_H); c.clip();
    c.fillStyle = hsl(32, 13, 52); c.fillRect(x - 4, 0, w + 8, ATLAS_H);
    // Long continuous vertical fibrous cortex striations (no oval blotches or scales)
    for (let col = 0; col < w + 8; col += 2) {
      const fx = x - 4 + col;
      const shade = (r() - 0.5) * 14;
      c.fillStyle = `rgba(${132 + shade}, ${118 + shade}, ${102 + shade}, 0.22)`;
      c.fillRect(fx, 0, 2, ATLAS_H);
    }
    for (let k = 0; k < 380; k++) {
      const fx = x - 2 + r() * (w + 4), fy = r() * ATLAS_H, fl = 90 + r() * 180;
      c.strokeStyle = r() < 0.5 ? 'rgba(84,72,58,0.14)' : 'rgba(212,202,186,0.14)';
      c.lineWidth = 1.0 + r() * 1.2;
      c.beginPath();
      for (const dy of [-ATLAS_H, 0, ATLAS_H]) {
        c.moveTo(fx, fy + dy); c.lineTo(fx, fy + dy + fl);
      }
      c.stroke();
    }
    // Straight, natural horizontal leaf-scar rings (zero sinusoidal wave scales)
    const rings = 32;
    for (let i = 0; i < rings; i++) {
      const y = ((i + 0.5) / rings) * ATLAS_H + (r() - 0.5) * 6;
      const g = c.createLinearGradient(0, y - 6, 0, y + 8);
      g.addColorStop(0, 'rgba(215,205,188,0.0)');
      g.addColorStop(0.32, 'rgba(216,206,190,0.20)');
      g.addColorStop(0.55, 'rgba(78,66,52,0.22)');
      g.addColorStop(1, 'rgba(95,82,66,0.0)');
      c.fillStyle = g;
      c.fillRect(x - 4, y - 6, w + 8, 14);
    }
    c.restore();
  }
  // Silver-white birch / aspen bark strip with characteristic dark horizontal lenticel dashes & branch-scar knots
  {
    const r = rng(53);
    const [x, , w] = TILES.birchBark;
    const c = P.c;
    c.save(); c.beginPath(); c.rect(x - 3, 0, w + 6, ATLAS_H); c.clip();
    c.fillStyle = hsl(38, 14, 82); c.fillRect(x - 3, 0, w + 6, ATLAS_H);
    // Subtle papery horizontal silver-cream shading bands
    for (let row = 0; row < ATLAS_H; row += 8) {
      const shade = Math.round((r() - 0.5) * 14);
      c.fillStyle = `rgb(${214 + shade}, ${210 + shade}, ${200 + shade})`;
      c.fillRect(x - 3, row, w + 6, 8);
    }
    // Characteristic dark charcoal-brown horizontal birch/aspen lenticels & diamond eye scars
    for (let k = 0; k < 420; k++) {
      const lx = x + r() * w;
      const ly = r() * ATLAS_H;
      const lw = 6 + r() * 18;
      const lh = 1.5 + r() * 2.8;
      c.fillStyle = r() < 0.25 ? 'rgba(38,34,30,0.72)' : 'rgba(64,58,50,0.48)';
      for (const dy of [-ATLAS_H, 0, ATLAS_H]) {
        c.fillRect(lx - lw * 0.5, ly + dy, lw, lh);
      }
    }
    c.restore();
  }
  {
    const r = rng(52);
    const [x, , w] = TILES.treeBark;
    const c = P.c;
    c.save(); c.beginPath(); c.rect(x - 4, 0, w + 8, ATLAS_H); c.clip();
    c.fillStyle = hsl(28, 14, 48); c.fillRect(x - 4, 0, w + 8, ATLAS_H);
    // Continuous full-height longitudinal bark ridges & furrows (eliminates any blocky/snake-scale pattern)
    for (let col = 0; col < w + 8; col++) {
      const fx = x - 4 + col;
      const u = col / (w + 8);
      const ridge = Math.sin(u * Math.PI * 2 * 7) * 0.5 + Math.cos(u * Math.PI * 2 * 13 + 1.2) * 0.3 + (r() - 0.5) * 0.2;
      const delta = Math.round(ridge * 18);
      c.fillStyle = `rgb(${126 + delta}, ${112 + delta}, ${98 + delta})`;
      c.fillRect(fx, 0, 1.5, ATLAS_H);
    }
    // Long vertical wood/bark fibers spanning seamlessly in Y
    for (let k = 0; k < 520; k++) {
      const fx = x + 1 + r() * (w - 2), fy = r() * ATLAS_H, fl = 140 + r() * 280;
      const dark = r() < 0.55;
      c.strokeStyle = dark ? 'rgba(42,33,24,0.20)' : 'rgba(196,182,162,0.16)';
      c.lineWidth = 1.0 + r() * 1.4;
      c.beginPath();
      for (const dy of [-ATLAS_H, 0, ATLAS_H]) {
        c.moveTo(fx, fy + dy);
        c.lineTo(fx + (r() - 0.5) * 0.8, fy + dy + fl);
      }
      c.stroke();
    }
    c.restore();
  }
  for (const k of ['arecaBark', 'palmBark', 'birchBark', 'treeBark']) { const [x, , w] = TILES[k]; P.a.fillStyle = '#fff'; P.a.fillRect(x - 2, 0, w + 4, ATLAS_H); }

  // ---- merge + edge RGB dilation (prevents any border fringing at leaf cutouts) ----
  const col = P.c.getImageData(0, 0, ATLAS_W, ATLAS_H).data;
  const alp = P.a.getImageData(0, 0, ATLAS_W, ATLAS_H).data;
  const data = new Uint8Array(ATLAS_W * ATLAS_H * 4);
  const solid = new Uint8Array(ATLAS_W * ATLAS_H);
  for (let p = 0, i = 0; i < data.length; p++, i += 4) {
    const a = alp[i];
    data[i] = col[i]; data[i + 1] = col[i + 1]; data[i + 2] = col[i + 2]; data[i + 3] = a;
    if (a >= 230) solid[p] = 1;
  }
  // Propagate interior opaque leaf RGB outward into semi-transparent/transparent border texels
  const nextSolid = new Uint8Array(solid);
  const dirs = [-1, 1, -ATLAS_W, ATLAS_W];
  for (let pass = 0; pass < 6; pass++) {
    nextSolid.set(solid);
    for (let y = 1; y < ATLAS_H - 1; y++) {
      const row = y * ATLAS_W;
      for (let x = 1; x < ATLAS_W - 1; x++) {
        const p = row + x;
        if (solid[p]) continue;
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let d = 0; d < 4; d++) {
          const np = p + dirs[d];
          if (solid[np]) {
            const ni = np * 4;
            sr += data[ni]; sg += data[ni + 1]; sb += data[ni + 2]; n++;
          }
        }
        if (n > 0) {
          const pi = p * 4;
          data[pi] = (sr / n) | 0; data[pi + 1] = (sg / n) | 0; data[pi + 2] = (sb / n) | 0;
          nextSolid[p] = 1;
        }
      }
    }
    solid.set(nextSolid);
  }

  const tex = new THREE.DataTexture(data, ATLAS_W, ATLAS_H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}
