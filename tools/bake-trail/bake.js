// Bakes The Lantern Trail's map of Fernhollow from the game's own Blender kit into 2.5D art:
// a ground plate (tiles), a prop sprite atlas, one sprite sheet per friend, and a height and walk grid.
// Dev tool only: `npm run assets:trail` drives this page through headless Chrome; nothing here ships.
// The camera is orthographic, so a sprite baked once is valid anywhere on the map.
import * as THREE from 'three';
import {AssetLibrary} from '../../src/engine/assets.js';
import {Renderer} from '../../src/engine/renderer.js';
import {TimeOfDay, TIMES} from '../../src/engine/sky.js';
import {Grass} from '../../src/engine/foliage.js';
import {Character} from '../../src/engine/characters.js';
import * as M from '../../src/trail/trail-map.js';

const params = new URLSearchParams(location.search);
const HOUR = params.get('hour') || 'golden';
const FRIENDS = ['pip', 'momo', 'nori', 'juniper', 'bramble'];
const ISLAND_LAWN = {rx: 10.8, rz: 8.3}; // the island mesh's lawn radii at scale 1 (lantern-scene.js)
const LAWN_PAD = 1.1; // the visible lawn reaches a little past the walkable ellipse
const FRIEND_HEIGHT = 1.15; // Pip's height on the trail, world units
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const canvas = document.getElementById('bake');
const view = new Renderer(canvas, {quality: 'ultra'});
const renderer = view.renderer;
const scene = new THREE.Scene();
const P = M.PLATE;
const camera = new THREE.OrthographicCamera(P.x0, P.x1, -P.v0, -P.v1, 1, 220);
camera.position.set(0, M.SIN * 90, M.COS * 90); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
view.attach(scene, camera);
view.resize(P.w, P.h);
view.adapt = () => {};

const tod = new TimeOfDay(renderer, scene);
tod.go(HOUR, 0);
tod.dome.visible = false; // an orthographic camera sees one point of the dome; the cloud sea replaces it
tod.setShadowSize(Math.min(8192, renderer.capabilities.maxTextureSize));
const look = TIMES[HOUR];
view.setGrade(tod.current.grade, tod.current.bloom);
scene.fog.near = 120; scene.fog.far = 330;

function aimSun() {
  const dir = V(...tod.current.sun).normalize();
  tod.sun.position.copy(dir).multiplyScalar(90); tod.sunTarget.position.set(0, 0, 0);
  Object.assign(tod.sun.shadow.camera, {left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 200});
  tod.sun.shadow.camera.updateProjectionMatrix();
  tod.sun.shadow.radius = 2.5; tod.sun.shadow.bias = -0.0003;
}
aimSun();

const library = await new AssetLibrary().load(new URL('../../assets/lantern-picnic/', document.baseURI));
const mat = name => library.materials.get(name);
tod.update(0.016, 0); aimSun();

// ------------------------------------------------------------------------------ the cloud sea
const cloudSea = new THREE.Mesh(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  fog: false,
  uniforms: {
    lit: {value: new THREE.Color(look.cloudLit)}, shade: {value: new THREE.Color(look.cloudShade)}, deep: {value: new THREE.Color(look.deep)},
    haze: {value: new THREE.Color(look.haze)}, glow: {value: new THREE.Color(look.glow)}, sun: {value: new THREE.Vector2(look.sun[0], look.sun[2]).normalize()},
  },
  vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`
    uniform vec3 lit, shade, deep, haze, glow; uniform vec2 sun; varying vec3 vW;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * n(p); p = p * 2.03 + vec2(3.1, 1.7); a *= 0.5; } return v; }
    void main(){
      vec2 p = vW.xz * vec2(0.085, 0.12);
      float c = fbm(p), puff = smoothstep(0.38, 0.78, c);
      float lightSide = clamp((c - fbm(p + sun * 0.05)) * 5.0 + 0.5, 0.0, 1.0);
      vec3 col = mix(deep, shade, smoothstep(0.2, 0.6, c));
      col = mix(col, lit, puff * (0.35 + 0.65 * lightSide));
      col += glow * pow(puff * lightSide, 3.0) * 0.25;
      float far = smoothstep(14.0, -34.0, vW.z);
      col = mix(col, haze, far * 0.5);
      gl_FragColor = vec4(col, 1.0);
    }`,
}));
cloudSea.position.y = -8.5; cloudSea.renderOrder = -5;
scene.add(cloudSea);

