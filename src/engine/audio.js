/**
 * The Lantern Picnic: procedural audio engine.
 *
 * Every sound is synthesized at runtime with the Web Audio API. There are no samples, no network
 * requests and no dependencies. The module imports safely anywhere, Node included; without Web Audio
 * every public method is a quiet no-op.
 *
 * Signal flow
 *   music layers ─► tone LP ─► duck ─► music vol ─┐
 *   sfx + stinger voices ───────────► sfx vol ────┤
 *   ambience beds + calls ──────────► amb vol ────┼─► mix ─► glue comp ─► limiter ─► soft clip ─► master ─► out
 *   babble voice ───────────────────► voice vol ──┤
 *   every bus also feeds one shared convolver ────┘
 */

const LOOKAHEAD = 0.2; // seconds of audio scheduled ahead of the clock
const TICK_MS = 25;
const TIMES = ['afternoon', 'golden', 'sunset', 'dusk', 'night'];
const PENTA = [0, 2, 4, 7, 9];
const MODES = { ionian: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11] };
// Chord substitutions (by scale degree) that keep a looping progression from repeating exactly.
const SUBS = { ionian: { 0: 5, 5: 0, 3: 1, 1: 3, 4: 2 }, lydian: { 0: 2, 1: 6, 6: 1, 5: 0, 4: 2 } };
const LAYERS = ['pad', 'lead', 'arp', 'bass', 'perc', 'counter'];

const audioCtor = () => globalThis.AudioContext || globalThis.webkitAudioContext || null;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[(Math.random() * list.length) | 0];
const mod = (n, m) => ((n % m) + m) % m;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const expWait = (rate) => -Math.log(1 - Math.random()) / rate;
const tonicAbove = (pc, lo) => lo + mod(pc - lo, 12);
const pentaNote = (tonic, i) => tonic + 12 * Math.floor(i / 5) + PENTA[mod(i, 5)];

function withTimeout(promise, ms) {
  let id;
  return Promise.race([promise, new Promise((r) => (id = setTimeout(r, ms)))]).finally(() => clearTimeout(id));
}

// ───────────────────────────── AudioParam envelopes ─────────────────────────────
// Only explicit ramps are used for note envelopes: they behave identically across browsers and every
// envelope starts and ends at true zero, so there are no clicks.

/** Freeze a param at its current value so a new ramp starts from wherever it is now. */
function hold(param, t) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

function glideTo(param, value, t, seconds) {
  hold(param, t);
  param.linearRampToValueAtTime(value, t + Math.max(0.01, seconds));
}

/** Percussive envelope: quick linear attack, exponential decay to -60 dB. Returns the stop time. */
function perc(param, t, peak, attack, decay) {
  const p = Math.max(peak, 1e-4), a = t + attack, d = a + decay;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(p, a);
  param.exponentialRampToValueAtTime(p * 1e-3, d);
  param.linearRampToValueAtTime(0, d + 0.02);
  return d + 0.03;
}

/** Sustained envelope: attack, hold, exponential release. Returns the stop time. */
function swell(param, t, peak, attack, holdFor, release) {
  const p = Math.max(peak, 1e-4), a = t + attack, h = a + Math.max(0, holdFor), r = h + release;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(p, a);
  if (h > a) param.setValueAtTime(p, h);
  param.exponentialRampToValueAtTime(p * 1e-3, r);
  param.linearRampToValueAtTime(0, r + 0.02);
  return r + 0.03;
}

// ───────────────────────────── procedural buffers ─────────────────────────────

/** Loopable noise. Pink noise uses Paul Kellet's filter; the loop seam is crossfaded. */
function noiseBuffer(ctx, seconds, pink) {
  const len = Math.floor(ctx.sampleRate * seconds), fade = 2048;
  const raw = new Float32Array(len + fade);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) { raw[i] = w * 0.5; continue; }
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = i < fade ? raw[i] * (i / fade) + raw[len + i] * (1 - i / fade) : raw[i];
  return buf;
}

/** A small, warm hall: decaying stereo noise whose one-pole low-pass closes over time. */
function impulseResponse(ctx, seconds) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds), buf = ctx.createBuffer(2, len, rate);
  const taps = [0.013, 0.019, 0.027, 0.036, 0.047, 0.061];
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate, x = t / seconds;
      lp += (0.62 - 0.5 * x) * (Math.random() * 2 - 1 - lp); // damping: the tail gets darker as it fades
      d[i] = lp * Math.exp(-6.4 * x) * Math.min(1, Math.max(0, (t - 0.008) / 0.03));
    }
    taps.forEach((tap, k) => {
      const i = Math.floor((tap + (c ? 0.0031 : 0)) * rate);
      if (i < len) d[i] += (k % 2 === c ? 0.5 : 0.3) * Math.exp(-k * 0.35);
    });
  }
  return buf;
}

/** Sparse, decaying stereo crackle for firework tails (rendered once, replayed at varied rates). */
function crackleBuffer(ctx, seconds) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds), buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let t = 0.02; t < seconds - 0.05; t += expWait(70 * Math.exp(-t * 2.2) + 4)) {
      const start = Math.floor(t * rate), n = 20 + ((Math.random() * 70) | 0), a = rand(0.25, 1) * Math.exp(-t * 1.6);
      for (let k = 0; k < n && start + k < len; k++) d[start + k] += (Math.random() * 2 - 1) * a * (1 - k / n) ** 2;
    }
  }
  return buf;
}

/** PeriodicWave with a 1/n^slope harmonic roll-off: warm, band-limited, never buzzy. */
function makeWave(ctx, harmonics, slope, oddOnly = false) {
  const real = new Float32Array(harmonics + 1), imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) imag[n] = oddOnly && n % 2 === 0 ? 0 : 1 / n ** slope;
  return ctx.createPeriodicWave(real, imag);
}

function voicePool(cap) {
  const pool = [];
  pool.cap = cap;
  return pool;
}

// ───────────────────────────── Voice ─────────────────────────────

/** A short-lived bundle of nodes (one note or one sound effect) with a single output gain. */
class Voice {
  constructor(engine, pool, dest, { pan = 0, wet = 0, wetDest = null, level = 1 } = {}) {
    while (pool.length >= pool.cap) pool.shift().kill(); // drop the oldest voice beyond the cap
    this.engine = engine;
    this.ctx = engine.ctx;
    this.pool = pool;
    this.nodes = [];
    this.srcs = [];
    this.ended = 0;
    this.dead = false;
    this.out = this.gain(level);
    let tail = this.out;
    if (pan && engine.hasPanner) {
      this.panner = this.ctx.createStereoPanner();
      this.panner.pan.value = clamp(pan, -1, 1);
      this.nodes.push(this.panner);
      tail.connect(this.panner);
      tail = this.panner;
    }
    tail.connect(dest);
    if (wet > 0 && wetDest) {
      const send = this.gain(wet);
      tail.connect(send);
      send.connect(wetDest);
    }
    pool.push(this);
  }

  gain(value = 0) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    this.nodes.push(g);
    return g;
  }

  filter(type, freq, q = 0.707) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    this.nodes.push(f);
    return f;
  }

  /** An input that lands in this voice's output panned to `p` (for per-note stereo spread). */
  pan(p) {
    if (!p || !this.engine.hasPanner) return this.out;
    const n = this.ctx.createStereoPanner();
    n.pan.value = clamp(p, -1, 1);
    n.connect(this.out);
    this.nodes.push(n);
    return n;
  }

  osc(wave, freq, t0, t1, dest) {
    const o = this.ctx.createOscillator();
    if (typeof wave === 'string') o.type = wave;
    else o.setPeriodicWave(wave);
    o.frequency.value = freq;
    if (dest) o.connect(dest);
    return this.track(o, t0, t1);
  }

  noise(t0, t1, dest, { pink = false, rate = 1 } = {}) {
    const buf = pink ? this.engine.pink : this.engine.white;
    return this.buffer(buf, t0, t1, dest, rate, true, Math.random() * buf.duration * 0.9);
  }

  buffer(buf, t0, t1, dest, rate = 1, loop = false, offset = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    s.playbackRate.value = rate;
    if (dest) s.connect(dest);
    return this.track(s, t0, t1, offset);
  }

  track(src, t0, t1, offset) {
    this.srcs.push(src);
    src.onended = () => {
      if (++this.ended >= this.srcs.length) this.release();
    };
    if (offset === undefined) src.start(t0);
    else src.start(t0, offset);
    src.stop(t1);
    return src;
  }

  /** Fade out fast and free the slot (used when the voice cap is exceeded or speech is cut). */
  kill(fade = 0.04) {
    if (this.dead) return;
    this.dead = true;
    const i = this.pool.indexOf(this);
    if (i >= 0) this.pool.splice(i, 1);
    const t = this.ctx.currentTime;
    glideTo(this.out.gain, 0, t, fade);
    for (const s of this.srcs) {
      try { s.stop(t + fade + 0.01); } catch { /* already stopped */ }
    }
    setTimeout(() => this.release(), (fade + 0.15) * 1000);
  }

  release() {
    if (this.released) return;
    this.released = this.dead = true;
    const i = this.pool.indexOf(this);
    if (i >= 0) this.pool.splice(i, 1);
    for (const n of [...this.srcs, ...this.nodes]) {
      try { n.disconnect(); } catch { /* ignore */ }
    }
  }
}

// ───────────────────────────── synth building blocks ─────────────────────────────

/** A single enveloped partial. Returns the stop time. */
function partial(v, t, freq, peak, decay, { attack = 0.003, dest = v.out, type = 'sine' } = {}) {
  const g = v.gain();
  g.connect(dest);
  const end = perc(g.gain, t, peak, attack, decay);
  v.osc(type, freq, t, end, g);
  return end;
}

/** Soft FM bell: the modulation index dies away quickly, so the strike sparkles and the tail is pure. */
function chime(v, t, freq, peak, { decay = 1.2, ratio = 3.5, index = 1.2, bite = 0.12, octave = 0.12, dest = v.out } = {}) {
  const g = v.gain();
  g.connect(dest);
  const end = perc(g.gain, t, peak, 0.003, decay);
  const car = v.osc('sine', freq, t, end, g);
  if (index > 0) {
    const mg = v.gain();
    mg.connect(car.frequency);
    v.osc('sine', freq * ratio, t, perc(mg.gain, t, freq * index, 0.001, bite), mg);
  }
  if (octave > 0) partial(v, t, freq * 2, peak * octave, decay * 0.35, { dest });
  return end;
}

/** Plucked string: a triangle through a low-pass that snaps shut (soft harp / felt guitar). */
function pluck(v, t, freq, peak, { decay = 1, bright = 3200, slide = 1, dest = v.out, type = 'triangle' } = {}) {
  const lp = v.filter('lowpass', bright, 0.9);
  lp.connect(dest);
  lp.frequency.setValueAtTime(bright, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 180), t + Math.max(0.05, decay * 0.4));
  const g = v.gain();
  g.connect(lp);
  const end = perc(g.gain, t, peak, 0.004, decay);
  const o = v.osc(type, freq, t, end, g);
  if (slide !== 1) {
    o.frequency.setValueAtTime(freq * slide, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.045);
  }
  return end;
}

/** Filtered noise burst, optionally sweeping. Returns the stop time. */
function hiss(v, t, { type = 'bandpass', freq = 1000, q = 0.8, peak = 0.2, attack = 0.002, decay = 0.05, pink = false, sweep = 0, dest = v.out } = {}) {
  const f = v.filter(type, freq, q);
  f.connect(dest);
  if (sweep) {
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(sweep, t + attack + decay);
  }
  const g = v.gain();
  g.connect(f);
  const end = perc(g.gain, t, peak, attack, decay);
  v.noise(t, end, g, { pink });
  return end;
}

