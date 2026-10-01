// Small living details that both stages share: koi in the pond and butterflies over the flowers.
//
// One list of creatures, two drawers (lightweight-game-objects skill). PondLife and Meadow are plain
// simulations in world units, so the 3D clearing (lantern-life3d.js, the Blender critters.glb) and
// the light 2.5D stage (Life2D below, a few baked shapes) show the same fish doing the same things,
// and the tests read one state. The motion is a few multiplies per creature: steering with a turn
// limit, accumulated phases for the tail and the wings, seeded randomness, nothing allocated per frame.
import {approach, clamp, random} from './engine/tween.js';

const TAU = Math.PI * 2, SIDES = [1, -1];
const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// The species, as built by art/blender/build_critters.py (lengths from critters.json). Saturated
// orange, gold and red: a cream koi disappears against the teal pond at the size a phone shows it.
export const FISH = [
  {id: 'koi_flame', length: 0.681, body: '#ff6a1a', patch: '#ffd23a', fin: '#ffc48a'},
  {id: 'koi_gold', length: 0.681, body: '#ffc21f', patch: '#f0381a', fin: '#ffe2a6'},
  {id: 'goldfish', length: 0.523, body: '#ff7a1a', patch: '#ffd25a', fin: '#ffb15a'},
];
/** Koi keep room: they steer off a fish nearer than REACH body lengths, and never come nearer than APART (centre to centre). */
const REACH = 1.0, APART = 0.6;
export const WINGS = ['#ffa8d2', '#ffe066', '#8fd3ff', '#ffb067'];
// butterflies belong to the bright hours; the dragonflies, moths and fireflies of HourLife take over later
const DAY = {afternoon: 1, golden: 0.8, sunset: 0.35, dusk: 0, night: 0};