// ------------------------------------------------------------------------------ islets
const groups = {plate: new THREE.Group(), sprites: new THREE.Group(), islands: new THREE.Group()};
scene.add(groups.islands, groups.plate, groups.sprites);
const turf = new Map(); // islet id -> turf meshes
for (const I of M.ISLETS) {
  const island = library.clone('island');
  const sx = I.rx * LAWN_PAD / ISLAND_LAWN.rx, sz = I.rz * LAWN_PAD / ISLAND_LAWN.rz;
  island.scale.set(sx * I.flip, 0.95 + (sx + sz) * 0.12, sz);
  island.rotation.y = I.turn;
  island.position.set(I.x, I.y, I.z);
  island.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  groups.islands.add(island);
  island.updateMatrixWorld(true);
  const meshes = [];
  island.traverse(o => { if (o.isMesh && o.material?.name === 'turf') meshes.push(o); });
  turf.set(I.id, meshes);
}
// a few far islets drifting in the margins, for depth
{
  const rand = M.random(99);
  for (let k = 0, n = 0; k < 400 && n < 9; k++) {
    const x = P.x0 + rand() * (P.x1 - P.x0), z = -30 + rand() * 52, y = -3.5 - rand() * 3;
    if (M.ISLETS.some(I => ((x - I.x) / (I.rx + 3.5)) ** 2 + ((z - I.z) / (I.rz + 3.5)) ** 2 < 1)) continue;
    const s = 0.12 + rand() * 0.12, isle = library.clone('island');
    isle.scale.set(s * (rand() < 0.5 ? -1 : 1), s, s); isle.position.set(x, y, z); isle.rotation.y = rand() * 6.28;
    isle.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
    groups.islands.add(isle);
    const tree = library.clone(['tree_pine', 'tree_oak', 'tree_blossom'][n % 3]);
    tree.scale.setScalar(s * 3.2); tree.position.set(x, y - 0.02, z); groups.islands.add(tree);
    n++;
  }
}

const ray = new THREE.Raycaster(), down = V(0, -1, 0);
/** Lawn height at (x, z) on an islet, or null off the lawn. */
function lawnAt(I, x, z) {
  ray.set(V(x, I.y + 12, z), down); ray.far = 30;
  const hit = ray.intersectObjects(turf.get(I.id), false)[0];
  return hit ? hit.point.y : null;
}
const isletOf = (x, z, pad = 1.25) => M.ISLETS.find(I => ((x - I.x) / (I.rx * pad)) ** 2 + ((z - I.z) / (I.rz * pad)) ** 2 < 1);
function groundAt(x, z) {
  const I = isletOf(x, z);
  return I ? lawnAt(I, x, z) ?? I.y : 0;
}

// ------------------------------------------------------------------------------ bridges
/** The kit's materials multiply by vertex colour; give procedural geometry a flat painted colour. */
function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b, 1], i * 4);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 4));
  return geo;
}
const rawwood = mat('rawwood') || mat('wood'), rope = new THREE.MeshStandardMaterial({color: '#6b5a48', roughness: 0.9});
function deckY(a, b, t) { const L = Math.hypot(b.x - a.x, b.z - a.z); return a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * Math.min(0.32, L * 0.05); }
function buildBridge(a, b, seed) {
  const g = new THREE.Group(), rand = M.random(seed);
  const L = Math.hypot(b.x - a.x, b.z - a.z), heading = Math.atan2(b.x - a.x, b.z - a.z);
  const width = 1.25, n = Math.floor(L / 0.36);
  const plank = paint(new THREE.BoxGeometry(width, 0.08, 0.3), '#b88a5a');
  for (let i = 0; i <= n; i++) {
    const t = i / n, m = new THREE.Mesh(plank, rawwood);
    m.position.set(a.x + (b.x - a.x) * t + (rand() - 0.5) * 0.04, deckY(a, b, t) + 0.04, a.z + (b.z - a.z) * t);
    m.rotation.set((rand() - 0.5) * 0.06, heading + (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.05);
    m.scale.x = 0.94 + rand() * 0.1;
    g.add(m);
  }
  const side = V(Math.cos(heading), 0, -Math.sin(heading));
  const postGeo = paint(new THREE.BoxGeometry(0.12, 0.95, 0.12), '#94673f');
  for (const s of [-1, 1]) {
    const pts = [];
    const posts = Math.max(2, Math.round(L / 2.4) + 1);
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      const p = V(a.x + (b.x - a.x) * t, deckY(a, b, t), a.z + (b.z - a.z) * t).addScaledVector(side, s * (width / 2 + 0.04));
      const post = new THREE.Mesh(postGeo, rawwood); post.position.copy(p).setY(p.y + 0.42); post.rotation.y = heading; g.add(post);
    }
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(V(a.x + (b.x - a.x) * t, deckY(a, b, t) + 0.82 - Math.sin(Math.PI * t * (posts - 1)) ** 2 * 0.12, a.z + (b.z - a.z) * t).addScaledVector(side, s * (width / 2 + 0.04)));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.022, 5, false), rope));
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
const decks = [];
for (const [i, br] of M.BRIDGES.entries()) { const {a, b} = M.bridgeEnds(br); groups.plate.add(buildBridge(a, b, 300 + i)); decks.push({id: br.id, a, b}); }
groups.plate.add(buildBridge(M.ARRIVAL.a, M.ARRIVAL.b, 299)); decks.push({id: 'arrival', a: M.ARRIVAL.a, b: M.ARRIVAL.b});

