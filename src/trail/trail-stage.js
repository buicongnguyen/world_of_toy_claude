// The Lantern Trail's stage: Fernhollow drawn with the browser's plain 2D canvas.
// The islets are one baked plate (tiles), scenery and friends are depth-sorted sprites baked with the
// same orthographic camera, and everything alive (Mistlings, koi, butterflies, petals, glows) is a
// handful of small canvases drawn with drawImage. No WebGL, no per-frame gradients or allocation.
import {PPU, SPRITE_PPU, SIN, COS, PLATE, vOf} from './trail-map.js';
import {KoiPond, Butterflies, bake, TAU} from './critters2d.js';

const SKY = '#f3b98f';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (a, b, lambda, dt) => b + (a - b) * Math.exp(-lambda * dt);

// ------------------------------------------------------------------------------ little pictures
function radial(size, stops) {
  return bake(size, size, (g, w) => {
    const r = w / 2, grd = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, c] of stops) grd.addColorStop(o, c);
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  }, 1);
}
const GLOWS = {
  gold: radial(64, [[0, 'rgba(255,246,214,1)'], [0.22, 'rgba(255,214,128,.65)'], [0.55, 'rgba(255,170,70,.16)'], [1, 'rgba(255,150,60,0)']]),
  warm: radial(64, [[0, 'rgba(255,236,190,.9)'], [0.4, 'rgba(255,190,110,.3)'], [1, 'rgba(255,160,80,0)']]),
  green: radial(32, [[0, 'rgba(246,255,200,1)'], [0.3, 'rgba(214,255,120,.55)'], [1, 'rgba(180,255,90,0)']]),
  cool: radial(64, [[0, 'rgba(235,245,255,1)'], [0.3, 'rgba(170,200,255,.5)'], [1, 'rgba(140,170,255,0)']]),
  pink: radial(32, [[0, 'rgba(255,240,248,1)'], [0.35, 'rgba(255,170,205,.5)'], [1, 'rgba(255,140,190,0)']]),
};
const SHADOW = bake(64, 32, (g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(40,24,10,.5)'); grd.addColorStop(0.55, 'rgba(40,24,10,.22)'); grd.addColorStop(1, 'rgba(40,24,10,0)');
  g.save(); g.scale(1, h / w); g.fillStyle = grd; g.fillRect(0, 0, w, w); g.restore();
}, 1);
const PETAL = bake(12, 8, (g, w, h) => { g.fillStyle = '#ffc3d8'; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 2.4, 0, 0, TAU); g.fill(); g.fillStyle = '#fff0f5'; g.beginPath(); g.ellipse(w * 0.4, h * 0.4, w / 5, h / 6, 0, 0, TAU); g.fill(); }, 2);
const STAR = bake(32, 32, (g, w) => {
  const c = w / 2; g.fillStyle = '#fffbe8';
  g.beginPath(); g.moveTo(c, 0); g.quadraticCurveTo(c, c, w, c); g.quadraticCurveTo(c, c, c, w); g.quadraticCurveTo(c, c, 0, c); g.quadraticCurveTo(c, c, c, 0); g.fill();
}, 1);
const NOTE = bake(1, 0.7, (g, w, h) => {
  g.fillStyle = '#fff6e2'; g.strokeStyle = '#c99a5e'; g.lineWidth = 0.04;
  g.beginPath(); if (g.roundRect) g.roundRect(0.04, 0.06, w - 0.08, h - 0.12, 0.06); else g.rect(0.04, 0.06, w - 0.08, h - 0.12); // iOS 15 has no roundRect
  g.fill(); g.stroke();
  g.beginPath(); g.moveTo(0.05, 0.08); g.lineTo(w / 2, h * 0.52); g.lineTo(w - 0.05, 0.08); g.stroke();
  g.fillStyle = '#d9534f'; g.beginPath(); g.arc(w / 2, h * 0.52, 0.09, 0, TAU); g.fill();
  g.fillStyle = '#f7a6a3'; g.beginPath(); g.arc(w / 2 - 0.025, h * 0.5, 0.03, 0, TAU); g.fill();
}, 96);

