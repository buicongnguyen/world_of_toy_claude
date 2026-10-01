// Bakes The Lantern Picnic's 3D diorama into the 2.5D art used by the light 2D stage.
// Dev tool only: `npm run assets:2d` drives this page through headless Chrome; nothing here ships.
// It runs the game's own LanternWorld, so the board layout, seeded scatter, lighting and camera
// maths are the 3D game's by construction, and every manifest matrix comes from the same CameraRig.
import * as THREE from 'three';
import {AssetLibrary} from '../../src/engine/assets.js';
import {LanternWorld, FRIENDS} from '../../src/lantern-scene.js';
import {newLantern} from '../../src/lantern-game.js';
import {FRUITS} from '../../src/picnic-game.js';
import {SHOP} from '../../src/lantern-shop.js';
import {CHAPTER_TIMES} from '../../src/engine/sky.js';

const REST_Y = 0.1;
// Board frames, cameras and image sizes. `safe` is the rect (fractions of the image) the board is
// fitted into; the rest is scenery margin for the stage to pan into at other aspect ratios.
export const LAYOUTS = {
  wide: {frame: {width: 14, depth: 9.8}, pitch: 46, fov: 28, phone: false, size: [2560, 1600], safe: [0.19, 0.24, 0.62, 0.62]},
  tall: {frame: {width: 7.4, depth: 10.2}, pitch: 62, fov: 34, phone: true, size: [1440, 2880], safe: [0.1, 0.25, 0.8, 0.55]},
  strip: {frame: {width: 14, depth: 6.4}, pitch: 54, fov: 28, phone: true, size: [2560, 1280], safe: [0.2, 0.15, 0.6, 0.78]},
};
const POSES = {idle0: ['idle', 0.2], idle1: ['idle', 0.7], talk0: ['talk', 0.35], wave0: ['wave', 0.22], wave1: ['wave', 0.42], wave2: ['wave', 0.62],
  cheer0: ['cheer', 0.28], cheer1: ['cheer', 0.55], eat0: ['eat', 0.3], eat1: ['eat', 0.62], hop0: ['hop', 0.35], hop1: ['hop', 0.6],
  walk0: ['walk', 0], walk1: ['walk', 0.25], walk2: ['walk', 0.5], walk3: ['walk', 0.75]};
const BLANKETS = SHOP.filter(i => i.kind === 'blanket');
const LANTERNS = SHOP.filter(i => i.kind === 'lantern');
const short = id => id.replace(/^(blanket|lantern)-/, '');

const layoutName = new URLSearchParams(location.search).get('layout') || 'wide';
const L = LAYOUTS[layoutName];
if (!L) throw new Error(`Unknown layout ${layoutName}`);

class BakeWorld extends LanternWorld {
  frameFor() { return {...L.frame}; }
  frameCamera() {
    // the game's own framing points for this board, fitted into a central rect with scenery margins
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, W = this.frame.width, D = this.frame.depth;
    const mx = L.phone ? 0.08 : 0.7, pts = [];
    for (const x of [-W / 2 - mx, W / 2 + mx]) pts.push(new THREE.Vector3(x, 0, D / 2 + (L.phone ? 0.3 : 0.9)), new THREE.Vector3(x, 0, -D / 2 - (L.phone ? 0.15 : 0.5)));
    if (!L.phone) for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) pts.push(new THREE.Vector3(x, 3.0, -D / 2 - 0.75));
    pts.push(this.guestSeat.clone().setY(L.phone ? 1.1 : 1.6));
    const [sx, sy, sw, sh] = L.safe;
    this.rig.fit(pts, w, h, {x: w * sx, y: h * sy, w: w * sw, h: h * sh}, {pitch: L.pitch, fov: L.fov});
  }
}

