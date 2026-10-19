import * as THREE from 'three';
import { rng } from '../geom.js';

// Procedural, tileable coastal textures generated once at load (no binary assets):
//  sandA     – sRGB grain detail around a neutral mid value (zone colours come from the shader)
//  sandN     – world-space slope map (RG = -dh/dx, -dh/dz, B = height) of sand ripples + grains
//  waterN    – wind-ripple slope map from a periodic directional wave spectrum
//  coastTex  – R: lacy foam, G: caustic network
//  noiseTex  – four independent tileable fbm channels for macro variation

function periodicNoise(N, P, r) {
  const g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = ((x / N) * P), fy = ((y / N) * P);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
    const xa = ((x0 % P) + P) % P, xb = (xa + 1) % P, ya = ((y0 % P) + P) % P, yb = (ya + 1) % P;
    const a = g[ya * P + xa], b = g[ya * P + xb], c = g[yb * P + xa], d = g[yb * P + xb];
    const top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  };
}
function pfbm(N, periods, r) {
  const fns = periods.map((P) => periodicNoise(N, P, r));
  return (x, y) => { let v = 0, a = 0.5, t = 0; for (const f of fns) { v += f(x, y) * a; t += a; a *= 0.55; } return v / t; };
}
const wrap = (i, N) => ((i % N) + N) % N;

/** Tileable Voronoi: returns (x,y) -> [F1, F2] in units of cell size. */
function voronoi(N, cells, r) {
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < pts.length; i++) pts[i] = 0.12 + r() * 0.76;
  return (x, y) => {
    const fx = (x / N) * cells, fy = (y / N) * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let f1 = 9, f2 = 9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy;
      const k = (wrap(cy, cells) * cells + wrap(cx, cells)) * 2;
      const px = cx + pts[k], py = cy + pts[k + 1];
      const d = Math.hypot(px - fx, py - fy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return [f1, f2];
  };
}

function dataTex(data, N, { srgb = false, mips = true, aniso = 4, M = N } = {}) {
  const t = new THREE.DataTexture(data, N, M, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mips; t.anisotropy = aniso; t.flipY = false; t.needsUpdate = true;
  return t;
}
const u8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

export function makeCoastTextures(aniso = 4) {
  const T = {};

  // ---- sand albedo detail: smooth, velvety warm sand with subtle macro tonal warmth (no harsh micrograin speckles)
  {
    const N = 256, r = rng(4401);
    const low = pfbm(N, [3, 6], r), mid = pfbm(N, [8, 16], r);
    const d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const w = (low(x, y) - 0.5) * 0.032 + (mid(x, y) - 0.5) * 0.016;
      const l = 0.5 + w;
      d[i * 4] = u8(l + w * 0.15);
      d[i * 4 + 1] = u8(l);
      d[i * 4 + 2] = u8(l - w * 0.18);
      d[i * 4 + 3] = 255;
    }
    T.sandA = dataTex(d, N, { srgb: true, aniso });
  }

  // ---- sand relief: soft, gentle wind-swept undulations (zero gritty pits or harsh corduroy lines)
  {
    const N = 256, r = rng(4402);
    const warp = pfbm(N, [3, 6], r), amp = pfbm(N, [4, 8], r);
    const H = new Float32Array(N * N);
    const ripples = 10;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let ph = (y / N) * ripples + 1.2 * (warp(x, y) - 0.5);
      ph -= Math.floor(ph);
      const prof = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
      const a = 0.45 + 0.55 * amp(x, y);
      H[y * N + x] = prof * a * 0.35;
    }
    const d = new Uint8Array(N * N * 4);
    const k = 0.75;
    let hMin = Infinity, hMax = -Infinity;
    for (const v of H) { hMin = Math.min(hMin, v); hMax = Math.max(hMax, v); }
    const hSpan = Math.max(1e-5, hMax - hMin);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const sx = -(H[y * N + wrap(x + 1, N)] - H[y * N + wrap(x - 1, N)]) * k;
      const sz = -(H[wrap(y + 1, N) * N + x] - H[wrap(y - 1, N) * N + x]) * k;
      d[i * 4] = u8(0.5 + 0.5 * Math.max(-1, Math.min(1, sx)));
      d[i * 4 + 1] = u8(0.5 + 0.5 * Math.max(-1, Math.min(1, sz)));
      d[i * 4 + 2] = u8((H[i] - hMin) / hSpan);
      d[i * 4 + 3] = 255;
    }
    T.sandN = dataTex(d, N, { aniso });
  }

  // ---- water ripples: smooth, multi-directional capillary spectrum (no parallel grass-like striations)
  {
    const N = 256, r = rng(4403);
    const waves = [];
    for (let n = 0; n < 64; n++) {
      const kmag = 2 + Math.floor(r() * r() * 11);
      // Full omni-directional spread with a gentle prevailing bias so wavelets never form combed parallel streaks
      const ang = (n * 2.399963 + (r() - 0.5) * 0.45) % (Math.PI * 2);
      const kx = Math.round(Math.cos(ang) * kmag), ky = Math.round(Math.sin(ang) * kmag);
      if (kx === 0 && ky === 0) continue;
      const km = Math.hypot(kx, ky);
      const dirWeight = 0.72 + 0.28 * Math.cos(ang - 0.35);
      waves.push({ kx, ky, a: Math.pow(km, -2.15) * dirWeight * (0.65 + r() * 0.7), ph: r() * Math.PI * 2 });
    }
    const sx = new Float32Array(N * N), sy = new Float32Array(N * N), hh = new Float32Array(N * N);
    let m = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let h = 0, dx = 0, dy = 0;
      for (const w of waves) {
        const th = ((w.kx * x + w.ky * y) / N) * Math.PI * 2 + w.ph;
        h += w.a * Math.sin(th);
        const c = w.a * Math.cos(th) * Math.PI * 2;
        dx += c * w.kx; dy += c * w.ky;
      }
      const i = y * N + x;
      sx[i] = -dx; sy[i] = -dy; hh[i] = h;
      m = Math.max(m, Math.abs(dx), Math.abs(dy));
    }
    const d = new Uint8Array(N * N * 4);
    let hMin = Infinity, hMax = -Infinity;
    for (const v of hh) { hMin = Math.min(hMin, v); hMax = Math.max(hMax, v); }
    for (let i = 0; i < N * N; i++) {
      d[i * 4] = u8(0.5 + 0.5 * sx[i] / m); d[i * 4 + 1] = u8(0.5 + 0.5 * sy[i] / m);
      d[i * 4 + 2] = u8((hh[i] - hMin) / (hMax - hMin)); d[i * 4 + 3] = 255;
    }
    T.waterN = dataTex(d, N, { aniso });
    T.waterNScale = m / N;   // slope units per (1/tile) — informational
  }

  // ---- foam lace (R) + caustic network (G)
  {
    const N = 256, r = rng(4404);
    const warpX = pfbm(N, [4, 8, 16], r), warpY = pfbm(N, [4, 8, 16], r);
    const billow = pfbm(N, [6, 12, 24], r);
    const wisps = pfbm(N, [10, 20, 40], r);
    const bubbles = pfbm(N, [28, 56, 96], r);
    const patch = pfbm(N, [3, 6, 12], r);
    const vc = voronoi(N, 7, r), vc2 = voronoi(N, 13, r);
    const d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const wx = x + (warpX(x, y) - 0.5) * 34;
      const wy = y + (warpY(x, y) - 0.5) * 34;
      const b1 = billow(wx, wy);
      const b2 = wisps(wx * 1.15 + 37, wy * 0.92 + 19);
      const bub = bubbles(x + (b1 - 0.5) * 14, y + (b2 - 0.5) * 14);
      const env = 0.55 + 0.45 * patch(x, y);
      const rawFoam = (b1 * 0.44 + b2 * 0.34 + bub * 0.22) * env;
      const fVal = Math.max(0, Math.min(1, (rawFoam - 0.22) / 0.58));
      d[i * 4] = u8(fVal * fVal * (3 - 2 * fVal));

      const [c1, e1] = vc(x, y), [c2, e2] = vc2(x, y);
      const ca = Math.pow(1 - Math.min(1, (e1 - c1) / 0.16), 2.6), cb = Math.pow(1 - Math.min(1, (e2 - c2) / 0.2), 2.2);
      d[i * 4 + 1] = u8(Math.min(1, ca * 0.75 + cb * 0.45));
      d[i * 4 + 2] = 0;
      d[i * 4 + 3] = 255;
    }
    T.coastTex = dataTex(d, N, { aniso });
  }

  // ---- macro noise: 4 independent fbm channels
  {
    const N = 256, r = rng(4405);
    const ch = [pfbm(N, [4, 8, 16], r), pfbm(N, [3, 6, 12], r), pfbm(N, [6, 12, 24], r), pfbm(N, [5, 10, 20, 40], r)];
    const d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      for (let c = 0; c < 4; c++) d[i + c] = u8(0.5 + (ch[c](x, y) - 0.5) * 1.9);
    }
    T.noiseTex = dataTex(d, N, { aniso });
  }
  return T;
}

