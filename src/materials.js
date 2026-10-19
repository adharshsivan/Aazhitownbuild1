import * as THREE from 'three';

function std(params) { return new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...params }); }

function tiled(tex, sx = 1, sy = sx) { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(sx, sy); return t; }

function withWorldMacro(mat, key, fragColorGlsl, fragRoughGlsl = '') {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorldPos;
        float wHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float wNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x),
                     mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float wFbm(vec2 p) {
          return 0.55 * wNoise(p) + 0.30 * wNoise(p * 2.13 + 7.1) + 0.15 * wNoise(p * 4.47 + 19.3);
        }`)
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
    std({ map: T.asphalt, normalMap: T.asphaltN, normalScale: new THREE.Vector2(0.46, 0.46), roughness: 0.89 }),
    'aazhi-asphalt-v4',
    `vec2 rUv = vec2(vWorldPos.x * 0.138 - vWorldPos.z * 0.107, vWorldPos.x * 0.107 + vWorldPos.z * 0.138);
     float wBlend = smoothstep(0.26, 0.74, wFbm(vWorldPos.xz * 0.13 + 2.1));
     diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, rUv).rgb * diffuse, wBlend);
     float n1 = wFbm(vWorldPos.xz * 0.055), n2 = wNoise(vWorldPos.xz * 0.19);
     diffuseColor.rgb *= 0.94 + 0.10 * n1 + 0.03 * (n2 - 0.5);`,
    `float r1 = wFbm(vWorldPos.xz * 0.075 + 11.0);
     roughnessFactor = clamp(roughnessFactor * (0.91 + 0.15 * r1), 0.74, 0.96);`
  );

  const paving = withWorldMacro(
    std({ map: T.paving, normalMap: T.pavingN, normalScale: new THREE.Vector2(0.38, 0.38), roughness: 0.83 }),
    'aazhi-paving-v6',
    `vec2 rUv = vec2(vWorldPos.x * 0.132 + vWorldPos.z * 0.103, -vWorldPos.x * 0.103 + vWorldPos.z * 0.132);
     float wBlend = smoothstep(0.26, 0.74, wFbm(vWorldPos.xz * 0.14 + 6.4));
     diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, rUv).rgb * diffuse, wBlend);
     float n1 = wFbm(vWorldPos.xz * 0.052 + 3.7), n2 = wNoise(vWorldPos.xz * 0.17);
     vec3 stoneTint = mix(vec3(0.96, 0.96, 0.97), vec3(1.03, 1.01, 0.98), n1);
     diffuseColor.rgb *= stoneTint * (0.95 + 0.09 * n1 + 0.03 * (n2 - 0.5));`,
    `float r1 = wFbm(vWorldPos.xz * 0.075 + 5.2);
     roughnessFactor = clamp(roughnessFactor * (0.90 + 0.14 * r1), 0.72, 0.92);`
  );

  const grass = withWorldMacro(
    std({ map: T.grass, normalMap: T.grassN, normalScale: new THREE.Vector2(0.42, 0.42), roughness: 0.93 }),
    'aazhi-grass-v5',
    `vec2 rUv = vec2(vWorldPos.x * 0.148 + vWorldPos.z * 0.114, -vWorldPos.x * 0.114 + vWorldPos.z * 0.148);
     float wBlend = smoothstep(0.25, 0.75, wFbm(vWorldPos.xz * 0.15 + 9.2));
     diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, rUv).rgb * diffuse, wBlend);
     float m1 = wFbm(vWorldPos.xz * 0.075), m2 = wFbm(vWorldPos.xz * 0.21 + 13.4), m3 = wNoise(vWorldPos.xz * 0.42 + 5.1);
     vec3 lush = vec3(0.88, 0.98, 0.85), sunWarm = vec3(1.05, 1.02, 0.89);
     vec3 patchTint = mix(lush, sunWarm, smoothstep(0.28, 0.72, m1));
     diffuseColor.rgb *= patchTint * (0.93 + 0.11 * m2 + 0.04 * (m3 - 0.5));`,
    `roughnessFactor = clamp(roughnessFactor * (0.94 + 0.10 * wNoise(vWorldPos.xz * 0.15)), 0.85, 0.98);`
  );

  const curb = withWorldMacro(
    std({ map: T.curb || T.concrete, normalMap: T.curbN || T.concreteN, normalScale: new THREE.Vector2(0.38, 0.38), color: 0xd8d5ce, roughness: 0.83 }),
    'aazhi-curb-v5',
    `vec2 rUv = vec2(vWorldPos.x * 0.24 - vWorldPos.z * 0.18, vWorldPos.x * 0.18 + vWorldPos.z * 0.24);
     float wBlend = smoothstep(0.26, 0.74, wFbm(vWorldPos.xz * 0.18 + vWorldPos.y * 0.35 + 4.1));
     diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, rUv).rgb * diffuse, wBlend);
     float c1 = wFbm(vWorldPos.xz * 0.085 + 2.3), c2 = wNoise(vWorldPos.xz * 0.22 + 9.1);
     diffuseColor.rgb *= 0.94 + 0.10 * c1 + 0.03 * (c2 - 0.5);`,
    `float r1 = wFbm(vWorldPos.xz * 0.10 + 4.4);
     roughnessFactor = clamp(roughnessFactor * (0.92 + 0.12 * r1), 0.74, 0.94);`
  );

  const concrete = withWorldMacro(
    std({ map: T.concrete, normalMap: T.concreteN, normalScale: new THREE.Vector2(0.36, 0.36), roughness: 0.85 }),
    'aazhi-concrete-v2',
    `vec2 rUv = vec2(vWorldPos.x * 0.21 + vWorldPos.z * 0.15, -vWorldPos.x * 0.15 + vWorldPos.z * 0.21) + vWorldPos.y * 0.17;
     float wBlend = smoothstep(0.26, 0.74, wFbm(vWorldPos.xz * 0.15 + vWorldPos.y * 0.22 + 1.9));
     diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, rUv).rgb * diffuse, wBlend);
     float c1 = wFbm(vWorldPos.xz * 0.07 + vWorldPos.y * 0.11 + 6.1);
     diffuseColor.rgb *= 0.95 + 0.09 * c1;`,
    `float r1 = wFbm(vWorldPos.xz * 0.09 + 3.1);
     roughnessFactor = clamp(roughnessFactor * (0.92 + 0.12 * r1), 0.75, 0.95);`
  );

  const concreteDark = withWorldMacro(
    std({ map: T.concrete, normalMap: T.concreteN, normalScale: new THREE.Vector2(0.38, 0.38), color: 0xb0aaa0, roughness: 0.88 }),
    'aazhi-concretedark-v2',
    `vec2 rUv = vec2(vWorldPos.x * 0.22 - vWorldPos.z * 0.16, vWorldPos.x * 0.16 + vWorldPos.z * 0.22) + vWorldPos.y * 0.19;
     float wBlend = smoothstep(0.26, 0.74, wFbm(vWorldPos.xz * 0.16 + 8.3));
     diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, rUv).rgb * diffuse, wBlend);
     float c1 = wFbm(vWorldPos.xz * 0.08 + 4.7);
     diffuseColor.rgb *= 0.94 + 0.10 * c1;`,
    `float r1 = wFbm(vWorldPos.xz * 0.10 + 7.2);
     roughnessFactor = clamp(roughnessFactor * (0.93 + 0.11 * r1), 0.78, 0.96);`
  );

  const stone = withWorldMacro(
    std({ map: T.stone, normalMap: T.stoneN, normalScale: new THREE.Vector2(0.75, 0.75), roughness: 0.9 }),
    'aazhi-stone-v2',
    `vec2 rUv = vec2(vWorldPos.x * 0.19 + vWorldPos.z * 0.14, vWorldPos.y * 0.24 - vWorldPos.x * 0.09);
     float wBlend = smoothstep(0.25, 0.75, wFbm(vWorldPos.xz * 0.16 + vWorldPos.y * 0.25 + 3.3));
     diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, rUv).rgb * diffuse, wBlend);
     float s1 = wFbm(vWorldPos.xz * 0.09 + vWorldPos.y * 0.18);
     // Subtle coastal water-line darkening near sea level
     float tideDark = smoothstep(-0.6, 1.1, vWorldPos.y);
     diffuseColor.rgb *= (0.76 + 0.24 * tideDark) * (0.92 + 0.14 * s1);`
  );

  const planks = withWorldMacro(
    std({ map: T.planks, roughness: 0.88 }),
    'aazhi-planks-v2',
    `float w1 = wFbm(vWorldPos.xz * 0.18 + 2.7), w2 = wNoise(vWorldPos.xz * 0.45 + 6.1);
     diffuseColor.rgb *= 0.93 + 0.11 * w1 + 0.04 * (w2 - 0.5);`
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
    powerWire: std({ color: 0x1f2326, metalness: 0.38, roughness: 0.52 }),
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
  M.tiled = tiled;
  return M;
}