const state = newLantern();
Object.assign(state, {reducedMotion: true, sound: false, fruits: []});
const library = await new AssetLibrary().load(new URL('../../assets/lantern-picnic/', document.baseURI));
const world = new BakeWorld(document.getElementById('bake'), state, {}, library, {quality: 'ultra'});
cancelAnimationFrame(world.raf);
world.view.adapt = () => {};
const renderer = world.renderer, scene = world.scene;

// ----------------------------------------------------------------------------- simulation
/** Advance the world `seconds` in 50 ms steps without drawing, so lights and fades settle. */
function simulate(seconds = 6) {
  const render = world.view.render;
  world.view.render = () => {};
  for (let s = 0; s < seconds; s += 0.05) { world.last = performance.now() - 50; world.animate(performance.now()); cancelAnimationFrame(world.raf); }
  world.view.render = render;
}

function hideDynamic() {
  for (const c of world.characters.values()) c.root.visible = false;
  if (world.brambleLamp) world.brambleLamp.visible = false;
  world.fx.visible = false;
  for (const l of world.lanterns) l.lamp.traverse(o => { if (o.isMesh || o.isSprite) o.visible = false; });
  for (const f of world.fire.flames) f.visible = false;
}

/** Stage the clearing as it looks while invitation `i` is played (its time of day and keepsakes). */
function stage(i) {
  Object.assign(state.journey, {chapter: i, completed: [...Array(i).keys()], status: 'playing', replay: false});
  state.fruits = [];
  world.sync(true);
  world.updateKeepsakes(true);
  world.tod.go(CHAPTER_TIMES[i], 0);
  world.placeCast();
  hideDynamic();
  simulate(6);
  hideDynamic();
}

// ----------------------------------------------------------------------------- cloth
const fabrics = new Set();
world.cloth.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) if (m.name === 'gingham') fabrics.add(m); });
const fabric = [...fabrics][0];
const hazelMap = fabric.map;
// The field is baked in mid-grey so night light pools and bloom never clip it; `gain` (measured per
// plate against a white field) restores the brightness: composite = bg x pattern x gain.
const flat = v => { const t = new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
const WHITE = flat(255), GREY = flat(203); // sRGB 203 = 0.6 linear
function fieldMap(map) { for (const m of fabrics) { m.map = map; m.needsUpdate = true; } }

const textures = new Map([['blanket-cornflower', hazelMap]]);
await Promise.all(BLANKETS.filter(b => b.id !== 'blanket-cornflower').map(b => new THREE.TextureLoader().loadAsync(new URL(`../../assets/lantern-picnic/${b.look.texture}`, document.baseURI).href).then(t => {
  Object.assign(t, {flipY: hazelMap.flipY, wrapS: hazelMap.wrapS, wrapT: hazelMap.wrapT, colorSpace: hazelMap.colorSpace, channel: hazelMap.channel, rotation: hazelMap.rotation});
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.offset.copy(hazelMap.offset); t.repeat.copy(hazelMap.repeat); t.center.copy(hazelMap.center); t.needsUpdate = true;
  textures.set(b.id, t);
})));

// ----------------------------------------------------------------------------- capture helpers
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** The composited frame (post-processing included), read back in the same task it was drawn. */
function grabComposited({bloom = true} = {}) {
  const u = world.view.finish.uniforms;
  u.vignette.value = 0; u.grain.value = 0; u.blur.value = 0; u.fade.value = 0;
  if (world.view.bloom) world.view.bloom.enabled = bloom;
  world.view.render(0, world.time);
  const c = canvasOf(world.canvas.width, world.canvas.height);
  c.getContext('2d').drawImage(world.canvas, 0, 0);
  return c;
}

function encode(canvas, quality = 0.82) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) return reject(new Error('WebP encoding failed'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  }, 'image/webp', quality));
}