// ------------------------------------------------------------------------------ landmarks
const stone = mat('stone');
function stoneLantern({scale = 1, lit = false, big = false} = {}) {
  const g = new THREE.Group();
  const add = (geo, y) => { const m = new THREE.Mesh(paint(geo, '#cdbfa8'), stone); m.position.y = y; g.add(m); return m; };
  if (big) {
    add(new THREE.CylinderGeometry(1.25, 1.4, 0.3, 10), 0.15);
    add(new THREE.CylinderGeometry(0.95, 1.08, 0.3, 10), 0.45);
    add(new THREE.CylinderGeometry(0.72, 0.82, 0.26, 10), 0.73);
  } else {
    add(new THREE.CylinderGeometry(0.4, 0.48, 0.16, 8), 0.08);
    add(new THREE.CylinderGeometry(0.15, 0.2, 0.66, 8), 0.49);
    add(new THREE.CylinderGeometry(0.36, 0.28, 0.12, 8), 0.88);
  }
  const lamp = library.clone('lantern'), ls = big ? 1.9 : 0.62, top = big ? 0.86 : 0.94;
  lamp.scale.setScalar(ls); lamp.position.y = top;
  lamp.traverse(o => {
    if (!o.isMesh) return;
    o.material = [o.material].flat().map(m => {
      if (!m.name?.startsWith('paper')) return m;
      const k = m.clone(); k.color.set(lit ? '#ffe9b8' : '#e9dcc4'); k.emissive = new THREE.Color('#ffb347'); k.emissiveIntensity = lit ? 2.4 : 0.02; return k;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  g.add(lamp);
  if (!big) {
    const cap = add(new THREE.ConeGeometry(0.5, 0.32, 8), top + 1.02 * ls + 0.12);
    cap.rotation.y = Math.PI / 8;
    add(new THREE.SphereGeometry(0.07, 10, 8), top + 1.02 * ls + 0.33);
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const pillar = new THREE.Mesh(paint(new THREE.BoxGeometry(0.06, 1.02 * ls, 0.06), '#cdbfa8'), stone);
      pillar.position.set(dx * 0.25, top + 1.02 * ls / 2, dz * 0.25); g.add(pillar);
    }
  }
  g.scale.setScalar(scale);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function signpost() {
  const g = new THREE.Group();
  const post = library.clone('post'); post.scale.setScalar(0.5); g.add(post);
  for (const [y, r, w] of [[1.08, 0.18, 0.95], [0.78, -0.22, 0.8]]) {
    const board = new THREE.Mesh(paint(new THREE.BoxGeometry(w, 0.24, 0.06), '#c9955d'), rawwood);
    board.position.set(0.12, y, 0.06); board.rotation.set(0, r, (r > 0 ? 0.04 : -0.05)); g.add(board);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** A sprite-kind object, built fresh (shared geometry and materials). */
function makeProp(kind, {lit = false} = {}) {
  if (kind === 'waystone') return stoneLantern({lit});
  if (kind === 'beacon') return stoneLantern({lit, big: true});
  if (kind === 'signpost') return signpost();
  if (kind === 'great_oak') { const t = library.clone('tree_oak'); t.scale.setScalar(2.05); return wrap(t); }
  if (kind === 'toadstool') { const t = library.clone('mushrooms'); t.scale.setScalar(2.9); return wrap(t); }
  if (kind === 'basket') { const t = library.clone('basket'); t.scale.setScalar(0.62); return wrap(t); }
  return library.clone(kind);
}
function wrap(o) { const g = new THREE.Group(); g.add(o); return g; }

// Sprite variants turn a kind to a fixed angle so its baked shadow and its sprite always agree.
const VARIANT_TURN = [0.4, 2.3];
const turnOf = (p) => p.variant !== undefined ? VARIANT_TURN[p.variant] : p.rot;
const spriteId = p => M.KINDS[p.kind]?.sprite ? `${p.kind}:${p.variant ?? 0}` : p.kind;

// ------------------------------------------------------------------------------ dressing
const scenery = M.planScenery(), steps = M.planSteps(), marks = M.landmarks();
const placed = []; // sprite props with resolved heights
for (const p of [...scenery, ...steps]) p.y = groundAt(p.x, p.z);
for (const p of marks) p.y = groundAt(p.x, p.z);

// flat dressing straight into the plate, instanced per kind
{
  const byKind = new Map();
  for (const p of [...scenery, ...steps]) if (!M.KINDS[p.kind]?.sprite) {
    if (!byKind.has(p.kind)) byKind.set(p.kind, []);
    byKind.get(p.kind).push(new THREE.Matrix4().compose(V(p.x, p.y - 0.02, p.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), p.rot), V(p.s, p.s, p.s)));
  }
  // Nori's fairy ring in the wood
  const ring = M.spot('wood', 'ring'), rr = M.random(77), list = byKind.get('mushrooms') || [];
  for (let k = 0; k < 13; k++) {
    const a = k / 13 * Math.PI * 2 + rr() * 0.2, x = ring.x + Math.cos(a) * 1.85, z = ring.z + Math.sin(a) * 1.45;
    list.push(new THREE.Matrix4().compose(V(x, groundAt(x, z) - 0.02, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rr() * 6.28), V(1, 1, 1).multiplyScalar(0.45 + rr() * 0.2)));
  }
  byKind.set('mushrooms', list);
  for (const [kind, mats] of byKind) groups.plate.add(library.instanced(kind, mats, {castShadow: kind !== 'stone_step' && kind !== 'tuft'}));
  // Juniper's storybook in the grass by the great oak
  const jb = M.spot('oak', 'juniper'), book = library.clone('storybook');
  book.position.set(jb.x + 0.55, groundAt(jb.x + 0.55, jb.z + 0.25), jb.z + 0.25); book.scale.setScalar(0.6); book.rotation.y = -0.6; groups.plate.add(book);
}
// the pond
{
  const w = M.spot('pond', 'water'), s = 1.9;
  let y = groundAt(w.x, w.z);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) for (const r of [0.6, 1.2, 1.6]) y = Math.max(y, groundAt(w.x + Math.cos(a) * r * 1.25 * s, w.z + Math.sin(a) * r * 0.85 * s));
  const pond = library.clone('pond'); pond.position.set(w.x, y + 0.03, w.z); pond.scale.setScalar(s); groups.plate.add(pond);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({color: '#2a8fb8', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3, emissive: '#0b3a52', emissiveIntensity: 0.35}));
  water.position.set(w.x, y + 0.045, w.z); water.scale.set(1.25 * 1.02 * s, 1, 0.85 * 1.02 * s); water.receiveShadow = true;
  groups.plate.add(water);
  M.SPOTS.pond.waterY = y;
}
// grass on every lawn, off the steps, the pond and the landmarks
const grassCount = Number(params.get('grass') || 5200);
for (const I of M.ISLETS) {
  const w = M.spot('pond', 'water');
  const avoid = (lx, lz) => {
    const x = I.x + lx, z = I.z + lz;
    if (I.id === 'pond' && ((x - w.x) / 2.9) ** 2 + ((z - w.z) / 2.0) ** 2 < 1) return true;
    if (marks.some(m => Math.hypot(m.x - x, m.z - z) < (M.LANDMARK_FOOT[m.kind] ?? 0.5) * 0.8)) return true;
    return steps.some(s => Math.abs(s.x - x) < 0.3 && Math.abs(s.z - z) < 0.3);
  };
  const g = new Grass({count: Math.round(grassCount * I.rx * I.rz / 40), seed: I.seed, inside: {rx: I.rx * 1.02, rz: I.rz * 1.02, y: (lx, lz) => (lawnAt(I, I.x + lx, I.z + lz) ?? I.y) - 0.01}, avoid, heightScale: 0.9});
  g.mesh.position.set(I.x, 0, I.z);
  groups.plate.add(g.mesh);
}
// sprite props: in the plate pass they only cast shadows (the runtime draws them, depth-sorted)
const shadowOnly = new Map();
function ghost(o) {
  o.traverse(m => {
    if (!m.isMesh) return;
    m.material = [m.material].flat().map(x => {
      if (!shadowOnly.has(x)) { const c = x.clone(); c.colorWrite = false; c.depthWrite = false; shadowOnly.set(x, c); }
      return shadowOnly.get(x);
    });
    if (m.material.length === 1) m.material = m.material[0];
    m.castShadow = true;
  });
  return o;
}
for (const p of [...scenery.filter(p => M.KINDS[p.kind]?.sprite), ...marks]) {
  const o = makeProp(p.kind);
  o.position.set(p.x, p.y - 0.02, p.z); o.rotation.y = turnOf(p); o.scale.multiplyScalar(p.s);
  groups.sprites.add(o);
  placed.push({...p, sprite: spriteId(p)});
}

// ------------------------------------------------------------------------------ capture helpers
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function encode(c, quality = 0.82) {
  return new Promise((resolve, reject) => c.toBlob(blob => {
    if (!blob) return reject(new Error('WebP encoding failed'));
    const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.readAsDataURL(blob);
  }, 'image/webp', quality));
}
function settle() { for (let i = 0; i < 4; i++) tod.update(0.05, i * 0.05); aimSun(); }

/** The composited plate, post-processing included. */
function grabPlate() {
  settle();
  const u = view.finish.uniforms;
  u.vignette.value = 0; u.grain.value = 0; u.blur.value = 0; u.fade.value = 0;
  view.render(0, 0);
  const c = canvasOf(canvas.width, canvas.height);
  c.getContext('2d').drawImage(canvas, 0, 0);
  return c;
}

// Khronos PBR Neutral + sRGB + the game's grade, applied to linear HDR sprite renders in JS so sprites
// match the composited plate (render targets skip the renderer's tone mapping). Same as tools/bake.
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

/** Render `subject` alone with an orthographic camera of the map's angle, framed on its bounds, at 2x then downsampled. */
function renderSprite(subject, {ppu = M.SPRITE_PPU, pad = 0.08, bounds = null} = {}) {
  subject.updateMatrixWorld(true);
  const box = bounds || new THREE.Box3().setFromObject(subject, true);
  const up = V(0, M.COS, -M.SIN), fwd = V(0, -M.SIN, -M.COS);
  let l = Infinity, r = -Infinity, t = -Infinity, b = Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = V(x, y, z); l = Math.min(l, p.x); r = Math.max(r, p.x); const v = p.dot(up); t = Math.max(t, v); b = Math.min(b, v);
  }
  l -= pad; r += pad; t += pad; b -= pad;
  const w = Math.ceil((r - l) * ppu), h = Math.ceil((t - b) * ppu);
  r = l + w / ppu; b = t - h / ppu;
  const cam = new THREE.OrthographicCamera(l, r, t, b, 1, 220);
  cam.position.copy(fwd).multiplyScalar(-90); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const n = 2, rt = new THREE.WebGLRenderTarget(w * n, h * n, {type: THREE.FloatType});
  const saved = scene.children.map(o => [o, o.visible]);
  for (const o of scene.children) o.visible = o.isLight || o === subject;
  const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
  renderer.setRenderTarget(null); renderer.setClearColor(clear, alpha);
  for (const [o, v] of saved) o.visible = v;
  const px = new Float32Array(w * n * h * n * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w * n, h * n, px);
  rt.dispose();
  const grade = tod.current.grade, tint = grade.tint?.isColor ? grade.tint : new THREE.Color(grade.tint ?? '#ffffff');
  const exposure = renderer.toneMappingExposure;
  const c = canvasOf(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data, W = w * n;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let R = 0, G = 0, B = 0, A = 0;
    for (let oy = 0; oy < n; oy++) for (let ox = 0; ox < n; ox++) {
      const i = ((h * n - 1 - (y * n + oy)) * W + x * n + ox) * 4;
      R += px[i]; G += px[i + 1]; B += px[i + 2]; A += px[i + 3];
    }
    A /= n * n;
    if (A < 1 / 512) continue;
    let [cr, cg, cb] = neutral(R / (n * n) / A, G / (n * n) / A, B / (n * n) / A, exposure).map(v => oetf(Math.max(0, v)));
    cr *= tint.r; cg *= tint.g; cb *= tint.b; cr *= 1 + grade.warmth; cb *= 1 - grade.warmth;
    const L = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
    cr = ((L + (cr - L) * grade.saturation) - 0.5) * grade.contrast + 0.5;
    cg = ((L + (cg - L) * grade.saturation) - 0.5) * grade.contrast + 0.5;
    cb = ((L + (cb - L) * grade.saturation) - 0.5) * grade.contrast + 0.5;
    const o = (y * w + x) * 4;
    d[o] = Math.round(Math.min(1, Math.max(0, cr)) * 255); d[o + 1] = Math.round(Math.min(1, Math.max(0, cg)) * 255); d[o + 2] = Math.round(Math.min(1, Math.max(0, cb)) * 255);
    d[o + 3] = Math.round(Math.min(1, A) * 255);
  }
  g.putImageData(img, 0, 0);
  return {canvas: c, l, t, w, h};
}
/** Sprite pixel of a world point, for a sprite framed by renderSprite's {l, t}. */
function spritePx(s, p, ppu = M.SPRITE_PPU) { return [+((p.x - s.l) * ppu).toFixed(1), +((s.t - (p.y * M.COS - p.z * M.SIN)) * ppu).toFixed(1)]; }

/** Skyline bottom-left packing of canvases into one atlas (2 px gutters); sets `rect` on each item. */
function pack(items, width = 2048) {
  const sorted = [...items].sort((a, b) => b.canvas.height - a.canvas.height || b.canvas.width - a.canvas.width);
  const sky = [{x: 0, y: 0, w: width}];
  let height = 0;
  for (const it of sorted) {
    const w = it.canvas.width + 2, h = it.canvas.height + 2;
    let best = null;
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i].x;
      if (x + w > width) break;
      let y = 0, span = 0;
      for (let j = i; span < w; j++) { y = Math.max(y, sky[j].y); span += sky[j].w; }
      if (!best || y + h < best.y + h || (y + h === best.y + h && x < best.x)) best = {x, y};
    }
    it.rect = {x: best.x, y: best.y, w: it.canvas.width, h: it.canvas.height};
    height = Math.max(height, best.y + h);
    // raise the skyline under the new item
    const top = {x: best.x, y: best.y + h, w};
    const next = [];
    for (const s of sky) {
      const a = s.x, b = s.x + s.w;
      if (b <= top.x || a >= top.x + top.w) { next.push(s); continue; }
      if (a < top.x) next.push({x: a, y: s.y, w: top.x - a});
      if (b > top.x + top.w) next.push({x: top.x + top.w, y: s.y, w: b - top.x - top.w});
    }
    next.push(top); next.sort((p, q) => p.x - q.x);
    sky.length = 0;
    for (const s of next) { const last = sky.at(-1); if (last && last.y === s.y && last.x + last.w === s.x) last.w += s.w; else sky.push({...s}); }
  }
  const c = canvasOf(width, height), g = c.getContext('2d');
  for (const it of items) g.drawImage(it.canvas, it.rect.x, it.rect.y);
  return c;
}

