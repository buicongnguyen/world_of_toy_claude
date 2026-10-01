// The Lantern Picnic, light edition: a pre-rendered 2.5D stage drawn on a plain 2D canvas.
//
// tools/bake (`npm run assets:2d`) renders the 3D clearing once into a background per layout and
// time of day, a perspective blanket pattern per blanket, and sprite atlases for fruit, friends and
// lanterns. Each layout's manifest carries the bake camera's view-projection, so a world point maps
// to exactly the pixel the 3D renderer painted it at. A frame is one cached background blit plus a
// few dozen sprites and particles: no WebGL, no shaders, no model decoding, no three.js download.
//
// Stage2D mirrors LanternWorld's public API, so the app, the story and the tests drive either one.
import {FRUITS, PLATE} from './picnic-game.js';
import {chapter, previewLantern, SKEWER, settleFruits} from './lantern-game.js';
import {shopItem, equipped} from './lantern-shop.js';
import {t} from './lantern-i18n.js';
import {approach, clamp, ease, lerp, random, Spring} from './engine/tween.js';
import {HourLife} from './lantern-life-hours.js';
import {Life2D} from './lantern-life.js';

const TAU = Math.PI * 2, REST_Y = 0.1, HELD_Y = 0.95;
export const FRIENDS = ['pip', 'momo', 'nori', 'juniper', 'bramble'];
export const TIMES = ['afternoon', 'golden', 'sunset', 'dusk', 'night'];
// Sprites are baked in neutral afternoon light; each hour's light multiplies them (close to the
// baked cloth's colour at that hour, kept a little brighter so friends stay readable after dark).
const TINT = {afternoon: [1, 1, 1], golden: [1, 0.93, 0.8], sunset: [1, 0.85, 0.76], dusk: [0.84, 0.8, 0.94], night: [0.78, 0.78, 0.96]};
const NIGHT = {afternoon: 0.15, golden: 0.35, sunset: 0.55, dusk: 0.85, night: 1};
// Pose flip-books: [atlas cell, seconds]. The toys move like stop-motion puppets.
const CLIPS = {idle: [['idle0', 1.3], ['idle1', 1.1]], talk: [['talk0', 0.18], ['idle0', 0.14]], walk: [['walk0', 0.12], ['walk1', 0.12], ['walk2', 0.12], ['walk3', 0.12]],
  wave: [['wave0', 0.18], ['wave1', 0.2], ['wave2', 0.2], ['wave1', 0.2], ['wave2', 0.2], ['wave0', 0.15]], cheer: [['cheer0', 0.2], ['cheer1', 0.3], ['cheer0', 0.2], ['cheer1', 0.3]],
  eat: [['eat0', 0.22], ['eat1', 0.25], ['eat0', 0.22], ['eat1', 0.25]], hop: [['hop0', 0.25], ['hop1', 0.35], ['hop0', 0.2]]};
const ONCE = new Set(['wave', 'cheer', 'eat', 'hop']);
const clipLength = clip => (CLIPS[clip] || CLIPS.idle).reduce((n, [, d]) => n + d, 0);

// ---------------------------------------------------------------------------- 4x4 maths (column-major, as three.js stores it)
function transform(m, x, y, z) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];
}
function invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return [(a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det];
}
/** A plain point with the one Vector3 convenience the app uses on character positions. */
const v3 = (x = 0, y = 0, z = 0) => ({x, y, z, clone() { return v3(this.x, this.y, this.z); }});
const fromWorld = a => v3(a.world[0], a.world[1], a.world[2]);

/** Which baked layout suits a viewport, by the same test the 3D renderer uses for its board. */
export function layoutFor(w, h, play = {top: 0, right: 0, bottom: 0, left: 0}) {
  if (!(w < 700 || h < 520)) return 'wide';
  const aw = Math.max(160, w - play.left - play.right), ah = Math.max(160, h - play.top - play.bottom);
  return aw / ah < 1.25 ? 'tall' : 'strip';
}

// ---------------------------------------------------------------------------- art loading
/** Fetches the baked art. Compressed files stay cached; big pictures are decoded only while needed.
 *  Manifests are always revalidated; a build lists each file's content hash in manifest.json, and the
 *  art is requested as <file>?v=<hash> so a new deploy can never be mixed with cached old pictures. */
export class StageArt {
  constructor(base) { this.base = base; this.blobs = new Map(); this.bitmaps = new Map(); this.manifests = new Map(); this.shared = null; this.versions = {}; }
  url(file) { const v = this.versions[file]; return new URL(v ? `${file}?v=${v}` : file, this.base).href; }
  fetch(file, {low = false} = {}) {
    if (!this.blobs.has(file)) {
      const request = fetch(this.url(file), low ? {priority: 'low'} : {}).then(r => { if (!r.ok) throw new Error(`Missing 2D art: ${file}`); return r.blob(); });
      request.catch(() => this.blobs.delete(file));
      this.blobs.set(file, request);
    }
    return this.blobs.get(file);
  }
  /** Decode off the main thread where the browser can (ImageBitmap), else through an <img>. */
  async decode(file) {
    const blob = await this.fetch(file);
    if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(blob); } catch {} }
    const img = new Image(), url = URL.createObjectURL(blob);
    img.src = url;
    try { await img.decode(); } finally { URL.revokeObjectURL(url); }
    return img;
  }
  /** A small picture that stays decoded (the sprite atlases). */
  sprite(file) {
    if (!this.bitmaps.has(file)) {
      const entry = {ready: null};
      entry.promise = this.decode(file).then(img => (entry.ready = img));
      entry.promise.catch(() => this.bitmaps.delete(file));
      this.bitmaps.set(file, entry);
    }
    return this.bitmaps.get(file);
  }
  ready(file) { return file ? this.bitmaps.get(file)?.ready || null : null; }
  async json(file) { const r = await fetch(new URL(file, this.base), {cache: 'no-cache'}); if (!r.ok) throw new Error(`Missing 2D manifest: ${file}`); return r.json(); }
  manifest(layout) {
    this.shared ??= this.json('manifest.json').then(shared => { this.versions = shared.versions || {}; return shared; });
    if (!this.manifests.has(layout)) {
      const request = Promise.all([this.json(`manifest-${layout}.json`), this.shared]).then(([m, shared]) => ({...m, shared, inverse: invert(m.camera.viewProj)}));
      request.catch(() => this.manifests.delete(layout));
      this.manifests.set(layout, request);
    }
    return this.manifests.get(layout);
  }
}

