// The Lantern Trail in a real browser: a phone played by touch (floating stick, taps, the tutorial
// battle with its timing ring, a waystone, the menu in Vietnamese, save and continue, the frame
// budget at a 4x CPU slowdown), a desktop played by keyboard and then through the whole story to the
// ending, and a landscape phone. Needs the dev server (npm run dev); PICNIC_URL overrides the
// address, TRAIL_URL the page. Screenshots go to artifacts/.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {VI} from '../src/trail/trail-vi.js';
import {objective} from '../src/trail/trail-rules.js';

await mkdir('artifacts', {recursive: true});
const base = (process.env.PICNIC_URL || 'http://localhost:4173').replace(/\/$/, '');
const url = process.env.TRAIL_URL || `${base}/trail.html`;
const browser = await chromium.launch({headless: true, ...(!process.env.CI ? {channel: 'chrome'} : {}), args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const errors = [];
const SAVE = 'little-keepsakes-trail-v1';

async function open(view, {fresh = true, query = '?debug'} = {}) {
  const context = await browser.newContext(view);
  if (fresh) await context.addInitScript(() => { if (!sessionStorage.started) { localStorage.clear(); sessionStorage.started = 1; } });
  const page = await context.newPage(), requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  page.on('request', r => requests.push(r.url()));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  let bytes = 0;
  cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; });
  await page.goto(url + query);
  await page.waitForFunction(() => window.__trail?.mode === 'title', null, {timeout: 60000});
  await page.waitForTimeout(300);
  return {page, context, cdp, requests, bytes: () => bytes};
}
const mode = page => page.evaluate(() => __trail.mode);
const st = page => page.evaluate(() => JSON.parse(JSON.stringify(__trail.state)));

/** Every visible control is at least 44 px in both directions. */
async function thumbSized(page, where) {
  await page.waitForTimeout(400);
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, select, a[href], input')) {
      if (el.closest('[hidden]') || el.closest('dialog:not([open])')) continue;
      const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') continue;
      const target = el.matches('input') && el.closest('label') ? el.closest('label') : el;
      const b = target.getBoundingClientRect();
      if (b.width === 0 || b.bottom < 0 || b.top > innerHeight) continue;
      if (b.width < 43.5 || b.height < 43.5) out.push(`${el.id || el.className || el.tagName} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return out;
  });
  assert.deepEqual(small, [], `${where}: controls under 44 px`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no sideways scroll`);
}

/** Advance conversations by tapping the dialogue (or pressing Space on desktop). */
async function advance(page, touch, limit = 40) {
  for (let i = 0; i < limit; i++) {
    const m = await mode(page);
    if (m !== 'talk') return m;
    if (await page.locator('.choice').first().isVisible().catch(() => false)) return 'choice';
    if (touch) await page.locator('#dialogue').tap({force: true}).catch(() => {}); else await page.keyboard.press('Space');
    await page.waitForTimeout(90);
  }
  return mode(page);
}

/** Wait out battles and conversations until the player walks again. */
async function toExplore(page, touch, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const m = await mode(page);
    if (m === 'explore') return m;
    if (m === 'talk') await advance(page, touch, 3); else await page.waitForTimeout(100);
  }
  throw new Error(`still ${await mode(page)}`);
}

/** Drag the floating stick: a touch that starts on the left half and moves by (dx, dy) for `ms`. */
async function stick(cdp, x, y, dx, dy, ms) {
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + dx * i / 6, y: y + dy * i / 6, id: 1}]}); await new Promise(r => setTimeout(r, 16)); }
  await new Promise(r => setTimeout(r, ms));
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
}