// ---------------------------------------------------------------------------- the pond
export class PondLife {
  constructor({seed = 11, budget = 1} = {}) {
    this.rand = random(seed);
    this.count = Math.max(3, Math.round(5 * budget));
    this.fish = []; this.ripples = Array.from({length: 6}, () => ({x: 0, z: 0, age: 1, life: 1, size: 1}));
    this.pond = null; this.time = 0; this.events = 0;
  }
  /** The water: an ellipse on the plane y (world units). Fish keep their places across layouts as fractions. */
  setPond({x, y, z, rx, rz}) {
    const old = this.pond, r = this.rand;
    this.pond = {x, y, z, rx, rz};
    // a fish a quarter of the pond across reads as a fish on a phone; smaller ones become orange specks
    const size = 0.44 * Math.min(rx, rz / 0.68);
    if (!this.fish.length) {
      for (let i = 0; i < this.count; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.6, kind = i % FISH.length, beat = r() * TAU;
        this.fish.push({kind, u: Math.cos(a) * d, v: Math.sin(a) * d, x: 0, z: 0, heading: r() * TAU, speed: 0, cruise: 0.22 + r() * 0.12,
          goal: {x: 0, z: 0}, goalT: 0, away: 0, state: 'swim', t: 0, beat, amp: 0.42, wag: Math.sin(beat) * 0.42, scale: 0, sink: 0.035 + r() * 0.03, bob: r() * TAU});
      }
    }
    for (const f of this.fish) {
      if (old) { f.u = (f.x - old.x) / old.rx; f.v = (f.z - old.z) / old.rz; }
      f.x = x + f.u * rx; f.z = z + f.v * rz;
      f.scale = size / FISH[f.kind].length * (0.85 + (f.cruise - 0.22) * 2);
      f.len = FISH[f.kind].length * f.scale;   // drawn length, in world units
      this.newGoal(f);
    }
  }
  /** Where (x, z) sits in the pond: 0 at the centre, 1 on the water's edge. */
  reach(x, z) { const p = this.pond; return Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz); }
  newGoal(f) {
    const r = this.rand, a = r() * TAU, d = Math.sqrt(r()) * 0.72;
    f.goal.x = this.pond.x + Math.cos(a) * d * this.pond.rx; f.goal.z = this.pond.z + Math.sin(a) * d * this.pond.rz;
    f.goalT = 3 + r() * 4;
  }
  ripple(x, z, size = 1) {
    let slot = this.ripples[0];
    for (const rp of this.ripples) if (rp.age / rp.life > slot.age / slot.life) slot = rp;
    Object.assign(slot, {x, z, age: 0, life: 0.9 + size * 0.5, size});
    this.events++;
  }
  /** A tap at (x, z): returns false off the water; otherwise a ring spreads and nearby fish dart away. */
  tap(x, z) {
    if (!this.pond || this.reach(x, z) > 1) return false;
    this.ripple(x, z, 1.3);
    const reachOf = Math.max(this.pond.rx, this.pond.rz) * 0.9;
    for (const f of this.fish) {
      const dx = f.x - x, dz = f.z - z, d = Math.hypot(dx, dz);
      if (d > reachOf) continue;
      f.state = 'flee'; f.t = 0;
      f.away = Math.atan2(dz, dx) + (this.rand() - 0.5) * 0.6; // turned to in a quick startle, never snapped
      f.speed = Math.max(f.speed, 1.1 + this.rand() * 0.3);
    }
    return true;
  }
  update(dt, quiet = false) {
    if (!this.pond) return;
    this.time += dt;
    const p = this.pond, r = this.rand;
    for (let i = 0; i < this.ripples.length; i++) if (this.ripples[i].age < this.ripples[i].life) this.ripples[i].age += dt;
    for (const f of this.fish) {
      f.t += dt; f.goalT -= dt; f.bob += dt * 1.3;
      if (f.state === 'flee' && f.t > 1.2) { f.state = 'swim'; this.newGoal(f); }
      let want = f.heading, rate = 1.5;
      if (f.state === 'swim') {
        const gx = f.goal.x - f.x, gz = f.goal.z - f.z;
        if (f.goalT <= 0 || Math.hypot(gx, gz) < 0.12) {
          // a koi that reaches its spot sometimes rises and kisses the surface: one small ring
          if (!quiet && r() < 0.35) this.ripple(f.x + Math.cos(f.heading) * 0.12 * f.scale, f.z + Math.sin(f.heading) * 0.12 * f.scale, 0.55);
          this.newGoal(f);
        }
        want = Math.atan2(f.goal.z - f.z, f.goal.x - f.x);
        // Keep room from the others, so the school never stacks into one blob: steer by direction, toward the goal
        // plus a push off any fish within most of a body length (a nudge of the heading was far too weak: the koi
        // overlapped in 7 frames of 10).
        let sx = Math.cos(want), sz = Math.sin(want);
        for (const o of this.fish) {
          if (o === f) continue;
          const dx = f.x - o.x, dz = f.z - o.z, d = Math.hypot(dx, dz), room = REACH * 0.5 * (f.len + o.len);
          if (d < room && d > 1e-6) { const push = 1.8 * (room - d) / room; sx += dx / d * push; sz += dz / d * push; }
        }
        want = Math.atan2(sz, sx);
      } else { want = f.away; rate = 12; }
      // the bank: when the next stroke would leave the water, swing back toward the middle
      const ahead = this.reach(f.x + Math.cos(f.heading) * 0.25, f.z + Math.sin(f.heading) * 0.25);
      if (ahead > 0.8) { want = Math.atan2(p.z - f.z, p.x - f.x); rate = Math.max(rate, 3.2); }
      const step = turn(f.heading, want);
      f.heading += clamp(step, -rate * dt, rate * dt);
      const cruise = f.state === 'flee' ? f.speed : f.cruise * (1 - Math.min(0.6, Math.abs(step)) * 0.6);
      // reduced motion: the fish come to rest, barely drifting, their tails almost still
      f.speed = approach(f.speed, quiet ? Math.min(cruise, 0.03) : cruise, dt, f.state === 'flee' ? 0.05 : 0.4);
      if (f.state === 'flee' && !quiet) f.speed = approach(f.speed, f.cruise, dt, 0.5);
      f.x += Math.cos(f.heading) * f.speed * dt; f.z += Math.sin(f.heading) * f.speed * dt;
      for (const o of this.fish) {   // and never on top of one another, a startle included: slide out along the line between them
        if (o === f) continue;
        const dx = f.x - o.x, dz = f.z - o.z, d = Math.hypot(dx, dz), apart = APART * 0.5 * (f.len + o.len);
        if (d < apart) { f.x = o.x + (d > 1e-6 ? dx / d * apart : apart); f.z = o.z + (d > 1e-6 ? dz / d * apart : 0); }
      }
      const out = this.reach(f.x, f.z);
      if (out > 0.86) { f.x = p.x + (f.x - p.x) * 0.86 / out; f.z = p.z + (f.z - p.z) * 0.86 / out; }
      // the tail beats faster with speed; the phase accumulates and the swing eases, so calm -> flee never jumps
      f.beat += dt * (5 + f.speed * 16);
      f.amp = approach(f.amp, quiet ? 0.04 : f.state === 'flee' ? 0.7 : 0.42, dt, 0.12);
      f.wag = Math.sin(f.beat) * f.amp;
    }
  }
}