function scaled(canvas, width) {
  const c = canvasOf(width, Math.round(canvas.height * width / canvas.width)), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

/** Render `scene` with `camera` into an MSAA sRGB target with a transparent clear; unpremultiplied RGBA. */
function renderUnlit(camera, w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, {samples: 4, type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace});
  const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.setClearColor(clear, alpha);
  const px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  rt.dispose();
  const c = canvasOf(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4, dst = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const a = px[src + x + 3];
      if (!a) continue;
      const k = 255 / a;
      d[dst + x] = Math.min(255, px[src + x] * k); d[dst + x + 1] = Math.min(255, px[src + x + 1] * k); d[dst + x + 2] = Math.min(255, px[src + x + 2] * k); d[dst + x + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Khronos PBR Neutral + sRGB + the game's grade, applied to linear HDR sprite renders in JS so sprites
// match the composited backgrounds (render targets skip the renderer's tone mapping).
function neutral(r, g, b, exposure) {
  r *= exposure; g *= exposure; b *= exposure;
  const x = Math.min(r, g, b), offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= offset; g -= offset; b -= offset;
  const peak = Math.max(r, g, b), start = 0.76;
  if (peak < start) return [r, g, b];
  const d = 1 - start, np = 1 - d * d / (peak + d - start), s = np / peak;
  r *= s; g *= s; b *= s;
  const t = 1 - 1 / (0.15 * (peak - np) + 1);
  return [r + (np - r) * t, g + (np - g) * t, b + (np - b) * t];
}
const oetf = c => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

/** Render linear HDR at 2x into a float target, downsample 2x2, tone map and grade; unpremultiplied RGBA. */
function renderLit(camera, cell) {
  const n = cell * 2;
  const rt = new THREE.WebGLRenderTarget(n, n, {type: THREE.FloatType});
  const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.setClearColor(clear, alpha);
  const px = new Float32Array(n * n * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, n, n, px);
  rt.dispose();
  const grade = world.tod.current.grade, tint = new THREE.Color(grade.tint?.isColor ? grade.tint : grade.tint ?? '#ffffff');
  const exposure = renderer.toneMappingExposure;
  const c = canvasOf(cell, cell), g = c.getContext('2d'), img = g.createImageData(cell, cell), d = img.data;
  for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
    let r = 0, gg = 0, b = 0, a = 0;
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const sy = n - 1 - (y * 2 + oy), i = (sy * n + x * 2 + ox) * 4;
      r += px[i]; gg += px[i + 1]; b += px[i + 2]; a += px[i + 3];
    }
    a /= 4;
    if (a < 1 / 512) continue;
    let [cr, cg, cb] = neutral(r / 4 / a, gg / 4 / a, b / 4 / a, exposure).map(v => oetf(Math.max(0, v)));
    cr *= tint.r; cg *= tint.g; cb *= tint.b; cr *= 1 + grade.warmth; cb *= 1 - grade.warmth;
    const l = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
    cr = ((l + (cr - l) * grade.saturation) - 0.5) * grade.contrast + 0.5;
    cg = ((l + (cg - l) * grade.saturation) - 0.5) * grade.contrast + 0.5;
    cb = ((l + (cb - l) * grade.saturation) - 0.5) * grade.contrast + 0.5;
    const o = (y * cell + x) * 4;
    d[o] = Math.round(Math.min(1, Math.max(0, cr)) * 255); d[o + 1] = Math.round(Math.min(1, Math.max(0, cg)) * 255); d[o + 2] = Math.round(Math.min(1, Math.max(0, cb)) * 255);
    d[o + 3] = Math.round(Math.min(1, a) * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ----------------------------------------------------------------------------- projection
const W = L.size[0], H = L.size[1];
const camera = () => world.camera;
function px(v) {
  const q = new THREE.Vector3(v.x, v.y, v.z).project(camera());
  return [+((q.x * 0.5 + 0.5) * W).toFixed(2), +((-q.y * 0.5 + 0.5) * H).toFixed(2)];
}
const vec = v => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
const anchor = v => ({world: vec(v), px: px(v)});

/** 3x3 homography (row-major, h33 = 1) mapping board-normalized (x,y) to image px on y = REST_Y. */
function homography() {
  const src = [[0, 0], [1, 0], [1, 1], [0, 1]], dst = src.map(([x, y]) => px(world.world3({x, y}, REST_Y)));
  const A = [], b = [];
  src.forEach(([x, y], i) => {
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  });
  for (let c = 0; c < 8; c++) { // Gauss-Jordan
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  return [...b.map((v, i) => +(v / A[i][i]).toPrecision(10)), 1];
}

function rect(points) {
  const q = points.map(px), xs = q.map(p => p[0]), ys = q.map(p => p[1]);
  const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys)), x1 = Math.min(W, Math.max(...xs)), y1 = Math.min(H, Math.max(...ys));
  return {x: Math.round(x0), y: Math.round(y0), w: Math.round(Math.max(0, x1 - x0)), h: Math.round(Math.max(0, y1 - y0))};
}

// ----------------------------------------------------------------------------- sprites
const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** Camera looking at `centre` from the layout camera's direction at the game's distance, framing `size` units. */
function spriteCamera(centre, size) {
  const dir = camera().position.clone().sub(world.rig.base.target).normalize();
  const dist = world.rig.base.distance;
  const cam = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(size / 2 / dist)), 1, Math.max(0.1, dist - 30), dist + 30);
  cam.position.copy(centre).addScaledVector(dir, dist); cam.lookAt(centre); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return cam;
}
function spritePx(cam, v, cell) { const q = v.clone().project(cam); return [+((q.x * 0.5 + 0.5) * cell).toFixed(1), +((-q.y * 0.5 + 0.5) * cell).toFixed(1)]; }

/** Show only `subject` (plus the lights) while `fn` runs. */
function isolate(subject, fn) {
  const saved = scene.children.map(o => [o, o.visible]);
  for (const o of scene.children) o.visible = o.isLight || o === subject;
  try { return fn(); } finally { for (const [o, v] of saved) o.visible = v; }
}

function atlas(cells, cell, columns) {
  const rows = Math.ceil(cells.length / columns), c = canvasOf(columns * cell, rows * cell), g = c.getContext('2d');
  cells.forEach((img, i) => g.drawImage(img, (i % columns) * cell, Math.floor(i / columns) * cell));
  return c;
}

const round32 = v => Math.max(64, Math.round(v / 32) * 32);

function fruitSprites() {
  stage(0); // neutral afternoon light
  const centre = world.world3({x: 0.5, y: 0.5}, REST_Y);
  const ppu = Math.hypot(...[0, 1].map(i => px(centre.clone().add(V(1, 0, 0)))[i] - px(centre)[i]));
  const cell = round32(Math.min(320, Math.max(160, 2 * 0.68 * 1.45 * ppu * 1.6))); // headroom for held fruit and zoom shots
  const cells = [], meta = [];
  FRUITS.forEach((info, level) => {
    const size = info.radius * 2 * 1.45;
    const holder = new THREE.Group(), mesh = library.clone(`fruit_${level}`);
    mesh.scale.setScalar(info.radius * 2); holder.add(mesh); holder.position.copy(centre); scene.add(holder);
    const box = new THREE.Box3().setFromObject(holder), mid = box.getCenter(new THREE.Vector3());
    const cam = spriteCamera(mid, size);
    cells.push(isolate(holder, () => renderLit(cam, cell)));
    meta.push({level, name: info.name, cell: [(level % 4) * cell, Math.floor(level / 4) * cell], pivot: spritePx(cam, centre, cell), unitsPerCell: +size.toFixed(4), radius: info.radius});
    scene.remove(holder);
  });
  return {canvas: atlas(cells, cell, 4), cell, meta};
}

function friendSprites(name) {
  stage(0);
  const c = world.characters.get(name), root = c.root;
  const seat = world.world3({x: 0.5, y: 0.5}, 0.07);
  const saved = {pos: root.position.clone(), rot: root.rotation.y, scale: root.scale.x, visible: root.visible};
  root.position.copy(seat); root.rotation.y = 0.55; root.scale.setScalar(1); root.visible = true;
  const pose = (clip, at) => {
    c.mixer.stopAllAction();
    const action = c.actions.get(clip);
    action.reset(); action.setEffectiveWeight(1); action.play();
    action.time = at * action.getClip().duration;
    c.mixer.update(0);
    if (c.bones.eyes) c.bones.eyes.scale.y = 1;
    root.updateMatrixWorld(true);
  };
  // one framing for every pose: a square around the union of all posed bounds, seen from the layout camera
  const bounds = new THREE.Box3();
  for (const [clip, at] of Object.values(POSES)) { pose(clip, at); bounds.union(new THREE.Box3().setFromObject(root, true)); }
  const centre = bounds.getCenter(new THREE.Vector3()), probe = spriteCamera(centre, 1);
  let reach = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const q = V(x, y, z).project(probe); reach = Math.max(reach, Math.abs(q.x), Math.abs(q.y));
  }
  const size = +(reach * 1.08).toFixed(4);
  const ppu = Math.hypot(...[0, 1].map(i => px(seat.clone().add(V(1, 0, 0)))[i] - px(seat)[i]));
  const scale = world.friendScale();
  const cell = round32(Math.min(384, Math.max(160, size * scale * ppu * 1.6)));
  const cam = spriteCamera(centre, size), cells = [], poses = {};
  Object.entries(POSES).forEach(([name, [clip, at]], i) => {
    pose(clip, at);
    cells.push(isolate(root, () => renderLit(cam, cell)));
    poses[name] = [(i % 4) * cell, Math.floor(i / 4) * cell];
  });
  c.mixer.stopAllAction(); c.play('idle', 0);
  root.position.copy(saved.pos); root.rotation.y = saved.rot; root.scale.setScalar(saved.scale); root.visible = saved.visible;
  return {canvas: atlas(cells, cell, 4), cell, poses, pivot: spritePx(cam, seat, cell), unitsPerCell: size, facing: 'right', gameScale: scale};
}

