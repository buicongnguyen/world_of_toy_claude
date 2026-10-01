// The 1.2 UI in a real browser: thumb-sized controls, Hazel's Trunk, the settings sheet, and the
// accessibility wiring. Needs the dev server (npm run dev); PICNIC_URL overrides the address and
// LANTERN_QUALITY the renderer (2d, the default light stage, or a 3D tier such as low).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {newLantern, seedChapter, LANTERN_SAVE} from '../src/lantern-game.js';

await mkdir('artifacts', {recursive: true});
const base = (process.env.PICNIC_URL || 'http://localhost:4173').replace(/\/$/, '');
const quality = process.argv.find(a => a.startsWith('--quality='))?.slice(10) || process.env.LANTERN_QUALITY || '2d';
const browser = await chromium.launch({headless: true, ...(!process.env.CI ? {channel: 'chrome'} : {}), args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const errors = [];
const state = p => p.evaluate(() => __lantern.getState());

async function setup({width, height, mobile, seed, query = ''}) {
  const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile});
  await context.addInitScript(({key, seed}) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); }, {key: LANTERN_SAVE, seed});
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('keyart.webp')) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/?debug&quality=${quality}${query}`);
  await page.waitForFunction(() => window.__lantern && document.querySelector('#loading').classList.contains('loaded'), null, {timeout: 60000});
  await page.waitForFunction(() => document.body.classList.contains('revealed'), null, {timeout: 5000});
  await page.waitForTimeout(400);
  return {page, context};
}
const tap = (page, mobile, selector) => page.locator(selector)[mobile ? 'tap' : 'click']();

/** Every visible control is at least 44 px in both directions; switches count their whole row. */
async function thumbSized(page, where) {
  await page.waitForTimeout(450); // let sheets finish sliding in before measuring
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, select, a[href], input')) {
      if (el.closest('[hidden], [inert]') || el.closest('dialog:not([open])')) continue;
      const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') continue;
      const target = el.matches('input') && el.closest('label') ? el.closest('label') : el;
      const b = target.getBoundingClientRect();
      if (b.width === 0 || b.bottom < 0 || b.top > innerHeight) continue;
      if (b.width < 43.5 || b.height < 43.5) out.push(`${el.id || el.className} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return out;
  });
  assert.deepEqual(small, [], `thumb-sized controls on ${where}`);
}