// ---------------------------------------------------------------------------- the meadow
export class Meadow {
  constructor({seed = 23, budget = 1} = {}) {
    this.rand = random(seed);
    this.count = Math.max(2, Math.round(4 * budget));
    this.list = []; this.flowers = []; this.weight = 0; this.target = 1; this.time = 0;
  }
  /** Flowers as world points [{x, y, z}]; butterflies visit them. */
  setFlowers(flowers) {
    this.flowers = flowers.filter(f => Number.isFinite(f.x));
    const r = this.rand;
    if (!this.flowers.length) { this.list.length = 0; return; }
    if (!this.list.length) for (let i = 0; i < this.count; i++) this.list.push({x: 0, y: 0, z: 0, ground: 0, heading: r() * TAU, flap: r() * TAU,
      rate: 15 + r() * 5, colour: i % WINGS.length, target: 0, perch: 0, wander: r() * 100, bank: 0});
    for (const b of this.list) {
      const f = this.flowers[Math.floor(r() * this.flowers.length)];
      b.x = f.x + (r() - 0.5) * 0.8; b.z = f.z + (r() - 0.5) * 0.8; b.ground = f.y; b.y = f.y + 0.7 + r() * 0.4;
      this.pick(b);
    }
  }
  setHour(key) { this.target = DAY[key] ?? 0; }
  /** The next flower: usually a near one, sometimes one across the meadow. */
  pick(b) {
    const r = this.rand, n = this.flowers.length;
    let best = Math.floor(r() * n);
    if (r() < 0.75) for (let k = 0, bestD = Infinity; k < 5; k++) {
      const i = Math.floor(r() * n), f = this.flowers[i], d = Math.hypot(f.x - b.x, f.z - b.z);
      if (d > 0.3 && d < bestD) { bestD = d; best = i; }
    }
    b.target = best;
  }
  update(dt, quiet = false) {
    this.time += dt;
    this.weight = approach(this.weight, quiet ? 0 : this.target, dt, 1.2); // reduced motion: they fly away
    if (this.weight < 0.01 || !this.flowers.length) return;
    const t = this.time;
    for (const b of this.list) {
      const f = this.flowers[b.target];
      if (b.perch > 0) {                     // perched: wings open and close slowly, then off again
        b.perch -= dt; b.flap += dt * 2.2; b.bank = approach(b.bank, 0, dt, 0.2);
        if (b.perch <= 0) this.pick(b);
        continue;
      }
      const dx = f.x - b.x, dz = f.z - b.z, d = Math.hypot(dx, dz);
      // flight: toward the flower along a wandering line, high in between, dropping onto the bloom
      const wobble = Math.sin(t * 2.3 + b.wander) * 0.9 + Math.sin(t * 5.1 + b.wander * 2) * 0.35;
      const want = Math.atan2(dz, dx) + (d > 0.4 ? wobble : wobble * 0.2), prev = b.heading;
      b.heading += clamp(turn(b.heading, want), -4 * dt, 4 * dt);
      b.bank = approach(b.bank, clamp(turn(prev, b.heading) / Math.max(dt, 1e-3) * 0.12, -0.5, 0.5), dt, 0.1);
      const speed = (quiet ? 0.35 : 0.8) * clamp(d * 2, 0.35, 1);
      b.x += Math.cos(b.heading) * speed * dt; b.z += Math.sin(b.heading) * speed * dt;
      b.ground = approach(b.ground, f.y, dt, 0.4);
      const lift = clamp(d * 0.9, 0.26, 0.85) + Math.sin(b.flap) * 0.025;
      b.y = approach(b.y, b.ground + lift, dt, 0.12);
      b.flap += dt * b.rate;
      if (d < 0.1) { b.perch = 1.5 + this.rand() * 3; b.y = f.y + 0.26; }
    }
  }
}

