// Featherlight critters for Canvas2D (2D and 2.5D games).
// From the lightweight-game-objects skill (first written for The Lantern Picnic's light stage);
// adapted for The Lantern Trail: sizes and speeds scale with `length` / `span` so the critters live
// in world units, and the butterflies take a `shadow` toggle. Only KoiPond, Butterflies and glowSprite are used.
//
// Each creature is a few small pictures baked ONCE into offscreen canvases, drawn every frame as
// rigid parts on hinges (a koi = body + tail, a butterfly = one wing drawn twice) and moved by a few
// lines of math per frame: steering toward a goal, a bob, a wag. No skeleton, no per-frame
// gradients/shadowBlur/filter, no allocation in update() or draw(), one setTransform per part.
//
// Drop this file into a project and adapt the palettes and sizes. Every class has
//   update(dt, time)   dt in seconds (clamp it at the call site, e.g. Math.min(dt, 0.05))
//   draw(ctx, view)    view = {s, x, y}: screen = world * s + (x, y); pass {s: 1, x: 0, y: 0} for none
// and respects `quiet` (reduced motion) and a `budget` 0..1 that scales how many critters exist.

export const TAU = Math.PI * 2;
export const rand = (a, b) => a + Math.random() * (b - a);
/** Frame-rate independent approach: move `a` toward `b`, halving the gap every `half` seconds. */
export const approach = (a, b, dt, half) => b + (a - b) * Math.pow(2, -dt / half);
/** Shortest signed angle from `a` to `b`. */
export const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Paint once into an offscreen canvas (at `scale` px per unit, 2 suits most phones), reuse forever. */
export function bake(w, h, paint, scale = 2) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * scale)); c.height = Math.max(1, Math.ceil(h * scale));
  const g = c.getContext('2d');
  g.scale(scale, scale); paint(g, w, h);
  c.unitW = w; c.unitH = h;
  return c;
}

/** A soft round light for additive glows (fireflies, lanterns). Baked once, drawn with 'lighter'. */
export function glowSprite(rgb = '255,236,170', size = 32) {
  return bake(size, size, (g, w) => {
    const r = w / 2, grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, `rgba(${rgb},1)`); grd.addColorStop(0.25, `rgba(${rgb},0.55)`); grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  }, 2);
}

// ------------------------------------------------------------------------------------------------ koi
/** Koi body pointing +x, origin at the body centre; the tail hinge sits at x = -len * 0.42. */
function koiBody(len, base, spots) {
  const w = len * 0.36;
  return bake(len, w, g => {
    const cy = w / 2;
    g.beginPath();
    g.moveTo(len, cy);
    g.bezierCurveTo(len * 0.92, cy - w * 0.52, len * 0.35, cy - w * 0.55, len * 0.06, cy - w * 0.12);
    g.lineTo(len * 0.06, cy + w * 0.12);
    g.bezierCurveTo(len * 0.35, cy + w * 0.55, len * 0.92, cy + w * 0.52, len, cy);
    g.closePath();
    const grd = g.createLinearGradient(0, 0, 0, w);
    grd.addColorStop(0, base); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, base);
    g.fillStyle = base; g.fill();
    g.save(); g.clip();
    g.globalAlpha = 0.35; g.fillStyle = grd; g.fillRect(0, 0, len, w); g.globalAlpha = 1;
    g.fillStyle = spots;
    for (const [x, y, r] of [[0.72, 0.42, 0.13], [0.48, 0.6, 0.11], [0.3, 0.38, 0.09]]) { g.beginPath(); g.ellipse(len * x, w * y, len * r, w * r * 1.6, 0.4, 0, TAU); g.fill(); }
    g.restore();
    // pectoral fins and eyes: the details that read at 20 px
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(len * 0.66, cy + s * w * 0.48, len * 0.09, w * 0.16, s * 0.6, 0, TAU); g.fill(); }
    g.fillStyle = '#1b1b2a';
    for (const s of [-1, 1]) { g.beginPath(); g.arc(len * 0.9, cy + s * w * 0.16, w * 0.06, 0, TAU); g.fill(); }
  }, 72 / len);
}
/** Koi tail fan pointing -x, hinge at its right edge, vertical centre. */
function koiTail(len, color) {
  const tl = len * 0.34, th = len * 0.34;
  return bake(tl, th, g => {
    g.beginPath(); g.moveTo(tl, th / 2);
    g.quadraticCurveTo(tl * 0.45, th * 0.05, 0, 0); g.quadraticCurveTo(tl * 0.25, th / 2, 0, th); g.quadraticCurveTo(tl * 0.45, th * 0.95, tl, th / 2);
    g.closePath(); g.fillStyle = color; g.globalAlpha = 0.85; g.fill();
  }, 72 / len);
}

