import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const state=()=>page.evaluate(()=>window.__keepsakes.getState());
const waitReady=async p=>{await p.waitForFunction(()=>window.__keepsakes);await p.waitForFunction(()=>getComputedStyle(document.getElementById('loading')).opacity==='0');};
try{
  await page.goto('http://localhost:4173/attic.html?debug');await waitReady(page);
  await page.screenshot({path:'artifacts/desktop.png'});
  // Actual pointer movement to an item, followed by automatic proximity collection.
  const point=await page.evaluate(()=>{const p=window.__keepsakes.project({x:-.9,y:.1,z:1.9});const r=document.querySelector('canvas').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};});
  await page.mouse.click(point.x,point.y);
  await page.waitForFunction(()=>window.__keepsakes.getState().collected.includes('thread-peach'),{timeout:15000});
  console.log('PASS: floor pointer input and automatic discovery');
  // Visit out of order: the UI explains the dependency and prevents resource loss.
  await page.locator('#marker-bear').click();
  await page.locator('#interaction').waitFor({state:'visible',timeout:20000});
  assert.equal(await page.locator('#restore-button').isDisabled(),true);
  await page.locator('#close-interaction').click();
  console.log('PASS: locked story interactions');
  for(const [chapter,id]of ['lamp','music','bear'].entries()){
    let safety=0;
    while((await state()).thread<3&&safety++<9){
      const count=(await state()).collected.length;await page.locator('#guide-button').click();
      await page.waitForFunction(n=>window.__keepsakes.getState().collected.length>n,count,{timeout:20000});
    }
    assert.ok((await state()).thread>=3);
    await page.locator('#guide-button').click();
    await page.locator('#interaction').waitFor({state:'visible',timeout:20000});
    assert.equal(await page.locator('#restore-button').isDisabled(),false);
    await page.locator('#restore-button').click();
    await page.locator('#modal').waitFor({state:'visible'});
    assert.equal((await state()).restored[chapter],id);
    if(chapter===0)await page.screenshot({path:'artifacts/memory.png'});
    await page.locator('#memory-continue').click();
    console.log(`PASS: collect, navigate around furniture, restore, and read ${id} memory`);
  }
  await page.locator('#claim-gift').click();
  assert.equal((await state()).coins,145);assert.equal((await state()).bonusClaimed,true);
  await page.locator('#ending-decorate').click();
  for(const id of ['flowers','bunting','cushion'])await page.locator(`[data-buy="${id}"]`).click();
  assert.equal((await state()).coins,70);assert.equal((await state()).decorations.length,3);
  await page.locator('#close-modal').click();
  console.log('PASS: ending gift and all cosmetic purchases');
  await page.reload();await waitReady(page);
  assert.equal((await state()).restored.length,3);assert.equal((await state()).decorations.length,3);assert.equal((await state()).coins,70);
  console.log('PASS: progress persists across browser reload');
  await page.locator('#memories-button').click();await page.locator('[data-memory="lamp"]').click();await page.locator('#memory-continue').click();assert.equal((await state()).coins,70);
  await page.locator('#pocket-button').click();assert.equal(await page.locator('.pocket-item:not(.unknown)').count(),9);await page.locator('#close-modal').click();
  await page.locator('#help-button').click();await page.locator('#motion-setting').check();await page.locator('#help-done').click();assert.equal((await state()).reducedMotion,true);
  await page.locator('#sound-button').click();assert.equal((await state()).sound,true);await page.locator('#sound-button').click();
  await page.locator('#scene').focus();const before=await page.evaluate(()=>window.__keepsakes.getPosition());await page.keyboard.down('ArrowDown');await new Promise(resolve=>setTimeout(resolve,400));await page.keyboard.up('ArrowDown');const after=await page.evaluate(()=>window.__keepsakes.getPosition());assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.1);
  console.log('PASS: memory replay, inventory, reduced motion, audio toggle, keyboard movement');
  const downloadPromise=page.waitForEvent('download');await page.locator('#photo-button').click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'little-keepsakes-my-attic.png');await download.saveAs('artifacts/room-photo.png');
  await page.screenshot({path:'artifacts/completed-room.png'});
  console.log('PASS: room photo download');
  // Fresh emulated mobile session: touch, navigation, viewport and modal layout.
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));await phone.goto('http://localhost:4173/attic.html?debug');await waitReady(phone);
  await phone.screenshot({path:'artifacts/mobile.png'});
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const tapPoint=await phone.evaluate(()=>{const p=window.__keepsakes.project({x:-.9,y:.1,z:1.9});const r=document.querySelector('canvas').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};});await phone.touchscreen.tap(tapPoint.x,tapPoint.y);await phone.waitForFunction(()=>window.__keepsakes.getState().collected.length>0,{timeout:15000});
  await phone.locator('#decorate-button').tap();assert.equal(await phone.locator('#modal').isVisible(),true);await phone.screenshot({path:'artifacts/mobile-shop.png'});await phone.locator('#close-modal').tap();
  await phone.setViewportSize({width:360,height:640});assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await phone.screenshot({path:'artifacts/mobile-small.png'});await mobile.close();
  console.log('PASS: mobile touch collection, menus, 390px and 360px layouts');
  assert.deepEqual(errors,[]);
  console.log('PASS: no uncaught browser errors or failed HTTP responses');
}catch(error){await page.screenshot({path:'artifacts/test-failure.png'});console.error('GAME STATE',await state().catch(()=>null));throw error;}
finally{await browser.close();}
