// The Lantern Trail: the map of Fernhollow, five floating islets joined by rope bridges.
// Pure data and maths (no three.js, no DOM). The bake (tools/bake-trail) builds the 3D islets from
// it, and the runtime walks, collides and places everything with it, so art and play never drift.

export const PITCH = 48; // degrees the orthographic camera looks down
export const PPU = 64; // plate pixels per world unit
export const SPRITE_PPU = 96; // sprite atlases are baked sharper than the ground plate
export const CELL = 0.25; // walk grid cell, world units
const RAD = Math.PI / 180;
export const SIN = Math.sin(PITCH * RAD), COS = Math.cos(PITCH * RAD);

/** Islets: centre (x, z), lawn radii (rx, rz), lawn height y. `flip` mirrors the island mesh for variety. */
export const ISLETS = [
  {id: 'meadow', x: -7, z: 11, rx: 7.0, rz: 5.4, y: 0, flip: 1, turn: 0, seed: 11},
  {id: 'pond', x: 8, z: 8, rx: 6.4, rz: 5.0, y: 0.5, flip: -1, turn: 0, seed: 12},
  {id: 'wood', x: -6, z: -2.5, rx: 7.6, rz: 5.8, y: 1.0, flip: 1, turn: Math.PI, seed: 13},
  {id: 'oak', x: 8, z: -8, rx: 6.2, rz: 4.8, y: 1.8, flip: -1, turn: Math.PI, seed: 14},
  {id: 'summit', x: -1, z: -17.5, rx: 5.8, rz: 4.6, y: 2.8, flip: 1, turn: 0, seed: 15},
];
export const isletById = Object.fromEntries(ISLETS.map(i => [i.id, i]));

/** Radius of an islet's lawn ellipse in direction (dx, dz) (unit vector). */
export function rimRadius(islet, dx, dz) { return 1 / Math.hypot(dx / islet.rx, dz / islet.rz); }

/** Rope bridges between islets. `gate` names the flag that clears the mist wall at its far end. */
export const BRIDGES = [
  {id: 'b1', from: 'meadow', to: 'pond', gate: 'way1'},
  {id: 'b2', from: 'pond', to: 'wood', gate: 'momo'},
  {id: 'b3', from: 'wood', to: 'oak', gate: 'way2'},
  {id: 'b4', from: 'oak', to: 'summit', gate: 'way3'},
];
const INSET = 0.8; // bridges reach this far (fraction of the rim radius) into each lawn

/** World endpoints of a bridge deck: a on the `from` lawn, b on the `to` lawn, with heights. */
export function bridgeEnds(bridge) {
  const A = isletById[bridge.from], B = isletById[bridge.to];
  const len = Math.hypot(B.x - A.x, B.z - A.z), dx = (B.x - A.x) / len, dz = (B.z - A.z) / len;
  const ra = rimRadius(A, dx, dz) * INSET, rb = rimRadius(B, -dx, -dz) * INSET;
  return {a: {x: A.x + dx * ra, y: A.y, z: A.z + dz * ra}, b: {x: B.x - dx * rb, y: B.y, z: B.z - dz * rb}, dx, dz};
}

/** The bridge the friends arrive by: from the picnic clearing, off the south-west edge of the map. */
export const ARRIVAL = (() => {
  const M = isletById.meadow, dx = -0.72, dz = 0.69, n = Math.hypot(dx, dz);
  const r = rimRadius(M, dx / n, dz / n);
  return {a: {x: M.x + dx / n * r * INSET, y: 0, z: M.z + dz / n * r * INSET}, b: {x: M.x + dx / n * (r + 10), y: -0.5, z: M.z + dz / n * (r + 10)}, dx: dx / n, dz: dz / n};
})();