/** Sine with a fast pitch glide: thuds, bounces, droplets. */
function thump(v, t, { from = 160, to = 60, glide = 0.08, peak = 0.3, decay = 0.15, type = 'sine', dest = v.out } = {}) {
  const g = v.gain();
  g.connect(dest);
  const end = perc(g.gain, t, peak, 0.004, decay);
  const o = v.osc(type, from, t, end, g);
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + glide);
  return end;
}

/** Ceramic clink: a few inharmonic partials with fast, staggered decays. */
function clink(v, t, f, peak, partials = 4) {
  const table = [[1, 1, 0.3], [2.32, 0.55, 0.18], [4.25, 0.3, 0.1], [6.63, 0.16, 0.06]];
  for (const [r, a, d] of table.slice(0, partials)) partial(v, t, f * r, peak * a, d, { attack: 0.001 });
}

/** A sprinkle of tiny high glints in the current key, each panned on its own. */
function sparkles(e, t, count, lowMidi, { spread = 0.4, peak = 0.03 } = {}) {
  const n = Math.max(1, Math.round(e.lowPower ? count / 2 : count));
  const v = e.sv({ wet: 0.6 });
  const tonic = tonicAbove(e.music.root, clamp(lowMidi, 79, 91));
  for (let i = 0; i < n; i++) {
    const at = t + spread * (i / n) + rand(0, 0.04);
    const f = mtof(pentaNote(tonic, (Math.random() * 7) | 0));
    partial(v, at, f, peak * rand(0.5, 1), rand(0.2, 0.5), { attack: 0.002, dest: v.pan(rand(-0.7, 0.7)) });
  }
}

const decayFor = (f, base) => base * clamp(Math.sqrt(440 / f), 0.55, 1.6);

// ───────────────────────────── music instruments ─────────────────────────────
// Signature: (voice, time, frequency, velocity 0..1, duration seconds, engine)

const INSTR = {
  kalimba(v, t, f, vel) {
    chime(v, t, f, 0.2 * vel, { decay: decayFor(f, 1.7), ratio: 1, index: 1.6, bite: 0.07, octave: 0 });
    partial(v, t, f * 5.95, 0.02 * vel, 0.05); // tine overtone
  },
  marimba(v, t, f, vel) {
    partial(v, t, f, 0.22 * vel, decayFor(f, 0.9), { attack: 0.004 });
    partial(v, t, f * 3.93, 0.06 * vel, 0.09, { attack: 0.002 });
  },
  piano(v, t, f, vel, dur, e) {
    // Felt piano: triangle + octave sine, two-stage decay, a low-pass that darkens as the note rings.
    const lp = v.filter('lowpass', 2400, 0.6);
    lp.connect(v.out);
    lp.frequency.setValueAtTime(Math.min(2800, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(f * 2, 500), t + 0.8);
    const g = v.gain();
    g.connect(lp);
    const peak = 0.2 * vel, long = decayFor(f, 2.4), end = t + long + 0.03;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.25);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + long);
    g.gain.linearRampToValueAtTime(0, t + long + 0.02);
    v.osc('triangle', f, t, end, g);
    const oct = v.gain(0.22);
    oct.connect(g);
    v.osc('sine', f * 2, t, end, oct);
    if (!e.lowPower) v.osc('sine', f * 1.002, t, end, g).detune.value = 3; // gentle chorus
    hiss(v, t, { freq: Math.min(f * 4, 3000), q: 1, peak: 0.02 * vel, decay: 0.03, dest: lp }); // hammer felt
  },
  flute(v, t, f, vel, dur) {
    const peak = 0.11 * vel, len = Math.max(dur, 0.2);
    const g = v.gain();
    g.connect(v.out);
    const end = swell(g.gain, t, peak, 0.07, len - 0.07, 0.25);
    const o = v.osc('sine', f, t, end, g);
    const h = v.gain(0.1);
    h.connect(g);
    v.osc('sine', f * 2, t, end, h);
    // Delayed vibrato, as a player would add it.
    const vib = v.gain(0);
    vib.connect(o.frequency);
    vib.gain.setValueAtTime(0, t + 0.2);
    vib.gain.linearRampToValueAtTime(f * 0.006, t + 0.5);
    v.osc('sine', rand(4.8, 5.4), t, end, vib);
    // Breath: band-passed noise with a little "chiff" at the start.
    const bp = v.filter('bandpass', Math.min(f * 2, 5000), 1.2);
    const bg = v.gain();
    bp.connect(bg);
    bg.connect(v.out);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(peak * 0.35, t + 0.03);
    bg.gain.linearRampToValueAtTime(peak * 0.08, t + 0.15);
    bg.gain.setValueAtTime(peak * 0.08, t + len);
    bg.gain.linearRampToValueAtTime(0, t + len + 0.2);
    v.noise(t, end, bp);
  },
  celesta(v, t, f, vel) {
    chime(v, t, f, 0.15 * vel, { decay: decayFor(f, 1.8), ratio: 4, index: 0.7, bite: 0.1, octave: 0.1 });
  },
  musicBox(v, t, f, vel) {
    chime(v, t, f, 0.14 * vel, { decay: decayFor(f, 2.3), ratio: 7, index: 0.45, bite: 0.05, octave: 0.22 });
  },
  harp(v, t, f, vel) {
    pluck(v, t, f, 0.19 * vel, { decay: decayFor(f, 1.3), bright: 2800 });
  },
  bass(v, t, f, vel, dur) {
    const lp = v.filter('lowpass', 480, 0.7);
    lp.connect(v.out);
    const g = v.gain();
    g.connect(lp);
    const peak = 0.13 * vel, d = t + Math.max(0.1, dur), end = d + 0.33;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(peak * 0.45, d);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, d + 0.3);
    g.gain.linearRampToValueAtTime(0, end - 0.01);
    v.osc('sine', f, t, end, g);
    const tri = v.gain(0.35);
    tri.connect(g);
    v.osc('triangle', f, t, end, tri);
  },
  shaker(v, t, f, vel) {
    hiss(v, t, { type: 'highpass', freq: 6500, q: 0.7, peak: 0.045 * vel, attack: 0.01, decay: 0.07 });
  },
  kick(v, t, f, vel) {
    thump(v, t, { from: 110, to: 50, glide: 0.09, peak: 0.15 * vel, decay: 0.24 });
  },
  tick(v, t, f, vel) {
    partial(v, t, 1180, 0.05 * vel, 0.045, { attack: 0.001 });
    hiss(v, t, { freq: 2600, q: 2, peak: 0.03 * vel, attack: 0.001, decay: 0.02 });
  },
};

// ───────────────────────────── palettes ─────────────────────────────
// Keys are neighbours (F lydian = C ionian notes; F ionian = B♭ lydian notes), so palette changes at
// bar boundaries move at most one pitch class. Progressions are scale degrees (0 = I).

const PALETTES = {
  afternoon: {
    bpm: 82, root: 5, mode: 'lydian', barsPerChord: 1, range: [67, 86],
    progressions: [[0, 1, 0, 1], [0, 1, 5, 4], [0, 2, 1, 4], [5, 4, 0, 1], [0, 4, 5, 1]],
    lead: 'kalimba', arp: 'marimba', counter: 'flute',
    density: 0.62, groove: 1, perc: 1, swing: 0.1, ext: 0.45,
    padCut: 1500, padLow: 48, padAttack: 0.9, padRelease: 1.8, padGain: 0.9, tone: 9000,
    amb: { wind: 0.5, leaves: 0.5, water: 0, chorus: 0, birds: 0.5, cuckoo: 0, crickets: 0, owl: 0 },
  },
  golden: {
    bpm: 78, root: 0, mode: 'ionian', barsPerChord: 1, range: [65, 84],
    progressions: [[0, 3, 0, 4], [0, 5, 3, 4], [3, 4, 2, 5], [0, 2, 3, 4], [3, 0, 1, 4]],
    lead: 'piano', arp: 'kalimba', counter: 'flute',
    density: 0.55, groove: 0.8, perc: 0.85, swing: 0.12, ext: 0.55,
    padCut: 1300, padLow: 45, padAttack: 1.1, padRelease: 2, padGain: 0.95, tone: 7500,
    amb: { wind: 0.45, leaves: 0.4, water: 0.1, chorus: 0, birds: 0.28, cuckoo: 0.035, crickets: 0, owl: 0 },
  },
  sunset: {
    bpm: 76, root: 5, mode: 'ionian', barsPerChord: 1, range: [65, 84],
    progressions: [[0, 5, 3, 4], [0, 5, 1, 4], [3, 4, 2, 5], [0, 3, 5, 4]],
    lead: 'flute', arp: 'piano', counter: 'celesta',
    density: 0.48, groove: 0.7, perc: 0.7, swing: 0.1, ext: 0.5,
    padCut: 1150, padLow: 43, padAttack: 1.3, padRelease: 2.2, padGain: 1, tone: 6500,
    amb: { wind: 0.4, leaves: 0.3, water: 0.2, chorus: 0.08, birds: 0.13, cuckoo: 0.045, crickets: 0.15, owl: 0 },
  },
  dusk: {
    bpm: 72, root: 10, mode: 'lydian', barsPerChord: 2, range: [67, 86],
    progressions: [[0, 1, 5, 4], [0, 1, 0, 1], [5, 4, 0, 1], [0, 2, 5, 1]],
    lead: 'celesta', arp: 'harp', counter: 'flute',
    density: 0.38, groove: 0.4, perc: 0.5, swing: 0.06, ext: 0.8,
    padCut: 1000, padLow: 41, padAttack: 1.6, padRelease: 2.6, padGain: 1.1, tone: 5200,
    amb: { wind: 0.35, leaves: 0.2, water: 0.35, chorus: 0.4, birds: 0.02, cuckoo: 0, crickets: 0.75, owl: 0.012 },
  },
  night: {
    bpm: 70, root: 5, mode: 'ionian', barsPerChord: 2, range: [69, 88],
    progressions: [[0, 3, 0, 4], [0, 5, 3, 4], [0, 3, 4, 0], [5, 3, 0, 4]],
    lead: 'musicBox', arp: 'celesta', counter: 'flute',
    density: 0.3, groove: 0.3, perc: 0.45, swing: 0.04, ext: 0.4,
    padCut: 820, padLow: 38, padAttack: 2, padRelease: 3, padGain: 1.15, tone: 4200,
    amb: { wind: 0.3, leaves: 0.15, water: 0.4, chorus: 0.7, birds: 0, cuckoo: 0, crickets: 1, owl: 0.03 },
  },
};

const BLEND_KEYS = ['bpm', 'density', 'groove', 'perc', 'swing', 'padCut', 'padLow', 'padAttack', 'padRelease', 'padGain'];
const AMB_KEYS = ['wind', 'leaves', 'water', 'chorus', 'birds', 'cuckoo', 'crickets', 'owl'];

/** Weighted average of numeric palette fields (weights come from the time-of-day crossfade). */
function blend(w, keys, get) {
  const out = {};
  for (const k of keys) out[k] = 0;
  for (const key of TIMES) {
    if (!w[key]) continue;
    const src = get(PALETTES[key]);
    for (const k of keys) out[k] += w[key] * src[k];
  }
  return out;
}

/** Choose a palette field by weight, so instruments morph note by note during a crossfade. */
function pickW(w, field) {
  let r = Math.random();
  for (const k of TIMES) {
    r -= w[k] || 0;
    if (r <= 0 && w[k]) return PALETTES[k][field];
  }
  return PALETTES[TIMES.reduce((a, b) => ((w[b] || 0) > (w[a] || 0) ? b : a))][field];
}

function layerTargets(l) {
  return {
    pad: 1 - 0.08 * clamp(l - 3, 0, 2),
    lead: 1,
    arp: l >= 1 ? 0.5 + 0.08 * (l - 1) : 0,
    bass: l >= 2 ? 0.8 : 0,
    perc: l >= 3 ? 0.75 + 0.1 * (l - 3) : 0,
    counter: l >= 5 ? 0.8 : 0,
  };
}

