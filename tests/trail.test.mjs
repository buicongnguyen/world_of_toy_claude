// The Lantern Trail: rules, balance, saves, translations, the baked map's freshness and connectivity.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as R from '../src/trail/trail-rules.js';
import * as M from '../src/trail/trail-map.js';
import {WalkGrid} from '../src/trail/trail-grid.js';
import {SCENES, NOTES, NAMES, PLACES} from '../src/trail/trail-script.js';
import {VI} from '../src/trail/trail-vi.js';

const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('assets/lantern-picnic/trail/manifest.json'));

// ------------------------------------------------------------------------------ words
function displayStrings() {
  const out = new Set();
  for (const lines of Object.values(SCENES)) for (const l of lines) { out.add(l.text); for (const c of l.choices || []) out.add(c.text); }
  for (const v of [...Object.values(NOTES), ...Object.values(NAMES), ...Object.values(PLACES)]) if (v) out.add(v);
  for (const f of Object.values(R.FOES)) out.add(f.name);
  for (const i of Object.values(R.ITEMS)) { out.add(i.name); out.add(i.help); }
  for (const sp of Object.values(R.SPECIALS)) { out.add(sp.name); out.add(sp.help); }
  for (const v of Object.values(R.LOVES)) out.add(v);
  const rules = read('src/trail/trail-rules.js'), start = rules.indexOf('export function objective');
  for (const m of rules.slice(start, rules.indexOf('\n}', start)).matchAll(/'([A-Z][^']* [^']+)'/g)) out.add(m[1]);
  for (const f of ['src/trail/trail-main.js', 'src/trail/trail-stage.js']) for (const m of read(f).matchAll(/\bt\('([^']+)'/g)) out.add(m[1]);
  for (const m of read('trail.html').matchAll(/data-t(?:-label)?="([^"]+)"/g)) out.add(m[1]);
  return [...out].filter(s => !['Pip', 'Momo', 'Nori', 'Juniper', 'Bramble'].includes(s));
}

test('Vietnamese covers every line, name, place, item, goal and control of the trail', () => {
  const missing = displayStrings().filter(s => !VI[s]?.trim());
  assert.deepEqual(missing, []);
});

test('translations keep their {variables}', () => {
  const vars = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const [en, vi] of Object.entries(VI)) assert.deepEqual(vars(vi), vars(en), en);
});

test('the picnic title links to the trail, in both languages', async () => {
  assert.match(read('index.html'), /href="\.\/trail\.html"/);
  const {VI: picnicVI} = await import('../src/lantern-vi.js');
  for (const s of ['The Lantern Trail', 'New · a little adventure']) assert.ok(picnicVI[s], s);
});