try {
  for (const [name, width, height, mobile] of [['phone', 390, 844, true], ['small', 320, 568, true], ['desktop', 1366, 860, false]]) {
    const seed = newLantern(); seed.journey.chapter = 1; seed.journey.completed = [0]; seedChapter(seed); seed.score = 1700; seed.journey.startScore = 1700; seed.reducedMotion = true;
    const {page, context} = await setup({width, height, mobile, seed});
    // the title: the hidden HUD is inert, and nothing on it is smaller than a thumb
    assert.equal(await page.evaluate(() => document.querySelector('#hud-top').inert && document.querySelector('#world-labels').inert), true);
    await thumbSized(page, `${name} title`);
    // Hazel's Trunk from the title
    await tap(page, mobile, '#shop-open');
    await page.locator('#shop-dialog').waitFor({state: 'visible'});
    assert.equal(await page.locator('#shop-balance').innerText(), '1,700');
    await thumbSized(page, `${name} shop`);
    await tap(page, mobile, '[data-buy="blanket-strawberry"]');
    await page.waitForFunction(() => __lantern.looks().blanket === 'blanket-strawberry' && __lantern.looks().textured, null, {timeout: 8000});
    assert.equal(await page.locator('#shop-balance').innerText(), '1,100');
    assert.match(await page.locator('.shop-card.equipped').innerText(), /Strawberry check/);
    let s = await state(page);
    assert.equal(s.score, 1700); assert.equal(s.shop.spent, 600); assert.deepEqual(s.shop.owned, ['blanket-cornflower', 'blanket-strawberry', 'lantern-cream']);
    await tap(page, mobile, '#tab-lantern');
    assert.equal(await page.locator('[data-buy="lantern-starlight"]').isDisabled(), false);
    await tap(page, mobile, '[data-buy="lantern-mint"]');
    await page.waitForFunction(() => __lantern.looks().glow === '#5fdc95');
    await tap(page, mobile, '[data-equip="lantern-cream"]');
    await page.waitForFunction(() => __lantern.looks().glow === '#ffb85c');
    await page.screenshot({path: `artifacts/lantern-ui-${name}-shop.png`});
    await tap(page, mobile, '#shop-dialog [data-close]');
    // play: the purse shows spendable joys; a purchase can never be undone from under a keepsake
    await tap(page, mobile, '#begin');
    await page.waitForFunction(() => __lantern.dialogue());
    assert.match(await page.locator('#sr-live').textContent(), /Momo/, 'screen readers hear the whole line');
    await tap(page, mobile, '#dialogue-skip');
    await page.waitForFunction(() => __lantern.getScreen() === 'play' && !__lantern.cameraBusy());
    assert.equal(await page.evaluate(() => document.querySelector('#hud-top').inert), false);
    await page.waitForFunction(() => document.querySelector('#score').textContent === '400');
    await thumbSized(page, `${name} play`);
    await page.screenshot({path: `artifacts/lantern-ui-${name}-play.png`});
    const fruit = (await state(page)).fruits.filter(f => f.level === 9).slice(0, 2);
    const pts = await page.evaluate(f => f.map(x => __lantern.project(x)), fruit);
    if (mobile) { await page.touchscreen.tap(pts[0].x, pts[0].y); await page.touchscreen.tap(pts[1].x, pts[1].y); }
    else { await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down(); await page.mouse.move(pts[1].x, pts[1].y, {steps: 8}); await page.mouse.up(); }
    await page.waitForFunction(() => !document.querySelector('#undo').disabled);
    await tap(page, mobile, '#shop-button');
    await tap(page, mobile, '#tab-blanket');
    await tap(page, mobile, '[data-equip="blanket-cornflower"]');
    await page.waitForFunction(() => __lantern.looks().blanket === 'blanket-cornflower');
    assert.equal(await page.locator('#undo').isDisabled(), false, 'changing looks is free and keeps Undo');
    const before = await state(page);
    if (before.score - before.shop.spent >= 400) {
      await tap(page, mobile, '#tab-lantern'); await tap(page, mobile, '[data-buy="lantern-peach"]');
      await page.waitForFunction(() => document.querySelector('#undo').disabled, null, {timeout: 3000});
    }
    await tap(page, mobile, '#shop-dialog [data-close]');
    // settings: grouped sheet, a real sound switch, and a restart that keeps the trunk
    await tap(page, mobile, '#menu');
    await page.locator('#settings-dialog').waitFor({state: 'visible'});
    await thumbSized(page, `${name} settings`);
    const sound = (await state(page)).sound;
    await page.locator('#sound-toggle').setChecked(!sound);
    await page.waitForFunction(v => __lantern.getState().sound === v, !sound);
    assert.match(await page.locator('#vol-music').getAttribute('style'), /--fill: \d+%/);
    await page.screenshot({path: `artifacts/lantern-ui-${name}-settings.png`});
    await tap(page, mobile, '#restart');
    assert.equal(await page.locator('#restart').evaluate(el => el.classList.contains('armed')), true);
    await tap(page, mobile, '#restart');
    await page.waitForFunction(() => __lantern.getScreen() === 'title');
    s = await state(page);
    assert.equal(s.score, 0); assert.equal(s.shop.spent, 0); assert.ok(s.shop.owned.includes('blanket-strawberry') && s.shop.owned.includes('lantern-mint'), 'the trunk keeps its keepsakes');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await context.close();
    console.log(`PASS: ${name} ${width}×${height} thumb-sized controls, inert hidden HUD, Hazel's Trunk buy/equip/looks, purchase clears Undo, sound switch, sliders, restart keeps the trunk, live region`);
  }
  // a reload during a closing conversation plays it again, once, before the stars
  {
    const seed = newLantern(); seed.journey.chapter = 2; seed.journey.completed = [0, 1, 2]; seedChapter(seed);
    Object.assign(seed.journey, {status: 'celebrate', served: {8: 1}, skewers: 1, skewer: [], actions: 9, outro: 'pending', records: {2: {stars: 3, actions: 9, score: 400}}});
    const {page, context} = await setup({width: 1280, height: 800, mobile: false, seed});
    await page.locator('#begin').click();
    await page.waitForFunction(() => __lantern.dialogue()?.speaker === 'nori', null, {timeout: 10000});
    await page.locator('#dialogue-skip').click();
    await page.locator('#celebration').waitFor({state: 'visible'});
    assert.equal((await state(page)).journey.outro, 'seen');
    await page.reload();
    await page.waitForFunction(() => window.__lantern && document.querySelector('#loading').classList.contains('loaded'), null, {timeout: 60000});
    await page.locator('#begin').click();
    await page.locator('#celebration').waitFor({state: 'visible'});
    assert.equal(await page.evaluate(() => __lantern.dialogue()), null, 'the conversation is not repeated');
    await context.close();
    console.log('PASS: closing conversation interrupted by a reload plays once before the stars');
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
