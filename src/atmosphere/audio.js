// Procedural island soundscape & weather audio (Web Audio API, zero external assets):
//  - Weather: multi-band rain hiss/patter, wind breeze, and distance-delayed thunder
//  - Nature: rhythmic coastal surf & beach swash, wind-driven tree/palm canopy rustle,
//            daytime Kerala bird calls (koel/bulbul/coastal gull), and gentle night crickets
//  - Player: surface-aware footsteps (sand crunch, wooden pier thud, grass brush,
//            pavement tap, and wet puddle splashes) synced to the walking animation.

export class WeatherAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.72;
    this.nextBird = 1.8;
    this.nextGull = 6.5;
    this._stepLeft = false;
    const start = () => { if (this.enabled) this.init(); };
    addEventListener('pointerdown', start, { once: false, passive: true });
    addEventListener('keydown', start, { once: false });
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(ctx.destination);

    // Shared 5-second noise buffers (white, pink, brown) generated once at startup
    const sr = ctx.sampleRate;
    const len = sr * 5;
    this.white = ctx.createBuffer(1, len, sr);
    this.pink = ctx.createBuffer(1, len, sr);
    this.brown = ctx.createBuffer(1, len, sr);
    const w = this.white.getChannelData(0);
    const p = this.pink.getChannelData(0);
    const b = this.brown.getChannelData(0);
    let lastBrown = 0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const wn = Math.random() * 2 - 1;
      w[i] = wn;
      // Paul Kellet pink noise filter
      b0 = 0.99886 * b0 + wn * 0.0555179;
      b1 = 0.99332 * b1 + wn * 0.0750759;
      b2 = 0.96900 * b2 + wn * 0.1538520;
      b3 = 0.86650 * b3 + wn * 0.3104856;
      b4 = 0.55000 * b4 + wn * 0.5329522;
      b5 = -0.7616 * b5 - wn * 0.0168980;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + wn * 0.5362) * 0.045;
      b6 = wn * 0.115926;
      // Brown noise
      lastBrown = (lastBrown + 0.02 * wn) / 1.02;
      b[i] = lastBrown * 3.2;
    }

    const loop = (buf, filters, dest) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      let node = src;
      for (const f of filters) { node.connect(f); node = f; }
      const g = ctx.createGain();
      g.gain.value = 0;
      node.connect(g);
      g.connect(dest || this.master);
      src.start(0, Math.random() * 4);
      return g;
    };
    const bp = (type, freq, q) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };

    // 1. Rain layers (high patter + warm body)
    this.rainHiss = loop(this.pink, [bp('highpass', 1000, 0.5), bp('lowpass', 6500, 0.4)]);
    this.rainBody = loop(this.brown, [bp('lowpass', 850, 0.6)]);

    // 2. Wind air breeze + tree/palm leaf canopy rustle
    this.windNoise = loop(this.brown, [this.windFilter = bp('bandpass', 340, 0.75)]);
    this.treeRustle = loop(this.pink, [
      bp('highpass', 1100, 0.5),
      this.treeFilter = bp('bandpass', 2350, 0.9),
    ]);

    // 3. Coastal ocean surf (deep swell roll + foamy beach swash)
    this.surfLow = loop(this.brown, [this.surfLowFilter = bp('lowpass', 240, 0.8)]);
    this.surfWash = loop(this.pink, [
      bp('highpass', 480, 0.5),
      this.surfWashFilter = bp('bandpass', 1350, 0.65),
    ]);

    // 4. Gentle twilight / night cricket chorus
    this.cricketGain = loop(this.white, [
      bp('bandpass', 4150, 14.0),
      bp('bandpass', 4150, 8.0),
    ]);
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.init();
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.18);
    }
  }

  /**
   * Per-frame procedural soundscape update.
   * @param {number} rain 0..1 rain intensity
   * @param {number} wind 0..4 wind speed
   * @param {object} env  { dt, sunEl, shoreProx, treeProx, camY, walking }
   */
  update(rain, wind, env = {}) {
    if (!this.ctx || !this.enabled) return;
    if (this.ctx.state === 'suspended') return;
    const t = this.ctx.currentTime;
    const dt = env.dt ?? 0.016;
    const sunEl = env.sunEl ?? 25;
    const shoreProx = env.shoreProx ?? 0.5;
    const treeProx = env.treeProx ?? 0.5;
    const camY = env.camY ?? 15;

    // Altitude attenuation so overview camera hears a softer, blended island murmur
    const altAtten = 0.35 + 0.65 * Math.exp(-Math.max(0, camY - 3) / 65);

    // ---- 1. Rain hiss & body
    this.rainHiss.gain.setTargetAtTime(Math.pow(rain, 0.88) * 0.24, t, 0.45);
    this.rainBody.gain.setTargetAtTime(Math.pow(rain, 1.55) * 0.42, t, 0.55);

    // ---- 2. Wind breeze & organic tree canopy rustling
    const gustWave = 0.72 + 0.28 * Math.sin(t * 0.41) * Math.sin(t * 0.17 + 1.2);
    const flutter = 0.80 + 0.20 * Math.sin(t * 1.85) * Math.cos(t * 1.13);
    const windGain = Math.min(0.36, Math.max(0.015, (wind - 0.15) * 0.095) * gustWave);
    this.windNoise.gain.setTargetAtTime(windGain, t, 0.6);
    this.windFilter.frequency.setTargetAtTime(240 + wind * 130 * gustWave, t, 0.6);

    // Leaves & palm fronds rustle softly even in a fair coastal breeze, stronger near trees
    const breezeK = Math.min(1.0, (0.18 + wind * 0.38) * gustWave * flutter);
    const rustleGain = breezeK * (0.025 + 0.085 * treeProx) * altAtten * (1 - rain * 0.35);
    this.treeRustle.gain.setTargetAtTime(rustleGain, t, 0.35);
    this.treeFilter.frequency.setTargetAtTime(1850 + breezeK * 1150, t, 0.35);

    // ---- 3. Rhythmic coastal waves & beach swash
    // Two slow swell cycles (~8.5s and ~6.2s) with beach backwash lagging the crest by ~1.3s
    const swell = Math.max(0, Math.sin(t * 0.74) * 0.65 + Math.sin(t * 1.01 + 1.7) * 0.35);
    const wash = Math.max(0, Math.sin(t * 0.74 - 1.25) * 0.65 + Math.sin(t * 1.01 + 0.45) * 0.35);
    const surfBase = (0.03 + 0.13 * shoreProx) * altAtten * (0.85 + 0.15 * Math.min(2, wind));
    this.surfLow.gain.setTargetAtTime(surfBase * (0.45 + 0.55 * swell), t, 0.25);
    this.surfLowFilter.frequency.setTargetAtTime(160 + 110 * swell, t, 0.25);
    this.surfWash.gain.setTargetAtTime(surfBase * 0.34 * (0.2 + 0.8 * wash * wash), t, 0.25);
    this.surfWashFilter.frequency.setTargetAtTime(1050 + 650 * wash, t, 0.25);

    // ---- 4. Twilight & night crickets (fade in around dusk when rain is light)
    const nightK = Math.max(0, Math.min(1, (3 - sunEl) / 9)) * Math.max(0, 1 - rain * 1.8);
    const pulse = 0.55 + 0.45 * Math.sin(t * 5.2) * Math.sin(t * 0.65);
    this.cricketGain.gain.setTargetAtTime(nightK * pulse * 0.018 * (0.4 + 0.6 * treeProx) * altAtten, t, 0.2);

    // ---- 5. Daytime tropical birds & coastal gulls
    const dayFair = Math.max(0, Math.min(1, (sunEl + 2) / 10)) * Math.max(0, 1 - rain * 2.2) * Math.max(0, 1 - Math.max(0, wind - 1.8) * 0.5);
    if (dayFair > 0.15 && dt > 0 && dt < 0.2) {
      // Dawn & late-afternoon golden hour have livelier bird song
      const golden = (sunEl > -1 && sunEl < 28) ? 1.35 : 0.85;
      this.nextBird -= dt * dayFair * golden * (0.65 + 0.7 * treeProx);
      if (this.nextBird <= 0) {
        this.spawnBirdCall(altAtten * dayFair * (0.55 + 0.45 * treeProx));
        this.nextBird = 2.6 + Math.random() * 5.2;
      }
      this.nextGull -= dt * dayFair * (0.5 + 0.8 * shoreProx);
      if (this.nextGull <= 0) {
        this.spawnGullCall(altAtten * dayFair * (0.4 + 0.6 * shoreProx));
        this.nextGull = 8.0 + Math.random() * 12.0;
      }
    }
  }

  /** Melodic procedural bird chirp / warble (bulbul, sunbird, koel-inspired). */
  spawnBirdCall(gainScale = 0.5) {
    if (!this.ctx || !this.enabled || gainScale < 0.05) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = (Math.random() - 0.5) * 1.4;
      pan.connect(this.master);
    }
    const dest = pan || this.master;

    const species = Math.floor(Math.random() * 3);
    const notes = species === 0
      ? 2 + Math.floor(Math.random() * 2) // sweet sunbird double/triple chirp
      : species === 1
        ? 3 + Math.floor(Math.random() * 3) // bulbul melodic warble
        : 2;                                // rising koel-like whistle

    let t = t0;
    const baseFreq = species === 0 ? 2600 + Math.random() * 700
      : species === 1 ? 1750 + Math.random() * 500
      : 1180 + Math.random() * 240;

    for (let i = 0; i < notes; i++) {
      const dur = species === 2 ? 0.22 + i * 0.06 : 0.065 + Math.random() * 0.055;
      const fStart = baseFreq * (1 + (i * 0.08) + (Math.random() - 0.45) * 0.14);
      const fEnd = species === 2
        ? fStart * 1.24
        : fStart * (0.88 + Math.random() * 0.32);

      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(fStart, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(400, fEnd), t + dur);

      const peak = (species === 2 ? 0.026 : 0.020) * gainScale * (0.8 + 0.2 * Math.random());
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + dur * 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc.connect(g);
      g.connect(dest);
      osc.start(t);
      osc.stop(t + dur + 0.01);
      t += dur + (species === 2 ? 0.14 : 0.035 + Math.random() * 0.045);
    }
  }

  /** Distant coastal gull / brahminy kite call over the water. */
  spawnGullCall(gainScale = 0.4) {
    if (!this.ctx || !this.enabled || gainScale < 0.05) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.03;
    const dur = 0.38 + Math.random() * 0.18;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const f0 = 1450 + Math.random() * 320;
    osc.frequency.setValueAtTime(f0 * 0.92, t0);
    osc.frequency.linearRampToValueAtTime(f0 * 1.08, t0 + dur * 0.22);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.72, t0 + dur);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f0;
    bp.Q.value = 3.5;

    const g = ctx.createGain();
    const peak = 0.014 * gainScale;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /**
   * Surface-aware procedural footstep sound synced to the player's walk/run stride.
   * @param {'sand'|'wood'|'grass'|'pavement'} surface
   * @param {boolean} running
   * @param {number} wetness 0..1 surface wetness / puddle level
   */
  footstep(surface = 'pavement', running = false, wetness = 0) {
    if (!this.ctx || !this.enabled || this.ctx.state === 'suspended') return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    this._stepLeft = !this._stepLeft;
    const pitchJit = (this._stepLeft ? 0.96 : 1.04) * (0.95 + Math.random() * 0.10);
    const vel = running ? 1.35 : 0.85;

    // 1. Primary surface contact transient
    const src = ctx.createBufferSource();
    src.buffer = surface === 'sand' || surface === 'grass' ? this.pink : this.brown;
    src.playbackRate.value = pitchJit;

    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let dur = 0.075;
    let peak = 0.055 * vel;

    if (surface === 'sand') {
      // Soft granular beach crunch
      filter.type = 'bandpass';
      filter.frequency.value = 1150 * pitchJit;
      filter.Q.value = 1.1;
      dur = 0.095;
      peak = 0.048 * vel;
    } else if (surface === 'wood') {
      // Hollow wooden pier plank thud
      filter.type = 'bandpass';
      filter.frequency.value = 220 * pitchJit;
      filter.Q.value = 2.4;
      dur = 0.085;
      peak = 0.085 * vel;
    } else if (surface === 'grass') {
      // Soft lawn / planter step
      filter.type = 'bandpass';
      filter.frequency.value = 1450 * pitchJit;
      filter.Q.value = 0.9;
      dur = 0.08;
      peak = 0.036 * vel;
    } else {
      // Crisp pavement / road shoe tap
      filter.type = 'bandpass';
      filter.frequency.value = 720 * pitchJit;
      filter.Q.value = 1.4;
      dur = 0.055;
      peak = 0.058 * vel;
    }

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0, Math.random() * 3.5);
    src.stop(t0 + dur + 0.015);

    // Subtle low-end heel thump on hard pavement or wooden pier
    if (surface === 'pavement' || surface === 'wood') {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      const fBase = surface === 'wood' ? 115 : 95;
      osc.frequency.setValueAtTime(fBase * pitchJit, t0);
      osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.045);
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.linearRampToValueAtTime(0.035 * vel, t0 + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      osc.connect(og);
      og.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.055);
    }

    // 2. Wet pavement / puddle splash layer when ground is wet
    if (wetness > 0.22 && surface !== 'wood') {
      const wSrc = ctx.createBufferSource();
      wSrc.buffer = this.white;
      const wBp = ctx.createBiquadFilter();
      wBp.type = 'bandpass';
      wBp.frequency.value = (2400 + Math.random() * 900) * pitchJit;
      wBp.Q.value = 1.6;
      const wg = ctx.createGain();
      const wDur = 0.065 + wetness * 0.045;
      const wPeak = 0.028 * wetness * vel;
      wg.gain.setValueAtTime(0.0001, t0 + 0.006);
      wg.gain.linearRampToValueAtTime(wPeak, t0 + 0.016);
      wg.gain.exponentialRampToValueAtTime(0.0001, t0 + wDur);
      wSrc.connect(wBp);
      wBp.connect(wg);
      wg.connect(this.master);
      wSrc.start(t0 + 0.006, Math.random() * 3.5);
      wSrc.stop(t0 + wDur + 0.02);
    }
  }

  /** Thunder for a strike `dist` metres away (delay = dist / 343 m/s). */
  thunder(dist) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + dist / 343;
    const near = Math.max(0, 1 - dist / 2500);
    const loud = Math.min(1, 900 / (dist + 300));
    const dur = 3 + (1 - near) * 4 + Math.random() * 2;
    const src = ctx.createBufferSource();
    src.buffer = this.brown; src.playbackRate.value = 0.6 + near * 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140 + near * 500; lp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    // rolling rumble: several swells of decreasing strength
    g.gain.setValueAtTime(0, t0);
    let t = t0;
    const swells = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < swells; i++) {
      const a = loud * (1 - i / (swells + 1)) * (0.6 + Math.random() * 0.4) * 0.9;
      t += 0.12 + Math.random() * (dur / swells);
      g.gain.linearRampToValueAtTime(a, t);
      g.gain.linearRampToValueAtTime(a * 0.35, t + 0.4 + Math.random() * 0.5);
    }
    g.gain.linearRampToValueAtTime(0, t0 + dur + 1.2);
    lp.frequency.setValueAtTime(140 + near * 500, t0);
    lp.frequency.linearRampToValueAtTime(90 + near * 120, t0 + dur);
    src.start(t0, Math.random() * 2); src.stop(t0 + dur + 1.5);
    // a sharp crack for close strikes
    if (near > 0.55) {
      const c = ctx.createBufferSource(); c.buffer = this.white;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0, t0); cg.gain.linearRampToValueAtTime(0.5 * near, t0 + 0.01); cg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      c.connect(hp); hp.connect(cg); cg.connect(this.master);
      c.start(t0); c.stop(t0 + 0.4);
    }
  }
}