function buildChord(root, mode, deg, extended) {
  const M = MODES[mode], pc = (i) => mod(root + M[mod(i, 7)], 12);
  const pcs = [pc(deg), pc(deg + 2), pc(deg + 4)];
  if (extended) {
    const wholeStep = mod(M[mod(deg + 1, 7)] - M[mod(deg, 7)], 12) === 2; // add9 only where it is not a ♭9
    pcs.push(wholeStep && Math.random() < 0.5 ? pc(deg + 1) : pc(deg + 6));
  }
  return { deg, pcs };
}

const SLOT_WEIGHT = [1, 0.3, 0.65, 0.3, 0.85, 0.3, 0.6, 0.25]; // eighth-note onset likelihoods in 4/4

function rhythm(density) {
  const k = 0.35 + density, r = [];
  SLOT_WEIGHT.forEach((w, s) => { if (Math.random() < Math.min(0.95, w * k)) r.push(s); });
  return r.length ? r : [0];
}
// Mostly stepwise motion through the melody scale, with the occasional small leap.
const contour = () => Array.from({ length: 8 }, () => pick([-1, -1, -1, 1, 1, 1, 0, -2, 2, 1, -1, 3]));
function mutate(r) {
  const s = pick([1, 3, 5, 7]);
  const out = r.includes(s) ? r.filter((x) => x !== s) : [...r, s].sort((a, b) => a - b);
  return out.length ? out : [0];
}
const cadence = (r) => [...r.filter((s) => s < 4).slice(0, 2), 4];
function nearestIndex(list, m) {
  let best = 0;
  list.forEach((x, i) => { if (Math.abs(x - m) < Math.abs(list[best] - m)) best = i; });
  return best;
}
function snapToChord(scale, idx, set) {
  for (const d of [0, -1, 1, -2, 2]) {
    const m = scale[idx + d];
    if (m !== undefined && set.has(mod(m, 12))) return idx + d;
  }
  return idx;
}
function arpOrder(t, pat) {
  if (pat === 'down') return [...t].reverse();
  if (pat === 'updown') return [...t, ...t.slice(1, -1).reverse()];
  if (pat === 'outside') return t.map((_, i) => (i % 2 ? t[t.length - 1 - (i >> 1)] : t[i >> 1]));
  return t;
}

// ───────────────────────────── generative music ─────────────────────────────

class Music {
  constructor(engine) {
    this.e = engine;
    const pal = PALETTES[engine._fade.to];
    this.root = pal.root;
    this.mode = pal.mode;
    this.prog = null;
    this.progIdx = 0;
    this.chord = null;
    this.chordLeft = 0;
    this.nextTime = 0;
    this.step = 0;
    this.bar = 0;
    this.stepDur = 15 / pal.bpm; // one sixteenth note
    this.events = null;
    this.P = blend({ [engine._fade.to]: 1 }, BLEND_KEYS, (p) => p);
    this.last = 74;
    this.cLast = 64;
    this.motif = null;
    this.arpPat = 'up';
  }

  resync(now) {
    if (this.nextTime < now + 0.03) this.nextTime = now + 0.08;
  }

  /** Lookahead scheduler: walk the sixteenth-note grid up to `horizon`, planning a bar at a time. */
  pump(horizon, now) {
    if (this.nextTime < now - 0.25) this.resync(now); // woke from a stall: skip the backlog
    const audible = this.e._musicAudible();
    while (this.nextTime < horizon) {
      if (this.step === 0 || !this.events) this.events = this.planBar();
      if (audible) for (const ev of this.events[this.step]) this.dispatch(ev, this.nextTime);
      this.nextTime += this.stepDur;
      if (++this.step === 16) { this.step = 0; this.bar++; }
    }
  }

  nextChord(pal) {
    const keyChanged = pal.root !== this.root || pal.mode !== this.mode;
    if (keyChanged || !this.prog || this.progIdx >= this.prog.length) {
      this.root = pal.root;
      this.mode = pal.mode;
      const options = pal.progressions.filter((p) => p !== this.prog);
      this.prog = pick(options.length ? options : pal.progressions);
      this.progIdx = 0;
    }
    let deg = this.prog[this.progIdx++];
    const sub = SUBS[this.mode][deg];
    if (this.progIdx > 1 && sub !== undefined && Math.random() < 0.15) deg = sub;
    this.chord = buildChord(this.root, this.mode, deg, Math.random() < pal.ext);
    this.chordLeft = pal.barsPerChord;
  }

  planBar() {
    const e = this.e, w = e._weights(), pal = PALETTES[e._fade.to], lvl = e.intensity;
    const P = (this.P = blend(w, BLEND_KEYS, (p) => p));
    this.stepDur = 15 / P.bpm; // tempo glides bar by bar during a crossfade
    const ev = Array.from({ length: 16 }, () => []);
    const add = (step, x) => ev[step].push(x);
    let fresh = false;
    if (this.chordLeft <= 0) { this.nextChord(pal); fresh = true; }
    this.chordLeft--;
    const ch = this.chord;

    if (fresh) add(0, { layer: 'pad', pad: this.padVoicing(ch, Math.round(P.padLow)), dur: 16 * pal.barsPerChord + 1 });

    const phrase = this.bar % 4;
    const mel = this.melody(phrase, P.density * (0.55 + 0.09 * lvl), ch, pal.range);
    for (const n of mel) {
      add(n.slot * 2, { layer: 'lead', inst: pickW(w, 'lead'), midi: n.midi, vel: n.vel, dur: n.dur, pan: rand(-0.15, 0.15), swing: n.slot % 2 === 1, human: 1 });
    }
    if (lvl >= 5) {
      for (const n of this.counter(phrase, mel, ch, pal.range)) {
        add(n.slot * 2, { layer: 'counter', inst: pickW(w, 'counter'), midi: n.midi, vel: n.vel, dur: n.dur, pan: -0.3, swing: n.slot % 2 === 1, human: 1 });
      }
    }
    if (lvl >= 1) {
      if (this.bar % 2 === 0) this.arpPat = pick(['up', 'down', 'updown', 'outside']);
      const tones = arpOrder(this.arpTones(ch), this.arpPat);
      const slots = lvl >= 2 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 2, 4, 6];
      const omit = (lvl >= 4 ? 0.1 : lvl >= 2 ? 0.25 : 0.4) + (1 - P.density) * 0.35;
      slots.forEach((slot, k) => {
        if (Math.random() < omit) return;
        add(slot * 2, { layer: 'arp', inst: pickW(w, 'arp'), midi: tones[k % tones.length], vel: (slot % 2 ? 0.42 : 0.55) + rand(-0.06, 0.06), dur: lvl >= 2 ? 2 : 4, pan: k % 2 ? 0.3 : -0.3, swing: slot % 2 === 1, human: 0.6 });
      });
    }
    if (lvl >= 2) {
      const root = tonicAbove(ch.pcs[0], 38), fifth = tonicAbove(ch.pcs[2], root);
      const busy = P.groove >= 0.55 || lvl >= 4;
      add(0, { layer: 'bass', inst: 'bass', midi: root, vel: 0.85, dur: busy ? 7 : 15 });
      if (busy) add(8, { layer: 'bass', inst: 'bass', midi: Math.random() < 0.6 ? fifth : root, vel: 0.62, dur: 6 });
      if (lvl >= 4 && Math.random() < P.groove * 0.5) add(14, { layer: 'bass', inst: 'bass', midi: root + 12, vel: 0.4, dur: 2 });
    }
    if (lvl >= 3) {
      const g = P.groove, pv = P.perc;
      for (let s = 0; s < 16; s += 2) {
        if (Math.random() < 0.5 + g * 0.5) add(s, { layer: 'perc', inst: 'shaker', vel: (s % 4 === 2 ? 0.8 : 0.5) * pv * rand(0.85, 1.1), dur: 1, pan: 0.35, swing: s % 4 === 2, human: 0.5 });
      }
      if (lvl >= 4) for (let s = 1; s < 16; s += 2) if (Math.random() < g * 0.3) add(s, { layer: 'perc', inst: 'shaker', vel: 0.3 * pv, dur: 1, pan: 0.4, human: 0.5 });
      if (Math.random() < 0.4 + g * 0.6) add(0, { layer: 'perc', inst: 'kick', vel: 0.85 * pv, dur: 4 });
      if (lvl >= 4 && Math.random() < g) add(8, { layer: 'perc', inst: 'kick', vel: 0.6 * pv, dur: 4 });
      if (lvl >= 5) {
        add(4, { layer: 'perc', inst: 'tick', vel: 0.5 * pv, dur: 1, pan: -0.25 });
        add(12, { layer: 'perc', inst: 'tick', vel: 0.55 * pv, dur: 1, pan: -0.25 });
      }
    }
    return ev;
  }

  dispatch(ev, t) {
    const e = this.e, sd = this.stepDur;
    let at = t + (ev.swing ? this.P.swing * sd * 2 : 0) + (ev.human ? rand(-0.006, 0.006) * ev.human : 0);
    at = Math.max(at, e.ctx.currentTime + 0.002);
    if (ev.pad) return this.pad(at, ev.pad, ev.dur * sd);
    const v = new Voice(e, e.pools.music, e.layers[ev.layer], { pan: ev.pan || 0 });
    INSTR[ev.inst](v, at, mtof(ev.midi || 60), ev.vel, ev.dur * sd, e);
  }

  /** Warm pad: detuned PeriodicWave oscillators split left/right, one shared low-pass per side. */
  pad(t, notes, dur) {
    const e = this.e, P = this.P;
    const sides = e.lowPower ? [0] : [-0.4, 0.4];
    const peak = (0.1 * P.padGain) / notes.length / (e.lowPower ? 1 : 1.4);
    for (const side of sides) {
      const v = new Voice(e, e.pools.pad, e.layers.pad, { pan: side });
      const lp = v.filter('lowpass', P.padCut * 0.55, 0.5);
      lp.connect(v.out);
      const g = v.gain();
      g.connect(lp);
      const end = swell(g.gain, t, peak, P.padAttack, dur - P.padAttack, P.padRelease);
      lp.frequency.setValueAtTime(P.padCut * 0.55, t);
      lp.frequency.linearRampToValueAtTime(P.padCut, t + P.padAttack);
      lp.frequency.linearRampToValueAtTime(P.padCut * 0.6, end);
      for (const m of notes) v.osc(e.waves.warm, mtof(m), t, end, g).detune.value = side * 14 + rand(-3, 3);
    }
  }

  padVoicing(ch, low) {
    const notes = [tonicAbove(ch.pcs[0], low)];
    for (const pc of ch.pcs.slice(1)) notes.push(tonicAbove(pc, 55));
    if (ch.pcs.length < 4) notes.push(tonicAbove(ch.pcs[0], 55));
    return notes;
  }

  arpTones(ch) {
    const t = ch.pcs.map((pc) => tonicAbove(pc, 60)).sort((a, b) => a - b);
    t.push(t[0] + 12);
    return t;
  }

  /** Key pentatonic plus the current triad, as MIDI notes inside [lo, hi]. */
  scaleNotes(ch, lo, hi) {
    const pcs = new Set(PENTA.map((i) => mod(this.root + i, 12)));
    for (const pc of ch.pcs.slice(0, 3)) pcs.add(pc);
    const out = [];
    for (let m = lo; m <= hi; m++) if (pcs.has(mod(m, 12))) out.push(m);
    return out;
  }

  /**
   * Four-bar phrases: a motif (rhythm + contour), a variation, the motif again over the new chord,
   * then a cadence that lands on a chord tone. Strong beats snap to chord tones.
   */
  melody(phrase, density, ch, [lo, hi]) {
    const scale = this.scaleNotes(ch, lo, hi), chordSet = new Set(ch.pcs.slice(0, 3));
    if (phrase === 0 || !this.motif) this.motif = { rhythm: rhythm(density), moves: contour() };
    let r = this.motif.rhythm, mv = this.motif.moves;
    if (phrase === 1) { r = Math.random() < 0.5 ? mutate(r) : rhythm(density); mv = contour(); }
    else if (phrase === 3) r = cadence(r);
    if (phrase % 2 === 1 && Math.random() > density + 0.4) return []; // sparse palettes let bars breathe
    let idx = nearestIndex(scale, this.last);
    const center = (lo + hi) / 2;
    return r.map((slot, i) => {
      let step = mv[i % mv.length];
      if ((scale[idx] > center + 7 && step > 0) || (scale[idx] < center - 7 && step < 0)) {
        if (Math.random() < 0.5) step = -step; // gentle gravity toward the middle of the range
      }
      idx = clamp(idx + step, 0, scale.length - 1);
      const strong = slot === 0 || slot === 4, final = phrase === 3 && i === r.length - 1;
      if (strong || final) idx = snapToChord(scale, idx, chordSet);
      const next = r[i + 1] ?? 8;
      this.last = scale[idx];
      return {
        slot,
        midi: scale[idx],
        vel: clamp((strong ? 0.85 : 0.68) + rand(-0.08, 0.08), 0.3, 1),
        dur: final ? (8 - slot) * 2 : Math.min(next - slot, 4) * 2,
      };
    });
  }

  /** Countermelody: a held harmony under the motif, and little answers in the melody's rests. */
  counter(phrase, mel, ch, [lo, hi]) {
    const scale = this.scaleNotes(ch, lo - 10, hi - 10), chordSet = new Set(ch.pcs.slice(0, 3));
    const tones = scale.filter((m) => chordSet.has(mod(m, 12)));
    if (!tones.length) return [];
    if (phrase % 2 === 0) {
      const ref = mel[0]?.midi ?? this.last;
      const under = tones.filter((m) => m <= ref - 3 && m >= ref - 9);
      return [{ slot: 0, midi: under.length ? under[under.length - 1] : pick(tones), vel: 0.55, dur: 14 }];
    }
    const used = new Set(mel.map((n) => n.slot)), out = [];
    let idx = nearestIndex(scale, this.cLast);
    for (const slot of [1, 2, 3, 5, 6, 7]) {
      if (used.has(slot) || Math.random() < 0.5) continue;
      idx = clamp(idx + pick([-1, 1, 1, 2, -2]), 0, scale.length - 1);
      out.push({ slot, midi: scale[idx], vel: 0.5 + rand(-0.05, 0.05), dur: 3 });
    }
    if (out.length) this.cLast = out[out.length - 1].midi;
    return out;
  }
}