test('the trail never imports three.js', () => {
  for (const f of fs.readdirSync(new URL('../src/trail/', import.meta.url))) {
    const src = read(`src/trail/${f}`);
    assert.doesNotMatch(src, /from\s+['"]three|lantern-scene|engine\/assets/, f);
  }
});

// ------------------------------------------------------------------------------ progress & saves
test('a new trail starts with Pip alone and a save round-trips', () => {
  const s = R.newTrail();
  assert.deepEqual(s.party, ['pip']);
  R.join(s, 'nori'); R.join(s, 'momo');
  assert.deepEqual(s.party, ['pip', 'momo', 'nori'], 'party keeps the story order');
  s.pos = {x: 1, z: 2}; R.addItems(s, {peach: 2});
  const back = R.loadTrail(JSON.stringify(s));
  assert.deepEqual(back.party, s.party); assert.equal(back.items.peach, 2); assert.deepEqual(back.pos, {x: 1, z: 2});
});

test('broken or foreign saves are refused, odd values are repaired', () => {
  for (const bad of ['', '{', 'null', '{"v":2,"party":["pip"]}', '{"v":1,"party":["momo"]}']) assert.equal(R.loadTrail(bad), null, bad);
  const s = R.loadTrail(JSON.stringify({v: 1, party: ['pip', 'ghost', 'momo'], glow: 0, hearts: {pip: 999, momo: -5}, items: {cherries: 1, rocks: 3, peach: 0}, calmed: ['m1', 'zz'], flags: {}, chests: [], notes: []}));
  assert.deepEqual(s.party, ['pip', 'momo']);
  assert.equal(s.hearts.pip, R.maxHeart('pip', 1)); assert.equal(s.hearts.momo, R.maxHeart('momo', 1), 'nobody is saved asleep');
  assert.deepEqual(s.items, {cherries: 1}); assert.deepEqual(s.calmed, ['m1']);
});

test('levels grow hearts and hugs, and heal by the growth', () => {
  const s = R.newTrail();
  s.hearts.pip = 10;
  const r = R.addGlow(s, R.LEVELS[1]);
  assert.deepEqual([r.before, r.after], [1, 2]);
  assert.equal(s.hearts.pip, 10 + R.maxHeart('pip', 2) - R.maxHeart('pip', 1));
  assert.ok(R.warmthOf('pip', 5) > R.warmthOf('pip', 1));
});

test('fruit outside battles heals the right friend and is kept when nobody needs it', () => {
  const s = R.newTrail(); R.addItems(s, {strawberry: 1, watermelon: 1});
  assert.equal(R.useItemOutside(s, 'strawberry', 'pip'), null, 'full heart: nothing used');
  assert.equal(s.items.strawberry, 1);
  s.hearts.pip = 5;
  assert.ok(R.useItemOutside(s, 'strawberry', 'pip'));
  assert.equal(s.hearts.pip, 27); assert.equal(s.items.strawberry, undefined);
});

test('waystones need their Mistlings calm (and Juniper for the last one); goals follow the story', () => {
  const s = R.newTrail();
  assert.equal(R.objective(s), 'Calm the Mistling in the meadow.');
  assert.equal(R.canLight(s, 'way1'), false);
  s.calmed.push('m1');
  assert.equal(R.canLight(s, 'way1'), true);
  assert.equal(R.objective(s), 'Light the waystone by the bridge.');
  s.calmed.push('o1');
  assert.equal(R.canLight(s, 'way3'), false);
  s.flags.juniper = true;
  assert.equal(R.canLight(s, 'way3'), true);
});

// ------------------------------------------------------------------------------ battles
test('battles are deterministic for a seed', () => {
  const play = () => { const s = R.newTrail(); const b = R.autoplay(s, 'm2', {seed: 42, lovelyRate: 0.5, braveRate: 0.5}); return JSON.stringify(b.friends) + b.round; };
  assert.equal(play(), play());
});

test('a rescued friend fights beside Pip in their own rescue, and only joins afterwards', () => {
  const s = R.newTrail(), b = R.newBattle(s, 'p1', 1);
  assert.deepEqual(b.friends.map(f => [f.name, !!f.guest]), [['pip', false], ['momo', true]]);
  b.friends[1].heart = 3;
  b.phase = 'won';
  R.finishBattle(s, b);
  assert.equal(s.party.includes('momo'), false, 'the story joins Momo after the scene');
  assert.equal(s.hearts.momo, undefined);
});

test('a lovely hug calms more; a loved move calms more still; hiding dodges hugs but not kites', () => {
  const calm = (cmd, timing, prep = () => {}) => { const s = R.newTrail(); R.join(s, 'nori'); const b = R.newBattle(s, 'p2', 7); prep(b); if (cmd.id === 'kite') b.turn = 1; const e = R.act(b, s, cmd, timing); return e.filter(x => x.type === 'calm').reduce((a, x) => a + x.amount, 0) || e.map(x => x.type).join(); };
  const plain = calm({id: 'hug', target: 0}, null), lovely = calm({id: 'hug', target: 0}, 'lovely');
  assert.ok(lovely > plain, `${lovely} > ${plain}`);
  assert.equal(calm({id: 'hug', target: 0}, null, b => { b.foes[0].hidden = true; }), 'miss');
  assert.ok(calm({id: 'kite', target: 0}, null, b => { b.foes[0].hidden = true; }) > 0, 'kites reach hiding Mistlings');
});

test('bracing in time halves the chill; the shield halves it again', () => {
  const hit = (brave, shield) => {
    const s = R.newTrail(), b = R.newBattle(s, 'm1', 3);
    b.phase = 'foes'; b.foeTurn = 0; b.shield = shield ? 2 : 0;
    const plan = {foe: 0, move: 'chill', targets: ['pip']};
    return R.applyFoe(b, plan, brave)[0].amount;
  };
  assert.ok(hit(true, false) < hit(false, false));
  assert.ok(hit(true, true) <= hit(true, false));
});

test('Hazel’s notes are offered against Old Fog only when found and the fog is worn down', () => {
  const s = R.newTrail();
  for (const n of ['momo', 'nori', 'juniper', 'bramble']) R.join(s, n);
  const b = R.newBattle(s, 'fog', 1);
  assert.ok(!R.commands(b, s).some(c => c.id === 'letter'));
  b.foes[0].gloom = b.foes[0].max * 0.5;
  assert.ok(!R.commands(b, s).some(c => c.id === 'letter'), 'no notes found');
  s.notes = ['meadow', 'pond'];
  assert.ok(R.commands(b, s).some(c => c.id === 'letter'));
  const before = b.foes[0].gloom;
  R.act(b, s, {id: 'letter'});
  assert.equal(before - b.foes[0].gloom, Math.round(b.foes[0].max * 0.14));
  assert.ok(!R.commands(b, s).some(c => c.id === 'letter'), 'read once');
});

test('the story can be won by an ordinary player and the boss takes a real fight', () => {
  // the main path only (no optional Mistlings), with middling timing, over many seeds
  let wins = 0, bossRounds = 0;
  const N = 60;
  for (let seed = 1; seed <= N; seed++) {
    const s = R.newTrail();
    let ok = true;
    for (const g of ['m1', 'p1', 'w1', 'o1', 'fog']) {
      if (g === 'o1') R.join(s, 'juniper');
      if (g === 'fog') { R.join(s, 'bramble'); R.addItems(s, {dragon: 1}); s.notes = ['meadow', 'pond']; }
      const b = R.autoplay(s, g, {seed: seed * 13 + g.length, lovelyRate: 0.35, braveRate: 0.3});
      R.finishBattle(s, b);
      if (b.phase !== 'won') { ok = false; break; }
      if (g === 'fog') bossRounds += b.round;
      if (g === 'p1') R.join(s, 'momo');
      if (g === 'w1') R.join(s, 'nori');
      if (['m1', 'w1', 'o1'].includes(g)) R.healAll(s);
    }
    if (ok) wins++;
  }
  assert.ok(wins >= N * 0.9, `won ${wins}/${N}`);
  assert.ok(bossRounds / wins >= 6, `boss lasted ${(bossRounds / wins).toFixed(1)} rounds`);
});

test('a lost battle keeps the Mistlings gloomy and nobody stays asleep after a win', () => {
  const s = R.newTrail(), b = R.newBattle(s, 'm2', 1);
  b.friends[0].heart = 0; b.phase = 'lost';
  assert.deepEqual(R.finishBattle(s, b), {won: false});
  assert.equal(s.calmed.length, 0);
  const s2 = R.newTrail(), b2 = R.newBattle(s2, 'm1', 1);
  b2.friends[0].heart = 0; b2.phase = 'won';
  R.finishBattle(s2, b2);
  assert.ok(s2.hearts.pip >= 1);
});

// ------------------------------------------------------------------------------ the map
test('the baked art matches the map data (re-run npm run assets:trail after changing trail-map.js)', () => {
  assert.equal(manifest.plate.w, M.PLATE.w); assert.equal(manifest.plate.h, M.PLATE.h);
  for (const k of ['x0', 'z0', 'nx', 'nz', 'cell']) assert.equal(manifest.grid[k], M.GRID[k], k);
  const want = [...M.planScenery().filter(p => M.KINDS[p.kind].sprite), ...M.landmarks()].map(p => `${p.kind}@${p.x.toFixed(2)},${p.z.toFixed(2)}x${p.s}`).sort();
  const have = manifest.props.map(p => `${p.kind}@${p.x.toFixed(2)},${p.z.toFixed(2)}x${p.s}`).sort();
  assert.deepEqual(have, want);
  for (const p of manifest.props) assert.ok(manifest.sprites.items[p.sprite], p.sprite);
  for (const name of R.ORDER) for (const pose of ['idle0', 'walk0', 'bwalk3', 'talk0', 'cheer0', 'hop0', 'eat0', 'back0']) assert.ok(manifest.cast[name].poses[pose], `${name} ${pose}`);
});

function gridWith(gates) {
  const g = new WalkGrid(manifest.grid);
  for (const br of M.BRIDGES) {
    if (gates[br.gate]) continue;
    const {a, b, dx, dz} = M.bridgeEnds(br), x = a.x + (b.x - a.x) * 0.55, z = a.z + (b.z - a.z) * 0.55;
    g.setBlocker(br.id, {x: x - dz, z: z + dx}, {x: x + dz, z: z - dx}, 0.55);
  }
  return g;
}
const start = () => M.spot('meadow', 'start');

test('every place the story sends you is reachable once its gates open, and not before', () => {
  const open = gridWith({way1: true, momo: true, way2: true, way3: true});
  const targets = [];
  for (const [islet, spots] of Object.entries(M.SPOTS)) for (const key of Object.keys(spots)) if (!['water', 'rock', 'oak', 'beacon', 'ring'].includes(key)) targets.push([islet, key]);
  for (const [islet, key] of targets) {
    const p = M.spot(islet, key);
    assert.ok(open.path(start(), p), `${islet}.${key} unreachable`);
  }
  const closed = gridWith({});
  assert.ok(closed.path(start(), M.spot('meadow', 'way')), 'the meadow is open from the start');
  assert.equal(closed.path(start(), M.spot('pond', 'momo')), null, 'the first bridge waits for its waystone');
  const partly = gridWith({way1: true});
  assert.ok(partly.path(start(), M.spot('pond', 'momo')));
  assert.equal(partly.path(start(), M.spot('wood', 'way')), null, 'the second bridge waits for Momo');
});

test('heights are known under every friend, landmark and Mistling home', () => {
  const g = new WalkGrid(manifest.grid);
  for (const [islet, spots] of Object.entries(M.SPOTS)) for (const key of Object.keys(spots)) {
    const p = M.spot(islet, key), y = g.heightAt(p.x, p.z);
    assert.ok(y !== null && Math.abs(y - M.isletById[islet].y) < 0.8, `${islet}.${key}: ${y}`);
  }
});

test('pathfinding walks around scenery and slides along walls', () => {
  const g = new WalkGrid(manifest.grid), from = start(), to = M.spot('meadow', 'way');
  const path = g.path(from, to);
  assert.ok(path.length >= 1);
  let prev = from;
  for (const p of path) { assert.ok(g.sight(prev, p, 0.15), 'each leg is clear'); prev = p; }
  const edge = g.move(from.x, from.z, -50, 0);
  assert.ok(g.walkable(edge.x, edge.z), 'a huge step into the void is refused');
});

// ------------------------------------------------------------------------------ review fixes
test('a save closed mid-scene is repaired: won rescues join, a solved riddle joins, a calm Old Fog means the ending', () => {
  const base = {v: 1, party: ['pip'], glow: 30, hearts: {pip: 0}, items: {}, flags: {juniper: true}, calmed: ['m1', 'p1', 'w1', 'fog'], chests: [], notes: []};
  const s = R.loadTrail(JSON.stringify(base));
  assert.deepEqual(s.party, ['pip', 'momo', 'nori', 'juniper']);
  assert.equal(s.flags.ending, true);
  assert.ok(s.party.every(n => s.hearts[n] > 0), 'nobody wakes with no heart');
});

test('a Riddle puzzles a Mistling for two whole rounds, even Old Fog with two moves a round', () => {
  const s = R.newTrail();
  for (const n of ['momo', 'nori', 'juniper', 'bramble']) R.join(s, n);
  const b = R.newBattle(s, 'fog', 3);
  b.turn = 3; // Juniper
  R.act(b, s, {id: 'riddle', target: 0});
  b.phase = 'foes'; b.foeTurn = 0;
  let skipped = 0;
  for (let round = 0; round < 3; round++) {
    let plan;
    while ((plan = R.planFoe(b))) { if (plan.move === 'puzzled') skipped++; R.applyFoe(b, plan); }
    R.endRound(b); b.phase = 'foes'; b.foeTurn = 0;
  }
  assert.equal(skipped, 2, 'one skipped round per puzzled turn, however many moves a round it has');
});

test('tea for a party that is already full is not spent', () => {
  const s = R.newTrail(); R.join(s, 'momo');
  const b = R.newBattle(s, 'm2', 1);
  b.turn = 1;
  assert.deepEqual(R.act(b, s, {id: 'tea'}), []);
  assert.equal(b.friends[1].cd, 0); assert.equal(b.turn, 1, 'still Momo’s turn');
});

test('a body stuck inside scenery can always step back out onto the lawn', () => {
  const g = new WalkGrid(manifest.grid), tree = manifest.props.find(p => p.kind.startsWith('tree_') && p.islet === 'meadow');
  assert.equal(g.clear(tree.x, tree.z, 0.22), false);
  let p = {x: tree.x, z: tree.z};
  for (let i = 0; i < 40 && !g.clear(p.x, p.z, 0.22); i++) p = g.move(p.x, p.z, 0.08, 0.08);
  assert.equal(g.clear(p.x, p.z, 0.22), true);
});