const KOI = [['#f4f1ea', '#e8552d'], ['#ff8a2a', '#fff3e0'], ['#f4f1ea', '#1f2230'], ['#ffd54a', '#ff8a2a'], ['#e8552d', '#f4f1ea']];

/**
 * Koi in a pond seen at an angle (2.5D): fish live on the pond's plane (x, z) and are drawn with
 * the plane squashed vertically by `squash`, so a fish heading "into" the screen looks shorter.
 * Pond centre and radii are in world units (the same units as `view`).
 */
export class KoiPond {
  constructor({x, y, rx, rz, squash = 0.55, count = 7, length = 26, budget = 1, palettes = KOI} = {}) {
    Object.assign(this, {x, y, rx, rz, squash, length, quiet: false});
    const k = this.k = length / 26; // the original tuning was in pixels for a 26 px koi
    this.sprites = palettes.map(([base, spots]) => ({body: koiBody(length, base, spots), tail: koiTail(length, base)}));
    this.shadow = bake(length, length * 0.36, (g, w, h) => { g.fillStyle = 'rgba(10,30,40,0.22)'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.42, h * 0.32, 0, 0, TAU); g.fill(); }, 72 / length);
    this.fish = [];
    for (let i = 0, n = Math.max(1, Math.round(count * budget)); i < n; i++) {
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * 0.7;
      this.fish.push({px: Math.cos(a) * rx * r, pz: Math.sin(a) * rz * r, heading: rand(0, TAU), speed: rand(14, 24) * k, gx: 0, gz: 0, t: 99,
        state: 'swim', beat: rand(0, TAU), size: rand(0.8, 1.15), look: this.sprites[i % this.sprites.length], wag: 0});
    }
    this.ripples = Array.from({length: 6}, () => ({life: 0, age: 1, x: 0, z: 0}));
  }
  /** Keep a point inside the pond ellipse (scaled by `margin`). Writes into `out`, no allocation. */
  clampInside(x, z, margin, out) {
    const u = x / (this.rx * margin), v = z / (this.rz * margin), d = Math.hypot(u, v);
    if (d <= 1) { out.x = x; out.z = z; } else { out.x = x / d; out.z = z / d; }
    return out;
  }
  /** World point -> pond plane, or null if outside the water. */
  toPlane(wx, wy) { const x = wx - this.x, z = (wy - this.y) / this.squash; return (x / this.rx) ** 2 + (z / this.rz) ** 2 <= 1 ? {x, z} : null; }
  /** A tap or a splash at a world point: nearby fish dart away, a ripple spreads. */
  scatter(wx, wy, radius = this.length * 4) {
    const p = this.toPlane(wx, wy); if (!p) return false;
    for (const f of this.fish) {
      const dx = f.px - p.x, dz = f.pz - p.z, d = Math.hypot(dx, dz);
      if (d < radius) { f.state = 'flee'; f.t = 0; f.heading = Math.atan2(dz, dx) + rand(-0.4, 0.4); f.speed = rand(70, 95) * this.k; }
    }
    const r = this.ripples.reduce((a, b) => (a.age / a.life > b.age / b.life || !a.life ? a : b));
    Object.assign(r, {x: p.x, z: p.z, age: 0, life: 0.9});
    return true;
  }
  update(dt, time) {
    const quiet = this.quiet, tmp = this._tmp ??= {x: 0, z: 0};
    for (const f of this.fish) {
      f.t += dt;
      if (f.state === 'flee' && f.t > 0.9) { f.state = 'swim'; f.speed = rand(14, 24) * this.k; f.t = 99; }
      if (f.state === 'swim') {
        if (f.t > 6 || Math.hypot(f.gx - f.px, f.gz - f.pz) < this.length) {
          const a = rand(0, TAU), r = Math.sqrt(Math.random()) * 0.8;
          f.gx = Math.cos(a) * this.rx * r; f.gz = Math.sin(a) * this.rz * r; f.t = 0;
        }
        f.heading += angleTo(f.heading, Math.atan2(f.gz - f.pz, f.gx - f.px)) * Math.min(1, dt * 1.6);
      }
      const speed = quiet ? f.speed * 0.4 : f.speed;
      this.clampInside(f.px + Math.cos(f.heading) * speed * dt, f.pz + Math.sin(f.heading) * speed * dt, 0.85, tmp);
      // at the bank, turn along it instead of pushing into it
      if (tmp.x !== f.px + Math.cos(f.heading) * speed * dt) f.heading += dt * 2.5;
      f.px = tmp.x; f.pz = tmp.z;
      // accumulate the beat's phase: sin(time * rate) would jump whenever the rate changes (calm -> flee)
      f.beat += dt * (f.state === 'flee' ? 18 : 7 + speed / this.k * 0.08);
      f.wag = quiet ? 0 : Math.sin(f.beat) * (f.state === 'flee' ? 0.75 : 0.45);
    }
    for (const r of this.ripples) if (r.age < r.life) r.age += dt;
  }
  draw(ctx, view = {s: 1, x: 0, y: 0}, dpr = 1) {
    const s = view.s, len = this.length, sq = this.squash;
    // ripples first (they sit on the surface but under the glare of the fish)
    const u = this.k;
    ctx.lineWidth = 1.5 * s * u; ctx.strokeStyle = '#ffffff';
    for (const r of this.ripples) {
      if (r.age >= r.life) continue;
      const k = r.age / r.life, sx = (this.x + r.x) * s + view.x, sy = (this.y + r.z * sq) * s + view.y, rad = (8 + k * 46) * s * u;
      ctx.globalAlpha = (1 - k) * 0.7; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath(); ctx.ellipse(sx, sy, rad, rad * sq, 0, 0, TAU); ctx.stroke();
    }
    for (const f of this.fish) {
      const sx = (this.x + f.px) * s + view.x, sy = (this.y + f.pz * sq) * s + view.y, k = f.size * s;
      const swim = f.heading + f.wag * 0.12; // the body yaws a little against the tail: a swimming S
      const c = Math.cos(swim), sn = Math.sin(swim);
      const b = f.look.body, t = f.look.tail, bw = b.unitW * k, bh = b.unitH * k;
      // shadow on the pond floor, offset down and faint
      ctx.globalAlpha = 1;
      ctx.setTransform(dpr * c * k, dpr * sn * k * sq, -dpr * sn * k, dpr * c * k * sq, dpr * (sx + 4 * s * u), dpr * (sy + 6 * s * u));
      ctx.drawImage(this.shadow, -len / 2, -len * 0.18, len, len * 0.36);
      // body: rotate in the pond plane, then squash the plane (rows 1-2 of the matrix carry `sq`)
      ctx.globalAlpha = 0.92;
      ctx.setTransform(dpr * c, dpr * sn * sq, -dpr * sn, dpr * c * sq, dpr * sx, dpr * sy);
      const hinge = -bw * 0.42, ta = f.wag, tc = Math.cos(swim + ta), ts = Math.sin(swim + ta);
      ctx.drawImage(b, -bw / 2, -bh / 2, bw, bh);
      // tail: hinge point in plane space, then the tail's own angle
      const hx = sx + c * hinge, hy = sy + sn * hinge * sq, tw = t.unitW * k, th = t.unitH * k;
      ctx.setTransform(dpr * tc, dpr * ts * sq, -dpr * ts, dpr * tc * sq, dpr * hx, dpr * hy);
      ctx.drawImage(t, -tw, -th / 2, tw, th);
    }
    ctx.globalAlpha = 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

// ------------------------------------------------------------------------------------------------ butterflies
function wing(span, color, edge) {
  return bake(span, span * 0.9, (g, w, h) => {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(0, h * 0.5); g.bezierCurveTo(w * 0.3, -h * 0.05, w * 1.05, h * 0.02, w * 0.92, h * 0.42);
    g.bezierCurveTo(w * 0.85, h * 0.62, w * 0.6, h * 0.98, w * 0.3, h * 0.92); g.closePath(); g.fill();
    g.fillStyle = edge; g.beginPath(); g.arc(w * 0.66, h * 0.32, w * 0.1, 0, TAU); g.fill();
  }, 30 / span);
}
const WINGS = [['#ffb3d9', '#ffffff'], ['#ffe066', '#ff8a2a'], ['#9fd8ff', '#3f6fd6'], ['#ffffff', '#ffb000']];

/**
 * Butterflies over a rectangle of ground: they wander on smooth curves, flap (wings fold by scaling
 * one baked wing in x), bob with the beat, and cast a tiny shadow on the ground below them.
 */
export class Butterflies {
  constructor({x, y, w, h, count = 6, span = 9, budget = 1, palettes = WINGS, shadow = true} = {}) {
    Object.assign(this, {x, y, w, h, span, quiet: false, shadow});
    const k = this.k = span / 9;
    this.looks = palettes.map(([c, e]) => wing(span, c, e));
    this.list = Array.from({length: Math.max(1, Math.round(count * budget))}, (_, i) => ({
      px: rand(0, w), py: rand(0, h), alt: rand(10, 26) * k, heading: rand(0, TAU), speed: rand(18, 30) * k, seed: rand(0, 100),
      flap: rand(0, TAU), rate: rand(9, 13), look: this.looks[i % this.looks.length], rest: 0}));
  }
  update(dt, time) {
    for (const b of this.list) {
      if (b.rest > 0) { b.rest -= dt; b.flap += dt * 1.5; continue; } // perched: slow open-close
      // wander: the heading follows a sum of sines (smooth, never repeats), pulled back toward the area
      const wander = Math.sin(time * 0.7 + b.seed) * 1.6 + Math.sin(time * 1.9 + b.seed * 2) * 0.6;
      const home = Math.atan2(this.h / 2 - b.py, this.w / 2 - b.px), far = Math.hypot(this.w / 2 - b.px, this.h / 2 - b.py) / (Math.max(this.w, this.h) / 2);
      b.heading += (wander * dt) + angleTo(b.heading, home) * Math.min(1, dt * far * far * 2);
      const sp = this.quiet ? b.speed * 0.3 : b.speed;
      b.px += Math.cos(b.heading) * sp * dt; b.py += Math.sin(b.heading) * sp * dt * 0.6;
      b.flap += dt * b.rate;
      if (!this.quiet && Math.random() < dt * 0.04) b.rest = rand(1.5, 4);
    }
  }
  draw(ctx, view = {s: 1, x: 0, y: 0}, dpr = 1) {
    const s = view.s;
    for (const b of this.list) {
      const gx = (this.x + b.px) * s + view.x, gy = (this.y + b.py) * s + view.y;
      const open = b.rest > 0 ? 0.55 + 0.45 * Math.abs(Math.cos(b.flap)) : 0.15 + 0.85 * Math.abs(Math.cos(b.flap));
      const u = this.k, bob = b.rest > 0 ? 0 : Math.sin(b.flap) * 2.2 * u, fy = gy - (b.rest > 0 ? 2 * u : b.alt + bob) * s;
      // shadow on the ground: shrinks and fades with height
      if (this.shadow) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 0.18; ctx.fillStyle = '#2a1a0c';
        ctx.beginPath(); ctx.ellipse(gx, gy, this.span * 0.7 * s * open, this.span * 0.22 * s, 0, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const img = b.look, w = this.span * s * open, h = this.span * 0.9 * s, tilt = Math.cos(b.heading) * 0.25;
      const c = Math.cos(tilt), sn = Math.sin(tilt);
      for (const side of [1, -1]) {
        ctx.setTransform(dpr * c * side, dpr * sn * side, -dpr * sn, dpr * c, dpr * gx, dpr * fy);
        ctx.drawImage(img, 0, -h / 2, w, h);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#3a2a20';
      ctx.fillRect(gx - 0.7 * s * u, fy - 3 * s * u, 1.4 * s * u, 6 * s * u);
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------------------------------------ fireflies
/** Fireflies: drifting points that blink in their own rhythm, drawn as one additive glow sprite each. */
export class Fireflies {
  constructor({x, y, w, h, count = 40, budget = 1, rgb = '232,255,150'} = {}) {
    Object.assign(this, {x, y, w, h, quiet: false});
    this.glow = glowSprite(rgb, 24);
    this.list = Array.from({length: Math.max(1, Math.round(count * budget))}, () => ({
      bx: rand(0, w), by: rand(0, h), seed: rand(0, 100), rate: rand(0.6, 1.4), size: rand(0.7, 1.3), px: 0, py: 0, a: 0}));
  }
  update(dt, time) {
    for (const f of this.list) {
      const t = time * f.rate;
      f.px = f.bx + Math.sin(t * 0.5 + f.seed) * 14 + Math.sin(t * 1.3 + f.seed * 3) * 5;
      f.py = f.by + Math.cos(t * 0.4 + f.seed * 2) * 9 - ((time * 4 + f.seed * 10) % 30);
      // a blink: a short bright pulse then darkness, not a sine glow
      f.a = this.quiet ? 0.5 : Math.pow(Math.max(0, Math.sin(t * 1.7 + f.seed)), 6);
    }
  }
  draw(ctx, view = {s: 1, x: 0, y: 0}, dpr = 1) {
    const s = view.s, r = 9 * s;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'lighter';
    for (const f of this.list) {
      if (f.a < 0.02) continue;
      ctx.globalAlpha = f.a; const k = r * f.size;
      ctx.drawImage(this.glow, (this.x + f.px) * s + view.x - k, (this.y + f.py) * s + view.y - k, k * 2, k * 2);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------------------------------------ grass
/**
 * Grass tufts that sway in a travelling gust: one baked tuft drawn many times with a horizontal
 * shear about its base (setTransform's `c` term), the gust phase running across x.
 */
export class Grass {
  constructor({points, height = 14, color = '#5aa83c', tip = '#a8e070', budget = 1} = {}) {
    this.height = height; this.quiet = false;
    this.tuft = bake(height * 0.9, height, (g, w, h) => {
      for (let i = 0; i < 7; i++) {
        const bx = w * (0.15 + i * 0.12), lean = (i - 3) * w * 0.07, grd = g.createLinearGradient(0, h, 0, 0);
        grd.addColorStop(0, color); grd.addColorStop(1, tip);
        g.fillStyle = grd; g.beginPath(); g.moveTo(bx - w * 0.05, h); g.quadraticCurveTo(bx + lean * 0.3, h * 0.5, bx + lean, h * (0.05 + (i % 3) * 0.12)); g.lineTo(bx + w * 0.05, h); g.fill();
      }
    });
    const keep = Math.max(1, Math.round(points.length * budget));
    this.list = points.slice(0, keep).map(([x, y]) => ({x, y, k: rand(0.8, 1.2), flip: Math.random() < 0.5 ? -1 : 1}));
  }
  update() {}
  draw(ctx, view = {s: 1, x: 0, y: 0}, dpr = 1, time = 0) {
    const s = view.s, tw = this.tuft.unitW, th = this.tuft.unitH;
    for (const t of this.list) {
      const gust = this.quiet ? 0 : Math.sin(time * 1.6 - t.x * 0.02) * 0.22 + Math.sin(time * 3.1 + t.x * 0.05) * 0.06;
      const k = t.k * s, sx = t.x * s + view.x, sy = t.y * s + view.y;
      ctx.setTransform(dpr * k * t.flip, 0, dpr * gust * k, dpr * k, dpr * sx, dpr * sy);
      ctx.drawImage(this.tuft, -tw / 2, -th, tw, th);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