// ---------------------------------------------------------------------------- 2D camera: image px -> screen px
// A pose is a zoom `s` (screen px per image px) and the image point `cx, cy` shown at the centre
// of the canvas. Poses blend in log-zoom, so pushes in and out feel like a dolly, not a slide.
const blendPose = (a, b, k) => ({s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), k)), cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k)});
class Camera2D {
  constructor(stage) { this.stage = stage; this.time = 0; this.trauma = 0; this.shot = null; this.holdPose = null; this.focused = null; this.blend = null; this.orbiting = false; this.orbitPose = null; this.base = null; this.current = null; }
  /** The pose that shows image point `p` at screen point `at` with zoom `s`. */
  poseAt(p, at, s) { const w = this.stage.width, h = this.stage.height; return {s, cx: p.x + (w / 2 - at.x) / s, cy: p.y + (h / 2 - at.y) / s}; }
  /** Zoom `k` times closer than the gameplay pose, with image point `p` placed in the play area. */
  closeOn(p, k, {high = 0.42} = {}) {
    const safe = this.stage.safeRect();
    return this.inside(this.poseAt(p, {x: safe.x + safe.w / 2, y: safe.y + safe.h * high}, this.base.s * k));
  }
  /** Keep a camera shot's view within the picture along any axis the picture can fill. */
  inside(pose) {
    const img = this.stage.m.image, hw = this.stage.width / 2 / pose.s, hh = this.stage.height / 2 / pose.s;
    return {...pose, cx: img.w >= hw * 2 ? clamp(pose.cx, hw, img.w - hw) : pose.cx, cy: img.h >= hh * 2 ? clamp(pose.cy, hh, img.h - hh) : pose.cy};
  }
  apply(pose) { this.shot = null; this.current = {...pose}; }
  move(from, to, duration, {curve = ease.inOutCubic, done} = {}) { this.shot = {from: {...from}, to: {...to}, t: 0, duration, curve, done}; }
  flyIn(duration = 3.2, done) {
    const to = this.base, img = this.stage.m.image, lamp = this.stage.lanternAnchor(2);
    const from = this.inside(this.poseAt({x: img.w / 2, y: lamp ? lamp.y : img.h * 0.3}, {x: this.stage.width / 2, y: this.stage.height * 0.45}, to.s * 1.6));
    this.apply(from);
    this.move(from, to, duration, {curve: ease.outCubic, done});
  }
  pushTo(point, {zoom = 1.6, duration = 1.4, hold = 2.2, done} = {}) {
    const to = this.closeOn(point, zoom);
    clearTimeout(this.hold);
    this.move(this.current || this.base, to, duration, {done: () => {
      this.holdPose = to;
      this.hold = setTimeout(() => { this.holdPose = null; this.move(to, this.base, 1.6, {done}); }, hold * 1000);
    }});
  }
  /** Dialogue framing: glide to a close shot on an image point and hold it until release(). */
  focus(point, {distance = 0.42, duration = 1.1} = {}) {
    if (!this.base || !point) return;
    clearTimeout(this.hold);
    const to = this.closeOn(point, clamp(0.55 / distance, 1.1, 1.45), {high: 0.5});
    this.holdPose = null;
    this.move(this.current || this.base, to, duration, {done: () => { if (this.focused === to) this.holdPose = to; }});
    this.focused = to;
  }
  release({duration = 1.3} = {}) {
    if (!this.focused) return;
    const from = this.current || this.focused;
    this.focused = null; this.holdPose = null;
    this.move(from, this.base, duration);
  }
  reset({glide = false} = {}) {
    clearTimeout(this.hold);
    this.shot = null; this.holdPose = null; this.focused = null;
    this.blend = glide && this.current ? {from: this.current, t: 0} : null;
    if (!glide && this.base) this.current = {...this.base};
  }
  get busy() { return !!(this.shot || this.blend || this.holdPose); }
  orbit(on, pose = null) {
    if (on === this.orbiting && pose === this.orbitPose) return;
    if (this.current) this.blend = {from: this.current, t: 0};
    this.orbiting = on; this.orbitPose = pose;
  }
  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  update(dt, quiet) {
    this.time += dt;
    let pose = this.base;
    if (!pose) return;
    if (this.shot) {
      const s = this.shot;
      s.t = Math.min(1, s.t + dt / s.duration);
      pose = blendPose(s.from, s.to, s.curve(s.t));
      if (s.t >= 1) { this.shot = null; s.done?.(); }
    } else if (this.holdPose) pose = this.holdPose;
    else if (this.orbiting) {
      // the title's slow drift: a gentle pan and breath in place of the 3D orbit
      const b = this.orbitPose || this.base, d = quiet ? 0 : 1;
      pose = {s: b.s * (1 + 0.025 * d * Math.sin(this.time * 0.09)), cx: b.cx + Math.sin(this.time * 0.07) * 40 * d / b.s, cy: b.cy + Math.cos(this.time * 0.05) * 14 * d / b.s};
    }
    if (this.blend && !this.shot) {
      this.blend.t = Math.min(1, this.blend.t + dt / 1.4);
      pose = blendPose(this.blend.from, pose, ease.inOutCubic(this.blend.t));
      if (this.blend.t >= 1) this.blend = null;
    }
    this.current = pose;
    let sx = 0, sy = 0;
    if (quiet) this.trauma = 0;
    else if (this.trauma > 0) {
      const s = this.trauma * this.trauma * 16;
      sx = Math.sin(this.time * 47) * s; sy = Math.sin(this.time * 53 + 1) * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    this.view = {s: pose.s, x: this.stage.width / 2 - pose.cx * pose.s + sx, y: this.stage.height / 2 - pose.cy * pose.s + sy};
  }
}

// ---------------------------------------------------------------------------- friends: posed sprites on the ground
class Friend2D {
  constructor(stage, name) {
    this.stage = stage; this.name = name;
    this.root = {visible: false, position: v3(), scale: {x: 1, y: 1, z: 1, setScalar(s) { this.x = this.y = this.z = s; }}};
    this.rest = 'idle'; this.clip = 'idle'; this.started = 0; this.facing = 1; this.path = null; this.offset = Math.random() * 3;
  }
  play(clip) { this.clip = clip; this.started = this.stage.time; }
  react(kind) { if (!this.path) this.play(kind); }
  setRest(clip) { this.rest = clip; if (!this.path && !ONCE.has(this.clip)) this.play(clip); }
  /** Face along a 3D yaw: the sprites were baked turned toward screen right. */
  face(angle) { this.facing = Math.sin(angle) < -0.05 ? -1 : 1; }
  place(p, face = 0) { Object.assign(this.root.position, {x: p.x, y: p.y ?? 0, z: p.z}); this.path = null; this.face(face); }
  walk(points, {face, done, speed = 1.3} = {}) { this.path = points.map(p => v3(p.x, p.y ?? 0, p.z)); this.speed = speed; this.pathDone = done; this.pathFace = face; this.play('walk'); }
  update(dt) {
    if (this.path?.length) {
      const target = this.path[0], p = this.root.position, dx = target.x - p.x, dz = target.z - p.z, dist = Math.hypot(dx, dz);
      if (dist < 0.04) {
        this.path.shift();
        if (!this.path.length) { this.path = null; if (this.pathFace !== undefined) this.face(this.pathFace); this.play(this.rest); this.pathDone?.(); }
      } else {
        const step = Math.min(dist, this.speed * dt), a = this.stage.imagePoint(p.x, 0, p.z);
        p.x += dx / dist * step; p.z += dz / dist * step; p.y = lerp(p.y, target.y, step / dist);
        const b = this.stage.imagePoint(p.x, 0, p.z);
        if (Math.abs(b.x - a.x) > 0.01) this.facing = b.x < a.x ? -1 : 1;
      }
    }
    if (ONCE.has(this.clip) && this.stage.time - this.started > clipLength(this.clip)) this.play(this.path ? 'walk' : this.rest);
  }
  /** The pose cell to draw, plus the hop and breath a flat sprite cannot do by itself. */
  frame(quiet) {
    const frames = CLIPS[this.clip] || CLIPS.idle, total = clipLength(this.clip), since = this.stage.time - this.started;
    let age = since + (this.clip === 'idle' ? this.offset : 0);
    if (!ONCE.has(this.clip)) age %= total;
    let pose = frames.at(-1)[0];
    for (const [name, d] of frames) { if (age < d) { pose = name; break; } age -= d; }
    let lift = 0, squash = 1;
    if (!quiet) {
      if (this.clip === 'hop' || this.clip === 'cheer') lift = Math.abs(Math.sin(since / total * Math.PI * (this.clip === 'hop' ? 1 : 2))) * 0.28;
      else if (this.clip === 'walk') lift = Math.abs(Math.sin(since * Math.PI * 4)) * 0.04;
      else squash = 1 + Math.sin(this.stage.time * 2.2 + this.offset * 2) * 0.014;
    }
    return {pose, lift, squash};
  }
}

// ---------------------------------------------------------------------------- particles, in image px
class Particles {
  constructor() { this.list = []; this.budget = 1; }
  add(p) { if (this.list.length < 700) this.list.push(p); }
  count(n) { return Math.max(1, Math.round(n * this.budget)); }
  burst(at, {color = '#ffd978', palette, count = 30, speed = 2.4, size = 0.26, up = 0.6, life = 0.9}, u) {
    for (let i = 0, n = this.count(count); i < n; i++) {
      const a = Math.random() * TAU, v = (0.4 + Math.random()) * speed * u * 0.55;
      this.add({x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - up * u * Math.random() * 0.8, g: u * 2.2, size: size * u * (0.35 + Math.random() * 0.4),
        color: palette ? palette[i % palette.length] : color, life: life * (0.6 + Math.random() * 0.6), age: 0});
    }
  }
  ring(at, {color = '#fff3c4', radius = 0.25, speed = 2.6, count = 24}, u) {
    for (let i = 0, n = this.count(count); i < n; i++) {
      const a = i / n * TAU, c = Math.cos(a), s = Math.sin(a);
      this.add({x: at.x + c * radius * u, y: at.y + s * radius * u * 0.5, vx: c * speed * u * 0.45, vy: s * speed * u * 0.22, g: 0, size: 0.07 * u, color, life: 0.5, age: 0});
    }
  }
  rise(at, {color = '#ffe7a8', count = 16, spread = 0.5, speed = 1.2, size = 0.16, life = 1.4}, u) {
    for (let i = 0, n = this.count(count); i < n; i++) this.add({x: at.x + (Math.random() - 0.5) * spread * u, y: at.y + (Math.random() - 0.5) * spread * u * 0.4,
      vx: (Math.random() - 0.5) * 0.2 * u, vy: -speed * u * (0.4 + Math.random() * 0.6), g: -0.15 * u, size: size * u * 0.5, color, life: life * (0.6 + Math.random() * 0.5), age: 0});
  }
  confetti(at, {count = 60, spread = 0.6, speed = 4, palette = ['#ff7aa2', '#ffd166', '#7fe0c8', '#a18bff', '#ffffff']}, u) {
    for (let i = 0, n = this.count(count); i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = (0.5 + Math.random()) * speed * u * 0.45;
      this.add({x: at.x + (Math.random() - 0.5) * spread * u, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: u * 2.4, drag: 2.2, size: 0.07 * u,
        color: palette[i % palette.length], life: 1.8 + Math.random(), age: 0, spin: Math.random() * TAU, paper: true});
    }
  }
  firework(at, palette, u) {
    const color = palette[Math.floor(Math.random() * palette.length)];
    for (let i = 0, n = this.count(70); i < n; i++) { const a = Math.random() * TAU, v = (0.6 + Math.random() * 0.4) * 5 * u; this.add({x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: u * 1.2, size: 0.1 * u, color, life: 1.3, age: 0}); }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) { this.list[i] = this.list.at(-1); this.list.pop(); continue; }
      const drag = 1 - dt * (p.drag || 0.8);
      p.vy += p.g * dt; p.vx *= drag; if (p.drag) p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.spin !== undefined) p.spin += dt * 8;
    }
  }
  /** Draws in canvas px; the context's transform must be the device-pixel scale only. */
  draw(ctx, view, dpr) {
    if (!this.list.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      if (p.paper) continue;
      const k = 1 - p.age / p.life, r = Math.max(0.7, p.size * view.s * (0.4 + k * 0.6));
      ctx.globalAlpha = k; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x * view.s + view.x, p.y * view.s + view.y, r, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of this.list) {
      if (!p.paper) continue;
      const k = 1 - p.age / p.life, r = Math.max(1, p.size * view.s), x = p.x * view.s + view.x, y = p.y * view.s + view.y, c = Math.cos(p.spin), s = Math.sin(p.spin);
      ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.color;
      ctx.setTransform(c * dpr, s * 0.4 * dpr, -s * dpr, Math.cos(p.spin * 0.7) * dpr, x * dpr, y * dpr);
      ctx.fillRect(-r, -r * 0.5, r * 2, r);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }
}

function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
/** Hand a big offscreen canvas's pixels back now (iOS Safari otherwise keeps them until a GC). */
const release = canvas => { if (canvas) canvas.width = canvas.height = 0; };
function glowSprite(stops) {
  const c = canvasOf(128, 128), g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([at, color]) => grd.addColorStop(at, color));
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return c;
}
function flameSprite() {
  const c = canvasOf(64, 128), g = c.getContext('2d'), grd = g.createRadialGradient(32, 96, 2, 32, 84, 64);
  grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.25, 'rgba(255,205,95,.95)'); grd.addColorStop(0.6, 'rgba(255,120,40,.55)'); grd.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = grd; g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(54, 50, 62, 82, 55, 102); g.bezierCurveTo(46, 126, 18, 126, 9, 102); g.bezierCurveTo(2, 82, 10, 50, 32, 4); g.fill();
  return c;
}