// ───────────────────────────── ambience ─────────────────────────────

class Ambience {
  constructor(e) {
    this.e = e;
    const out = e.bus.amb.input;
    const bed = (...nodes) => e._chain(...nodes, out);
    this.levels = { wind: e._g(0), leaves: e._g(0), water: e._g(0), chorus: e._g(0) };

    // Wind: pink noise through a low-pass whose cutoff and level drift on slow, incommensurate LFOs.
    const wlp = e._f('lowpass', 420, 0.8);
    e._lfo(0.063, 210, wlp.frequency);
    e._lfo(0.021, 130, wlp.frequency);
    const wsw = e._g(0.8);
    e._lfo(0.089, 0.3, wsw.gain);
    bed(e._loop(e.pink), wlp, wsw, this.levels.wind, e._pan(0, 0.034, 0.5));

    // Leaves: airy band of white noise with a quick flutter, swelled by occasional gusts.
    const lbp = e._f('bandpass', 4200, 0.6);
    const flutter = e._g(0.75);
    e._lfo(5.3, 0.15, flutter.gain);
    e._lfo(7.9, 0.1, flutter.gain);
    this.gust = e._g(0.3);
    bed(e._loop(e.white), lbp, flutter, this.gust, this.levels.leaves, e._pan(0, 0.047, 0.6));

    // Stream: pink noise in a wandering band-pass, off to one side.
    const sbp = e._f('bandpass', 1300, 1.1);
    e._lfo(0.31, 380, sbp.frequency);
    e._lfo(0.77, 220, sbp.frequency);
    e._lfo(2.3, 120, sbp.frequency);
    bed(e._loop(e.pink, 1.3), sbp, e._f('highpass', 350, 0.7), this.levels.water, e._pan(0.55));

    // Distant cricket chorus: two narrow noise bands, amplitude-modulated at insect rates.
    for (const [hz, am, side] of [[4650, 23, -0.5], [5250, 19, 0.5]]) {
      const pulse = e._g(0.5);
      e._lfo(am, 0.5, pulse.gain);
      const breathe = e._g(0.6);
      e._lfo(rand(0.3, 0.5), 0.4, breathe.gain);
      e._chain(e._loop(e.white), e._f('bandpass', hz, 14), pulse, breathe, e._pan(side), this.levels.chorus);
    }
    this.levels.chorus.connect(out);

    this.next = {};
    this.crickets = Array.from({ length: 3 }, () => ({
      freq: rand(4300, 5400), pan: rand(-0.8, 0.8), period: rand(0.55, 0.95), pulses: 2 + ((Math.random() * 3) | 0), next: 0,
    }));
  }

  /** Crossfade the continuous beds toward the target palette. */
  apply(seconds) {
    const A = PALETTES[this.e._fade.to].amb, now = this.e.ctx.currentTime, L = this.levels;
    glideTo(L.wind.gain, A.wind * 0.3, now, seconds);
    glideTo(L.leaves.gain, A.leaves * 0.09, now, seconds);
    glideTo(L.water.gain, A.water * 0.07, now, seconds);
    glideTo(L.chorus.gain, A.chorus * 0.3, now, seconds);
  }

  resync() {
    this.next = {};
    for (const c of this.crickets) c.next = 0;
  }

  pump(horizon, now) {
    const A = blend(this.e._weights(), AMB_KEYS, (p) => p.amb), k = this.e.lowPower ? 0.7 : 1;
    this.event('bird', A.birds * k, horizon, now, (t) => this.bird(t));
    this.event('cuckoo', A.cuckoo, horizon, now, (t) => this.cuckoo(t));
    this.event('owl', A.owl, horizon, now, (t) => this.owl(t));
    this.event('gust', A.leaves > 0.05 ? 0.14 : 0, horizon, now, (t) => this.gustAt(t));
    this.event('drop', A.water * 1.4 * k, horizon, now, (t) => this.droplet(t, A.water));
    const active = Math.round(A.crickets * (this.e.lowPower ? 2 : 3));
    this.crickets.forEach((c, i) => {
      if (i >= active) { c.next = 0; return; }
      if (!c.next || c.next < now - 1) c.next = now + rand(0.1, 1.5);
      while (c.next < horizon) {
        if (c.next >= now) this.cricket(c, c.next, A.crickets);
        c.next += c.period * rand(0.85, 1.15) + (Math.random() < 0.07 ? rand(1.5, 5) : 0); // crickets rest too
      }
    });
  }

  /** Poisson-timed events at `rate` per second. */
  event(name, rate, horizon, now, fire) {
    if (rate <= 1e-4) { this.next[name] = 0; return; }
    if (!this.next[name] || this.next[name] < now - 1) this.next[name] = now + Math.max(0.4, expWait(rate));
    while (this.next[name] < horizon) {
      const t = this.next[name];
      if (t >= now) fire(t);
      this.next[name] = t + Math.max(0.3, expWait(rate));
    }
  }

  voice(opts) {
    return new Voice(this.e, this.e.pools.amb, this.e.bus.amb.input, { wetDest: this.e.bus.amb.wet, ...opts });
  }

  /** Songbirds: one FM-able sine whose pitch and gain are automated through a list of chirps. */
  bird(t) {
    const near = Math.random(), kind = pick(['tee', 'warble', 'warble', 'sweep', 'trill']);
    const v = this.voice({ pan: rand(-0.85, 0.85), wet: 0.25 + (1 - near) * 0.35 });
    const lp = v.filter('lowpass', 4500 + near * 4000, 0.5);
    lp.connect(v.out);
    const g = v.gain();
    g.connect(lp);
    const amp = 0.012 + near * 0.02, chirps = [];
    let s = 0;
    if (kind === 'tee') {
      const hi = rand(3800, 4600), lo = hi * rand(0.72, 0.8);
      for (let i = 2 + ((Math.random() * 3) | 0); i > 0; i--) {
        chirps.push([s, 0.11, hi, hi * 0.97, 1]); s += 0.15;
        chirps.push([s, 0.12, lo * 1.02, lo, 0.8]); s += 0.2;
      }
    } else if (kind === 'warble') {
      let f = rand(2600, 3800);
      for (let i = 4 + ((Math.random() * 5) | 0); i > 0; i--) {
        const f1 = f * rand(0.85, 1.25), d = rand(0.04, 0.08);
        chirps.push([s, d, f, f1, rand(0.6, 1)]);
        s += d + rand(0.03, 0.05);
        f = clamp(f1 * rand(0.9, 1.15), 2200, 5200);
      }
    } else if (kind === 'sweep') {
      chirps.push([0, 0.18, rand(2200, 2600), rand(3800, 4400), 1], [0.26, 0.1, 3600, 3000, 0.6]);
    } else {
      chirps.push([0, rand(0.5, 0.9), rand(3600, 4400), rand(3200, 3800), 1]);
    }
    const [ls, ld] = chirps[chirps.length - 1], end = t + ls + ld + 0.05;
    const o = v.osc('sine', chirps[0][2], t, end, g);
    for (const [cs, d, f0, f1, a] of chirps) {
      const at = t + cs;
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f1, at + d);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(amp * a, at + d * 0.25);
      g.gain.linearRampToValueAtTime(0, at + d);
    }
    if (kind === 'trill') {
      const mg = v.gain(chirps[0][2] * 0.06);
      mg.connect(o.frequency);
      v.osc('sine', rand(28, 45), t, end, mg);
    }
  }

  /** Two-note call (sine with a slight pitch sag per note), used for the cuckoo and the owl. */
  call(t, { f, notes, reps, gap, level, cutoff, wave = 'sine' }) {
    const v = this.voice({ pan: pick([-1, 1]) * rand(0.4, 0.8), wet: 0.6, level: rand(0.6, 1) });
    const lp = v.filter('lowpass', cutoff, 0.6);
    lp.connect(v.out);
    const g = v.gain();
    g.connect(lp);
    const seq = [];
    let s = t;
    for (let r = 0; r < reps; r++) {
      for (const [ratio, len, pause] of notes) { seq.push([s, ratio, len]); s += len + pause; }
      s += gap;
    }
    const o = v.osc(wave, f, t, s, g);
    for (const [at, ratio, len] of seq) {
      o.frequency.setValueAtTime(f * ratio * 1.02, at);
      o.frequency.linearRampToValueAtTime(f * ratio * 0.98, at + len);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(level, at + 0.05);
      g.gain.linearRampToValueAtTime(level * 0.8, at + len - 0.06);
      g.gain.linearRampToValueAtTime(0, at + len);
    }
  }

  cuckoo(t) {
    this.call(t, { f: rand(620, 700), notes: [[1, 0.2, 0.09], [0.8, 0.3, 0]], reps: 1 + ((Math.random() * 3) | 0), gap: 0.6, level: 0.03, cutoff: 1500 });
  }

  owl(t) {
    this.call(t, { f: rand(300, 360), notes: [[1, 0.34, 0.22], [1.02, 0.18, 0.08], [0.97, 0.42, 0]], reps: 1, gap: 0, level: 0.03, cutoff: 900 });
  }

  gustAt(t) {
    const g = this.gust.gain, up = rand(0.6, 1.4);
    hold(g, t);
    g.linearRampToValueAtTime(rand(0.7, 1), t + up);
    g.linearRampToValueAtTime(0.3, t + up + rand(1.2, 2.4));
  }

  droplet(t, amount) {
    const v = this.voice({ pan: rand(0.25, 0.85), wet: 0.4 });
    const f = rand(900, 1900), g = v.gain();
    g.connect(v.out);
    const o = v.osc('sine', f, t, perc(g.gain, t, 0.004 + 0.012 * amount, 0.002, 0.06), g);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.04);
  }

  /** One cricket chirp: a few 16 ms pulses of a high sine. */
  cricket(c, t, amount) {
    const v = this.voice({ pan: c.pan, wet: 0.2 });
    const g = v.gain();
    g.connect(v.out);
    const amp = 0.014 * amount * rand(0.7, 1), pw = 0.016, gap = 0.012;
    for (let k = 0; k < c.pulses; k++) {
      const s = t + k * (pw + gap);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(amp, s + 0.004);
      g.gain.linearRampToValueAtTime(amp * 0.5, s + pw - 0.004);
      g.gain.linearRampToValueAtTime(0, s + pw);
    }
    v.osc('sine', c.freq, t, t + c.pulses * (pw + gap) + 0.02, g);
  }
}

