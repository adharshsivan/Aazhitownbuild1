import * as THREE from 'three';

import { coastUniforms } from './world/coastShading.js';

function std(params) { return new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...params }); }

function tiled(tex, sx = 1, sy = sx) { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(sx, sy); return t; }

// Hardware-filtered world-space macro tonal variation using coastUniforms.uNoiseTex:
//  - Zero mediump float mantissa quantization/static on mobile GPUs (unlike fract/dot ALU hashes)
//  - Automatically mipmapped by GPU hardware so distant roads/lawns/pavements never shimmer on movement
function withWorldMacro(mat, key, fragColorGlsl, fragRoughGlsl = '') {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMacroNoise = coastUniforms.uNoiseTex;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorldPos;
        uniform sampler2D uMacroNoise;`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n{\n${fragColorGlsl}\n}`);
    if (fragRoughGlsl) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n{\n${fragRoughGlsl}\n}`);
    }
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function makeMaterials(T) {
  const asphalt = withWorldMacro(
    std({ map: T.asphalt, normalMap: T.asphaltN, normalScale: new THREE.Vector2(0.28, 0.28), roughness: 0.89 }),
    'aazhi-asphalt-v6',
    `vec4 mn = texture2D(uMacroNoise, vWorldPos.xz * 0.022);
     vec2 rUv = vec2(vWorldPos.x * 0.138 - vWorldPos.z * 0.107, vWorldPos.x * 0.107 + vWorldPos.z * 0.138);
     float wBlend = smoothstep(0.28, 0.72, mn.r);
     diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, rUv).rgb * diffuse, wBlend);
     diffuseColor.rgb *= 0.95 + 0.09 * mn.g;`,
    `vec4 mr = texture2D(uMacroNoise, vWorldPos.xz * 0.032 + vec2(0.37, 0.71));
     roughnessFactor = clamp(roughnessFactor * (0.92 + 0.14 * mr.b), 0.76, 0.96);`
  );

  const paving = withWorldMacro(
    std({ map: T.paving, normalMap: T.pavingN, normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.84 }),
    'aazhi-paving-v8',
    `vec4 mn = texture2D(uMacroNoise, vWorldPos.xz * 0.024 + vec2(0.19, 0.43));
     vec2 rUv = vec2(vWorldPos.x * 0.132 + vWorldPos.z * 0.103, -vWorldPos.x * 0.103 + vWorldPos.z * 0.132);
     float wBlend = smoothstep(0.28, 0.72, mn.g);
     diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, rUv).rgb * diffuse, wBlend);
     vec3 stoneTint = mix(vec3(0.97, 0.97, 0.98), vec3(1.02, 1.01, 0.98), mn.r);
     diffuseColor.rgb *= stoneTint * (0.95 + 0.08 * mn.b);`,
    `vec4 mr = texture2D(uMacroNoise, vWorldPos.xz * 0.030 + vec2(0.51, 0.23));
     roughnessFactor = clamp(roughnessFactor * (0.91 + 0.13 * mr.a), 0.74, 0.93);`
  );

  const grass = withWorldMacro(
    std({ map: T.grass, normalMap: T.grassN, normalScale: new THREE.Vector2(0.26, 0.26), roughness: 0.94 }),
    'aazhi-grass-v7',
    `vec4 mn = texture2D(uMacroNoise, vWorldPos.xz * 0.026 + vec2(0.61, 0.17));
     vec2 rUv = vec2(vWorldPos.x * 0.148 + vWorldPos.z * 0.114, -vWorldPos.x * 0.114 + vWorldPos.z * 0.148);
     float wBlend = smoothstep(0.26, 0.74, mn.b);
     diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, rUv).rgb * diffuse, wBlend);
     vec3 lush = vec3(0.90, 0.99, 0.87), sunWarm = vec3(1.04, 1.02, 0.90);
     vec3 patchTint = mix(lush, sunWarm, smoothstep(0.28, 0.72, mn.r));
     diffuseColor.rgb *= patchTint * (0.94 + 0.10 * mn.g);`,
    `roughnessFactor = clamp(roughnessFactor, 0.86, 0.98);`
  );

  const curb = withWorldMacro(
    std({ map: T.curb || T.concrete, normalMap: T.curbN || T.concreteN, normalScale: new THREE.Vector2(0.25, 0.25), color: 0xd8d5ce, roughness: 0.84 }),
    'aazhi-curb-v7',
    `vec4 mn = texture2D(uMacroNoise, vWorldPos.xz * 0.034 + vec2(0.29, 0.57));
     diffuseColor.rgb *= 0.95 + 0.09 * mn.r;`,
    `roughnessFactor = clamp(roughnessFactor, 0.76, 0.94);`
  );

  const concrete = withWorldMacro(
    std({ map: T.concrete, normalMap: T.concreteN, normalScale: new THREE.Vector2(0.24, 0.24), roughness: 0.86 }),
    'aazhi-concrete-v4',
    `vec4 mn = texture2D(uMacroNoise, vWorldPos.xz * 0.028 + vWorldPos.y * 0.04);
     diffuseColor.rgb *= 0.95 + 0.08 * mn.g;`,
    `roughnessFactor = clamp(roughnessFactor, 0.76, 0.95);`
  );

  const concreteDark = withWorldMacro(
    std({ map: T.concrete, normalMap: T.concreteN, normalScale: new THREE.Vector2(0.25, 0.25), color: 0xb0aaa0, roughness: 0.88 }),
    'aazhi-concretedark-v4',
    `vec4 mn = texture2D(uMacroNoise, vWorldPos.xz * 0.030 + vec2(0.41, 0.83));
     diffuseColor.rgb *= 0.95 + 0.09 * mn.b;`,
    `roughnessFactor = clamp(roughnessFactor, 0.78, 0.96);`
  );

  const stone = withWorldMacro(
    std({ map: T.stone, normalMap: T.stoneN, normalScale: new THREE.Vector2(0.48, 0.48), roughness: 0.9 }),
    'aazhi-stone-v4',
    `vec4 mn = texture2D(uMacroNoise, vWorldPos.xz * 0.032 + vWorldPos.y * 0.06);
     float tideDark = smoothstep(-0.6, 1.1, vWorldPos.y);
     diffuseColor.rgb *= (0.76 + 0.24 * tideDark) * (0.93 + 0.12 * mn.r);`
  );

  const planks = withWorldMacro(
    std({ map: T.planks, roughness: 0.88 }),
    'aazhi-planks-v4',
    `vec4 mn = texture2D(uMacroNoise, vWorldPos.xz * 0.045);
     diffuseColor.rgb *= 0.94 + 0.10 * mn.g;`
  );

  const makeEdgeBlend = (colorHex, opacity, key) => {
    const m = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGutUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvGutUv = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGutUv;')
        .replace('#include <opaque_fragment>', 'diffuseColor.a *= pow(clamp(1.0 - vGutUv.y, 0.0, 1.0), 1.65);\n#include <opaque_fragment>');
    };
    m.customProgramCacheKey = () => key;
    return m;
  };
  const gutter = makeEdgeBlend(0x0c0b09, 0.25, 'aazhi-gutter-v2');
  const soilEdge = makeEdgeBlend(0x281c11, 0.30, 'aazhi-soiledge-v2');

  const M = {
    asphalt,
    paving,
    curb,
    gutter,
    soilEdge,
    concrete,
    concreteDark,
    grass,
    stone,
    sand: std({ map: T.sand, normalMap: T.sandN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.97 }),
    planks,
    lineWhite: std({ color: 0xebe8e0, normalMap: T.asphaltN, normalScale: new THREE.Vector2(0.32, 0.32), roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    lineYellow: std({ color: 0xe8b528, normalMap: T.asphaltN, normalScale: new THREE.Vector2(0.32, 0.32), roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    railing: std({ color: 0xd9d9d4, metalness: 0.5, roughness: 0.4 }),
    metalDark: std({ color: 0x4a5056, metalness: 0.22, roughness: 0.48 }),
    steel: std({ color: 0xb8bec4, metalness: 0.35, roughness: 0.35 }),
    drainGrate: std({ color: 0x626870, metalness: 0.18, roughness: 0.52, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    drainIronRim: std({ color: 0x7e858d, metalness: 0.20, roughness: 0.44, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }),
    drainSump: std({ color: 0x121518, metalness: 0.05, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    cementManhole: std({
      map: T.concrete,
      normalMap: T.concreteN,
      normalScale: new THREE.Vector2(0.85, 0.85),
      color: 0x9c9992,
      roughness: 0.95,
      metalness: 0.02,
    }),
    cementManholeDark: std({
      map: T.concrete,
      normalMap: T.concreteN,
      normalScale: new THREE.Vector2(0.85, 0.85),
      color: 0x7a7771,
      roughness: 0.94,
      metalness: 0.03,
    }),
    powerPole: std({ map: T.concrete, normalMap: T.concreteN, color: 0xc2bfb6, roughness: 0.78 }),
    insulator: std({ color: 0x5c3324, roughness: 0.22, metalness: 0.12 }),
    transformer: std({ color: 0x566068, metalness: 0.62, roughness: 0.42 }),
    powerWire: (() => {
      const m = std({ color: 0x24292e, metalness: 0.32, roughness: 0.58, transparent: true, opacity: 0.78, depthWrite: false });
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace(
          '#include <opaque_fragment>',
          `diffuseColor.a *= 1.0 - smoothstep(24.0, 56.0, length(vViewPosition));
           if (diffuseColor.a < 0.02) discard;
           #include <opaque_fragment>`
        );
      };
      m.customProgramCacheKey = () => 'aazhi-powerwire-v2';
      return m;
    })(),
    guyGuard: std({ color: 0xdca824, roughness: 0.52 }),
    aptWall: std({ map: T.aptFacade }),
    aptSlab: std({ color: 0xf1e8d8 }),
    aptAccent: std({ color: 0x9a6b47 }),
    grafWall: std({ map: T.grafFacade }),
    plainWall: std({ map: T.whiteWall }),
    mural: std({ map: T.mural, roughness: 0.9 }),
    glass: std({ map: T.glass, roughness: 0.15, metalness: 0.3 }),
    glassClear: new THREE.MeshStandardMaterial({ map: T.glassClear, transparent: true, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    shopfront: std({ map: T.shopfront, emissive: 0x3a2410, roughness: 0.3 }),
    signTea: std({ map: T.signTea, emissive: 0xffffff, emissiveMap: T.signTea, emissiveIntensity: 0.35 }),
    signMetro: std({ map: T.signMetro, emissive: 0xffffff, emissiveMap: T.signMetro, emissiveIntensity: 0.3 }),
    roofTiles: std({ map: T.roofTiles }),
    solar: std({ map: T.solar, roughness: 0.3, metalness: 0.4 }),
    wood: std({ color: 0x7a5534 }),
    woodDark: std({ color: 0x4e3523 }),
    blueRoof: std({ color: 0x2f5fa8, roughness: 0.6 }),
    whitePaint: std({ color: 0xf4f3ef, roughness: 0.6 }),
    teal: std({ color: 0x1aa6a6, roughness: 0.6 }),
    trackBed: std({ map: T.trackBed }),
    leafPlanter: std({ color: 0x4f7f2f, roughness: 1 }),
    soil: std({ color: 0x5a4330 }),
    lampGlow: std({ color: 0xfff2d0, emissive: 0xffd9a0, emissiveIntensity: 0.6 }),
    umbrellaBlue: std({ color: 0x2a6fd1, side: THREE.DoubleSide }),
    umbrellaWhite: std({ color: 0xf5f5f0, side: THREE.DoubleSide }),
    hullWhite: std({ color: 0xf2f2ee, roughness: 0.5 }),
    hullBlue: std({ color: 0x2257a8, roughness: 0.5 }),
    hullRed: std({ color: 0xc23b2a, roughness: 0.5 }),
    buoy: std({ color: 0xe0441e }),
    acUnit: std({ color: 0xd8d8d2 }),
    darkGlass: std({ color: 0x1d2a33, roughness: 0.2, metalness: 0.4 }),
    awning: std({ color: 0x2e6b5e }),
  };
  for (const k of [
    'asphalt', 'paving', 'curb', 'gutter', 'soilEdge', 'concreteDark', 'grass', 'stone',
    'lineWhite', 'lineYellow', 'drainGrate', 'drainIronRim', 'drainSump',
    'cementManhole', 'cementManholeDark', 'insulator', 'guyGuard', 'powerWire',
    'mural', 'glassClear', 'signTea', 'signMetro', 'trackBed', 'soil', 'lampGlow', 'darkGlass',
  ]) {
    if (M[k]) M[k].userData.noShadow = true;
  }
  M.tiled = tiled;
  return M;
}