// ---------------------------------------------------------------------------- the stage
export class Stage2D {
  constructor(canvas, state, callbacks, art, {insets = null} = {}) {
    this.canvas = canvas; this.state = state; this.callbacks = callbacks; this.art = art;
    this.ctx = canvas.getContext('2d', {alpha: false});
    this.time = 0; this.paused = false; this.selection = null; this.drag = null; this.mode = 'play';
    this.safe = insets || {top: 0, right: 0, bottom: 0, left: 0}; this.playSafe = this.safe;
    this.fruits = new Map(); this.ghosts = []; this.targetIds = new Set(); this.hintIds = new Set(); this.rings = [];
    this.rig = new Camera2D(this); this.fx = new Particles(); this.ambient = [];
    this.characters = new Map(FRIENDS.map(name => [name, new Friend2D(this, name)]));
    this.tod = {key: null, from: null, t: 1};
    this.skyLanterns = []; this.answerLights = null; this.reply = null; this.finaleTime = 0; this.fire = 0; this.fireTarget = 0;
    this.lanterns = Array.from({length: 5}, () => ({lit: 0, target: 0, flicker: Math.random() * 10}));
    this.glow = glowSprite([[0, 'rgba(255,248,222,1)'], [0.22, 'rgba(255,214,140,.65)'], [1, 'rgba(255,150,60,0)']]);
    this.flame = flameSprite();
    this.composites = new Map(); this.tinted = new Map();
    this.frame = {width: 14, depth: 9.8}; this.width = 1; this.height = 1; this.dpr = 1;
    this.touchDevice = matchMedia('(pointer: coarse)').matches;
    // small living details: koi and butterflies (lantern-life.js), and the life of each hour (lantern-life-hours.js)
    this.life = new Life2D({budget: this.touchDevice ? 0.6 : 1});
    this.hours = new HourLife({seed: 7, budget: this.touchDevice ? 0.6 : 1});
    this.lanternGlow = {getHexString: () => 'ffd37a'};
    this.blanketTextures = {has: id => !!this.m && !!this.compositeReady(this.tod.key, id)};
    canvas.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', e => this.move(e), {passive: false});
    window.addEventListener('pointerup', e => this.up(e));
    window.addEventListener('pointercancel', e => { if (this.drag?.pointerId === e.pointerId) this.cancel(); });
    canvas.addEventListener('lostpointercapture', e => { if (this.drag?.pointerId === e.pointerId) this.cancel(); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('keydown', e => this.key(e));
    canvas.addEventListener('pointermove', e => this.hover(e));
    window.addEventListener('blur', () => this.cancel());
    window.addEventListener('online', () => this.ensureLayout()); // a layout that failed to load offline
  }

  /** Load what this viewport needs for its first frame, then start drawing. */
  async load(onProgress = () => {}) {
    this.measure();
    await this.useLayout(this.wantedLayout(), onProgress);
    this.applyLooks(); this.setChapterLook(true); this.sync(true);
    await this.composite(this.tod.key);
    new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement || this.canvas);
    this.last = performance.now();
    this.raf = requestAnimationFrame(t => this.animate(t));
    this.prefetch();
    return this;
  }

  get quiet() { return !!this.state.reducedMotion || !!this.systemQuiet; }
  get mobile() { return this.frame.width < 10; }
  get deliveries() { return [...this.fruits.values()].filter(v => v.delivery).length + this.ghosts.length; }
  info() { return {quality: '2d', scale: 1, dpr: this.dpr, calls: this.drawCalls || 0, triangles: 0, layout: this.layoutKey}; }
  setQuality() {} // one look; the 3D tiers load the cinematic renderer instead
  /** Two drawn frames under the loading card, so the reveal never lands on an empty canvas. */
  async warmUp() { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
  loadedFiles() { return [...this.art.bitmaps.keys()].filter(f => this.art.ready(f)); }
  timeKey() { return this.state.journey.status === 'complete' ? 'night' : TIMES[this.state.journey.chapter] || 'afternoon'; }

  // ------------------------------------------------------------------ layouts and art
  measure() {
    this.width = this.canvas.clientWidth || innerWidth; this.height = this.canvas.clientHeight || innerHeight;
    // crisp, without paying for triple-density pixels on phones
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }
  wantedLayout() { return layoutFor(this.width, this.height, this.playSafe); }
  /** Fetch a layout's art and weave its background, then move onto it, unless `stale()` reports
   *  that the viewport has since asked for something else. Returns whether it moved. */
  async useLayout(key, onProgress = () => {}, stale = () => false) {
    const m = await this.art.manifest(key), time = this.timeKey(), blanket = equipped(this.state, 'blanket'), lantern = equipped(this.state, 'lantern').replace(/^lantern-/, '');
    const cast = FRIENDS.filter((name, i) => i <= this.state.journey.chapter);
    const sprites = [m.files.fruit, ...cast.map(n => m.files.friends[n]), m.shared.files.lanterns[`${lantern}-lit`], m.shared.files.lanterns[`${lantern}-unlit`]].filter(Boolean);
    const pictures = [m.files.bg[time], m.files.cloth[blanket]].filter(Boolean);
    let done = 0;
    const tick = () => onProgress(++done / (sprites.length + pictures.length));
    await Promise.all([...sprites.map(f => this.art.sprite(f).promise.then(tick)), ...pictures.map(f => this.art.fetch(f).then(tick))]);
    // weave the background before moving over, so a rotation never shows an empty frame
    await this.composite(time, blanket, m);
    if (stale()) return false;
    const previous = this.frame, moved = !!this.layoutKey && this.layoutKey !== key;
    this.m = m; this.layoutKey = key; this.frame = {...m.frame};
    const arrivals = [];
    if (moved) {
      // camera poses and particles are in the old picture's pixels: a new layout starts them afresh
      const r = this.rig;
      clearTimeout(r.hold);
      Object.assign(r, {shot: null, holdPose: null, focused: null, blend: null, base: null, current: null});
      this.fx.list.length = 0; this.ambient.length = 0;
      // friends mid-walk were following the old layout's paths: they land now (a walk-in still arrives)
      for (const c of this.characters.values()) if (c.path) { arrivals.push(c.pathDone); c.path = null; c.play(c.rest); }
      // only this layout's sprites stay decoded; the compressed files stay cached for the way back
      const keep = new Set([m.files.fruit, ...Object.values(m.files.friends), ...Object.values(m.shared.files.lanterns), m.shared.files.skyLantern, m.files.pond]);
      for (const [file, entry] of [...this.art.bitmaps]) if (!keep.has(file)) { entry.ready?.close?.(); this.art.bitmaps.delete(file); }
    }
    for (const [k, e] of [...this.composites]) if (!k.startsWith(`${key}:`)) { this.composites.delete(k); release(e.ready); }
    this.clearTinted(); this.shown = this.composites.get(`${key}:${time}:${blanket}`); this.fading = null; this.swap = null;
    this.life.layout(m, this.art); this.hours.layout(m);
    const a = m.anchors;
    this.guestSeat = fromWorld(a.guestSeat); this.seats = a.seats.map(fromWorld); this.entry = fromWorld(a.entry);
    this.pathPoints = a.path.map(fromWorld); this.detour = a.detour.map(fromWorld);
    this.measure(); this.frameCamera();
    if ((previous.width !== this.frame.width || previous.depth !== this.frame.depth) && settleFruits(this.state, this.frame)) this.callbacks.onReseat?.();
    for (const [id, v] of this.fruits) { const f = this.state.fruits.find(x => x.id === id); if (f) Object.assign(v.pos, this.world3(f)); }
    this.placeCast();
    return true;
  }
  /** Move to the baked layout this viewport wants. A request made while another layout is still
   *  loading is checked again when that load settles, so the stage never ends a rotation behind. */
  async ensureLayout() {
    if (!this.m) return;
    if (this.switching) { this.recheck = true; return; }
    const key = this.wantedLayout();
    if (key === this.layoutKey) return;
    this.switching = key; this.recheck = false;
    let moved = false, failed = false;
    try { moved = await this.useLayout(key, undefined, () => this.wantedLayout() !== key); } catch (error) { failed = true; console.warn(error); }
    this.switching = null;
    if (moved) {
      this.cancel(); this.applyLooks();
      Object.assign(this.tod, {from: null, t: 1, pending: false});
      this.composite(this.tod.key).catch(() => {});
      this.callbacks.onResize?.();
    }
    if (failed) { this.recheck = false; this.frameCamera(true); return; }
    if (this.wantedLayout() !== this.layoutKey) this.ensureLayout();
    else if (this.recheck) { this.recheck = false; this.frameCamera(true); }
  }
  /** A while into play, fetch (but do not decode) the rest of the cast and the next hour at low
   *  priority: ready long before they are needed, without competing with the first screen. */
  prefetch(delay = 8000) {
    clearTimeout(this.prefetchTimer);
    this.prefetchTimer = setTimeout(() => (window.requestIdleCallback || (fn => fn()))(() => {
      const m = this.m, next = TIMES[Math.min(4, TIMES.indexOf(this.timeKey()) + 1)];
      for (const file of [...FRIENDS.map(name => m.files.friends[name]), m.files.bg[next], m.shared.files.skyLantern]) if (file) this.art.fetch(file, {low: true}).catch(() => {});
    }), delay);
  }

  /** An hour's background with the chosen blanket woven in, cached at image resolution.
   *  The bake leaves the blanket field mid-grey (lit, unpatterned) and ships the pattern as its
   *  own layer: field = background x pattern x the hour's gain, everything else is background. */
  composite(time, blanket = this.blanketId, m = this.m) {
    const key = `${m.layout}:${time}:${blanket}`;
    if (!this.composites.has(key)) {
      const entry = {key, time, blanket, ready: null};
      entry.promise = (async () => {
        const clothFile = m.files.cloth[blanket];
        const [bg, cloth] = await Promise.all([this.art.decode(m.files.bg[time]), clothFile ? this.art.decode(clothFile) : null]);
        const w = m.image.w, h = m.image.h, c = canvasOf(w, h), g = c.getContext('2d', {alpha: false});
        if (!g) throw new Error('No memory left for the background');
        g.drawImage(bg, 0, 0, w, h);
        if (cloth) {
          const field = canvasOf(w, h), f = field.getContext('2d');
          f.drawImage(bg, 0, 0, w, h);
          f.globalCompositeOperation = 'multiply'; f.drawImage(cloth, 0, 0, w, h);
          f.globalCompositeOperation = 'destination-in'; f.drawImage(cloth, 0, 0, w, h);
          g.drawImage(field, 0, 0);
          const gain = (m.files.clothGain?.[time] ?? 1) - 1;
          if (gain > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, gain); g.drawImage(field, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
          field.width = field.height = 1;
        }
        // the picture's outermost pixels, softened, stretch over any part of the screen it does not reach
        const strip = (sx, sy, sw, sh, dw, dh) => { const e = canvasOf(dw, dh); e.getContext('2d', {willReadFrequently: true}).drawImage(c, sx, sy, sw, sh, 0, 0, dw, dh); return e; };
        entry.sides = {left: strip(0, 0, 2, h, 1, 48), right: strip(w - 2, 0, 2, h, 1, 48), top: strip(0, 0, w, 2, 48, 1), bottom: strip(0, h - 2, w, 2, 48, 1)};
        const mean = e => { const d = e.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, e.width, e.height).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; return `rgb(${r / n | 0},${gg / n | 0},${b / n | 0})`; };
        entry.edges = [mean(entry.sides.top), mean(entry.sides.bottom)];
        bg.close?.(); cloth?.close?.();
        entry.ready = c;
        return c;
      })();
      entry.promise.catch(error => { console.warn(error); this.composites.delete(key); });
      this.composites.set(key, entry);
      // a composite is a full-size bitmap: keep the hour on screen, the one fading out, and the newest
      for (const [k, e] of this.composites) {
        if (this.composites.size <= 3) break;
        if (e !== entry && e !== this.shown && e !== this.fading) this.composites.delete(k);
      }
    }
    return this.composites.get(key).promise;
  }
  compositeReady(time, blanket = this.blanketId) { const e = this.composites.get(`${this.layoutKey}:${time}:${blanket}`); return e?.ready ? e : null; }

  // ------------------------------------------------------------------ coordinates
  world3(p, y = REST_Y) { return v3((p.x - 0.5) * this.frame.width, y, (p.y - 0.5) * this.frame.depth); }
  normalized(v) { return {x: v.x / this.frame.width + 0.5, y: v.z / this.frame.depth + 0.5}; }
  /** World point -> baked image px. */
  imagePoint(x, y, z) {
    const [nx, ny] = transform(this.m.camera.viewProj, x, y, z);
    return {x: (nx * 0.5 + 0.5) * this.m.image.w, y: (-ny * 0.5 + 0.5) * this.m.image.h};
  }
  get view() { return this.rig.view || {s: 1, x: 0, y: 0}; }
  toScreen(p) { const v = this.view; return {x: p.x * v.s + v.x, y: p.y * v.s + v.y}; }
  project(p, height = 0.1) { const w = this.world3(p, height); return this.toScreen(this.imagePoint(w.x, w.y, w.z)); }
  projectWorld(v) { return {...this.toScreen(this.imagePoint(v.x, v.y, v.z)), visible: true}; }
  /** Image px per world unit around a world point (further back is smaller). */
  unit(x, y, z) { const a = this.imagePoint(x - 0.5, y, z), b = this.imagePoint(x + 0.5, y, z); return Math.hypot(b.x - a.x, b.y - a.y); }
  /** Screen point -> board coordinates on the cloth: a ray through the bake camera meets the cloth plane. */
  boardAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect(), v = this.view, m = this.m;
    const ix = (clientX - r.left - v.x) / v.s, iy = (clientY - r.top - v.y) / v.s;
    const nx = ix / m.image.w * 2 - 1, ny = 1 - iy / m.image.h * 2;
    const a = transform(m.inverse, nx, ny, -1), b = transform(m.inverse, nx, ny, 1);
    const k = (0.09 - a[1]) / (b[1] - a[1]);
    return this.normalized({x: a[0] + (b[0] - a[0]) * k, z: a[2] + (b[2] - a[2]) * k});
  }
  /** Screen point -> the pond's water plane (world x, z), or null when this layout has no pond data. */
  waterAt(clientX, clientY) {
    const m = this.m, y = m?.pond?.waterY;
    if (y === undefined) return null;
    const r = this.canvas.getBoundingClientRect(), v = this.view;
    const nx = (clientX - r.left - v.x) / v.s / m.image.w * 2 - 1, ny = 1 - (clientY - r.top - v.y) / v.s / m.image.h * 2;
    const a = transform(m.inverse, nx, ny, -1), b = transform(m.inverse, nx, ny, 1), k = (y - a[1]) / (b[1] - a[1]);
    return {x: a[0] + (b[0] - a[0]) * k, z: a[2] + (b[2] - a[2]) * k};
  }
  /** The living details, for tests and look-development. */
  lifeInfo() { return {...this.life.info(), hours: Object.fromEntries(Object.entries(this.hours.w).map(([k, v]) => [k, +v.toFixed(2)]))}; }
  /** Where a friend's speech bubble points: just above their head, in canvas px. */
  headPoint(name) {
    const c = this.characters.get(name);
    if (!c?.root.visible) return null;
    const p = c.root.position;
    return this.toScreen(this.imagePoint(p.x, p.y + 2.1 * c.root.scale.y, p.z));
  }
  safeRect() {
    const s = this.safe;
    return {x: s.left, y: s.top, w: Math.max(120, this.width - s.left - s.right), h: Math.max(120, this.height - s.top - s.bottom)};
  }

  // ------------------------------------------------------------------ framing
  setSafeArea(insets, play = insets) {
    this.safe = insets; this.playSafe = play;
    if (!this.m) return;
    if (this.switching || this.wantedLayout() !== this.layoutKey) this.ensureLayout();
    else this.frameCamera(true);
  }
  resize() {
    const before = [this.width, this.height];
    this.measure();
    if (!this.m || !this.width || !this.height) return;
    if (this.switching || this.wantedLayout() !== this.layoutKey) { this.ensureLayout(); return; }
    this.frameCamera();
    if (before[0] !== this.width || before[1] !== this.height) this.cancel();
    this.callbacks.onResize?.();
  }
  /** Fit the board (and on desktops the lantern string) into the HUD's safe area, as the 3D camera does. */
  frameCamera(smooth = false) {
    const W = this.frame.width, D = this.frame.depth, phone = this.width < 700 || this.height < 520, mx = phone ? 0.08 : 0.7, pts = [];
    for (const x of [-W / 2 - mx, W / 2 + mx]) pts.push(this.imagePoint(x, 0, D / 2 + (phone ? 0.3 : 0.9)), this.imagePoint(x, 0, -D / 2 - (phone ? 0.15 : 0.5)));
    if (!phone) for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) pts.push(this.imagePoint(x, 3.0, -D / 2 - 0.75));
    pts.push(this.imagePoint(this.guestSeat.x, phone ? 1.1 : 1.6, this.guestSeat.z));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const safe = this.safeRect(), s = Math.min(safe.w / (x1 - x0), safe.h / (y1 - y0));
    const next = this.rig.poseAt({x: (x0 + x1) / 2, y: (y0 + y1) / 2}, {x: safe.x + safe.w / 2, y: safe.y + safe.h / 2}, s);
    const first = !this.rig.base;
    this.rig.base = next;
    if (this.rig.orbiting && this.rig.orbitPose?.kind) this.rig.orbitPose = this.titlePose(this.rig.orbitPose.kind);
    if (first || !this.rig.current) this.rig.apply(next);
    else if (!this.rig.busy && !this.rig.orbiting) {
      if (smooth && !this.quiet) this.rig.blend = {from: this.rig.current, t: 0};
      else this.rig.apply(next);
    }
    this.rig.update(0, true);
  }
  /** Establishing shots for the title, the festival and the ending. */
  titlePose(kind = 'title') {
    const img = this.m.image, sky = this.m.anchors.sky, D = this.frame.depth;
    let pose;
    if (kind === 'festival') pose = this.rig.inside(this.rig.poseAt({x: img.w / 2, y: Math.max(sky.h * 0.7, this.imagePoint(0, 1.2, -D / 2).y)}, {x: this.width / 2, y: this.height * 0.52}, this.rig.base.s * 1.02));
    else if (kind === 'ending') pose = this.rig.closeOn(this.imagePoint(0, 1.0, -D * 0.25), 1.12, {high: 0.55});
    else pose = this.rig.closeOn(this.imagePoint(0, 0.8, -D * 0.12), this.mobile ? 1.06 : 1.14, {high: 0.52});
    pose.kind = kind;
    return pose;
  }
  friendScale() { return this.m?.scales?.friend ?? (this.mobile ? 0.68 : 0.98); }

