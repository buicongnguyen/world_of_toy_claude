import {t} from './lantern-i18n.js';
// The Lantern Picnic world: a floating forest diorama built from the Blender libraries, the
// tactile fruit on the cloth, the toy friends, and every piece of feedback the rules produce.
import * as THREE from 'three';
import {FRUITS, BASKET, PLATE, nextItemLevel} from './picnic-game.js';
import {chapter, previewLantern, SKEWER, CHAPTERS, settleFruits} from './lantern-game.js';
import {Renderer, QUALITY} from './engine/renderer.js';
import {TimeOfDay, CHAPTER_TIMES} from './engine/sky.js';
import {CameraRig} from './engine/camera.js';
import {Sparkles, Drift, Flutter} from './engine/particles.js';
import {Grass, windify, wind} from './engine/foliage.js';
import {Character} from './engine/characters.js';
import {shopItem, equipped} from './lantern-shop.js';
import {approach, clamp, ease, random, Spring} from './engine/tween.js';

const TAU = Math.PI * 2;
const REST_Y = 0.1, HELD_Y = 0.95;
const SKEWER_STICK = 0.36; // bamboo height on the Blender skewer board (props.SKEWER_Z)
const ISLAND = {rx: 10.8, rz: 8.3};
export const FRIENDS = ['pip', 'momo', 'nori', 'juniper', 'bramble'];

