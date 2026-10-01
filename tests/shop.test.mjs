import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SHOP, balance, buy, equip, loadShop, keepForRestart, newShop, shopItem} from '../src/lantern-shop.js';
import {newLantern, loadLantern, readableSave, settleFruits, dropLantern, CHAPTERS, LANTERN_SAVE} from '../src/lantern-game.js';
import {FRUITS, distance, PLATE} from '../src/picnic-game.js';
import {VI} from '../src/lantern-vi.js';

const rich = score => { const s = newLantern(); s.score = score; s.journey.startScore = score; return s; };

test('the trunk starts with Hazel’s own blanket and cream lanterns, and the purse is score minus spent', () => {
  const s = newLantern();
  assert.deepEqual(s.shop, newShop());
  assert.deepEqual(s.shop.owned, ['blanket-cornflower', 'lantern-cream']);
  s.score = 900; s.shop.spent = 600;
  assert.equal(balance(s), 300);
  s.shop.spent = 5000; assert.equal(balance(s), 0, 'the purse never goes negative');
});

test('buying spends joys without touching the story score, owns the item and puts it on the picnic', () => {
  const s = rich(1000);
  assert.deepEqual(buy(s, 'blanket-meadow').ok, true);
  assert.equal(s.score, 1000, 'chapter tallies and records keep counting everything earned');
  assert.equal(s.shop.spent, 900); assert.equal(balance(s), 100);
  assert.equal(s.shop.blanket, 'blanket-meadow');
  assert.deepEqual(s.shop.owned, ['blanket-cornflower', 'blanket-meadow', 'lantern-cream'], 'owned items keep catalogue order');
  const again = buy(s, 'blanket-meadow'); assert.equal(again.ok, false); assert.equal(again.reasonCode, 'owned');
  const poor = buy(s, 'lantern-peach'); assert.equal(poor.ok, false); assert.equal(poor.reasonCode, 'joys'); assert.equal(poor.missing, 300);
  assert.equal(buy(s, 'no-such-thing').reasonCode, 'unknown');
  assert.equal(s.shop.spent, 900, 'failed purchases change nothing');
});

test('only owned keepsakes can be used, and each kind keeps its own choice', () => {
  const s = rich(2000);
  assert.equal(equip(s, 'lantern-mint').ok, false);
  buy(s, 'lantern-mint'); buy(s, 'blanket-strawberry');
  assert.equal(s.shop.lantern, 'lantern-mint'); assert.equal(s.shop.blanket, 'blanket-strawberry');
  assert.equal(equip(s, 'blanket-cornflower').ok, true);
  assert.equal(s.shop.blanket, 'blanket-cornflower'); assert.equal(s.shop.lantern, 'lantern-mint');
});

test('saved trunks are validated and round-trip exactly', () => {
  const s = rich(3000); buy(s, 'blanket-honey'); buy(s, 'lantern-starlight');
  assert.deepEqual(loadLantern(JSON.stringify(s)), s);
  const odd = loadShop({owned: ['blanket-honey', 'hacked', 7], blanket: 'lantern-mint', lantern: 'lantern-mint', spent: 99999}, 1200);
  assert.deepEqual(odd.owned, ['blanket-cornflower', 'blanket-honey', 'lantern-cream'], 'unknown ids dropped, free items always owned');
  assert.equal(odd.blanket, 'blanket-cornflower', 'a lantern cannot be worn as a blanket');
  assert.equal(odd.lantern, 'lantern-cream', 'an unowned lantern cannot be equipped');
  assert.equal(odd.spent, 1200, 'never more spent than the story earned');
  for (const bad of [null, 'x', {spent: -5}, {spent: 1.5}]) assert.equal(loadShop(bad, 100).spent, 0);
  const old = rich(500); delete old.shop;
  assert.deepEqual(loadLantern(JSON.stringify(old)).shop, newShop(), 'saves from before the trunk get a fresh one');
});

test('starting the story again keeps the trunk and empties the purse', () => {
  const s = rich(2000); buy(s, 'blanket-meadow');
  const kept = keepForRestart(s.shop);
  assert.deepEqual(kept.owned, s.shop.owned); assert.equal(kept.blanket, 'blanket-meadow'); assert.equal(kept.spent, 0);
  const fresh = Object.assign(newLantern(), {shop: kept});
  assert.equal(balance(fresh), 0);
});