  // ------------------------------------------------------------------ looks, hours, keepsakes
  applyLooks() {
    const blanket = equipped(this.state, 'blanket'), lantern = shopItem(equipped(this.state, 'lantern'));
    const glow = lantern.look.glow.replace('#', '');
    this.lanternGlow = {getHexString: () => glow};
    this.lanternKey = lantern.id.replace(/^lantern-/, '');
    const changed = this.blanketId !== blanket;
    this.blanketId = blanket;
    if (!this.m) return;
    for (const lit of ['lit', 'unlit']) { const f = this.m.shared.files.lanterns[`${this.lanternKey}-${lit}`]; if (f) this.art.sprite(f).promise.catch(() => {}); }
    if (changed && this.tod.key) {
      // a quick dissolve to the new blanket once it is woven in; until then the old one stays
      const time = this.tod.key, from = this.shown;
      this.composite(time, blanket).then(() => { if (this.blanketId === blanket && this.tod.key === time && from?.key.startsWith(`${this.layoutKey}:`)) { this.fading = from; this.swap = {from, t: 0}; } }).catch(() => {});
    }
  }
  setChapterLook(immediate = false) {
    const key = this.timeKey();
    if (key === this.tod.key) return;
    const from = this.tod.key, instant = immediate || this.quiet || !from;
    this.tod = {key, from: instant ? null : from, t: instant ? 1 : 0, duration: 4, pending: !instant};
    this.hours.setHour(key); this.life.setHour(key);
    this.fading = instant ? null : this.shown;
    this.clearTinted();
    if (this.m) {
      // the new hour fades in once its picture is woven; until then the old one stays up
      const tod = this.tod;
      this.composite(key).then(() => { tod.pending = false; }, () => { tod.pending = false; tod.t = 1; });
      if (!immediate) this.prefetch();
    }
    this.callbacks.onTime?.(key);
  }
  updateKeepsakes(immediate = false) {
    const j = this.state.journey, done = j.completed;
    this.lanterns.forEach((l, i) => { l.target = done.includes(i) ? 1 : 0; if (immediate) l.lit = l.target; });
    this.fireTarget = j.chapter >= 3 || j.status === 'complete' ? 1 : 0;
    if (immediate) this.fire = this.fireTarget;
  }

  // ------------------------------------------------------------------ cast
  placeCast({walkIn = false} = {}) {
    if (!this.m) return;
    const j = this.state.journey, s = this.friendScale(), guestName = chapter(this.state).model, done = j.status === 'complete';
    FRIENDS.forEach((name, i) => {
      const c = this.characters.get(name);
      c.root.scale.setScalar(s);
      const isGuest = name === guestName && !done, isFriend = i < j.chapter || (done && i <= j.chapter);
      c.root.visible = isGuest || isFriend;
      if (!c.root.visible) return;
      this.art.sprite(this.m.files.friends[name]).promise.catch(() => {});
      if (isGuest) {
        if (walkIn && !this.quiet) {
          c.place(this.entry, -Math.PI / 2);
          c.walk(this.pathPoints.slice(1), {face: -0.35, speed: 1.6, done: () => { c.react('wave'); this.callbacks.onArrive?.(name); }});
        } else c.place(this.guestSeat, -0.35);
        c.setRest('idle');
      } else {
        const seat = this.seats[i] || this.seats.at(-1), face = Math.atan2(-seat.x, -seat.z) * 0.9;
        if (walkIn && !this.quiet && i === j.chapter - 1 && !done) {
          c.place(this.guestSeat, -0.35);
          c.walk(this.mobile || seat.x < 0 ? [...this.detour, seat] : [v3(seat.x, 0, this.guestSeat.z + 0.4), seat], {face, speed: 2.1});
        } else if (!c.path) c.place(seat, face);
        c.setRest('idle');
      }
    });
    this.guest = done ? null : this.characters.get(guestName);
    // Bramble carries a lantern of their own into the last invitation; it rises first at the festival
    if (!this.skyLanterns.some(l => l.bramble)) this.brambleLamp = j.chapter === 4 && !done ? v3(this.guestSeat.x - 0.75, this.guestSeat.y, this.guestSeat.z + 0.2) : null;
  }
  cheerAll(kind) { for (const c of this.characters.values()) if (c.root.visible && !c.path) setTimeout(() => c.react(kind), Math.random() * 200); }
  /** Make `name` the speaker; returns the image point at their face for the camera, or null. */
  speak(name) {
    this.speaker = name && this.characters.get(name)?.root.visible ? name : null;
    for (const c of this.characters.values()) if (c.root.visible) c.setRest(c.name === this.speaker ? 'talk' : 'idle');
    const c = this.speaker && this.characters.get(this.speaker);
    return c ? this.imagePoint(c.root.position.x, c.root.position.y + 1.05 * c.root.scale.y, c.root.position.z) : null;
  }