// ---------------------------------------------------------------------------- highlight rings
const ringShader = {
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform vec3 color; uniform float opacity, time, width, dashes, pulse; varying vec2 vUv;
    void main(){
      float r = length(vUv);
      float ring = smoothstep(1.0 - width, 1.0 - width * 0.5, r) * (1.0 - smoothstep(0.97, 1.0, r));
      float glow = exp(-pow((r - (1.0 - width * 0.5)) * 7.0, 2.0)) * 0.35;
      float a = atan(vUv.y, vUv.x);
      float dash = dashes > 0.0 ? step(0.0, sin(a * dashes + time * 2.0)) : 1.0;
      float p = 1.0 + pulse * 0.35 * sin(time * 6.0);
      float alpha = (ring * dash + glow) * opacity * p;
      if (alpha < 0.005) discard;
      gl_FragColor = vec4(color * (1.4 + glow * 2.0), alpha);
    }`,
};
function ringMesh(color = '#ffd978', {width = 0.16, dashes = 0, pulse = 1} = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: {color: {value: new THREE.Color(color)}, opacity: {value: 1}, time: {value: 0}, width: {value: width}, dashes: {value: dashes}, pulse: {value: pulse}},
    vertexShader: ringShader.vertexShader, fragmentShader: ringShader.fragmentShader, transparent: true, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 3; m.visible = false;
  return m;
}

function softShadow() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(.6, 'rgba(0,0,0,.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,248,220,1)'); grd.addColorStop(.18, 'rgba(255,214,140,.7)'); grd.addColorStop(.5, 'rgba(255,170,80,.18)'); grd.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  // a soft teardrop: white-hot core, orange body, transparent tip
  const grd = g.createRadialGradient(32, 92, 2, 32, 80, 60);
  grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(.25, 'rgba(255,200,90,.95)'); grd.addColorStop(.55, 'rgba(255,120,40,.55)'); grd.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(52, 50, 60, 80, 54, 100); g.bezierCurveTo(46, 124, 18, 124, 10, 100); g.bezierCurveTo(4, 80, 12, 50, 32, 4); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------- the world
export class LanternWorld {
  constructor(canvas, state, callbacks, library, {quality = 'high', insets = null} = {}) {
    this.playSafe = insets;
    this.canvas = canvas; this.state = state; this.callbacks = callbacks; this.library = library;
    this.skyLanterns = [];
    this.time = 0; this.paused = false; this.selection = null; this.drag = null; this.safe = {top: 0, right: 0, bottom: 0, left: 0};
    this.frame = {width: 14, depth: 9.8};
    this.fruits = new Map(); this.ghosts = []; this.targetIds = new Set(); this.hintIds = new Set();
    this.touchDevice = matchMedia('(pointer: coarse)').matches;
    this.mode = 'play'; // 'title' | 'play' | 'cinematic'

    this.view = new Renderer(canvas, {quality, preserve: false});
    if (!QUALITY[quality].physical) library.simplifyMaterials();
    this.renderer = this.view.renderer;
    this.scene = new THREE.Scene();
    this.rig = new CameraRig();
    this.camera = this.rig.camera;
    this.view.attach(this.scene, this.camera);
    this.tod = new TimeOfDay(this.renderer, this.scene);
    this.tod.setShadowSize(this.view.quality.shadow);

    this.world = new THREE.Group(); this.world.name = 'diorama'; this.scene.add(this.world);
    this.props = new THREE.Group(); this.props.name = 'props'; this.scene.add(this.props);
    this.fx = new THREE.Group(); this.fx.name = 'fx'; this.scene.add(this.fx);

    this.sparkles = new Sparkles(1800); this.fx.add(this.sparkles.points);
    this.fireflies = new Drift({count: 260, color: '#e9ff9a', area: [26, 3.2, 20], centre: [0, 1.5, -1]});
    this.motes = new Drift({count: 140, color: '#fff3c8', area: [24, 5, 16], centre: [0, 2.2, 0], blinkRate: 0});
    this.flutter = new Flutter(420);
    this.fx.add(this.fireflies.points, this.motes.points, this.flutter.mesh);
    this.setBudget();

    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.09);
    this.ring = ringMesh('#ffdc78', {width: 0.14}); this.reachRing = ringMesh('#fff2c9', {width: 0.05, dashes: 18, pulse: 0}); this.reachRing.material.uniforms.opacity.value = 0.5;
    this.groupRings = []; this.hintRings = [];
    this.fx.add(this.ring, this.reachRing);
    this.shadowTex = softShadow(); this.glowTex = glowTexture();
    this.heldShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({map: this.shadowTex, transparent: true, depthWrite: false}));
    this.heldShadow.rotation.x = -Math.PI / 2; this.heldShadow.renderOrder = 2; this.heldShadow.visible = false; this.fx.add(this.heldShadow);

    this.buildProps();
    this.applyLooks();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.setChapterLook(true);
    this.sync(true);

    canvas.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', e => this.move(e), {passive: false});
    window.addEventListener('pointerup', e => this.up(e));
    window.addEventListener('pointercancel', e => { if (this.drag?.pointerId === e.pointerId) this.cancel(); });
    canvas.addEventListener('lostpointercapture', e => { if (this.drag?.pointerId === e.pointerId) this.cancel(); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('keydown', e => this.key(e));
    canvas.addEventListener('pointermove', e => this.hover(e));
    window.addEventListener('blur', () => this.cancel());
    this.last = performance.now();
    this.raf = requestAnimationFrame(t => this.animate(t));
  }

  get quiet() { return !!this.state.reducedMotion || !!this.systemQuiet; }
  /** Koi in the pond and butterflies over the flowers (lantern-life3d.js and the 42 KB critters.glb),
   *  fetched once the clearing is on screen, so they never hold up the first frame. */
  startLife() {
    this.lifeLoading ??= import('./lantern-life3d.js')
      .then(({Life3D}) => new Life3D(this, {budget: this.touchDevice ? 0.6 : 1}).load(new URL('./assets/lantern-picnic/', document.baseURI)))
      .then(life => { life.setHour(this.tod.key); this.life = life; this.scene.add(life.group); return life; })
      .catch(error => { console.warn('The pond life could not load', error); return null; });
    return this.lifeLoading;
  }
  lifeInfo() { return this.life ? this.life.info() : null; }

  setBudget() {
    const q = this.view.quality;
    this.sparkles.budget = q.particles * (this.touchDevice ? 0.7 : 1);
    this.flutter.budget = q.particles;
  }

  setQuality(key) {
    this.view.setQuality(key);
    this.tod.setShadowSize(this.view.quality.shadow);
    this.setBudget();
    this.buildBoard(true);
    this.resize();
  }

  // ------------------------------------------------------------------ coordinates
  world3(p, y = REST_Y) { return new THREE.Vector3((p.x - 0.5) * this.frame.width, y, (p.y - 0.5) * this.frame.depth); }
  world(p, y) { return this.world3(p, y); }
  normalized(v) { return {x: v.x / this.frame.width + 0.5, y: v.z / this.frame.depth + 0.5}; }
  project(p, height = 0.1) {
    const q = this.world3(p, height).project(this.camera);
    return {x: (q.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-0.5 * q.y + 0.5) * this.canvas.clientHeight};
  }
  projectWorld(v) {
    const q = v.clone().project(this.camera);
    return {x: (q.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-0.5 * q.y + 0.5) * this.canvas.clientHeight, visible: q.z < 1};
  }
  /** Where a friend's speech bubble points: just above their head, in canvas px (null off stage). */
  headPoint(name) {
    const c = this.characters.get(name);
    if (!c?.root.visible) return null;
    const head = c.root.position.clone(); head.y += 2.3 * c.root.scale.y;
    return this.projectWorld(head);
  }
  get mobile() { return this.frame.width < 10; }

  // ------------------------------------------------------------------ building the set
  buildProps() {
    const L = this.library;
    this.basket = L.clone('basket'); this.plate = L.clone('plate'); this.stick = L.clone('skewer');
    this.threaded = new THREE.Group(); this.plateFood = new THREE.Group();
    this.props.add(this.basket, this.plate, this.stick, this.threaded, this.plateFood);
    this.cloth = L.clone('cloth'); this.cloth.traverse(o => { if (o.isMesh) o.castShadow = false; });
    this.props.add(this.cloth);
    this.characters = new Map();
    for (const name of FRIENDS) {
      const c = new Character(L, name);
      c.root.visible = false;
      c.ground = (x, z) => this.groundAt(x, z);
      this.characters.set(name, c);
      this.scene.add(c.root);
    }
    this.lanterns = [];
    for (let i = 0; i < CHAPTERS.length; i++) {
      const lamp = L.clone('lantern');
      lamp.traverse(o => {
        if (o.isMesh) {
          o.material = [o.material].flat().map(m => { const c = m.clone(); c.userData.owned = true; return c; });
          if (o.material.length === 1) o.material = o.material[0];
        }
      });
      // a short reach: a warm pool on the grass and rope below, not streaks up the trees behind the string
      const light = new THREE.PointLight('#ffb35c', 0, 3.4, 1.8);
      light.position.y = 0.45;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: this.glowTex, color: '#ffe2a8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      glow.position.y = 0.46; glow.scale.setScalar(1.8); glow.material.opacity = 0;
      lamp.add(light, glow);
      this.lanterns.push({lamp, light, glow, lit: 0, target: 0, flicker: Math.random() * 10});
      this.props.add(lamp);
    }
    this.fire = {light: new THREE.PointLight('#ff8a3d', 0, 9, 1.5), on: 0, flames: []};
    this.scene.add(this.fire.light);
    // warm light pooling on the cloth as the evening darkens, so play stays readable at night
    this.picnicLight = new THREE.PointLight('#ffc98c', 0, 26, 1.1);
    this.picnicLight.position.set(0, 6.5, 1.2);
    this.scene.add(this.picnicLight);
    this.flameTex = flameTexture();
  }

  /** Rebuild the dressing around the cloth for the current frame (aspect ratio). */
  buildBoard(force = false) {
    const key = `${this.frame.width}x${this.frame.depth}:${this.view.qualityKey}`;
    if (key === this.boardKey && !force) return;
    this.boardKey = key;
    this.library.disposeClone(this.world);
    this.world.clear();
    const L = this.library, W = this.frame.width, D = this.frame.depth;
    const sx = Math.max(0.62, W / 14 * 1.02), sz = D / 9.8;
    this.islandScale = {x: sx, z: sz};
    const rx = ISLAND.rx * sx, rz = ISLAND.rz * sz;
    this.islandRadius = {rx, rz};
    const island = L.clone('island');
    island.scale.set(sx, 1, sz);
    island.traverse(o => { if (o.isMesh) o.castShadow = false; });
    this.world.add(island);
    this.cloth.scale.set(W / 14, 1, D / 9.8);
    this.sampleGround(island, rx, rz);
    const rand = random(1234);
    const inIsland = (x, z, m = 0.9) => (x / rx) ** 2 + (z / rz) ** 2 < m * m;
    const onCloth = (x, z, pad = 0.35) => Math.abs(x) < W / 2 + pad && Math.abs(z) < D / 2 + pad;
    const occupied = [];
    const free = (x, z, r) => occupied.every(o => Math.hypot(o.x - x, o.z - z) > o.r + r);
    const claim = (x, z, r) => occupied.push({x, z, r});

    // seats, paths and keepsake spots are reserved first
    this.layoutSeats();
    for (const s of [...this.seats, this.guestSeat, ...this.pathPoints]) claim(s.x, s.z, 0.8);
    const spots = this.spots = {
      campfire: new THREE.Vector3(-W / 2 - (this.mobile ? 1.2 : 2.1), 0, this.mobile ? -D / 2 - 1.5 : -1.2),
      book: new THREE.Vector3(this.mobile ? W / 2 - 0.9 : W / 2 + 1.3, 0, this.mobile ? -D / 2 - 1.1 : 1.9),
      tea: new THREE.Vector3(this.mobile ? -W / 2 + 1.2 : -W / 2 + 1.6, 0, -D / 2 - 1.0),
      pond: new THREE.Vector3(this.mobile ? -W / 2 + 0.6 : -W / 2 - 1.75, 0, this.mobile ? D / 2 + 1.9 : D / 2 - 2.3),
    };
    for (const [k, v] of Object.entries(spots)) {
      claim(v.x, v.z, k === 'pond' ? 1.6 : 1.0);
      // the pond rests level on the highest lawn under it so the turf never pokes through
      let y = this.groundAt(v.x, v.z);
      if (k === 'pond') for (let a = 0; a < TAU; a += TAU / 12) for (const r of [0.5, 1.0, 1.35]) y = Math.max(y, this.groundAt(v.x + Math.cos(a) * r * 1.3, v.z + Math.sin(a) * r * 0.9));
      v.y = y + (k === 'pond' ? 0.03 : -0.01);
    }

    // trees: a back arc and the flanks, instanced per species with wind sway
    const trees = {tree_oak: [], tree_pine: [], tree_birch: [], tree_blossom: []};
    const kinds = Object.keys(trees);
    const placeTree = (x, z, s) => {
      const kind = kinds[Math.floor(rand() * kinds.length)];
      trees[kind].push(new THREE.Matrix4().compose(new THREE.Vector3(x, this.groundAt(x, z) - 0.06, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * TAU), new THREE.Vector3(s, s * (0.9 + rand() * 0.25), s)));
      claim(x, z, 1.3 * s);
    };
    for (let i = 0; i < 60 && trees.tree_oak.length + trees.tree_pine.length + trees.tree_birch.length + trees.tree_blossom.length < (this.mobile ? 12 : 17); i++) {
      const a = Math.PI * (1.02 + rand() * 0.96); // back half of the island
      const r = 0.72 + rand() * 0.22;
      const x = Math.cos(a) * rx * r, z = Math.sin(a) * rz * r;
      if (z > -D / 2 + 0.6 && Math.abs(x) < W / 2 + 1.4) continue;
      if (onCloth(x, z, 1.2) || !free(x, z, 1.1)) continue;
      placeTree(x, z, 0.85 + rand() * 0.45);
    }
    for (const [kind, list] of Object.entries(trees)) {
      if (!list.length) continue;
      const g = L.instanced(kind, list, {material: m => (m.name === 'canopy' || m.name === 'leaves') ? windify(m, {height: 4.5, amount: 0.16, frequency: 1.1}) : m});
      this.world.add(g);
    }
    // bushes, rocks, ferns, mushrooms, flowers
    const scatter = (name, count, {min = 0.8, max = 1.2, radius = 0.5, band = [0.5, 0.97], avoidCloth = 0.5, front = true, shadow = true} = {}) => {
      const list = [];
      for (let i = 0; i < count * 12 && list.length < count; i++) {
        const a = rand() * TAU, r = band[0] + rand() * (band[1] - band[0]);
        const x = Math.cos(a) * rx * r, z = Math.sin(a) * rz * r;
        if (!front && z > D / 2) continue;
        if (onCloth(x, z, avoidCloth) || !free(x, z, radius) || !inIsland(x, z, 0.96)) continue;
        const s = min + rand() * (max - min);
        list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, this.groundAt(x, z) - 0.02, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * TAU), new THREE.Vector3(s, s, s)));
        claim(x, z, radius * s);
      }
      if (list.length) this.world.add(L.instanced(name, list, {castShadow: shadow, material: m => (m.name === 'canopy' || m.name === 'foliage' || m.name === 'leaves') ? windify(m, {height: 1.2, amount: 0.05, frequency: 1.7}) : m}));
    };
    const m = this.mobile ? 0.6 : 1;
    scatter('bush', Math.round(7 * m), {radius: 0.7, front: false});
    scatter('bush_berry', Math.round(4 * m), {radius: 0.7, front: false});
    scatter('bush_flower', Math.round(5 * m), {radius: 0.7});
    scatter('rock_0', Math.round(4 * m), {radius: 0.6, min: 0.6, max: 1.1});
    scatter('rock_1', Math.round(3 * m), {radius: 0.5, min: 0.5, max: 1});
    scatter('rock_2', Math.round(2 * m), {radius: 0.8, min: 0.6, max: 0.9, front: false});
    scatter('fern', Math.round(10 * m), {radius: 0.5, min: 0.7, max: 1.2});
    scatter('mushrooms', Math.round(6 * m), {radius: 0.35, min: 0.45, max: 0.75, avoidCloth: 0.9});
    scatter('log', this.mobile ? 0 : 1, {radius: 1.2, front: false});
    for (const f of ['flower_daisy', 'flower_bell', 'flower_tulip', 'flower_sun']) scatter(f, Math.round(14 * m), {radius: 0.12, min: 0.8, max: 1.3, band: [0.3, 0.98], avoidCloth: 0.25, shadow: false});
    scatter('tuft', Math.round(30 * m), {radius: 0.1, min: 0.8, max: 1.5, band: [0.2, 0.99], avoidCloth: 0.1, shadow: false});

    // pond, campfire, stones along the guests' path
    const pond = L.clone('pond'); pond.position.copy(spots.pond); pond.scale.setScalar(this.mobile ? 0.8 : 1.1); this.world.add(pond);
    this.water = this.makeWater();
    this.water.position.copy(spots.pond).setY(spots.pond.y - 0.03 * pond.scale.y);
    this.water.scale.set(1.25 * 1.02 * pond.scale.x, 1, 0.85 * 1.02 * pond.scale.z);
    this.world.add(this.water);
    this.campfire = L.clone('campfire'); this.campfire.position.copy(spots.campfire); this.world.add(this.campfire);
    this.fire.flames = [0, 1, 2, 3].map(i => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: this.flameTex, color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0}));
      s.center.set(0.5, 0.05);
      s.position.copy(spots.campfire).add(new THREE.Vector3((i - 1.5) * 0.09, 0.12, (i % 2 - 0.5) * 0.08));
      s.userData.phase = i * 1.7;
      this.world.add(s);
      return s;
    });
    this.fire.light.position.copy(spots.campfire).add(new THREE.Vector3(0, 0.8, 0));
    const steps = [];
    for (let i = 0; i < this.pathPoints.length - 1; i++) {
      const a = this.pathPoints[i], b = this.pathPoints[i + 1];
      const n = Math.max(1, Math.floor(a.distanceTo(b) / 0.8));
      for (let k = 0; k < n; k++) {
        const p = a.clone().lerp(b, (k + 0.5) / n);
        if (onCloth(p.x, p.z, 0.1)) continue;
        steps.push(new THREE.Matrix4().compose(p.setY(this.groundAt(p.x, p.z) - 0.01), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * TAU), new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + rand() * 0.3)));
      }
    }
    if (steps.length) this.world.add(L.instanced('stone_step', steps, {castShadow: false}));

    // lantern posts and the string of lanterns
    const postZ = -D / 2 - 0.75, postX = W / 2 - 0.4;
    for (const side of [-1, 1]) {
      const post = L.clone('post'); post.position.set(side * postX, this.groundAt(side * postX, postZ) - 0.03, postZ); post.rotation.y = side < 0 ? Math.PI : 0; this.world.add(post);
    }
    const hook = (side) => new THREE.Vector3(side * (postX - 0.2), 2.8 + this.groundAt(side * postX, postZ), postZ);
    const a = hook(-1), b = hook(1);
    const sag = this.mobile ? 0.55 : 0.8;
    const rope = new THREE.CatmullRomCurve3(Array.from({length: 9}, (_, i) => { const t = i / 8; return a.clone().lerp(b, t).setY(a.y - Math.sin(t * Math.PI) * sag); }));
    this.world.add(new THREE.Mesh(new THREE.TubeGeometry(rope, 60, 0.014, 5, false), new THREE.MeshStandardMaterial({color: '#4a3a2a', roughness: 0.9})));
    this.lanterns.forEach((l, i) => {
      const t = 0.12 + i * (0.76 / (this.lanterns.length - 1));
      const p = rope.getPoint(t);
      l.lamp.position.set(p.x, p.y - 1.02 * 0.85, p.z);
      l.lamp.scale.setScalar(0.85);
      l.anchor = p.clone();
    });
    // bunting (Nori's keepsake) on a second, lower string
    this.bunting = new THREE.Group();
    const low = new THREE.CatmullRomCurve3(Array.from({length: 9}, (_, i) => { const t = i / 8; return a.clone().lerp(b, t).setY(a.y - 0.55 - Math.sin(t * Math.PI) * sag * 0.8); }));
    this.bunting.add(new THREE.Mesh(new THREE.TubeGeometry(low, 60, 0.01, 4, false), new THREE.MeshStandardMaterial({color: '#6b5a48', roughness: 0.9})));
    const flagColors = ['#ef6f6c', '#ffd166', '#7ccba2', '#8ab4f8', '#f4a6c8', '#ffffff'];
    const flags = Math.round(W * 1.6);
    const flagParts = L.parts('bunting_flag');
    for (let i = 0; i < flags; i++) {
      const t = (i + 0.5) / flags, p = low.getPoint(t), tan = low.getTangent(t);
      for (const part of flagParts) {
        const mat = new THREE.MeshStandardMaterial({color: flagColors[i % flagColors.length], roughness: 0.8, side: THREE.DoubleSide});
        const flag = new THREE.Mesh(part.geometry, mat);
        flag.position.copy(p); flag.rotation.y = -Math.atan2(tan.z, tan.x);
        flag.scale.setScalar(this.mobile ? 0.8 : 1);
        flag.userData.sway = i;
        this.bunting.add(flag);
      }
    }
    this.world.add(this.bunting);

    // keepsakes
    this.tea = L.clone('teapot'); this.tea.position.copy(spots.tea); this.tea.scale.setScalar(0.62); this.tea.rotation.y = 0.5; this.world.add(this.tea);
    this.book = L.clone('storybook'); this.book.position.copy(spots.book); this.book.scale.setScalar(0.85); this.book.rotation.y = -0.4; this.world.add(this.book);
    this.jarLight = new THREE.PointLight('#9fc4ff', 0, 4, 1.8); this.jarLight.position.copy(spots.book).add(new THREE.Vector3(0.7, 0.5, 0)); this.world.add(this.jarLight);

    // grass
    const q = this.view.quality;
    const avoid = (x, z) => onCloth(x, z, 0.15) || occupied.some(o => o.r > 0.9 && Math.hypot(o.x - x, o.z - z) < o.r * 0.6) || Math.hypot(x - spots.pond.x, z - spots.pond.z) < 1.5 || Math.hypot(x - spots.campfire.x, z - spots.campfire.z) < 0.7;
    this.grass = new Grass({count: Math.round(q.grass * (this.mobile ? 0.6 : 1)), inside: {rx: rx * 0.985, rz: rz * 0.985, y: (x, z) => this.groundAt(x, z) - 0.01}, avoid, heightScale: 1});
    this.world.add(this.grass.mesh);

    // shadow camera hugs the island
    const cam = this.tod.sun.shadow.camera;
    Object.assign(cam, {left: -rx - 1, right: rx + 1, top: rz + 2, bottom: -rz - 2});
    cam.updateProjectionMatrix();
    this.updateKeepsakes(true);
  }

  /** Sample the island's top surface into a height field so everything stands on the lawn. */
  sampleGround(island, rx, rz) {
    island.updateMatrixWorld(true);
    const turf = [];
    island.traverse(o => { if (o.isMesh && o.material?.name === 'turf') turf.push(o); });
    const nx = 64, nz = 48, heights = new Float32Array((nx + 1) * (nz + 1));
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), origin = new THREE.Vector3();
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      origin.set((i / nx - 0.5) * 2 * rx, 4, (j / nz - 0.5) * 2 * rz);
      ray.set(origin, down);
      const hit = ray.intersectObjects(turf, false)[0];
      heights[j * (nx + 1) + i] = hit ? hit.point.y : -0.2;
    }
    this.groundField = {nx, nz, rx, rz, heights};
  }

  /** Lawn height at world (x, z); the cloth surface where the cloth is. */
  groundAt(x, z) {
    const W = this.frame.width, D = this.frame.depth;
    if (Math.abs(x) <= W / 2 && Math.abs(z) <= D / 2) return 0.07;
    const g = this.groundField;
    if (!g) return 0;
    const fx = clamp((x / (2 * g.rx) + 0.5), 0, 1) * g.nx, fz = clamp((z / (2 * g.rz) + 0.5), 0, 1) * g.nz;
    const i = Math.min(g.nx - 1, Math.floor(fx)), j = Math.min(g.nz - 1, Math.floor(fz)), u = fx - i, v = fz - j, w = g.nx + 1;
    const h = g.heights;
    return (h[j * w + i] * (1 - u) + h[j * w + i + 1] * u) * (1 - v) + (h[(j + 1) * w + i] * (1 - u) + h[(j + 1) * w + i + 1] * u) * v;
  }

  /** A small reflective pond surface with gently moving ripples. */
  makeWater() {
    if (!this.rippleMap) {
      const size = 128, c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'), img = g.createImageData(size, size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        // periodic ripples: sum of integer-frequency waves so the tile repeats seamlessly
        const u = x / size * TAU, v = y / size * TAU;
        const dx = Math.cos(u * 3 + v) * 0.5 + Math.cos(u * 5 - v * 2) * 0.3 + Math.sin(u * 2 + v * 4) * 0.2;
        const dy = Math.cos(v * 3 - u) * 0.5 + Math.sin(v * 5 + u * 2) * 0.3 + Math.cos(v * 2 - u * 3) * 0.2;
        const i = (y * size + x) * 4;
        img.data[i] = 128 + dx * 50; img.data[i + 1] = 128 + dy * 50; img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.rippleMap = new THREE.CanvasTexture(c);
      this.rippleMap.wrapS = this.rippleMap.wrapT = THREE.RepeatWrapping;
      this.rippleMap.repeat.set(3, 3);
    }
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({
      color: '#3f7f96', roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.82,
      normalMap: this.rippleMap, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.5,
    }));
    water.receiveShadow = true; water.renderOrder = 1;
    return water;
  }

  layoutSeats() {
    const W = this.frame.width, D = this.frame.depth;
    const guest = this.world3({x: 0.91, y: 0.89}, 0);
    this.guestSeat = guest;
    if (this.mobile) {
      this.seats = [-2.5, -0.85, 0.85, 2.5].map(x => new THREE.Vector3(x * W / 7.4, 0, -D / 2 - 1.05));
      this.entry = new THREE.Vector3(W / 2 + 1.6, 0, D / 2 + 1.4);
      this.pathPoints = [this.entry, new THREE.Vector3(W / 2 + 0.7, 0, D / 2 + 0.6), guest];
      this.detour = [new THREE.Vector3(W / 2 + 0.75, 0, D / 2 + 0.3), new THREE.Vector3(W / 2 + 0.75, 0, -D / 2 - 1.05)];
    } else {
      this.seats = [new THREE.Vector3(W / 2 + 1.05, 0, 0.7), new THREE.Vector3(W / 2 + 1.35, 0, -2.5),
        new THREE.Vector3(-W / 2 - 1.15, 0, -2.2), new THREE.Vector3(-W / 2 - 1.2, 0, 1.3)];
      this.entry = new THREE.Vector3(W / 2 + 3.4, 0, D / 2 + 0.9);
      this.pathPoints = [this.entry, new THREE.Vector3(W / 2 + 1.6, 0, D / 2 + 0.2), guest];
      this.detour = [new THREE.Vector3(guest.x, 0, D / 2 + 0.75), new THREE.Vector3(-W / 2 - 0.9, 0, D / 2 + 0.75)];
    }
  }

  friendScale() { return this.mobile ? 0.68 : 0.98; }

  /** Low establishing shot across the cloth toward the lanterns, for the title and ending. */
  titlePose(kind = 'title') {
    const b = this.rig.base, D = this.frame.depth;
    if (kind === 'ending') return {...b, target: new THREE.Vector3(0, 1.4, -D * 0.25), distance: b.distance * 0.8, pitch: THREE.MathUtils.degToRad(26), offset: new THREE.Vector2()};
    if (kind === 'festival') return {...b, target: new THREE.Vector3(0, 3.4, -D * 0.6), distance: b.distance * 1.05, pitch: THREE.MathUtils.degToRad(12), offset: new THREE.Vector2()};
    return {...b, target: new THREE.Vector3(0, 1.1, -D * 0.2), distance: b.distance * (this.mobile ? 0.8 : 0.62), pitch: THREE.MathUtils.degToRad(this.mobile ? 30 : 21), offset: new THREE.Vector2()};
  }

  // ------------------------------------------------------------------ chapter presentation
  setChapterLook(immediate = false) {
    const key = this.state.journey.status === 'complete' ? 'night' : CHAPTER_TIMES[this.state.journey.chapter] || 'afternoon';
    this.tod.go(key, immediate || this.quiet ? 0 : 5);
    this.life?.setHour(key);
    this.callbacks.onTime?.(key);
  }

  /** Place the current guest and all previous friends. walkIn animates the arrival. */
  placeCast({walkIn = false} = {}) {
    const j = this.state.journey, s = this.friendScale();
    const guestName = chapter(this.state).model;
    const done = j.status === 'complete';
    FRIENDS.forEach((name, i) => {
      const c = this.characters.get(name);
      c.root.scale.setScalar(s);
      const isGuest = name === guestName && !done;
      const isFriend = i < j.chapter || (done && i <= j.chapter);
      c.root.visible = isGuest || isFriend;
      if (!c.root.visible) return;
      if (isGuest) {
        const face = -0.35;
        if (walkIn && !this.quiet) {
          c.place(this.entry, -Math.PI / 2);
          c.walk(this.pathPoints.slice(1), {face, speed: 1.6, done: () => { c.react('wave'); this.callbacks.onArrive?.(name); }});
        } else c.place(this.guestSeat, face);
        c.setRest('idle');
      } else {
        const seat = this.seats[i] || this.seats[this.seats.length - 1];
        const face = Math.atan2(-seat.x, -seat.z) * 0.9;
        if (walkIn && !this.quiet && i === j.chapter - 1 && !done) {
          c.place(this.guestSeat, -0.35);
          const route = this.mobile ? [...this.detour, seat] : (seat.x < 0 ? [...this.detour, seat] : [new THREE.Vector3(seat.x, 0, this.guestSeat.z + 0.4), seat]);
          c.walk(route, {face, speed: 2.1});
        } else if (!c.path) c.place(seat, face);
        c.setRest('idle');
      }
    });
    this.guest = done ? null : this.characters.get(guestName);
    this.placeBrambleLantern();
  }

  updateKeepsakes(immediate = false) {
    const j = this.state.journey, done = j.completed;
    const show = (obj, on) => { if (!obj) return; if (on && !obj.visible && !immediate) this.sparkles.rise(obj.position.clone().add(new THREE.Vector3(0, 0.5, 0)), {count: 20, color: '#fff0b0'}); obj.visible = on; };
    show(this.tea, done.includes(1));
    show(this.bunting, done.includes(2));
    show(this.book, done.includes(3));
    this.jarTarget = done.includes(3) ? 1 : 0;
    this.lanterns.forEach((l, i) => { l.target = done.includes(i) ? 1 : 0; if (immediate) l.lit = l.target; });
    this.fireTarget = j.chapter >= 3 || j.status === 'complete' ? 1 : 0;
    if (this.campfire) this.campfire.visible = true;
  }

  // ------------------------------------------------------------------ layout
  /** New HUD insets: reframe the camera smoothly (no rebuild, no cancelled drag). */
  setSafeArea(insets, play = insets) {
    this.safe = insets; this.playSafe = play;
    const next = this.frameFor(this.canvas.clientWidth, this.canvas.clientHeight);
    // a new board shape (phones: the space the HUD leaves) needs a rebuild; otherwise just reframe
    if (!this.boardKey || next.width !== this.frame.width || next.depth !== this.frame.depth) this.resize();
    else this.frameCamera(true);
  }

  /** Board dimensions in world units. Phones size the cloth to the free space beside the HUD,
   *  so it fills the screen width in portrait and the full height in landscape. */
  frameFor(w, h) {
    const s = this.playSafe || {top: 0, right: 0, bottom: 0, left: 0};
    const aw = Math.max(160, w - s.left - s.right), ah = Math.max(160, h - s.top - s.bottom);
    const round = v => Math.round(v * 5) / 5;
    // phones pick the cloth's shape from the free space: tall or squarish -> portrait cloth,
    // wide -> a shallow landscape cloth (both families are covered by the rules tests)
    if ((w < 700 || h < 520) && aw / ah < 1.25) return {width: 7.4, depth: Math.min(11.8, Math.max(8.8, round(ah / aw * 7.4 * 1.05)))};
    if (w < 700 || h < 520) return {width: Math.min(14, Math.max(9, round(aw / ah * 6.4 * 0.95))), depth: 6.4};
    return {width: 14, depth: 9.8};
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const previous = {...this.frame};
    this.frame = this.frameFor(w, h);
    this.view.resize(w, h);
    this.sparkles.setViewport(h, this.view.pixelRatio); this.fireflies.setViewport(h, this.view.pixelRatio); this.motes.setViewport(h, this.view.pixelRatio);
    const reshaped = previous.width !== this.frame.width || previous.depth !== this.frame.depth;
    if (reshaped || !this.boardKey) this.buildBoard();
    if (reshaped && settleFruits(this.state, this.frame)) this.callbacks.onReseat?.();
    this.layout();
    this.frameCamera();
    for (const [id, f] of this.fruits) { const s = this.state.fruits.find(x => x.id === id); if (s) f.pos.copy(this.world3(s)); }
    this.cancel();
    this.callbacks.onResize?.();
  }

  frameCamera(smooth = false) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, W = this.frame.width, D = this.frame.depth, s = this.safe;
    // Frame the cloth with a little breathing room, plus the lantern string behind it, so the
    // clearing reads as a place rather than a board.
    // Phones frame the play surface alone (fruit need every pixel); the lanterns still show up in
    // the push-in when one is lit.
    const phone = w < 700 || h < 520;
    const mx = phone ? 0.08 : 0.7;
    const pts = [];
    for (const x of [-W / 2 - mx, W / 2 + mx]) pts.push(new THREE.Vector3(x, 0, D / 2 + (phone ? 0.3 : 0.9)), new THREE.Vector3(x, 0, -D / 2 - (phone ? 0.15 : 0.5)));
    if (!phone) for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) pts.push(new THREE.Vector3(x, 3.0, -D / 2 - 0.75));
    pts.push(this.guestSeat.clone().setY(phone ? 1.1 : 1.6));
    const safe = {x: s.left, y: s.top, w: Math.max(120, w - s.left - s.right), h: Math.max(120, h - s.top - s.bottom)};
    const pitch = phone ? (w < h ? 62 : 54) : 46;
    this.rig.fit(pts, w, h, safe, {pitch, fov: this.mobile ? 34 : 28, smooth: smooth && !this.quiet});
    this.view.setFocus(this.rig.screenY(new THREE.Vector3(0, 0, 0.6)), this.mobile ? 0.34 : 0.3, 2.4);
  }

  layout() {
    const mobile = this.mobile;
    this.layoutSeats();
    this.basket.position.copy(this.world3(BASKET, 0.02)); this.basket.scale.setScalar(mobile ? 0.8 : 1.05); this.basket.rotation.y = 0.12;
    this.plate.position.copy(this.world3(PLATE, 0.06)); this.plate.scale.setScalar(mobile ? 0.62 : 0.88);
    this.stick.position.copy(this.world3(SKEWER, 0.05)); this.stick.scale.setScalar(mobile ? 0.66 : 0.96);
    this.threaded.position.copy(this.stick.position); this.threaded.scale.copy(this.stick.scale);
    this.plateFood.position.copy(this.plate.position); this.plateFood.scale.copy(this.plate.scale);
    this.placeCast();
  }

  // ------------------------------------------------------------------ fruit views
  makeFruit(f, {from, delay = 0, pop = false, delivery = false} = {}) {
    const mesh = this.library.clone(`fruit_${f.level}`);
    const holder = new THREE.Group();
    holder.add(mesh);
    const view = {
      id: f.id, level: f.level, holder, mesh,
      pos: (from || this.world3(f)).clone(), vel: new THREE.Vector3(), tilt: new THREE.Vector2(),
      squash: new Spring(1, {stiffness: 260, damping: 11}), grow: new Spring(pop ? 0 : 1, {stiffness: 170, damping: 12}),
      phase: Math.random() * TAU, born: this.time + delay, hop: 0, delivery: delivery ? {start: this.time + delay, from: from.clone()} : null,
    };
    if (pop) view.grow.target = 1;
    holder.position.copy(view.pos);
    holder.rotation.y = ((f.id * 17) % 13 - 6) * 0.05;
    this.scene.add(holder);
    this.fruits.set(f.id, view);
    return view;
  }

  removeFruit(view) { this.scene.remove(view.holder); }

  /** Called before sync with the successful result of a rules action, to choreograph it. */
  choreograph(result) { this.pending = result; }

  sync(initial = false) {
    const r = this.pending; this.pending = null;
    const ids = new Set(this.state.fruits.map(f => f.id));
    for (const [id, view] of [...this.fruits]) {
      if (ids.has(id)) continue;
      this.fruits.delete(id);
      // choreographed exits
      let exit = null;
      if (r?.type === 'merge' && r.removed.includes(id)) exit = {to: this.world3(r.position, REST_Y), shrink: true, duration: 0.2};
      else if ((r?.type === 'serve' || r?.type === 'share') && r.fruit.id === id) exit = {to: this.plate.position.clone().add(new THREE.Vector3(0, 0.35, 0)), shrink: true, duration: 0.42, arc: 1.2};
      else if (r?.type === 'skewer' && r.fruit.id === id) exit = {to: this.skewerSlot(Math.min(2, this.state.journey.skewers ? 2 : this.state.journey.skewer.length - 1)), shrink: false, duration: 0.38, arc: 1.0};
      if (exit && !this.quiet) this.ghosts.push({view, from: view.holder.position.clone(), ...exit, t: 0});
      else this.removeFruit(view);
    }
    const spawned = new Set((r?.spawned || []).map(f => f.id));
    const outputs = new Set((r?.type === 'merge' ? r.outputs : []).map(f => f.id));
    let stagger = 0;
    for (const f of this.state.fruits) {
      const view = this.fruits.get(f.id);
      if (view) {
        if (view.level !== f.level) { this.removeFruit(view); this.fruits.delete(f.id); this.makeFruit(f, {pop: !initial}); }
        continue;
      }
      if (initial || this.quiet) { this.makeFruit(f); continue; }
      if (spawned.has(f.id)) {
        this.makeFruit(f, {from: this.basket.position.clone().add(new THREE.Vector3(0, 0.9, 0)), delay: 0.1 + stagger++ * 0.13, delivery: true});
      } else if (outputs.has(f.id)) {
        const at = this.world3(r.position, REST_Y);
        const main = r.outputs[0] && f.id === r.outputs[0].id;
        this.makeFruit(f, {from: main ? at : at.clone().lerp(this.world3(f), 0.3), delay: 0.18 + (main ? 0 : 0.08), pop: true});
      } else this.makeFruit(f, {pop: true});
    }
    this.syncServings();
    this.updateKeepsakes(initial);
  }

  skewerSlot(i) {
    const local = new THREE.Vector3(-0.7 + i * 0.7, SKEWER_STICK - 0.12, 0);
    return this.stick.localToWorld(local);
  }

  syncServings() {
    const c = chapter(this.state), j = this.state.journey;
    const key = `${j.chapter}:${j.skewer.join(',')}:${j.skewers}:${Object.values(j.served).join(',')}`;
    if (key === this.servingKey) return;
    this.servingKey = key;
    this.threaded.clear();
    (j.skewers ? [c.skewer, c.skewer, c.skewer] : j.skewer).forEach((level, i) => {
      const f = this.library.clone(`fruit_${level}`);
      f.scale.setScalar(0.5);
      // centre each fruit on the bamboo stick so it reads as pierced
      const box = new THREE.Box3().setFromObject(f), mid = (box.min.y + box.max.y) / 2;
      f.position.set(-0.7 + i * 0.7, SKEWER_STICK - mid, 0);
      this.threaded.add(f);
    });
    this.plateFood.clear();
    const servings = c.orders.flatMap(o => Array(j.served[o.level] || 0).fill(o.level));
    servings.forEach((level, i) => {
      const f = this.library.clone(`fruit_${level}`);
      f.position.set((i - (servings.length - 1) / 2) * 0.46, 0.12, i % 2 ? 0.15 : -0.1);
      f.scale.setScalar(servings.length === 1 ? 0.66 : 0.47);
      this.plateFood.add(f);
    });
  }

  // ------------------------------------------------------------------ feedback
  /** Visual + haptic-feeling response to a successful action. */
  feedback(result) {
    if (!result?.ok) return;
    const quiet = this.quiet;
    if (result.type === 'merge') {
      const at = this.world3(result.position, 0.35);
      const color = FRUITS[result.level].color;
      const big = (result.count - 1) + (result.chain - 1) * 1.5;
      if (!quiet) {
        setTimeout(() => {
          this.sparkles.burst(at, {color, count: 26 + big * 18, speed: 2.4 + big * 0.5, size: 0.26});
          this.sparkles.ring(this.world3(result.position, 0.12), {color: '#fff3c4', radius: 0.25, speed: 2.6 + big});
          if (result.chain > 1 || result.count > 2) this.sparkles.burst(at, {palette: ['#ffffff', '#ffe08a', color], count: 30, speed: 4, size: 0.2, up: 2});
        }, 180);
        // bloom combo: each bonus fruit blossoms out of a golden swirl
        if (result.bonus) result.outputs.slice(1).forEach((out, k) => setTimeout(() => {
          const p = this.world3(out, 0.3);
          this.sparkles.ring(this.world3(out, 0.12), {color: '#ffe08a', radius: 0.15, speed: 2.2, count: 24});
          this.sparkles.rise(p, {color: '#ffd35c', count: 14, spread: 0.5, speed: 1.4});
          this.flutter.confetti(p, {count: 18, spread: 0.3, speed: 3, palette: ['#ffd35c', '#fff3c4', '#ff9fb8']});
        }, 320 + k * 140));
        this.rig.shake(Math.min(0.55, 0.12 + big * 0.1));
        if (result.chain > 1) this.hitstop = 0.07;
      }
      if (result.chain > 1 || result.count > 3) this.cheerAll('hop');
    } else if (result.type === 'serve') {
      setTimeout(() => {
        this.guest?.react('eat');
        if (!quiet) this.sparkles.rise(this.plate.position.clone().add(new THREE.Vector3(0, 0.4, 0)), {color: '#ff9fb8', count: 14, spread: 0.6});
      }, 380);
    } else if (result.type === 'share') {
      setTimeout(() => { if (!quiet) this.sparkles.rise(this.plate.position.clone().add(new THREE.Vector3(0, 0.3, 0)), {color: '#ffffff', count: 6}); }, 380);
    } else if (result.type === 'skewer') {
      setTimeout(() => {
        const slot = this.skewerSlot(Math.max(0, this.state.journey.skewer.length - 1));
        if (!quiet) this.sparkles.burst(slot, {color: '#ffe3a0', count: 12, speed: 1.2, size: 0.18, up: 0.8});
        if (result.served) { this.guest?.react('hop'); if (!quiet) this.sparkles.burst(this.stick.position.clone().add(new THREE.Vector3(0, 0.4, 0)), {color: '#ffd166', count: 40, speed: 2.4}); }
      }, 380);
    } else if (result.type === 'basket') {
      this.basketBounce = this.time;
    } else if (result.type === 'move') {
      const view = this.fruits.get(result.fruit.id);
      if (view) view.squash.kick(-3);
    }
    if (result.spawned?.length) this.basketBounce = this.time;
  }

  cheerAll(kind) { for (const c of this.characters.values()) if (c.root.visible && !c.path) setTimeout(() => c.react(kind), Math.random() * 200); }

  /** The lantern-lighting sequence for a completed invitation. */
  celebrate(index, {finale = false} = {}) {
    const l = this.lanterns[index];
    this.updateKeepsakes();
    if (l) { l.lit = 0; l.target = 1; }
    this.cheerAll('cheer');
    if (this.quiet) { if (l) l.lit = 1; return; }
    const at = l ? l.lamp.position.clone().add(new THREE.Vector3(0, 0.4, 0)) : new THREE.Vector3();
    this.rig.pushTo(at.clone().add(new THREE.Vector3(0, -0.6, 1.2)), {distance: this.mobile ? 0.62 : 0.5, duration: 1.3, hold: 2.4});
    setTimeout(() => {
      this.sparkles.burst(at, {color: '#ffcf6b', count: 70, speed: 3, size: 0.32, up: 1});
      this.sparkles.rise(at, {color: '#ffe7a8', count: 24, spread: 0.6});
      this.flutter.confetti(at.clone().setY(at.y + 0.2), {count: 90, spread: 0.8, speed: 4});
    }, 900);
    if (finale) this.finale();
  }

  finale() {
    if (this.quiet) return;
    this.finaleTime = this.time;
    const W = this.frame.width, D = this.frame.depth;
    for (let i = 0; i < 18; i++) {
      const lantern = this.library.clone('sky_lantern');
      lantern.scale.setScalar(0.9 + Math.random() * 0.5);
      const start = new THREE.Vector3((Math.random() - 0.5) * W * 1.2, 0.3, (Math.random() - 0.5) * D * 0.9);
      lantern.position.copy(start);
      lantern.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.material = [o.material].flat().map(m => {
          if (!m.name?.startsWith('paper')) return m;
          const c = m.clone(); c.color.copy(this.lanternPaper); c.emissive = this.lanternGlow.clone(); c.emissiveIntensity = 1.4; c.userData.owned = true;
          return c;
        });
        if (o.material.length === 1) o.material = o.material[0];
      });
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: this.glowTex, color: '#ffc97a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
      glow.position.y = 0.35; glow.scale.setScalar(1.15); glow.material.opacity = 0.55; lantern.add(glow);
      this.scene.add(lantern);
      this.skyLanterns.push({obj: lantern, start, delay: 1.5 + i * 0.35, speed: 0.55 + Math.random() * 0.35, sway: Math.random() * TAU});
    }
    const j = this.state.journey;
    if (this.brambleLamp && j.chapter === 4 && !j.replay) {
      this.brambleLamp.visible = true;
      this.skyLanterns.push({obj: this.brambleLamp, start: this.brambleLamp.position.clone(), delay: 0.2, speed: 0.7, sway: 0, keep: true});
    }
    this.fireworks = {until: this.time + 14, next: this.time + 2.5};
  }

  /** Compile every material and render two frames before the loading card fades. */
  async warmUp() {
    try { await this.renderer.compileAsync?.(this.scene, this.camera); } catch {}
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  // ------------------------------------------------------------------ Hazel's Trunk
  /** Dress the picnic in the trunk's chosen blanket and lantern paper. Safe to call any time. */
  applyLooks() {
    const blanket = shopItem(equipped(this.state, 'blanket')), lantern = shopItem(equipped(this.state, 'lantern'));
    this.lanternPaper = new THREE.Color(lantern.look.paper);
    this.lanternGlow = new THREE.Color(lantern.look.glow);
    for (const l of this.lanterns) {
      l.light.color.copy(this.lanternGlow);
      l.glow.material.color.copy(this.lanternGlow).lerp(new THREE.Color('#ffffff'), 0.35);
      l.lamp.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) if (m.name?.startsWith('paper')) m.color.copy(this.lanternPaper); });
    }
    let fabric = null;
    this.cloth.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) if (m.name === 'gingham' && m.map) fabric = m; });
    if (!fabric) return;
    this.clothMap ??= fabric.map; // Hazel's own blanket, as exported from Blender
    this.blanketId = blanket.id;
    if (blanket.id === 'blanket-cornflower') { this.setClothMap(fabric, this.clothMap); return; }
    this.blanketTextures ??= new Map();
    const cached = this.blanketTextures.get(blanket.id);
    if (cached) { this.setClothMap(fabric, cached); return; }
    new THREE.TextureLoader().load(new URL(`./assets/lantern-picnic/${blanket.look.texture}`, document.baseURI).href, texture => {
      const base = this.clothMap;
      // match the glTF texture exactly: orientation, tiling transform, colour space, filtering
      Object.assign(texture, {flipY: base.flipY, wrapS: base.wrapS, wrapT: base.wrapT, colorSpace: base.colorSpace, anisotropy: base.anisotropy, channel: base.channel, rotation: base.rotation});
      texture.offset.copy(base.offset); texture.repeat.copy(base.repeat); texture.center.copy(base.center);
      texture.needsUpdate = true;
      this.blanketTextures.set(blanket.id, texture);
      if (this.blanketId === blanket.id) this.setClothMap(fabric, texture);
    });
  }

  setClothMap(material, texture) { if (material.map !== texture) { material.map = texture; material.needsUpdate = true; } }

  // ------------------------------------------------------------------ story staging
  /** Make `name` the speaker (talk loop, everyone else turns to listen). Returns a camera target
   *  at the speaker's face, or null when that friend is not on stage. */
  speak(name) {
    this.speaker = name && this.characters.get(name)?.root.visible ? name : null;
    for (const c of this.characters.values()) if (c.root.visible) c.setRest(c.name === this.speaker ? 'talk' : 'idle');
    const c = this.speaker && this.characters.get(this.speaker);
    return c ? c.root.position.clone().setY(c.root.position.y + 1.05 * c.root.scale.y) : null;
  }

  /** The far islands answer: lights wake one after another across the cloud sea, then rise. */
  answer() {
    this.clearAnswer();
    const group = this.answerLights = new THREE.Group(), rand = random(99);
    for (let i = 0; i < 16; i++) {
      // a fan of distant islands in front of the festival camera, out across the cloud sea
      const a = (rand() - 0.5) * 1.9, r = 40 + rand() * 50;
      const home = new THREE.Vector3(Math.sin(a) * r * 1.2, -10 + rand() * 11, -Math.cos(a) * r - 14);
      const n = 3 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({map: this.glowTex, color: k ? '#ffd9a0' : '#fff2cf', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false}));
        s.position.copy(home).add(new THREE.Vector3((rand() - 0.5) * 4, rand() * 1.5, (rand() - 0.5) * 3));
        s.scale.setScalar(k ? 1.6 + rand() : 3.2);
        s.userData = {delay: 0.3 + i * 0.35 + k * 0.12, rise: 0.25 + rand() * 0.35, base: s.position.y, phase: rand() * TAU};
        group.add(s);
      }
    }
    this.answerTime = this.time;
    this.scene.add(group);
  }

  /** Tidy the festival away (restart, revisits): sky lanterns, fireworks, answering lights. */
  resetFestival() {
    for (const l of this.skyLanterns) { this.scene.remove(l.obj); this.library.disposeClone(l.obj); }
    this.skyLanterns.length = 0; this.fireworks = null; this.finaleTime = 0;
    if (this.brambleLamp && !this.brambleLamp.parent) this.brambleLamp = null;
    this.clearAnswer();
    this.placeBrambleLantern();
  }

  clearAnswer() {
    if (this.answerLights) { this.scene.remove(this.answerLights); this.answerLights.traverse(o => o.material?.dispose?.()); this.answerLights = null; }
    if (this.reply) { this.scene.remove(this.reply.obj); this.library.disposeClone(this.reply.obj); this.reply = null; }
  }

  /** One sky lantern crosses the sky from the far islands and settles beside the plate. */
  sendReply(done) {
    const lantern = this.library.clone('sky_lantern');
    lantern.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.material = [o.material].flat().map(m => { if (!m.name?.startsWith('paper')) return m; const c = m.clone(); c.emissive = new THREE.Color('#ffc46e'); c.emissiveIntensity = 3; c.userData.owned = true; return c; });
      if (o.material.length === 1) o.material = o.material[0];
    });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: this.glowTex, color: '#ffd28a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
    glow.position.y = 0.35; glow.scale.setScalar(2.4); lantern.add(glow);
    const end = this.plate.position.clone().add(new THREE.Vector3(-0.2, 0.25, -0.9));
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-26, 16, -70), new THREE.Vector3(-12, 12, -34), new THREE.Vector3(-3, 7, -10), end.clone().add(new THREE.Vector3(0, 2.6, 0)), end]);
    lantern.scale.setScalar(1.3);
    this.scene.add(lantern);
    this.reply = {obj: lantern, curve, start: this.time, duration: this.quiet ? 0.01 : 7.5, done, landed: false};
  }

  /** Bramble's own lantern: carried in for the last invitation, first to rise at the festival. */
  placeBrambleLantern() {
    if (this.brambleLamp && this.skyLanterns.some(l => l.obj === this.brambleLamp)) return; // already rising
    const j = this.state.journey, show = j.chapter === 4 && j.status !== 'complete';
    if (!this.brambleLamp) {
      const lamp = this.library.clone('lantern');
      lamp.traverse(o => { if (o.isMesh) o.material = [o.material].flat().map(m => { if (!m.name?.startsWith('paper')) return m; const c = m.clone(); c.emissive = new THREE.Color('#ffb85c'); c.emissiveIntensity = 2.2; c.userData.owned = true; return c; }).at(0); });
      const light = new THREE.PointLight('#ffb35c', 3, 4, 1.6); light.position.y = 0.5; lamp.add(light);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: this.glowTex, color: '#ffe2a8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7}));
      glow.position.y = 0.46; glow.scale.setScalar(1.4); lamp.add(glow);
      lamp.scale.setScalar(0.5);
      this.brambleLamp = lamp; this.scene.add(lamp);
    }
    const seat = this.guestSeat;
    this.brambleLamp.position.set(seat.x - 0.75, this.groundAt(seat.x - 0.75, seat.z + 0.2), seat.z + 0.2);
    this.brambleLamp.visible = !!show;
  }

  // ------------------------------------------------------------------ hints
  showHint(ids) { this.hintIds = new Set(ids || []); }

  // ------------------------------------------------------------------ interaction
  pointerPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const v = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.plane, v);
    return this.normalized(v);
  }

  hit(e) {
    this.pointerPoint(e);
    const fruitRoots = [...this.fruits.values()].map(v => v.holder);
    const guest = this.guest?.root.visible ? [this.guest.root] : [];
    const friends = [...this.characters.values()].filter(c => c.root.visible && c !== this.guest).map(c => c.root);
    const objects = [...fruitRoots, this.basket, this.plate, ...guest, ...friends];
    const hits = this.raycaster.intersectObjects(objects, true);
    if (hits.length) {
      let obj = hits[0].object;
      while (obj.parent && !objects.includes(obj)) obj = obj.parent;
      if (obj === this.basket) return {type: 'basket'};
      if (obj === this.plate) return {type: 'plate'};
      for (const c of this.characters.values()) if (obj === c.root) return {type: 'friend', name: c.name};
      for (const view of this.fruits.values()) if (view.holder === obj) return {type: 'fruit', id: view.id};
    }
    // A forgiving touch target without changing the actual fruit shapes.
    const rect = this.canvas.getBoundingClientRect(), px = e.clientX - rect.x, py = e.clientY - rect.y;
    let nearest = null;
    for (const f of this.state.fruits) {
      const p = this.project(f, 0.6), dist = Math.hypot(px - p.x, py - p.y);
      if (dist < (e.pointerType === 'touch' ? 30 : 25) && (!nearest || dist < nearest.dist)) nearest = {type: 'fruit', id: f.id, dist};
    }
    return nearest ?? {type: 'floor'};
  }

  hover(e) {
    if (e.pointerType === 'touch') return;
    const r = this.canvas.getBoundingClientRect();
    this.rig.pointer((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1);
    if (this.drag || this.paused) return;
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
    this.selection = {type, id, point: {x: current.x, y: current.y}};
    this.drag = {pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, fromSelection,
      offset: fromSelection ? {x: 0, y: 0} : {x: current.x - hitPoint.x, y: current.y - hitPoint.y}};
    if (fromSelection) this.selection.point = point;
    this.canvas.setPointerCapture(e.pointerId);
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
    if (this.paused) return;
    e.preventDefault();
    const point = this.pointerPoint(e), hit = this.hit(e);
    if (this.selection) {
      if (hit.type === 'fruit' && hit.id === this.selection.id) { this.cancel(); return; }
      // tapping the basket or a friend while holding a fruit acts on them instead of moving the fruit there
      if (hit.type === 'basket') { this.cancel(); this.callbacks.onAdd?.(); return; }
      if (hit.type === 'friend') { this.characters.get(hit.name)?.react('wave'); this.callbacks.onFriend?.(hit.name); return; }
      const old = this.selection; this.start(old.type, old.id, e, point, true); return;
    }
    if (hit.type === 'fruit' || hit.type === 'basket') this.start(hit.type, hit.id, e, point);
    else if (hit.type === 'plate') this.callbacks.onHint?.('Drag the requested fruit to this plate. Other fruit can be shared to make room.');
    else if (hit.type === 'friend') { const c = this.characters.get(hit.name); c.react(Math.random() < 0.5 ? 'wave' : 'hop'); this.callbacks.onFriend?.(hit.name); }
    else if (hit.type === 'floor' && this.life?.tap(this.raycaster)) this.callbacks.onPond?.();
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
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (!moved && !fromSelection) {
      const f = this.state.fruits.find(f => f.id === selected.id);
      this.callbacks.onHint?.(t('{fruit} picked up. Tap a matching fruit, the plate, the skewer or a new spot.', {fruit: t(FRUITS[f.level].name)}));
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
    if (f && !target) {
      this.reachRing.visible = true;
      this.reachRing.position.copy(this.world3(s.point, 0.13));
      this.reachRing.scale.setScalar(FRUITS[f.level].radius * 2 + 0.16);
    }
    if (target?.type === 'merge') {
      this.targetIds = new Set(target.removed);
      target.members.forEach((member, i) => {
        if (!this.groupRings[i]) { const r = ringMesh('#ffd25c', {width: 0.2}); this.fx.add(r); this.groupRings.push(r); }
        const ring = this.groupRings[i];
        ring.visible = true;
        ring.position.copy(this.world3(member, 0.12));
        ring.scale.setScalar(FRUITS[member.level].radius + 0.2);
      });
    } else if (target) {
      const point = target.type === 'serve' || target.type === 'share' ? this.plate.position : target.type === 'skewer' || target.type === 'wrong-skewer' ? this.stick.position : this.world3(target.point);
      this.ring.visible = true;
      this.ring.position.copy(point).setY(0.16);
      this.ring.scale.setScalar(this.mobile ? 0.85 : 1.15);
      this.ring.material.uniforms.color.value.set(target.type === 'wrong-skewer' ? '#ff8f7a' : target.type === 'share' ? '#bfe3ff' : '#ffd66b');
    }
    this.callbacks.onPreview?.(target);
  }

  hideHighlights() {
    this.ring.visible = false; this.reachRing.visible = false; this.targetIds.clear();
    this.groupRings.forEach(r => { r.visible = false; });
  }

  cancel() {
    const pointerId = this.drag?.pointerId;
    this.drag = null; this.selection = null; this.hideHighlights();
    this.canvas.classList.remove('grabbing');
    if (pointerId !== undefined && this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
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
    if (this.selection?.type === 'fruit' && ['t', 'k'].includes(k)) {
      e.preventDefault(); const id = this.selection.id; this.cancel(); this.callbacks.onDrop?.(id, k === 't' ? PLATE : SKEWER); return;
    }
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

  // ------------------------------------------------------------------ frame loop
  get deliveries() { return [...this.fruits.values()].filter(v => v.delivery).length + this.ghosts.length; }

  animate(now) {
    this.raf = requestAnimationFrame(t => this.animate(t));
    // The first rAF timestamp can predate construction after a long loading frame.
    // Never rewind simulation time or hide newly created fruit until the clock catches up.
    let dt = Math.max(0, Math.min((now - this.last) / 1000, 0.05));
    this.last = now;
    if (document.hidden) return;
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.15; }
    this.time += dt;
    const t = this.time, quiet = this.quiet;
    wind.time.value = t;
    wind.strength.value = quiet ? 0.2 : 1;
    this.tod.update(dt, t);
    const p = this.tod.current;
    this.view.setGrade(p.grade, p.bloom);

    // fruit
    const held = this.selection?.type === 'fruit' ? this.selection.id : null;
    for (const f of this.state.fruits) {
      const v = this.fruits.get(f.id);
      if (!v) continue;
      const picked = held === f.id;
      const point = picked ? this.selection.point : f;
      const target = this.world3(point, picked ? HELD_Y : REST_Y);
      const scale = FRUITS[f.level].radius * 2;
      if (v.delivery && !quiet && !picked) {
        const k = clamp((t - v.delivery.start) / 0.7);
        if (k <= 0) { v.holder.visible = false; continue; }
        v.holder.visible = true;
        const from = v.delivery.from;
        v.pos.lerpVectors(from, target, ease.outCubic(k));
        v.pos.y += Math.sin(k * Math.PI) * 2.0;
        if (k >= 1) { v.delivery = null; v.squash.kick(-5); if (!quiet) this.sparkles.ring(target.clone().setY(0.12), {count: 14, radius: 0.15, speed: 1.6, size: 0.14, color: '#ffffff'}); this.callbacks.onLand?.(f); }
      } else {
        if (t < v.born) { v.holder.visible = false; continue; }
        v.holder.visible = true;
        const before = v.pos.clone();
        v.pos.x = approach(v.pos.x, target.x, dt, picked ? 0.025 : 0.06);
        v.pos.z = approach(v.pos.z, target.z, dt, picked ? 0.025 : 0.06);
        const wasHigh = v.pos.y > REST_Y + 0.3;
        v.pos.y = approach(v.pos.y, target.y, dt, picked ? 0.05 : 0.045);
        if (!picked && wasHigh && v.pos.y < REST_Y + 0.08) { v.squash.kick(-6); this.callbacks.onSettle?.(f); }
        v.vel.subVectors(v.pos, before).divideScalar(Math.max(dt, 1e-4));
      }
      v.holder.position.copy(v.pos);
      // squash & stretch, breathing, excitement
      v.squash.target = 1; v.grow.target = 1;
      const sq = v.squash.update(dt), grow = Math.max(0, v.grow.update(dt));
      const breathe = quiet ? 0 : Math.sin(t * 2.2 + v.phase) * 0.018;
      const excited = this.targetIds.has(f.id) && !quiet ? Math.abs(Math.sin(t * 9 + v.phase)) * 0.08 : 0;
      const hint = this.hintIds.has(f.id) && !quiet ? Math.max(0, Math.sin(t * 5)) * 0.06 : 0;
      const hovered = this.hovered === f.id && !held ? 0.06 : 0;
      const y = sq + breathe + excited + hint;
      const xz = 1 / Math.sqrt(Math.max(0.3, y));
      const s = scale * grow * (picked ? 1.1 : 1 + hovered);
      v.mesh.scale.set(s * xz, s * y, s * xz);
      v.mesh.position.y = excited * 1.5 + hint * 2;
      // held fruit leans into its motion like a pendulum
      const lean = picked && !quiet ? 0.035 : 0;
      v.tilt.x = approach(v.tilt.x, clamp(v.vel.z * lean, -0.5, 0.5), dt, 0.08);
      v.tilt.y = approach(v.tilt.y, clamp(-v.vel.x * lean, -0.5, 0.5), dt, 0.08);
      v.mesh.rotation.x = v.tilt.x; v.mesh.rotation.z = v.tilt.y + (picked && !quiet ? Math.sin(t * 6) * 0.04 : 0);
    }
    // ghosts: merged, served and threaded fruit on their way out
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t = Math.min(1, g.t + dt / g.duration);
      const k = ease.inOutCubic(g.t);
      g.view.holder.position.lerpVectors(g.from, g.to, k);
      if (g.arc) g.view.holder.position.y += Math.sin(g.t * Math.PI) * g.arc;
      if (g.shrink) g.view.mesh.scale.multiplyScalar(1 - 0.12 * k);
      if (g.t >= 1) { this.removeFruit(g.view); this.ghosts.splice(i, 1); }
    }
    // held fruit shadow on the cloth
    if (held !== null) {
      const v = this.fruits.get(held);
      this.heldShadow.visible = !!v;
      if (v) { this.heldShadow.position.set(v.pos.x, 0.11, v.pos.z); this.heldShadow.scale.setScalar(FRUITS[v.level].radius * 2.2); this.heldShadow.material.opacity = 0.6; }
    } else this.heldShadow.visible = false;

    // rings
    for (const r of [this.ring, this.reachRing, ...this.groupRings]) r.material.uniforms.time.value = t;

    // basket
    const bounce = this.basketBounce !== undefined ? t - this.basketBounce : 9;
    this.basket.rotation.z = !quiet && bounce < 0.8 ? Math.sin(bounce * 22) * 0.06 * (1 - bounce / 0.8) : 0;
    this.basket.scale.y = (this.mobile ? 0.8 : 1.05) * (1 + (!quiet && bounce < 0.5 ? Math.sin(bounce * 18) * 0.05 * (1 - bounce / 0.5) : 0));

    // characters look at what you hold
    const look = held !== null ? this.fruits.get(held)?.pos : null;
    for (const c of this.characters.values()) {
      if (!c.root.visible) continue;
      const speaker = this.speaker && this.speaker !== c.name ? this.characters.get(this.speaker) : null;
      c.lookAt(look ? look.clone().setY(look.y + 0.3) : speaker ? speaker.root.position.clone().setY(1.1) : c === this.guest || c.name === this.speaker ? null : this.guest?.root.position.clone().setY(1.2) ?? null);
      c.update(dt, quiet);
    }

    // lanterns, fire and the star jar
    const night = p.lights, lanternBase = p.lanterns;
    for (const l of this.lanterns) {
      l.lit = approach(l.lit, l.target, dt, 0.35);
      const flicker = 1 + (quiet ? 0 : Math.sin(t * 13 + l.flicker) * 0.04 + Math.sin(t * 7.3 + l.flicker * 2) * 0.05);
      const glow = l.lit * flicker;
      l.lamp.traverse(o => {
        if (!o.isMesh) return;
        for (const m of [o.material].flat()) if (m.name?.startsWith('paper')) { m.emissive.copy(this.lanternGlow); m.emissiveIntensity = 0.05 + glow * (1.2 + lanternBase * 2.4); }
      });
      l.light.intensity = glow * (0.8 + night * 7);
      l.glow.material.opacity = glow * (0.25 + lanternBase * 0.55);
      if (!quiet) l.lamp.rotation.z = Math.sin(t * 0.9 + l.flicker) * 0.03;
    }
    this.fire.on = approach(this.fire.on, this.fireTarget * Math.max(0.35, night), dt, 0.8);
    this.fire.light.intensity = this.fire.on * (9 + (quiet ? 0 : Math.sin(t * 17) * 1.5 + Math.sin(t * 9.3) * 1.8));
    for (const f of this.fire.flames) {
      const ph = f.userData.phase, lick = quiet ? 1 : 0.8 + Math.sin(t * 11 + ph) * 0.15 + Math.sin(t * 23 + ph * 2) * 0.1;
      f.material.opacity = this.fire.on * 0.95;
      f.scale.set(0.34 * (1.1 - lick * 0.2), 0.62 * lick, 1);
      f.material.rotation = quiet ? 0 : Math.sin(t * 5 + ph) * 0.12;
    }
    this.picnicLight.intensity = approach(this.picnicLight.intensity, p.lights * 19 * (0.45 + 0.55 * this.lanterns.reduce((n, l) => n + l.lit, 0) / this.lanterns.length), dt, 0.6);
    if (this.fire.on > 0.2 && !quiet && Math.random() < dt * 14) this.sparkles.rise(this.spots.campfire.clone().setY(0.4), {color: '#ff9a4a', count: 1, spread: 0.25, speed: 1.2, size: 0.12, life: 1.3});
    this.jarLight.intensity = approach(this.jarLight.intensity, (this.jarTarget || 0) * (0.5 + night * 2.5), dt, 0.4);
    if (this.bunting.visible && !quiet) this.bunting.children.forEach((f, i) => { if (f.userData.sway !== undefined) f.rotation.x = Math.sin(t * 2 + f.userData.sway * 0.7) * 0.18; });

    // ambient life
    this.fireflies.update(t, p.fireflies * (quiet ? 0.5 : 1));
    this.motes.update(t, p.dust * 0.5);
    if (!quiet && this.mode !== 'title' && p.dust > 0.5 && Math.random() < dt * 0.35 * this.flutter.budget) {
      this.flutter.drift({x: -this.frame.width * 0.3, y: 5, z: -1, w: this.frame.width, d: this.frame.depth}, this.tod.key === 'golden' ? ['#e9a23b', '#d9772b', '#f2c14e'] : ['#ffc7d9', '#ffe1ea', '#9fd36a'], {size: 1.1});
    }
    this.sparkles.update(dt);
    this.flutter.update(dt, t);
    this.life?.update(dt, quiet);
    if (this.rippleMap && !quiet) this.rippleMap.offset.set(t * 0.012, t * 0.007);

    // finale: sky lanterns and fireworks
    for (const s of this.skyLanterns) {
      const k = t - this.finaleTime - s.delay;
      if (k < 0) continue;
      s.obj.position.set(s.start.x * (1 + k * 0.04) + Math.sin(k * 0.6 + s.sway) * 0.6, s.start.y + k * s.speed, s.start.z + Math.cos(k * 0.5 + s.sway) * 0.4 - k * 0.55);
      s.obj.rotation.y = k * 0.3;
    }
    if (this.answerLights) for (const s of this.answerLights.children) {
      const k = t - this.answerTime - s.userData.delay;
      s.material.opacity = clamp(k / 1.2) * (0.75 + (quiet ? 0 : Math.sin(t * 3 + s.userData.phase) * 0.2));
      s.position.y = s.userData.base + Math.max(0, k) * s.userData.rise;
    }
    if (this.reply && !this.reply.landed) {
      const r = this.reply, k = clamp((t - r.start) / r.duration);
      r.obj.position.copy(r.curve.getPoint(ease.inOutCubic(k)));
      r.obj.rotation.y = k * 3;
      if (!quiet) r.obj.position.y += Math.sin(t * 1.7) * 0.08 * (1 - k);
      if (k >= 1) { r.landed = true; if (!quiet) this.sparkles.burst(r.obj.position.clone().add(new THREE.Vector3(0, 0.4, 0)), {color: '#ffd28a', count: 40, speed: 1.8}); r.done?.(); }
    }
    if (this.fireworks && t < this.fireworks.until && t > this.fireworks.next) {
      this.fireworks.next = t + 0.6 + Math.random() * 0.9;
      const at = new THREE.Vector3((Math.random() - 0.5) * 24, 9 + Math.random() * 6, -10 - Math.random() * 8);
      this.sparkles.firework(at, ['#ff7aa2', '#ffd166', '#7fe0c8', '#a18bff', '#ffffff']);
      this.callbacks.onFirework?.();
    }

    this.rig.update(dt, {quiet, dragging: !!this.drag});
    this.view.render(dt, t);
    this.view.adapt(dt);
    this.callbacks.onFrame?.();
  }

  info() { return this.view.info(); }
}