// ───────────────────────────── sound effects ─────────────────────────────
// Signature: (engine, opts, startTime). Pitched effects use the music's current key.

const MIN_GAP = { uiHover: 0.045, footstep: 0.05, pick: 0.03, move: 0.06, ui: 0.02, land: 0.025, splash: 0.03, eat: 0.1 };

const SFX = {
  pick(e, o, t) {
    const v = e.sv({ pan: num(o.pan, rand(-0.15, 0.15)), wet: 0.08 });
    const f = 480 * rand(0.9, 1.12), lp = v.filter('lowpass', 2200, 0.7), g = v.gain();
    lp.connect(v.out);
    g.connect(lp);
    const osc = v.osc('triangle', f, t, perc(g.gain, t, 0.2, 0.003, 0.09), g);
    osc.frequency.setValueAtTime(f * 0.7, t); // soft "bup": a quick rise, then settle
    osc.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.025);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    hiss(v, t, { freq: 1500, q: 1.2, peak: 0.06, attack: 0.001, decay: 0.02 });
  },
  drop(e, o, t) {
    const v = e.sv({ pan: num(o.pan, rand(-0.15, 0.15)), wet: 0.06 });
    thump(v, t, { from: 150, to: 62, glide: 0.07, peak: 0.24, decay: 0.16 });
    hiss(v, t, { type: 'lowpass', freq: 650, q: 0.6, peak: 0.12, attack: 0.003, decay: 0.08, pink: true });
    partial(v, t, 310 * rand(0.95, 1.05), 0.05, 0.05, { type: 'triangle' });
  },
  move(e, o, t) {
    const v = e.sv({ pan: num(o.pan, rand(-0.3, 0.3)), wet: 0.05 });
    const bp = v.filter('bandpass', 700, 0.9), g = v.gain();
    bp.connect(v.out);
    g.connect(bp);
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.22);
    v.noise(t, swell(g.gain, t, 0.3, 0.07, 0.04, 0.16), g, { pink: true });
  },
  invalid(e, o, t) {
    const v = e.sv({ wet: 0.08 });
    [[0, 1, 0.15], [0.1, 0.84, 0.12]].forEach(([d, r, peak]) => {
      const s = t + d, f = 200 * r, lp = v.filter('lowpass', 800, 0.7), g = v.gain();
      lp.connect(v.out);
      g.connect(lp);
      const osc = v.osc('triangle', f, s, perc(g.gain, s, peak, 0.006, 0.2), g);
      osc.frequency.setValueAtTime(f * 1.05, s);
      osc.frequency.exponentialRampToValueAtTime(f * 0.95, s + 0.12);
    });
  },
  merge(e, o, t) {
    const tier = clamp(Math.round(num(o.tier, 0)), 0, 11), chain = clamp(Math.round(num(o.chain, 1)), 1, 5);
    const count = clamp(Math.round(num(o.count, 2)), 2, 4);
    // Every tier is its own pentatonic step (C4 register upward); each chain link climbs two more.
    const tonic = tonicAbove(e.music.root, 60), idx = Math.min(14, tier + (chain - 1) * 2);
    const v = e.sv({ pan: num(o.pan, rand(-0.15, 0.15)), wet: 0.3 + 0.05 * count });
    // Chains get a quick rising run into the main note ("bl-bl-ding!").
    const run = chain > 1 ? Math.min(chain, e.lowPower ? 2 : 4) : 0;
    for (let i = run; i >= 1; i--) {
      chime(v, t + (run - i) * 0.042, mtof(pentaNote(tonic, idx - i)), 0.07, { decay: 0.35, index: 0.8, octave: 0 });
    }
    const hit = t + run * 0.042, main = pentaNote(tonic, idx), f = mtof(main);
    // Main strike: a glassy bell over a warm marimba body.
    const soft = clamp(700 / f, 0.4, 1); // high notes get less FM bite so they stay glassy, not piercing
    chime(v, hit, f, 0.24, { decay: 1.1 + 0.05 * tier, index: 1.3 * soft, bite: 0.18, octave: 0.15 * soft });
    partial(v, hit, f / 2, 0.1, 0.5);
    partial(v, hit, f * 3.93, 0.02, 0.08, { attack: 0.002 });
    hiss(v, hit, { freq: 2400, q: 0.9, peak: 0.04, decay: 0.05 });
    // Bigger groups stack a pentatonic chord beneath the note.
    if (count >= 3) chime(v, hit + 0.012, mtof(pentaNote(tonic, idx - 2)), 0.12, { decay: 1, index: 0.6, octave: 0 });
    if (count >= 4) {
      chime(v, hit + 0.024, mtof(pentaNote(tonic, idx - 4)), 0.11, { decay: 1.2, index: 0.5, octave: 0 });
      chime(v, hit + 0.1, mtof(main + 12), 0.05, { decay: 1.4, index: 0.4, octave: 0 });
    }
    if (count >= 4 || tier >= 8) thump(v, hit, { from: mtof(tonic - 12) * 1.5, to: mtof(tonic - 12), glide: 0.1, peak: 0.12, decay: 0.5 });
    sparkles(e, hit + 0.03, 2 + count * 2 + chain, main + 12, { spread: 0.25 + count * 0.1, peak: 0.022 + 0.005 * count });
  },
  serve(e, o, t) {
    const v = e.sv({ pan: num(o.pan, 0), wet: 0.3 }), tonic = tonicAbove(e.music.root, 72);
    clink(v, t, rand(1500, 1700), 0.1);
    chime(v, t + 0.08, mtof(tonic + 7), 0.1, { decay: 0.6, index: 0.9 });
    chime(v, t + 0.19, mtof(tonic + 12), 0.11, { decay: 1, index: 0.9, octave: 0.1 });
  },
  share(e, o, t) {
    const v = e.sv({ pan: num(o.pan, 0), wet: 0.25 });
    clink(v, t, rand(1700, 1900), 0.07, 3);
    chime(v, t + 0.07, mtof(tonicAbove(e.music.root, 79)), 0.07, { decay: 0.6, index: 0.8 });
  },
  thread(e, o, t) {
    const slot = clamp(Math.round(num(o.slot, 1)), 1, 3);
    const v = e.sv({ pan: (slot - 2) * 0.25, wet: 0.2 });
    hiss(v, t, { freq: 2400, q: 2.5, peak: 0.12, attack: 0.001, decay: 0.025 });
    partial(v, t, 950, 0.06, 0.035, { attack: 0.001 }); // woody tock
    const f = mtof(pentaNote(tonicAbove(e.music.root, 64), slot * 2));
    pluck(v, t + 0.03, f, 0.16, { decay: 0.7, bright: 3500, slide: 0.94 });
  },
  skewerDone(e, o, t) {
    const v = e.sv({ wet: 0.35 }), tonic = tonicAbove(e.music.root, 67);
    [7, 12, 16].forEach((s, i) => {
      const f = mtof(tonic + s), at = t + i * 0.09, last = i === 2;
      chime(v, at, f, 0.11, { decay: last ? 1.3 : 0.5, index: 1 });
      pluck(v, at, f / 2, 0.08, { decay: last ? 1 : 0.4 });
    });
    sparkles(e, t + 0.2, 5, tonic + 24, { spread: 0.4 });
  },
  basket(e, o, t) {
    const v = e.sv({ pan: num(o.pan, 0), wet: 0.15 });
    // Wicker rustle: one noise source; the band-pass hops while the gain flutters in tiny crackles.
    const bp = v.filter('bandpass', 3000, 1.4), g = v.gain();
    bp.connect(v.out);
    g.connect(bp);
    let s = t;
    for (let i = e.lowPower ? 6 : 10; i > 0; i--) {
      const step = rand(0.025, 0.05);
      bp.frequency.setValueAtTime(rand(1800, 4800), s);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(rand(0.06, 0.14), s + 0.003);
      g.gain.exponentialRampToValueAtTime(0.002, s + step * 0.8);
      g.gain.linearRampToValueAtTime(0, s + step * 0.9);
      s += step;
    }
    v.noise(t, s + 0.02, g);
    // Creak: slow friction pulses (a very low sawtooth) through a resonant band-pass.
    const cbp = v.filter('bandpass', 750, 6), cg = v.gain();
    cbp.connect(v.out);
    cg.connect(cbp);
    const saw = v.osc('sawtooth', 38, t + 0.05, swell(cg.gain, t + 0.05, 0.5, 0.12, 0.12, 0.18), cg);
    saw.frequency.setValueAtTime(38, t + 0.05);
    saw.frequency.linearRampToValueAtTime(52, t + 0.2);
    saw.frequency.linearRampToValueAtTime(34, t + 0.4);
  },
  land(e, o, t) {
    const size = clamp(num(o.size, 0.5), 0, 1), f = (360 - 180 * size) * rand(0.94, 1.06);
    const v = e.sv({ pan: num(o.pan, rand(-0.25, 0.25)), wet: 0.1 });
    thump(v, t, { from: f * 1.5, to: f * 0.7, glide: 0.06, peak: 0.16 + 0.08 * size, decay: 0.12 + 0.1 * size });
    hiss(v, t, { type: 'lowpass', freq: 900, peak: 0.08 + 0.06 * size, decay: 0.06, pink: true });
    thump(v, t + 0.12 + 0.05 * size, { from: f * 1.7, to: f, glide: 0.05, peak: 0.09 + 0.05 * size, decay: 0.08 }); // little bounce
  },
  coin(e, o, t) {
    // Bursts of coins cascade 45 ms apart and climb the scale, instead of stacking into one loud hit.
    const now = e.ctx.currentTime, at = Math.max(t, (e._coinAt || 0) + 0.045);
    if (at - now > 0.6) return;
    e._coinStep = at - (e._coinAt || 0) < 0.25 ? ((e._coinStep || 0) + 1) % 6 : 0;
    e._coinAt = at;
    const v = e.sv({ pan: num(o.pan, rand(-0.4, 0.4)), wet: 0.25 });
    chime(v, at, mtof(pentaNote(tonicAbove(e.music.root, 84), e._coinStep)), 0.06, { decay: 0.3, ratio: 2.76, index: 0.5, octave: 0 });
  },
  star(e, o, t) {
    const i = clamp(Math.round(num(o.index, 0)), 0, 2), tonic = tonicAbove(e.music.root, 67), base = 2 + i * 2;
    const v = e.sv({ wet: 0.45, pan: (i - 1) * 0.35 });
    for (let k = 0; k < 4; k++) {
      chime(v, t + k * 0.055, mtof(pentaNote(tonic, base + k)), 0.08 + k * 0.012, { decay: 0.6 + k * 0.2, index: 0.9, octave: 0.1 });
    }
    sparkles(e, t + 0.2, 4 + i * 2, pentaNote(tonic, base + 5), { spread: 0.5 });
  },
  undo(e, o, t) {
    const v = e.sv({ wet: 0.25 });
    // Reversed envelopes read as "rewind": a swell that stops short while the filter closes.
    const bp = v.filter('bandpass', 2600, 0.9), g = v.gain();
    bp.connect(v.out);
    g.connect(bp);
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.26);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.002, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.24);
    g.gain.linearRampToValueAtTime(0, t + 0.3);
    v.noise(t, t + 0.32, g, { pink: true });
    const f = mtof(tonicAbove(e.music.root, 67) + 7), g2 = v.gain();
    g2.connect(v.out);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.002, t + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.08, t + 0.22);
    g2.gain.linearRampToValueAtTime(0, t + 0.27);
    const o2 = v.osc('triangle', f, t, t + 0.3, g2);
    o2.frequency.setValueAtTime(f, t);
    o2.frequency.exponentialRampToValueAtTime(f * 0.89, t + 0.26);
  },
  whoosh(e, o, t) {
    const dir = num(o.pan, -0.6) < 0 ? 1 : -1;
    const v = e.sv({ pan: -0.6 * dir, wet: 0.3 });
    const bp = v.filter('bandpass', 400, 0.7), g = v.gain();
    bp.connect(v.out);
    g.connect(bp);
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.75);
    v.noise(t, swell(g.gain, t, 0.36, 0.28, 0.05, 0.45), g, { pink: true });
    if (v.panner) {
      v.panner.pan.setValueAtTime(-0.6 * dir, t);
      v.panner.pan.linearRampToValueAtTime(0.6 * dir, t + 0.75);
    }
  },
  ui(e, o, t) {
    const v = e.sv({ wet: 0.04 });
    partial(v, t, 1400, 0.07, 0.035, { attack: 0.001 });
    hiss(v, t, { type: 'highpass', freq: 3000, peak: 0.02, attack: 0.001, decay: 0.012 });
  },
  uiHover(e, o, t) {
    partial(e.sv(), t, 2200, 0.022, 0.02, { attack: 0.001 });
  },
  open(e, o, t) {
    const v = e.sv({ wet: 0.2 }), tonic = tonicAbove(e.music.root, 67);
    pluck(v, t, mtof(tonic), 0.09, { decay: 0.45 });
    pluck(v, t + 0.06, mtof(tonic + 7), 0.09, { decay: 0.6 });
    hiss(v, t, { freq: 900, sweep: 2600, q: 0.8, peak: 0.03, attack: 0.08, decay: 0.12 });
  },
  close(e, o, t) {
    const v = e.sv({ wet: 0.2 }), tonic = tonicAbove(e.music.root, 62);
    pluck(v, t, mtof(tonic + 7), 0.08, { decay: 0.4 });
    pluck(v, t + 0.06, mtof(tonic), 0.08, { decay: 0.5 });
    hiss(v, t, { freq: 2400, sweep: 800, q: 0.8, peak: 0.025, attack: 0.05, decay: 0.12 });
  },
  firework(e, o, t) {
    const v = e.sv({ pan: num(o.pan, rand(-0.6, 0.6)), wet: 0.7 });
    // Distant pop: muffled noise and a low thump, mostly reverb.
    hiss(v, t, { type: 'lowpass', freq: 900, q: 0.5, peak: 0.16, attack: 0.003, decay: 0.3, pink: true });
    thump(v, t, { from: 95, to: 42, glide: 0.12, peak: 0.14, decay: 0.45 });
    // Crackle tail from the pre-rendered sparse-impulse buffer.
    const hp = v.filter('highpass', 1400, 0.5), lp = v.filter('lowpass', 6000, 0.5), g = v.gain();
    g.connect(hp);
    hp.connect(lp);
    lp.connect(v.out);
    const tc = t + rand(0.12, 0.25);
    v.buffer(e.crackle, tc, swell(g.gain, tc, 0.22, 0.02, 0.6, 0.8), g, rand(0.85, 1.15));
  },
  lanternLight(e, o, t) {
    const v = e.sv({ pan: num(o.pan, 0), wet: 0.4 });
    // "Fwoomp": pink noise through a low-pass that blooms open and settles, like a flame catching.
    const lp = v.filter('lowpass', 180, 1.2), g = v.gain();
    lp.connect(v.out);
    g.connect(lp);
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(1500, t + 0.09);
    lp.frequency.exponentialRampToValueAtTime(380, t + 0.6);
    v.noise(t, perc(g.gain, t, 0.3, 0.05, 0.55), g, { pink: true });
    thump(v, t, { from: 70, to: 130, glide: 0.12, peak: 0.16, decay: 0.35 });
    // Glow hum: tonic, fifth and octave with a slow tremolo.
    const tonic = tonicAbove(e.music.root, 50), hg = v.gain(), trem = v.gain(1);
    hg.connect(v.out);
    trem.connect(hg);
    const hEnd = swell(hg.gain, t + 0.08, 0.028, 0.4, 0.5, 1.8), lg = v.gain(0.25);
    lg.connect(trem.gain);
    v.osc('sine', 4.2, t, hEnd, lg);
    for (const s of [0, 7, 12]) v.osc('sine', mtof(tonic + s), t, hEnd, trem);
    chime(v, t + 0.22, mtof(tonic + 24), 0.07, { decay: 1.6, index: 0.6 });
  },
  eat(e, o, t) {
    const v = e.sv({ pan: num(o.pan, 0), wet: 0.1 }), base = rand(300, 340);
    [0, 0.15].forEach((d, i) => {
      // "Nom": a resonant low-pass opens and closes over a soft triangle, like a mouth.
      const s = t + d, f = base * (i ? 0.89 : 1), lp = v.filter('lowpass', 350, 5), g = v.gain();
      lp.connect(v.out);
      g.connect(lp);
      lp.frequency.setValueAtTime(350, s);
      lp.frequency.exponentialRampToValueAtTime(1600, s + 0.03);
      lp.frequency.exponentialRampToValueAtTime(380, s + 0.1);
      const osc = v.osc('triangle', f, s, perc(g.gain, s, 0.13, 0.006, 0.11), g);
      osc.frequency.setValueAtTime(f * 1.06, s);
      osc.frequency.exponentialRampToValueAtTime(f, s + 0.05);
    });
  },
  cheer(e, o, t) {
    const v = e.sv({ pan: num(o.pan, 0), wet: 0.3 }), tonic = tonicAbove(e.music.root, 67);
    [0, 4, 7, 12].forEach((s, i) => {
      chime(v, t + i * 0.065, mtof(tonic + s), i === 3 ? 0.1 : 0.12, { decay: i === 3 ? 1 : 0.5, ratio: 2, index: 1.1, octave: 0.1 });
    });
  },
  footstep(e, o, t) {
    const size = clamp(num(o.size, 0.5), 0, 1), f = (220 - 110 * size) * rand(0.92, 1.08);
    const v = e.sv({ pan: num(o.pan, rand(-0.2, 0.2)), wet: 0.05 });
    hiss(v, t, { type: 'lowpass', freq: 700 - 300 * size, q: 0.7, peak: 0.08 + 0.1 * size, attack: 0.004, decay: 0.05 + 0.04 * size, pink: true });
    thump(v, t, { from: f, to: f * 0.6, glide: 0.05, peak: 0.07 + 0.09 * size, decay: 0.07 });
  },
  splash(e, o, t) {
    const v = e.sv({ pan: num(o.pan, rand(-0.3, 0.3)), wet: 0.3 });
    [0, 0.07].forEach((d, i) => {
      const f = rand(500, 700) * (i ? 1.4 : 1); // droplet "bloop": a fast upward glide
      thump(v, t + d, { from: f, to: f * 2.6, glide: 0.045, peak: i ? 0.08 : 0.16, decay: 0.09 });
    });
    hiss(v, t, { type: 'highpass', freq: 3500, peak: 0.03, decay: 0.07 });
  },
};