  // ------------------------------------------------------------------ fruit
  makeFruit(f, {from, delay = 0, pop = false, delivery = false} = {}) {
    const view = {id: f.id, level: f.level, pos: (from || this.world3(f)).clone(), tilt: 0,
      squash: new Spring(1, {stiffness: 260, damping: 11}), grow: new Spring(pop ? 0 : 1, {stiffness: 170, damping: 12}),
      phase: Math.random() * TAU, born: this.time + delay, delivery: delivery ? {start: this.time + delay, from: from.clone()} : null, sq: 1, gr: pop ? 0 : 1, flip: (f.id * 7) % 3 === 0};
    if (pop) view.grow.target = 1;
    this.fruits.set(f.id, view);
    return view;
  }
  choreograph(result) { this.pending = result; }
  anchorPoint(name, lift = 0) { const a = this.m.anchors[name]; return v3(a.world[0], a.world[1] + lift, a.world[2]); }
  skewerSlot(i) { const s = this.m.anchors.skewerSlots[i]; return v3(s.world[0], s.world[1], s.world[2]); }
  sync(initial = false) {
    const r = this.pending; this.pending = null;
    const ids = new Set(this.state.fruits.map(f => f.id));
    for (const [id, view] of [...this.fruits]) {
      if (ids.has(id)) continue;
      this.fruits.delete(id);
      let exit = null;
      if (r?.type === 'merge' && r.removed.includes(id)) exit = {to: this.world3(r.position, REST_Y), shrink: true, duration: 0.2};
      else if ((r?.type === 'serve' || r?.type === 'share') && r.fruit.id === id) exit = {to: this.anchorPoint('plate', 0.35), shrink: true, duration: 0.42, arc: 1.2};
      else if (r?.type === 'skewer' && r.fruit.id === id) exit = {to: this.skewerSlot(Math.min(2, this.state.journey.skewers ? 2 : this.state.journey.skewer.length - 1)), shrink: false, duration: 0.38, arc: 1.0};
      if (exit && !this.quiet) this.ghosts.push({view, from: view.pos.clone(), pos: view.pos.clone(), scale: 1, ...exit, t: 0});
    }
    const spawned = new Set((r?.spawned || []).map(f => f.id)), outputs = new Set((r?.type === 'merge' ? r.outputs : []).map(f => f.id));
    let stagger = 0;
    for (const f of this.state.fruits) {
      const view = this.fruits.get(f.id);
      if (view) { if (view.level !== f.level) { this.fruits.delete(f.id); this.makeFruit(f, {pop: !initial}); } continue; }
      if (initial || this.quiet) { this.makeFruit(f); continue; }
      if (spawned.has(f.id)) this.makeFruit(f, {from: this.anchorPoint('basket', 0.9), delay: 0.1 + stagger++ * 0.13, delivery: true});
      else if (outputs.has(f.id)) {
        const at = this.world3(r.position, REST_Y), main = r.outputs[0] && f.id === r.outputs[0].id, to = this.world3(f);
        this.makeFruit(f, {from: main ? at : v3(lerp(at.x, to.x, 0.3), at.y, lerp(at.z, to.z, 0.3)), delay: 0.18 + (main ? 0 : 0.08), pop: true});
      } else this.makeFruit(f, {pop: true});
    }
    this.updateKeepsakes(initial);
  }
  /** Fruit threaded on the skewer and served on the plate: world origins and model scales, as in 3D. */
  servings() {
    const c = chapter(this.state), j = this.state.journey, a = this.m.anchors, list = [];
    const ss = a.skewer.scale, ps = a.plate.scale, p = a.plate.world;
    (j.skewers ? [c.skewer, c.skewer, c.skewer] : j.skewer).forEach((level, i) => {
      const slot = this.skewerSlot(i);
      list.push({level, pos: v3(slot.x, slot.y + (0.12 - 0.25) * ss, slot.z), scale: 0.5 * ss});
    });
    const served = c.orders.flatMap(o => Array(j.served[o.level] || 0).fill(o.level));
    served.forEach((level, i) => list.push({level, pos: v3(p[0] + (i - (served.length - 1) / 2) * 0.46 * ps, p[1] + 0.12 * ps, p[2] + (i % 2 ? 0.15 : -0.1) * ps), scale: (served.length === 1 ? 0.66 : 0.47) * ps}));
    return list;
  }

  feedback(result) {
    if (!result?.ok) return;
    const quiet = this.quiet, img = w => this.imagePoint(w.x, w.y, w.z), u = w => this.unit(w.x, w.y, w.z);
    if (result.type === 'merge') {
      const at = this.world3(result.position, 0.35), color = FRUITS[result.level].color, big = (result.count - 1) + (result.chain - 1) * 1.5;
      if (!quiet) {
        setTimeout(() => {
          this.fx.burst(img(at), {color, count: 26 + big * 18, speed: 2.4 + big * 0.5, size: 0.26}, u(at));
          this.fx.ring(img(this.world3(result.position, 0.12)), {color: '#fff3c4', radius: 0.25, speed: 2.6 + big}, u(at));
          if (result.chain > 1 || result.count > 2) this.fx.burst(img(at), {palette: ['#ffffff', '#ffe08a', color], count: 30, speed: 4, size: 0.2, up: 2}, u(at));
        }, 180);
        // bloom combo: each bonus fruit blossoms out of a golden swirl
        if (result.bonus) result.outputs.slice(1).forEach((out, k) => setTimeout(() => {
          const p = this.world3(out, 0.3);
          this.fx.ring(img(this.world3(out, 0.12)), {color: '#ffe08a', radius: 0.15, speed: 2.2, count: 24}, u(p));
          this.fx.rise(img(p), {color: '#ffd35c', count: 14, spread: 0.5, speed: 1.4}, u(p));
          this.fx.confetti(img(p), {count: 18, spread: 0.3, speed: 3, palette: ['#ffd35c', '#fff3c4', '#ff9fb8']}, u(p));
        }, 320 + k * 140));
        this.rig.shake(Math.min(0.55, 0.12 + big * 0.1));
        if (result.chain > 1) this.hitstop = 0.07;
      }
      if (result.chain > 1 || result.count > 3) this.cheerAll('hop');
    } else if (result.type === 'serve') {
      setTimeout(() => { this.guest?.react('eat'); const p = this.anchorPoint('plate', 0.4); if (!quiet) this.fx.rise(img(p), {color: '#ff9fb8', count: 14, spread: 0.6}, u(p)); }, 380);
    } else if (result.type === 'share') {
      setTimeout(() => { const p = this.anchorPoint('plate', 0.3); if (!quiet) this.fx.rise(img(p), {color: '#ffffff', count: 6}, u(p)); }, 380);
    } else if (result.type === 'skewer') {
      setTimeout(() => {
        const slot = this.skewerSlot(Math.max(0, this.state.journey.skewer.length - 1));
        if (!quiet) this.fx.burst(img(slot), {color: '#ffe3a0', count: 12, speed: 1.2, size: 0.18, up: 0.8}, u(slot));
        if (result.served) { this.guest?.react('hop'); const p = this.anchorPoint('skewer', 0.4); if (!quiet) this.fx.burst(img(p), {color: '#ffd166', count: 40, speed: 2.4}, u(p)); }
      }, 380);
    } else if (result.type === 'move') this.fruits.get(result.fruit.id)?.squash.kick(-3);
  }

