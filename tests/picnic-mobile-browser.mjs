import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {stat} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
const base=process.env.PICNIC_URL||'http://localhost:4173';
async function ready(page){await page.waitForFunction(()=>window.__picnic);await page.waitForFunction(()=>getComputedStyle(document.getElementById('loading')).opacity==='0');}
async function state(page){return page.evaluate(()=>window.__picnic.getState());}
async function point(page,p){return page.evaluate(p=>{const q=window.__picnic.project(p,.6),r=document.querySelector('canvas').getBoundingClientRect();return{x:q.x+r.x,y:q.y+r.y};},p);}
async function touch(cdp,start,end,{cancel=false,hold=false}={}){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/12,y:start.y+(end.y-start.y)*i/12,id:1}]});if(!hold)await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});}
async function fits(page){const result=await page.evaluate(()=>{const boxes=Object.fromEntries(['.picnic-header','.fruit-family','#canvas-wrap','#basket-label','#bubble-label','#plate-label','#score-coin','#undo','#sound','#help','#photo'].map(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return[sel,{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}];}));return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,boxes};});assert.ok(result.scrollWidth<=result.width+1,JSON.stringify(result));assert.ok(result.scrollHeight<=result.height+1,JSON.stringify(result));for(const [sel,r]of Object.entries(result.boxes)){assert.ok(r.x>=-1&&r.y>=-1&&r.right<=result.width+1&&r.bottom<=result.height+1,`${sel} outside viewport: ${JSON.stringify(result)}`);if(['#undo','#sound','#help','#photo'].includes(sel)){assert.ok(r.width>=44&&r.height>=44,`${sel} needs a 44px touch target`);}}}
try{
 for(const [name,width,height]of [['compact',320,568],['android-small',360,640],['phone',390,844],['android',412,915],['landscape',844,390],['landscape-small',667,375],['tablet',768,1024]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/classic.html?mode=free&debug`);await ready(page);await fits(page);
  const cdp=await context.newCDPSession(page),pair=(await state(page)).fruits.filter(f=>f.level===0);await touch(cdp,await point(page,pair[0]),await point(page,pair[1]));await page.waitForFunction(()=>window.__picnic.getState().merges===1);await page.waitForFunction(()=>!document.querySelector('.flying-coin'));assert.equal(await page.locator('#score').innerText(),'20');assert.equal(await page.evaluate(()=>scrollY),0);
  await page.locator('#undo').tap();assert.equal((await state(page)).score,0);assert.equal((await state(page)).fruits.length,12);
  await page.screenshot({path:`artifacts/picnic-mobile-${name}.png`});await page.locator('#help').tap();assert.equal(await page.locator('#help-dialog').isVisible(),true);await page.locator('#back-to-play').tap();
  if(name==='compact'){await page.locator('#score').evaluate(el=>el.textContent='1,000,000');await fits(page);const header=await page.locator('.picnic-header').boundingBox(),title=await page.locator('.brand h1').boundingBox(),actions=await page.locator('.header-actions').boundingBox();assert.ok(title.x+title.width<=actions.x+1&&title.y>=header.y&&title.y+title.height<=header.y+header.height);await page.locator('#score').evaluate(el=>el.textContent='0');}
  if(name==='phone'){
   const before=await state(page),first=await point(page,before.fruits[0]),destination=await point(page,{x:.45,y:.4});await touch(cdp,first,destination,{cancel:true});assert.deepEqual((await state(page)).fruits,before.fruits);assert.equal(await page.evaluate(()=>window.__picnic.getSelection()),null);
   await touch(cdp,first,destination,{hold:true});await page.evaluate(()=>document.querySelector('canvas').dispatchEvent(new PointerEvent('pointercancel',{pointerId:999,pointerType:'touch'})));assert.ok(await page.evaluate(()=>window.__picnic.getSelection()),'a secondary pointer must not cancel the held fruit');await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
   await touch(cdp,first,destination,{hold:true});await page.setViewportSize({width:844,height:390});await page.waitForFunction(()=>window.__picnic.getFrame().depth===6.4);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual((await state(page)).fruits,before.fruits);assert.equal(await page.evaluate(()=>window.__picnic.getSelection()),null);await fits(page);await page.setViewportSize({width:390,height:740});await page.waitForFunction(()=>window.__picnic.getFrame().width===7.4);await fits(page);assert.deepEqual((await state(page)).fruits,before.fruits);
   const oranges=(await state(page)).fruits.filter(f=>f.level===3);for(const f of oranges){const p=await point(page,f);await page.touchscreen.tap(p.x,p.y);}assert.equal((await state(page)).score,60);
   const basket=await page.locator('#basket-label').boundingBox(),target=await point(page,{x:.5,y:.37});await touch(cdp,{x:basket.x+basket.width/2,y:basket.y+basket.height/2},target);assert.equal((await state(page)).supplyIndex,1);
   const pear=(await state(page)).fruits.find(f=>f.level===5);await touch(cdp,await point(page,pear),await point(page,{x:.73,y:.87}));assert.equal((await state(page)).shared,1);await page.reload();await ready(page);assert.equal((await state(page)).score,95);
   const insetStyle=await page.addStyleTag({content:'body{padding:24px 12px 20px!important}'});await page.waitForFunction(()=>document.querySelector('.picnic-header').getBoundingClientRect().top===24);await fits(page);await insetStyle.evaluate(el=>el.remove());
   const download=page.waitForEvent('download');await page.locator('#photo').tap();await(await download).saveAs('artifacts/picnic-mobile-photo.png');assert.ok((await stat('artifacts/picnic-mobile-photo.png')).size>10000,'mobile photo includes the rendered playmat');
   console.log('PASS: touch cancel, extra pointer, rotation during drag, browser-bar resize, two-tap merge, basket, sharing and reload');
  }
  console.log(`PASS: ${name} ${width}×${height}: visible mat, 44px controls, touch merge, coins, undo and help`);await context.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}

// An optional installed WebKit path lets local development validate the same
// browser engine used by Safari without changing the pinned Playwright package.
if(process.env.PICNIC_WEBKIT){
 const safari=await webkit.launch({headless:true,executablePath:process.env.PICNIC_WEBKIT});
 try{const context=await safari.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/classic.html?mode=free&debug`);await ready(page);await fits(page);const pair=(await state(page)).fruits.filter(f=>f.level===0);for(const fruit of pair){const p=await point(page,fruit);await page.touchscreen.tap(p.x,p.y);}await page.waitForFunction(()=>!document.querySelector('.flying-coin'));assert.equal((await state(page)).score,20);assert.equal(await page.locator('#score').innerText(),'20');await page.screenshot({path:'artifacts/picnic-mobile-webkit.png'});await page.locator('#undo').tap();assert.equal((await state(page)).score,0);await page.locator('#help').tap();await page.locator('#back-to-play').tap();assert.deepEqual(errors,[]);console.log('PASS: WebKit mobile render, tap-to-merge, gold coins, undo and help');}finally{await safari.close();}
}