/** Places on each islet, as offsets from its centre. Every story beat, chest and note lives here. */
export const SPOTS = {
  meadow: {start: [-3.9, 3.3], sign: [-2.3, 2.6], note: [-0.4, 3.3], way: [4.5, -1.2], chest: [-4.6, -1.6], fight: [1.2, 0.8], extra: [-1.4, -2.4]},
  pond: {water: [1.2, 0.2], momo: [-3.0, 1.7], fight: [-2.5, -0.6], chest: [4.3, 1.4], note: [2.6, -2.9], extra: [2.4, 3.0]},
  wood: {ring: [-1.4, 0.2], nori: [-1.4, 0.2], way: [3.8, -2.2], chest: [-5.4, -0.9], note: [-4.2, 2.6], extra: [1.8, 2.8], extra2: [-3.6, -2.6]},
  oak: {oak: [1.2, -1.8], juniper: [2.6, -0.2], fight: [-0.8, 2.0], way: [-3.4, -2.2], chest: [4.2, 1.4], note: [3.6, -2.6]},
  summit: {beacon: [-0.4, -2.0], bramble: [-3.6, 0.4], fight: [0.4, 0.9], note: [3.0, -0.6], rock: [-3.9, -0.3]},
};

/** World position of an islet spot (y is the islet's lawn height; the runtime refines it). */
export function spot(isletId, key) {
  const I = isletById[isletId], s = SPOTS[isletId][key];
  if (!s) throw new Error(`Unknown spot ${isletId}.${key}`);
  return {x: I.x + s[0], y: I.y, z: I.z + s[1]};
}

/** Walking routes across each islet (arrival -> beats -> exit); scenery keeps clear of them. */
export function routes() {
  const out = [];
  const end = (b, side) => side === 'from' ? bridgeEnds(b).a : bridgeEnds(b).b;
  const into = id => BRIDGES.filter(b => b.to === id).map(b => end(b, 'to'));
  const outOf = id => BRIDGES.filter(b => b.from === id).map(b => end(b, 'from'));
  for (const I of ISLETS) {
    const keys = Object.keys(SPOTS[I.id]).filter(k => !['water', 'rock'].includes(k));
    const pts = [...(I.id === 'meadow' ? [ARRIVAL.a] : into(I.id)), ...keys.map(k => spot(I.id, k)), ...outOf(I.id)];
    // a star from the islet centre to every point keeps one clear lawn joining everything
    for (const p of pts) out.push([{x: I.x, z: I.z}, p]);
    for (let i = 0; i < pts.length - 1; i++) out.push([pts[i], pts[i + 1]]);
  }
  return out;
}

function segDist(p, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z, l = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l));
  return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t);
}

/** Deterministic PRNG (xorshift), the same as the 3D game's dressing. */
export function random(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}

// Scenery kinds. `sprite` kinds are drawn as depth-sorted sprites (so friends walk behind them);
// the rest are baked flat into the ground plate. `foot` is the collision radius per unit scale.
export const KINDS = {
  tree_oak: {sprite: true, foot: 0.42}, tree_pine: {sprite: true, foot: 0.36}, tree_birch: {sprite: true, foot: 0.3}, tree_blossom: {sprite: true, foot: 0.4},
  bush: {sprite: true, foot: 0.5}, bush_berry: {sprite: true, foot: 0.5}, bush_flower: {sprite: true, foot: 0.5},
  rock_0: {sprite: true, foot: 0.45}, rock_1: {sprite: true, foot: 0.36}, rock_2: {sprite: true, foot: 0.62},
  fern: {sprite: true, foot: 0}, toadstool: {sprite: true, foot: 0.42}, stump: {sprite: true, foot: 0.36},
  mushrooms: {sprite: false}, flower_daisy: {sprite: false}, flower_bell: {sprite: false}, flower_tulip: {sprite: false}, flower_sun: {sprite: false},
  tuft: {sprite: false}, log: {sprite: false}, stone_step: {sprite: false},
};
const TREES = ['tree_oak', 'tree_pine', 'tree_birch', 'tree_blossom'];