  // ------------------------------------------------------------------ lanterns and the festival
  /** A string lantern's hook (image px), lamp origin (world) and scale. */
  lanternAnchor(i) {
    const l = this.m?.anchors.lanterns[i];
    return l ? {x: l.hook.px[0], y: l.hook.px[1], origin: v3(...l.origin.world), scale: l.scale, h: l.heightPx} : null;
  }
  celebrate(index, {finale = false} = {}) {
    const l = this.lanterns[index];
    this.updateKeepsakes();
    if (l) { l.lit = 0; l.target = 1; }
    this.cheerAll('cheer');
    if (this.quiet) { if (l) l.lit = 1; return; }
    const a = this.lanternAnchor(index);
    if (a) {
      const o = this.imagePoint(a.origin.x, a.origin.y + 0.4, a.origin.z);
      this.rig.pushTo({x: o.x, y: o.y + a.h * 1.1}, {zoom: this.mobile ? 1.45 : 1.7, duration: 1.3, hold: 2.4});
      setTimeout(() => {
        const u = this.unit(a.origin.x, a.origin.y, a.origin.z);
        this.fx.burst(o, {color: '#ffcf6b', count: 70, speed: 3, size: 0.32, up: 1}, u);
        this.fx.rise(o, {color: '#ffe7a8', count: 24, spread: 0.6}, u);
        this.fx.confetti({x: o.x, y: o.y - u * 0.2}, {count: 90, spread: 0.8, speed: 4}, u);
      }, 900);
    }
    if (finale) this.finale();
  }
  finale() {
    if (this.m?.shared.files.skyLantern) this.art.sprite(this.m.shared.files.skyLantern).promise.catch(() => {});
    if (this.quiet || !this.m) return;
    this.finaleTime = this.time;
    const W = this.frame.width, D = this.frame.depth;
    for (let i = 0; i < 18; i++) this.skyLanterns.push({start: v3((Math.random() - 0.5) * W * 1.2, 0.3, (Math.random() - 0.5) * D * 0.9), delay: 1.5 + i * 0.35, speed: 0.55 + Math.random() * 0.35, sway: Math.random() * TAU, size: 0.9 + Math.random() * 0.5});
    const j = this.state.journey;
    if (j.chapter === 4 && !j.replay) {
      this.skyLanterns.push({start: this.brambleLamp || v3(this.guestSeat.x - 0.75, this.guestSeat.y, this.guestSeat.z + 0.2), delay: 0.2, speed: 0.7, sway: 0, size: 0.5, bramble: true});
      this.brambleLamp = null;
    }
    this.fireworks = {until: this.time + 14, next: this.time + 2.5};
  }
  /** The far islands answer: lights wake one after another along the horizon, then rise. */
  answer() {
    this.clearAnswer();
    // x as a fraction of the picture's width and y of the sky band, sizes in 2560 px units, so the
    // lights stay put when a rotation swaps layouts
    const rand = random(99), lights = [];
    for (let i = 0; i < 16; i++) {
      const hx = 0.06 + rand() * 0.88, hy = 0.45 + rand() * 0.45, n = 3 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) lights.push({x: hx + (rand() - 0.5) * 50 / 2560, y: hy, dy: rand() * 18, r: k ? 10 + rand() * 8 : 22, delay: 0.3 + i * 0.35 + k * 0.12, rise: 6 + rand() * 9, phase: rand() * TAU});
    }
    this.answerLights = lights; this.answerTime = this.time;
  }
  clearAnswer() { this.answerLights = null; this.reply = null; }
  resetFestival() { this.skyLanterns.length = 0; this.fireworks = null; this.finaleTime = 0; this.clearAnswer(); this.brambleLamp = null; this.placeCast(); }
  /** One sky lantern crosses the sky from the far islands and settles beside the plate. */
  sendReply(done) {
    if (this.m.shared.files.skyLantern) this.art.sprite(this.m.shared.files.skyLantern).promise.catch(() => {});
    const p = this.m.anchors.plate.world;
    this.reply = {end: v3(p[0] - 0.2, p[1] + 0.25, p[2] - 0.9), start: this.time, duration: this.quiet ? 0.01 : 7.5, done, landed: false};
  }
  /** The reply's flight from the far islands to the plate, in the current picture's pixels. */
  replyPath() {
    const img = this.m.image, end = this.reply.end, e = this.imagePoint(end.x, end.y, end.z);
    return [{x: img.w * 0.08, y: img.h * 0.02}, {x: img.w * 0.26, y: img.h * 0.08}, {x: img.w * 0.42, y: e.y - img.h * 0.3}, {x: e.x, y: e.y - img.h * 0.08}, e];
  }
  showHint(ids) { this.hintIds = new Set(ids || []); }

  // ------------------------------------------------------------------ interaction (as LanternWorld)
  hit(e) {
    const rect = this.canvas.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top, s = this.view.s;
    let nearest = null;
    for (const f of this.state.fruits) {
      const v = this.fruits.get(f.id), w = v ? v.pos : this.world3(f), r = FRUITS[f.level].radius;
      const c = this.toScreen(this.imagePoint(w.x, w.y + r, w.z)), size = r * this.unit(w.x, w.y, w.z) * s, dist = Math.hypot(px - c.x, py - c.y);
      if (dist < Math.max(size * 1.15, e.pointerType === 'touch' ? 26 : 16) && (!nearest || dist < nearest.dist)) nearest = {type: 'fruit', id: f.id, dist};
    }
    if (nearest) return nearest;
    const a = this.m.anchors;
    const near = (anchor, rx, ry) => {
      const w = anchor.world, u = this.unit(w[0], w[1], w[2]) * s, c = this.toScreen(this.imagePoint(w[0], w[1] + ry * 0.5, w[2]));
      return Math.abs(px - c.x) < rx * u && Math.abs(py - c.y) < ry * u * 0.8;
    };
    if (near(a.basket, 0.85 * a.basket.scale, 0.9 * a.basket.scale)) return {type: 'basket'};
    if (near(a.plate, 0.9 * a.plate.scale, 0.5 * a.plate.scale)) return {type: 'plate'};
    for (const c of this.characters.values()) {
      if (!c.root.visible) continue;
      const p = c.root.position, k = c.root.scale.y, u = this.unit(p.x, p.y, p.z) * s, q = this.toScreen(this.imagePoint(p.x, p.y + 0.8 * k, p.z));
      if (Math.abs(px - q.x) < 0.55 * k * u && Math.abs(py - q.y) < 0.95 * k * u) return {type: 'friend', name: c.name};
    }
    return {type: 'floor'};
  }
  pointerPoint(e) { return this.boardAt(e.clientX, e.clientY); }
  hover(e) {
    if (e.pointerType === 'touch' || this.drag || this.paused || !this.m) return;
    const h = this.hit(e);
    this.hovered = h.type === 'fruit' ? h.id : null;
    this.canvas.style.cursor = ['fruit', 'basket', 'friend'].includes(h.type) ? 'grab' : '';
  }
  start(type, id, e, point, fromSelection = false) {
    if (this.paused || this.drag || this.mode !== 'play') return;
    if (this.state.journey.status !== 'playing') { this.callbacks.onHint?.(this.state.journey.status === 'complete' ? 'The festival glows on. Revisit any invitation from the Journey.' : 'Your lantern is lit. Open the next invitation.'); return; }
    if (type === 'basket') { this.callbacks.onAdd?.(); return; }
    const current = this.state.fruits.find(f => f.id === id);
    if (!current) return;
    const hitPoint = this.pointerPoint(e);
    this.selection = {type, id, point: fromSelection ? point : {x: current.x, y: current.y}};
    this.drag = {pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, fromSelection, offset: fromSelection ? {x: 0, y: 0} : {x: current.x - hitPoint.x, y: current.y - hitPoint.y}};
    this.canvas.setPointerCapture?.(e.pointerId);
    this.canvas.focus({preventScroll: true});
    this.canvas.classList.add('grabbing');
    const view = this.fruits.get(id);
    if (view) { view.squash.kick(-4); view.grow.kick(2); }
    this.callbacks.onPick?.(type, id);
    this.updatePreview();
  }
  down(e) {
    if (this.drag || e.button !== 0 || e.isPrimary === false) return;
    if (this.mode !== 'play') { this.callbacks.onSkip?.(); return; }
    if (this.paused || !this.m) return;
    e.preventDefault();
    const point = this.pointerPoint(e), hit = this.hit(e);
    if (this.selection) {
      if (hit.type === 'fruit' && hit.id === this.selection.id) { this.cancel(); return; }
      if (hit.type === 'basket') { this.cancel(); this.callbacks.onAdd?.(); return; }
      if (hit.type === 'friend') { this.characters.get(hit.name)?.react('wave'); this.callbacks.onFriend?.(hit.name); return; }
      const old = this.selection;
      this.start(old.type, old.id, e, point, true);
      return;
    }
    if (hit.type === 'fruit' || hit.type === 'basket') this.start(hit.type, hit.id, e, point);
    else if (hit.type === 'plate') this.callbacks.onHint?.('Drag the requested fruit to this plate. Other fruit can be shared to make room.');
    else if (hit.type === 'friend') { this.characters.get(hit.name).react(Math.random() < 0.5 ? 'wave' : 'hop'); this.callbacks.onFriend?.(hit.name); }
    else if (hit.type === 'floor') { const w = this.waterAt(e.clientX, e.clientY); if (w && this.life.pond.tap(w.x, w.z)) this.callbacks.onPond?.(); }
  }
  move(e) {
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const p = this.pointerPoint(e);
    this.drag.moved ||= Math.hypot(e.clientX - this.drag.startX, e.clientY - this.drag.startY) > 5;
    this.selection.point = {x: p.x + this.drag.offset.x, y: p.y + this.drag.offset.y};
    this.updatePreview();
  }
  up(e) {
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    this.move(e);
    const {moved, fromSelection} = this.drag, selected = this.selection;
    this.drag = null;
    this.canvas.classList.remove('grabbing');
    if (this.canvas.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (!moved && !fromSelection) {
      const f = this.state.fruits.find(f => f.id === selected.id);
      if (f) this.callbacks.onHint?.(t('{fruit} picked up. Tap a matching fruit, the plate, the skewer or a new spot.', {fruit: t(FRUITS[f.level].name)}));
      return;
    }
    this.selection = null; this.hideHighlights(); this.callbacks.onPreview?.(null);
    this.callbacks.onDrop?.(selected.id, selected.point);
  }
  updatePreview() {
    this.hideHighlights();
    const s = this.selection;
    if (!s) { this.callbacks.onPreview?.(null); return; }
    const f = this.state.fruits.find(f => f.id === s.id), target = previewLantern(this.state, s.id, s.point, this.frame);
    if (f && !target) this.rings.push({at: s.point, radius: FRUITS[f.level].radius + 0.08, color: '#fff2c9', dash: true, width: 0.05});
    if (target?.type === 'merge') {
      this.targetIds = new Set(target.removed);
      target.members.forEach(m => this.rings.push({at: m, radius: FRUITS[m.level].radius + 0.2, color: '#ffd25c', width: 0.1}));
    } else if (target) {
      const at = target.type === 'serve' || target.type === 'share' ? PLATE : target.type === 'skewer' || target.type === 'wrong-skewer' ? SKEWER : target.point;
      this.rings.push({at, radius: this.mobile ? 0.85 : 1.15, color: target.type === 'wrong-skewer' ? '#ff8f7a' : target.type === 'share' ? '#bfe3ff' : '#ffd66b', width: 0.09, pulse: true});
    }
    this.callbacks.onPreview?.(target);
  }
  hideHighlights() { this.rings = []; this.targetIds.clear(); }
  cancel() {
    const pointerId = this.drag?.pointerId;
    this.drag = null; this.selection = null; this.hideHighlights();
    this.canvas.classList.remove('grabbing');
    if (pointerId !== undefined && this.canvas.hasPointerCapture?.(pointerId)) this.canvas.releasePointerCapture(pointerId);
    this.callbacks.onPreview?.(null);
  }
  key(e) {
    if (this.paused) return;
    const k = e.key.toLowerCase();
    if (e.repeat && !k.startsWith('arrow')) { e.preventDefault(); return; }
    if (this.mode !== 'play') { if ([' ', 'enter', 'escape'].includes(k)) { e.preventDefault(); this.callbacks.onSkip?.(); } return; }
    if (this.state.journey.status !== 'playing' && k !== 'u') return;
    if (k === 'escape') { this.cancel(); return; }
    if (k === 'u') { e.preventDefault(); this.callbacks.onUndo?.(); return; }
    if (k === 'b') { e.preventDefault(); this.callbacks.onAdd?.(); return; }
    if (this.selection?.type === 'fruit' && ['t', 'k'].includes(k)) { e.preventDefault(); const id = this.selection.id; this.cancel(); this.callbacks.onDrop?.(id, k === 't' ? PLATE : SKEWER); return; }
    if (k === 'n' || (k === 'enter' && !this.selection)) {
      e.preventDefault();
      const list = this.state.fruits, i = list.findIndex(f => f.id === this.selection?.id), f = list[(i + 1) % list.length];
      if (f) {
        this.selection = {type: 'fruit', id: f.id, point: {x: f.x, y: f.y}};
        this.callbacks.onPick?.('fruit', f.id);
        this.callbacks.onHint?.(t('{fruit} picked up. Arrow keys move; Enter places; T serves; K threads.', {fruit: t(FRUITS[f.level].name)}));
        this.updatePreview();
      }
      return;
    }
    if (this.selection && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) {
      e.preventDefault();
      const step = e.shiftKey ? 0.7 : 0.22;
      this.selection.point.x += (k === 'arrowright' ? step : k === 'arrowleft' ? -step : 0) / this.frame.width;
      this.selection.point.y += (k === 'arrowdown' ? step : k === 'arrowup' ? -step : 0) / this.frame.depth;
      this.updatePreview();
    }
    if (k === 'enter' && this.selection) { e.preventDefault(); const s = this.selection; this.cancel(); this.callbacks.onDrop?.(s.id, s.point); }
  }

  // ------------------------------------------------------------------ simulation
  animate(now) {
    this.raf = requestAnimationFrame(t => this.animate(t));
    let dt = Math.max(0, Math.min((now - this.last) / 1000, 0.05));
    this.last = now;
    if (document.hidden || !this.m) return;
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.15; }
    this.time += dt;
    const quiet = this.quiet;
    if (this.tod.t < 1 && !this.tod.pending) { this.tod.t = Math.min(1, this.tod.t + dt / this.tod.duration); if (this.tod.t >= 1) this.fading = null; }
    if (this.swap) { this.swap.t += dt / 0.45; if (this.swap.t >= 1) { this.swap = null; this.fading = null; } }
    this.stepFruit(dt, quiet);
    for (const c of this.characters.values()) if (c.root.visible) c.update(dt);
    for (const l of this.lanterns) l.lit = approach(l.lit, l.target, dt, 0.35);
    this.fire = approach(this.fire, this.fireTarget, dt, 0.8);
    this.fx.budget = this.touchDevice ? 0.6 : 1;
    this.fx.update(dt);
    this.stepAmbient(dt, quiet);
    this.life.update(dt, quiet);
    this.hours.update(dt, quiet, this.lanterns);
    const img = this.m.image, sky = this.m.anchors.sky;
    if (this.fire > 0.2 && !quiet && Math.random() < dt * 10) { const c = this.m.anchors.campfire.world; this.fx.rise(this.imagePoint(c[0], c[1] + 0.4, c[2]), {color: '#ff9a4a', count: 1, spread: 0.25, speed: 1.2, size: 0.14, life: 1.3}, this.unit(c[0], c[1], c[2])); }
    if (this.fireworks && this.time < this.fireworks.until && this.time > this.fireworks.next) {
      this.fireworks.next = this.time + 0.6 + Math.random() * 0.9;
      this.fx.firework({x: img.w * (0.12 + Math.random() * 0.76), y: Math.max(img.h * 0.04, sky.h * (0.15 + Math.random() * 0.6))}, ['#ff7aa2', '#ffd166', '#7fe0c8', '#a18bff', '#ffffff'], img.w / 64);
      this.callbacks.onFirework?.();
    }
    if (this.reply && !this.reply.landed && this.time - this.reply.start >= this.reply.duration) {
      const r = this.reply;
      r.landed = true;
      if (!quiet) this.fx.burst(this.imagePoint(r.end.x, r.end.y + 0.4, r.end.z), {color: '#ffd28a', count: 40, speed: 1.8}, this.unit(r.end.x, r.end.y, r.end.z));
      r.done?.();
    }
    this.rig.update(dt, quiet);
    this.draw(quiet);
    this.callbacks.onFrame?.();
  }
  stepFruit(dt, quiet) {
    const held = this.selection?.type === 'fruit' ? this.selection.id : null, t = this.time;
    for (const f of this.state.fruits) {
      const v = this.fruits.get(f.id);
      if (!v) continue;
      const picked = held === f.id, target = this.world3(picked ? this.selection.point : f, picked ? HELD_Y : REST_Y);
      if (v.delivery && !quiet && !picked) {
        const k = clamp((t - v.delivery.start) / 0.7);
        v.hidden = k <= 0;
        if (v.hidden) continue;
        const e = ease.outCubic(k), from = v.delivery.from;
        v.pos.x = lerp(from.x, target.x, e); v.pos.z = lerp(from.z, target.z, e); v.pos.y = lerp(from.y, target.y, e) + Math.sin(k * Math.PI) * 2.0;
        if (k >= 1) {
          v.delivery = null; v.squash.kick(-5);
          if (!quiet) this.fx.ring(this.imagePoint(target.x, 0.12, target.z), {count: 14, radius: 0.15, speed: 1.6, color: '#ffffff'}, this.unit(target.x, 0.12, target.z));
          this.callbacks.onLand?.(f);
        }
      } else {
        v.hidden = t < v.born;
        if (v.hidden) continue;
        const before = v.pos.x, wasHigh = v.pos.y > REST_Y + 0.3;
        v.pos.x = approach(v.pos.x, target.x, dt, picked ? 0.025 : 0.06);
        v.pos.z = approach(v.pos.z, target.z, dt, picked ? 0.025 : 0.06);
        v.pos.y = approach(v.pos.y, target.y, dt, picked ? 0.05 : 0.045);
        if (!picked && wasHigh && v.pos.y < REST_Y + 0.08) { v.squash.kick(-6); this.callbacks.onSettle?.(f); }
        // a held fruit leans into its motion like a pendulum
        v.tilt = approach(v.tilt, picked && !quiet ? clamp((v.pos.x - before) / Math.max(dt, 1e-4) * 0.035, -0.5, 0.5) : 0, dt, 0.08);
      }
      v.squash.target = 1; v.grow.target = 1;
      v.sq = v.squash.update(dt); v.gr = Math.max(0, v.grow.update(dt));
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t = Math.min(1, g.t + dt / g.duration);
      const k = ease.inOutCubic(g.t);
      g.pos = v3(lerp(g.from.x, g.to.x, k), lerp(g.from.y, g.to.y, k) + (g.arc ? Math.sin(g.t * Math.PI) * g.arc : 0), lerp(g.from.z, g.to.z, k));
      g.scale = g.shrink ? Math.max(0.05, 1 - 0.9 * k) : 1 - 0.5 * k;
      if (g.t >= 1) this.ghosts.splice(i, 1);
    }
  }
  stepAmbient(dt, quiet) {
    const night = NIGHT[this.tod.key] ?? 0.2, img = this.m.image, k = img.w / 2560;
    const want = quiet || night > 0.7 ? 0 : Math.round(22 * (this.touchDevice ? 0.6 : 1)); // night's fireflies are HourLife's
    while (this.ambient.length < want) this.ambient.push({x: img.w * (0.1 + Math.random() * 0.8), y: img.h * (0.25 + Math.random() * 0.6), phase: Math.random() * TAU, speed: 0.3 + Math.random() * 0.6, size: 1.2 + Math.random() * 1.8});
    if (this.ambient.length > want) this.ambient.length = want;
    for (const a of this.ambient) {
      a.x += Math.sin(this.time * 0.4 * a.speed + a.phase) * 14 * k * dt;
      a.y += (Math.cos(this.time * 0.3 * a.speed + a.phase) * 10 - 5) * k * dt;
      if (a.y < img.h * 0.15) a.y = img.h * 0.85;
    }
  }

  // ------------------------------------------------------------------ drawing
  /** One atlas cell as {img, sx, sy, size}: straight from the atlas in neutral light, otherwise a copy
   *  multiplied by the hour's light, cached until the hour changes. */
  cell(file, sx, sy, size) {
    const atlas = this.art.ready(file);
    if (!atlas) return null;
    const [r, g, b] = TINT[this.tod.key] || TINT.afternoon;
    if (r >= 1 && g >= 1 && b >= 1) return {img: atlas, sx, sy, size};
    const key = `${file}:${sx}:${sy}`;
    let c = this.tinted.get(key);
    if (c) return c;
    const canvas = canvasOf(size, size), x = canvas.getContext('2d');
    if (!x) return {img: atlas, sx, sy, size}; // no memory for a tinted copy: untinted beats invisible
    x.drawImage(atlas, sx, sy, size, size, 0, 0, size, size);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = `rgb(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0})`; x.fillRect(0, 0, size, size);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(atlas, sx, sy, size, size, 0, 0, size, size);
    c = {img: canvas, sx: 0, sy: 0, size};
    this.tinted.set(key, c);
    return c;
  }
  clearTinted() { for (const c of this.tinted.values()) release(c.img); this.tinted.clear(); }
  /** Draw a cell from cell() into a destination rectangle. */
  blit(ctx, c, x, y, w, h) { ctx.drawImage(c.img, c.sx, c.sy, c.size, c.size, x, y, w, h); this.drawCalls++; }
  drawBase(ctx, entry, alpha) {
    const v = this.view, c = entry.ready, w = c.width * v.s, h = c.height * v.s, W = this.width, H = this.height, sd = entry.sides;
    ctx.globalAlpha = alpha;
    if (v.x > 0) ctx.drawImage(sd.left, 0, v.y, v.x + 1, h);
    if (v.x + w < W) ctx.drawImage(sd.right, v.x + w - 1, v.y, W - v.x - w + 1, h);
    if (v.y > 0) ctx.drawImage(sd.top, v.x, 0, w, v.y + 1);
    if (v.y + h < H) ctx.drawImage(sd.bottom, v.x, v.y + h - 1, w, H - v.y - h + 1);
    // and the corner pixels fill whatever lies diagonally beyond the picture
    const x0 = Math.max(0, v.x), x1 = Math.min(W, v.x + w), y0 = Math.max(0, v.y), y1 = Math.min(H, v.y + h), cw = c.width - 1, ch = c.height - 1;
    for (const [sx, sy, dx, dy, dw, dh] of [[0, 0, 0, 0, x0, y0], [cw, 0, x1, 0, W - x1, y0], [0, ch, 0, y1, x0, H - y1], [cw, ch, x1, y1, W - x1, H - y1]]) {
      if (dw > 0 && dh > 0) ctx.drawImage(c, sx, sy, 1, 1, dx - 1, dy - 1, dw + 2, dh + 2);
    }
    ctx.drawImage(c, v.x, v.y, w, h);
    this.drawCalls++;
  }
  draw(quiet) {
    const ctx = this.ctx, v = this.view, W = this.width, H = this.height;
    this.drawCalls = 0;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
    // the hour on screen: the newest woven background, dissolving from the previous hour or blanket
    const now = this.compositeReady(this.tod.key), shown = now || this.shown;
    const edges = shown?.edges || ['#9fd0f0', '#3a6f9a'], grd = ctx.createLinearGradient(0, v.y, 0, v.y + this.m.image.h * v.s);
    grd.addColorStop(0, edges[0]); grd.addColorStop(1, edges[1]);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    const from = this.fading?.ready && this.fading !== now ? this.fading : null;
    const k = this.swap ? this.swap.t : this.tod.from ? this.tod.t : 1;
    if (from && now && k < 1) { this.drawBase(ctx, from, 1); this.drawBase(ctx, now, ease.inOutCubic(k)); }
    else if (from && !now) this.drawBase(ctx, from, 1);
    else if (shown?.ready) this.drawBase(ctx, shown, 1);
    if (now) this.shown = now;
    ctx.globalAlpha = 1;
    const night = this.tod.from && this.tod.t < 1 ? lerp(NIGHT[this.tod.from], NIGHT[this.tod.key], this.tod.t) : NIGHT[this.tod.key] ?? 0.2;
    // koi under the water, before anything that stands on the ground can cover them
    this.drawCalls += this.life.drawPond(ctx, v, this.dpr, night);

    this.drawLanterns(ctx, quiet, night);
    this.drawFire(ctx, quiet, night);
    for (const ring of this.rings) this.drawRing(ctx, ring, quiet);
    if (!quiet) for (const id of this.hintIds) { const f = this.state.fruits.find(x => x.id === id); if (f) this.drawRing(ctx, {at: f, radius: FRUITS[f.level].radius + 0.18, color: '#fff3b0', width: 0.06, pulse: true}, quiet); }

    // everything on the ground, painted back to front
    const items = [], held = this.selection?.type === 'fruit' ? this.selection.id : null, depth = (x, z) => this.imagePoint(x, 0, z).y;
    for (const f of this.state.fruits) {
      const view = this.fruits.get(f.id);
      if (view && !view.hidden) items.push([depth(view.pos.x, view.pos.z) + (held === f.id ? 1e6 : 0), () => this.drawFruit(ctx, view, f, held === f.id, quiet)]);
    }
    for (const s of this.servings()) items.push([depth(s.pos.x, s.pos.z) + 0.5, () => this.drawSprite(ctx, s.level, s.pos, s.scale)]);
    for (const g of this.ghosts) items.push([depth(g.pos.x, g.pos.z) + 5e5, () => this.drawSprite(ctx, g.view.level, g.pos, FRUITS[g.view.level].radius * 2 * g.scale)]);
    for (const c of this.characters.values()) if (c.root.visible) items.push([depth(c.root.position.x, c.root.position.z), () => this.drawFriend(ctx, c, quiet)]);
    if (this.brambleLamp) items.push([depth(this.brambleLamp.x, this.brambleLamp.z), () => this.drawLamp(ctx, this.brambleLamp, 0.5, 1, quiet, night)]);
    items.sort((a, b) => a[0] - b[0]);
    for (const [, paint] of items) paint();

    this.drawCalls += this.life.drawButterflies(ctx, v, this.dpr);
    this.hours.draw(ctx, v, this.dpr);
    this.drawFestival(ctx, quiet);
    if (this.ambient.length) {
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = night > 0.7 ? '#eaff9c' : '#fff3c8';
      for (const a of this.ambient) {
        const p = this.toScreen(a);
        ctx.globalAlpha = night > 0.7 ? 0.35 + 0.65 * Math.max(0, Math.sin(this.time * 1.7 + a.phase * 3)) : 0.3;
        ctx.beginPath(); ctx.arc(p.x, p.y, a.size * Math.max(0.7, v.s), 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    this.fx.draw(ctx, v, this.dpr);
  }
  glowAt(ctx, p, r, alpha) {
    if (alpha <= 0.01) return;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(this.glow, p.x - r, p.y - r, r * 2, r * 2); this.drawCalls++;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  /** A paper lantern whose lamp origin sits at world point `at`, cross-fading unlit to lit. */
  drawLamp(ctx, at, scale, lit, quiet, night, sway = 0, hook = null) {
    const lanterns = this.m.shared.lanterns, meta = lanterns[`${this.lanternKey}-lit`] || Object.values(lanterns)[0];
    const size = meta.unitsPerCell * scale * this.unit(at.x, at.y, at.z) * this.view.s, k = size / meta.cell, o = this.toScreen(this.imagePoint(at.x, at.y, at.z));
    ctx.save();
    if (sway && hook) { ctx.translate(hook.x, hook.y); ctx.rotate(sway); ctx.translate(-hook.x, -hook.y); }
    for (const [state, alpha] of [['unlit', 1 - lit], ['lit', lit]]) {
      const m = lanterns[`${this.lanternKey}-${state}`], c = alpha > 0.01 && m && this.cell(m.file, 0, 0, m.cell);
      if (!c) continue;
      ctx.globalAlpha = alpha; this.blit(ctx, c, o.x - m.pivot[0] * k, o.y - m.pivot[1] * k, size, size);
    }
    ctx.restore();
    const flicker = 1 + (quiet ? 0 : Math.sin(this.time * 13 + at.x) * 0.04 + Math.sin(this.time * 7.3 + at.z * 2) * 0.05);
    this.glowAt(ctx, {x: o.x, y: o.y - size * 0.28}, size * (0.9 + night * 0.9), lit * flicker * (0.3 + night * 0.6));
  }
  drawLanterns(ctx, quiet, night) {
    this.lanterns.forEach((l, i) => {
      const a = this.lanternAnchor(i);
      if (a) this.drawLamp(ctx, a.origin, a.scale, l.lit, quiet, night, quiet ? 0 : Math.sin(this.time * 0.9 + l.flicker) * 0.03, this.toScreen(a));
    });
  }
  drawFire(ctx, quiet, night) {
    if (this.fire < 0.02) return;
    const c = this.m.anchors.campfire.world, u = this.unit(c[0], c[1], c[2]) * this.view.s, base = this.toScreen(this.imagePoint(c[0], c[1] + 0.05, c[2]));
    const on = this.fire * Math.max(0.35, night);
    this.glowAt(ctx, {x: base.x, y: base.y - u * 0.25}, u * 1.6, on * 0.55);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const lick = quiet ? 1 : 0.8 + Math.sin(this.time * 11 + i * 1.7) * 0.15 + Math.sin(this.time * 23 + i * 3.4) * 0.1;
      const w = u * 0.34 * (1.1 - lick * 0.2), h = u * 0.62 * lick, x = base.x + (i - 1.5) * u * 0.1;
      ctx.globalAlpha = on * 0.9; ctx.drawImage(this.flame, x - w / 2, base.y - h, w, h); this.drawCalls++;
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  drawRing(ctx, ring, quiet) {
    const c = this.world3(ring.at, 0.12), u = this.unit(c.x, 0.12, c.z) * this.view.s;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, p = this.toScreen(this.imagePoint(c.x + Math.cos(a) * ring.radius, 0.12, c.z + Math.sin(a) * ring.radius)); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
    ctx.strokeStyle = ring.color; ctx.lineWidth = Math.max(1.5, ring.width * u);
    ctx.globalAlpha = 0.95 * (ring.pulse && !quiet ? 0.75 + 0.25 * Math.sin(this.time * 6) : 1);
    if (ring.dash) { ctx.setLineDash([u * 0.14, u * 0.1]); ctx.lineDashOffset = quiet ? 0 : -this.time * u * 0.4; }
    ctx.stroke(); this.drawCalls++;
    ctx.restore();
  }
  /** A fruit sprite with its model origin at world `pos`, the model scaled to `scale` units (as in 3D). */
  drawSprite(ctx, level, pos, scale, {sx = 1, sy = 1, tilt = 0, flip = false} = {}) {
    const atlas = this.m.sprites.fruit, meta = atlas.cells[level], c = this.cell(atlas.file, meta.cell[0], meta.cell[1], atlas.cell);
    if (!c) return;
    const size = meta.unitsPerCell * scale / (FRUITS[level].radius * 2) * this.unit(pos.x, pos.y, pos.z) * this.view.s, k = size / atlas.cell;
    const o = this.toScreen(this.imagePoint(pos.x, pos.y, pos.z)), px = meta.pivot[0] * k;
    ctx.save();
    ctx.translate(o.x, o.y);
    if (tilt) ctx.rotate(tilt);
    ctx.scale(flip ? -sx : sx, sy); // mirrored about the pivot, which stays on the fruit's resting point
    this.blit(ctx, c, -px, -meta.pivot[1] * k, size, size);
    ctx.restore();
  }
  drawFruit(ctx, v, f, picked, quiet) {
    const t = this.time, pos = v.pos, r = FRUITS[f.level].radius;
    const breathe = quiet ? 0 : Math.sin(t * 2.2 + v.phase) * 0.018;
    const excited = this.targetIds.has(f.id) && !quiet ? Math.abs(Math.sin(t * 9 + v.phase)) * 0.08 : 0;
    const hint = this.hintIds.has(f.id) && !quiet ? Math.max(0, Math.sin(t * 5)) * 0.06 : 0;
    const hovered = this.hovered === f.id && !picked ? 0.06 : 0;
    const y = v.sq + breathe + excited + hint, xz = 1 / Math.sqrt(Math.max(0.3, y)), grow = v.gr * (picked ? 1.1 : 1 + hovered);
    // a soft contact shadow on the cloth: wider and fainter while the fruit is lifted
    const lift = clamp((pos.y - REST_Y) / 1.4), g = this.toScreen(this.imagePoint(pos.x, 0.1, pos.z)), u = this.unit(pos.x, 0.1, pos.z) * this.view.s;
    const rr = r * u * (1 + lift * 0.6) * Math.max(0.2, grow);
    ctx.globalAlpha = (picked ? 0.34 : 0.22) * (1 - lift * 0.45); ctx.fillStyle = '#3a2410';
    ctx.beginPath(); ctx.ellipse(g.x, g.y, rr * 1.05, rr * 0.45, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    this.drawSprite(ctx, f.level, v3(pos.x, pos.y + (excited * 1.5 + hint * 2) * r, pos.z), r * 2 * grow, {sx: xz, sy: y, tilt: -v.tilt + (picked && !quiet ? Math.sin(t * 6) * 0.04 : 0), flip: v.flip});
  }
  drawFriend(ctx, c, quiet) {
    const meta = this.m.sprites.friends[c.name], file = this.m.files.friends[c.name];
    if (!meta || !this.art.ready(file)) return;
    const {pose, lift, squash} = c.frame(quiet), at = meta.poses[pose] || meta.poses.idle0, cell = this.cell(file, at[0], at[1], meta.cell);
    if (!cell) return;
    const p = c.root.position, s = c.root.scale.y, u = this.unit(p.x, p.y, p.z) * this.view.s, size = meta.unitsPerCell * s * u, k = size / meta.cell;
    const ground = this.toScreen(this.imagePoint(p.x, p.y, p.z)), o = this.toScreen(this.imagePoint(p.x, p.y + lift * s, p.z));
    ctx.globalAlpha = 0.24 * (1 - lift); ctx.fillStyle = '#2e1c0c';
    ctx.beginPath(); ctx.ellipse(ground.x, ground.y, 0.42 * s * u, 0.16 * s * u, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(o.x, o.y); ctx.scale(c.facing / squash, squash);
    this.blit(ctx, cell, -meta.pivot[0] * k, -meta.pivot[1] * k, size, size);
    ctx.restore();
  }
  drawFestival(ctx, quiet) {
    const v = this.view, sky = this.m.shared.skyLantern, cell = sky && this.cell(sky.file, 0, 0, sky.cell);
    if (this.finaleTime) for (const l of this.skyLanterns) {
      const k = this.time - this.finaleTime - l.delay;
      if (k < 0) continue;
      const pos = v3(l.start.x * (1 + k * 0.04) + Math.sin(k * 0.6 + l.sway) * 0.6, l.start.y + k * l.speed, l.start.z + Math.cos(k * 0.5 + l.sway) * 0.4 - k * 0.55);
      if (l.bramble) { this.drawLamp(ctx, pos, 0.5, 1, quiet, 1); continue; }
      if (!cell) continue;
      const size = sky.unitsPerCell * l.size * this.unit(pos.x, pos.y, pos.z) * v.s, q = size / sky.cell, o = this.toScreen(this.imagePoint(pos.x, pos.y, pos.z));
      this.blit(ctx, cell, o.x - sky.pivot[0] * q, o.y - sky.pivot[1] * q, size, size);
      this.glowAt(ctx, {x: o.x, y: o.y - size * 0.3}, size * 0.8, 0.55);
    }
    if (this.answerLights) {
      const img = this.m.image, band = this.m.anchors.sky.h, u = img.w / 2560;
      for (const a of this.answerLights) {
        const k = this.time - this.answerTime - a.delay;
        if (k > 0) this.glowAt(ctx, this.toScreen({x: a.x * img.w, y: a.y * band + (a.dy - k * a.rise) * u}), a.r * u * v.s * 2.4, clamp(k / 1.2) * (0.75 + (quiet ? 0 : Math.sin(this.time * 3 + a.phase) * 0.2)));
      }
    }
    if (this.reply) {
      // a Catmull-Rom path through the reply's control points, in image px
      const r = this.reply, k = ease.inOutCubic(clamp((this.time - r.start) / r.duration)), path = this.replyPath(), n = path.length - 1;
      const f = k * n, i = Math.min(n - 1, Math.floor(f)), tt = f - i, P = j => path[Math.max(0, Math.min(n, j))];
      const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * tt + (2 * a - 5 * b + 4 * c - d) * tt * tt + (3 * b - a - 3 * c + d) * tt * tt * tt);
      const at = {x: cr(P(i - 1).x, P(i).x, P(i + 1).x, P(i + 2).x), y: cr(P(i - 1).y, P(i).y, P(i + 1).y, P(i + 2).y) - (quiet ? 0 : Math.sin(this.time * 1.7) * 8 * (1 - k))};
      const o = this.toScreen(at), size = (sky?.unitsPerCell || 1) * 1.3 * this.unit(r.end.x, r.end.y, r.end.z) * v.s * (0.35 + 0.65 * k);
      if (cell) { const q = size / sky.cell; this.blit(ctx, cell, o.x - sky.pivot[0] * q, o.y - sky.pivot[1] * q, size, size); }
      this.glowAt(ctx, {x: o.x, y: o.y - size * 0.3}, size * 1.1, 0.75);
    }
  }
}