/**
 * Lightweight beach contact occlusion map over `rect` = [x0, z0, x1, z1]:
 *   G = contact occlusion around rocks and palm trunks (1.0 = open)
 */
export function makeBeachDetail({ rect, height, rocks, trees, W = 256, Hh = 128 }) {
  const [x0, z0, x1, z1] = rect;
  const sx = (x1 - x0) / W, sz = (z1 - z0) / Hh;
  const ao = new Float32Array(W * Hh).fill(1);
  const d = new Uint8Array(W * Hh * 4);
  const toTex = (x, z) => [(x - x0) / sx, (z - z0) / sz];

  // Contact occlusion around rocks bedded in sand and around beach tree trunks
  const occl = (x, z, R, k) => {
    const [cx, cz] = toTex(x, z);
    const ext = R + 1.3;
    const rx = Math.ceil(ext / sx), rz = Math.ceil(ext / sz);
    if (cx + rx < 0 || cz + rz < 0 || cx - rx >= W || cz - rz >= Hh) return;
    for (let j = Math.max(0, Math.floor(cz - rz)); j <= Math.min(Hh - 1, cz + rz); j++) {
      for (let i = Math.max(0, Math.floor(cx - rx)); i <= Math.min(W - 1, cx + rx); i++) {
        const wx = x0 + (i + 0.5) * sx - x, wz = z0 + (j + 0.5) * sz - z;
        const dist = Math.hypot(wx, wz) - R;
        const o = dist < 0 ? k : k * Math.exp(-((dist / (0.25 + R * 0.22)) ** 2));
        const kk = j * W + i;
        ao[kk] = Math.min(ao[kk], 1 - o);
      }
    }
  };
  for (const q of rocks) {
    const g = height(q.x, q.z);
    if (q.top < g + 0.05 || g < -0.4) continue;
    occl(q.x, q.z, q.Rg, 0.42);
  }
  for (const t of trees) occl(t.x, t.z, 0.22, 0.32);

  for (let i = 0; i < W * Hh; i++) {
    const o = i * 4;
    d[o] = 128;
    d[o + 1] = u8(ao[i]);
    d[o + 2] = 128;
    d[o + 3] = 255;
  }

  const tex = new THREE.DataTexture(d, W, Hh, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}
