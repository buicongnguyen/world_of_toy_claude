// The light 2D stage in a real browser: the baked camera maps the board exactly, picking inverts it,
// rotations swap baked layouts, hours and blankets dissolve in, no 3D engine is ever fetched, a
// frame stays cheap on a slowed-down CPU, and Automatic picks the right renderer per device.
// Needs the dev server (npm run dev); PICNIC_URL overrides it.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newLantern, seedChapter, LANTERN_SAVE} from '../src/lantern-game.js';

const base = (process.env.PICNIC_URL || 'http://localhost:4173').replace(/\/$/, '');
const browser = await chromium.launch({headless: true, ...(!process.env.CI ? {channel: 'chrome'} : {}), args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const errors = [];
const manifest = async layout => JSON.parse(await readFile(new URL(`../assets/lantern-picnic/2d/manifest-${layout}.json`, import.meta.url), 'utf8'));

async function setup({width, height, mobile = false, seed = null}) {
  const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile});
  if (seed) await context.addInitScript(({key, seed}) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); }, {key: LANTERN_SAVE, seed});
  const page = await context.newPage(), requested = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => requested.push(r.url()));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('keyart.webp')) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/?debug&play&quality=2d`);
  await page.waitForFunction(() => window.__lantern && document.querySelector('#loading').classList.contains('loaded'), null, {timeout: 60000});
  await page.waitForFunction(() => !__lantern.cameraBusy());
  return {page, context, requested};
}

try {
  // Each viewport family gets its own baked layout, and the stage's camera maps the rules' board
  // onto exactly the pixels the bake painted it at.
  for (const [layout, width, height, mobile] of [['wide', 1440, 900, false], ['tall', 390, 844, true], ['strip', 844, 390, true]]) {
    const {page, context, requested} = await setup({width, height, mobile});
    const m = await manifest(layout);
    const info = await page.evaluate(() => __lantern.getRenderStats());
    assert.equal(info.quality, '2d'); assert.equal(info.layout, layout);
    assert.deepEqual(await page.evaluate(() => __lantern.getFrame()), m.frame);
    const corners = await page.evaluate(() => [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => { const w = __lantern.world, p = w.world3({x, y}, 0.1); return w.imagePoint(p.x, p.y, p.z); }));
    corners.forEach((p, i) => { assert.ok(Math.abs(p.x - m.boardCorners[i].px[0]) < 0.6 && Math.abs(p.y - m.boardCorners[i].px[1]) < 0.6, `${layout} corner ${i}: ${JSON.stringify(p)} vs ${m.boardCorners[i].px}`); });
    // picking inverts the projection anywhere on the cloth
    const misses = await page.evaluate(() => {
      const w = __lantern.world, r = w.canvas.getBoundingClientRect(), out = [];
      for (const x of [0.05, 0.3, 0.5, 0.7, 0.95]) for (const y of [0.05, 0.5, 0.95]) {
        const q = w.project({x, y}, 0.09), b = w.boardAt(r.left + q.x, r.top + q.y);
        out.push(Math.hypot((b.x - x) * w.frame.width, (b.y - y) * w.frame.depth));
      }
      return Math.max(...out);
    });
    assert.ok(misses < 0.02, `${layout} picking error ${misses} world units`);
    // the whole board sits inside the canvas
    const inside = await page.evaluate(() => { const w = __lantern.world; return [[0, 0], [1, 0], [1, 1], [0, 1]].every(([x, y]) => { const q = w.project({x, y}); return q.x >= 0 && q.y >= 0 && q.x <= w.width && q.y <= w.height; }); });
    assert.ok(inside, `${layout} board is on screen`);
    // the koi know this layout's water: its mask is loaded and every fish swims inside it
    await page.waitForFunction(() => __lantern.life()?.masked);
    const pond = await page.evaluate(() => __lantern.life()), P = m.pond;
    assert.equal(pond.fish.length, mobile ? 3 : 5, `${layout} koi`);
    for (const f of pond.fish) assert.ok(Math.hypot((f.x - P.centre.world[0]) / P.rx, (f.z - P.centre.world[2]) / P.rz) <= 0.87, `${layout} koi in the water`);
    assert.deepEqual(requested.filter(u => /\.glb$|\/three\/|lantern-scene|engine\/(assets|renderer|sky|camera|characters|particles|foliage)\.js|draco/.test(u)), [], `${layout} fetched 3D files`);
    await context.close();
    console.log(`PASS: ${layout} ${width}×${height}: baked camera maps the board, picking inverts it, no 3D downloads`);
  }

  // Rotating a phone swaps baked layouts without losing a fruit or the story.
  {
    const seed = newLantern(); seed.journey.chapter = 2; seed.journey.completed = [0, 1]; seedChapter(seed); seed.reducedMotion = true;
    const {page, context} = await setup({width: 390, height: 844, mobile: true, seed});
    const before = await page.evaluate(() => __lantern.getState());
    for (const [width, height, layout] of [[844, 390, 'strip'], [390, 844, 'tall'], [844, 390, 'strip']]) {
      await page.setViewportSize({width, height});
      await page.waitForFunction(l => __lantern.getRenderStats().layout === l && !!__lantern.world.compositeReady(__lantern.getTime()), layout, {timeout: 15000});
      const after = await page.evaluate(() => __lantern.getState());
      assert.equal(after.fruits.length, before.fruits.length); assert.deepEqual(after.journey, before.journey);
      assert.deepEqual(await page.evaluate(() => __lantern.getFrame()), (await manifest(layout)).frame);
    }
    await context.close();
    console.log('PASS: phone rotations swap tall and strip layouts and keep every fruit and the story');
  }

  // Camera poses are pixels of one baked picture: a rotation mid-shot must not glide on from a pose
  // in the old picture (which would sweep the view off the island for a second).
  {
    const seed = newLantern(); seed.reducedMotion = false;
    const {page, context} = await setup({width: 390, height: 844, mobile: true, seed});
    for (const [width, height, layout] of [[844, 390, 'strip'], [390, 844, 'tall']]) {
      await page.evaluate(() => { const w = __lantern.world; w.rig.focus(w.speak('pip'), {distance: 0.4}); });
      await page.waitForTimeout(300);
      await page.setViewportSize({width, height});
      await page.waitForFunction(l => __lantern.getRenderStats().layout === l, layout, {timeout: 15000});
      const poses = await page.evaluate(() => new Promise(resolve => {
        const w = __lantern.world, out = [];
        const step = () => { const p = w.rig.current, b = w.rig.base; out.push({cx: p.cx / w.m.image.w, cy: p.cy / w.m.image.h, zoom: p.s / b.s}); if (out.length < 45) requestAnimationFrame(step); else resolve(out); };
        requestAnimationFrame(step);
      }));
      for (const p of poses) assert.ok(p.cx > 0 && p.cx < 1 && p.cy > 0 && p.cy < 1 && p.zoom > 0.7 && p.zoom < 1.6, `${layout}: camera off the picture after rotating mid-shot ${JSON.stringify(p)}`);
      await page.evaluate(() => { __lantern.world.speak(null); __lantern.world.rig.release(); });
    }
    await context.close();
    console.log('PASS: rotating during a close-up starts the new layout\'s camera on its own picture');
  }

  // A friend walking to their seat during a rotation lands at the new layout's seat, on screen; only
  // the current layout's sprites stay decoded; neutral light draws straight from the atlases.
  {
    const seed = newLantern(); seed.journey.chapter = 2; seed.journey.completed = [0, 1]; seedChapter(seed); seed.reducedMotion = false;
    const {page, context} = await setup({width: 844, height: 390, mobile: true, seed});
    await page.evaluate(() => __lantern.world.placeCast({walkIn: true}));
    assert.ok(await page.evaluate(() => [...__lantern.world.characters.values()].some(c => c.path)), 'someone is walking');
    await page.setViewportSize({width: 390, height: 844});
    await page.waitForFunction(() => __lantern.getRenderStats().layout === 'tall' && !__lantern.world.switching, null, {timeout: 15000});
    await page.waitForTimeout(400);
    const cast = await page.evaluate(() => { const w = __lantern.world; return [...w.characters.values()].filter(c => c.root.visible).map(c => ({name: c.name, walking: !!c.path, head: w.headPoint(c.name), w: w.width, h: w.height})); });
    for (const c of cast) assert.ok(!c.walking && c.head.x > 0 && c.head.x < c.w && c.head.y > -40 && c.head.y < c.h, `${c.name} after rotating mid-walk: ${JSON.stringify(c)}`);
    const decoded = await page.evaluate(() => [...__lantern.world.art.bitmaps.keys()]);
    assert.deepEqual(decoded.filter(f => /-(strip|wide)[-.]/.test(f)), [], 'the old layout\'s atlases are released');
    await page.evaluate(() => __lantern.jump(0));
    await page.waitForFunction(() => __lantern.getTime() === 'afternoon' && __lantern.world.tod.t >= 1, null, {timeout: 15000});
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => __lantern.world.tinted.size), 0, 'no tinted copies in neutral light');
    await context.close();
    console.log('PASS: friends walking through a rotation land on screen; old atlases released; no copies in neutral light');
  }

  // Bramble's own lantern leads the festival, also once the story is complete (the ending replays it).
  {
    const seed = newLantern(); seed.reducedMotion = false;
    Object.assign(seed.journey, {chapter: 4, completed: [0, 1, 2, 3, 4], status: 'complete', story: true, finale: 'seen'});
    const {page, context} = await setup({width: 1280, height: 800, seed});
    const bramble = await page.evaluate(() => { const w = __lantern.world; w.resetFestival(); w.finale(); return w.skyLanterns.filter(l => l.bramble).length; });
    assert.equal(bramble, 1);
    await context.close();
    console.log('PASS: Bramble\'s lantern rises first at the festival after the story is complete');
  }

  // Hours dissolve from one baked background to the next, and a new blanket is woven into the cloth.
  {
    const {page, context} = await setup({width: 1280, height: 800});
    await page.evaluate(() => __lantern.jump(3));
    await page.waitForFunction(() => __lantern.getTime() === 'dusk' && __lantern.world.tod.t >= 1 && !!__lantern.world.compositeReady('dusk'), null, {timeout: 15000});
    const lit = await page.evaluate(() => __lantern.world.lanterns.map(l => l.target));
    assert.deepEqual(lit, [1, 1, 1, 0, 0]);
    assert.equal(await page.evaluate(() => __lantern.world.fire > 0.5), true, 'the campfire is lit from dusk');
    const seen = await page.evaluate(async () => {
      const w = __lantern.world, before = w.compositeReady('dusk');
      w.state.shop.owned.push('blanket-strawberry'); w.state.shop.blanket = 'blanket-strawberry'; w.applyLooks();
      await w.composite('dusk', 'blanket-strawberry');
      await new Promise(r => setTimeout(r, 700));
      return {changed: w.shown !== before && w.shown.blanket === 'blanket-strawberry', kept: w.composites.size <= 3};
    });
    assert.deepEqual(seen, {changed: true, kept: true});
    // only the art in use is decoded; hours still to come are fetched but stay compressed
    assert.ok(await page.evaluate(() => __lantern.world.composites.size) <= 3);
    await context.close();
    console.log('PASS: dusk look (three lanterns, campfire), blanket re-weave, bounded background cache');
  }

  // A frame stays cheap on a CPU slowed to a low-end phone's pace.
  {
    const {page, context} = await setup({width: 390, height: 844, mobile: true});
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
    const measure = () => page.evaluate(() => new Promise(resolve => {
      const w = __lantern.world, draw = w.draw.bind(w), times = [];
      w.draw = quiet => { const t = performance.now(); draw(quiet); times.push(performance.now() - t); };
      setTimeout(() => { w.draw = draw; times.sort((a, b) => a - b); resolve({median: times[times.length >> 1], p95: times[Math.floor(times.length * 0.95)], frames: times.length}); }, 3000);
    }));
    const cost = await measure();
    // the same frames without the living details (koi, butterflies, the hour's life), for the record
    await page.evaluate(() => { const w = __lantern.world; w.saved = [w.life.drawPond, w.life.drawButterflies, w.hours.draw]; w.life.drawPond = w.life.drawButterflies = () => 0; w.hours.draw = () => {}; });
    const bare = await measure();
    await page.evaluate(() => { const w = __lantern.world; [w.life.drawPond, w.life.drawButterflies, w.hours.draw] = w.saved; });
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});
    assert.ok(cost.frames > 30, `only ${cost.frames} frames in 3 s`);
    assert.ok(cost.median < 8, `median frame script ${cost.median.toFixed(2)} ms at 4x CPU slowdown`);
    await context.close();
    console.log(`PASS: frame script ${cost.median.toFixed(2)} ms median, ${cost.p95.toFixed(2)} ms p95 at 4x CPU slowdown (${cost.frames} frames in 3 s); without the living details ${bare.median.toFixed(2)} / ${bare.p95.toFixed(2)} ms`);
  }

  // Without its baked art (a partial upload, a blocked request) the game still opens, in 3D.
  {
    const context = await browser.newContext({viewport: {width: 1280, height: 800}});
    const page = await context.newPage(), pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await context.route('**/assets/lantern-picnic/2d/manifest*.json', route => route.abort());
    await page.goto(`${base}/?debug&play&quality=2d`);
    await page.waitForFunction(() => window.__lantern && document.querySelector('#loading').classList.contains('loaded'), null, {timeout: 90000});
    assert.notEqual(await page.evaluate(() => __lantern.getRenderStats().quality), '2d');
    assert.ok(await page.evaluate(() => __lantern.getAssets().length) >= 50);
    assert.deepEqual(pageErrors, []);
    await context.close();
    console.log('PASS: missing 2D art falls back to the 3D clearing on a fresh canvas');
  }

  // Automatic (the default): phones get the light stage; capable computers get 3D, entry-level
  // ones the light stage, and 3D that fails to start falls back to the light stage.
  {
    const open = async ({gpu, mobile = false, block = null, ipad = false}) => {
      const context = await browser.newContext(mobile ? {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}
        : ipad ? {viewport: {width: 1180, height: 820}, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'} : {viewport: {width: 1440, height: 900}});
      await context.addInitScript(([gpu, ipad]) => {
        Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
        Object.defineProperty(navigator, 'deviceMemory', {get: () => 8, configurable: true});
        if (ipad) Object.defineProperty(navigator, 'maxTouchPoints', {get: () => 5}); // an iPad with a trackpad reports as a Mac
        if (!gpu) return;
        for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
          const read = proto.getParameter;
          proto.getParameter = function (p) { return p === 0x9246 ? gpu : read.call(this, p); }; // UNMASKED_RENDERER_WEBGL
        }
      }, [gpu, ipad]);
      if (block) await context.route(block, route => route.abort());
      const page = await context.newPage(), pageErrors = [];
      page.on('pageerror', e => pageErrors.push(e.message));
      await page.goto(`${base}/?debug&play`);
      await page.waitForFunction(() => window.__lantern && document.querySelector('#loading').classList.contains('loaded'), null, {timeout: 90000});
      await page.evaluate(() => document.querySelector('#menu').click());
      await page.locator('#settings-dialog').waitFor({state: 'visible'});
      const result = {quality: await page.evaluate(() => __lantern.getRenderStats().quality), shown: await page.locator('#quality').inputValue(), note: await page.locator('#render-note').innerText(), pageErrors};
      await context.close();
      return result;
    };
    const phone = await open({mobile: true});
    assert.equal(phone.quality, '2d'); assert.equal(phone.shown, 'auto'); assert.match(phone.note, /Light stage/);
    const gamer = await open({gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)'});
    assert.ok(['medium', 'high'].includes(gamer.quality), gamer.quality); assert.equal(gamer.shown, 'auto'); assert.match(gamer.note, /quality/);
    const office = await open({gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)'});
    assert.equal(office.quality, '2d');
    const broken = await open({gpu: 'Apple M2', block: '**/src/lantern-scene.js'});
    assert.equal(broken.quality, '2d');
    const ipad = await open({gpu: 'Apple GPU', ipad: true});
    assert.equal(ipad.quality, '2d');
    for (const run of [phone, gamer, office, broken, ipad]) assert.deepEqual(run.pageErrors, []);
    // a saved 3D choice on a browser that cannot start 3D opens the light stage (not a dead end) and
    // goes back to Automatic, so the next visit does not fail the same way
    {
      const context = await browser.newContext({viewport: {width: 1440, height: 900}});
      await context.addInitScript(() => {
        if (!sessionStorage.getItem('seeded')) { localStorage.setItem('little-keepsakes-settings-v1', JSON.stringify({quality: 'high', stage: 2})); sessionStorage.setItem('seeded', '1'); }
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return /webgl/.test(kind) ? null : get.call(this, kind, ...rest); };
      });
      const page = await context.newPage(), pageErrors = [];
      page.on('pageerror', e => pageErrors.push(e.message));
      await page.goto(`${base}/?debug&play`);
      await page.waitForFunction(() => document.querySelector('#loading').classList.contains('loaded') || document.querySelector('#loading').classList.contains('failed'), null, {timeout: 90000});
      assert.equal(await page.evaluate(() => document.querySelector('#loading').classList.contains('failed')), false, 'a saved 3D choice without WebGL must not strand the player');
      assert.equal(await page.evaluate(() => __lantern.getRenderStats().quality), '2d');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('little-keepsakes-settings-v1')).quality), 'auto');
      assert.deepEqual(pageErrors, []);
      await context.close();
    }
    console.log(`PASS: Automatic picks the light stage on a phone and an iPad with a trackpad, 3D (${gamer.quality}) on a gaming PC, light on an office laptop, and light when 3D cannot start (also for a saved 3D choice)`);
  }

  // Settings: a 1.2 choice moves to Automatic once, and switching Light -> 3D mid-story saves the
  // story and the choice, then reopens the clearing in 3D with every fruit, keeping the URL's flags.
  {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    const seed = newLantern(); seedChapter(seed);
    await context.addInitScript(({key, seed}) => {
      if (sessionStorage.getItem('seeded')) return;
      localStorage.setItem(key, JSON.stringify(seed));
      localStorage.setItem('little-keepsakes-settings-v1', JSON.stringify({quality: 'high', language: 'en'})); // a 1.2 save: no `stage`
      sessionStorage.setItem('seeded', '1');
    }, {key: LANTERN_SAVE, seed});
    const page = await context.newPage(), pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(`${base}/?debug&play`);
    await page.waitForFunction(() => window.__lantern && document.querySelector('#loading').classList.contains('loaded'), null, {timeout: 60000});
    assert.equal(await page.evaluate(() => __lantern.getRenderStats().quality), '2d', 'a phone on Automatic plays light');
    await page.evaluate(() => document.querySelector('#menu').click());
    assert.equal(await page.locator('#quality').inputValue(), 'auto', 'the 1.2 choice moved to Automatic');
    const before = await page.evaluate(() => __lantern.getState());
    await Promise.all([page.waitForURL(u => u.search === '?debug&play', {timeout: 30000}), page.waitForEvent('load'), page.locator('#quality').selectOption('low')]);
    await page.waitForFunction(() => window.__lantern && document.querySelector('#loading').classList.contains('loaded'), null, {timeout: 90000});
    assert.equal(await page.evaluate(() => __lantern.getRenderStats().quality), 'low');
    assert.deepEqual((await page.evaluate(() => __lantern.getState())).fruits, before.fruits);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('little-keepsakes-settings-v1')).quality), 'low');
    assert.deepEqual(pageErrors, []);
    await context.close();
    console.log('PASS: a 1.2 graphics choice moves to Automatic; switching to 3D mid-story keeps every fruit and the URL flags');
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
