// Life that belongs to the hour, for the light 2.5D stage: swallows and drifting dandelion seeds in
// the afternoon, dragonflies and petals at golden hour, a V of birds going home at sunset, moths
// circling the lit lanterns at dusk, and fireflies that slowly fall into step at night.
//
// Everything is a few small pictures baked once and drawn with one setTransform each, moved by a few
// lines of maths per frame (lightweight-game-objects skill). It projects its own world points through
// the bake camera (manifest viewProj), so it needs nothing from the stage but the manifest, the
// lanterns' lit levels and the camera view. Seeded RNG, accumulated phases, shortest-angle turns,
// clamped dt by the caller, pools allocated up front (nothing per frame), `quiet` fades it all out.

const TAU = Math.PI * 2, SIDES = [-1, 1];
const approach = (a, b, dt, half) => b + (a - b) * Math.pow(2, -dt / half);
const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Smooth 1D value noise in 0..1 (quintic fade), for gusts. */
function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * f * (f * (f * 6 - 15) + 10);
  const h = n => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  return h(i) + (h(i + 1) - h(i)) * u;
}
/** Paint once at `scale` px per world unit (sprite sizes below are in world units). */
function bake(w, h, paint, scale = 160) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * scale)); c.height = Math.max(1, Math.ceil(h * scale));
  const g = c.getContext('2d');
  if (!g) return c; // out of canvas memory: an empty sprite, never a crash
  g.scale(scale, scale); paint(g, w, h);
  return c;
}

// Which families live at which hour (0..1). Each fades toward its target over a couple of seconds.
const HOURS = {
  afternoon: {swallows: 1, seeds: 1, dragonflies: 0.3, petals: 0, vee: 0, moths: 0, fireflies: 0},
  golden: {swallows: 0.5, seeds: 0.3, dragonflies: 1, petals: 1, vee: 0, moths: 0, fireflies: 0},
  sunset: {swallows: 0, seeds: 0, dragonflies: 0.4, petals: 0.5, vee: 1, moths: 0, fireflies: 0.2},
  dusk: {swallows: 0, seeds: 0, dragonflies: 0, petals: 0, vee: 0.4, moths: 1, fireflies: 0.6},
  night: {swallows: 0, seeds: 0, dragonflies: 0, petals: 0, vee: 0, moths: 1, fireflies: 1},
};
const FAMILIES = Object.keys(HOURS.afternoon);

