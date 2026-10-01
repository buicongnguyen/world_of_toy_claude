import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {newPicnic,PICNIC_SAVE_KEY,PLATE,itemTier} from '../src/picnic-game.js';
import {newChallenge,CHALLENGE_SAVE_KEY,cellPoint,challengePlan,emptyCells} from '../src/picnic-challenge.js';

await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
const base=process.env.PICNIC_URL||'http://localhost:4173';
const state=page=>page.evaluate(()=>window.__picnic.getState());
async function ready(page){await page.waitForFunction(()=>window.__picnic);await page.waitForFunction(()=>getComputedStyle(document.getElementById('loading')).opacity==='0');}
async function settle(page){await page.waitForFunction(()=>window.__picnic.getDeliveries()===0);}
async function setup({width=1440,height=1000,mobile=false,seed,engine=browser}={}){
 const context=await engine.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
 if(seed)await context.addInitScript(({key,data})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));},{key:CHALLENGE_SAVE_KEY,data:seed});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(`${base}/classic.html?debug`);await ready(page);return{context,page};
}
async function point(page,p,height=.6){return page.evaluate(({p,height})=>{const q=window.__picnic.project(p,height),r=document.querySelector('canvas').getBoundingClientRect();return{x:q.x+r.x,y:q.y+r.y};},{p,height});}
async function drag(page,fruit,destination,{cdp,cancel=false}={}){
 const a=await point(page,fruit),b=await point(page,destination);
 if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/10,y:a.y+(b.y-a.y)*i/10,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});}
 else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
 await settle(page);
}
function chooseMove(s){const candidates=[];for(const fruit of s.fruits)for(let cell=0;cell<25;cell++){const p=cellPoint(cell),plan=challengePlan(s,fruit.id,p);if(plan)candidates.push({fruit,p,plan});}candidates.sort((a,b)=>a.plan.count-b.plan.count||itemTier(b.plan)-itemTier(a.plan));if(candidates.length)return candidates[0];const empty=emptyCells(s);return{fruit:[...s.fruits].sort((a,b)=>itemTier(a)-itemTier(b))[0],p:empty.length?cellPoint(empty[0]):PLATE};}
function fixture(pieces){const s=newChallenge();s.fruits=pieces.map(([level,cell],i)=>({id:i+1,level,cell,...cellPoint(cell)}));s.nextId=s.fruits.length+1;return s;}
async function fits(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true);for(const id of ['round-panel','undo','mode-link','photo']){const r=await page.locator(`#${id}`).boundingBox();const v=page.viewportSize();assert.ok(r&&r.x>=0&&r.y>=0&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height+1,`${id} fits`);}}
try{
 const {page,context}=await setup();let s=await state(page);assert.equal(s.challenge.turns,0);assert.equal(await page.locator('#goal-count').innerText(),'0 / 2');await fits(page);await page.screenshot({path:'artifacts/challenge-desktop.png'});
 await drag(page,s.fruits[0],cellPoint(12),{cancel:true});assert.deepEqual(await state(page),s);
 await drag(page,s.fruits[0],s.fruits[2]);assert.deepEqual(await state(page),s,'different occupied fruit is rejected');
 await page.locator('#basket-label').click();assert.deepEqual(await state(page),s,'basket cannot be spammed for free fruit');
 for(let i=0;i<3;i++){s=await state(page);const move=chooseMove(s);await drag(page,move.fruit,move.p);assert.equal((await state(page)).challenge.turns,i+1);}
 const delivered=await state(page);assert.equal(delivered.supplyIndex,3);assert.equal(delivered.challenge.untilDrop,3);assert.equal(await page.locator('#basket-countdown').innerText(),'Basket opens in 3 turns');await page.screenshot({path:'artifacts/challenge-delivery.png'});
 await page.locator('#undo').click();s=await state(page);assert.equal(s.challenge.turns,2);assert.equal(s.supplyIndex,0);const repeat=chooseMove(s);await drag(page,repeat.fruit,repeat.p);assert.deepEqual(await state(page),delivered,'undo and replay reproduce the same delivery');
 await page.reload();await ready(page);assert.deepEqual(await state(page),delivered,'reload preserves the round and upcoming delivery');
 let moves=0;while((s=await state(page)).challenge.status==='playing'&&moves++<100){const move=chooseMove(s);await drag(page,move.fruit,move.p);assert.equal((await state(page)).challenge.turns,s.challenge.turns+1);}
 s=await state(page);assert.equal(s.challenge.harvested,2);assert.equal(s.challenge.status,'won');assert.equal(await page.locator('#round-result').isVisible(),true);assert.equal(await page.locator('#score').innerText(),s.score.toLocaleString());await page.screenshot({path:'artifacts/challenge-complete.png'});console.log(`PASS: complete browser round in ${s.challenge.turns} turns; grid, predictable refills, undo, reload and win`);
 await page.locator('#view-picnic').click();await page.locator('#picnic').focus();await page.keyboard.press('b');assert.deepEqual(await state(page),s,'completed round cannot mutate');
 await page.locator('#undo').click();assert.equal((await state(page)).challenge.status,'playing');assert.equal((await state(page)).challenge.harvested,1);assert.equal(await page.locator('#round-result').isVisible(),false);const finalMove=chooseMove(await state(page));await drag(page,finalMove.fruit,finalMove.p);assert.equal((await state(page)).challenge.status,'won');await page.reload();await ready(page);assert.equal(await page.locator('#round-result').isVisible(),true);
 await page.locator('#play-again').click();assert.deepEqual((await state(page)).challenge,newChallenge().challenge);assert.equal((await state(page)).score,0);
 const free=newPicnic();free.score=1234;await page.evaluate(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:PICNIC_SAVE_KEY,data:free});await page.locator('#mode-link').evaluate(el=>el.href+='&debug');await page.locator('#mode-link').click();await ready(page);assert.equal(await page.locator('#round-panel').isVisible(),false);assert.equal((await state(page)).score,1234);await page.locator('#mode-link').evaluate(el=>el.href+='&debug');await page.locator('#mode-link').click();await ready(page);assert.equal((await state(page)).score,0);assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).score,PICNIC_SAVE_KEY),1234);await context.close();console.log('PASS: completed-round lock, undo victory, reload victory, play again and separate free-play save');

 for(const [name,width,height] of [['small',320,568],['compact',360,640],['phone',390,844],['large-phone',412,915],['landscape',844,390],['small-landscape',667,375],['tablet',768,1024]]){
  const {page,context}=await setup({width,height,mobile:true}),cdp=await context.newCDPSession(page);await fits(page);s=await state(page);const pair=s.fruits.filter(f=>f.level===0);await drag(page,pair[0],pair[1],{cdp,cancel:true});assert.deepEqual(await state(page),s);await drag(page,pair[0],pair[1],{cdp});assert.equal((await state(page)).challenge.turns,1);assert.equal((await state(page)).score,20);await page.locator('#undo').tap();assert.equal((await state(page)).challenge.turns,0);
  const a=await point(page,pair[0]),b=await point(page,pair[1]);await page.touchscreen.tap(a.x,a.y);await page.touchscreen.tap(b.x,b.y);assert.equal((await state(page)).challenge.turns,1);await page.locator('#help').tap();assert.ok((await page.locator('#help-content').innerText()).includes('Diagonals'));await page.locator('#back-to-play').tap();await page.screenshot({path:`artifacts/challenge-${name}.png`});await context.close();console.log(`PASS: ${name} ${width}×${height}: touch merge, tap-to-place, cancel, undo, rules, goal and layout`);
 }
 const seed=fixture([[0,24],[0,11],[0,13],[0,7],[0,6]]);const phone=await setup({width:390,height:844,mobile:true,seed}),cdp=await phone.context.newCDPSession(phone.page);await drag(phone.page,seed.fruits[0],cellPoint(12),{cdp});s=await state(phone.page);assert.equal(s.score,60);assert.equal(s.fruits.length,2);await phone.page.screenshot({path:'artifacts/challenge-center-combo.png'});await phone.page.locator('#undo').tap();await phone.page.locator('#picnic').focus();await phone.page.keyboard.press('n');await phone.page.keyboard.press('ArrowLeft');await phone.page.keyboard.press('Enter');assert.equal((await state(phone.page)).fruits.find(f=>f.id===1).cell,23);await phone.page.keyboard.press('n');await phone.page.keyboard.press('t');assert.equal((await state(phone.page)).shared,1);await phone.context.close();console.log('PASS: four-fruit center combo excludes diagonal; keyboard grid step and sharing');

 const late=fixture([[11,0],[11,4]]);late.challenge.harvested=1;late.challenge.untilDrop=1;
 const end=await setup({width:320,height:568,mobile:true,seed:late});for(const f of late.fruits){const p=await point(end.page,f);await end.page.touchscreen.tap(p.x,p.y);}assert.equal((await state(end.page)).challenge.status,'won');await end.page.screenshot({path:'artifacts/challenge-small-complete.png'});assert.equal((await state(end.page)).supplyIndex,0);await end.page.locator('#play-again').tap();assert.equal((await state(end.page)).challenge.harvested,0);await end.context.close();console.log('PASS: smallest-phone victory and replay');
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
if(process.env.PICNIC_WEBKIT){const engine=await webkit.launch({headless:true,executablePath:process.env.PICNIC_WEBKIT});try{const {page,context}=await setup({width:390,height:844,mobile:true,engine});await fits(page);let s=await state(page);for(const f of s.fruits.filter(f=>f.level===0)){const p=await point(page,f);await page.touchscreen.tap(p.x,p.y);}assert.equal((await state(page)).challenge.turns,1);await page.locator('#undo').tap();assert.equal((await state(page)).challenge.turns,0);await page.locator('#help').tap();assert.equal(await page.locator('#help-dialog').isVisible(),true);await page.locator('#back-to-play').tap();await page.screenshot({path:'artifacts/challenge-webkit.png'});await context.close();assert.deepEqual(errors,[]);console.log('PASS: WebKit mobile goal, grid, tap merge and undo');}finally{await engine.close();}}
