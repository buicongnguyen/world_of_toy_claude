// The living details: koi and butterflies (src/lantern-life.js), the bake's pond and meadow data, and
// the Blender critters' contract with the runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {PondLife, Meadow, FISH, WINGS} from '../src/lantern-life.js';

const POND = {x: -3.1, y: 0.11, z: 7, rx: 1.02, rz: 0.69};
const asset = p => new URL(`../assets/lantern-picnic/${p}`, import.meta.url);
const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function run(life, seconds, each = () => {}, dt = 1 / 60, quiet = false) { for (let t = 0; t < seconds; t += dt) { life.update(dt, quiet); each(dt); } }
function flowers(n = 20) { return Array.from({length: n}, (_, i) => ({x: -6 + (i % 5) * 3, y: 0.05, z: -4 + Math.floor(i / 5) * 2.5})); }

test('koi stay in the water, turn within their limit and never jump their tails', () => {
  const p = new PondLife({budget: 1}); p.setPond(POND);
  assert.equal(p.fish.length, 5);
  assert.deepEqual([...new Set(p.fish.map(f => f.kind))].sort(), [0, 1, 2], 'every species swims');
  const before = p.fish.map(f => ({heading: f.heading, wag: f.wag}));
  let reach = 0, turnRate = 0, wagStep = 0;
  run(p, 90, dt => {
    p.fish.forEach((f, i) => {
      reach = Math.max(reach, p.reach(f.x, f.z));
      turnRate = Math.max(turnRate, Math.abs(turn(before[i].heading, f.heading)) / dt);
      wagStep = Math.max(wagStep, Math.abs(f.wag - before[i].wag) / dt);
      before[i] = {heading: f.heading, wag: f.wag};
      assert.ok(Number.isFinite(f.x) && Number.isFinite(f.z) && Number.isFinite(f.heading));
    });
    if (Math.floor(p.time * 240) % 2400 === 0) p.tap(POND.x, POND.z); // a few scares along the way
  }, 1 / 240); // fine steps: a jump shows up as a rate far above any smooth swing
  assert.ok(reach <= 0.861, `a fish left the water (reach ${reach})`);
  assert.ok(turnRate <= 12 + 1e-6, `turned at ${turnRate} rad/s`); // a startle is quick, but never a snap
  // the tail's phase accumulates and its amplitude eases, so calm -> flee speeds the beat without a jump
  assert.ok(wagStep < 30, `tail jumped ${wagStep} rad/s`); // smooth: at most 0.7 rad x ~27 rad/s beat
});

test('koi keep room: they never stack, scares included, and they still swim about the pond', () => {
  // the desktop pond and the phone pond, two seeds each: five koi in 2.8 x 1.9 units, three in 2.0 x 1.4
  for (const [name, pond, budget] of [['desktop', {x: -8.75, y: 0.1, z: 2.6, rx: 1.4025, rz: 0.9537}, 1], ['phone', POND, 0.6]]) for (const seed of [11, 3]) {
    const p = new PondLife({budget, seed}); p.setPond(pond);
    let closest = Infinity, travelled = 0;
    const last = p.fish.map(f => [f.x, f.z]);
    run(p, 240, () => {
      if (Math.floor(p.time * 60) % 1200 === 0) p.tap(pond.x + Math.sin(p.time) * pond.rx * 0.4, pond.z + Math.cos(p.time * 1.3) * pond.rz * 0.4);
      p.fish.forEach((f, i) => {
        travelled += Math.hypot(f.x - last[i][0], f.z - last[i][1]); last[i] = [f.x, f.z];
        for (let j = i + 1; j < p.fish.length; j++) {
          const o = p.fish[j];
          closest = Math.min(closest, Math.hypot(f.x - o.x, f.z - o.z) / (0.5 * (f.len + o.len)));
        }
      });
    });
    assert.ok(closest >= 0.58, `${name}, seed ${seed}: two koi came within ${closest.toFixed(2)} body lengths of each other`);
    assert.ok(travelled / 240 / p.fish.length > 0.15, `${name}, seed ${seed}: the koi stopped swimming (${(travelled / 240 / p.fish.length).toFixed(2)} units/s)`);
  }
});