// ------------------------------------------------------------------------------ jobs
const out = {plate: null, sprites: null, cast: {}, grid: null};

async function platePass({reference = false} = {}) {
  // a little postcard of Toadstool Wood, every prop in place, for the door on the picnic's title
  const door = [];
  if (!reference) {
    const full = grabPlate(), W = M.isletById.wood, c = M.toPlate(W.x, W.y + 1.2, W.z), half = (W.rx + 1.2) * M.PPU;
    const card = canvasOf(128, 128), g = card.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.drawImage(full, c.px - half, c.py - half, half * 2, half * 2, 0, 0, 128, 128);
    door.push({file: 'door.webp', data: await encode(card, 0.86)});
  }
  const ghosts = [];
  if (!reference) for (const o of groups.sprites.children) { ghosts.push([o, o.children.length]); ghost(o); }
  const c = grabPlate();
  const files = [];
  const T = P.tile, tiles = [];
  for (let y = 0; y < P.h; y += T) for (let x = 0; x < P.w; x += T) {
    const w = Math.min(T, P.w - x), h = Math.min(T, P.h - y), t = canvasOf(w, h);
    t.getContext('2d').drawImage(c, x, y, w, h, 0, 0, w, h);
    const name = `ground-${x / T}-${y / T}.webp`;
    tiles.push({file: name, x, y, w, h});
    files.push({file: name, data: await encode(t, 0.8)});
  }
  const pw = 480, prev = canvasOf(pw, Math.round(P.h * pw / P.w)); prev.getContext('2d').drawImage(c, 0, 0, prev.width, prev.height);
  files.push({file: 'ground-preview.webp', data: await encode(prev, 0.6)});
  out.plate = {tiles, preview: 'ground-preview.webp'};
  if (reference) return [{file: 'ref-plate.webp', data: await encode(c, 0.88)}];
  return [...files, ...door];
}