/** Per-islet dressing recipes: counts of each kind. The wood is thick with toadstools. */
const RECIPES = {
  meadow: {trees: 7, bush: 2, bush_flower: 4, bush_berry: 1, rock_0: 2, rock_1: 2, fern: 4, flowers: 70, tuft: 40, mushrooms: 3, toadstool: 0},
  pond: {trees: 6, bush: 3, bush_flower: 2, bush_berry: 2, rock_0: 3, rock_1: 2, fern: 6, flowers: 40, tuft: 36, mushrooms: 3, toadstool: 0},
  wood: {trees: 12, bush: 3, bush_flower: 1, bush_berry: 2, rock_0: 2, rock_1: 1, fern: 9, flowers: 20, tuft: 30, mushrooms: 14, toadstool: 7},
  oak: {trees: 5, bush: 2, bush_flower: 3, bush_berry: 1, rock_0: 2, rock_1: 2, rock_2: 1, fern: 5, flowers: 45, tuft: 34, mushrooms: 4, toadstool: 1},
  summit: {trees: 4, bush: 2, bush_flower: 1, bush_berry: 0, rock_0: 3, rock_1: 2, rock_2: 2, fern: 3, flowers: 30, tuft: 26, mushrooms: 2, toadstool: 0},
};

/** Areas scenery keeps out of: the pond, Nori's fairy ring, the great oak's roots, the beacon's terrace. */
// Landmarks and friends also keep the lawn in front of them (toward the camera, +z) clear, so no
// canopy ever stands between the player and something they need to find.
export const CLEAR = [
  {islet: 'pond', key: 'water', rx: 3.1, rz: 2.2},
  {islet: 'wood', key: 'ring', rx: 2.3, rz: 1.9},
  {islet: 'oak', key: 'oak', rx: 1.9, rz: 1.5},
  {islet: 'summit', key: 'beacon', rx: 2.0, rz: 1.6},
  ...['meadow', 'wood', 'oak'].map(islet => ({islet, key: 'way', rx: 1.7, rz: 2.2, dz: 1.3})),
  {islet: 'meadow', key: 'sign', rx: 1.3, rz: 1.8, dz: 1.0},
  {islet: 'pond', key: 'momo', rx: 1.8, rz: 2.0, dz: 0.9},
  {islet: 'oak', key: 'juniper', rx: 1.6, rz: 2.0, dz: 1.0},
  {islet: 'summit', key: 'bramble', rx: 1.4, rz: 1.8, dz: 1.0},
  ...Object.keys(SPOTS).filter(id => SPOTS[id].chest).map(islet => ({islet, key: 'chest', rx: 1.2, rz: 1.6, dz: 0.9})),
];
const inClear = (x, z, pad = 0) => CLEAR.some(c => { const p = spot(c.islet, c.key); return ((x - p.x) / (c.rx + pad)) ** 2 + ((z - p.z - (c.dz || 0)) / (c.rz + pad)) ** 2 < 1; });

/** Landmarks placed by hand: the waystones, the great oak, the beacon, signposts and baskets. */
export function landmarks() {
  const out = [];
  const add = (kind, isletId, key, extra = {}) => { const p = spot(isletId, key); out.push({kind, x: p.x, z: p.z, s: 1, rot: 0, islet: isletId, key, ...extra}); };
  add('waystone', 'meadow', 'way', {id: 'way1'});
  add('waystone', 'wood', 'way', {id: 'way2'});
  add('waystone', 'oak', 'way', {id: 'way3'});
  add('signpost', 'meadow', 'sign', {id: 'sign'});
  add('great_oak', 'oak', 'oak', {id: 'oak'});
  add('beacon', 'summit', 'beacon', {id: 'beacon'});
  add('rock_2', 'summit', 'rock', {s: 1.25, rot: 0.6, id: 'hide'});
  add('stump', 'meadow', 'note', {s: 1.1, rot: 0.4, id: 'note-stump'});
  for (const id of ISLETS.map(i => i.id)) if (SPOTS[id].chest) add('basket', id, 'chest', {id: `chest-${id}`, rot: 0.5});
  return out;
}
export const LANDMARK_FOOT = {waystone: 0.38, signpost: 0.22, great_oak: 1.25, beacon: 1.3, basket: 0.42};

