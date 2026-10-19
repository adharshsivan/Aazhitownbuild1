import * as THREE from 'three';

// Time-of-day palette keyed by solar elevation (degrees). The 31° key is the
// island's original late-afternoon look, so the default time reproduces it.
// Sunrise and sunset share elevations but differ in hue: mornings are cooler,
// golden and slightly pink; evenings run deeper orange-red into a violet blue hour.
// zen/hor: sky zenith & horizon; glow: horizon colour towards the sun;
// sun: direct light colour (lux-ish intensity sunI); hemiSky/hemiGnd/hemiI: ambient;
// fog: aerial-perspective colour; cloudLit/cloudAmb: cloud light & shade.

const K = (e, o, evening = null) => ({ e, ...o, evening });
const KEYS = [
  // Deep velvet moonlit night: rich midnight sapphire zenith, luminous marine horizon, silver-blue moonlit clouds
  K(-90, { zen: '#03091c', hor: '#0c1f40', glow: '#0e2448', sun: '#000000', sunI: 0, hemiSky: '#5c7cb8', hemiGnd: '#181f2e', hemiI: 0.52, fog: '#0b1b38', cloudLit: '#2a3d62', cloudAmb: '#0e182e' }),
  K(-16, { zen: '#040c24', hor: '#10264e', glow: '#142e5c', sun: '#000000', sunI: 0, hemiSky: '#6080bc', hemiGnd: '#1a2130', hemiI: 0.54, fog: '#0e2042', cloudLit: '#2e436b', cloudAmb: '#101c34' }),
  // Blue hour / nautical twilight: deep royal cobalt zenith with indigo-violet horizon
  K(-9, { zen: '#0b1e48', hor: '#263c72', glow: '#5e4270', sun: '#000000', sunI: 0, hemiSky: '#6e88c2', hemiGnd: '#1f2436', hemiI: 0.62, fog: '#223664', cloudLit: '#5c5488', cloudAmb: '#1b2b4e' }),
  // Civil twilight (dawn / dusk): deep indigo-cobalt zenith into vibrant crimson-tangerine afterglow
  K(-4.5, { zen: '#142f68', hor: '#964c6e', glow: '#ff5420', sun: '#000000', sunI: 0, hemiSky: '#8a92c4', hemiGnd: '#332936', hemiI: 0.74, fog: '#824c68', cloudLit: '#ff6e38', cloudAmb: '#3a4674' },
    { glow: '#ff4214', hor: '#a8445c', fog: '#944658', cloudLit: '#ff5c28', cloudAmb: '#383e6a' }),
  // Sunrise / Sunset horizon crossing: deep cobalt-indigo overhead, blazing bright orange & tangerine-crimson horizon
  K(-0.8, { zen: '#18428c', hor: '#ff7224', glow: '#ff4d06', sun: '#ff5c14', sunI: 0.55, hemiSky: '#b2a8ce', hemiGnd: '#684632', hemiI: 0.85, fog: '#eb6e2c', cloudLit: '#ff8a36', cloudAmb: '#5e6e9c' },
    { zen: '#14387c', hor: '#ff5a14', glow: '#ff3a00', sun: '#ff4808', fog: '#e6581e', cloudLit: '#ff7422', cloudAmb: '#625c8e' }),
  // Golden hour: rich royal-cerulean zenith with brilliant warm orange-amber horizon and glowing orange-gold clouds
  K(4, { zen: '#1854b0', hor: '#ff9234', glow: '#ff6812', sun: '#ff761e', sunI: 1.85, hemiSky: '#c4c8e6', hemiGnd: '#76563c', hemiI: 1.00, fog: '#ee8c3e', cloudLit: '#ffa84c', cloudAmb: '#728ab8' },
    { zen: '#154aa2', hor: '#ff7c22', glow: '#ff5206', sun: '#ff6210', fog: '#ea7a2c', cloudLit: '#ff9438', cloudAmb: '#7080ae' }),
  // Morning / Late Afternoon: deep tropical azure zenith, warm golden-apricot horizon
  K(14, { zen: '#1866c8', hor: '#f6b874', glow: '#ff8e2b', sun: '#ff9a3c', sunI: 2.70, hemiSky: '#c8dcf8', hemiGnd: '#80684c', hemiI: 1.10, fog: '#e8b67c', cloudLit: '#ffd08e', cloudAmb: '#86a2ca' },
    { zen: '#165ec0', hor: '#f8a65c', glow: '#ff7818', sun: '#ff8828', fog: '#e8a668', cloudLit: '#ffc278', cloudAmb: '#829bc4' }),
  // Classic 16:30 Kerala island light: vivid azure sky, warm golden-ivory horizon, bright sunlit clouds
  K(31, { zen: '#1668cc', hor: '#add4f4', glow: '#ffd699', sun: '#ffce8a', sunI: 3.15, hemiSky: '#cae2ff', hemiGnd: '#8a7656', hemiI: 1.16, fog: '#b8d8f2', cloudLit: '#fff8ec', cloudAmb: '#8eaad0' }),
  // High day / Noon: deep sapphire-azure overhead, refreshing tropical sky-blue horizon
  K(55, { zen: '#1260c4', hor: '#9ecdf4', glow: '#ffe8be', sun: '#ffe6bd', sunI: 3.35, hemiSky: '#d2e6ff', hemiGnd: '#8a7a60', hemiI: 1.22, fog: '#aad2f2', cloudLit: '#ffffff', cloudAmb: '#94b0d6' }),
  K(90, { zen: '#0f5bc0', hor: '#98caf2', glow: '#ffe8c2', sun: '#ffe8c4', sunI: 3.40, hemiSky: '#d6e8ff', hemiGnd: '#8a7a60', hemiI: 1.24, fog: '#a6d0f0', cloudLit: '#ffffff', cloudAmb: '#96b2d8' }),
];
const COLOR_KEYS = ['zen', 'hor', 'glow', 'sun', 'hemiSky', 'hemiGnd', 'fog', 'cloudLit', 'cloudAmb'];
// pre-convert to linear THREE.Colors (morning & evening variants)
const prep = (o) => Object.fromEntries(COLOR_KEYS.map((k) => [k, new THREE.Color(o[k])]));
const MORNING = KEYS.map((k) => ({ e: k.e, sunI: k.sunI, hemiI: k.hemiI, c: prep(k) }));
const EVENING = KEYS.map((k) => ({ e: k.e, sunI: k.sunI, hemiI: k.hemiI, c: prep({ ...k, ...(k.evening || {}) }) }));

export function makePalette() {
  const out = { sunI: 0, hemiI: 0 };
  for (const k of COLOR_KEYS) out[k] = new THREE.Color();
  return out;
}

const tmpA = new THREE.Color(), tmpB = new THREE.Color();
/** Fill `out` for solar elevation `elevDeg`; `evening` 0..1 blends towards the sunset variant. */
export function samplePalette(out, elevDeg, evening) {
  const e = Math.max(-90, Math.min(90, elevDeg));
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].e < e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  let t = (e - a.e) / (b.e - a.e);
  t = t * t * (3 - 2 * t);
  out.sunI = a.sunI + (b.sunI - a.sunI) * t;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;
  for (const k of COLOR_KEYS) {
    tmpA.copy(MORNING[i].c[k]).lerp(EVENING[i].c[k], evening);
    tmpB.copy(MORNING[i + 1].c[k]).lerp(EVENING[i + 1].c[k], evening);
    out[k].copy(tmpA).lerp(tmpB, t);
  }
  return out;
}