// ───────────────────────────── stingers ─────────────────────────────

/** A pad chord (semitones above `base`) with a blooming low-pass. Returns the voice. */
function stingPad(e, t, base, semis, { peak = 0.035, attack = 0.3, holdFor = 0.6, release = 1.2, open = 2400 } = {}) {
  const v = e.sv({ wet: 0.45 }), lp = v.filter('lowpass', 700, 0.6), g = v.gain();
  lp.connect(v.out);
  g.connect(lp);
  const end = swell(g.gain, t, peak, attack, holdFor, release);
  lp.frequency.setValueAtTime(700, t);
  lp.frequency.exponentialRampToValueAtTime(open, t + attack + 0.2);
  lp.frequency.exponentialRampToValueAtTime(800, end);
  for (const s of semis) v.osc(e.waves.warm, mtof(base + s), t, end, g).detune.value = rand(-6, 6);
  return v;
}

const STINGERS = {
  lantern(e, t) {
    e.duck(0.35, 2.2);
    const tonic = tonicAbove(e.music.root, 48);
    stingPad(e, t, tonic, [0, 7, 12, 14, 16, 19], { peak: 0.05, attack: 0.7, holdFor: 0.4, release: 2.2, open: 2600 });
    const b = e.sv({ wet: 0.45 });
    chime(b, t + 0.55, mtof(tonic + 24), 0.1, { decay: 2.4, index: 0.8 });
    chime(b, t + 0.62, mtof(tonic + 31), 0.06, { decay: 2, index: 0.6 });
    sparkles(e, t + 0.5, 9, tonic + 36, { spread: 1.4, peak: 0.035 });
  },
  celebrate(e, t) {
    e.duck(0.4, 1.8);
    const tonic = tonicAbove(e.music.root, 60), v = e.sv({ wet: 0.3 }), steps = [0, 4, 7, 12, 16, 19];
    steps.forEach((s, i) => chime(v, t + i * 0.07, mtof(tonic + s), 0.1 + i * 0.006, { decay: 0.9, index: 1, octave: 0.08 }));
    const land = t + steps.length * 0.07 + 0.04, c = e.sv({ wet: 0.35 });
    for (const s of [0, 7, 12, 16]) pluck(c, land, mtof(tonic + s), 0.08, { decay: 1.6, bright: 3000 });
    chime(c, land, mtof(tonic + 24), 0.08, { decay: 1.8 });
    sparkles(e, land, 6, tonic + 24, { spread: 0.6 });
  },
  finale(e, t) {
    e.duck(0.85, 5.5);
    const tonic = tonicAbove(e.music.root, 53), lyd = e.music.mode === 'lydian';
    const chords = [[0, 4, 7], lyd ? [2, 6, 9] : [5, 9, 12], [7, 11, 14], [0, 4, 7]];
    chords.forEach((c, i) => {
      const at = t + i * 0.95, last = i === 3;
      const v = stingPad(e, at, tonic, [-12, ...c, c[0] + 12], last
        ? { peak: 0.05, attack: 0.25, holdFor: 1.3, release: 1.9, open: 3200 }
        : { peak: 0.035, attack: 0.25, holdFor: 0.7, release: 0.8, open: 2200 });
      const roll = [...c, ...c.map((x) => x + 12), c[0] + 24].slice(0, last ? 7 : 5);
      roll.forEach((s, k) => pluck(v, at + k * 0.045, mtof(tonic + 12 + s), 0.07, { decay: 1.1 }));
    });
    // A bell tune over the chords, landing on the third of the home chord.
    const b = e.sv({ wet: 0.4 });
    for (const [d, s] of [[0, 16], [0.48, 19], [0.95, 21], [1.43, 24], [1.9, 23], [2.38, 26], [2.85, 28]]) {
      chime(b, t + d, mtof(tonic + s), 0.1, { decay: d > 2.8 ? 2.6 : 0.9, index: 0.9, octave: 0.1 });
    }
    thump(b, t + 2.85, { from: 80, to: 42, glide: 0.2, peak: 0.22, decay: 1.4 });
    sparkles(e, t + 2.9, 14, 84, { spread: 2, peak: 0.03 });
    SFX.firework(e, { pan: -0.5 }, t + 3.3);
    SFX.firework(e, { pan: 0.5 }, t + 3.9);
  },
  chapter(e, t) {
    e.duck(0.45, 2.8);
    const tonic = tonicAbove(e.music.root, 55);
    const v = stingPad(e, t, tonic, [-12, 0, 7, 14, 16], { peak: 0.03, attack: 0.5, holdFor: 1, release: 1.6, open: 1600 });
    for (let k = 0; k < 5; k++) pluck(v, t + k * 0.05, mtof(pentaNote(tonic + 12, k)), 0.05, { decay: 0.8 });
    for (const [d, s, dec] of [[0.35, 19, 0.9], [0.62, 21, 0.9], [0.9, 24, 1.2], [1.3, 28, 2]]) {
      chime(v, t + d, mtof(tonic + s), 0.09, { decay: dec, ratio: 4, index: 0.7, octave: 0.1 });
    }
  },
};