// Mistlings: soft cloud bodies with toy faces, baked once per kind and mood.
export const MIST_LOOK = {
  wisp: {size: 0.82, top: '#eef3ff', body: '#a9bdf2', edge: '#7a90d4', mood: 'sad'},
  puff: {size: 0.98, top: '#f6eefc', body: '#bba8d4', edge: '#8a74aa', mood: 'grumpy'},
  flicker: {size: 0.66, top: '#f0fffc', body: '#9fe0d6', edge: '#62b4a8', mood: 'shy'},
  sulk: {size: 1.32, top: '#c8cbee', body: '#7d81bf', edge: '#4f5390', mood: 'grumpy'},
  fog: {size: 2.7, top: '#fbfaff', body: '#cfcae0', edge: '#9a94b6', mood: 'sleepy'},
  wall: {size: 1.1, top: '#ffffff', body: '#e6e1ef', edge: '#bdb5cf', mood: 'none'},
  calm: {size: 1, top: '#fffbe8', body: '#ffe08a', edge: '#ffb347', mood: 'happy'},
};
function mistSprite(look, mood) {
  const px = 150;
  return bake(1.3, 1.2, g => {
    const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
    const shape = () => { blob(0.65, 0.66, 0.36); blob(0.4, 0.74, 0.25); blob(0.9, 0.74, 0.25); blob(0.52, 0.47, 0.25); blob(0.79, 0.45, 0.22); g.fillRect(0.4, 0.74, 0.5, 0.24); blob(0.4, 0.86, 0.12); blob(0.9, 0.86, 0.12); };
    g.save(); g.shadowColor = look.edge; g.shadowBlur = 0.12 * px; g.fillStyle = look.edge; g.globalAlpha = 0.55; shape(); g.restore();
    const grd = g.createRadialGradient(0.52, 0.42, 0.04, 0.65, 0.66, 0.55);
    grd.addColorStop(0, look.top); grd.addColorStop(0.55, look.body); grd.addColorStop(1, look.edge);
    g.fillStyle = grd; shape();
    // wispy tail puffs
    g.globalAlpha = 0.55; g.fillStyle = look.body; blob(0.3, 1.02, 0.07); blob(1.0, 1.04, 0.055); g.globalAlpha = 1;
    if (mood === 'none') return;
    const ex = [0.55, 0.77], ey = 0.68;
    g.fillStyle = 'rgba(255,150,180,.45)'; for (const x of [0.46, 0.86]) { g.beginPath(); g.ellipse(x, 0.78, 0.065, 0.04, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#2b2440'; g.strokeStyle = '#2b2440'; g.lineWidth = 0.028; g.lineCap = 'round';
    if (mood === 'happy' || mood === 'blink' || mood === 'sleepy') {
      for (const x of ex) {
        g.beginPath();
        if (mood === 'happy') g.arc(x, ey + 0.02, 0.05, Math.PI * 1.1, Math.PI * 1.9);
        else if (mood === 'sleepy') { g.arc(x, ey - 0.01, 0.05, Math.PI * 0.1, Math.PI * 0.9); }
        else { g.moveTo(x - 0.045, ey); g.lineTo(x + 0.045, ey); }
        g.stroke();
      }
    } else if (mood === 'puzzled') {
      for (const x of ex) { g.beginPath(); for (let a = 0; a < 3.6 * Math.PI; a += 0.3) { const r = 0.012 + a * 0.0045; g.lineTo(x + Math.cos(a) * r, ey + Math.sin(a) * r); } g.stroke(); }
    } else {
      const look2 = mood === 'shy' ? 0.02 : 0;
      for (const x of ex) {
        g.beginPath(); g.ellipse(x + look2, ey, 0.04, 0.058, 0, 0, TAU); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + look2 - 0.013, ey - 0.022, 0.014, 0, TAU); g.fill(); g.fillStyle = '#2b2440';
      }
      if (mood === 'sad') { g.beginPath(); g.moveTo(0.5, 0.6); g.lineTo(0.59, 0.585); g.moveTo(0.82, 0.6); g.lineTo(0.73, 0.585); g.stroke(); g.fillStyle = '#9fd0ff'; g.beginPath(); g.ellipse(0.5, 0.77, 0.018, 0.03, 0, 0, TAU); g.fill(); g.fillStyle = '#2b2440'; }
      if (mood === 'grumpy') { g.beginPath(); g.moveTo(0.49, 0.59); g.lineTo(0.6, 0.62); g.moveTo(0.83, 0.59); g.lineTo(0.72, 0.62); g.stroke(); }
    }
    g.beginPath();
    if (mood === 'happy') g.arc(0.66, 0.76, 0.045, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (mood === 'sad' || mood === 'grumpy') g.arc(0.66, 0.81, 0.035, 1.2 * Math.PI, 1.8 * Math.PI);
    else if (mood === 'puzzled') { g.moveTo(0.62, 0.79); g.quadraticCurveTo(0.66, 0.76, 0.7, 0.8); }
    else g.arc(0.66, 0.77, 0.022, 0, TAU);
    g.stroke();
  }, px);
}

// ------------------------------------------------------------------------------ particles
const P_MAX = 360;
class Particles {
  constructor() {
    this.n = 0;
    const f = () => new Float32Array(P_MAX);
    Object.assign(this, {x: f(), v: f(), vx: f(), vv: f(), age: f(), life: f(), size: f(), grav: f(), spin: f(), kind: new Uint8Array(P_MAX)});
    this.sprites = [GLOWS.gold, GLOWS.warm, GLOWS.green, GLOWS.cool, GLOWS.pink, STAR, PETAL];
  }
  /** kind: 0 gold, 1 warm, 2 green, 3 cool, 4 pink, 5 star, 6 petal (drawn normally). */
  add(kind, x, v, vx, vv, life, size, grav = 0) {
    if (this.n >= P_MAX) return;
    const i = this.n++;
    this.kind[i] = kind; this.x[i] = x; this.v[i] = v; this.vx[i] = vx; this.vv[i] = vv; this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.grav[i] = grav; this.spin[i] = Math.random() * TAU;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.swap(i, --this.n); i--; continue; }
      this.vv[i] += this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt; this.v[i] += this.vv[i] * dt;
      if (this.kind[i] === 6) { this.vx[i] += Math.sin(this.age[i] * 3 + this.spin[i]) * dt * 0.6; this.spin[i] += dt * 2; }
      else { this.vx[i] *= 1 - dt * 1.2; this.vv[i] *= 1 - dt * 1.2; }
    }
  }
  swap(a, b) { for (const k of ['x', 'v', 'vx', 'vv', 'age', 'life', 'size', 'grav', 'spin', 'kind']) this[k][a] = this[k][b]; }
  draw(ctx, k, ox, oy) {
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (let i = 0; i < this.n; i++) {
        const kind = this.kind[i], add = kind !== 6;
        if (add !== !!pass) continue;
        const t = this.age[i] / this.life[i], a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        const s = this.size[i] * k * (kind === 5 ? 1 - t * 0.6 : 1), x = this.x[i] * k + ox, y = this.v[i] * k + oy;
        if (x < -s || y < -s || x > ctx.canvas.width + s || y > ctx.canvas.height + s) continue;
        ctx.globalAlpha = clamp(a, 0, 1);
        if (kind === 6) {
          const c = Math.cos(this.spin[i]), sn = Math.sin(this.spin[i]);
          ctx.setTransform(c * s / 12, sn * s / 12, -sn * s / 12 * Math.abs(Math.cos(this.spin[i] * 1.7)), c * s / 12, x, y);
          ctx.drawImage(PETAL, -6, -4, 12, 8);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else ctx.drawImage(this.sprites[kind], x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------------------ the stage
export class TrailStage {
  constructor(canvas, manifest, base, {touch = false, quiet = false} = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {alpha: false});
    this.m = manifest; this.base = base; this.touch = touch; this.quiet = quiet;
    this.versions = manifest.versions || {};
    this.dprCap = 2; this.budget = touch ? 0.65 : 1;
    this.cam = {x: 0, v: 0, zoom: 1, targetZoom: 1, shake: 0, kickX: 0, kickV: 0};
    this.actors = []; this.lights = []; this.texts = []; this.mist = [];
    this.ring = null; this.marker = null; this.fade = 0; this.fadeColor = '#000'; this.battle = 0;
    this.lit = new Set(); this.opened = new Set(); this.hidden = new Set();
    this.particles = new Particles();
    this.time = 0; this.frameMs = []; this.stats = {draws: 0, frame: 0};
    this.mists = {};
    for (const [kind, look] of Object.entries(MIST_LOOK)) {
      this.mists[kind] = {base: mistSprite(look, look.mood), blink: mistSprite(look, look.mood === 'none' ? 'none' : 'blink'), puzzled: mistSprite(look, 'puzzled'), happy: mistSprite(look, 'happy')};
    }
    this.mists.calm.base = this.mists.calm.happy;
    this.order = []; this.pool = [];
    this.buildProps();
    this.buildLife();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();
  }

  url(file) { const v = this.versions[file]; return new URL(file + (v ? `?v=${v}` : ''), this.base).href; }

  async image(file) {
    const res = await fetch(this.url(file));
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    const blob = await res.blob();
    if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(blob); } catch {} }
    const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode(); return img;
  }

  /** Load the plate tiles, the prop atlas and every friend's sheet. onProgress(0..1). */
  async load(onProgress = () => {}) {
    const m = this.m, jobs = [];
    let done = 0;
    const tick = p => p.then(v => { onProgress(++done / jobs.length); return v; });
    this.tiles = m.plate.tiles.map(t => ({...t, img: null}));
    for (const t of this.tiles) jobs.push(tick(this.image(t.file).then(img => { t.img = img; })));
    jobs.push(tick(this.image(m.sprites.file).then(img => { this.atlas = img; })));
    this.cast = {};
    // Pip comes first; the friends Pip meets later stream in behind the title
    jobs.push(tick(this.loadFriend('pip')));
    await Promise.all(jobs);
    this.ready = true;
    this.rest = Promise.all(Object.keys(m.cast).filter(n => n !== 'pip').map(n => this.loadFriend(n).catch(() => this.loadFriend(n))));
  }
  loadFriend(name) { const c = this.m.cast[name]; return this.image(c.file).then(img => { this.cast[name] = {...c, img}; }); }

  buildProps() {
    const items = this.m.sprites.items;
    this.props = this.m.props.map(p => {
      const it = items[p.sprite];
      const s = p.s, k = s / (it.ppu || SPRITE_PPU), v = vOf(p.y, p.z);
      return {...p, it, litIt: items[`${p.sprite}:lit`] || null, k, v, key: p.z * COS + p.y * SIN,
        left: p.x - it.pivot[0] * k, top: v - it.pivot[1] * k, w: it.w * k, h: it.h * k, fade: 1,
        tall: /^(tree_|great_oak|toadstool)/.test(p.kind),
        light: it.light ? [(it.light[0] - it.pivot[0]) * k, (it.light[1] - it.pivot[1]) * k] : null};
    });
    this.propById = Object.fromEntries(this.props.filter(p => p.id).map(p => [p.id, p]));
  }

  buildLife() {
    const m = this.m, pond = m.props.find(p => p.id === 'chest-pond');
    const water = this.m.water || null;
    this.koi = null; this.butterflies = []; this.motes = []; this.fireflies = [];
    const b = this.budget;
    if (water) {
      this.koi = new KoiPond({x: water.x, y: vOf(water.y, water.z), rx: water.rx * 0.92, rz: water.rz * 0.92, squash: SIN, count: 6, length: 0.42, budget: b});
    }
    for (const area of m.meadows || []) {
      this.butterflies.push(new Butterflies({x: area.x - area.w / 2, y: vOf(area.y, area.z) - area.h * SIN / 2, w: area.w, h: area.h * SIN, count: area.count, span: 0.22, budget: b}));
    }
    // warm motes drifting over the lawns, and fireflies in the shade of the wood
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const I of m.islets || []) {
      const n = Math.round((I.id === 'wood' ? 16 : 7) * b);
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.85;
        (I.id === 'wood' || r() < 0.3 ? this.fireflies : this.motes).push({x: I.x + Math.cos(a) * I.rx * d, z: I.z + Math.sin(a) * I.rz * d, y: I.y, seed: r() * 100, rate: 0.6 + r() * 0.8, h: 0.4 + r() * 1.6});
      }
    }
    this.blossoms = this.props.filter(p => p.kind === 'tree_blossom');
    this.petalClock = 0;
  }

  resize() {
    const c = this.canvas, w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    this.dpr = Math.min(devicePixelRatio || 1, this.dprCap);
    const W = Math.round(w * this.dpr), H = Math.round(h * this.dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    this.cssW = w; this.cssH = h;
    // world units across the view: about 8 on a portrait phone, more on wider screens
    this.unit = clamp(Math.min(w / 8.4, h / 11.2), 38, 96);
    this.vignette = null;
  }

  // ---------------------------------------------------------------- camera
  get k() { return this.unit * this.cam.zoom * this.dpr; }
  /** Device px origin for world x / screen v. */
  origin() {
    const k = this.k, W = this.canvas.width, H = this.canvas.height;
    const shake = this.quiet ? 0 : this.cam.shake ** 2 * 0.18;
    const sx = shake ? Math.sin(this.time * 47) * shake : 0, sv = shake ? Math.cos(this.time * 53) * shake : 0;
    return {ox: W / 2 - (this.cam.x + sx + this.cam.kickX) * k, oy: H / 2 - (this.cam.v + sv + this.cam.kickV) * k};
  }
  /** Keep the view inside the plate. */
  clampCam(x, v) {
    const halfW = this.cssW / 2 / (this.unit * this.cam.zoom), halfH = this.cssH / 2 / (this.unit * this.cam.zoom);
    const cx = PLATE.x1 - PLATE.x0 > 2 * halfW ? clamp(x, PLATE.x0 + halfW, PLATE.x1 - halfW) : (PLATE.x0 + PLATE.x1) / 2;
    const cv = PLATE.v1 - PLATE.v0 > 2 * halfH ? clamp(v, PLATE.v0 + halfH, PLATE.v1 - halfH) : (PLATE.v0 + PLATE.v1) / 2;
    return [cx, cv];
  }
  snap(x, y, z) { [this.cam.x, this.cam.v] = this.clampCam(x, vOf(y, z) - 0.6); }
  /** Follow a point, looking a little ahead of its motion. */
  follow(x, y, z, vx, vz, dt, lambda = 5) {
    const [tx, tv] = this.clampCam(x + vx * 0.35, vOf(y, z) - 0.6 + vz * 0.35 * SIN);
    this.cam.x = damp(this.cam.x, tx, lambda, dt); this.cam.v = damp(this.cam.v, tv, lambda * 0.8, dt);
  }
  /** CSS px of a world point. */
  toScreen(x, y, z) {
    const u = this.unit * this.cam.zoom;
    return {x: this.cssW / 2 + (x - this.cam.x - this.cam.kickX) * u, y: this.cssH / 2 + (vOf(y, z) - this.cam.v - this.cam.kickV) * u};
  }
  /** World ground point under CSS px (sx, sy); `heightAt(x, z)` refines the lawn height. */
  toWorld(sx, sy, heightAt) {
    const u = this.unit * this.cam.zoom, x = this.cam.x + (sx - this.cssW / 2) / u, v = this.cam.v + (sy - this.cssH / 2) / u;
    let y = 0, z = v / SIN;
    for (let i = 0; i < 3; i++) { const h = heightAt(x, z); if (h === null) break; y = h; z = (v + y * COS) / SIN; }
    return {x, y, z};
  }
  shake(amount) { if (!this.quiet) this.cam.shake = Math.min(1, this.cam.shake + amount); }

  // ---------------------------------------------------------------- effects
  burst(x, y, z, {kind = 0, count = 12, speed = 2.2, size = 0.4, life = 0.8, up = 1.4, grav = 1.5} = {}) {
    const v = vOf(y, z), n = Math.round(count * (this.quiet ? 0.3 : 1) * (this.budget < 1 ? 0.75 : 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = speed * (0.4 + Math.random() * 0.6);
      this.particles.add(kind, x, v, Math.cos(a) * sp, Math.sin(a) * sp * 0.6 - up, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), grav);
    }
  }
  text(str, x, y, z, color = '#fff6d8', size = 1) { this.texts.push({str, x, v: vOf(y, z), age: 0, color, size}); if (this.texts.length > 8) this.texts.shift(); }

  setLit(id, on = true) { if (on) this.lit.add(id); else this.lit.delete(id); }

  // ---------------------------------------------------------------- the frame
  update(dt) {
    this.time += dt;
    this.particles.update(dt);
    for (const t of this.texts) t.age += dt;
    this.texts = this.texts.filter(t => t.age < 1.3);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 1.6);
    this.cam.kickX = damp(this.cam.kickX, 0, 14, dt); this.cam.kickV = damp(this.cam.kickV, 0, 14, dt);
    this.cam.zoom = damp(this.cam.zoom, this.cam.targetZoom, 4, dt);
    if (this.koi) { this.koi.quiet = this.quiet; this.koi.update(dt, this.time); }
    for (const b of this.butterflies) { b.quiet = this.quiet; b.update(dt, this.time); }
    // petals drift from the blossom trees on screen
    if (!this.quiet && this.blossoms.length) {
      this.petalClock -= dt;
      if (this.petalClock <= 0) {
        this.petalClock = 0.5 / this.budget;
        const t = this.blossoms[Math.floor(Math.random() * this.blossoms.length)];
        if (this.onScreen(t)) this.particles.add(6, t.x + (Math.random() - 0.5) * 1.6, t.v - 2.4 - Math.random() * 1.2, 0.25, 0.32, 4.5, 0.17, 0);
      }
    }
    for (const m of this.mist) if (m.clearing) m.alpha = Math.max(0, m.alpha - dt * 0.9);
  }

  onScreen(p) {
    const u = this.unit * this.cam.zoom, hw = this.cssW / 2 / u + 1, hh = this.cssH / 2 / u + 1;
    return p.left + p.w > this.cam.x - hw && p.left < this.cam.x + hw && p.top + p.h > this.cam.v - hh && p.top < this.cam.v + hh;
  }

  draw() {
    const t0 = performance.now();
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, k = this.k, {ox, oy} = this.origin();
    let draws = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    // the plate: tiles on rounded device edges, so neighbours never show a seam
    const px0 = Math.round(PLATE.x0 * k + ox), py0 = Math.round(PLATE.v0 * k + oy), s = k / PPU;
    if (px0 > 0 || py0 > 0 || PLATE.x1 * k + ox < W || PLATE.v1 * k + oy < H) { ctx.fillStyle = SKY; ctx.fillRect(0, 0, W, H); }
    for (const t of this.tiles || []) {
      if (!t.img) continue;
      const x0 = Math.round(PLATE.x0 * k + ox + t.x * s), y0 = Math.round(PLATE.v0 * k + oy + t.y * s);
      const x1 = Math.round(PLATE.x0 * k + ox + (t.x + t.w) * s), y1 = Math.round(PLATE.v0 * k + oy + (t.y + t.h) * s);
      if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) continue;
      ctx.drawImage(t.img, x0, y0, x1 - x0, y1 - y0); draws++;
    }
    // on the water: koi, then glints
    if (this.koi) { this.koi.draw(ctx, {s: k, x: ox, y: oy}, 1); ctx.setTransform(1, 0, 0, 1, 0, 0); draws += this.koi.fish.length * 3; }
    // ground light pools and shadows
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights) {
      if (!l.alpha || !l.pool) continue;
      const x = l.x * k + ox, y = vOf(l.y, l.z) * k + oy, r = l.pool * k;
      ctx.globalAlpha = l.alpha * 0.55 * (0.9 + 0.1 * Math.sin(this.time * 2.3 + l.x));
      ctx.drawImage(GLOWS.warm, x - r, y - r * SIN, r * 2, r * 2 * SIN); draws++;
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const a of this.actors) {
      if (a.hidden || a.shadow === false) continue;
      const x = a.x * k + ox, y = vOf(a.y, a.z) * k + oy, lift = a.kind === 'foe' ? 0.45 : 1 - Math.min(0.6, (a.hop || 0) * 0.8);
      const r = (a.kind === 'foe' ? MIST_LOOK[a.type]?.size * 0.42 || 0.3 : 0.36) * (a.scale || 1) * k * lift;
      ctx.globalAlpha = (a.alpha ?? 1) * (a.kind === 'foe' ? 0.6 : 0.85);
      ctx.drawImage(SHADOW, x - r, y - r * 0.42, r * 2, r * 0.84); draws++;
    }
    ctx.globalAlpha = 1;
    // depth-sorted sprites: scenery, friends, Mistlings, notes, mist walls
    const order = this.order; order.length = 0;
    const player = this.actors.find(a => a.player);
    for (const p of this.props) if (!this.hidden.has(p.id) && this.onScreen(p)) order.push(this.rec(0, p, p.key));
    for (const a of this.actors) if (!a.hidden) order.push(this.rec(1, a, a.z * COS + a.y * SIN + (a.sortBias || 0)));
    for (const m of this.mist) if (m.alpha > 0.01) order.push(this.rec(2, m, m.z * COS + m.y * SIN));
    // insertion sort: the order barely changes from frame to frame
    for (let i = 1; i < order.length; i++) { const r = order[i]; let j = i - 1; while (j >= 0 && order[j].key > r.key) { order[j + 1] = order[j]; j--; } order[j + 1] = r; }
    const pv = player ? vOf(player.y + 0.6, player.z) : 0, pkey = player ? player.z * COS + player.y * SIN : 0;
    for (const r of order) {
      if (r.type === 0) {
        const p = r.ref, it = this.lit.has(p.id) && p.litIt ? p.litIt : p.it, sc = k * p.k;
        // trees in front of the player fade so nobody is ever lost behind a canopy
        const covers = player && p.tall && p.key > pkey && player.x > p.left && player.x < p.left + p.w && pv > p.top && pv < p.top + p.h * 0.85;
        p.fade = damp(p.fade, covers ? 0.42 : 1, 8, 1 / 60);
        ctx.globalAlpha = p.fade * (this.opened.has(p.id) ? 0.78 : 1);
        ctx.drawImage(this.atlas, it.x, it.y, it.w, it.h, Math.round(p.left * k + ox), Math.round(p.top * k + oy), Math.round(it.w * sc), Math.round(it.h * sc));
        draws++;
      } else if (r.type === 1) draws += this.drawActor(ctx, r.ref, k, ox, oy);
      else draws += this.drawMist(ctx, r.ref, k, ox, oy);
    }
    ctx.globalAlpha = 1;
    // air: butterflies, glows, motes, fireflies, particles
    for (const b of this.butterflies) { b.draw(ctx, {s: k, x: ox, y: oy}, 1); draws += b.list.length * 3; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights) {
      if (!l.alpha) continue;
      const x = l.x * k + ox + (l.dx || 0) * k, y = vOf(l.y, l.z) * k + oy + (l.dv || 0) * k, r = l.r * k * (0.92 + 0.08 * Math.sin(this.time * 3.1 + l.x * 3));
      ctx.globalAlpha = l.alpha; ctx.drawImage(l.cool ? GLOWS.cool : GLOWS.gold, x - r, y - r, r * 2, r * 2); draws++;
    }
    const tt = this.time;
    for (const f of this.motes) {
      const x = (f.x + Math.sin(tt * 0.3 * f.rate + f.seed) * 0.8) * k + ox, y = vOf(f.y + f.h + Math.sin(tt * 0.5 * f.rate + f.seed * 2) * 0.3, f.z) * k + oy;
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(tt * f.rate + f.seed); const r = 0.09 * k;
      ctx.drawImage(GLOWS.warm, x - r, y - r, r * 2, r * 2); draws++;
    }
    for (const f of this.fireflies) {
      const x = (f.x + Math.sin(tt * 0.4 * f.rate + f.seed) * 0.9 + Math.sin(tt * 1.3 * f.rate + f.seed * 3) * 0.25) * k + ox;
      const y = vOf(f.y + f.h + Math.cos(tt * 0.35 * f.rate + f.seed * 2) * 0.35, f.z) * k + oy;
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const a = this.quiet ? 0.5 : Math.pow(Math.max(0, Math.sin(tt * 1.7 * f.rate + f.seed)), 5);
      if (a < 0.03) continue;
      ctx.globalAlpha = a; const r = 0.14 * k; ctx.drawImage(GLOWS.green, x - r, y - r, r * 2, r * 2); draws++;
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    this.particles.draw(ctx, k, ox, oy); draws += this.particles.n;
    this.drawOverlay(ctx, k, ox, oy, W, H);
    this.stats.draws = draws;
    this.stats.frame = performance.now() - t0;
  }

  rec(type, ref, key) {
    const r = this.pool[this.order.length] ||= {type: 0, ref: null, key: 0};
    r.type = type; r.ref = ref; r.key = key;
    return r;
  }

  drawActor(ctx, a, k, ox, oy) {
    const x = a.x * k + ox;
    if (a.kind === 'friend') {
      const c = this.cast[a.name];
      if (!c) return 0;
      const pose = c.poses[a.pose] || c.poses.idle0, sc = k / SPRITE_PPU * (a.scale || 1);
      const y = vOf(a.y + (a.hop || 0), a.z) * k + oy;
      ctx.globalAlpha = a.alpha ?? 1;
      if (a.sleepy) {
        ctx.setTransform(0, sc, -sc, 0, x, y - 0.15 * k);
        ctx.drawImage(c.img, pose[0], pose[1], c.cell[0], c.cell[1], -c.pivot[0], -c.pivot[1], c.cell[0], c.cell[1]);
      } else {
        ctx.setTransform(a.flip ? -sc : sc, 0, 0, sc * (a.squash || 1), x, y);
        ctx.drawImage(c.img, pose[0], pose[1], c.cell[0], c.cell[1], -c.pivot[0], -c.pivot[1], c.cell[0], c.cell[1]);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (a.flash > 0) { // a warm flash when healed or hit
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a.flash * 0.8; const r = 0.7 * k;
        ctx.drawImage(a.flashCool ? GLOWS.cool : GLOWS.warm, x - r, y - 0.55 * k - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      return 1;
    }
    if (a.kind === 'foe') {
      const look = MIST_LOOK[a.type] || MIST_LOOK.wisp, set = this.mists[a.calm > 0.5 ? 'calm' : a.type] || this.mists.wisp;
      const phase = this.time * 2.2 + (a.phase || 0), bob = this.quiet ? 0 : Math.sin(phase) * 0.08;
      const size = look.size * (a.scale || 1), lift = 0.32 + bob + (a.rise || 0);
      const blink = (Math.sin(this.time * 0.9 + (a.phase || 0) * 3) > 0.985);
      const img = a.calm > 0.5 ? set.happy : a.puzzled ? set.puzzled : blink ? set.blink : set.base;
      const sq = this.quiet ? 1 : 1 + Math.sin(phase * 2) * 0.04, w = size * 1.3 * k / 1.3 * sq, h = size * 1.2 * k / 1.3 / sq;
      const y = vOf(a.y + lift, a.z) * k + oy;
      ctx.globalAlpha = (a.alpha ?? 1) * (a.hidden2 ? 0.35 : 1);
      if (a.flipX) ctx.setTransform(-1, 0, 0, 1, x * 2, 0); // mirror about the Mistling's own centre line
      ctx.drawImage(img, x - w * 0.5, y - h * 0.85, w, h);
      if (a.flipX) ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (a.calm > 0 && a.calm <= 0.5) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a.calm * 1.4; ctx.drawImage(GLOWS.gold, x - w * 0.6, y - h * 0.9, w * 1.2, w * 1.2); ctx.globalCompositeOperation = 'source-over'; }
      if (a.hit > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a.hit; ctx.drawImage(GLOWS.gold, x - w * 0.55, y - h * 0.85, w * 1.1, w * 1.1); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = 1;
      return 1;
    }
    if (a.kind === 'note') {
      const bob = this.quiet ? 0 : Math.sin(this.time * 2 + a.x) * 0.05, y = vOf(a.y + 0.28 + bob, a.z) * k + oy, w = 0.42 * k, h = w * 0.7;
      ctx.drawImage(NOTE, x - w / 2, y - h, w, h);
      if (!this.quiet && Math.sin(this.time * 3 + a.x) > 0.6) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8; const r = 0.12 * k; ctx.drawImage(STAR, x + w * 0.3 - r, y - h - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      return 1;
    }
    return 0;
  }

  drawMist(ctx, m, k, ox, oy) {
    const img = this.mists.wall.base;
    let n = 0;
    for (let i = 0; i < m.puffs.length; i++) {
      const p = m.puffs[i], t = this.time * (0.6 + i * 0.07) + i;
      const x = (m.x + p[0] + Math.sin(t) * 0.08) * k + ox, y = vOf(m.y + p[2] + Math.cos(t * 1.3) * 0.06 + (m.clearing ? (1 - m.alpha) * 1.2 : 0), m.z + p[1]) * k + oy;
      const w = p[3] * k, h = w * 0.92;
      ctx.globalAlpha = m.alpha * 0.92; ctx.drawImage(img, x - w / 2, y - h * 0.8, w, h); n++;
    }
    ctx.globalAlpha = 1;
    return n;
  }

  drawOverlay(ctx, k, ox, oy, W, H) {
    // floating words
    for (const t of this.texts) {
      const a = t.age < 0.15 ? t.age / 0.15 : t.age > 0.9 ? 1 - (t.age - 0.9) / 0.4 : 1;
      const x = t.x * k + ox, y = (t.v - 1.4 - t.age * 0.5) * k + oy, size = Math.round(Math.max(15, 0.36 * k / this.cam.zoom) * t.size);
      ctx.globalAlpha = clamp(a, 0, 1); ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = 'rgba(58,34,20,.85)';
      ctx.strokeText(t.str, x, y); ctx.fillStyle = t.color; ctx.fillText(t.str, x, y);
    }
    ctx.globalAlpha = 1;
    // the timing ring: tap when the shrinking ring meets the inner one
    if (this.ring) {
      const r = this.ring, x = r.x * k + ox, y = vOf(r.y + r.h, r.z) * k + oy, p = clamp(r.t / r.dur, 0, 1);
      const inner = 0.42 * k, outer = inner * (2.6 - 1.6 * p), sweet = r.sweet;
      ctx.lineWidth = Math.max(3, 0.07 * k);
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(x, y, inner, 0, TAU); ctx.stroke();
      ctx.strokeStyle = sweet ? '#ffe27a' : 'rgba(255,214,120,.9)'; ctx.lineWidth = Math.max(3, (sweet ? 0.11 : 0.07) * k);
      ctx.beginPath(); ctx.arc(x, y, outer, 0, TAU); ctx.stroke();
      if (sweet) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(GLOWS.gold, x - inner * 1.6, y - inner * 1.6, inner * 3.2, inner * 3.2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    }
    // the target marker: a bouncing arrow over the chosen Mistling
    if (this.marker) {
      const m = this.marker, x = m.x * k + ox, y = vOf(m.y + m.h + 0.25 + (this.quiet ? 0 : Math.abs(Math.sin(this.time * 4)) * 0.15), m.z) * k + oy, s = 0.2 * k;
      ctx.fillStyle = '#ffd96b'; ctx.strokeStyle = 'rgba(80,46,20,.9)'; ctx.lineWidth = Math.max(2, 0.04 * k);
      ctx.beginPath(); ctx.moveTo(x - s, y - s * 1.2); ctx.lineTo(x + s, y - s * 1.2); ctx.lineTo(x, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // battle vignette and fades
    if (this.battle > 0.01) {
      if (!this.vignette || this.vignette.width !== W || this.vignette.height !== H) {
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        const grd = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.25, W / 2, H * 0.45, Math.max(W, H) * 0.75);
        grd.addColorStop(0, 'rgba(24,14,40,0)'); grd.addColorStop(1, 'rgba(24,14,40,.62)');
        g.fillStyle = grd; g.fillRect(0, 0, W, H); this.vignette = c;
      }
      ctx.globalAlpha = this.battle; ctx.drawImage(this.vignette, 0, 0); ctx.globalAlpha = 1;
    }
    if (this.fade > 0.003) { ctx.globalAlpha = this.fade; ctx.fillStyle = this.fadeColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  /** Adaptive resolution: lower the pixel ratio when frames run long, raise it again when there's room. */
  govern(dt) {
    this.frameMs.push(dt * 1000);
    if (this.frameMs.length < 120) return;
    const sorted = [...this.frameMs].sort((a, b) => a - b), median = sorted[60];
    this.frameMs.length = 0;
    if (document.hidden) return;
    const before = this.dprCap;
    if (median > 21 && this.dprCap > 1.25) this.dprCap = Math.max(1.25, this.dprCap - 0.25);
    else if (median < 15 && this.dprCap < 2) this.dprCap = Math.min(2, this.dprCap + 0.25);
    if (before !== this.dprCap) this.resize();
  }
}