// ---------------------------------------------------------------------------- the light stage's drawer
function bake(w, h, paint, ppu = 256) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * ppu)); c.height = Math.max(1, Math.ceil(h * ppu));
  const g = c.getContext('2d');
  if (g) { g.scale(ppu, ppu); paint(g, w, h); }   // out of canvas memory: an empty picture, never a crash
  return c;
}
/** A fish from above, nose to +x, in world units; the tail is its own picture hinged at x = -0.42 L. */
function fishPictures(sp, scale) {
  const L = sp.length * scale, W = L * 0.3, goldfish = sp.id === 'goldfish';
  const body = bake(L, W * 1.5, (g, w, h) => {
    const cy = h / 2, bw = goldfish ? W * 1.15 : W;
    // pectoral fins first, so the body overlaps their roots
    g.fillStyle = sp.fin; g.globalAlpha = 0.85;
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(w * 0.66, cy + s * bw * 0.5, w * 0.08, bw * 0.2, s * 0.7, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    g.beginPath(); g.moveTo(w, cy);
    g.bezierCurveTo(w * 0.94, cy - bw * 0.55, w * 0.4, cy - bw * 0.6, w * 0.08, cy - bw * 0.12);
    g.lineTo(w * 0.08, cy + bw * 0.12);
    g.bezierCurveTo(w * 0.4, cy + bw * 0.6, w * 0.94, cy + bw * 0.55, w, cy);
    g.closePath();
    g.fillStyle = sp.body; g.fill();
    g.save(); g.clip();
    g.fillStyle = sp.patch;
    if (goldfish) { g.globalAlpha = 0.55; g.fillRect(0, cy + bw * 0.18, w, bw); }
    else for (const [x, y, rx, ry] of [[0.8, -0.1, 0.09, 0.45], [0.52, 0.08, 0.13, 0.5], [0.27, -0.12, 0.07, 0.35]]) { g.beginPath(); g.ellipse(w * x, cy + bw * y, w * rx, bw * ry, 0.3, 0, TAU); g.fill(); }
    g.globalAlpha = 0.3; g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(w * 0.6, cy - bw * 0.12, w * 0.34, bw * 0.12, 0, 0, TAU); g.fill(); // a wet sheen down the back
    g.restore();
    g.fillStyle = sp.fin; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(w * 0.48, cy, w * 0.16, bw * 0.06, 0, 0, TAU); g.fill(); // dorsal fin seen from above
    g.globalAlpha = 1; g.fillStyle = '#16182a';
    for (const s of [-1, 1]) { g.beginPath(); g.arc(w * 0.88, cy + s * bw * 0.2, bw * 0.08, 0, TAU); g.fill(); }
  });
  const tl = L * (goldfish ? 0.42 : 0.34), th = L * (goldfish ? 0.42 : 0.32);
  const tail = bake(tl, th, (g, w, h) => {
    g.beginPath(); g.moveTo(w, h / 2);
    g.quadraticCurveTo(w * 0.45, h * 0.02, 0, 0); g.quadraticCurveTo(w * 0.28, h / 2, 0, h); g.quadraticCurveTo(w * 0.45, h * 0.98, w, h / 2);
    g.closePath(); g.fillStyle = sp.fin; g.globalAlpha = 0.9; g.fill();
    g.globalAlpha = 0.5; g.fillStyle = sp.body; g.beginPath(); g.ellipse(w * 0.8, h / 2, w * 0.2, h * 0.08, 0, 0, TAU); g.fill();
  });
  return {body, tail, L, W: W * 1.5, tl, th};
}
function wingPicture(colour, span) {
  const w = span / 2, h = w * 0.95;
  return bake(w, h, (g) => {
    g.fillStyle = '#4a3466';
    g.beginPath(); g.moveTo(0, h * 0.5); g.bezierCurveTo(w * 0.3, -h * 0.05, w * 1.05, h * 0.02, w * 0.94, h * 0.42);
    g.bezierCurveTo(w * 0.86, h * 0.64, w * 0.6, h * 1.0, w * 0.28, h * 0.94); g.closePath(); g.fill();
    g.fillStyle = colour;
    g.beginPath(); g.moveTo(w * 0.06, h * 0.5); g.bezierCurveTo(w * 0.32, h * 0.08, w * 0.9, h * 0.1, w * 0.84, h * 0.42);
    g.bezierCurveTo(w * 0.78, h * 0.6, w * 0.58, h * 0.86, w * 0.32, h * 0.82); g.closePath(); g.fill();
    g.fillStyle = '#5a3a6e'; g.beginPath(); g.arc(w * 0.66, h * 0.34, w * 0.09, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(w * 0.68, h * 0.32, w * 0.035, 0, TAU); g.fill();
  }, 384);
}

// the water's colour (for the under-water tint) and how much each hour darkens what lies beneath it
const WATER = '#2f8ea0';
const DEEP = {afternoon: 0.05, golden: 0.14, sunset: 0.26, dusk: 0.45, night: 0.55};
const LIGHT = {afternoon: 1, golden: 1, sunset: 0.95, dusk: 0.8, night: 0.7};

/**
 * Draws PondLife and Meadow on the baked stage. The fish are drawn into a small offscreen layer the size
 * of the pond on screen, tinted toward the water, then cut by the bake's water mask (pond-<layout>.webp),
 * so lily pads, reeds, the stone rim and a bush in front stay on top with no re-stamping.
 */
export class Life2D {
  constructor({budget = 1} = {}) {
    this.pond = new PondLife({budget}); this.meadow = new Meadow({budget});
    this.layer = null; this.hour = 'afternoon'; this.mask = null; this.m = null;
    this.p = {x: 0, y: 0}; this.q = {x: 0, y: 0}; this.r = {x: 0, y: 0};
    this.A = {ox: 0, oy: 0, xx: 0, xy: 0, zx: 0, zy: 0}; // plane axes scratch: nothing allocated per frame
    this.k = 1; this.ox = 0; this.oy = 0; this.place = this.placeOn.bind(this);
  }
  /** A baked layout: its camera, the water and the mask, and the flowers. `art` fetches the mask. */
  layout(m, art) {
    this.m = m; this.mask = null; this.maskFile = m.pond?.mask?.file || null;
    if (!m.pond) return;
    const c = m.pond.centre.world, phone = m.layout !== 'wide';
    this.pond.setPond({x: c[0], y: m.pond.waterY, z: c[2], rx: m.pond.rx, rz: m.pond.rz});
    this.pictures ??= FISH.map(sp => fishPictures(sp, 1));
    // butterflies a little larger on phones, where the clearing is drawn small (12-20 px on screen)
    this.span = phone ? 0.5 : 0.3;
    if (this.wingSpan !== this.span) { this.wings = WINGS.map(c => wingPicture(c, this.span)); this.wingSpan = this.span; }
    this.meadow.setFlowers((m.meadow?.flowers || []).map(f => ({x: f.world[0], y: f.world[1], z: f.world[2]})));
    if (this.maskFile && art) {
      const entry = art.sprite(this.maskFile), file = this.maskFile;
      entry.promise.then(img => { if (this.maskFile === file) this.mask = img; }).catch(() => {});
    }
  }
  setHour(key) { this.hour = key; this.meadow.setHour(key); }
  update(dt, quiet) { this.pond.update(dt, quiet); this.meadow.update(dt, quiet); }
  info() {
    return {fish: this.pond.fish.map(f => ({kind: FISH[f.kind].id, x: +f.x.toFixed(3), z: +f.z.toFixed(3), state: f.state})), ripples: this.pond.ripples.filter(r => r.age < r.life).length,
      events: this.pond.events, butterflies: this.meadow.weight > 0.01 ? this.meadow.list.length : 0, weight: +this.meadow.weight.toFixed(2), masked: !!this.mask};
  }
  project(x, y, z, out) {
    const v = this.m.camera.viewProj, w = v[3] * x + v[7] * y + v[11] * z + v[15];
    out.x = ((v[0] * x + v[4] * y + v[8] * z + v[12]) / w * 0.5 + 0.5) * this.m.image.w;
    out.y = (-(v[1] * x + v[5] * y + v[9] * z + v[13]) / w * 0.5 + 0.5) * this.m.image.h;
    return out;
  }
  /** Image px per world unit along x and z at a point: the plane's local axes, for flat shapes on it. */
  axes(x, y, z) {
    const o = this.project(x, y, z, this.p), ox = o.x, oy = o.y;
    const a = this.project(x + 0.1, y, z, this.q), b = this.project(x, y, z + 0.1, this.r);
    const A = this.A;
    A.ox = ox; A.oy = oy; A.xx = (a.x - ox) * 10; A.xy = (a.y - oy) * 10; A.zx = (b.x - ox) * 10; A.zy = (b.y - oy) * 10;
    return A;
  }
  /** Map local units at plane axes A onto the pond layer (bound once in the constructor: no closure per frame). */
  placeOn(A, m11, m12, m21, m22, x, y) {
    const k = this.k;
    this.lctx.setTransform(m11 * k, m12 * k, m21 * k, m22 * k, A.ox * k + this.ox + x, A.oy * k + this.oy + y);
  }
  /** The pond layer: fish, their shadows and the rings, clipped to the visible water. Call right after the backdrop. */
  drawPond(ctx, view, dpr, night = 0) {
    if (!this.m?.pond || !this.mask) return 0;
    const rect = this.m.pond.mask.rect, k = view.s * dpr, w = Math.ceil(rect.w * k), h = Math.ceil(rect.h * k);
    const dx = (rect.x * view.s + view.x) * dpr, dy = (rect.y * view.s + view.y) * dpr;
    if (w < 2 || h < 2 || dx > ctx.canvas.width || dy > ctx.canvas.height || dx + w < 0 || dy + h < 0) return 0;
    if (!this.layer || this.layer.width < w || this.layer.height < h) {
      const c = this.layer || document.createElement('canvas');
      c.width = Math.ceil(w * 1.25); c.height = Math.ceil(h * 1.25); // headroom, so a camera push does not reallocate every frame
      this.layer = c; this.lctx = c.getContext('2d');
    }
    const g = this.lctx;
    if (!g) return 0;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    const P = this.pond.pond;
    this.k = k; this.ox = -rect.x * k; this.oy = -rect.y * k;
    const place = this.place;
    // shadows on the pond bed first: the same shapes projected lower, so depth shifts them for free
    g.fillStyle = 'rgba(8,36,44,0.28)';
    for (const f of this.pond.fish) {
      const sp = this.pictures[f.kind]; if (!sp) continue;
      const A = this.axes(f.x, P.y - 0.16, f.z), c = Math.cos(f.heading), s = Math.sin(f.heading), L = sp.L * f.scale;
      place(A, A.xx * c + A.zx * s, A.xy * c + A.zy * s, -A.xx * s + A.zx * c, -A.xy * s + A.zy * c, 0, 0);
      g.beginPath(); g.ellipse(0, 0, L * 0.42, L * 0.11, 0, 0, TAU); g.fill();
    }
    for (const f of this.pond.fish) {
      const sp = this.pictures[f.kind]; if (!sp) continue;
      const y = P.y - f.sink - Math.sin(f.bob) * 0.008, A = this.axes(f.x, y, f.z), sc = f.scale;
      // the body yaws a little against the tail: a swimming S
      const hb = f.heading - f.wag * 0.18, c = Math.cos(hb), s = Math.sin(hb);
      const ux = A.xx * c + A.zx * s, uy = A.xy * c + A.zy * s, vx = -A.xx * s + A.zx * c, vy = -A.xy * s + A.zy * c;
      place(A, ux * sc, uy * sc, vx * sc, vy * sc, 0, 0);
      g.drawImage(sp.body, -sp.L / 2, -sp.W / 2, sp.L, sp.W);
      // the tail: hinged at -0.42 L along the body, turned by the wag
      const ht = hb + f.wag, tc = Math.cos(ht), ts = Math.sin(ht), hx = -sp.L * 0.42 * sc;
      place(A, (A.xx * tc + A.zx * ts) * sc, (A.xy * tc + A.zy * ts) * sc, (-A.xx * ts + A.zx * tc) * sc, (-A.xy * ts + A.zy * tc) * sc, (ux * hx) * k, (uy * hx) * k);
      g.drawImage(sp.tail, -sp.tl, -sp.th / 2, sp.tl, sp.th);
    }
    // under the surface: a wash of the water's colour, deeper as the light goes, over the fish only
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.22; g.fillStyle = WATER; g.fillRect(0, 0, w, h);
    const deep = DEEP[this.hour] ?? 0.1;
    if (deep > 0.01) { g.globalAlpha = deep; g.fillStyle = '#0c1a3a'; g.fillRect(0, 0, w, h); }
    // rings on the surface, light catching them
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = night > 0.7 ? '#cfe6ff' : '#ffffff';
    for (const r of this.pond.ripples) {
      if (r.age >= r.life) continue;
      const q = r.age / r.life, rad = (0.06 + q * 0.42) * r.size, A = this.axes(r.x, P.y + 0.01, r.z);
      g.globalAlpha = (1 - q) * (1 - q) * 0.75 * (LIGHT[this.hour] ?? 1);
      place(A, A.xx, A.xy, A.zx, A.zy, 0, 0);
      g.lineWidth = 0.022 * (1 - q * 0.5);
      g.beginPath(); g.ellipse(0, 0, rad, rad, 0, 0, TAU); g.stroke();
      if (q < 0.5) { g.beginPath(); g.ellipse(0, 0, rad * 0.55, rad * 0.55, 0, 0, TAU); g.stroke(); }
    }
    // only the visible water: lily pads, reeds and the rim were holdouts when the mask was baked
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in';
    g.drawImage(this.mask, 0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.drawImage(this.layer, 0, 0, w, h, dx, dy, w, h);
    ctx.restore();
    return 1;
  }
  /** Butterflies, in the air above everything on the ground. */
  drawButterflies(ctx, view, dpr) {
    const M = this.meadow;
    if (!this.m || M.weight < 0.01 || !this.wings) return 0;
    const s = view.s * dpr, tint = LIGHT[this.hour] ?? 1;
    let calls = 0;
    for (const b of M.list) {
      const g = this.project(b.x, b.ground + 0.02, b.z, this.p), gx = g.x * s + view.x * dpr, gy = g.y * s + view.y * dpr;
      const a = this.project(b.x, b.y, b.z, this.q), ax = a.x * s + view.x * dpr, ay = a.y * s + view.y * dpr;
      // the body's direction on screen from the heading; the size from the unforeshortened world x axis
      const n = this.project(b.x + Math.cos(b.heading) * 0.1, b.y, b.z + Math.sin(b.heading) * 0.1, this.r), dir = Math.atan2(n.y - a.y, n.x - a.x);
      const e = this.project(b.x + 0.1, b.y, b.z, this.r), u = Math.hypot(e.x - a.x, e.y - a.y) * 10 * s;
      const open = b.perch > 0 ? 0.55 + 0.45 * Math.abs(Math.cos(b.flap)) : 0.18 + 0.82 * Math.abs(Math.cos(b.flap));
      // a soft shadow on the grass, smaller and fainter the higher it flies
      const hgt = Math.max(0, b.y - b.ground), sh = Math.max(0, 1 - hgt * 0.9);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.16 * sh * M.weight; ctx.fillStyle = '#2a1a0c';
      ctx.beginPath(); ctx.ellipse(gx, gy, this.span * 0.32 * u * open, this.span * 0.12 * u, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = M.weight * tint;
      const img = this.wings[b.colour], ww = this.span / 2, wh = ww * 0.95, bc = Math.cos(dir), bs = Math.sin(dir);
      for (const side of SIDES) {
        // X runs out along the wing (folded by `open`, tipped by the bank), Y back along the body (forewing first)
        const wa = dir + side * Math.PI / 2, lean = 1 - side * b.bank * 0.5;
        ctx.setTransform(Math.cos(wa) * u * open * lean, Math.sin(wa) * u * open * lean, -bc * u, -bs * u, ax, ay);
        ctx.drawImage(img, 0, -wh / 2, ww, wh); calls++;
      }
      ctx.setTransform(bc * u, bs * u, -bs * u, bc * u, ax, ay); ctx.fillStyle = '#3a2a3e';
      ctx.beginPath(); ctx.ellipse(0, 0, 0.05, 0.012, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return calls;
  }
}