test('a purchase mid-chapter never lowers the chapter’s joys tally', () => {
  const s = rich(1000); buy(s, 'lantern-peach');
  const fruit = s.fruits.find(f => f.level === 0);
  dropLantern(s, fruit.id, fruit, {width: 14, depth: 9.8});
  assert.ok(s.score - s.journey.startScore >= 0);
});

test('shop art exists for every item and lantern colours match the Blender preview script', () => {
  const py = fs.readFileSync(new URL('../art/blender/render_shop.py', import.meta.url), 'utf8');
  for (const item of SHOP) {
    assert.ok(fs.existsSync(new URL(`../assets/lantern-picnic/shop/${item.id}.png`, import.meta.url)), `${item.id} preview`);
    if (item.kind === 'blanket') assert.ok(fs.existsSync(new URL(`../assets/lantern-picnic/${item.look.texture}`, import.meta.url)), `${item.id} texture`);
    else assert.match(py, new RegExp(`'${item.id}': \\('${item.look.paper}', '${item.look.glow}'\\)`), `${item.id} colours in render_shop.py`);
    for (const text of [item.name, item.blurb]) assert.ok(VI[text], `Vietnamese for "${text}"`);
    assert.equal(shopItem(item.id), item);
  }
  for (const name of ['settings', 'sound-on', 'sound-off', 'undo', 'journey', 'help', 'shop', 'close', 'chevron', 'coin', 'music', 'effects', 'forest', 'voices', 'motion', 'hints', 'language', 'restart'])
    assert.ok(fs.existsSync(new URL(`../assets/lantern-picnic/ui/${name}.png`, import.meta.url)), `ui icon ${name}`);
});

test('unreadable saves are recognised by one shared test, and a save without fruit keeps its journey', () => {
  const s = newLantern(); s.journey.chapter = 3;
  assert.equal(readableSave(JSON.stringify(s)), true);
  for (const bad of ['{bad', '{}', JSON.stringify({version: 1, journey: {version: 2, chapter: CHAPTERS.length}}), JSON.stringify({version: 2, journey: {version: 2, chapter: 0}})]) assert.equal(readableSave(bad), false);
  const broken = structuredClone(s); broken.fruits = 'oops'; broken.score = 777;
  const loaded = loadLantern(JSON.stringify(broken));
  assert.equal(loaded.journey.chapter, 3); assert.equal(loaded.score, 777); assert.deepEqual(loaded.fruits, [], 'no classic starter fruit grafted on');
  assert.equal(LANTERN_SAVE, 'little-keepsakes-lantern-v1');
});

test('fruit are re-seated without overlap when the board changes shape', () => {
  const s = newLantern();
  const desk = {width: 14, depth: 9.8}, phone = {width: 7.4, depth: 10.2}, land = {width: 12, depth: 6.4};
  for (const frame of [phone, land, desk]) {
    settleFruits(s, frame);
    for (const a of s.fruits) for (const b of s.fruits) if (a.id < b.id) assert.ok(distance(a, b, frame) >= FRUITS[a.level].radius + FRUITS[b.level].radius, `${a.id}/${b.id} overlap on ${frame.width}x${frame.depth}`);
    for (const f of s.fruits) assert.ok(f.x > 0 && f.x < 1 && f.y > 0 && f.y < 0.8 && distance(f, PLATE, frame) > 0);
  }
});

test('a completed story chapter keeps its closing conversation pending until it has played', () => {
  const s = newLantern();
  assert.equal(s.journey.outro, 'seen');
  s.journey.served[1] = 2; s.journey.skewer = [0, 0];
  const cherry = s.fruits.find(f => f.level === 0);
  const r = dropLantern(s, cherry.id, {x: .43, y: .86}, {width: 14, depth: 9.8});
  assert.equal(r.completed, true); assert.equal(s.journey.outro, 'pending');
  assert.deepEqual(loadLantern(JSON.stringify(s)), s, 'the checkpoint survives a reload');
  const odd = structuredClone(s); odd.journey.outro = 'bogus';
  assert.equal(loadLantern(JSON.stringify(odd)).journey.outro, 'seen');
});