// ───────────────────────────── babble voices ─────────────────────────────

const VOICES = {
  pip: { f0: 175, formant: 0.95, bright: 2600, gain: 1, rate: 1, breath: 0.04 },
  momo: { f0: 420, formant: 1.25, bright: 3800, gain: 0.8, rate: 1.1, breath: 0.14 },
  nori: { f0: 300, formant: 1.12, bright: 5200, gain: 0.9, rate: 1.12, breath: 0.05 },
  juniper: { f0: 150, formant: 0.88, bright: 2200, gain: 1, rate: 0.86, breath: 0.1, hollow: true, hoo: 0.5, vib: 4.2, vibDepth: 18 },
  bramble: { f0: 370, formant: 1.2, bright: 3400, gain: 0.55, rate: 1.16, breath: 0.1, vib: 7.5, vibDepth: 28 },
  default: { f0: 240, formant: 1.05, bright: 3400, gain: 0.9, rate: 1, breath: 0.06 },
};
const VOWELS = { a: [780, 1250], e: [500, 1850], i: [320, 2250], o: [520, 880], u: [350, 720] };
const CONSONANT = { s: [5200, 0.045, 0.1], p: [1800, 0.015, 0.14], h: [2200, 0.03, 0.06] };
const BABBLE_STEPS = [0, 1, 2, 1, 0, 2, 3, -1];

function hashStr(s) {
  let h = 7;
  for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}
const consonantKind = (ch) => ('sczxj'.includes(ch) ? 's' : 'ptkbdgq'.includes(ch) ? 'p' : 'hf'.includes(ch) ? 'h' : null);

/**
 * Turn text into timed syllables (pure, no audio): one syllable per 1–2 letters (per character for
 * CJK/Hangul), pauses on punctuation, and sentence-final contours (? rises, ! bounces, . settles).
 */
function planBabble(text, spec, rate) {
  const s = text.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase();
  const items = [];
  let word = '';
  const flush = () => {
    for (let i = 0; i < word.length; i += 2) items.push({ kind: 'syl', chunk: word.slice(i, i + 2) });
    word = '';
  };
  for (const ch of s) {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      if (ch.codePointAt(0) >= 0x2e80) { flush(); items.push({ kind: 'syl', chunk: ch }); }
      else word += ch;
      continue;
    }
    flush();
    if (/\s/.test(ch)) items.push({ kind: 'space' });
    else if (',;:、，'.includes(ch)) items.push({ kind: 'pause' });
    else if ('.!?…。！？'.includes(ch)) items.push({ kind: 'end', mark: '?？'.includes(ch) ? '?' : '!！'.includes(ch) ? '!' : '.' });
  }
  flush();

  let sentence = [];
  const close = (mark) => {
    sentence.forEach((it, i) => { it.mark = mark; it.fromEnd = sentence.length - 1 - i; });
    sentence = [];
  };
  for (const it of items) {
    if (it.kind === 'syl') sentence.push(it);
    else if (it.kind === 'end') close(it.mark);
  }
  close('.');

  const beat = 0.074 / (rate * spec.rate), syl = [];
  let t = 0, prev = null;
  for (const it of items) {
    if (it.kind === 'syl') {
      const h = hashStr(it.chunk), vowelCh = [...it.chunk].find((c) => 'aeiouy'.includes(c));
      let vowel = vowelCh ? (vowelCh === 'y' ? 'i' : vowelCh) : 'aeiou'[h % 5];
      if (spec.hoo && (h >>> 3) % 100 < spec.hoo * 100) vowel = h % 2 ? 'u' : 'o';
      let step = BABBLE_STEPS[h % BABBLE_STEPS.length], bend = 0, gain = 1, dur = beat * (vowelCh ? 1 : 0.85);
      if (it.mark === '?' && it.fromEnd < 3) { step = 3 - it.fromEnd; bend = it.fromEnd === 0 ? 3 : 0.5; }
      else if (it.mark === '!') { step += it.fromEnd % 2 ? -1 : 2; gain = 1.15; dur *= 0.9; if (!it.fromEnd) bend = -1.5; }
      else if (it.fromEnd === 0) { step = -1; bend = -2; }
      else if (it.fromEnd === 1) step = Math.min(step, 1);
      syl.push({ t, dur, vowel, cons: consonantKind(it.chunk[0]), step, bend, gain });
      t += dur + beat * 0.2;
    } else if (it.kind === 'space') t += beat * 0.3;
    else if (it.kind === 'pause') t += 0.16 / rate;
    else if (it.kind === 'end' && prev?.kind !== 'end') t += 0.28 / rate;
    prev = it;
  }
  const last = syl[syl.length - 1];
  return { syl, duration: last ? last.t + last.dur : 0 };
}

/**
 * Formant voice: one band-limited "glottal" oscillator feeds two vowel band-passes plus a body
 * low-pass; a noise source adds breath and consonant ticks. Pitches sit on the key's pentatonic.
 */
function speak(e, spec, plan, t0) {
  const v = new Voice(e, e.pools.voice, e.bus.voice.input, { wet: 0.12, wetDest: e.bus.voice.wet });
  const end = t0 + plan.duration + 0.08;
  const env = v.gain(), bright = v.filter('lowpass', spec.bright, 0.6);
  env.connect(v.out);
  bright.connect(env);
  const src = v.osc(spec.hollow ? e.waves.hollow : e.waves.glottal, spec.f0, t0, end);
  const f1 = v.filter('bandpass', 600, 3.5), f2 = v.filter('bandpass', 1500, 5), body = v.filter('lowpass', spec.f0 * 2.2, 0.7);
  for (const [f, level] of [[f1, 1], [f2, 0.55], [body, 0.4]]) {
    const g = v.gain(level);
    src.connect(f);
    f.connect(g);
    g.connect(bright);
  }
  const nf = v.filter('bandpass', 3000, 0.8), tick = v.gain(), breath = v.gain(spec.breath);
  nf.connect(tick);
  tick.connect(v.out);
  nf.connect(breath);
  breath.connect(bright);
  v.noise(t0, end, nf);
  if (spec.vib) {
    const depth = v.gain(spec.vibDepth);
    depth.connect(src.detune);
    v.osc('sine', spec.vib, t0, end, depth);
  }

  const center = 69 + 12 * Math.log2(spec.f0 / 440), tonic = tonicAbove(e.music.root, Math.round(center) - 12);
  const ladder = Array.from({ length: 16 }, (_, i) => pentaNote(tonic, i - 3));
  const c = nearestIndex(ladder, center);
  plan.syl.forEach((s, i) => {
    const at = t0 + s.t, f = mtof(ladder[clamp(c + s.step, 0, ladder.length - 1)]);
    if (i === 0) src.frequency.setValueAtTime(f, at);
    else src.frequency.setTargetAtTime(f, at - 0.008, 0.01); // tiny portamento between syllables
    src.frequency.setTargetAtTime(f * 2 ** (s.bend / 12), at + s.dur * 0.35, s.dur * 0.4);
    const [F1, F2] = VOWELS[s.vowel];
    f1.frequency.setTargetAtTime(Math.max(F1 * spec.formant, f * 1.15), Math.max(t0, at - 0.005), 0.012);
    f2.frequency.setTargetAtTime(F2 * spec.formant, Math.max(t0, at - 0.005), 0.015);
    const pk = 0.5 * spec.gain * s.gain;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(pk, at + Math.min(0.018, s.dur * 0.3));
    env.gain.linearRampToValueAtTime(pk * 0.7, at + s.dur * 0.7);
    env.gain.linearRampToValueAtTime(0, at + s.dur);
    if (s.cons) {
      const [hz, len, amp] = CONSONANT[s.cons];
      nf.frequency.setValueAtTime(hz, at);
      tick.gain.setValueAtTime(0, at);
      tick.gain.linearRampToValueAtTime(amp * spec.gain, at + 0.004);
      tick.gain.linearRampToValueAtTime(0, at + Math.min(len, s.dur * 0.5));
    }
  });
  return v;
}

// ───────────────────────────── engine ─────────────────────────────

export class AudioEngine {
  /**
   * @param {{lowPower?: boolean, context?: BaseAudioContext}} [options]
   *   `context` optionally injects an existing (or Offline) AudioContext, e.g. for tests.
   */
  constructor({ lowPower = false, context = null } = {}) {
    const cores = globalThis.navigator?.hardwareConcurrency;
    this.lowPower = !!lowPower || (typeof cores === 'number' && cores > 0 && cores <= 4);
    this.ctx = null;
    this.enabled = true;
    this.volumes = { music: 0.7, sfx: 0.85, ambience: 0.6, voice: 0.85 };
    this.intensity = 0;
    this.timeOfDay = 'afternoon';
    this._injected = context;
    this._fade = { from: { afternoon: 1 }, to: 'afternoon', t0: 0, dur: 0 };
    this._unlocked = false;
    this._disposed = false;
    this._hidden = false;
    this._offline = false;
    this._timer = null;
    this._suspendTimer = null;
    this._resumeAsked = 0;
    this._babble = null;
    this._duckEnd = 0;
    this._duckDepth = 0;
    this._last = {};
    this._warned = new Set();
    this._onVisibility = () => {
      this._hidden = !!globalThis.document?.hidden;
      this._syncRunState(this._hidden ? 0.08 : 0.4);
    };
  }

  /** True when Web Audio exists in this environment. */
  get available() {
    return !!(this._injected || audioCtor());
  }

  /** Create/resume the AudioContext. Call from a user gesture; safe to call repeatedly. */
  async unlock() {
    if (this._disposed || !this.available) return false;
    try {
      if (!this.ctx) this._build();
      const ctx = this.ctx;
      if (!this._offline) {
        try { // iOS: starting a silent buffer inside the gesture fully unlocks output
          const s = ctx.createBufferSource();
          s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
          s.connect(ctx.destination);
          s.start(0);
        } catch { /* ignore */ }
        if (ctx.state !== 'running' && this.enabled && !this._hidden) await withTimeout(this._resume(), 600);
      }
      if (this._disposed || !this.ctx) return false;
      if (!this._unlocked) this._start();
      this._syncRunState(0.8);
      return this._offline || ctx.state === 'running';
    } catch (err) {
      this._warn('unlock', err);
      return false;
    }
  }

  /** Master on/off with a ~0.3 s fade. While off, music and ambience stop scheduling. */
  setEnabled(on) {
    this.enabled = !!on;
    this._syncRunState(0.3);
  }

  /** Any subset of {music, sfx, ambience, voice}, each 0..1 (perceptual, squared taper). */
  setVolumes(volumes = {}) {
    if (!volumes || typeof volumes !== 'object') return;
    for (const k of Object.keys(this.volumes)) {
      if (typeof volumes[k] === 'number' && Number.isFinite(volumes[k])) this.volumes[k] = clamp(volumes[k], 0, 1);
    }
    this._applyVolumes(0.25);
  }

  /** Crossfade the music palette and ambience beds to a time of day over `seconds`. */
  setTimeOfDay(key, seconds = 4) {
    if (!Object.hasOwn(PALETTES, key) || key === this._fade.to) return;
    const s = clamp(num(seconds, 4), 0, 120);
    this.timeOfDay = key;
    if (!this.ctx) {
      this._fade = { from: { [key]: 1 }, to: key, t0: 0, dur: 0 };
      return;
    }
    const now = this.ctx.currentTime;
    this._fade = { from: this._weights(), to: key, t0: now, dur: s };
    glideTo(this.tone.frequency, PALETTES[key].tone, now, s);
    this.amb.apply(s);
  }

