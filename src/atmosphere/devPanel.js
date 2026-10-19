import { WEATHER, RAIN_LEVELS, rainLevelName } from './weather.js';
import { QUALITY_MODES, QUALITY_PROFILES } from './index.js';

// Developer controls for the sky / weather / time / flood / traffic / optimization simulation
// inside the Dev Debug panel toggled by the top-center Dev Debug button.

export function initDevPanel(atmo) {
  const $ = (id) => document.getElementById(id);
  const btn = $('wind-btn'), win = $('wind-debug'), hdr = $('wind-debug-hdr'), closeBtn = $('wind-debug-close');
  const optBar = $('opt-bar'), optBtnLbl = $('opt-btn-lbl');
  const optCurLbl = $('opt-cur-lbl'), optDesc = $('opt-desc'), swOptBar = $('sw-opt-bar');
  if (!btn || !win) return;

  const buildOptButtons = (container) => {
    if (!container) return;
    container.innerHTML = '';
    for (const id of QUALITY_MODES) {
      const p = QUALITY_PROFILES[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.q = id;
      b.textContent = p.label;
      b.addEventListener('click', () => {
        atmo.setQuality(id);
        try {
          const u = new URL(location.href);
          u.searchParams.set('quality', id);
          history.replaceState(null, '', u.toString());
        } catch (_) {}
      });
      container.appendChild(b);
    }
  };
  buildOptButtons(optBar);
  buildOptButtons(swOptBar);

  const qBtn = $('sw-quality');
  const syncQualityUI = () => {
    const prof = QUALITY_PROFILES[atmo.quality] || QUALITY_PROFILES.high;
    if (optBtnLbl) optBtnLbl.textContent = prof.short;
    if (optCurLbl) optCurLbl.textContent = prof.label;
    if (optDesc) optDesc.textContent = prof.desc;
    if (qBtn) qBtn.textContent = `Quality: ${prof.label}`;
    for (const bar of [optBar, swOptBar]) {
      if (!bar) continue;
      bar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.q === prof.id));
    }
  };
  if (qBtn) {
    qBtn.addEventListener('click', () => {
      const idx = QUALITY_MODES.indexOf(atmo.quality);
      const next = QUALITY_MODES[(idx + 1) % QUALITY_MODES.length];
      atmo.setQuality(next);
    });
  }
  atmo.onQualityChange(syncQualityUI);
  syncQualityUI();

  // ---- Camera & View Mode buttons inside Dev Debug panel
  const btnWalk = $('dev-mode-walk');
  const btnOverview = $('dev-mode-overview');
  const btnJunction = $('dev-mode-junction');
  const syncCamButtons = (activeMode) => {
    if (btnWalk) btnWalk.classList.toggle('active', activeMode === 'explore');
    if (btnOverview) btnOverview.classList.toggle('active', activeMode === 'overview');
    if (btnJunction) btnJunction.classList.toggle('active', activeMode === 'junction');
  };
  if (btnWalk) {
    btnWalk.addEventListener('click', () => {
      window.__aazhi?.setMode?.('explore');
      syncCamButtons('explore');
    });
  }
  if (btnOverview) {
    btnOverview.addEventListener('click', () => {
      window.__aazhi?.setMode?.('overview');
      syncCamButtons('overview');
    });
  }
  if (btnJunction) {
    btnJunction.addEventListener('click', () => {
      window.__aazhi?.focusJunctionCam?.();
      syncCamButtons('junction');
    });
  }
  window.__syncDevCamButtons = syncCamButtons;

  // ---- open / close / drag (pointer events inside never reach the camera)
  const toggle = (force) => {
    const open = force !== undefined ? force : !win.classList.contains('open');
    if (open && window.innerWidth <= 640) {
      win.style.left = '';
      win.style.top = '';
      win.style.right = '';
    }
    win.classList.toggle('open', open);
    btn.classList.toggle('active', open);
  };
  btn.addEventListener('click', () => toggle());
  closeBtn.addEventListener('click', () => toggle(false));
  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  win.addEventListener('wheel', (e) => e.stopPropagation());
  win.addEventListener('keydown', (e) => e.stopPropagation());
  let drag = false, ox = 0, oy = 0;
  hdr.addEventListener('pointerdown', (e) => {
    if (e.target === closeBtn || window.innerWidth <= 640) return;
    drag = true;
    const r = win.getBoundingClientRect();
    win.style.left = `${r.left}px`; win.style.top = `${r.top}px`; win.style.right = 'auto';
    win.style.transform = 'none';
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    hdr.setPointerCapture(e.pointerId); e.preventDefault();
  });
  hdr.addEventListener('pointermove', (e) => {
    if (!drag) return;
    win.style.left = `${Math.min(innerWidth - win.offsetWidth - 8, Math.max(8, e.clientX - ox))}px`;
    win.style.top = `${Math.min(innerHeight - 60, Math.max(8, e.clientY - oy))}px`;
  });
  hdr.addEventListener('pointerup', () => { drag = false; });
  hdr.addEventListener('pointercancel', () => { drag = false; });

  // ---- time & date
  const time = $('sw-time'), timeVal = $('sw-time-val'), date = $('sw-date'), speed = $('sw-speed');
  let scrubbing = false;
  time.addEventListener('pointerdown', () => { scrubbing = true; });
  addEventListener('pointerup', () => { scrubbing = false; });
  time.addEventListener('input', () => atmo.setHours(parseFloat(time.value)));
  date.addEventListener('change', () => {
    const [y, m, d] = date.value.split('-').map(Number);
    if (y && m && d) atmo.setDate(y, m, d);
  });
  speed.addEventListener('change', () => { atmo.timeScale = parseFloat(speed.value); });
  win.querySelectorAll('[data-hour]').forEach((b) => b.addEventListener('click', () => atmo.setHours(parseFloat(b.dataset.hour))));
  $('sw-now').addEventListener('click', () => {
    const n = new Date();
    atmo.setDate(n.getFullYear(), n.getMonth() + 1, n.getDate());
    const utcH = n.getUTCHours() + n.getUTCMinutes() / 60;
    atmo.setHours((utcH + 5.5) % 24);
    atmo.timeScale = 1; speed.value = '1';
  });

  // ---- moon
  const moonAuto = $('sw-moon-auto'), moon = $('sw-moon'), moonVal = $('sw-moon-val');
  moon.addEventListener('input', () => { moonAuto.checked = false; atmo.setMoonAge(parseFloat(moon.value)); });
  moonAuto.addEventListener('change', () => { if (moonAuto.checked) atmo.setMoonAge(null); else atmo.setMoonAge(parseFloat(moon.value)); });

  // ---- weather
  const auto = $('sw-auto'), wx = $('sw-wx'), trans = $('sw-trans'), transVal = $('sw-trans-val');
  wx.innerHTML = '';
  const order = ['clear', 'scattered', 'overcast', 'drizzle', 'lightRain', 'steadyRain', 'monsoon', 'thunderstorm', 'fog', 'mist', 'clearing'];
  const short = { drizzle: 'Drizzle', lightRain: 'Light rain', steadyRain: 'Steady rain', monsoon: 'Monsoon', thunderstorm: 'Storm', mist: 'Mist' };
  const ovEls = {};
  for (const k of order) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.wx = k; b.textContent = short[k] || WEATHER[k].label;
    b.addEventListener('click', () => {
      auto.checked = false; atmo.weather.auto = false;
      atmo.weather.overrides.rain = null;
      if (ovEls.rain) { ovEls.rain.val.classList.add('auto'); ovEls.rain.val.textContent = 'auto'; }
      atmo.weather.set(k, parseFloat(trans.value));
    });
    wx.appendChild(b);
  }
  auto.addEventListener('change', () => { atmo.weather.auto = auto.checked; });
  trans.addEventListener('input', () => { transVal.textContent = `${trans.value} s`; });

  // ---- rain levels & flood simulation controls
  const ex = $('sw-extreme');
  ex.innerHTML = `
    <div class="wd-sec">Rain level <span id="sw-rain-lvl-lbl" style="color:var(--accent);text-transform:none;letter-spacing:0;">Dry</span></div>
    <div class="wd-presets" id="sw-rain-lvls" style="grid-template-columns: repeat(6, 1fr);"></div>
    <div class="wd-sec" style="margin-top:4px;">Flood & Sea Surge <span id="sw-fl-status" style="color:#8fa4af;text-transform:none;letter-spacing:0;font-size:10px;">Off</span></div>
    <div class="wd-presets" style="grid-template-columns: 1fr 1.3fr 0.8fr; margin-bottom: 4px;">
      <button type="button" class="wd-btn" data-fl="start">Surge (+1.92m)</button>
      <button type="button" class="wd-btn" data-fl="extreme" style="background:rgba(255,80,40,0.22);border-color:#ff5533;color:#ffaa88;font-weight:700;">🌊 Extreme (+2.48m)</button>
      <button type="button" class="wd-btn" data-fl="pause">Pause</button>
    </div>
    <div class="wd-presets">
      <button type="button" class="wd-btn" data-fl="recede">Recede</button>
      <button type="button" class="wd-btn" data-fl="reset">Reset</button>
    </div>
    <div id="sw-fl-sl"></div>
    <div class="wd-sec" style="margin-top:8px;">Traffic Lights & Junction</div>
    <div id="sw-tl-status" style="font-size:10.5px;color:#7bf2ef;margin-bottom:5px;padding:4px 8px;background:rgba(255,255,255,0.06);border-radius:5px;display:flex;align-items:center;gap:6px;">
      <span id="th-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00ff66;box-shadow:0 0 6px #00ff66;"></span>
      <span id="sw-tl-txt">Loading...</span>
    </div>
    <div class="wd-presets">
      <button type="button" class="wd-btn" id="tl-btn-cam">Junction Cam (T)</button>
      <button type="button" class="wd-btn" id="tl-btn-walk">Push Walk (E)</button>
    </div>
    <div class="wd-presets" style="margin-top:4px;">
      <button type="button" class="wd-btn" id="tl-btn-ring">Ring Green</button>
      <button type="button" class="wd-btn" id="tl-btn-ave">Avenue Green</button>
    </div>`;

  const rainLvlsEl = $('sw-rain-lvls');
  const rainLvlLbl = $('sw-rain-lvl-lbl');

  for (const rl of RAIN_LEVELS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.rl = rl.id;
    b.title = rl.desc;
    b.textContent = rl.label;
    b.addEventListener('click', () => {
      auto.checked = false;
      atmo.weather.auto = false;
      if (rl.rain <= 0) {
        atmo.weather.overrides.rain = 0;
      } else {
        atmo.weather.overrides.rain = rl.rain;
        if (rl.wind !== null && atmo.weather.overrides.wind === null) {
          atmo.weather.out.wind = rl.wind;
        }
      }
      if (ovEls.rain) {
        ovEls.rain.input.value = rl.rain;
        ovEls.rain.val.classList.remove('auto');
        ovEls.rain.val.textContent = `${rl.label} (${Math.round(rl.rain * 100)}%)`;
      }
    });
    rainLvlsEl.appendChild(b);
  }

  const fl = atmo.flood;
  const flStatus = $('sw-fl-status');
  const flSlEls = {};

  const syncFlSliders = () => {
    for (const key of Object.keys(flSlEls)) {
      const el = flSlEls[key];
      const v = el.item.get();
      el.input.value = v;
      el.val.textContent = el.item.fmt(v);
    }
  };

  const updateFlStatus = () => {
    if (!flStatus) return;
    const seaTarget = +(1.6 + fl.settings.depth).toFixed(2);
    if (fl.running && fl.isExtreme) {
      flStatus.textContent = `🌊 EXTREME (Sea +${seaTarget}m · Half Person ${Math.round(fl.settings.depth * 100)}cm)`;
      flStatus.style.color = '#ff6644';
    } else if (fl.running) {
      flStatus.textContent = `Active (Sea +${seaTarget}m · Road ${Math.round(fl.settings.depth * 100)}cm)`;
      flStatus.style.color = '#7bf2ef';
    } else {
      flStatus.textContent = 'Off';
      flStatus.style.color = '#8fa4af';
    }
  };

  ex.querySelectorAll('[data-fl]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.fl;
    if (a === 'extreme') {
      fl.startExtreme();
      atmo.weather.set('monsoon', 2.0);
    } else if (a === 'start') {
      fl.start();
    } else if (a === 'pause') {
      fl.pause();
    } else if (a === 'recede') {
      fl.recede();
    } else {
      fl.reset();
    }
    syncFlSliders();
    updateFlStatus();
  }));

  const flSl = $('sw-fl-sl');
  for (const item of [
    {
      k: 'depth', label: 'Flood depth (road)', min: 0.22, max: 1.10, step: 0.01,
      fmt: (v) => (v >= 0.86 && v <= 0.90 ? `${Math.round(v * 100)} cm (Half Person Height)` : `${Math.round(v * 100)} cm`),
      get: () => fl.settings.depth,
      set: (v) => {
        fl.settings.depth = v;
        fl.targetSeaLevel = Math.max(1.82, 1.60 + v);
        fl.isExtreme = v >= 0.80;
        if (!fl.running) fl.start();
        syncFlSliders();
      },
    },
    {
      k: 'seaLevel', label: 'Sea level surge', min: 1.82, max: 2.70, step: 0.02,
      fmt: (v) => `+${v.toFixed(2)} m (Road ${Math.round((v - 1.60) * 100)} cm)`,
      get: () => +(1.60 + fl.settings.depth).toFixed(2),
      set: (v) => {
        fl.settings.depth = Math.max(0.22, +(v - 1.60).toFixed(2));
        fl.targetSeaLevel = v;
        fl.isExtreme = fl.settings.depth >= 0.80;
        if (!fl.running) fl.start();
        syncFlSliders();
      },
    },
    {
      k: 'rain', label: 'Rainfall intensity', min: 0, max: 1, step: 0.01,
      fmt: (v) => `${Math.round(v * 100)}%`,
      get: () => fl.settings.rain,
      set: (v) => { fl.settings.rain = v; },
    },
    {
      k: 'flow', label: 'Flow strength', min: 0.2, max: 2.5, step: 0.05,
      fmt: (v) => `${v.toFixed(2)}×`,
      get: () => fl.settings.flow,
      set: (v) => { fl.settings.flow = v; },
    },
  ]) {
    const row = document.createElement('div');
    row.className = 'wd-row';
    const initVal = item.get();
    row.innerHTML = `<div class="wd-lbl"><span>${item.label}</span><span>${item.fmt(initVal)}</span></div><input type="range" min="${item.min}" max="${item.max}" step="${item.step}" value="${initVal}" />`;
    const input = row.querySelector('input'), val = row.querySelectorAll('span')[1];
    flSlEls[item.k] = { item, input, val };
    input.addEventListener('input', () => {
      const num = parseFloat(input.value);
      item.set(num);
      val.textContent = item.fmt(num);
      updateFlStatus();
    });
    flSl.appendChild(row);
  }

  // Traffic Light Dev Controls
  const tlSec = document.createElement('div');
  tlSec.innerHTML = `
    <div class="wd-sec" style="margin-top:6px;">Traffic Signals (Multisided + Timers)</div>
    <div class="wd-two">
      <button type="button" class="wd-btn" id="sw-tl-cycle">Cycle Phase</button>
      <button type="button" class="wd-btn" id="sw-tl-walk">Request Walk</button>
    </div>`;
  flSl.appendChild(tlSec);

  const btnTlCam = $('tl-btn-cam');
  if (btnTlCam) {
    btnTlCam.addEventListener('click', () => {
      window.__aazhi?.focusJunctionCam?.();
      syncCamButtons('junction');
    });
  }
  const btnTlPushWalk = $('tl-btn-walk');
  if (btnTlPushWalk) {
    btnTlPushWalk.addEventListener('click', () => {
      window.__aazhi?.trafficLights?.requestPedestrianWalk?.();
    });
  }
  const btnTlRing = $('tl-btn-ring');
  if (btnTlRing) {
    btnTlRing.addEventListener('click', () => {
      const tl = window.__aazhi?.trafficLights;
      if (tl) tl.cycleTime = 0;
    });
  }
  const btnTlAve = $('tl-btn-ave');
  if (btnTlAve) {
    btnTlAve.addEventListener('click', () => {
      const tl = window.__aazhi?.trafficLights;
      if (tl) tl.cycleTime = 17.0;
    });
  }
  const btnTlCycle = $('sw-tl-cycle');
  if (btnTlCycle) {
    btnTlCycle.addEventListener('click', () => {
      const tl = window.__aazhi?.trafficLights;
      if (tl) tl.cycleTime += 15.0;
    });
  }
  const btnTlWalk = $('sw-tl-walk');
  if (btnTlWalk) {
    btnTlWalk.addEventListener('click', () => {
      const tl = window.__aazhi?.trafficLights;
      if (tl) tl.requestPedestrianWalk();
    });
  }

  // ---- overrides
  const ov = $('sw-ov');
  ov.innerHTML = '';
  const defs = [
    ['cover', 'Cloud cover', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`],
    ['rain', 'Rain intensity', 0, 1, 0.01, (v) => `${rainLevelName(v)} (${Math.round(v * 100)}%)`],
    ['fog', 'Fog', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`],
    ['wind', 'Wind', 0, 4, 0.05, (v) => `${v.toFixed(2)}×`],
    ['storm', 'Storm intensity', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`],
  ];
  for (const [k, label, min, max, step, fmt] of defs) {
    const row = document.createElement('div');
    row.className = 'wd-row';
    row.innerHTML = `<div class="wd-lbl"><span>${label}</span><span class="auto">auto</span></div><input type="range" min="${min}" max="${max}" step="${step}" />`;
    const input = row.querySelector('input'), val = row.querySelectorAll('span')[1];
    input.addEventListener('input', () => {
      atmo.weather.overrides[k] = parseFloat(input.value);
      val.classList.remove('auto'); val.textContent = fmt(parseFloat(input.value));
    });
    ov.appendChild(row);
    ovEls[k] = { input, val, fmt };
  }
  // wind direction
  {
    const row = document.createElement('div');
    row.className = 'wd-row';
    row.innerHTML = '<div class="wd-lbl"><span>Wind direction</span><span class="auto">auto</span></div><input type="range" min="0" max="360" step="1" />';
    const input = row.querySelector('input'), val = row.querySelectorAll('span')[1];
    input.addEventListener('input', () => {
      atmo.windDirOverride = (parseFloat(input.value) * Math.PI) / 180;
      val.classList.remove('auto'); val.textContent = `${input.value}°`;
    });
    ov.appendChild(row);
    ovEls.dir = { input, val };
  }
  $('sw-reset').addEventListener('click', () => {
    for (const k of Object.keys(atmo.weather.overrides)) atmo.weather.overrides[k] = null;
    atmo.windDirOverride = null;
    for (const e of Object.values(ovEls)) { e.val.classList.add('auto'); e.val.textContent = 'auto'; }
  });

  // ---- actions
  $('sw-strike').addEventListener('click', () => atmo.strike(true));
  const sound = $('sw-sound');
  sound.addEventListener('click', () => {
    atmo.audio.setEnabled(!atmo.audio.enabled);
    sound.textContent = `Sound: ${atmo.audio.enabled ? 'on' : 'off'}`;
  });

  // ---- live readout (4 Hz) + keep untouched controls in sync with the simulation
  const read = $('sw-read');
  const tick = () => {
    const I = atmo.info, P = I.params || {};
    if (!scrubbing) time.value = I.hours.toFixed(2);
    timeVal.textContent = I.time;
    if (document.activeElement !== date) date.value = I.date;
    moonVal.textContent = `${I.moonAge.toFixed(1)} d`;
    if (moonAuto.checked) moon.value = I.moonAge.toFixed(1);
    wx.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.wx === I.state));
    if (auto.checked !== atmo.weather.auto) auto.checked = atmo.weather.auto;
    for (const [k, e] of Object.entries(ovEls)) {
      if (k === 'dir' || atmo.weather.overrides[k] !== null) continue;
      e.input.value = P[k] ?? 0;
    }

    const rNow = P.rain || 0;
    const rName = rainLevelName(rNow);
    if (rainLvlLbl) rainLvlLbl.textContent = rNow > 0.02 ? `${rName} · ${Math.round(rNow * 100)}%` : 'Dry';
    if (rainLvlsEl) {
      let bestId = 'off', bestD = 9;
      for (const rl of RAIN_LEVELS) {
        const d = Math.abs(rl.rain - rNow);
        if (d < bestD) { bestD = d; bestId = rl.id; }
      }
      rainLvlsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.rl === bestId));
    }

    read.innerHTML = `<b>${I.time}</b> · ${I.date} · Kochi<br>`
      + `Sun ${I.sunEl.toFixed(1)}° · Moon ${I.moonEl.toFixed(1)}° · ${I.phase} ${Math.round(I.illum * 100)}%<br>`
      + `<b>${I.weather}</b> · cloud ${Math.round((P.cover || 0) * 100)}% · ${rName} ${Math.round(rNow * 100)}%<br>`
      + `wind ${(P.wind || 0).toFixed(2)} · fog ${Math.round((P.fog || 0) * 100)}% · wet ${Math.round(I.wet * 100)}% · puddles ${Math.round(I.puddle * 100)}%`
      + (I.flood ? `<br><b>Flood</b> ${I.flood}` : '');
    const pauseBtn = ex.querySelector('[data-fl="pause"]');
    if (pauseBtn) pauseBtn.textContent = fl.paused ? 'Resume' : 'Pause';
  };
  tick();
  setInterval(tick, 250);
}
