import * as THREE from 'three';
import { fbm } from '../world/coastField.js';

const placeholder = (() => {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

export const atmoUniforms = {
  uCloudTex: { value: placeholder },
  uCloudOffset: { value: new THREE.Vector2() },
  uScudOffset: { value: new THREE.Vector2() },
  uCloudCover: { value: 0.28 },
  uCloudSoft: { value: 0.22 },
  uCloudShadowK: { value: 0.84 },
  uCloudScale: { value: 1 / 1600 },
  uCloudAlt: { value: 260 },
  uLightDirW: { value: new THREE.Vector3(-0.78, 0.52, 0.36).normalize() },
  uAtmoTime: { value: 0 },
  uMistDensity: { value: 0 },
  uMistHeight: { value: 6 },
  uWet: { value: 0 },
  uPuddle: { value: 0 },
  uRainNow: { value: 0 },
  uSkyZenW: { value: new THREE.Color('#4f8fcf') },
  uSkyHorW: { value: new THREE.Color('#f1d9b8') },
  uLampLevel: { value: 0 },
  uLampRect: { value: new THREE.Vector4(-70, -66, 70, 70) },
  uLampMap: { value: placeholder },
  uPuddleNoise: { value: placeholder },
  // 0 = Low, 1 = Medium, 2 = High, 3 = Max
  uSurfaceQuality: { value: 2.0 },
};

// Build a tileable 4-channel cloud noise texture (R: cumulus base, G: detail billow, B: cauliflower, A: cirrus wisps)
export function makeCloudTexture(N = 256) {
  const data = new Uint8Array(N * N * 4);
  const perm = new Uint8Array(512);
  let s = 1337;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const pnoise = (x, y, P, off) => {
    const xi = ((Math.floor(x) % P) + P) % P, yi = ((Math.floor(y) % P) + P) % P;
    const x1 = (xi + 1) % P, y1 = (yi + 1) % P;
    const xf = fade(x - Math.floor(x)), yf = fade(y - Math.floor(y));
    const h = (a, b) => perm[(perm[(a + off) & 255] + b) & 255] / 255;
    return lerp(lerp(h(xi, yi), h(x1, yi), xf), lerp(h(xi, y1), h(x1, y1), xf), yf);
  };
  const pfbm = (u, v, baseP, oct, off, billow = false) => {
    let sum = 0, amp = 0.5, norm = 0, p = baseP;
    for (let o = 0; o < oct; o++) {
      let n = pnoise(u * p, v * p, p, off + o * 37);
      if (billow) n = 1 - Math.abs(n * 2 - 1);
      sum += n * amp; norm += amp; amp *= 0.5; p *= 2;
    }
    return sum / norm;
  };
  for (let y = 0; y < N; y++) {
    const v = y / N;
    for (let x = 0; x < N; x++) {
      const u = x / N, k = (y * N + x) * 4;
      data[k]     = Math.round(pfbm(u, v, 4,  5, 0,   false) * 255);
      data[k + 1] = Math.round(pfbm(u, v, 8,  4, 67,  false) * 255);
      data[k + 2] = Math.round(pfbm(u, v, 6,  4, 131, true)  * 255);
      data[k + 3] = Math.round(pfbm(u, v, 12, 3, 199, false) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export const CLOUD_FN_GLSL = /* glsl */`
uniform sampler2D uCloudTex;
uniform vec2 uCloudOffset;
uniform vec2 uScudOffset;
uniform float uCloudCover;
uniform float uCloudSoft;
uniform float uCloudShadowK;
uniform float uCloudScale;
uniform float uCloudAlt;

float sampleCloudMap(vec2 xz) {
  if (uCloudCover <= 0.01) return 0.0;
  vec2 uv = xz * uCloudScale + uCloudOffset * 0.00025;
  vec4 c1 = texture2D(uCloudTex, uv);
  vec4 c2 = texture2D(uCloudTex, uv * 2.3 + vec2(0.37, 0.71));
  float n = c1.r * 0.62 + c1.b * 0.26 + c2.g * 0.12;
  float edge = 1.0 - uCloudCover * 0.92;
  float soft = max(0.06, uCloudSoft);
  return smoothstep(edge - soft * 0.5, edge + soft * 0.5, n);
}

float cloudShadowFactor(vec3 wp, vec3 lightDir) {
  if (uCloudCover <= 0.02) return 1.0;
  float t = (uCloudAlt - wp.y) / max(lightDir.y, 0.12);
  vec2 p = wp.xz + lightDir.xz * t;
  float cl = sampleCloudMap(p);
  return 1.0 - cl * (1.0 - uCloudShadowK) * smoothstep(0.0, 0.35, uCloudCover);
}
`;