async function spritePass() {
  const kinds = new Map();
  for (const p of placed) if (!kinds.has(p.sprite)) kinds.set(p.sprite, p);
  const items = [];
  for (const [id, p] of kinds) {
    for (const lit of (['waystone', 'beacon'].includes(p.kind) ? [false, true] : [false])) {
      const o = makeProp(p.kind, {lit});
      o.rotation.y = turnOf(p);
      scene.add(o);
      // big soft canopies are baked coarser; the runtime scales every sprite by its own ppu
      const ppu = /^(tree_|great_oak|toadstool)/.test(p.kind) ? 72 : M.SPRITE_PPU;
      const s = renderSprite(o, {ppu});
      scene.remove(o);
      const pivot = spritePx(s, V(0, 0, 0), ppu);
      const extra = {};
      if (p.kind === 'waystone') extra.light = spritePx(s, V(0, 0.94 + 0.62 * 0.5, 0), ppu);
      if (p.kind === 'beacon') extra.light = spritePx(s, V(0, 0.86 + 1.9 * 0.5, 0), ppu);
      items.push({id: lit ? `${id}:lit` : id, canvas: s.canvas, pivot, ppu, ...extra});
    }
  }
  const atlas = pack(items);
  out.sprites = {file: 'props.webp', w: atlas.width, h: atlas.height, ppu: M.SPRITE_PPU,
    items: Object.fromEntries(items.map(i => [i.id, {...i.rect, pivot: i.pivot, ppu: i.ppu, ...(i.light ? {light: i.light} : {})}]))};
  return [{file: 'props.webp', data: await encode(atlas, 0.88)}];
}