// ---------------------------------------------------------------------------- sprites (sizes in world units)
function swallowSprite() { // top view, head toward +x, wings along y; drawn scaled per flap
  return {
    body: bake(0.34, 0.12, (g, w, h) => {
      g.fillStyle = '#1d2a4a';
      g.beginPath(); g.moveTo(w, h / 2); g.quadraticCurveTo(w * 0.7, 0, w * 0.32, h * 0.32); g.lineTo(0, 0); g.lineTo(w * 0.2, h / 2); g.lineTo(0, h); g.lineTo(w * 0.32, h * 0.68); g.quadraticCurveTo(w * 0.7, h, w, h / 2); g.fill();
      g.fillStyle = '#f3ead8'; g.beginPath(); g.ellipse(w * 0.66, h / 2, w * 0.14, h * 0.16, 0, 0, TAU); g.fill(); // pale throat
    }),
    wing: bake(0.18, 0.6, (g, w, h) => { // one scythe wing: root at the centre, leading edge toward +x, tip toward -y
      const c = h / 2;
      g.fillStyle = '#25345a'; g.beginPath(); g.moveTo(w * 0.78, c); g.quadraticCurveTo(w * 0.72, c * 0.35, w * 0.12, h * 0.02);
      g.quadraticCurveTo(w * 0.3, c * 0.55, w * 0.18, c); g.closePath(); g.fill();
    }),
  };
}
function seedSprite() { // a dandelion parachute; a soft dark under-stroke keeps it readable on the cream cloth
  return bake(0.24, 0.24, (g, w) => {
    const c = w / 2, ray = (style, width) => {
      g.strokeStyle = style; g.lineWidth = width;
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * c * 0.88, c + Math.sin(a) * c * 0.88); g.stroke(); }
    };
    ray('rgba(70,60,80,0.28)', w * 0.06); ray('rgba(255,255,255,0.95)', w * 0.028);
    g.fillStyle = '#9c7f52'; g.beginPath(); g.arc(c, c, w * 0.07, 0, TAU); g.fill();
  });
}
function petalSprite([fill, rim]) { // a notched blossom petal with a deeper base and a sheen
  return bake(0.36, 0.24, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, rim); grd.addColorStop(0.45, fill); grd.addColorStop(1, fill);
    g.beginPath(); g.moveTo(w * 0.04, h / 2); g.bezierCurveTo(w * 0.3, h * 0.02, w * 0.8, h * 0.02, w * 0.97, h * 0.3);
    g.lineTo(w * 0.86, h / 2); g.lineTo(w * 0.97, h * 0.7); g.bezierCurveTo(w * 0.8, h * 0.98, w * 0.3, h * 0.98, w * 0.04, h / 2);
    g.fillStyle = grd; g.fill(); g.strokeStyle = rim; g.lineWidth = h * 0.07; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(w * 0.55, h * 0.36, w * 0.18, h * 0.1, 0.1, 0, TAU); g.fill();
  });
}
function dragonflySprite(color) {
  return {
    body: bake(0.46, 0.08, (g, w, h) => { // head toward +x: a slim banded abdomen, a fat thorax, big eyes
      g.fillStyle = color; g.beginPath(); g.ellipse(w * 0.4, h / 2, w * 0.4, h * 0.22, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(10,30,50,0.45)'; for (let i = 1; i < 6; i++) g.fillRect(w * (0.08 + i * 0.1), h * 0.28, w * 0.025, h * 0.44);
      g.fillStyle = color; g.beginPath(); g.ellipse(w * 0.8, h / 2, w * 0.1, h * 0.36, 0, 0, TAU); g.fill();
      g.fillStyle = '#0f2f45'; g.beginPath(); g.arc(w * 0.93, h * 0.3, h * 0.24, 0, TAU); g.arc(w * 0.93, h * 0.7, h * 0.24, 0, TAU); g.fill();
    }),
    wing: bake(0.08, 0.5, (g, w, h) => { // root at the centre, tip toward -y; clear with a bright vein edge
      g.fillStyle = 'rgba(230,248,255,0.5)'; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = w * 0.07;
      g.beginPath(); g.ellipse(w / 2, h * 0.26, w * 0.42, h * 0.235, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(40,60,80,0.6)'; g.beginPath(); g.arc(w / 2, h * 0.07, w * 0.16, 0, TAU); g.fill(); // the dark wing-tip spot
    }),
  };
}
function mothSprite() { // dark wings with a lamp-lit rim: they read against the glow, where pale moths vanished
  return bake(0.26, 0.2, (g, w, h) => {
    g.fillStyle = '#5e4c3c'; g.strokeStyle = '#ffd994'; g.lineWidth = h * 0.06;
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(w / 2 + s * w * 0.22, h * 0.45, w * 0.22, h * 0.34, s * 0.5, 0, TAU); g.fill(); g.stroke(); }
    g.fillStyle = '#3a2e24'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.06, h * 0.32, 0, 0, TAU); g.fill();
  });
}
function glowSprite(rgb) {
  return bake(0.4, 0.4, (g, w) => {
    const r = w / 2, grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, 'rgba(255,255,235,1)'); grd.addColorStop(0.1, `rgba(${rgb},0.95)`); grd.addColorStop(0.32, `rgba(${rgb},0.3)`); grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  }, 120);
}

