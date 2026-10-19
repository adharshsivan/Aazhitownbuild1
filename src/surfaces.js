import * as THREE from 'three';
import { rng } from './geom.js';

// High-quality procedural ground surfaces built from tileable height fields:
// every surface gets a matching albedo + tangent-space normal map. Colour
// variation is multi-scale and low-contrast (no per-pixel speckle noise).

function periodicNoise(N, P, r) {
  const g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = ((x / N) * P) % P, fy = ((y / N) * P) % P;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
    const xa = ((x0 % P) + P) % P, xb = (xa + 1) % P, ya = ((y0 % P) + P) % P, yb = (ya + 1) % P;
    const a = g[ya * P + xa], b = g[ya * P + xb], c = g[yb * P + xa], d = g[yb * P + xb];
    const top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  };
}
function fbm(N, periods, r) {
  const fns = periods.map((P) => periodicNoise(N, P, r));
  return (x, y) => { let v = 0, a = 0.5, t = 0; for (const f of fns) { v += f(x, y) * a; t += a; a *= 0.5; } return v / t; };
}
const wrap = (i, N) => ((i % N) + N) % N;

function normalFrom(H, N, k) {
  const out = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = H[y * N + wrap(x + 1, N)] - H[y * N + wrap(x - 1, N)];
    const dy = H[wrap(y + 1, N) * N + x] - H[wrap(y - 1, N) * N + x];
    let nx = -dx * k, ny = dy * k, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * N + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}
function texFrom(data, N, srgb, aniso) {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = aniso; t.flipY = false; t.needsUpdate = true;
  return t;
}
function pack(N, fn) {
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [r, g, b] = fn(x, y, y * N + x);
    const i = (y * N + x) * 4;
    d[i] = Math.max(0, Math.min(255, r * 255)); d[i + 1] = Math.max(0, Math.min(255, g * 255)); d[i + 2] = Math.max(0, Math.min(255, b * 255)); d[i + 3] = 255;
  }
  return d;
}
function stamp(H, N, cx, cy, rad, h) {
  const R = Math.ceil(rad);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d2 = (dx * dx + dy * dy) / (rad * rad); if (d2 > 1) continue;
    H[wrap(cy + dy, N) * N + wrap(cx + dx, N)] += h * (1 - d2);
  }
}