const POSES = {
  idle0: ['idle', 0.2, 0], idle1: ['idle', 0.7, 0], walk0: ['walk', 0, 0], walk1: ['walk', 0.25, 0], walk2: ['walk', 0.5, 0], walk3: ['walk', 0.75, 0],
  talk0: ['talk', 0.35, 0], talk1: ['talk', 0.75, 0], wave0: ['wave', 0.3, 0], cheer0: ['cheer', 0.28, 0], cheer1: ['cheer', 0.55, 0],
  hop0: ['hop', 0.35, 0], hop1: ['hop', 0.6, 0], eat0: ['eat', 0.3, 0], eat1: ['eat', 0.62, 0],
  back0: ['idle', 0.2, 1], bwalk0: ['walk', 0, 1], bwalk1: ['walk', 0.25, 1], bwalk2: ['walk', 0.5, 1], bwalk3: ['walk', 0.75, 1],
};
const FACING = [0.62, Math.PI - 0.62]; // front-right and back-right; the runtime mirrors for left
let friendScale = null;

async function castPass(name) {
  const c = new Character(library, name), root = c.root;
  root.position.set(0, 0, 0); scene.add(root);
  const pose = (clip, at, facing) => {
    c.mixer.stopAllAction();
    const action = c.actions.get(clip);
    action.reset(); action.setEffectiveWeight(1); action.play();
    action.time = at * action.getClip().duration;
    c.mixer.update(0);
    if (c.bones.eyes) c.bones.eyes.scale.y = 1;
    root.rotation.y = FACING[facing];
    root.updateMatrixWorld(true);
  };
  if (friendScale === null) {
    const pip = new Character(library, 'pip'); scene.add(pip.root);
    pip.mixer.stopAllAction(); pip.actions.get('idle').reset().play(); pip.mixer.update(0); pip.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pip.root, true);
    friendScale = FRIEND_HEIGHT / (box.max.y - box.min.y);
    scene.remove(pip.root);
  }
  root.scale.setScalar(friendScale);
  const bounds = new THREE.Box3();
  for (const [clip, at, f] of Object.values(POSES)) { pose(clip, at, f); bounds.union(new THREE.Box3().setFromObject(root, true)); }
  // a symmetric frame around the pivot so mirrored poses stay on their feet
  const half = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)), dz = Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z));
  const frame = new THREE.Box3(V(-half, Math.min(0, bounds.min.y), -dz), V(half, bounds.max.y, dz));
  const cells = [];
  for (const [key, [clip, at, f]] of Object.entries(POSES)) { pose(clip, at, f); cells.push({key, s: renderSprite(root, {bounds: frame, pad: 0.04})}); }
  scene.remove(root);
  const cw = cells[0].s.w, ch = cells[0].s.h, cols = 5, rows = Math.ceil(cells.length / cols);
  const atlas = canvasOf(cw * cols, ch * rows), g = atlas.getContext('2d'), poses = {};
  cells.forEach(({key, s}, i) => { g.drawImage(s.canvas, (i % cols) * cw, Math.floor(i / cols) * ch); poses[key] = [(i % cols) * cw, Math.floor(i / cols) * ch]; });
  // the face for HUD portraits: the top part of the talking pose, as a square in cell pixels
  pose('talk', 0.35, 0);
  const body = new THREE.Box3().setFromObject(root, true), tall = body.max.y - body.min.y;
  const top = spritePx(cells[0].s, V(0, body.max.y, 0)), size = Math.round(tall * 0.62 * M.SPRITE_PPU);
  const face = [Math.round(spritePx(cells[0].s, V(0, 0, 0))[0] - size / 2), Math.round(top[1] - size * 0.04), size];
  out.cast[name] = {file: `cast-${name}.webp`, cell: [cw, ch], poses, pivot: spritePx(cells[0].s, V(0, 0, 0)), height: +(bounds.max.y).toFixed(3), scale: +friendScale.toFixed(4), face};
  return [{file: `cast-${name}.webp`, data: await encode(atlas, 0.9)}];
}

