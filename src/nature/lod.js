import * as THREE from 'three';

// Screen-space LOD on top of THREE.BatchedMesh: every asset registers up to three
// LOD geometries in one pooled vertex buffer; each instance points at the LOD
// that matches its projected size and swaps with setGeometryIdAt (no re-upload).
// One BatchedMesh = one multi-draw call (+ one for shadows), with per-object
// frustum culling done by three.js.

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export class LODBatch {
  constructor(material, { castShadow = true, name = 'batch' } = {}) {
    this.material = material;
    this.castShadow = castShadow;
    this.name = name;
    this.assets = [];
    this.items = [];
  }

  /** levels: [lod0, lod1, lod2] geometries (lod1/lod2 optional); px: switch thresholds. */
  addAsset(levels, px = [150, 38]) {
    const g0 = levels[0];
    if (!g0.boundingSphere) g0.computeBoundingSphere();
    this.assets.push({ levels, px, radius: g0.boundingSphere.radius, center: g0.boundingSphere.center.clone(), ids: [] });
    return this.assets.length - 1;
  }

  /** minPx: hide when the instance projects smaller than this (ground cover, pebbles). */
  add(asset, matrix, color, minPx = 0) {
    matrix.decompose(_p, _q, _s);
    const a = this.assets[asset];
    const pos = a.center.clone().applyMatrix4(matrix);
    const radius = a.radius * Math.max(_s.x, _s.y, _s.z);
    this.items.push({ asset, matrix: matrix.clone(), color: color || new THREE.Color(1, 1, 1), pos, radius, minPx, level: -2, id: -1 });
    return this.items.length - 1;
  }

  finalize(scene) {
    let verts = 0, idx = 0;
    for (const a of this.assets) {
      for (const g of a.levels) {
        verts += g.attributes.position.count;
        idx += g.index.count;
      }
    }
    const mesh = new THREE.BatchedMesh(Math.max(1, this.items.length), Math.max(3, verts), Math.max(3, idx), this.material);
    mesh.name = this.name;
    mesh.sortObjects = false;          // alpha-tested / opaque: skip per-frame sorting
    mesh.perObjectFrustumCulled = true;
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = true;
    for (const a of this.assets) {
      a.ids = a.levels.map((g) => mesh.addGeometry(g));
    }
    for (const it of this.items) {
      const a = this.assets[it.asset];
      it.id = mesh.addInstance(a.ids[0]);
      it.level = 0;
      mesh.setMatrixAt(it.id, it.matrix);
      mesh.setColorAt(it.id, it.color);   // always set: keeps the batching-colour shader path stable
      mesh.setVisibleAt(it.id, true);
    }
    scene.add(mesh);
    this.mesh = mesh;
    this.stats = { instances: this.items.length, geometries: this.assets.length, vertices: verts, indices: idx };
    return mesh;
  }

  /** Fast screen-space LOD selection: swaps geometry IDs in-place with zero buffer uploads. */
  update(camPos, k, focusPos = null) {
    const mesh = this.mesh;
    if (!mesh) return 0;
    let swaps = 0;
    const items = this.items;
    const assets = this.assets;
    for (let i = 0, n = items.length; i < n; i++) {
      const it = items[i];
      const dx = it.pos.x - camPos.x, dy = it.pos.y - camPos.y, dz = it.pos.z - camPos.z;
      const distCam = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;

      // In third-person explore/walk mode, take player focus into account so foliage near the avatar stays LOD 0
      let dist = distCam;
      if (focusPos) {
        const fx = it.pos.x - focusPos.x, fy = it.pos.y - focusPos.y, fz = it.pos.z - focusPos.z;
        const distFocus = Math.sqrt(fx * fx + fy * fy + fz * fz) || 0.001;
        dist = Math.min(distCam, distFocus);
      }

      const px = (it.radius / dist) * k;

      // Smooth visibility culling with hysteresis to prevent edge flickering
      if (it.minPx > 0) {
        const hideThresh = it.minPx * 0.82;
        const showThresh = it.minPx * 1.18;
        if (it.level !== -1 && px < hideThresh) {
          mesh.setVisibleAt(it.id, false);
          it.level = -1;
          swaps++;
          continue;
        } else if (it.level === -1) {
          if (px < showThresh) continue;
          mesh.setVisibleAt(it.id, true);
        }
      }

      const a = assets[it.asset];
      const maxLvl = a.ids.length - 1;
      let lvl = 0;

      // Near-distance protection: lock foliage within near range (26m of avatar or camera) to full-fidelity LOD 0
      if (dist < 26) {
        lvl = 0;
      } else if (maxLvl >= 1) {
        const cur = it.level;
        const t0 = a.px[0];
        const t1 = maxLvl >= 2 ? a.px[1] : 0;
        // Directional hysteresis (deadband) prevents rapid switching/jittering at LOD boundaries
        if (cur === 0) {
          if (px < t0 * 0.85) {
            lvl = (maxLvl >= 2 && px < t1 * 0.85) ? 2 : 1;
          } else {
            lvl = 0;
          }
        } else if (cur === 1) {
          if (px > t0 * 1.15) {
            lvl = 0;
          } else if (maxLvl >= 2 && px < t1 * 0.85) {
            lvl = 2;
          } else {
            lvl = 1;
          }
        } else if (cur === 2) {
          if (px > t0 * 1.15) {
            lvl = 0;
          } else if (px > t1 * 1.15) {
            lvl = 1;
          } else {
            lvl = 2;
          }
        } else {
          // Uninitialized or freshly unhidden
          if (px < t0) {
            lvl = (maxLvl >= 2 && px < t1) ? 2 : 1;
          } else {
            lvl = 0;
          }
        }
      }

      if (lvl !== it.level) {
        if (it.level === -1) mesh.setVisibleAt(it.id, true);
        mesh.setGeometryIdAt(it.id, a.ids[lvl]);
        it.level = lvl;
        swaps++;
      }
    }
    return swaps;
  }

  /** Triangles drawn per LOD level right now (for diagnostics). */
  census() {
    const out = { hidden: 0, l0: 0, l1: 0, l2: 0, tris: 0 };
    for (const it of this.items) {
      if (it.level < 0) { out.hidden++; continue; }
      out['l' + it.level]++;
      out.tris += this.assets[it.asset].levels[it.level].index.count / 3;
    }
    return out;
  }
}

/** Drives all batches: re-evaluates LODs smoothly when the camera or focus moved, quality bias changed, or viewport changed. */
export class LODManager {
  constructor(batches, bias = 1) {
    this.batches = batches;
    this.bias = bias;
    this.last = new THREE.Vector3(1e9, 0, 0);
    this.lastFocus = new THREE.Vector3(1e9, 0, 0);
    this.lastK = 0;
  }
  setBias(bias) {
    if (Math.abs(this.bias - bias) < 1e-3) return;
    this.bias = bias;
    this.lastK = -1; // force immediate LOD re-evaluation next frame
  }
  update(camera, viewportH, force = false, focusPos = null) {
    const k = ((viewportH / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * this.bias;
    const camDistSq = camera.position.distanceToSquared(this.last);
    const focusDistSq = focusPos ? focusPos.distanceToSquared(this.lastFocus) : 0;
    // Update smoothly when camera or focus moves >= 20cm (0.04m²) rather than freezing for almost 1m then popping
    if (!force && camDistSq < 0.04 && focusDistSq < 0.04 && Math.abs(k - this.lastK) < 1) return;
    this.last.copy(camera.position);
    if (focusPos) this.lastFocus.copy(focusPos);
    this.lastK = k;
    for (const b of this.batches) b.update(camera.position, k, focusPos);
  }
}