/** Seeded scenery for every islet: back-rim trees, side bushes, rocks, ferns, toadstools, flowers. */
export function planScenery() {
  const out = [], lines = routes(), marks = landmarks();
  for (const I of ISLETS) {
    const rand = random(I.seed * 7919), R = RECIPES[I.id], taken = [];
    const inLawn = (x, z, m) => ((x - I.x) / I.rx) ** 2 + ((z - I.z) / I.rz) ** 2 < m * m;
    const nearRoute = (x, z, pad) => lines.some(([a, b]) => segDist({x, z}, a, b) < pad);
    const nearBridge = (x, z, pad) => [...BRIDGES.map(bridgeEnds), ARRIVAL].some(({a, b}) => segDist({x, z}, a, b) < pad);
    const free = (x, z, r) => taken.every(t => Math.hypot(t.x - x, t.z - z) > t.r + r) && marks.every(m => Math.hypot(m.x - x, m.z - z) > (LANDMARK_FOOT[m.kind] ?? 0.6) + r + 0.5);
    const place = (kind, count, {band = [0.3, 0.9], back = null, radius = 0.6, route = 1.1, s = [0.85, 1.2], cluster = null} = {}) => {
      let n = 0;
      for (let tries = 0; tries < count * 60 && n < count; tries++) {
        let x, z;
        if (cluster) { const a = rand() * Math.PI * 2, r = rand() * cluster.r; x = cluster.x + Math.cos(a) * r; z = cluster.z + Math.sin(a) * r; }
        else {
          const a = rand() * Math.PI * 2, r = band[0] + rand() * (band[1] - band[0]);
          x = I.x + Math.cos(a) * I.rx * r; z = I.z + Math.sin(a) * I.rz * r;
        }
        // trees keep to the back half and the flanks so they never hide the lawn in front of them
        if (back !== null && (z - I.z) / I.rz > back) continue;
        if (!inLawn(x, z, band[1] + 0.02) || inClear(x, z, radius * 0.5) || nearRoute(x, z, route) || nearBridge(x, z, route + 0.4) || !free(x, z, radius)) continue;
        const scale = s[0] + rand() * (s[1] - s[0]);
        out.push({kind, x: +x.toFixed(3), z: +z.toFixed(3), s: +scale.toFixed(3), rot: +(rand() * Math.PI * 2).toFixed(3), islet: I.id, variant: Math.floor(rand() * 2)});
        taken.push({x, z, r: radius * scale});
        n++;
      }
    };
    for (let i = 0; i < R.trees; i++) place(TREES[Math.floor(rand() * TREES.length)], 1, {band: [0.62, 0.9], back: 0.15, radius: 1.0, s: [0.8, 1.1]});
    if (R.toadstool) place('toadstool', R.toadstool, {band: [0.25, 0.86], radius: 0.8, s: [0.8, 1.25], route: 1.2});
    for (const k of ['bush', 'bush_flower', 'bush_berry']) place(k, R[k], {band: [0.45, 0.9], back: 0.55, radius: 0.75, s: [0.8, 1.15]});
    for (const k of ['rock_0', 'rock_1', 'rock_2']) if (R[k]) place(k, R[k], {band: [0.4, 0.92], radius: 0.6, s: [0.6, 1.0]});
    place('fern', R.fern, {band: [0.35, 0.92], radius: 0.4, s: [0.8, 1.2], route: 0.9});
    place('mushrooms', R.mushrooms, {band: [0.2, 0.9], radius: 0.3, s: [0.5, 0.8], route: 0.7});
    const flowers = ['flower_daisy', 'flower_bell', 'flower_tulip', 'flower_sun'];
    for (let i = 0; i < R.flowers; i++) place(flowers[i % 4], 1, {band: [0.1, 0.93], radius: 0.12, s: [0.8, 1.3], route: 0.45});
    place('tuft', R.tuft, {band: [0.1, 0.95], radius: 0.1, s: [0.8, 1.5], route: 0.3});
  }
  return out;
}

