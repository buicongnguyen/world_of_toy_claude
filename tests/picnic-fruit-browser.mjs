import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {newPicnic,FRUITS,FRUIT_ORDER,PICNIC_SAVE_KEY} from '../src/picnic-game.js';
import {newChallenge,CHALLENGE_SAVE_KEY,cellPoint} from '../src/picnic-challenge.js';

const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
const ready=async page=>{await page.waitForFunction(()=>window.__picnic);await page.waitForFunction(()=>getComputedStyle(document.getElementById('loading')).opacity==='0');};
async function setup(seed,{mobile=false,free=false}={}){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
 await context.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key:free?PICNIC_SAVE_KEY:CHALLENGE_SAVE_KEY,seed});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://localhost:4173/classic.html?debug${free?'&mode=free':''}`);await ready(page);return{page,context};
}
async function tapFruit(page,fruit){const p=await page.evaluate(f=>{const p=window.__picnic.project(f,.6),r=document.querySelector('canvas').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};},fruit);await page.touchscreen.tap(p.x,p.y);}
try{
 const seed=newChallenge();seed.fruits=[[9,0],[9,4],[10,10],[10,14],[11,20],[11,24]].map(([level,cell],i)=>({id:i+1,level,cell,...cellPoint(cell)}));seed.nextId=7;
 const {page,context}=await setup(seed,{mobile:true});
 assert.deepEqual(await page.locator('#evolution .evolution-fruit').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.level))),FRUIT_ORDER);
 for(const [level,next]of [[9,3],[10,6],[11,8]]){
  const pair=await page.evaluate(level=>window.__picnic.getState().fruits.filter(f=>f.level===level),level);
  for(const fruit of pair)await tapFruit(page,fruit);
  const s=await page.evaluate(()=>window.__picnic.getState());
  if(next===8)assert.equal(s.challenge.harvested,1);else assert.ok(s.fruits.some(f=>f.level===next));
 }
 let s=await page.evaluate(()=>window.__picnic.getState());assert.equal(s.score,260);assert.equal(s.challenge.turns,3);assert.equal(s.supplyIndex,3);
 await page.locator('#undo').tap();s=await page.evaluate(()=>window.__picnic.getState());assert.equal(s.challenge.harvested,0);assert.equal(s.fruits.filter(f=>f.level===11).length,2);
 await page.reload();await ready(page);assert.deepEqual(await page.evaluate(()=>window.__picnic.getState()),s);
 // A real swipe reveals later fruit without moving the playmat or clipping the page.
 const strip=await page.locator('#evolution').boundingBox(),cdp=await context.newCDPSession(page),y=strip.y+strip.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:strip.x+strip.width-15,y,id:1}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:strip.x+strip.width-15-i*30,y,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>document.getElementById('evolution').scrollLeft>80);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const last=await page.locator('.evolution-fruit').last().boundingBox();assert.ok(last.x+last.width<=390);
 await page.screenshot({path:'artifacts/picnic-new-fruit-mobile.png'});
 await context.close();
 console.log('PASS: apple, plum, and dragon fruit touch merges; watermelon banking; undo/save; twelve-fruit mobile swipe');

 const all=newPicnic();all.fruits=FRUIT_ORDER.map((level,i)=>({id:i+1,level,x:.20+(i%4)*.20,y:.19+Math.floor(i/4)*.22}));all.nextId=13;all.discovered=[...FRUIT_ORDER];all.bubbleWelcome=true;
 const gallery=await setup(all,{free:true});
 // Selecting a fruit shows the fruit guide in free play, just as in normal play.
 await gallery.page.locator('#picnic').focus();await gallery.page.keyboard.press('n');await gallery.page.keyboard.press('Escape');await gallery.page.locator('#picnic').evaluate(el=>el.blur());
 await gallery.page.screenshot({path:'artifacts/picnic-fantasy-fruit.png'});
 await gallery.context.close();
 assert.deepEqual(errors,[]);console.log(`PASS: all ${FRUITS.length} fruit render without browser errors`);
}finally{await browser.close();}