export function makeSurfaces(aniso = 4) {
  const S = {};

  // ---- seamless poured architectural brushed concrete & fine mineral aggregate promenade ----
  // (Monolithic continuous surface with zero axis-aligned brick/tile grid lines that could crop at curved curbs)
  {
    const N = 1024, r = rng(101);
    const low = fbm(N, [2, 4, 8], r);
    const med = fbm(N, [12, 24, 48], r);
    const fine = fbm(N, [96, 192], r);
    const H = new Float32Array(N * N);
    const A = new Float32Array(N * N);
    const W = new Float32Array(N * N);

    // Subtle washed granite & quartz mineral aggregate micro-stones + tiny natural concrete air pores
    for (let i = 0; i < 36000; i++) {
      const x = Math.floor(r() * N), y = Math.floor(r() * N), rad = 0.75 + r() * 1.15;
      const isPore = r() < 0.14;
      stamp(H, N, x, y, rad, isPore ? -0.14 : (0.09 + r() * 0.14));
      stamp(A, N, x, y, rad * 0.9, isPore ? -0.05 : (r() - 0.48) * 0.11);
      stamp(W, N, x, y, rad * 0.9, (r() - 0.5) * 0.08);
    }

    // 3x3 smoothing pass so mineral aggregate reads as smooth architectural concrete without 1px speckle
    const Hs = new Float32Array(N * N);
    const As = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let sh = 0, sa = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const idx = wrap(y + dy, N) * N + wrap(x + dx, N);
        sh += H[idx];
        sa += A[idx];
      }
      const i = y * N + x;
      Hs[i] = (sh / 9) * 0.45 + 0.32 * med(x, y) + 0.23 * fine(x, y);
      As[i] = sa / 9;
    }

    S.paving = texFrom(pack(N, (x, y, i) => {
      const lo = low(x, y), m = med(x, y), f = fine(x, y);
      const l = 0.565 + 0.036 * (lo - 0.5) + 0.024 * (m - 0.5) + 0.016 * (f - 0.5) + 0.022 * As[i];
      const w = W[i] * 0.35 + 0.008 * (lo - 0.5);
      return [l * 1.01 + w, l * 0.99 + w * 0.4, l * 0.94 - w * 0.6];
    }), N, true, aniso);
    S.pavingN = texFrom(normalFrom(Hs, N, 0.72), N, false, aniso);
  }

  // ---- asphalt: believable dark grey road surface, fine mineral aggregate, restrained weathering ----
  {
    const N = 1024, r = rng(102);
    const H = new Float32Array(N * N), A = new Float32Array(N * N);
    const patch = fbm(N, [2, 4, 8], r), med = fbm(N, [16, 32, 64], r), agg = fbm(N, [128, 256], r);
    // subtle fine aggregate micro-stones
    for (let i = 0; i < 42000; i++) {
      const x = Math.floor(r() * N), y = Math.floor(r() * N), rad = 0.75 + r() * 1.1;
      stamp(H, N, x, y, rad, 0.12 + r() * 0.18);
      stamp(A, N, x, y, rad * 0.85, (r() - 0.48) * 0.14);
    }
    const Hs = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let sh = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        sh += H[wrap(y + dy, N) * N + wrap(x + dx, N)];
      }
      const i = y * N + x;
      Hs[i] = (sh / 9) * 0.50 + 0.28 * agg(x, y) + 0.22 * med(x, y);
    }
    S.asphalt = texFrom(pack(N, (x, y, i) => {
      const p = patch(x, y), m = med(x, y), ag = agg(x, y);
      const l = 0.215 + 0.022 * (p - 0.5) + 0.015 * (m - 0.5) + 0.015 * (ag - 0.5) + 0.014 * A[i];
      return [l * 0.99, l * 1.0, l * 1.03];
    }), N, true, aniso);
    S.asphaltN = texFrom(normalFrom(Hs, N, 0.78), N, false, aniso);
  }

  // ---- tropical Kerala lawn: rich organic green patches, fine blade micro-clusters, clover/soil undertones ----
  {
    const N = 1024, r = rng(103);
    const patch = fbm(N, [2, 4, 8], r), mid = fbm(N, [14, 28], r), fine = fbm(N, [56, 112], r), soil = fbm(N, [6, 12], r);
    const H = new Float32Array(N * N), Bld = new Float32Array(N * N), Weed = new Float32Array(N * N);
    // soft directional grass blade clusters
    for (let i = 0; i < 55000; i++) {
      let x = r() * N, y = r() * N;
      const a = r() * Math.PI * 2, len = 4 + r() * 6, v = (r() - 0.45) * 0.14;
      for (let s = 0; s < len; s++) {
        const xi = wrap(Math.floor(x), N), yi = wrap(Math.floor(y), N);
        Bld[yi * N + xi] += v;
        H[yi * N + xi] += 0.16 * (1 - s / len);
        x += Math.cos(a) * 0.9; y += Math.sin(a) * 0.9;
      }
    }
    // sparse low clover / broadleaf groundcover rosettes
    for (let i = 0; i < 1400; i++) {
      const cx = Math.floor(r() * N), cy = Math.floor(r() * N), tone = 0.04 + r() * 0.05;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + r() * 0.5;
        stamp(Weed, N, Math.round(cx + Math.cos(a) * 3), Math.round(cy + Math.sin(a) * 3), 2.6, tone);
        stamp(H, N, Math.round(cx + Math.cos(a) * 3), Math.round(cy + Math.sin(a) * 3), 2.6, 0.22);
      }
    }
    // 3x3 box filter on H and Bld so blades read as soft turf without 1px grain
    const Hs = new Float32Array(N * N), Bs = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let sh = 0, sb = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const idx = wrap(y + dy, N) * N + wrap(x + dx, N);
        sh += H[idx]; sb += Bld[idx];
      }
      const i = y * N + x;
      Hs[i] = sh / 9 + 0.25 * fine(x, y);
      Bs[i] = Math.max(-0.1, Math.min(0.1, sb / 9));
    }
    S.grass = texFrom(pack(N, (x, y, i) => {
      const p = patch(x, y), m = mid(x, y), f = fine(x, y), sl = Math.max(0, soil(x, y) - 0.62) * 1.9;
      const w = Math.min(0.08, Weed[i]);
      let R = 0.20 + 0.05 * p + 0.02 * (m - 0.5) - 0.02 * w;
      let G = 0.34 + 0.065 * p + 0.03 * (m - 0.5) + 0.04 * w;
      let B = 0.12 + 0.025 * p + 0.01 * w;
      const k = 1 + Bs[i] + 0.05 * (f - 0.5);
      R *= k; G *= k; B *= k;
      // warm earthy tropical soil peeking gently in thin spots
      R = R * (1 - sl * 0.35) + 0.30 * (sl * 0.35);
      G = G * (1 - sl * 0.35) + 0.23 * (sl * 0.35);
      B = B * (1 - sl * 0.35) + 0.15 * (sl * 0.35);
      return [R, G, B];
    }), N, true, aniso);
    S.grassN = texFrom(normalFrom(Hs, N, 0.50), N, false, aniso);
  }

  // ---- seamless weathered precast architectural concrete kerb & coping (isotropic, zero cropped UV stripes or joints) ----
  {
    const N = 512, r = rng(107);
    const low = fbm(N, [2, 4, 8], r), med = fbm(N, [14, 28], r), fine = fbm(N, [64, 128], r);
    const H = new Float32Array(N * N);
    for (let i = 0; i < 4200; i++) {
      stamp(H, N, Math.floor(r() * N), Math.floor(r() * N), 0.8 + r() * 1.1, (r() - 0.52) * 0.22);
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      H[i] = H[i] * 0.38 + 0.38 * med(x, y) + 0.24 * fine(x, y);
    }
    S.curb = texFrom(pack(N, (x, y, i) => {
      const lo = low(x, y), m = med(x, y), f = fine(x, y);
      const l = 0.62 + 0.042 * (lo - 0.5) + 0.028 * (m - 0.5) + 0.018 * (f - 0.5) + 0.02 * (H[i] - 0.3);
      return [l * 0.99, l * 0.98, l * 0.93];
    }), N, true, aniso);
    S.curbN = texFrom(normalFrom(H, N, 0.75), N, false, aniso);
  }

  // ---- sand: wind ripples + grain ----
  {
    const N = 512, r = rng(104);
    const warp = fbm(N, [4, 8], r), low = fbm(N, [3, 6], r), grain = fbm(N, [128, 256], r);
    const H = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const w = warp(x, y);
      H[y * N + x] = 0.5 + 0.35 * Math.sin((y / N) * Math.PI * 2 * 14 + w * 9) + 0.25 * grain(x, y);
    }
    S.sand = texFrom(pack(N, (x, y, i) => {
      const l = 0.86 + 0.06 * (low(x, y) - 0.5) * 2 + 0.05 * (grain(x, y) - 0.5) + 0.025 * (H[i] - 0.5);
      return [0.9 * l, 0.8 * l, 0.6 * l];
    }), N, true, aniso);
    S.sandN = texFrom(normalFrom(H, N, 1.2), N, false, aniso);
  }

  // ---- coastal granite seawall stone: organic rough-hewn rock relief (zero rectangular brick grid to crop at seawall top/bottom) ----
  {
    const N = 512, r = rng(105);
    const macro = fbm(N, [3, 6, 12], r), med = fbm(N, [16, 32], r), fine = fbm(N, [64, 128], r);
    const warpX = fbm(N, [4, 8], r), warpY = fbm(N, [4, 8], r);
    const H = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const wx = wrap(x + (warpX(x, y) - 0.5) * 42, N);
      const wy = wrap(y + (warpY(x, y) - 0.5) * 42, N);
      const m1 = macro(wx, wy), m2 = med(wx, wy), f = fine(x, y);
      // Natural granite crag facets + mineral clefts
      const ridge = 1.0 - Math.abs(m1 * 2.0 - 1.0);
      H[y * N + x] = 0.52 * ridge + 0.30 * m2 + 0.18 * f;
    }
    S.stone = texFrom(pack(N, (x, y, i) => {
      const h = H[i], lo = macro(x, y), m = med(x, y), f = fine(x, y);
      const l = (0.44 + 0.16 * h) * (0.93 + 0.12 * (lo - 0.5) + 0.08 * (m - 0.5) + 0.05 * (f - 0.5));
      return [l * 1.01, l * 0.98, l * 0.93];
    }), N, true, aniso);
    S.stoneN = texFrom(normalFrom(H, N, 1.65), N, false, aniso);
  }

  // ---- concrete (slabs, stairs): smooth, mottled, tiny pores ----
  {
    const N = 512, r = rng(106);
    const low = fbm(N, [4, 8, 16], r), med = fbm(N, [24, 48], r), fine = fbm(N, [96, 192], r);
    const H = new Float32Array(N * N);
    for (let i = 0; i < 2500; i++) stamp(H, N, Math.floor(r() * N), Math.floor(r() * N), 0.8 + r(), -0.35);
    S.concrete = texFrom(pack(N, (x, y, i) => {
      const l = 0.78 + 0.045 * (low(x, y) - 0.5) * 2 + 0.025 * (med(x, y) - 0.5) + 0.02 * (fine(x, y) - 0.5) + 0.04 * H[i];
      return [l, l * 0.98, l * 0.93];
    }), N, true, aniso);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = H[y * N + x] * 0.4 + 0.35 * med(x, y) + 0.25 * fine(x, y);
    S.concreteN = texFrom(normalFrom(H, N, 0.75), N, false, aniso);
  }
  return S;
}