/** Stepping stones: one trail across each islet, from where the friends arrive to the bridge onward. */
export function planSteps() {
  const out = [], rand = random(4242);
  for (const I of ISLETS) {
    const from = I.id === 'meadow' ? ARRIVAL.a : bridgeEnds(BRIDGES.find(b => b.to === I.id)).b;
    const onward = BRIDGES.find(b => b.from === I.id);
    const to = onward ? bridgeEnds(onward).a : spot(I.id, 'beacon');
    // a quadratic bend through a point pulled toward the islet centre
    const mid = {x: (from.x + to.x) / 2 * 0.45 + I.x * 0.55, z: (from.z + to.z) / 2 * 0.45 + I.z * 0.55};
    const len = Math.hypot(mid.x - from.x, mid.z - from.z) + Math.hypot(to.x - mid.x, to.z - mid.z);
    const n = Math.floor(len / 0.72);
    for (let k = 1; k < n; k++) {
      const t = k / n, u = 1 - t;
      const x = u * u * from.x + 2 * u * t * mid.x + t * t * to.x + (rand() - 0.5) * 0.22;
      const z = u * u * from.z + 2 * u * t * mid.z + t * t * to.z + (rand() - 0.5) * 0.18;
      if (((x - I.x) / I.rx) ** 2 + ((z - I.z) / I.rz) ** 2 > 0.86 || inClear(x, z, 0.2)) continue;
      out.push({kind: 'stone_step', x: +x.toFixed(3), z: +z.toFixed(3), s: +(0.6 + rand() * 0.22).toFixed(3), rot: +(rand() * 6.28).toFixed(3), islet: I.id});
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------ the plate
/** Screen-space "v" of a world point: how far down the plate it lands, in world units. */
export const vOf = (y, z) => z * SIN - y * COS;

/** The plate's extent in world units (x) and screen units (v), with room for cliffs, roots and canopies. */
export const PLATE = (() => {
  const x0 = Math.min(...ISLETS.map(i => i.x - i.rx)) - 3.2, x1 = Math.max(...ISLETS.map(i => i.x + i.rx)) + 3.2;
  const v0 = Math.min(...ISLETS.map(i => vOf(i.y + 6.5, i.z - i.rz))) - 0.6;
  const v1 = Math.max(...ISLETS.map(i => vOf(i.y - 5.5, i.z + i.rz))) + 0.6;
  const w = Math.ceil((x1 - x0) * PPU / 8) * 8, h = Math.ceil((v1 - v0) * PPU / 8) * 8;
  return {x0, x1: x0 + w / PPU, v0, v1: v0 + h / PPU, w, h, tile: 1024};
})();

/** Plate pixel of a world point. */
export function toPlate(x, y, z) { return {px: (x - PLATE.x0) * PPU, py: (vOf(y, z) - PLATE.v0) * PPU}; }

/** Walk grid extent: the lawns plus a margin, in CELL steps. */
export const GRID = (() => {
  const x0 = Math.floor((Math.min(...ISLETS.map(i => i.x - i.rx)) - 1) / CELL) * CELL;
  const z0 = Math.floor((Math.min(...ISLETS.map(i => i.z - i.rz)) - 1) / CELL) * CELL;
  const x1 = Math.max(...ISLETS.map(i => i.x + i.rx)) + 1, z1 = Math.max(...ISLETS.map(i => i.z + i.rz)) + 1;
  return {x0, z0, nx: Math.ceil((x1 - x0) / CELL), nz: Math.ceil((z1 - z0) / CELL), cell: CELL};
})();
