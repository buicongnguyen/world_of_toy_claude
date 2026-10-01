// Browser playthroughs of The Lantern Picnic with real mouse and touch input.
// Needs the dev server (npm run dev). PICNIC_URL overrides the address; LANTERN_QUALITY picks the renderer:
// 2d (the light stage players get by default) or a 3D tier such as low.
import {chromium, webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {PLATE, nextItemLevel} from '../src/picnic-game.js';
import {newLantern, chapter, planLanternMerge, LANTERN_SAVE, SKEWER, CHAPTERS, starsFor, seedChapter} from '../src/lantern-game.js';

await mkdir('artifacts', {recursive: true});
const quality = process.argv.find(a => a.startsWith('--quality='))?.slice(10) || process.env.LANTERN_QUALITY || '2d';
const browser = await chromium.launch({channel: process.env.CI ? undefined : 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const errors = [], requested = [], base = process.env.PICNIC_URL || 'http://localhost:4173';
const state = p => p.evaluate(() => __lantern.getState());

async function ready(p) {
  await p.waitForFunction(() => window.__lantern && document.querySelector('#loading').classList.contains('loaded'), null, {timeout: 60000});
  // let the HUD finish sliding in before measuring layout
  await p.waitForFunction(() => __lantern.getScreen() !== 'play' || getComputedStyle(document.querySelector('#hud-top')).transform === 'none' && getComputedStyle(document.querySelector('#hud-top')).opacity === '1');
  await p.waitForTimeout(150);
}
async function setup({width = 1440, height = 900, mobile = false, seed, engine = browser, query = 'play'} = {}) {
  const context = await engine.newContext({viewport: {width, height}, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile});
  if (seed) await context.addInitScript(({key, seed}) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); }, {key: LANTERN_SAVE, seed});
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requested.push(r.url()));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('keyart.webp')) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/?debug&quality=${quality}${query ? '&' + query : ''}`);
  await ready(page);
  return {page, context};
}
async function point(p, fruit) {
  return p.evaluate(f => { const q = __lantern.project(f, .6), r = document.querySelector('canvas').getBoundingClientRect(); return {x: r.x + q.x, y: r.y + q.y}; }, fruit);
}
async function settle(p) { await p.waitForFunction(() => __lantern.getDeliveries() === 0 && !__lantern.cameraBusy(), null, {timeout: 10000}); await p.waitForTimeout(80); }
async function drag(p, fruit, destination, {cdp, cancel = false} = {}) {
  const a = await point(p, fruit), b = await point(p, destination);
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{...a, id: 1}]});
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8, id: 1}]});
    await cdp.send('Input.dispatchTouchEvent', {type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: []});
  } else {
    await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, {steps: 8});
    if (cancel) await p.keyboard.press('Escape');
    await p.mouse.up();
  }
  await settle(p);
}
async function fits(p) {
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
  const v = p.viewportSize();
  for (const selector of ['#invitation', '#undo', '#menu', '#basket-label', '#skewer-label', '#plate-label', '#evolution']) {
    const b = await p.locator(selector).boundingBox();
    if (!b && selector === '#evolution' && v.height < 520) continue; // landscape phones give that strip's room to the board
    assert.ok(b && b.x >= -1 && b.y >= 0 && b.x + b.width <= v.width + 1 && b.y + b.height <= v.height + 1, `${selector} fits ${v.width}×${v.height}: ${JSON.stringify(b)}`);
  }
  // the play surface must not hide under the HUD
  const corners = await p.evaluate(() => [{x: .06, y: .08}, {x: .94, y: .08}, {x: .06, y: .74}, {x: .94, y: .74}].map(q => __lantern.project(q, .1)));
  const card = await p.locator('#invitation').boundingBox();
  for (const c of corners) assert.ok(c.x >= 0 && c.x <= v.width && c.y >= 0 && c.y <= v.height, `board corner on screen ${JSON.stringify(c)}`);
  assert.ok(corners[0].y > card.y + card.height - 4 || corners[0].x > card.x + card.width - 4, 'board clears the invitation card');
}
function choose(s, frame) {
  const c = chapter(s), wish = s.fruits.find(f => c.orders.some(o => o.level === f.level && (s.journey.served[o.level] || 0) < o.count));
  if (wish) return {fruit: wish, dest: PLATE};
  const stick = s.fruits.find(f => f.level === c.skewer);
  if (stick && !s.journey.skewers) return {fruit: stick, dest: SKEWER};
  for (const f of s.fruits) {
    const other = s.fruits.find(g => g.id !== f.id && g.level === f.level && nextItemLevel(g) !== null);
    if (other && planLanternMerge(s, f.id, other, frame)) return {fruit: f, dest: other};
  }
  return null;
}
async function playChapter(p, cdp, stage) {
  const frame = await p.evaluate(() => __lantern.getFrame());
  for (let turn = 0; turn < 200; turn++) {
    const s = await state(p);
    if (s.journey.status !== 'playing') break;
    const move = choose(s, frame);
    if (move) {
      await drag(p, move.fruit, move.dest, {cdp});
      const after = await state(p);
      if (after.journey.actions !== s.journey.actions + 1) {
        await p.screenshot({path: 'artifacts/lantern-failed-drag.png'});
        console.log('failed drag from', await point(p, move.fruit), 'to', await point(p, move.dest), 'hint:', await p.locator('#gesture-hint').innerText(), 'toast:', await p.locator('#toast').innerText());
      }
      assert.equal(after.journey.actions, s.journey.actions + 1, `stage ${stage} drag ${JSON.stringify(move)}`);
    } else {
      await p.locator('#basket-label').click();
      await settle(p);
      if ((await state(p)).fruits.length === s.fruits.length) await drag(p, s.fruits[0], PLATE, {cdp});
    }
  }
  const s = await state(p);
  assert.equal(s.journey.status, 'celebrate');
  assert.equal(s.journey.chapter, stage);
  assert.ok([1, 2, 3].includes(s.journey.records[stage].stars));
  await p.locator('#celebration').waitFor({state: 'visible', timeout: 8000});
  await p.waitForTimeout(1700);
  assert.equal(await p.locator('#score').innerText(), s.score.toLocaleString());
  assert.equal(await p.locator('#stars i.on').count(), starsFor(stage, s.journey.actions), 'stars shown match the run');
  return s;
}
async function complete(p, cdp) {
  const tag = cdp ? 'touch' : 'desktop';
  for (let stage = 0; stage < CHAPTERS.length; stage++) {
    const s = await playChapter(p, cdp, stage);
    assert.equal(await p.evaluate(() => __lantern.getTime()), CHAPTERS[stage].time);
    await p.screenshot({path: `artifacts/lantern-${tag}-chapter-${stage + 1}.png`});
    if (stage === 0) {
      await p.locator('#admire').click();
      await p.locator('#undo').click();
      assert.equal((await state(p)).journey.status, 'playing');
      const retry = choose(await state(p), await p.evaluate(() => __lantern.getFrame()));
      await drag(p, retry.fruit, retry.dest, {cdp});
      assert.deepEqual(await state(p), s, 'undo completion and replay is exact');
      await p.locator('#celebration').waitFor({state: 'visible', timeout: 8000});
    }
    await p.locator('#next-invitation').click();
    if (stage < CHAPTERS.length - 1) {
      await p.waitForFunction(() => __lantern.getScreen() === 'play');
      await p.waitForTimeout(120);
      await settle(p);
      assert.equal((await state(p)).journey.chapter, stage + 1);
    }
  }
  await p.locator('#ending').waitFor({state: 'visible', timeout: 10000});
  const done = await state(p);
  assert.equal(done.journey.status, 'complete');
  assert.deepEqual(done.journey.completed, [0, 1, 2, 3, 4]);
  await p.screenshot({path: `artifacts/lantern-${tag}-ending.png`});
  await p.reload(); await ready(p);
  assert.equal((await state(p)).journey.status, 'complete');
}

try {
  // title, intro cinematic and skipping
  {
    const {page, context} = await setup({query: ''});
    assert.equal(await page.evaluate(() => __lantern.getScreen()), 'title');
    assert.ok(await page.locator('#title-screen').isVisible());
    await page.screenshot({path: 'artifacts/lantern-title.png'});
    await page.locator('#begin').click();
    // a new story opens with Grandma Hazel's letter
    await page.locator('#letter').waitFor({state: 'visible'});
    assert.match(await page.locator('#letter-text').innerText(), /Dear Pip/);
    await page.screenshot({path: 'artifacts/lantern-prologue.png'});
    await page.locator('#letter-close').click();
    await page.waitForFunction(() => __lantern.getScreen() === 'cinematic');
    assert.ok(await page.locator('#chapter-card').isVisible());
    await page.locator('#chapter-card').click();
    // Pip's arrival conversation, framed on the speaker; lines advance, and the scene can be skipped
    await page.waitForFunction(() => __lantern.dialogue()?.speaker === 'pip');
    const first = (await page.evaluate(() => __lantern.dialogue())).text;
    await page.locator('#dialogue-next').click(); await page.locator('#dialogue-next').click();
    await page.waitForFunction(t => __lantern.dialogue()?.text !== t, first);
    await page.screenshot({path: 'artifacts/lantern-dialogue.png'});
    await page.locator('#dialogue-skip').click();
    await page.waitForFunction(() => __lantern.getScreen() === 'play' && !__lantern.dialogue());
    assert.equal(await page.locator('#title-screen').isVisible(), false);
    assert.equal(await page.locator('#dialogue').isVisible(), false);
    await context.close();
    console.log('PASS: title screen, prologue letter, chapter card, arrival dialogue, scene skip');
  }
  const {page, context} = await setup();
  await fits(page);
  const assets = await page.evaluate(() => __lantern.getAssets());
  if (quality === '2d') {
    assert.ok(assets.some(f => /^fruit-\w+\.webp$/.test(f)) && assets.some(f => /^friend-\w+-pip\.webp$/.test(f)), assets.join(', '));
    // the light stage never downloads the 3D engine or its models
    assert.deepEqual(requested.filter(u => /\.glb$|\/three\/|lantern-scene|draco/.test(u)), []);
  } else assert.equal(assets.length >= 50, true);
  await page.screenshot({path: 'artifacts/lantern-desktop.png'});
  let s = await state(page);
  await drag(page, s.fruits[0], s.fruits[1], {cancel: true});
  assert.deepEqual(await state(page), s);
  await drag(page, s.fruits[0], s.fruits[1]);
  assert.equal((await state(page)).score, 20);
  assert.ok(await page.locator('.flying-coin').count() > 0);
  await page.locator('#undo').click();
  assert.deepEqual(await state(page), s);
  assert.equal(await page.locator('.flying-coin').count(), 0);
  await drag(page, s.fruits[0], SKEWER);
  const partial = await state(page);
  await page.reload(); await ready(page);
  assert.deepEqual(await state(page), partial);
  await complete(page);
  // after the story, revisit the first invitation from the journey
  await page.locator('#menu').click();
  await page.locator('#settings-journey').click();
  await page.locator('[data-replay="0"]').click();
  await page.waitForFunction(() => __lantern.getScreen() === 'play');
  const revisit = await state(page);
  assert.equal(revisit.journey.replay, true); assert.equal(revisit.journey.chapter, 0); assert.equal(revisit.journey.actions, 0);
  console.log(`PASS: ${quality === '2d' ? 'baked 2D art without 3D downloads' : 'Blender libraries'}, drag/cancel, coins, undo, partial skewer reload, five-invitation story with stars, completion undo, ending, reload and revisit`);
  await context.close();

  // Small living details: koi in the pond (cut by the baked water mask on the light stage, the Blender
  // critters in 3D) and butterflies by day. A tap on the water scatters the fish and spreads a ring, and
  // it never touches the game.
  {
    const {page, context} = await setup();
    await page.waitForFunction(() => { const l = __lantern.life(); return l && l.masked !== false && l.weight > 0.5; }, null, {timeout: 30000});
    const life = await page.evaluate(() => __lantern.life()), before = await state(page);
    assert.equal(life.fish.length, 5);
    assert.deepEqual([...new Set(life.fish.map(f => f.kind))].sort(), ['goldfish', 'koi_flame', 'koi_gold']);
    assert.equal(life.butterflies, 4);
    if (quality !== '2d') {
      assert.equal(life.draws, 9, 'five koi and four butterflies in nine draws');
      assert.ok(requested.some(u => /critters\.glb\?v=\w+/.test(u)), 'critters.glb is versioned by its report');
    }
    // a point on the water that the canvas itself receives (not a HUD panel over it)
    const tap = await page.evaluate(() => {
      const w = __lantern.world, P = w.life.pond.pond, r = w.canvas.getBoundingClientRect();
      const screen = (x, z) => {
        if (w.camera) { const v = w.camera.position.clone().set(x, P.y, z).project(w.camera); return {x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height}; }
        const q = w.toScreen(w.imagePoint(x, P.y, z)); return {x: r.left + q.x, y: r.top + q.y};
      };
      for (const k of [0, 0.3, 0.5]) for (let a = 0; a < 6.28; a += 0.8) {
        const p = screen(P.x + Math.cos(a) * P.rx * k, P.z + Math.sin(a) * P.rz * k);
        if (document.elementFromPoint(p.x, p.y) === w.canvas) return p;
      }
      return null;
    });
    assert.ok(tap, 'the pond is on screen');
    const events = life.events;
    await page.mouse.click(tap.x, tap.y);
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => __lantern.life());
    assert.ok(after.events > events && after.ripples >= 1, 'a ring spreads where the water was tapped');
    assert.ok(after.fish.some(f => f.state === 'flee'), 'the koi dart away');
    const now = await state(page);
    assert.deepEqual({fruits: now.fruits, score: now.score, journey: now.journey}, {fruits: before.fruits, score: before.score, journey: before.journey});
    await context.close();
    console.log(`PASS: koi${quality === '2d' ? ' under the baked water mask' : ' (critters.glb, nine draws)'} and butterflies; a tap on the pond scatters the fish and leaves the game alone`);
  }

  for (const [name, width, height] of [['small', 320, 568], ['phone', 390, 844], ['large-phone', 412, 915], ['landscape', 844, 390], ['small-landscape', 667, 375], ['tablet', 768, 1024]]) {
    const {page, context} = await setup({width, height, mobile: true}), cdp = await context.newCDPSession(page);
    await fits(page);
    const s = await state(page);
    await drag(page, s.fruits[0], s.fruits[1], {cdp, cancel: true});
    assert.deepEqual(await state(page), s);
    await drag(page, s.fruits[0], s.fruits[1], {cdp});
    assert.equal((await state(page)).score, 20);
    await page.locator('#undo').tap();
    assert.deepEqual(await state(page), s);
    const a = await point(page, s.fruits[0]), b = await point(page, s.fruits[1]);
    await page.touchscreen.tap(a.x, a.y); await page.touchscreen.tap(b.x, b.y); await settle(page);
    assert.equal((await state(page)).score, 20);
    await page.locator('#undo').tap();
    await page.locator('#menu').tap();
    assert.ok(await page.locator('#settings-dialog').isVisible());
    await page.locator('#quiet-motion').check();
    await page.locator('#settings-dialog [data-close]').tap();
    assert.equal((await state(page)).reducedMotion, true);
    await page.screenshot({path: `artifacts/lantern-${name}.png`});
    if (name === 'phone') await complete(page, cdp);
    await context.close();
    console.log(`PASS: ${name} ${width}×${height} touch, tap-to-place, undo, settings, quiet motion and layout`);
  }
  const seed = newLantern();
  seed.fruits = [{id: 1, level: 0, x: .2, y: .3}, {id: 2, level: 0, x: .43, y: .4}, {id: 3, level: 0, x: .57, y: .4}, {id: 4, level: 0, x: .5, y: .49}];
  seed.nextId = 5;
  const combo = await setup({width: 390, height: 844, mobile: true, seed}), cdp = await combo.context.newCDPSession(combo.page);
  await drag(combo.page, seed.fruits[0], {x: .5, y: .435}, {cdp});
  assert.equal((await state(combo.page)).score, 60);
  // bloom-combo easter egg: four cherries become three strawberries
  assert.deepEqual((await state(combo.page)).fruits.map(f => f.level), [1, 1, 1]);
  assert.match(await combo.page.locator('#gesture-hint').innerText(), /Bloom combo/);
  await combo.page.screenshot({path: 'artifacts/lantern-four-fruit-combo.png'});
  await combo.page.locator('#undo').tap();
  await combo.page.locator('canvas').focus();
  await combo.page.keyboard.press('n'); await combo.page.keyboard.press('k');
  await settle(combo.page);
  assert.equal((await state(combo.page)).journey.skewer.length, 1);
  await combo.context.close();
  console.log('PASS: 4-fruit bloom combo (three upgrades), keyboard threading');

  // story beats: a secret wish is revealed when the guest says it; undo during an outro cancels it cleanly
  {
    const at = (i, tweak) => { const t = newLantern(); t.journey.chapter = i; t.journey.completed = [...Array(i).keys()]; seedChapter(t); tweak(t); return t; };
    const momo = at(1, t => { t.fruits.push({id: 90, level: 3, x: .5, y: .66}); t.nextId = 100; });
    const {page, context} = await setup({seed: momo});
    assert.deepEqual(await page.evaluate(() => __lantern.wishes()), ['shown', 'hidden']);
    assert.match(await page.locator('#orders').innerText(), /A secret wish/);
    await drag(page, {x: .5, y: .66}, PLATE);
    assert.deepEqual(await page.evaluate(() => __lantern.wishes()), ['shown', 'hidden'], 'still a secret until Momo asks');
    await page.waitForFunction(() => __lantern.wishes()[1] === 'shown', null, {timeout: 6000});
    assert.match(await page.locator('#orders').innerText(), /Pear/);
    await context.close();
    const nori = at(2, t => { t.journey.served = {8: 1}; t.journey.skewer = [6, 6]; t.fruits = [{id: 90, level: 6, x: .5, y: .5}, {id: 91, level: 5, x: .3, y: .3}]; t.nextId = 100; t.journey.actions = 7; });
    const second = await setup({seed: nori, query: ''});
    const p = second.page;
    await p.locator('#begin').click();
    await p.waitForFunction(() => __lantern.dialogue(), null, {timeout: 15000});
    await p.locator('#dialogue-skip').click();
    await p.waitForFunction(() => __lantern.getScreen() === 'play' && !__lantern.cameraBusy(), null, {timeout: 15000});
    // the winning drop starts the lantern cinematic, so drag without waiting for the camera to rest
    const a = await point(p, {x: .5, y: .5}), b = await point(p, SKEWER);
    await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, {steps: 8}); await p.mouse.up();
    await p.waitForFunction(() => __lantern.dialogue()?.speaker === 'nori', null, {timeout: 10000});
    assert.equal(await p.locator('#continue').isVisible(), false, 'no Continue during the lantern beat');
    await p.locator('#undo').click();
    assert.equal(await p.evaluate(() => __lantern.dialogue()), null);
    await p.waitForTimeout(4500);
    assert.equal((await state(p)).journey.status, 'playing');
    assert.equal(await p.locator('#celebration').isVisible(), false, 'no stale celebration after undo');
    await second.context.close();
    console.log('PASS: secret wish revealed when spoken, outro dialogue, undo cancels pending story beats');
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }

if (process.env.PICNIC_WEBKIT) {
  const engine = await webkit.launch({headless: true, executablePath: process.env.PICNIC_WEBKIT});
  try {
    const {page, context} = await setup({width: 390, height: 844, mobile: true, engine});
    await fits(page);
    const s = await state(page), a = await point(page, s.fruits[0]), b = await point(page, s.fruits[1]);
    await page.touchscreen.tap(a.x, a.y); await page.touchscreen.tap(b.x, b.y); await settle(page);
    assert.equal((await state(page)).score, 20);
    await page.locator('#undo').tap();
    assert.deepEqual(await state(page), s);
    await page.screenshot({path: 'artifacts/lantern-webkit.png'});
    await context.close();
    assert.deepEqual(errors, []);
    console.log('PASS: WebKit mobile asset loading, tap merge, undo and layout');
  } finally { await engine.close(); }
}
