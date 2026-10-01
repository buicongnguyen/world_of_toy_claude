import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {newPicnic,PICNIC_SAVE_KEY,FRUIT_ORDER} from '../src/picnic-game.js';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function ready(page){await page.waitForFunction(()=>window.__picnic);await page.waitForFunction(()=>getComputedStyle(document.getElementById('loading')).opacity==='0');}
async function setup(options={}){const context=await browser.newContext({viewport:{width:1440,height:1000},...options}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4173/classic.html?mode=free&debug');await ready(page);return{page,context};}
async function drag(page,from,to){const [a,b]=await page.evaluate(points=>points.map(p=>{const q=window.__picnic.project(p,.6),r=document.querySelector('canvas').getBoundingClientRect();return{x:q.x+r.x,y:q.y+r.y};}),[from,to]);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();}
async function merge(page,level){const pair=await page.evaluate(level=>window.__picnic.getState().fruits.filter(f=>f.level===level),level);await drag(page,pair[0],pair[1]);}
async function settled(page){await page.waitForFunction(()=>!document.querySelector('.flying-coin'));assert.equal(await page.locator('#score').innerText(),await page.evaluate(()=>window.__picnic.getState().score.toLocaleString()));}
try{
 const {page,context}=await setup();
 await page.evaluate(()=>{window.scoreUpdates=[];new MutationObserver(()=>window.scoreUpdates.push(Number(document.getElementById('score').textContent.replaceAll(',','')))).observe(document.getElementById('score'),{childList:true});});
 await merge(page,0);
 assert.equal(await page.evaluate(()=>window.__picnic.getState().score),20);
 assert.equal(await page.locator('#score').innerText(),'0','displayed score waits for coin arrivals');
 assert.equal(await page.locator('.flying-coin').count(),4);
 assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).score,PICNIC_SAVE_KEY),20,'reward saves before animation finishes');
 await page.waitForFunction(()=>{const c=document.querySelector('.flying-coin');return c&&getComputedStyle(c).opacity==='1';});
 await page.screenshot({path:'artifacts/picnic-golden-coins.png'});
 await settled(page);const updates=await page.evaluate(()=>window.scoreUpdates);assert.ok(updates.some(n=>n>0&&n<20),'coins increment the visible balance as they arrive');assert.ok(updates.every((n,i)=>i===0||n>=updates[i-1]));
 console.log('PASS: gold coins rise from fruit, fly to the counter, and count up to the exact saved reward');
 await merge(page,3);await merge(page,4);assert.ok(await page.locator('.flying-coin').count()>4);await settled(page);assert.equal(await page.locator('#score').innerText(),'150');console.log('PASS: overlapping reward flights collect exactly once');
 await merge(page,5);assert.ok(await page.locator('.flying-coin').count());await page.locator('#undo').click();assert.equal(await page.locator('.flying-coin').count(),0);assert.equal(await page.locator('#score').innerText(),'150');
 await page.waitForFunction(()=>!document.querySelector('.reward-pop'));await settled(page);console.log('PASS: undo during flight cancels coins and restores the balance');
 await merge(page,5);await page.reload();await ready(page);assert.equal(await page.locator('#score').innerText(),'230');assert.equal(await page.locator('.flying-coin').count(),0);console.log('PASS: reload during flight preserves the full reward');
 const fruit=await page.evaluate(()=>window.__picnic.getState().fruits.find(f=>f.level===10));await drag(page,fruit,{x:.73,y:.87});assert.ok(await page.locator('.flying-coin').count());await page.setViewportSize({width:390,height:844});await settled(page);assert.equal(await page.locator('#score').innerText(),'270');console.log('PASS: sharing emits coins; resizing settles the correct total');
 await page.locator('#help').click();await page.locator('#quiet-motion').check();await page.locator('#back-to-play').click();await merge(page,2);assert.equal(await page.locator('.flying-coin').count(),0);assert.equal(await page.locator('#score').innerText(),'310');console.log('PASS: quieter motion awards immediately without coin travel');
 await page.locator('#help').click();await page.locator('#reset-picnic').click();await page.locator('#confirm-reset').click();assert.equal(await page.locator('#score').innerText(),'0');assert.equal(await page.locator('.flying-coin').count(),0);await context.close();
 const phone=await setup({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await merge(phone.page,0);await phone.page.waitForFunction(()=>document.querySelector('.flying-coin')?.style.opacity==='1');await phone.page.screenshot({path:'artifacts/picnic-golden-coins-mobile.png'});await settled(phone.page);assert.equal(await phone.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await phone.context.close();console.log('PASS: mobile coin flights arrive at the visible counter without overflow');
 const all=newPicnic();all.fruits=FRUIT_ORDER.map((level,i)=>({id:i+1,level,x:.20+(i%4)*.20,y:.19+Math.floor(i/4)*.22}));all.nextId=13;all.discovered=[...FRUIT_ORDER];all.bubbleWelcome=true;
 const gallery=await browser.newContext({viewport:{width:1440,height:1000}});await gallery.addInitScript(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:PICNIC_SAVE_KEY,data:all});const art=await gallery.newPage();art.on('pageerror',e=>errors.push(e.message));await art.goto('http://localhost:4173/classic.html?mode=free&debug');await ready(art);await art.screenshot({path:'artifacts/picnic-fantasy-fruit.png'});await gallery.close();
 assert.deepEqual(errors,[]);console.log('PASS: all twelve fantasy fruit render; no browser errors');
}finally{await browser.close();}
