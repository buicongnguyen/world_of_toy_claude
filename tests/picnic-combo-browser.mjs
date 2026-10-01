import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {newPicnic,PICNIC_SAVE_KEY} from '../src/picnic-game.js';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
async function setup(count,mobile=false){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
 const state=newPicnic();state.fruits=[[.2,.19],[.75,.19],[.2,.65],[.75,.65]].slice(0,count).map(([x,y],i)=>({id:i+1,level:0,x,y}));state.nextId=count+1;
 await context.addInitScript(({key,data})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));},{key:PICNIC_SAVE_KEY,data:state});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4173/classic.html?mode=free&debug');await page.waitForFunction(()=>window.__picnic);await page.waitForFunction(()=>getComputedStyle(document.getElementById('loading')).opacity==='0');return{context,page};
}
async function screen(page,p,height=.6){return page.evaluate(({p,height})=>{const q=window.__picnic.project(p,height),rect=document.querySelector('canvas').getBoundingClientRect();return{x:q.x+rect.x,y:q.y+rect.y};},{p,height});}
async function state(page){return page.evaluate(()=>window.__picnic.getState());}
async function drag(page,id,target,{hold=false}={}){const f=(await state(page)).fruits.find(f=>f.id===id),a=await screen(page,f),b=await screen(page,target);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:15});if(!hold)await page.mouse.up();}
try{
 for(const count of [3,4]){
  const {context,page}=await setup(count);const frame=await page.evaluate(()=>window.__picnic.getFrame()),center={x:.5,y:.42};
  for(let i=0;i<count-1;i++){const a=i*Math.PI*2/(count-1);await drag(page,i+2,{x:center.x+Math.cos(a)*.84/frame.width,y:center.y+Math.sin(a)*.84/frame.depth});assert.equal((await state(page)).merges,0,'arranging outer fruit must not merge them');}
  const arranged=await state(page);await drag(page,1,center,{hold:true});
  assert.equal(await page.locator('#merge-preview').getAttribute('data-count'),String(count));assert.match(await page.locator('#merge-preview').innerText(),new RegExp(`${20*(count-1)} joys`));
  await page.screenshot({path:`artifacts/picnic-${count}-fruit-preview.png`});await page.mouse.up();
  let s=await state(page);assert.equal(s.fruits.length,1);assert.equal(s.score,20*(count-1));assert.equal(s.merges,1);assert.match(await page.locator('#gesture-hint').innerText(),new RegExp(`${count} fruit`));
  await page.locator('#undo').click();assert.deepEqual((await state(page)).fruits,arranged.fruits);assert.equal((await state(page)).score,0);
  await drag(page,1,center,{hold:true});await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual((await state(page)).fruits,arranged.fruits);assert.equal((await state(page)).score,0);
  await drag(page,1,center);await page.reload();await page.waitForFunction(()=>window.__picnic);assert.equal((await state(page)).score,20*(count-1));assert.equal((await state(page)).fruits.length,1);
  console.log(`PASS: arrange ${count-1} apart, drop ${count}th in center, exact preview/reward, undo, cancel and reload`);
  await context.close();
 }
 for(const count of [3,4]){
  const {context,page}=await setup(count,true);const frame=await page.evaluate(()=>window.__picnic.getFrame()),center={x:.5,y:.42};
  // Arrange through real input; the final center move uses emulated touch events.
  for(let i=0;i<count-1;i++){const a=i*Math.PI*2/(count-1);await drag(page,i+2,{x:center.x+Math.cos(a)*.84/frame.width,y:center.y+Math.sin(a)*.84/frame.depth});assert.equal((await state(page)).merges,0);}
  const cdp=await context.newCDPSession(page),first=(await state(page)).fruits.find(f=>f.id===1),start=await screen(page,first),end=await screen(page,center);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/12,y:start.y+(end.y-start.y)*i/12}]});
  // Chromium can coalesce touch moves; wait for the final visible preview.
  await page.waitForFunction(count=>document.getElementById('merge-preview').dataset.count===String(count),count,{timeout:3000});
  await page.screenshot({path:`artifacts/picnic-touch-${count}-combo.png`});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await state(page)).score,20*(count-1));assert.equal((await state(page)).fruits.length,1);console.log(`PASS: touch drag into the center makes a ${count}-fruit combo`);await context.close();
 }
 const basketSetup=await setup(2),p=basketSetup.page,center2={x:.5,y:.42},fr=await p.evaluate(()=>window.__picnic.getFrame());await drag(p,1,{x:center2.x-.84/fr.width,y:center2.y});await drag(p,2,{x:center2.x+.84/fr.width,y:center2.y});const before=await state(p),rect=await p.locator('#basket-label').boundingBox(),drop=await screen(p,center2,.1);
 await p.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await p.mouse.down();await p.mouse.move(drop.x,drop.y,{steps:15});assert.equal(await p.locator('#merge-preview').getAttribute('data-count'),'3');await p.mouse.up();assert.equal((await state(p)).score,40);assert.equal((await state(p)).supplyIndex,1);assert.equal((await state(p)).fruits.length,1);await p.locator('#undo').click();assert.deepEqual((await state(p)).fruits,before.fruits);assert.equal((await state(p)).supplyIndex,0);console.log('PASS: the basket completes a triple in one gesture; undo restores supply and fruit');
 await p.locator('#help').click();assert.equal(await p.locator('.combo-guide').count(),1);await p.screenshot({path:'artifacts/picnic-combo-guide.png'});await basketSetup.context.close();
 assert.deepEqual(errors,[]);console.log('PASS: no combo browser errors');
}finally{await browser.close();}
