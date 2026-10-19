import * as THREE from 'three';
import { rng } from './geom.js';
import { makeSurfaces } from './surfaces.js';

// Procedural canvas textures. Small (256-1024px) and generated once at load so the
// scene needs no binary assets yet; swap for authored textures later.

let maxAniso = 4;
export const setMaxAnisotropy = (a) => { maxAniso = a; };

function tex(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = maxAniso;
  return t;
}

function noise(ctx, w, h, n, colors, sizeMin, sizeMax, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = sizeMin + r() * (sizeMax - sizeMin);
    ctx.globalAlpha = 0.25 + r() * 0.5;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

export function makeTextures() {
  const T = {};

  // Seamless weathered tropical teak deck planks (continuous horizontal timber grain, zero random vertical butt-joint bars that crop on box edges)
  T.planks = tex(512, 512, (c, w, h) => {
    const r = rng(11);
    const nPlanks = 8;
    const ph = h / nPlanks;
    for (let i = 0; i < nPlanks; i++) {
      const y = i * ph;
      const l = 0.86 + (r() - 0.5) * 0.14;
      const g = c.createLinearGradient(0, y, 0, y + ph);
      const R = Math.floor(136 * l), G = Math.floor(96 * l), B = Math.floor(62 * l);
      g.addColorStop(0, `rgb(${Math.max(0, R - 10)},${Math.max(0, G - 8)},${Math.max(0, B - 6)})`);
      g.addColorStop(0.15, `rgb(${R},${G},${B})`);
      g.addColorStop(0.85, `rgb(${R + 4},${G + 3},${B + 2})`);
      g.addColorStop(1, `rgb(${Math.max(0, R - 12)},${Math.max(0, G - 9)},${Math.max(0, B - 7)})`);
      c.fillStyle = g;
      c.fillRect(0, y, w, ph);
      // Soft recessed plank seam
      c.fillStyle = 'rgba(38,24,14,0.48)';
      c.fillRect(0, y, w, 2);
      // Subtle continuous wood-grain fibers wrapping seamlessly across x = 0..w
      for (let k = 0; k < 10; k++) {
        const gy = y + 4 + (k + 0.5) * ((ph - 6) / 10);
        c.fillStyle = k % 2 === 0 ? 'rgba(55,36,22,0.12)' : 'rgba(180,136,92,0.08)';
        c.fillRect(0, gy, w, 1.5);
      }
    }
  });

  // Seamless horizontal terracotta roof tile courses (wraps 100% cleanly around 4-sided pyramid hip roofs without diagonal brick cropping)
  T.roofTiles = tex(256, 256, (c, w, h) => {
    const r = rng(19);
    c.fillStyle = '#8c3b25';
    c.fillRect(0, 0, w, h);
    const rows = 8;
    const rh = h / rows;
    const cols = 8;
    const cw = w / cols;
    for (let row = 0; row < rows; row++) {
      const y = row * rh;
      // Continuous horizontal clay course gradient (eaves-to-ridge overlap shadow)
      const g = c.createLinearGradient(0, y, 0, y + rh);
      g.addColorStop(0, '#6e2b1b');
      g.addColorStop(0.18, '#9e432a');
      g.addColorStop(0.65, '#b85335');
      g.addColorStop(0.92, '#a3462b');
      g.addColorStop(1, '#5e2315');
      c.fillStyle = g;
      c.fillRect(0, y, w, rh);
      // Subtle barrel-tile flutes that wrap periodically around x = 0..w (never overflowing or cropping)
      const off = (row % 2) * (cw * 0.5);
      for (let col = -1; col <= cols; col++) {
        const x0 = col * cw + off;
        const fg = c.createLinearGradient(x0, y, x0 + cw, y);
        const shade = 0.96 + (r() - 0.5) * 0.06;
        fg.addColorStop(0, 'rgba(65,22,12,0.22)');
        fg.addColorStop(0.45, `rgba(215,108,72,${(0.14 * shade).toFixed(3)})`);
        fg.addColorStop(1, 'rgba(65,22,12,0.22)');
        c.fillStyle = fg;
        c.fillRect(x0, y + 1, cw, rh - 2);
      }
    }
  });

  // Seamless railway ballast & concrete sleeper bed
  T.trackBed = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#6e6a63';
    c.fillRect(0, 0, w, h);
    noise(c, w, h, 2400, ['#5a5650', '#807b73', '#646059'], 1, 2.5, 12);
    // Clean, evenly spaced concrete sleepers with subtle bevel
    for (let x = 0; x < w; x += 32) {
      c.fillStyle = 'rgba(35,32,28,0.32)';
      c.fillRect(x + 7, 0, 18, h);
      c.fillStyle = '#969086';
      c.fillRect(x + 9, 0, 14, h);
    }
  });

  T.solar = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#adb4bc';
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 128) {
      const g = c.createLinearGradient(x, y, x + 120, y + 60);
      g.addColorStop(0, '#1a335c');
      g.addColorStop(0.5, '#234478');
      g.addColorStop(1, '#1d3966');
      c.fillStyle = g;
      c.fillRect(x + 2, y + 2, 124, 60);
      c.strokeStyle = 'rgba(175,198,225,0.24)';
      c.lineWidth = 1;
      for (let k = 1; k < 6; k++) {
        c.beginPath();
        c.moveTo(x + 2 + k * 20.6, y + 2);
        c.lineTo(x + 2 + k * 20.6, y + 62);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(x + 2, y + 32);
      c.lineTo(x + 126, y + 32);
      c.stroke();
    }
  });

  // Architectural facade bay: one bay (u) x one floor (v) with realistic recessed casement window, lintel shadow, and sill
  const windowTile = (wall, glassTop, glassBot, frame, seed, opts = {}) => tex(256, 256, (c, w, h) => {
    c.fillStyle = wall;
    c.fillRect(0, 0, w, h);
    noise(c, w, h, 450, ['rgba(0,0,0,0.03)', 'rgba(255,255,255,0.035)'], 1, 2.5, seed);
    const x0 = opts.x0 ?? 44, x1 = opts.x1 ?? 212, y0 = opts.y0 ?? 52, y1 = opts.y1 ?? 198;
    if (x1 <= x0 || y1 <= y0) return;
    // Recessed masonry reveal + outer frame
    c.fillStyle = 'rgba(0,0,0,0.16)';
    c.fillRect(x0 - 8, y0 - 8, x1 - x0 + 16, y1 - y0 + 16);
    c.fillStyle = frame;
    c.fillRect(x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10);
    // Natural vertical sky/interior glazing gradient (no cartoony repeating diagonal white sticker)
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, glassTop);
    g.addColorStop(0.55, glassBot);
    g.addColorStop(1, '#1e2d36');
    c.fillStyle = g;
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Subtle top lintel overhang shadow on glass + horizontal transom + center mullion
    c.fillStyle = 'rgba(12,18,24,0.32)';
    c.fillRect(x0, y0, x1 - x0, 10);
    c.fillStyle = frame;
    c.fillRect((x0 + x1) / 2 - 2.5, y0, 5, y1 - y0);
    c.fillRect(x0, y0 + (y1 - y0) * 0.32, x1 - x0, 4);
    // Precast concrete window sill + soft drip shadow beneath
    c.fillStyle = 'rgba(245,242,235,0.55)';
    c.fillRect(x0 - 10, y1 + 3, x1 - x0 + 20, 5);
    c.fillStyle = 'rgba(0,0,0,0.20)';
    c.fillRect(x0 - 9, y1 + 8, x1 - x0 + 18, 4);
  });
  T.aptFacade = windowTile('#e8dbc3', '#52788c', '#283f4d', '#5c402c', 13);
  T.grafFacade = windowTile('#dad6ce', '#66808f', '#2d3b45', '#424548', 14, { x0: 58, x1: 198 });
  T.whiteWall = windowTile('#ede7da', '#ede7da', '#ede7da', '#ede7da', 15, { x0: 0, x1: 0, y0: 0, y1: 0 });

  T.glass = tex(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#6a9ea8');
    g.addColorStop(0.45, '#3e6f7d');
    g.addColorStop(1, '#224552');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // Subtle architectural spandrel band at top/bottom + clean anodized aluminum mullion frame
    c.fillStyle = 'rgba(20,34,42,0.32)';
    c.fillRect(0, 0, w, 26);
    c.strokeStyle = '#9aa6ad';
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, h * 0.5);
    c.lineTo(w, h * 0.5);
    c.stroke();
  });
  T.glassClear = tex(128, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(155,205,212,0.38)');
    g.addColorStop(1, 'rgba(110,165,176,0.32)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(198,210,216,0.85)';
    c.lineWidth = 4;
    c.strokeRect(2, 2, w - 4, h - 4);
  });

  T.shopfront = tex(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#d8ac68');
    g.addColorStop(0.65, '#9e632b');
    g.addColorStop(1, '#5c3616');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // Warm interior counter & shelving silhouette
    c.fillStyle = 'rgba(48,26,12,0.52)';
    c.fillRect(16, 156, w - 32, 88);
    // Soft warm pendant lights
    c.fillStyle = 'rgba(255,238,195,0.75)';
    for (const lx of [64, 192]) {
      c.beginPath();
      c.arc(lx, 42, 7, 0, Math.PI * 2);
      c.fill();
    }
    // Dark bronze storefront frame + center mullion
    c.strokeStyle = '#2b2622';
    c.lineWidth = 8;
    c.strokeRect(4, 4, w - 8, h - 8);
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(w / 2, 0);
    c.lineTo(w / 2, h);
    c.stroke();
  });

  T.mural = tex(1024, 1536, (c, w, h) => {
    c.fillStyle = '#ecebe6'; c.fillRect(0, 0, w, h);
    // background brush texture
    const r = rng(31);
    c.globalAlpha = 0.08;
    for (let i = 0; i < 260; i++) {
      c.strokeStyle = r() > 0.5 ? '#000' : '#666'; c.lineWidth = 2 + r() * 10;
      c.beginPath(); const x = r() * w, y = r() * h; c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 200, y + (r() - 0.5) * 200); c.stroke();
    }
    c.globalAlpha = 1;
    // stylised portrait (graphic black & white stencil)
    c.save(); c.translate(430, 820);
    c.fillStyle = '#111';
    c.beginPath(); c.ellipse(0, -80, 330, 420, 0, 0, 7); c.fill();           // hair mass
    c.beginPath(); c.ellipse(-20, -330, 170, 110, 0.1, 0, 7); c.fill();        // bun
    c.fillStyle = '#d9d6cf';
    c.beginPath(); c.ellipse(10, 20, 230, 300, 0.05, 0, 7); c.fill();          // face
    c.fillStyle = '#7d7a73';
    c.beginPath(); c.ellipse(120, 60, 110, 230, 0.05, 0, 7); c.fill();         // cheek shadow
    c.fillStyle = '#111';
    c.beginPath(); c.moveTo(-230, -120); c.quadraticCurveTo(0, -260, 240, -110); c.quadraticCurveTo(0, -190, -230, -120); c.fill(); // hairline
    for (const ex of [-90, 100]) {                                             // eyes & brows
      c.beginPath(); c.ellipse(ex, -30, 58, 22, 0, 0, 7); c.fill();
      c.fillStyle = '#ecebe6'; c.beginPath(); c.ellipse(ex - 8, -34, 12, 8, 0, 0, 7); c.fill(); c.fillStyle = '#111';
      c.fillRect(ex - 70, -92, 140, 16);
    }
    c.lineWidth = 12; c.strokeStyle = '#111';
    c.beginPath(); c.moveTo(10, -20); c.lineTo(-10, 110); c.lineTo(30, 120); c.stroke();     // nose
    c.beginPath(); c.moveTo(-70, 190); c.quadraticCurveTo(10, 230, 90, 190); c.quadraticCurveTo(10, 205, -70, 190); c.fill(); // lips
    c.beginPath(); c.arc(10, -150, 14, 0, 7); c.fill();                                     // pottu
    c.fillStyle = '#111'; c.beginPath(); c.moveTo(-200, 260); c.quadraticCurveTo(10, 420, 220, 260); c.lineTo(300, 700); c.lineTo(-300, 700); c.fill(); // neck & shoulders
    c.fillStyle = '#d9d6cf'; c.beginPath(); c.moveTo(-110, 330); c.lineTo(110, 330); c.lineTo(150, 700); c.lineTo(-150, 700); c.fill();
    c.strokeStyle = '#111'; c.lineWidth = 8;
    for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(0, 380 + i * 12, 120 + i * 6, 0.2, Math.PI - 0.2); c.stroke(); } // necklace
    c.restore();
    // lettering
    c.fillStyle = '#111';
    c.font = '900 170px Impact, "Arial Black", sans-serif';
    c.textAlign = 'right';
    c.fillText('KOCHI', w - 40, 200);
    c.fillText('VIBES', w - 40, 370);
    c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(14, 14, w - 28, h - 28);
  }, { repeat: false });

  T.signTea = tex(1024, 128, (c, w, h) => {
    c.fillStyle = '#26221f'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f3e7d0'; c.font = '700 78px "Trebuchet MS", Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('TEA  &  SNACKS', w / 2, h / 2 + 4);
  }, { repeat: false });

  T.signMetro = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#1aa6a6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = '900 200px Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('M', w / 2, h / 2 + 12);
  }, { repeat: false });

  T.busSide = tex(512, 128, (c, w, h) => {
    c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1f6fb5'; c.fillRect(0, 78, w, 50);
    c.fillStyle = '#1b2733';
    for (let x = 18; x < w - 20; x += 62) c.fillRect(x, 16, 54, 46);
    c.fillStyle = '#7fc1e8'; c.fillRect(0, 70, w, 6);
  }, { repeat: false });

  T.trainSide = tex(512, 128, (c, w, h) => {
    c.fillStyle = '#e8edf1'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1f4e9a'; c.fillRect(0, 84, w, 44);
    c.fillStyle = '#2bb3b1'; c.fillRect(0, 78, w, 6);
    c.fillStyle = '#18222e';
    for (let x = 14; x < w; x += 84) c.fillRect(x, 20, 60, 46);
    c.fillStyle = '#3a4a5a';
    for (const x of [96, 330]) c.fillRect(x, 16, 40, 100);
  }, { repeat: false });

  // high-quality height-field surfaces (albedo + normal) replace the simple ground textures
  Object.assign(T, makeSurfaces(maxAniso));
  return T;
}