// ---------------------------------------------------------------------------- the life of the hours
export class HourLife {
  constructor({seed = 7, budget = 1} = {}) {
    this.rng = mulberry32(seed); this.budget = budget; this.time = 0; this.hour = 'afternoon';
    this.w = Object.fromEntries(FAMILIES.map(f => [f, 0]));
    this.target = {...HOURS.afternoon};
    this.p = {x: 0, y: 0}; this.q = {x: 0, y: 0}; this.r = {x: 0, y: 0}; // projection scratch
    this.sprite = this.drawSprite.bind(this);
    const r = this.rng;
    this.sprites = {swallow: swallowSprite(), seed: seedSprite(), petals: [['#ff8db4', '#e0507e'], ['#ffb26b', '#e07a32'], ['#ffe1ec', '#f08aab']].map(petalSprite),
      dragon: [dragonflySprite('#2fb5c9'), dragonflySprite('#e0643a')], moth: mothSprite(), glow: glowSprite('232,255,140'), warm: glowSprite('255,214,150')};
    const n = k => Math.max(1, Math.round(k * budget));
    this.swallows = Array.from({length: n(4)}, () => ({on: false, x: 0, y: 0, z: 0, speed: 0, heading: 0, bank: 0, flap: r() * TAU, glide: 0, alpha: 0}));
    this.vee = Array.from({length: 7}, (_, i) => ({i, flap: i * 0.35, x: 0, y: 0, z: 0}));
    this.veeState = {on: false, x: 0, z: 0, dir: 1, t: 0, next: 3};
    this.seeds = Array.from({length: n(12)}, () => ({x: 0, y: 0, z: 0, life: 0, max: 1, spin: r() * TAU, rate: 0.5 + r()}));
    this.petals = Array.from({length: n(10)}, (_, i) => ({x: 0, y: 0, z: 0, life: 0, max: 1, spin: r() * TAU, flip: r() * TAU, look: i % 3}));
    this.dragons = Array.from({length: n(3)}, (_, i) => ({x: 0, y: 0, z: 0, fx: 0, fz: 0, tx: 0, tz: 0, heading: 0, bank: 0, dart: 0, wait: r() * 2, look: i % 2, wing: r() * TAU}));
    this.litIndex = new Int8Array(8);
    this.moths = Array.from({length: n(10)}, () => ({lantern: -1, a: r() * TAU, rate: (0.9 + r() * 1.3) * (r() < 0.5 ? -1 : 1), r: 0.32 + r() * 0.25, bob: r() * TAU, flap: r() * TAU}));
    this.flies = Array.from({length: n(40)}, () => ({x: 0, y: 0, z: 0, ph: r(), period: 1.7 + r() * 0.8, flash: 0, seed: r() * 100, ox: 0, oz: 0}));
  }

  /** A new baked layout: its camera, board and anchors. */
  layout(m) {
    this.m = m; const W = m.frame.width, D = m.frame.depth, a = m.anchors;
    this.W = W; this.D = D;
    // the bake exports the water as m.pond {centre, rx, rz, waterY}; older manifests only have the pond's origin
    const centre = m.pond?.centre?.world || a.pond?.world;
    this.pond = {x: centre?.[0] ?? -W / 2 - 2, z: centre?.[2] ?? D / 3, rx: (m.pond?.rx ?? 1.1) * 1.15, rz: (m.pond?.rz ?? 0.85) * 1.15, y: m.pond?.waterY ?? 0.05};
    this.lanterns = (a.lanterns || []).map(l => ({x: l.origin.world[0], y: l.origin.world[1], z: l.origin.world[2]}));
    // the band the island floats in: a margin around the board, for fireflies and seeds
    this.island = {x0: -W / 2 - 2.2, x1: W / 2 + 2.2, z0: -D / 2 - 2.2, z1: D / 2 + 1.6};
    const r = this.rng;
    for (const f of this.flies) { // fireflies live off the cloth: over the grass and bushes around it
      do { f.ox = this.island.x0 + r() * (this.island.x1 - this.island.x0); f.oz = this.island.z0 + r() * (this.island.z1 - this.island.z0); }
      while (Math.abs(f.ox) < W / 2 + 0.3 && Math.abs(f.oz) < D / 2 + 0.3);
    }
    for (const s of this.seeds) s.life = s.max; // respawn in the new world
    for (const p of this.petals) p.life = p.max;
    for (const d of this.dragons) this.dragonHome(d, true);
    for (const s of this.swallows) s.on = false;
    this.veeState.on = false;
  }

  /** The hour changed (or the story restarted): families cross-fade over a couple of seconds. */
  setHour(key) {
    this.hour = key; this.target = {...(HOURS[key] || HOURS.afternoon)};
    if (this.target.vee > 0.5) this.veeState.next = 2.5 + this.rng() * 2; // the first V comes soon after the light turns
  }