function lanternSprite(look, lit) {
  stage(0);
  const lamp = library.clone('lantern');
  lamp.traverse(o => {
    if (!o.isMesh) return;
    o.material = [o.material].flat().map(m => {
      if (!m.name?.startsWith('paper')) return m;
      const k = m.clone(); k.color.set(look.paper); k.emissive = new THREE.Color(look.glow); k.emissiveIntensity = lit ? 2.2 : 0.05; return k;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  const at = world.world3({x: 0.5, y: 0.5}, 0.5);
  lamp.position.copy(at); scene.add(lamp);
  const box = new THREE.Box3().setFromObject(lamp), size = Math.max(box.max.y - box.min.y, box.max.x - box.min.x) * 1.12;
  const cam = spriteCamera(box.getCenter(new THREE.Vector3()), size), cell = 128;
  const canvas = isolate(lamp, () => renderLit(cam, cell));
  const meta = {pivot: spritePx(cam, at, cell), hook: spritePx(cam, at.clone().add(V(0, 1.02, 0)), cell), unitsPerCell: +size.toFixed(4)};
  scene.remove(lamp);
  return {canvas, meta};
}

function skyLanternSprite() {
  stage(0);
  const lamp = library.clone('sky_lantern');
  lamp.traverse(o => {
    if (!o.isMesh) return;
    o.material = [o.material].flat().map(m => { if (!m.name?.startsWith('paper')) return m; const k = m.clone(); k.emissive = new THREE.Color('#ffc46e'); k.emissiveIntensity = 1.8; return k; });
    if (o.material.length === 1) o.material = o.material[0];
  });
  const at = world.world3({x: 0.5, y: 0.5}, 0.5);
  lamp.position.copy(at); scene.add(lamp);
  const box = new THREE.Box3().setFromObject(lamp), size = Math.max(box.max.y - box.min.y, box.max.x - box.min.x) * 1.12;
  const cam = spriteCamera(box.getCenter(new THREE.Vector3()), size), cell = 128;
  const canvas = isolate(lamp, () => renderLit(cam, cell));
  const meta = {pivot: spritePx(cam, at, cell), unitsPerCell: +size.toFixed(4)};
  scene.remove(lamp);
  return {canvas, meta};
}

// ----------------------------------------------------------------------------- cloth pattern layer
/** The unlit blanket pattern in perspective, alpha = the visible field (everything else is a depth-only holdout). */
function clothPattern(texture) {
  stage(0);
  const field = new THREE.MeshBasicMaterial({map: texture, fog: false});
  const swaps = [], writes = new Map();
  scene.traverse(o => {
    if (!o.material) return;
    if (Array.isArray(o.material)) {
      if (o.material.some(m => fabrics.has(m))) { swaps.push([o, o.material]); o.material = o.material.map(m => fabrics.has(m) ? field : m); }
    } else if (fabrics.has(o.material)) { swaps.push([o, o.material]); o.material = field; }
    for (const m of [o.material].flat()) if (m !== field && !writes.has(m)) { writes.set(m, m.colorWrite); m.colorWrite = false; }
  });
  world.tod.dome.visible = false;
  try { return renderUnlit(camera(), W, H); } finally {
    world.tod.dome.visible = true;
    for (const [o, m] of swaps) o.material = m;
    for (const [m, w] of writes) m.colorWrite = w;
    field.dispose();
  }
}

// ----------------------------------------------------------------------------- pond and meadow
// The koi need exactly the visible water: a white render of the water with every other object as a
// depth-only holdout, like the cloth pattern. Lily pads, reeds, the stone rim and a bush in front
// all cut it, so fish clipped to this mask swim under them with no re-stamping.
function waterMask() {
  stage(0);
  const white = new THREE.MeshBasicMaterial({color: '#ffffff', fog: false}), saved = world.water.material, writes = new Map();
  world.water.material = white;
  scene.traverse(o => { if (o.material && o !== world.water) for (const m of [o.material].flat()) if (!writes.has(m)) { writes.set(m, m.colorWrite); m.colorWrite = false; } });
  world.tod.dome.visible = false;
  try { return renderUnlit(camera(), W, H); } finally {
    world.tod.dome.visible = true;
    world.water.material = saved;
    for (const [m, w] of writes) m.colorWrite = w;
    white.dispose();
  }
}

/** Crop a full-plate alpha mask to its covered pixels: {canvas, rect} in plate px. */
function cropMask(canvas, pad = 2) {
  const d = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) throw new Error(`The pond is not visible in the ${layoutName} layout`);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = canvasOf(w, h);
  out.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
  return {canvas: out, rect: {x: x0, y: y0, w, h}};
}

/** The water as the game builds it: a unit circle scaled to an ellipse on the plane y = waterY. */
function pondShape() {
  const wtr = world.water;
  return {centre: anchor(wtr.position), rx: +wtr.scale.x.toFixed(4), rz: +wtr.scale.z.toFixed(4), waterY: +wtr.position.y.toFixed(4)};
}

/** The real flower scatter in view, for butterflies to visit. */
function meadowFlowers() {
  const out = [], m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (const g of world.world.children) {
    if (!/^(flower_\w+|bush_flower)-instances$/.test(g.name)) continue;
    const mesh = g.children.find(o => o.isInstancedMesh);
    for (let i = 0; i < (mesh?.count ?? 0); i++) {
      mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m);
      const [x, y] = px(p);
      if (x > 0 && x < W && y > 0 && y < H) out.push({kind: g.name.replace('-instances', ''), ...anchor(p)});
    }
  }
  return out;
}

// ----------------------------------------------------------------------------- jobs
const files = {bg: {}, preview: {}, cloth: {}, clothGain: {}, fruit: null, friends: {}, lanterns: {}, skyLantern: null, pond: null};
let pondMask = null;
const sprites = {};

function manifest() {
  stage(0);
  const j = world;
  const centre = j.world3({x: 0.5, y: 0.5}, REST_Y);
  const ppu = Math.hypot(...[0, 1].map(i => px(centre.clone().add(V(1, 0, 0)))[i] - px(centre)[i]));
  const vp = camera().projectionMatrix.clone().multiply(camera().matrixWorldInverse);
  const lanterns = j.lanterns.map(l => {
    const box = new THREE.Box3();
    l.lamp.traverse(o => { if (o.isMesh) box.expandByObject(o); });
    const {x, z} = l.lamp.position, top = px(V(x, box.max.y, z)), bottom = px(V(x, box.min.y, z));
    return {hook: anchor(l.anchor), origin: anchor(l.lamp.position), scale: l.lamp.scale.x, heightPx: +Math.abs(bottom[1] - top[1]).toFixed(1)};
  });
  return {
    version: 1, layout: layoutName, generator: 'tools/bake (the game\'s LanternWorld, three.js r' + THREE.REVISION + ')',
    image: {w: W, h: H}, frame: {...L.frame}, restY: REST_Y, pitch: L.pitch, fov: L.fov,
    camera: {viewProj: vp.elements.map(v => +v.toPrecision(10)), position: vec(camera().position), target: vec(world.rig.base.target), distance: +world.rig.base.distance.toFixed(4)},
    world3: 'world = ((x - 0.5) * frame.width, y, (y_norm - 0.5) * frame.depth)',
    homography: homography(), pxPerUnit: +ppu.toFixed(3),
    boardCorners: [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => anchor(j.world3({x, y}, REST_Y))),
    anchors: {
      seats: j.seats.map(anchor), guestSeat: anchor(j.guestSeat), entry: anchor(j.entry), path: j.pathPoints.map(anchor), detour: j.detour.map(anchor),
      lanterns, campfire: anchor(j.spots.campfire), pond: anchor(j.spots.pond), tea: anchor(j.spots.tea), book: anchor(j.spots.book),
      basket: {...anchor(j.basket.position), scale: j.basket.scale.x}, plate: {...anchor(j.plate.position), scale: j.plate.scale.x},
      skewer: {...anchor(j.stick.position), scale: j.stick.scale.x}, skewerSlots: [0, 1, 2].map(i => anchor(j.skewerSlot(i))),
      // the open band above the lantern string, for sky lanterns, fireworks and the far islands' answer
      sky: {x: 0, y: 0, w: W, h: Math.round(Math.max(0, Math.min(...j.lanterns.map(l => px(l.anchor)[1])) - 20))},
    },
    scales: {friend: j.friendScale(), lantern: 0.85},
    keepsakes: {tea: 'from sunset (after invitation II)', bunting: 'from dusk (after III)', book: 'from night (after IV)', fire: 'lit from dusk (invitation IV on)', lanternLights: 'bg carries the light of the lanterns lit before that invitation; the lanterns themselves are sprites'},
    times: CHAPTER_TIMES,
    // the water (an ellipse on y = waterY) and, from the 'pond' job, a mask of exactly the visible water
    pond: {...pondShape(), mask: pondMask},
    meadow: {flowers: meadowFlowers()},
    files, sprites,
  };
}

async function run(job) {
  const [kind, arg] = job.split(':');
  if (kind === 'bg') {
    const i = CHAPTER_TIMES.indexOf(arg);
    stage(i);
    fieldMap(WHITE); const lit = grabComposited({bloom: true}).getContext('2d').getImageData(0, 0, W, H).data;
    fieldMap(GREY); const c = grabComposited({bloom: true});
    fieldMap(hazelMap);
    // gain = white-field / grey-field brightness over the field pixels that differ and do not clip
    const grey = c.getContext('2d').getImageData(0, 0, W, H).data, ratios = [];
    for (let k = 0; k < grey.length; k += 4 * 7) {
      const a = lit[k] + lit[k + 1] + lit[k + 2], b = grey[k] + grey[k + 1] + grey[k + 2];
      if (a - b > 12 && b > 30 && Math.max(lit[k], lit[k + 1], lit[k + 2]) < 246) ratios.push(a / b);
    }
    ratios.sort((x, y) => x - y);
    files.clothGain[arg] = +(ratios[Math.floor(ratios.length * 0.65)] || 1.25).toFixed(3); // clipped highlights bias low, so above the median
    const name = `bg-${layoutName}-${arg}.webp`, preview = `bg-${layoutName}-${arg}-preview.webp`;
    files.bg[arg] = name; files.preview[arg] = preview;
    return [{file: name, data: await encode(c, 0.82)}, {file: preview, data: await encode(scaled(c, 640), 0.7)}];
  }
  if (kind === 'ref') { // look-development only: the plate with Hazel's real blanket, as the 3D game draws it
    stage(CHAPTER_TIMES.indexOf(arg)); fieldMap(hazelMap);
    return [{file: `ref-${layoutName}-${arg}.webp`, data: await encode(grabComposited({bloom: true}), 0.9)}];
  }
  if (kind === 'cloth') {
    const c = clothPattern(textures.get(arg));
    const name = `cloth-${layoutName}-${short(arg)}.webp`;
    files.cloth[arg] = name;
    return [{file: name, data: await encode(c, 0.86)}];
  }
  if (kind === 'fruit') {
    const r = fruitSprites(), name = `fruit-${layoutName}.webp`;
    files.fruit = name; sprites.fruit = {file: name, cell: r.cell, columns: 4, cells: r.meta};
    return [{file: name, data: await encode(r.canvas, 0.9)}];
  }
  if (kind === 'friend') {
    const r = friendSprites(arg), name = `friend-${layoutName}-${arg}.webp`;
    files.friends[arg] = name;
    sprites.friends ??= {};
    sprites.friends[arg] = {file: name, cell: r.cell, columns: 4, poses: r.poses, pivot: r.pivot, unitsPerCell: r.unitsPerCell, facing: r.facing, gameScale: r.gameScale};
    return [{file: name, data: await encode(r.canvas, 0.9)}];
  }
  if (kind === 'lantern') {
    const item = LANTERNS.find(i => i.id === arg), out = [];
    sprites.lanterns ??= {};
    for (const lit of [true, false]) {
      const r = lanternSprite(item.look, lit), name = `lantern-${short(arg)}-${lit ? 'lit' : 'unlit'}.webp`;
      files.lanterns[`${short(arg)}-${lit ? 'lit' : 'unlit'}`] = name;
      sprites.lanterns[`${short(arg)}-${lit ? 'lit' : 'unlit'}`] = {file: name, cell: 128, ...r.meta, paper: item.look.paper, glow: item.look.glow};
      out.push({file: name, data: await encode(r.canvas, 0.9)});
    }
    return out;
  }
  if (kind === 'sky') {
    const r = skyLanternSprite(), name = 'sky-lantern.webp';
    files.skyLantern = name; sprites.skyLantern = {file: name, cell: 128, ...r.meta};
    return [{file: name, data: await encode(r.canvas, 0.9)}];
  }
  if (kind === 'pond') {
    const r = cropMask(waterMask()), name = `pond-${layoutName}.webp`;
    files.pond = name; pondMask = {file: name, rect: r.rect};
    return [{file: name, data: await encode(r.canvas, 0.9)}];
  }
  throw new Error(`Unknown job ${job}`);
}

function jobs({shared = false} = {}) {
  return [
    ...CHAPTER_TIMES.map(t => `bg:${t}`),
    ...BLANKETS.map(b => `cloth:${b.id}`),
    'fruit', 'pond',
    ...FRIENDS.map(f => `friend:${f}`),
    ...(shared ? [...LANTERNS.map(l => `lantern:${l.id}`), 'sky'] : []),
  ];
}

window.bake = {ready: true, layout: layoutName, jobs, run, manifest, world};