/** Heights and walkable cells over the whole map: lawns (inside the walk ellipse), bridge decks, minus scenery. */
function gridPass() {
  const G = M.GRID, walk = new Uint8Array(G.nx * G.nz), height = new Uint8Array(G.nx * G.nz);
  const q = y => Math.max(0, Math.min(255, Math.round((y + 2) * 32)));
  for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) {
    const x = G.x0 + (i + 0.5) * G.cell, z = G.z0 + (j + 0.5) * G.cell, k = j * G.nx + i;
    const I = isletOf(x, z, 1.05);
    if (I && ((x - I.x) / I.rx) ** 2 + ((z - I.z) / I.rz) ** 2 < 1) {
      const y = lawnAt(I, x, z);
      if (y !== null && Math.abs(y - I.y) < 0.7) { walk[k] = 1; height[k] = q(y); }
    }
    for (const d of decks) {
      const vx = d.b.x - d.a.x, vz = d.b.z - d.a.z, L2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - d.a.x) * vx + (z - d.a.z) * vz) / L2));
      if (Math.hypot(x - d.a.x - vx * t, z - d.a.z - vz * t) < 0.6) {
        const y = deckY(d.a, d.b, t) + 0.08;
        if (!walk[k] || y > (height[k] / 32 - 2) - 0.05) { walk[k] = 1; height[k] = q(y); }
      }
    }
  }
  const block = (cx, cz, r) => {
    for (let j = Math.floor((cz - r - G.z0) / G.cell); j <= Math.ceil((cz + r - G.z0) / G.cell); j++)
      for (let i = Math.floor((cx - r - G.x0) / G.cell); i <= Math.ceil((cx + r - G.x0) / G.cell); i++) {
        if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) continue;
        if (Math.hypot(G.x0 + (i + 0.5) * G.cell - cx, G.z0 + (j + 0.5) * G.cell - cz) < r) walk[j * G.nx + i] = 0;
      }
  };
  for (const p of placed) { const foot = (M.KINDS[p.kind]?.foot ?? M.LANDMARK_FOOT[p.kind] ?? 0) * p.s; if (foot > 0) block(p.x, p.z, foot); }
  const w = M.spot('pond', 'water'); // the pond: an ellipse of rim stones and water
  for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) {
    const x = G.x0 + (i + 0.5) * G.cell, z = G.z0 + (j + 0.5) * G.cell;
    if (((x - w.x) / 2.75) ** 2 + ((z - w.z) / 1.9) ** 2 < 1) walk[j * G.nx + i] = 0;
  }
  const b64 = a => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
  out.grid = {...G, walk: b64(walk), height: b64(height), heightCode: 'y = byte / 32 - 2'};
  return [];
}

function manifest() {
  return {
    version: 1, generator: `tools/bake-trail (the game's Blender kit, three.js r${THREE.REVISION})`, hour: HOUR,
    pitch: M.PITCH, ppu: M.PPU, plate: {...P, ...out.plate}, grid: out.grid, sprites: out.sprites, cast: out.cast,
    props: placed.map(p => ({sprite: p.sprite, kind: p.kind, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), s: p.s, ...(p.id ? {id: p.id} : {}), islet: p.islet})),
    decks: decks.map(d => ({id: d.id, a: d.a, b: d.b})), pondY: +M.SPOTS.pond.waterY.toFixed(3),
  };
}

async function run(job) {
  const [kind, arg] = job.split(':');
  if (kind === 'ref') return platePass({reference: true});
  if (kind === 'plate') return platePass();
  if (kind === 'props') return spritePass();
  if (kind === 'cast') return castPass(arg);
  if (kind === 'grid') return gridPass();
  throw new Error(`Unknown job ${job}`);
}
const jobs = () => ['props', ...FRIENDS.map(f => `cast:${f}`), 'grid', 'plate'];

window.bake = {ready: true, jobs, run, manifest, size: [P.w, P.h]};
