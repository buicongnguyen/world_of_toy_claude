import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newLantern, seedChapter, CHAPTERS, LANTERN_SAVE} from '../src/lantern-game.js';
import {VI} from '../src/lantern-vi.js';
const base = (process.env.PICNIC_URL || 'http://localhost:4173').replace(/\/$/, '');
const quality = process.argv.find(a => a.startsWith('--quality='))?.slice(10) || process.env.LANTERN_QUALITY || '2d';
const browser = await chromium.launch({headless:true, ...(!process.env.CI ? {channel:'chrome'} : {}), args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const errors = [];
fs.mkdirSync('artifacts', {recursive:true});
async function ready(page) { await page.waitForFunction(() => window.__lantern && document.querySelector('#loading').classList.contains('loaded'), null, {timeout:60000}); await page.waitForTimeout(850); }
async function setup(seed = newLantern(), mobile = false, quick = false, language = 'en') {
  const context = await browser.newContext({viewport:mobile ? {width:390,height:844} : {width:1366,height:900},isMobile:mobile,hasTouch:mobile});
  await context.addInitScript(({seed,key,language,quality}) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed));
    if (!localStorage.getItem('little-keepsakes-settings-v1')) localStorage.setItem('little-keepsakes-settings-v1', JSON.stringify({language,quality,stage:2,hints:false}));
  }, {seed,key:LANTERN_SAVE,language,quality});
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + `/?debug&quality=${quality}` + (quick ? '&play' : '')); await ready(page);
  return {page,context};
}
async function change(page, language) {
  await page.locator('#menu').click(); await page.locator('#language').selectOption(language);
  await page.locator('#settings-dialog [data-close]').click(); await page.waitForTimeout(300);
}
async function fits(page, selector) {
  const bounds = await page.locator(selector).boundingBox();
  assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x+bounds.width <= page.viewportSize().width+1 && bounds.y+bounds.height <= page.viewportSize().height+1, selector + ' is reachable on screen: '+JSON.stringify(bounds));
}
try {
  for (const mobile of [false,true]) {
    const seed=newLantern(); seed.reducedMotion=true;
    const {page,context}=await setup(seed,mobile);
    // Audit the initial markup independently of dynamic rendering.
    const keys=await page.evaluate(async () => {
      const doc=new DOMParser().parseFromString(await (await fetch('./index.html')).text(),'text/html');
      const walker=document.createTreeWalker(doc,NodeFilter.SHOW_TEXT), keys=[];
      for(let node;(node=walker.nextNode());) if(!node.parentElement?.closest('script,style,[data-language]') && /[a-zA-Z]/.test(node.data)) keys.push(node.data.trim());
      for(const el of doc.querySelectorAll('[aria-label],[title],meta[name="description"]')) for(const attr of ['aria-label','title',...(el.matches('meta')?['content']:[])]) if(el.hasAttribute(attr)) keys.push(el.getAttribute(attr));
      return keys;
    });
    assert.deepEqual(keys.filter(k=>!VI[k] && k!=='LITTLE KEEPSAKES'),[],'Every static label is translated');
    const state=await page.evaluate(()=>__lantern.getState());
    await page.locator('#title-language').selectOption('vi');
    assert.equal(await page.locator('html').getAttribute('lang'),'vi');
    assert.match(await page.title(),/Dã ngoại đèn lồng/);
    assert.match(await page.locator('#begin').innerText(),/Bắt đầu/);
    await fits(page,'#title-language'); await fits(page,'#begin');
    assert.deepEqual(await page.evaluate(()=>__lantern.getState()),state);
    await page.reload(); await ready(page);
    assert.equal(await page.locator('#title-language').inputValue(),'vi');
    await page.locator('#begin')[mobile?'tap':'click']();
    await page.locator('#letter').waitFor({state:'visible'});
    assert.match(await page.locator('#letter-text').innerText(),/Pip yêu quý/);
    await fits(page,'#letter-close');
    await page.locator('#letter-close')[mobile?'tap':'click']();
    await page.waitForFunction(()=>!!__lantern.dialogue());
    await page.waitForFunction(()=>document.querySelector('#dialogue-text').textContent.includes('Từ ngày bà Hazel'));
    await page.locator('#dialogue-skip')[mobile?'tap':'click']();
    await page.waitForFunction(()=>__lantern.getScreen()==='play' && !__lantern.cameraBusy() && __lantern.getDeliveries()===0 && getComputedStyle(document.querySelector('#hud-top')).transform==='none');
    await page.waitForTimeout(150);
    const before=await page.evaluate(()=>__lantern.getState());
    // Real mouse drag or two-tap touch merge.
    const points=await page.evaluate(()=>{const f=__lantern.getState().fruits.filter(f=>f.level===0);return f.slice(0,2).map(f=>__lantern.project(f));});
    if(mobile) { await page.touchscreen.tap(points[0].x,points[0].y); await page.touchscreen.tap(points[1].x,points[1].y); }
    else {await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:12});await page.mouse.up();}
    await page.waitForFunction(score=>__lantern.getState().score>score,before.score);
    const merged=await page.evaluate(()=>__lantern.getState());
    await change(page,'en');
    assert.deepEqual(await page.evaluate(()=>__lantern.getState()),merged,'language switch preserves scores, fruit, history state');
    await page.locator('#undo')[mobile?'tap':'click']();
    assert.deepEqual(await page.evaluate(()=>__lantern.getState()),before,'Undo remains valid across language change');
    await change(page,'vi');
    assert.match(await page.locator('#orders').innerText(),/Dâu tây/);
    assert.match(await page.locator('#coin-counter').getAttribute('aria-label'),/xu vàng/);
    await fits(page,'#basket-label'); await fits(page,'#plate-label');
    await page.screenshot({path:'artifacts/languages-'+(mobile?'mobile':'desktop')+'.png'});
    await page.locator('#menu').click();
    assert.equal(await page.locator('#settings-title').innerText(),'Cài đặt');
    await page.locator('#settings-help').click(); assert.match(await page.locator('#help-dialog').innerText(),/Ghép trên khăn/);
    await page.locator('#back-to-play').click();
    if(mobile) {
      await page.setViewportSize({width:844,height:390});await page.waitForTimeout(850);
      await fits(page,'#basket-label');await fits(page,'#plate-label');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
      await page.screenshot({path:'artifacts/languages-landscape.png'});
    }
    await page.reload();await ready(page);
    assert.equal(await page.locator('#title-language').inputValue(),'vi');
    assert.deepEqual(await page.evaluate(()=>__lantern.getState()),before,'reload preserves game progress');
    await context.close(); console.log('PASS: '+(mobile?'touch':'desktop')+' bilingual story, merge, Undo, settings, save/reload and layout');
  }
  // Late wishes: an invalidated reveal must not delete a newer pending reveal.
  const seed=newLantern(); seed.journey.chapter=1;seedChapter(seed);seed.reducedMotion=true;
  seed.fruits[0].level=3;
  const race=await setup(seed,false,true,'vi');
  // Use the actual plate constant; the public callback exercises the same controller timers as dragging.
  await race.page.evaluate(async()=>{const {PLATE}=await import('./src/picnic-game.js');window.testPlate=PLATE;});
  const serveOrange=()=>race.page.evaluate(()=>{const w=__lantern.world;return w.callbacks.onDrop(w.state.fruits.find(f=>f.level===3).id,window.testPlate);});
  assert.equal((await serveOrange()).type,'serve');
  await race.page.waitForTimeout(1100);await race.page.locator('#undo').click();await serveOrange();
  await race.page.waitForTimeout(1750);
  assert.equal(await race.page.evaluate(()=>__lantern.wishes()[1]),'hidden','old callback cannot reveal a new wish early');
  await race.page.waitForTimeout(1000);
  assert.equal(await race.page.evaluate(()=>__lantern.wishes()[1]),'shown');
  assert.match(await race.page.locator('#orders').innerText(),/Lê/);
  await race.context.close();console.log('PASS: Undo/re-serve keeps secret wishes hidden until their own dialogue cue');
  // Unknown URL/saved settings fall back safely; longer Vietnamese riddles fit a small phone.
  const riddleSeed=newLantern();riddleSeed.journey.chapter=3;seedChapter(riddleSeed);riddleSeed.reducedMotion=true;
  const riddle=await setup(riddleSeed,true,true,'vi');
  const timing=await riddle.page.evaluate(()=>{const w=__lantern.world,before=w.time;cancelAnimationFrame(w.raf);w.animate(w.last-5000);return {before,after:w.time,visible:[...w.fruits.values()].every(v=>v.holder ? v.holder.visible : !v.hidden)};});
  assert.equal(timing.after,timing.before,'an old first-frame timestamp cannot rewind the simulation');
  assert.equal(timing.visible,true,'loaded fruit stay visible after an old animation timestamp');
  await riddle.page.setViewportSize({width:320,height:568});await riddle.page.waitForTimeout(800);
  assert.match(await riddle.page.locator('#orders').innerText(),/Vàng như nắng/);
  assert.ok((await riddle.page.locator('#invitation').boundingBox()).height < 568 * 0.48,'riddles leave at least half the small phone for play');
  for(const copy of await riddle.page.locator('.order.riddle .copy').all()) assert.ok((await copy.boundingBox()).width > 75,'riddle text remains readable');
  await fits(riddle.page,'#basket-label');await fits(riddle.page,'#plate-label');
  await riddle.page.screenshot({path:'artifacts/languages-riddles-small.png'});
  const beforeRiddle=await riddle.page.evaluate(()=>__lantern.getState());
  await change(riddle.page,'en');await change(riddle.page,'vi');
  assert.deepEqual(await riddle.page.evaluate(()=>__lantern.getState()),beforeRiddle);
  await riddle.page.evaluate(()=>localStorage.setItem('little-keepsakes-settings-v1',JSON.stringify({language:'unsupported',quality:'invalid',stage:2,hints:false})));
  await riddle.context.addInitScript(()=>Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2}));
  for(const query of ['?debug&play','?debug&play&quality=invalid']) {
    await riddle.page.goto(base+'/'+query);await ready(riddle.page);
    assert.equal(await riddle.page.locator('html').getAttribute('lang'),'en');
    // unknown graphics settings fall back to the light stage
    assert.equal(await riddle.page.evaluate(()=>__lantern.getRenderStats().quality),'2d');
  }
  await riddle.context.close();console.log('PASS: small-phone riddles, unchanged game state, invalid language/graphics fallback');
  // Completed stories retain their translated ending letter and all earned stars.
  const end=newLantern();end.reducedMotion=true;end.score=12345;
  Object.assign(end.journey,{chapter:4,completed:[0,1,2,3,4],status:'complete',story:true,finale:'letter',records:Object.fromEntries(CHAPTERS.map((c,i)=>[i,{stars:3,actions:c.par,score:300}]))});
  const final=await setup(end,false,false,'vi');await final.page.locator('#begin').click();await final.page.locator('#letter').waitFor({state:'visible'});
  assert.match(await final.page.locator('#letter-text').innerText(),/Bà thấy rồi/);
  await final.page.locator('#letter-close').click();await final.page.locator('#ending').waitFor({state:'visible'});
  assert.match(await final.page.locator('#ending-line').innerText(),/12.345 xu vàng/);
  await final.page.locator('#ending-journey').click();assert.match(await final.page.locator('#journey-summary').innerText(),/15[/]15 sao/);
  assert.match(await final.page.locator('#journey-list').innerText(),/Bữa tiệc lễ hội/);
  await final.context.close();assert.deepEqual(errors,[]);console.log('PASS: Vietnamese ending letter, localized score, memories and recipes; no browser errors');
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({path:'artifacts/languages-failure.png'});
    console.error(await page.evaluate(()=>({screen:window.__lantern?.getScreen(),selection:window.__lantern?.getSelection(),hint:document.querySelector('#gesture-hint')?.textContent})));
  }
  throw error;
} finally {await browser.close();}