test('a tap on the water scatters the nearby fish and spreads a ring; a tap on the grass does nothing', () => {
  const p = new PondLife({budget: 1}); p.setPond(POND);
  run(p, 2);
  const events = p.events;
  assert.equal(p.tap(POND.x + POND.rx * 1.3, POND.z), false);
  assert.equal(p.events, events);
  assert.equal(p.tap(POND.x, POND.z), true);
  assert.equal(p.events, events + 1);
  assert.ok(p.ripples.some(r => r.age < r.life), 'a ring spreads');
  assert.ok(p.fish.every(f => f.state === 'flee'), 'every fish in reach darts away');
  const speed = Math.max(...p.fish.map(f => f.speed));
  run(p, 0.2);
  assert.ok(p.fish.every(f => Math.hypot(f.x - POND.x, f.z - POND.z) > 0.05));
  run(p, 3);
  assert.ok(p.fish.every(f => f.state === 'swim'), 'calm again after the scare');
  assert.ok(Math.max(...p.fish.map(f => f.speed)) < speed);
});

test('the creatures are seeded: they never touch Math.random, so gameplay seeds and tests stay put', () => {
  const random = Math.random;
  Math.random = () => { throw new Error('cosmetic life used Math.random'); };
  try {
    const a = new PondLife({seed: 3}), b = new PondLife({seed: 3}), m = new Meadow({seed: 5});
    a.setPond(POND); b.setPond(POND); m.setFlowers(flowers());
    run(a, 10); run(b, 10); run(m, 10);
    assert.deepEqual(a.fish.map(f => [f.x, f.z]), b.fish.map(f => [f.x, f.z]));
  } finally { Math.random = random; }
});

test('reduced motion brings the fish to rest and stops the surface kisses', () => {
  const calm = new PondLife({seed: 9}), quiet = new PondLife({seed: 9});
  calm.setPond(POND); quiet.setPond(POND);
  let a = 0, b = 0;
  run(calm, 30, () => { a += calm.fish.reduce((n, f) => n + f.speed, 0); });
  run(quiet, 30, () => { b += quiet.fish.reduce((n, f) => n + f.speed, 0); }, 1 / 60, true);
  assert.ok(b < a * 0.5, `quiet ${b} vs ${a}`);
  run(quiet, 5, () => {}, 1 / 60, true);
  assert.ok(quiet.fish.every(f => f.speed < 0.04 && Math.abs(f.wag) < 0.05), 'still: barely drifting, tails almost at rest');
  assert.equal(quiet.events, 0);
  assert.ok(calm.events > 0, 'koi kiss the surface now and then');
});

test('a new layout keeps every fish where it was, as a place in the water', () => {
  const p = new PondLife({seed: 4}); p.setPond(POND); run(p, 5);
  const places = p.fish.map(f => [(f.x - POND.x) / POND.rx, (f.z - POND.z) / POND.rz]);
  const wide = {x: -8.75, y: 0.067, z: 2.6, rx: 1.4, rz: 0.95};
  p.setPond(wide);
  p.fish.forEach((f, i) => {
    assert.ok(Math.abs((f.x - wide.x) / wide.rx - places[i][0]) < 1e-9 && Math.abs((f.z - wide.z) / wide.rz - places[i][1]) < 1e-9);
  });
  assert.ok(p.fish[0].scale > 0.7 && p.fish[0].scale < 1.0, `a bigger pond, bigger fish (${p.fish[0].scale})`);
});