try {
  // ------------------------------------------------------------------ phone, by touch
  {
    const phone = {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true};
    const {page, context, cdp, requests, bytes} = await open(phone);
    assert.ok(!requests.some(u => /three|\.glb|draco|lantern-scene/.test(u)), 'the trail never downloads the 3D engine or models');
    const boot = bytes();
    assert.ok(boot < 1.6 * 1048576, `boot download ${(boot / 1048576).toFixed(2)} MB`);
    await thumbSized(page, 'phone title');
    await page.screenshot({path: 'artifacts/trail-phone-title.png'});
    await page.locator('#begin').tap();
    assert.equal(await toExplore(page, true), 'explore');
    await thumbSized(page, 'phone exploring');
    assert.deepEqual(await page.evaluate(() => __trail.stage.mist.map(m => m.alpha)), [1, 1, 1, 1], 'a wall of mist stands on every bridge');
    await page.evaluate(() => { const w = __trail.stage.mist[0]; __trail.teleport(w.x - 2.2, w.z + 0.6); });
    await page.waitForTimeout(400);
    await page.screenshot({path: 'artifacts/trail-phone-mist.png'});
    await toExplore(page, true);
    await page.evaluate(() => { const s = __trail.MAP.spot('meadow', 'start'); __trail.teleport(s.x, s.z); });
    // the floating stick walks Pip to the right
    const before = await page.evaluate(() => ({x: __trail.player.x, z: __trail.player.z}));
    await stick(cdp, 90, 600, 60, 0, 600);
    const after = await page.evaluate(() => ({x: __trail.player.x, z: __trail.player.z}));
    assert.ok(after.x > before.x + 0.5, `the stick walked Pip (${before.x.toFixed(2)} -> ${after.x.toFixed(2)})`);
    // tap the tutorial Mistling: Pip walks to it and the battle starts
    await page.evaluate(() => { const m = __trail.MAP.spot('meadow', 'fight'); __trail.teleport(m.x - 2.4, m.z + 0.6); });
    await page.waitForTimeout(300);
    const foe = await page.evaluate(() => { const a = __trail.stage.actors.find(x => x.kind === 'foe' && Math.hypot(x.x - __trail.MAP.spot('meadow', 'fight').x, x.z - __trail.MAP.spot('meadow', 'fight').z) < 2); return __trail.stage.toScreen(a.x, a.y + 0.6, a.z); });
    await page.touchscreen.tap(foe.x, foe.y);
    await page.waitForFunction(() => __trail.mode !== 'explore', null, {timeout: 8000});
    await advance(page, true);
    await page.waitForSelector('#commands .cmd-hug', {state: 'visible', timeout: 8000}).catch(async e => {
      await page.screenshot({path: 'artifacts/trail-phone-stuck.png'});
      throw new Error(`no commands: mode ${await mode(page)}, battle ${await page.evaluate(() => JSON.stringify(__trail.battle && {phase: __trail.battle.b.phase, turn: __trail.battle.b.turn}))}, talking ${await page.locator('#dialogue').isVisible()}`);
    });
    await thumbSized(page, 'phone battle');
    await page.screenshot({path: 'artifacts/trail-phone-battle.png'});
    // hug until calm: damage varies, so the tutorial can take a second round (the Mistling's turn plays in between)
    for (const t0 = Date.now(); Date.now() - t0 < 40000 && await page.evaluate(() => !!__trail.battle);) {
      if (!(await page.locator('#commands .cmd-hug').isVisible())) { await page.waitForTimeout(150); continue; }
      await page.locator('#commands .cmd-hug').tap();
      await page.waitForFunction(() => __trail.stage.ring?.sweet, null, {timeout: 4000}).catch(() => {});
      await page.touchscreen.tap(200, 300);
      await page.waitForTimeout(700);
    }
    await page.waitForFunction(() => !__trail.battle, null, {timeout: 15000});
    await toExplore(page, true);
    let s = await st(page);
    assert.deepEqual(s.calmed, ['m1']); assert.equal(s.glow, 6); assert.ok(s.lovely >= 1, 'a Lovely hug landed');
    // light the waystone with the action button; the first bridge opens
    await page.evaluate(() => { const w = __trail.MAP.spot('meadow', 'way'); __trail.teleport(w.x, w.z + 1); });
    await page.waitForFunction(() => __trail.mode === 'explore', null, {timeout: 8000}).catch(async () => { throw new Error('stuck in ' + await mode(page) + ' ' + JSON.stringify(await st(page))); });
    await page.waitForSelector('#action', {state: 'visible'});
    await page.locator('#action').tap();
    await toExplore(page, true);
    s = await st(page);
    assert.equal(s.flags.way1, true);
    assert.ok(await page.evaluate(() => !!__trail.grid.path(__trail.MAP.spot('meadow', 'start'), __trail.MAP.spot('pond', 'momo'))), 'the bridge to the pond is open');
    await page.waitForFunction(() => __trail.stage.mist[0].alpha === 0 && __trail.stage.mist[1].alpha === 1, null, {timeout: 5000});
    // the menu, in Vietnamese
    await page.locator('#menu-open').tap();
    await thumbSized(page, 'phone menu');
    await page.locator('[data-tab="settings"]').tap();
    await page.locator('#menu-language').selectOption('vi');
    await page.locator('#menu-close').tap();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#goal').textContent(), VI[objective(s)]);
    assert.equal(await page.locator('html').getAttribute('lang'), 'vi');
    await page.screenshot({path: 'artifacts/trail-phone-vi.png'});
    // the frame budget on a slow phone
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
    await page.evaluate(() => { window.__draws = []; const s = __trail.stage, d = s.draw.bind(s); s.draw = () => { const t = performance.now(); d(); __draws.push(performance.now() - t); }; });
    await stick(cdp, 90, 600, -50, -40, 2000);
    const draws = await page.evaluate(() => __draws.slice().sort((a, b) => a - b));
    const median = draws[Math.floor(draws.length / 2)];
    assert.ok(median < 6, `draw median ${median.toFixed(2)} ms at 4x CPU`);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});
    // a reload continues where Pip was
    const pos = await page.evaluate(() => { __trail.state; return {x: __trail.player.x, z: __trail.player.z}; });
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    await page.reload();
    await page.waitForFunction(() => window.__trail?.mode === 'title', null, {timeout: 60000});
    assert.equal(await page.locator('#continue').isVisible(), true);
    await page.locator('#continue').tap();
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => ({x: __trail.player.x, z: __trail.player.z, s: __trail.state}));
    assert.ok(Math.hypot(back.x - pos.x, back.z - pos.z) < 0.5, 'Pip continues where the trail was saved');
    assert.deepEqual(back.s.calmed, ['m1']); assert.equal(back.s.flags.way1, true);
    await context.close();
    console.log(`PASS: phone by touch: no 3D downloads, ${(boot / 1048576).toFixed(2)} MB to the title, stick, tap-to-battle, Lovely hug, waystone, Vietnamese menu, draw ${median.toFixed(2)} ms at 4x CPU, save and continue`);
  }

  // ------------------------------------------------------------------ desktop: keyboard, then the whole story
  {
    const {page, context} = await open({viewport: {width: 1366, height: 860}});
    await page.locator('#begin').click();
    assert.equal(await toExplore(page, false), 'explore');
    const x0 = await page.evaluate(() => __trail.player.x);
    await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
    assert.ok(await page.evaluate(() => __trail.player.x) > x0 + 0.5, 'D walks right');
    await page.keyboard.press('Escape');
    assert.equal(await mode(page), 'menu');
    await page.keyboard.press('Escape');
    assert.equal(await mode(page), 'explore');
    await thumbSized(page, 'desktop exploring');
    // the rest of the story, with quick animations and the rules' own bot choosing in battle
    await page.evaluate(() => { __trail.auto.fast = true; __trail.auto.battles = true; });
    const at = (islet, key, dx = 0, dz = 0) => page.evaluate(([i, k, dx, dz]) => { const s = __trail.MAP.spot(i, k); __trail.teleport(s.x + dx, s.z + dz); }, [islet, key, dx, dz]);
    const use = id => page.evaluate(id => { __trail.interact(id); }, id);
    const settle = async () => { await page.waitForTimeout(350); for (let i = 0; i < 400; i++) { const m = await mode(page); if (m === 'explore' || m === 'ending') return m; if (m === 'talk') { if (await page.locator('.choice').first().isVisible().catch(() => false)) return 'choice'; await page.evaluate(() => __trail.confirm()); } await page.waitForTimeout(60); } return mode(page); };
    const walkInto = async (islet, key) => { await at(islet, key, -1.5, 0.2); await page.keyboard.down('KeyD'); await page.waitForTimeout(650); await page.keyboard.up('KeyD'); return settle(); };
    await walkInto('meadow', 'fight');
    await at('meadow', 'way', 0, 1); await use('way1'); await settle();
    for (const islet of ['meadow', 'pond', 'wood', 'oak']) { await at(islet, 'chest', 0, 1); await use(`chest-${islet}`); await settle(); }
    for (const islet of ['meadow', 'pond', 'wood', 'oak', 'summit']) { await at(islet, 'note', 0, 1); await use(`note-${islet}`); await settle(); }
    await at('pond', 'momo', -1.6, 0.4); await settle();
    await at('wood', 'ring', -1.0, 1.7); await settle();
    await at('wood', 'way', 0, 1); await use('way2'); await settle();
    await at('oak', 'juniper', -0.4, 1); await use('juniper');
    assert.equal(await settle(), 'choice');
    await page.locator('.choice').nth(2).click(); // a firefly? not quite
    assert.equal(await settle(), 'choice');
    await page.locator('.choice').first().click(); // a lantern
    await settle();
    await walkInto('oak', 'fight');
    await at('oak', 'way', 0, 1); await use('way3'); await settle();
    await at('summit', 'bramble', 1.2, 1.4); await use('bramble'); await settle();
    let s = await st(page);
    assert.deepEqual(s.party, ['pip', 'momo', 'nori', 'juniper', 'bramble']);
    assert.equal(s.notes.length, 5); assert.equal(s.chests.length, 4);
    for (const f of ['way1', 'way2', 'way3', 'momo', 'nori', 'juniper', 'bramble']) assert.equal(s.flags[f], true, f);
    await at('summit', 'fight', 0, 0.6); await use('beacon');
    assert.equal(await settle(), 'ending');
    s = await st(page);
    assert.equal(s.flags.ending, true); assert.ok(s.calmed.includes('fog'));
    await page.waitForSelector('#ending', {state: 'visible'});
    await thumbSized(page, 'desktop ending');
    await page.screenshot({path: 'artifacts/trail-desktop-ending.png'});
    await page.locator('#ending-wander').click();
    assert.equal(await mode(page), 'explore');
    assert.equal(await page.locator('#ending-home').getAttribute('href'), './index.html');
    await context.close();
    console.log('PASS: desktop by keyboard and the whole story: five friends, five notes, four baskets, three waystones, the riddle, Old Fog and the ending');
  }

  // ------------------------------------------------------------------ landscape phone
  {
    const {page, context} = await open({viewport: {width: 844, height: 390}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await thumbSized(page, 'landscape title');
    await page.locator('#begin').tap();
    await advance(page, true);
    await thumbSized(page, 'landscape exploring');
    await page.evaluate(() => { const m = __trail.MAP.spot('meadow', 'fight'); __trail.teleport(m.x - 0.3, m.z); });
    await page.waitForFunction(() => __trail.mode !== 'explore', null, {timeout: 8000});
    await advance(page, true);
    await page.waitForSelector('#commands .cmd-hug', {state: 'visible', timeout: 8000});
    await thumbSized(page, 'landscape battle');
    const panel = await page.locator('.battle-panel').boundingBox();
    assert.ok(panel.y + panel.height <= 390 + 1, 'the battle panel fits on screen');
    await page.screenshot({path: 'artifacts/trail-landscape-battle.png'});
    await context.close();
    console.log('PASS: landscape phone: title, exploring and battle fit with thumb-sized controls');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: no browser errors or missing files');
} finally {
  await browser.close();
}
