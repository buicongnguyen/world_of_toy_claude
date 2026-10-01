// Run against the dev server: PICNIC_URL defaults to http://localhost:4173.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {newLantern, seedChapter, CHAPTERS, LAST, LANTERN_SAVE} from '../src/lantern-game.js';

const base = process.env.PICNIC_URL || 'http://localhost:4173';
const browser = await chromium.launch({headless: true, ...(!process.env.CI ? {channel: 'chrome'} : {}), args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const errors = [];
async function ready(page) {
  await page.waitForFunction(() => window.__lantern && document.querySelector('#loading').classList.contains('loaded'), null, {timeout: 60000});
  await page.waitForTimeout(800);
}
async function setup(seed, {mobile = false, quick = false, quality = 'low'} = {}) {
  const context = await browser.newContext({viewport: mobile ? {width: 390, height: 844} : {width: 1280, height: 900}, isMobile: mobile, hasTouch: mobile});
  await context.addInitScript(({key, seed}) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); }, {key: LANTERN_SAVE, seed});
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + `/?debug&quality=${quality}` + (quick ? '&play' : ''));
  await ready(page);
  return {page, context};
}

try {
  // Exercise actual post-processing allocations independently of the game's asset caches.
  const context = await browser.newContext({viewport: {width: 240, height: 160}});
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/resource-fixture', route => route.fulfill({contentType: 'text/html', body: '<canvas></canvas><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>'}));
  await page.goto(base + '/resource-fixture');
  const memory = await page.evaluate(async () => {
    const {Renderer} = await import('/src/engine/renderer.js');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const view = new Renderer(document.querySelector('canvas'), {quality: 'low'});
    view.attach(new THREE.Scene(), new THREE.PerspectiveCamera()); view.resize(240, 160);
    const samples = [];
    for (const quality of ['medium', 'high', 'ultra']) for (let cycle = 0; cycle < 3; cycle++) {
      view.setQuality(quality); view.resize(240, 160); view.render(1 / 60, 0);
      view.setQuality('low'); view.resize(240, 160); view.render(1 / 60, 0);
      samples.push({quality, cycle, textures: view.renderer.info.memory.textures, stalePass: !!(view.finish || view.gtao || view.bloom)});
    }
    view.renderer.dispose(); return samples;
  });
  for (const sample of memory) {
    assert.equal(sample.textures, 0, JSON.stringify(sample));
    assert.equal(sample.stalePass, false);
  }
  await context.close();
  console.log('PASS: repeated medium/high/ultra quality changes release every post-processing texture');

  // Warm both board shapes, then ensure rotations never grow beyond their allocated GPU footprint.
  const rotating = newLantern(); rotating.journey.chapter = 2; rotating.journey.completed = [0, 1, 2]; seedChapter(rotating); rotating.reducedMotion = true;
  const phone = await setup(rotating, {mobile: true, quick: true});
  // the pond's koi and butterflies load lazily after the reveal: let them land first, so their upload (or the
  // hitch it causes) never falls inside the measured rotations
  await phone.page.waitForFunction(() => __lantern.life() !== null, null, {timeout: 30000});
  const before = await phone.page.evaluate(() => __lantern.getState());
  const expected = new Map();
  for (let cycle = 0; cycle < 4; cycle++) for (const [name, width, height] of [['portrait', 390, 844], ['landscape', 844, 390]]) {
    await phone.page.setViewportSize({width, height}); await phone.page.waitForTimeout(800);
    // each rotation rebuilds the board (new water, grass and dressing): sample only after it has been drawn, or a
    // slow frame on a busy machine reads as a lower baseline and the next rotation as growth
    await phone.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const sample = await phone.page.evaluate(() => ({...__lantern.world.renderer.info.memory}));
    // The first pair of rotations can upload previously invisible shared assets.
    if (cycle === 1) expected.set(name, sample);
    if (cycle > 1) {
      // Frustum culling can leave fewer geometries uploaded after a rebuild. A
      // lower count is valid; this regression guards against leaked allocations.
      for (const resource of ['geometries', 'textures']) assert.ok(sample[resource] <= expected.get(name)[resource], `${name} ${resource} grew after rotation ${cycle}: ${sample[resource]} > ${expected.get(name)[resource]}`);
    }
  }
  assert.deepEqual(await phone.page.evaluate(() => __lantern.getState()), before, 'rotation does not alter game state');
  await phone.context.close();
  console.log('PASS: repeated phone rotations retain stable GPU geometry/texture counts and game state');

  for (const [mobile, quality] of [[false, 'low'], [true, 'low'], [false, '2d'], [true, '2d']]) {
    const seed = newLantern(); seed.journey.chapter = LAST; seedChapter(seed); seed.reducedMotion = true;
    Object.assign(seed.journey, {status: 'celebrate', completed: CHAPTERS.map((_, i) => i), served: Object.fromEntries(CHAPTERS[LAST].orders.map(o => [o.level, o.count])), skewers: 1, actions: 10, records: {4: {stars: 3, actions: 10, score: 500}}});
    seed.score = 500;
    const {page, context} = await setup(seed, {mobile, quality});
    const activate = id => mobile ? page.locator(id).tap() : page.locator(id).click();
    await activate('#begin'); await activate('#next-invitation');
    await page.waitForFunction(() => !!__lantern.dialogue());
    assert.equal(await page.evaluate(() => __lantern.getState().journey.finale), 'pending');
    await page.reload(); await ready(page); await activate('#begin');
    await page.waitForFunction(() => !!__lantern.dialogue());
    await activate('#dialogue-skip'); await page.locator('#letter').waitFor({state: 'visible'});
    assert.match(await page.locator('#letter-text').innerText(), /I saw them/);
    assert.equal(await page.evaluate(() => __lantern.getState().journey.finale), 'letter');
    await page.reload(); await ready(page); await activate('#begin');
    await page.locator('#letter').waitFor({state: 'visible'});
    assert.equal(await page.evaluate(() => __lantern.dialogue()), null, 'letter resumes without replaying conversation');
    await activate('#letter-close'); await page.locator('#ending').waitFor({state: 'visible'});
    assert.equal(await page.evaluate(() => __lantern.getState().journey.finale), 'seen');
    await page.reload(); await ready(page); await activate('#begin');
    assert.equal(await page.evaluate(() => __lantern.getScreen()), 'play');
    assert.equal(await page.locator('#letter').isVisible(), false);
    await activate('#continue'); await page.waitForFunction(() => !!__lantern.dialogue());
    const after = await page.evaluate(() => __lantern.getState());
    assert.equal(after.score, seed.score); assert.deepEqual(after.journey.records, seed.journey.records);
    assert.equal(after.journey.actions, seed.journey.actions);
    await context.close();
    console.log(`PASS: ${mobile ? 'touch' : 'desktop'} (${quality === '2d' ? 'light stage' : '3D'}) finale reloads resume conversation/letter; acknowledged endings stay complete; festival replay preserves rewards`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