test('butterflies visit the flowers by day and leave as the light goes', () => {
  const m = new Meadow({seed: 2, budget: 1}), f = flowers();
  m.setFlowers(f); m.setHour('afternoon');
  assert.equal(m.list.length, 4);
  let perched = 0, highest = 0;
  run(m, 60, () => {
    for (const b of m.list) {
      if (b.perch > 0) perched++;
      highest = Math.max(highest, b.y - b.ground);
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z));
      assert.ok(b.x > -8 && b.x < 8 && b.z > -6 && b.z < 6, 'stays over the meadow');
    }
  });
  assert.ok(perched > 0, 'they land on flowers');
  assert.ok(highest < 1.2, `flew ${highest} high`);
  assert.ok(m.weight > 0.9);
  m.setHour('dusk'); run(m, 12);
  assert.ok(m.weight < 0.01, 'gone by dusk');
  m.setHour('afternoon'); run(m, 12);
  assert.ok(m.weight > 0.9, 'back by day');
  run(m, 12, () => {}, 1 / 60, true);
  assert.ok(m.weight < 0.01, 'reduced motion: they fly away');
});

test('the bake exports the water, its visible-water mask and the flowers for every layout', () => {
  for (const layout of ['wide', 'tall', 'strip']) {
    const m = JSON.parse(readFileSync(asset(`2d/manifest-${layout}.json`), 'utf8')), p = m.pond;
    assert.ok(p && p.rx > 0.5 && p.rz > 0.4 && Number.isFinite(p.waterY), `${layout} pond`);
    assert.ok(Math.hypot(p.centre.px[0] - m.anchors.pond.px[0], p.centre.px[1] - m.anchors.pond.px[1]) < 6, `${layout} water sits in the pond`);
    const r = p.mask.rect;
    assert.equal(m.files.pond, p.mask.file);
    assert.ok(statSync(asset(`2d/${p.mask.file}`)).size > 500, `${layout} mask file`);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= m.image.w && r.y + r.h <= m.image.h, `${layout} mask rect inside the plate`);
    assert.ok(r.x <= p.centre.px[0] && p.centre.px[0] <= r.x + r.w && r.y <= p.centre.px[1] && p.centre.px[1] <= r.y + r.h, `${layout} mask covers the water`);
    assert.ok(m.meadow.flowers.length >= 10, `${layout} flowers`);
    for (const f of m.meadow.flowers) assert.ok(f.px[0] > 0 && f.px[0] < m.image.w && f.px[1] > 0 && f.px[1] < m.image.h && /^(flower_|bush_flower)/.test(f.kind));
  }
});

test('critters.glb matches its report and the species the stages draw', () => {
  const report = JSON.parse(readFileSync(asset('critters.json'), 'utf8')), glb = readFileSync(asset('critters.glb'));
  assert.equal(report.vertex_colours, true);
  assert.equal(statSync(asset('critters.glb')).size, report.glb_bytes);
  assert.deepEqual(report.problems, []);
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')), nodes = new Set(gltf.nodes.map(n => n.name));
  assert.equal(gltf.materials.length, 1, 'one shared vertex-colour material');
  for (const sp of FISH) {
    const e = report.critters[sp.id];
    assert.ok(e, sp.id);
    assert.ok(Math.abs(e.length - sp.length) < 1e-3, `${sp.id} length ${e.length} vs ${sp.length}`);
    assert.ok(e.tris <= e.budget, `${sp.id} ${e.tris} triangles over ${e.budget}`);
    assert.deepEqual(Object.keys(e.parts), ['tail']);
    assert.ok(nodes.has(`${sp.id}_body`) && nodes.has(`${sp.id}_tail`));
  }
  const b = report.critters.butterfly;
  assert.deepEqual(Object.keys(b.parts).sort(), ['wing_l', 'wing_r']);
  assert.equal(b.parts.wing_r.axis, 'z');
  assert.ok(b.tris <= b.budget && WINGS.length >= 4);
  const draws = Object.values(report.critters).reduce((n, e) => n + e.draws, 0);
  assert.equal(draws, 9, 'two draws per fish species, three for the butterfly');
  assert.ok(glb.length < 80 * 1024);
});