  project(x, y, z, out) {
    const m = this.m.camera.viewProj, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    out.x = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * this.m.image.w;
    out.y = (-(m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5 + 0.5) * this.m.image.h;
    return out;
  }
  /** Image px per world unit around a world point. */
  unit(x, y, z) { const a = this.project(x - 0.5, y, z, this.p), ax = a.x, ay = a.y, b = this.project(x + 0.5, y, z, this.q); return Math.hypot(b.x - ax, b.y - ay); }

  dragonHome(d, snap) {
    const r = this.rng, a = r() * TAU, k = 0.75 + r() * 0.45, P = this.pond;
    d.tx = P.x + Math.cos(a) * P.rx * k; d.tz = P.z + Math.sin(a) * P.rz * k;
    if (snap) { d.x = d.tx; d.z = d.tz; d.y = P.y + 0.55; d.fx = d.x; d.fz = d.z; }
  }

  /** Seeds or petals: carried by gusts that travel across the meadow, sinking slowly. */
  drift(list, petals, weight, dt, t, wind) {
    const r = this.rng;
    for (const s of list) {
      s.life += dt;
      if (s.life >= s.max) {
        if (weight < 0.05 || r() > weight) { s.life = s.max; continue; }
        s.x = this.island.x0 - 1 + r() * (this.island.x1 - this.island.x0) * 0.6; s.z = this.island.z0 + r() * (this.island.z1 - this.island.z0); s.y = 1.5 + r() * 2.5;
        s.life = 0; s.max = 9 + r() * 6;
      }
      const gust = Math.max(0, noise1((s.x - t * 1.2) * 0.25 + s.spin) * 2 - 0.6);
      s.x += (wind + gust) * (petals ? 1.1 : 0.8) * dt;
      s.z += Math.sin(t * 0.6 + s.spin) * 0.12 * dt;
      s.y += (Math.sin(t * 1.3 + s.spin * 3) * 0.25 - (petals ? 0.12 : 0.06) + gust * 0.3) * dt;
      s.spin += dt * (petals ? 2.4 : 0.4); if (petals) s.flip += dt * 3.1;
      if (s.x > this.island.x1 + 1 || s.y < 0.15) s.life = s.max;
    }
  }

  update(dt, quiet = false, lit = null) {
    if (!this.m) return;
    this.time += dt; const t = this.time, r = this.rng;
    for (const f of FAMILIES) this.w[f] = approach(this.w[f], quiet ? 0 : this.target[f], dt, 0.9);
    const wind = 0.35 + noise1(t * 0.07) * 0.5; // the whole meadow shares one slow breeze

    // swallows: pairs crossing above the trees on curving paths, flapping in bursts and gliding, banking into turns
    if (this.w.swallows > 0.05) for (const s of this.swallows) {
      if (!s.on) {
        if (r() < dt * 0.25 * this.w.swallows) {
          // skimming low across the meadow and the cloth, the way swallows hunt
          const dir = r() < 0.5 ? 1 : -1; s.on = true; s.x = -dir * (this.W / 2 + 4); s.z = -this.D / 2 + r() * this.D; s.y = 1.7 + r() * 0.9;
          s.heading = dir > 0 ? 0 : Math.PI; s.speed = 3.2 + r() * 1.4; s.alpha = 0;
        }
        continue;
      }
      const prev = s.heading;
      s.heading += Math.sin(t * 0.9 + s.flap) * 0.9 * dt;                 // sweeping arcs
      s.x += Math.cos(s.heading) * s.speed * dt; s.z += Math.sin(s.heading) * s.speed * dt * 0.35;
      s.bank = approach(s.bank, Math.max(-0.7, Math.min(0.7, turn(prev, s.heading) / Math.max(dt, 1e-3) * 0.5)), dt, 0.15);
      s.glide -= dt; if (s.glide < -0.9 - r() * 0.4) s.glide = 0.5 + r() * 0.7;    // bursts of flapping, then glides
      if (s.glide <= 0) s.flap += dt * 22;
      s.alpha = Math.min(1, s.alpha + dt * 2);
      if (Math.abs(s.x) > this.W / 2 + 5) s.on = false;
    }
    // a V of birds going home: slow, steady, wingbeats rippling back along the arms
    const V = this.veeState;
    if (!V.on && this.w.vee > 0.5 && (V.next -= dt) <= 0) { V.on = true; V.dir = r() < 0.5 ? 1 : -1; V.x = -V.dir * (this.W / 2 + 6); V.z = -this.D / 2 + 0.4 + r() * 0.8; V.t = 0; } // over the far rows of the cloth: dark birds read on it, and only now and then
    if (V.on) { V.x += V.dir * 1.6 * dt; V.t += dt; if (Math.abs(V.x) > this.W / 2 + 7) { V.on = false; V.next = 25 + r() * 15; } for (const b of this.vee) b.flap += dt * 7; }

    // dandelion seeds and petals: carried by gusts that travel across the meadow, sinking slowly
    this.drift(this.seeds, false, this.w.seeds, dt, t, wind);
    this.drift(this.petals, true, this.w.petals, dt, t, wind);

    // dragonflies: hover, then dart to a new spot on the pond rim, banking through the turn
    for (const d of this.dragons) {
      d.wing += dt * 40;
      if (d.dart > 0) {
        d.dart = Math.max(0, d.dart - dt / 0.32);
        const k = 1 - d.dart, e = k * k * (3 - 2 * k), px = d.x;
        d.x = d.fx + (d.tx - d.fx) * e; d.z = d.fz + (d.tz - d.fz) * e;
        d.bank = approach(d.bank, Math.max(-0.6, Math.min(0.6, (d.x - px) / Math.max(dt, 1e-3) * 0.08)), dt, 0.05);
      } else {
        d.wait -= dt; d.bank = approach(d.bank, 0, dt, 0.2);
        d.y = this.pond.y + 0.55 + Math.sin(t * 2.3 + d.wing) * 0.05; // a hover that never quite holds still (x jitter is added when drawn)
        if (d.wait <= 0) {
          d.fx = d.x; d.fz = d.z; this.dragonHome(d, false);
          const want = Math.atan2(d.tz - d.z, d.tx - d.x); d.heading = want; d.dart = 1; d.wait = 0.6 + r() * 2.2;
        }
      }
    }
    // moths: circling whichever lanterns are lit, wobbling in and out of the light
    let count = 0;
    if (lit) for (let i = 0; i < this.lanterns.length && i < this.litIndex.length; i++) if ((lit[i]?.lit ?? 0) > 0.5) this.litIndex[count++] = i;
    for (let k = 0; k < this.moths.length; k++) {
      const mth = this.moths[k];
      mth.lantern = count ? this.litIndex[k % count] : -1; // shared out among the lit lanterns
      mth.a += mth.rate * dt; mth.bob += dt * 1.7; mth.flap += dt * 28;
    }
    // fireflies: pulse-coupled clocks; each flash nudges near ones forward, so a meadow slowly falls into step
    if (this.w.fireflies > 0.02) {
      for (const f of this.flies) {
        f.ph += dt / f.period; f.flash = Math.max(0, f.flash - dt * 2.6);
        f.x = f.ox + Math.sin(t * 0.31 + f.seed) * 0.5 + Math.sin(t * 0.83 + f.seed * 2) * 0.15;
        f.z = f.oz + Math.cos(t * 0.27 + f.seed * 3) * 0.4;
        f.y = 0.5 + Math.sin(t * 0.5 + f.seed) * 0.35 + 0.35;
        if (f.ph >= 1) {
          f.ph -= 1; f.flash = 1;
          for (const o of this.flies) if (o !== f && Math.abs(o.ox - f.ox) + Math.abs(o.oz - f.oz) < 3.5) o.ph = Math.min(0.999, o.ph + 0.035);
        }
      }
    }
  }

  /** One sprite of world-unit size wu x hu, drawn about its centre (bound once in the constructor: no closure per frame). */
  drawSprite(img, wu, hu, x, y, z, rot, sx, sy, alpha) {
    const ctx = this.ctx, view = this.view, dpr = this.dpr, s = view.s, P = this.r; // its own scratch: unit() uses p and q
    const k = this.unit(x, y, z) * s * dpr, c = Math.cos(rot), sn = Math.sin(rot);
    this.project(x, y, z, P);
    const px = (P.x * s + view.x) * dpr, py = (P.y * s + view.y) * dpr;
    ctx.globalAlpha = alpha; ctx.setTransform(c * sx, sn * sx, -sn * sy, c * sy, px, py);
    ctx.drawImage(img, -wu * k / 2, -hu * k / 2, wu * k, hu * k);
  }

  draw(ctx, view, dpr = 1) {
    if (!this.m) return;
    const t = this.time;
    if (this.w.seeds + this.w.petals + this.w.dragonflies + this.w.swallows + this.w.vee + this.w.moths + this.w.fireflies < 0.02) return;
    this.ctx = ctx; this.view = view; this.dpr = dpr;
    const sprite = this.sprite;
    // seeds and petals drift in the air
    if (this.w.seeds > 0.02) for (const sd of this.seeds) if (sd.life < sd.max) {
      const fade = Math.min(1, sd.life, sd.max - sd.life) * this.w.seeds;
      sprite(this.sprites.seed, 0.24, 0.24, sd.x, sd.y, sd.z, sd.spin, 1, 1, fade * 0.9);
    }
    if (this.w.petals > 0.02) for (const pt of this.petals) if (pt.life < pt.max) {
      const fade = Math.min(1, pt.life, pt.max - pt.life) * this.w.petals;
      sprite(this.sprites.petals[pt.look], 0.36, 0.24, pt.x, pt.y, pt.z, pt.spin, Math.cos(pt.flip), 1, fade);
    }
    // dragonflies over the pond rim
    if (this.w.dragonflies > 0.02) for (const d of this.dragons) {
      const look = this.sprites.dragon[d.look], a = this.w.dragonflies, jx = d.dart > 0 ? 0 : Math.sin(t * 7 + d.wing) * 0.025;
      const wing = 0.65 + 0.35 * Math.abs(Math.sin(d.wing)); // a shimmer, not a flap: real dragonfly wings blur
      for (const side of SIDES) for (let k = 0; k < 2; k++) { // fore pair swept forward, hind pair back, both rooted at the thorax
        const off = k ? 0.06 : 0.12, wx = d.x + jx + Math.cos(d.heading) * off, wz = d.z + Math.sin(d.heading) * off;
        sprite(look.wing, 0.08, 0.5, wx, d.y, wz, d.heading + side * (k ? 0.18 : -0.12), 1, -side * wing * (1 - d.bank * side * 0.4), a * 0.85);
      }
      sprite(look.body, 0.46, 0.08, d.x + jx, d.y, d.z, d.heading, 1, 1, a);
    }
    // swallows above the trees
    if (this.w.swallows > 0.02) for (const sw of this.swallows) if (sw.on) {
      const span = sw.glide > 0 ? 1 : 0.35 + 0.65 * Math.abs(Math.cos(sw.flap)), a = sw.alpha * this.w.swallows, h = sw.heading;
      for (const side of SIDES) sprite(this.sprites.swallow.wing, 0.18, 0.6, sw.x + Math.cos(h) * 0.03, sw.y, sw.z + Math.sin(h) * 0.03, h, 1, -side * span * (1 - sw.bank * side * 0.5), a);
      sprite(this.sprites.swallow.body, 0.34, 0.12, sw.x, sw.y, sw.z, h, 1, 1 - Math.abs(sw.bank) * 0.4, a);
    }
    // the V going home
    const V = this.veeState;
    if (V.on && this.w.vee > 0.02) for (const b of this.vee) {
      const arm = b.i === 0 ? 0 : Math.ceil(b.i / 2), side = b.i % 2 ? 1 : -1;
      const x = V.x - V.dir * arm * 0.55, z = V.z + side * arm * 0.4, y = 3 + Math.sin(V.t * 0.6) * 0.15;
      const span = 0.35 + 0.65 * Math.abs(Math.cos(b.flap - arm * 0.6)), h = V.dir > 0 ? 0 : Math.PI, a = Math.min(1, V.t) * this.w.vee * 0.9;
      for (const sd of SIDES) sprite(this.sprites.swallow.wing, 0.18, 0.6, x, y, z, h, 1, -sd * span, a);
      sprite(this.sprites.swallow.body, 0.34, 0.12, x, y, z, h, 1, 1, a);
    }
    // moths around lit lanterns, catching the light
    if (this.w.moths > 0.02) for (const mth of this.moths) {
      if (mth.lantern < 0) continue;
      const L = this.lanterns[mth.lantern]; if (!L) continue;
      const rr = mth.r + Math.sin(mth.bob) * 0.08, x = L.x + Math.cos(mth.a) * rr, z = L.z + Math.sin(mth.a) * rr * 0.6, y = L.y + 0.1 + Math.sin(mth.bob * 1.3) * 0.12;
      const span = 0.4 + 0.6 * Math.abs(Math.sin(mth.flap));
      sprite(this.sprites.moth, 0.2, 0.16, x, y, z, Math.sin(mth.a) * 0.4, span, 1, 0.9 * this.w.moths);
    }
    // fireflies: one additive glow each, bright only in the flash
    if (this.w.fireflies > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      for (const f of this.flies) {
        const b = f.flash * f.flash, k = 0.45 + b * 0.75, alpha = (0.16 + 0.84 * b) * this.w.fireflies;
        if (alpha > 0.03) sprite(this.sprites.glow, 0.4, 0.4, f.x, f.y, f.z, 0, k, k, alpha);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