  /** 0..5 (lanterns lit): adds musical layers progressively; entrances land on bar lines. */
  setIntensity(level) {
    this.intensity = clamp(num(level, 0), 0, 5);
    if (!this.ctx) return;
    const now = this.ctx.currentTime, targets = layerTargets(this.intensity);
    for (const k of LAYERS) glideTo(this.layers[k].gain, targets[k], now, 2.5);
  }

  /** One-shot sound effect. Common opts: `pan` (-1..1) and `delay` (seconds). Unknown names are ignored. */
  play(name, opts = {}) {
    if (!this._canPlay() || typeof name !== 'string' || !Object.hasOwn(SFX, name)) return;
    const o = opts && typeof opts === 'object' ? opts : {};
    const now = this.ctx.currentTime, gap = MIN_GAP[name];
    if (gap) {
      if (now - (this._last[name] ?? -1) < gap) return;
      this._last[name] = now;
    }
    try {
      SFX[name](this, o, now + 0.01 + clamp(num(o.delay, 0), 0, 10));
    } catch (err) {
      this._warn(name, err);
    }
  }

  /** Gibberish dialogue voice. Returns the utterance length in seconds (even when silent). */
  babble(character, text, { rate = 1 } = {}) {
    const spec = Object.hasOwn(VOICES, character) ? VOICES[character] : VOICES.default;
    const plan = planBabble(String(text ?? ''), spec, clamp(num(rate, 1), 0.25, 4));
    if (!this._canPlay() || !plan.syl.length) return plan.duration;
    this.stopBabble();
    try {
      this._babble = speak(this, spec, plan, this.ctx.currentTime + 0.03);
    } catch (err) {
      this._warn('babble', err);
    }
    return plan.duration;
  }

  stopBabble() {
    if (!this._babble) return;
    if (this.ctx) this._babble.kill(0.05);
    this._babble = null;
  }

  /** Temporarily lower the music by `amount` (0..1) for `seconds`, then recover. Overlaps merge. */
  duck(amount = 0.5, seconds = 1.5) {
    if (!this.ctx || this._disposed) return;
    const now = this.ctx.currentTime, active = now < this._duckEnd;
    const depth = Math.max(clamp(num(amount, 0.5), 0, 1), active ? this._duckDepth : 0);
    const until = Math.max(now + 0.12, now + clamp(num(seconds, 1.5), 0, 60), active ? this._duckEnd : 0);
    this._duckDepth = depth;
    this._duckEnd = until;
    const p = this.duckNode.gain;
    hold(p, now);
    p.linearRampToValueAtTime(1 - depth, now + 0.12);
    p.setValueAtTime(1 - depth, until);
    p.linearRampToValueAtTime(1, until + 0.9);
  }

  /** Musical stingers in the current key: 'lantern' | 'celebrate' | 'finale' | 'chapter'. */
  stinger(name) {
    if (!this._canPlay() || typeof name !== 'string' || !Object.hasOwn(STINGERS, name)) return;
    try {
      STINGERS[name](this, this.ctx.currentTime + 0.02);
    } catch (err) {
      this._warn(name, err);
    }
  }

  dispose() {
    if (this._disposed) return;
    this.stopBabble();
    this._disposed = true;
    clearInterval(this._timer);
    clearTimeout(this._suspendTimer);
    globalThis.document?.removeEventListener?.('visibilitychange', this._onVisibility);
    const ctx = this.ctx;
    this.ctx = null;
    if (!ctx) return;
    try { this.master.disconnect(); } catch { /* ignore */ }
    if (!this._injected && ctx.state !== 'closed') ctx.close().catch(() => {});
  }

  // ───────── internals ─────────

  _build() {
    const Ctor = audioCtor();
    let ctx = this._injected;
    if (!ctx) {
      try { ctx = new Ctor({ latencyHint: 'interactive' }); } catch { ctx = new Ctor(); }
    }
    this.ctx = ctx;
    const Offline = globalThis.OfflineAudioContext;
    this._offline = typeof Offline === 'function' && ctx instanceof Offline;
    this.hasPanner = typeof ctx.createStereoPanner === 'function';
    const low = this.lowPower;
    this.white = noiseBuffer(ctx, 2, false);
    this.pink = noiseBuffer(ctx, 3, true);
    this.crackle = crackleBuffer(ctx, 1.6);
    this.waves = { warm: makeWave(ctx, 14, 1.9), glottal: makeWave(ctx, 36, 1.15), hollow: makeWave(ctx, 9, 2, true) };
    this.pools = { sfx: voicePool(low ? 14 : 24), music: voicePool(low ? 24 : 40), pad: voicePool(low ? 3 : 6), amb: voicePool(low ? 10 : 18), voice: voicePool(2) };

    // Master: gentle glue compression, then a fast limiter so peaks stay safe.
    this.master = this._g(0);
    const glue = ctx.createDynamicsCompressor(), limit = ctx.createDynamicsCompressor();
    Object.entries({ threshold: -18, knee: 12, ratio: 2.5, attack: 0.01, release: 0.3 }).forEach(([k, x]) => (glue[k].value = x));
    Object.entries({ threshold: -3, knee: 0, ratio: 20, attack: 0.002, release: 0.12 }).forEach(([k, x]) => (limit[k].value = x));
    // Final safety: a soft clipper that is transparent below -3 dBFS and rounds off anything the
    // limiter's attack lets through, so output never hard-clips.
    const clip = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1, a = Math.abs(x), knee = 0.7;
      curve[i] = Math.sign(x) * (a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
    }
    clip.curve = curve;
    this.mix = this._g(1.1);
    this._chain(this.mix, glue, limit, clip, this.master);
    this.master.connect(ctx.destination);

    // One shared reverb, trimmed to keep it warm and unmuddy.
    this.reverbIn = this._g(1);
    const conv = ctx.createConvolver();
    conv.buffer = impulseResponse(ctx, low ? 1.5 : 2.2);
    const rhp = this._f('highpass', 220, 0.5), rlp = this._f('lowpass', 5200, 0.5);
    this.reverbIn.connect(conv);
    conv.connect(rhp);
    rhp.connect(rlp);
    rlp.connect(this.mix);

    this.bus = { music: this._bus(0.28, 1), sfx: this._bus(0.2, 1.2), amb: this._bus(0.2, 0.75), voice: this._bus(0.1, 0.55) };
    this.duckNode = this._g(1);
    this.tone = this._f('lowpass', PALETTES[this._fade.to].tone, 0.5);
    this.tone.connect(this.duckNode);
    this.duckNode.connect(this.bus.music.input);
    const targets = layerTargets(this.intensity);
    this.layers = {};
    for (const k of LAYERS) {
      this.layers[k] = this._g(targets[k]);
      this.layers[k].connect(this.tone);
    }
    this._fade = { from: { [this._fade.to]: 1 }, to: this._fade.to, t0: 0, dur: 0 };
    this.music = new Music(this);
    this.amb = new Ambience(this);
    globalThis.document?.addEventListener?.('visibilitychange', this._onVisibility);
    this._hidden = !!globalThis.document?.hidden;
  }

  _start() {
    this._unlocked = true;
    const now = this.ctx.currentTime;
    this._clockT = now;
    this._clockWall = Date.now();
    this.music.nextTime = now + 0.15;
    this._applyVolumes(0.05);
    this.amb.apply(2.5);
    if (!this._offline) this._timer = setInterval(() => this._tick(), TICK_MS);
  }

  _tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.enabled || this._hidden || !this._clockAlive()) return;
    this._pump(ctx.currentTime + LOOKAHEAD, ctx.currentTime);
  }

  /** Schedule music and ambience up to `horizon` (exposed for offline rendering/tests). */
  _pump(horizon, now) {
    if (!this.ctx) return;
    try {
      this.music.pump(horizon, now);
      if (this.volumes.ambience > 0.001) this.amb.pump(horizon, now);
    } catch (err) {
      this._warn('scheduler', err);
    }
  }

  _syncRunState(fade) {
    const ctx = this.ctx;
    if (!ctx || this._disposed || !this._unlocked) return;
    const on = this.enabled && !this._hidden, now = ctx.currentTime;
    glideTo(this.master.gain, on ? 1 : 0, now, fade);
    clearTimeout(this._suspendTimer);
    if (on) {
      if (!this._offline && ctx.state !== 'running') this._resume();
      this.music.resync(now);
      this.amb.resync();
      return;
    }
    this.stopBabble();
    if (this._offline) return;
    this._suspendTimer = setTimeout(() => {
      if (!(this.enabled && !this._hidden) && this.ctx === ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    }, (fade + 0.15) * 1000);
  }

  _applyVolumes(fade) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, b = this.bus;
    for (const [k, bus] of [['music', b.music], ['sfx', b.sfx], ['ambience', b.amb], ['voice', b.voice]]) {
      const g = bus.trim * this.volumes[k] ** 2;
      glideTo(bus.vol.gain, g, now, fade);
      glideTo(bus.wetVol.gain, g, now, fade);
    }
  }

  /** Current palette weights (sum to 1) along the time-of-day crossfade. */
  _weights() {
    const f = this._fade, now = this.ctx ? this.ctx.currentTime : 0;
    const p = f.dur > 0 ? clamp((now - f.t0) / f.dur, 0, 1) : 1, w = {};
    for (const k of TIMES) w[k] = (f.from[k] || 0) * (1 - p) + (k === f.to ? p : 0);
    return w;
  }

  /**
   * Only schedule into a context whose clock is really moving (or that was asked to resume a moment
   * ago, so "unlock + play" in one click works). A blocked or frozen context would otherwise queue
   * every request and release them all at once later.
   */
  _canPlay() {
    if (!this.ctx || !this._unlocked || !this.enabled || this._hidden || this._disposed) return false;
    if (this._offline) return true;
    return (this.ctx.state === 'running' && this._clockAlive()) || Date.now() - this._resumeAsked < 250;
  }

  _clockAlive() {
    const t = this.ctx.currentTime, now = Date.now();
    if (t !== this._clockT) {
      this._clockT = t;
      this._clockWall = now;
    }
    return now - this._clockWall < 300;
  }

  _resume() {
    this._resumeAsked = Date.now();
    return this.ctx.resume().catch(() => {});
  }

  _musicAudible() {
    return this.enabled && this.volumes.music > 0.001;
  }

  /** An SFX voice on the sfx bus (with its extra reverb send). */
  sv(opts = {}) {
    return new Voice(this, this.pools.sfx, this.bus.sfx.input, { wetDest: this.bus.sfx.wet, ...opts });
  }

  _bus(send, trim) {
    const input = this._g(1), vol = this._g(0), wet = this._g(1), wetVol = this._g(0), sendGain = this._g(send);
    input.connect(vol);
    vol.connect(this.mix);
    vol.connect(sendGain);
    sendGain.connect(this.reverbIn);
    wet.connect(wetVol);
    wetVol.connect(this.reverbIn);
    return { input, vol, wet, wetVol, trim };
  }

  _g(value = 1) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }

  _f(type, freq, q = 0.707) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  _lfo(hz, depth, param) {
    const o = this.ctx.createOscillator(), g = this._g(depth);
    o.frequency.value = hz;
    o.connect(g);
    g.connect(param);
    o.start();
    return o;
  }

  _loop(buf, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  /** Connect nodes in series; returns the last one. */
  _chain(...nodes) {
    for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]);
    return nodes[nodes.length - 1];
  }

  _pan(base = 0, hz = 0, depth = 0) {
    if (!this.hasPanner) return this._g(1);
    const p = this.ctx.createStereoPanner();
    p.pan.value = base;
    if (hz) this._lfo(hz, depth, p.pan);
    return p;
  }

  _warn(tag, err) {
    if (this._warned.has(tag)) return;
    this._warned.add(tag);
    globalThis.console?.warn?.(`[audio] ${tag} failed:`, err);
  }
}

export default AudioEngine;
