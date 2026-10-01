import test from 'node:test';
import assert from 'node:assert/strict';
import {FRUITS,FRUIT_ORDER,itemTier,nextItemLevel,PLATE,distance} from '../src/picnic-game.js';
import {newLantern,loadLantern,chapter,planLanternMerge,previewLantern,dropLantern,basket,nextChapter,SKEWER,nextSupply,CHAPTERS,starsFor,replayChapter,totalStars,LAST,leaveReplay,tapBasket,seedChapter,needed} from '../src/lantern-game.js';
const frame={width:14,depth:9.8},phone={width:7.4,depth:10.2};
const fixture=fruits=>{const s=newLantern();s.fruits=fruits.map((f,i)=>({id:i+1,...f}));s.nextId=fruits.length+1;s.journey.untilBasket=3;return s;};
const mass=items=>items.reduce((n,f)=>n+2**itemTier(f),0);
test('pairs make one upgrade; center combos bloom into one fewer upgrades than merged (easter egg)',()=>{
 for(const [count,made] of [[2,1],[3,2],[4,3]]){const s=fixture(Array.from({length:count},(_,i)=>({level:0,x:i===0?.2:.5+Math.cos(i*2.3)*.045,y:i===0?.2:.4+Math.sin(i*2.3)*.06})));const plan=planLanternMerge(s,1,{x:.5,y:.4},frame);assert.equal(plan.count,count);assert.equal(plan.reward,20*(count-1));assert.equal(plan.outputs.length,made);assert.ok(plan.outputs.every(o=>o.level===1),'every output is the upgrade');assert.equal(plan.bonus,count-2);assert.ok(mass(plan.outputs)>=mass(s.fruits),'combos never lose fruit value');const result=dropLantern(s,1,{x:.5,y:.4},frame);assert.equal(result.ok,true);assert.equal(result.bonus,count-2);assert.equal(s.fruits.filter(f=>f.level===1).length,made);assert.equal(s.journey.actions,1);assert.equal(s.journey.untilBasket,2);}
});
test('chains preview the exact consumed fruit and final upgrade',()=>{const s=fixture([{level:0,x:.2,y:.3},{level:0,x:.5,y:.4},{level:1,x:.559,y:.4},{level:2,x:.50,y:.48},{level:5,x:.8,y:.4}]);s.journey.served[1]=2;const p=planLanternMerge(s,1,{x:.5,y:.4},frame);assert.equal(p.chain,3);assert.equal(p.level,9);assert.deepEqual(p.removed,[1,2,3,4]);assert.equal(mass(p.outputs),mass(s.fruits.filter(f=>p.removed.includes(f.id))));const r=dropLantern(s,1,{x:.5,y:.4},frame);assert.deepEqual(r.outputs.map(({id,...f})=>f),p.outputs);assert.equal(s.fruits.find(f=>f.id===5).level,5);});
test('the last fruit must reach every group member directly',()=>{const s=fixture([{level:0,x:.2,y:.3},{level:0,x:.5,y:.4},{level:0,x:.56,y:.4},{level:0,x:.62,y:.4}]);assert.equal(planLanternMerge(s,1,{x:.5,y:.4},frame).count,3);});
test('invalid drops and rearranging do not advance delivery',()=>{const s=newLantern(),actions=s.journey.actions;assert.equal(dropLantern(s,1,{x:NaN,y:.4},frame).ok,false);const r=dropLantern(s,1,{x:.11,y:.35},frame);assert.equal(r.type,'move');assert.equal(s.journey.actions,actions);assert.equal(s.journey.untilBasket,3);const before=structuredClone(s);assert.equal(dropLantern(s,7,SKEWER,frame).ok,false);assert.deepEqual(s,before);});
test('skewer takes exactly three correct fruit and scores once',()=>{const s=newLantern();for(const id of [1,2,3])assert.equal(dropLantern(s,id,SKEWER,frame).ok,true);assert.equal(s.journey.skewers,1);assert.equal(s.score,120);assert.equal(s.journey.skewer.length,3);assert.equal(dropLantern(s,4,SKEWER,frame).ok,false);assert.equal(s.score,120);});
test('requested plate servings alone grant wish rewards',()=>{const s=fixture([{level:1,x:.3,y:.3},{level:2,x:.5,y:.3},{level:1,x:.7,y:.3},{level:1,x:.8,y:.5}]);assert.equal(dropLantern(s,1,PLATE,frame).type,'serve');assert.equal(dropLantern(s,2,PLATE,frame).type,'share');dropLantern(s,3,PLATE,frame);assert.equal(dropLantern(s,4,PLATE,frame).type,'share');assert.equal(s.journey.served[1],2);assert.equal(s.score,120);});
test('basket forecast matches delivery; full mats do not skip supplies',()=>{const s=newLantern(),forecast=nextSupply(s),r=basket(s,phone);assert.deepEqual(r.spawned.map(f=>f.level),forecast);assert.equal(s.journey.untilBasket,3);while(basket(s,phone).ok){}const before=s.journey.supply;assert.equal(basket(s,phone).ok,false);assert.equal(s.journey.supply,before);assert.ok(s.fruits.length<=22);});
test('every third productive action includes a collision-free delivery',()=>{const s=newLantern();dropLantern(s,1,SKEWER,phone);dropLantern(s,2,SKEWER,phone);const r=dropLantern(s,3,SKEWER,phone);assert.equal(r.spawned.length,3);for(const f of r.spawned)for(const g of s.fruits)if(f.id!==g.id)assert.ok(distance(f,g,phone)>=FRUITS[f.level].radius+FRUITS[g.level].radius+.03);});
test('empty cloth refills; completion grants its bonus once',()=>{const s=fixture([{level:1,x:.5,y:.4}]);assert.equal(dropLantern(s,1,PLATE).spawned.length,3);s.journey.served[1]=2;s.journey.skewer=[0,0];s.fruits=[{id:30,level:0,x:.4,y:.4}];const r=dropLantern(s,30,SKEWER);assert.equal(r.completed,true);assert.equal(r.reward,270);assert.equal(s.journey.status,'celebrate');assert.equal(basket(s).ok,false);assert.equal(dropLantern(s,31,PLATE).ok,false);assert.deepEqual(s.journey.completed,[0]);});
// Simple legal solver: serve requests, thread the skewer, merge pairs, refill as needed.
function solve(s,size,limit=220){
 for(let turn=0;turn<limit&&s.journey.status==='playing';turn++){
  const c=chapter(s),order=s.fruits.find(f=>c.orders.some(o=>o.level===f.level&&(s.journey.served[o.level]||0)<o.count));if(order){dropLantern(s,order.id,PLATE,size);continue;}
  const stick=s.fruits.find(f=>f.level===c.skewer);if(!s.journey.skewers&&stick){dropLantern(s,stick.id,SKEWER,size);continue;}
  let merged=false;for(const f of [...s.fruits]){const other=s.fruits.find(g=>g.id!==f.id&&g.level===f.level&&nextItemLevel(g)!==null);if(other){const r=dropLantern(s,f.id,other,size);if(r.type==='merge'){merged=true;break;}}}if(merged)continue;
  if(!basket(s,size).ok)dropLantern(s,s.fruits[0].id,PLATE,size);
 }
 return s;
}
test('all five invitations can be completed from their real supplies on both board sizes',()=>{
 for(const size of [frame,phone]){const s=newLantern();for(let stage=0;stage<CHAPTERS.length;stage++){
  solve(s,size);assert.equal(s.journey.status,'celebrate',`stage ${stage} on ${size.width}`);assert.ok([1,2,3].includes(s.journey.records[stage].stars));assert.deepEqual(loadLantern(JSON.stringify(s)),s);assert.equal(nextChapter(s),true);
 }assert.equal(s.journey.status,'complete');assert.equal(s.journey.story,true);assert.deepEqual(s.journey.completed,[0,1,2,3,4]);assert.deepEqual(loadLantern(JSON.stringify(s)),s);}
});
test('save restores partial skewers, deliveries, and settings without old-mode discoveries',()=>{const s=newLantern();assert.deepEqual(loadLantern(JSON.stringify(s)),s);dropLantern(s,1,SKEWER);s.sound=true;assert.deepEqual(loadLantern(JSON.stringify(s)),s);for(const input of [null,'{bad','{}',JSON.stringify({version:1,journey:{version:1,chapter:99}})])assert.equal(loadLantern(input).journey.chapter,0);});
test('stars reward efficient picnics and records keep the best result',()=>{
 for(let i=0;i<CHAPTERS.length;i++){const par=CHAPTERS[i].par;assert.equal(starsFor(i,par),3);assert.equal(starsFor(i,par+1),2);assert.equal(starsFor(i,Math.ceil(par*1.5)),2);assert.equal(starsFor(i,Math.ceil(par*1.5)+1),1);}
 const s=fixture([{level:1,x:.3,y:.3},{level:1,x:.6,y:.3},{level:0,x:.2,y:.5},{level:0,x:.4,y:.5},{level:0,x:.6,y:.5}]);
 for(const id of [3,4,5])dropLantern(s,id,SKEWER,frame);dropLantern(s,1,PLATE,frame);const r=dropLantern(s,2,PLATE,frame);
 assert.equal(r.completed,true);assert.equal(r.stars,3);assert.equal(r.best,true);assert.deepEqual(s.journey.records[0],{stars:3,actions:5,score:s.score});assert.equal(totalStars(s),3);
});
test('solver runs earn at least one star and par is reachable in principle',()=>{
 for(let i=0;i<CHAPTERS.length;i++){const s=newLantern();s.journey.chapter=i;s.nextId=100;s.fruits=[];s.score=0;
  const seed=newLantern();Object.assign(s.journey,{chapter:i});s.fruits=[];s.discovered=[0];
  // reseed at this chapter
  s.journey.status='playing';s.journey.served={};for(const o of CHAPTERS[i].orders)s.journey.served[o.level]=0;
  s.fruits=CHAPTERS[i].start.map((level,k)=>({id:k+1,level,x:seed.fruits[k%seed.fruits.length].x,y:seed.fruits[k%seed.fruits.length].y}));
  solve(s,frame,400);assert.equal(s.journey.status,'celebrate',`chapter ${i}`);assert.ok(s.journey.actions<=CHAPTERS[i].par*3,`chapter ${i} took ${s.journey.actions} actions, par ${CHAPTERS[i].par}`);}
});
test('three-invitation saves continue into the new invitations',()=>{
 const old=newLantern();old.journey={version:1,chapter:2,completed:[0,1,2],served:{8:1},skewer:[],skewers:1,untilBasket:2,supply:4,actions:40,status:'complete'};
 const s=loadLantern(JSON.stringify(old));assert.equal(s.journey.version,2);assert.equal(s.journey.chapter,2);assert.equal(s.journey.status,'celebrate');assert.equal(nextChapter(s),true);assert.equal(chapter(s).guest,'Juniper');assert.equal(s.journey.status,'playing');
 const mid=newLantern();mid.journey={version:1,chapter:1,completed:[0],served:{3:1,5:0},skewer:[9],skewers:0,untilBasket:1,supply:2,actions:7,status:'playing'};
 const m=loadLantern(JSON.stringify(mid));assert.equal(m.journey.chapter,1);assert.deepEqual(m.journey.skewer,[9]);assert.equal(m.journey.status,'playing');assert.deepEqual(m.journey.records,{});
});
test('finished stories can revisit any invitation and return to the festival',()=>{
 const s=newLantern();assert.equal(replayChapter(s,1),false);
 Object.assign(s.journey,{chapter:LAST,status:'complete',story:true,completed:[0,1,2,3,4],records:{1:{stars:1,actions:40,score:300}}});
 assert.equal(replayChapter(s,1),true);assert.equal(s.journey.chapter,1);assert.equal(s.journey.replay,true);assert.equal(s.journey.actions,0);assert.deepEqual(loadLantern(JSON.stringify(s)),s);
 solve(s,frame);assert.equal(s.journey.status,'celebrate');assert.ok(s.journey.records[1].stars>=1);assert.ok(s.journey.records[1].actions<=40);
 assert.equal(nextChapter(s),true);assert.equal(s.journey.status,'complete');assert.equal(s.journey.chapter,LAST);assert.equal(s.journey.replay,false);assert.deepEqual(loadLantern(JSON.stringify(s)),s);
});

test('chains never eat a fruit the guest is still waiting for',()=>{
 // Pip wishes for strawberries: making one beside another keeps both instead of chaining to grapes
 const s=fixture([{level:0,x:.2,y:.3},{level:0,x:.5,y:.4},{level:1,x:.559,y:.4}]);
 const p=planLanternMerge(s,1,{x:.5,y:.4},frame);assert.equal(p.chain,1);assert.equal(p.level,1);assert.deepEqual(p.removed,[1,2]);
 s.journey.served[1]=2;assert.equal(planLanternMerge(s,1,{x:.5,y:.4},frame).chain,2);
});
test('a malformed skewer save repairs itself instead of stranding the chapter',()=>{
 const s=newLantern();s.journey.skewer=[0,0,0];s.journey.skewers=0;const l=loadLantern(JSON.stringify(s));assert.equal(l.journey.skewers,1);assert.deepEqual(l.journey.skewer,[]);
});
test('a revisit can be left early without touching records',()=>{
 const s=newLantern();Object.assign(s.journey,{chapter:LAST,status:'complete',story:true,completed:[0,1,2,3,4],records:{1:{stars:2,actions:14,score:300}}});
 assert.equal(leaveReplay(s),false);assert.equal(replayChapter(s,1),true);assert.equal(s.journey.replay,true);
 assert.equal(leaveReplay(s),true);assert.equal(s.journey.status,'complete');assert.equal(s.journey.chapter,LAST);assert.deepEqual(s.fruits,[]);assert.deepEqual(s.journey.records,{1:{stars:2,actions:14,score:300}});
 assert.deepEqual(loadLantern(JSON.stringify(s)),s);
});
test('v1 saves restart the pace counter instead of inheriting whole-story actions',()=>{
 const old=newLantern();old.score=2310;old.journey={version:1,chapter:2,completed:[0,1],served:{8:0},skewer:[],skewers:0,untilBasket:2,supply:4,actions:17,status:'playing'};
 const s=loadLantern(JSON.stringify(old));assert.equal(s.journey.actions,0);assert.equal(s.journey.startScore,2310);
});
test('finishing the story leaves a tidy cloth',()=>{
 const s=newLantern();Object.assign(s.journey,{chapter:LAST,status:'celebrate'});assert.equal(nextChapter(s),true);assert.equal(s.journey.status,'complete');assert.deepEqual(s.fruits,[]);
});

// Par is tuned so thoughtful play earns three stars and plain greedy play still earns two, on every
// board shape the game really uses. Asking the basket for fruit costs an action.
// Phones size the cloth to the space beside the HUD: portrait depths 8.8–11.8, landscape widths 9–14.
const FRAMES=[{width:14,depth:9.8},{width:14,depth:6.4},{width:7.4,depth:8.8},{width:7.4,depth:9.2},{width:7.4,depth:9.6},{width:7.4,depth:10.2},{width:7.4,depth:11.8},
 {width:9,depth:6.4},{width:10.4,depth:6.4},{width:12,depth:6.4}];
function greedy(i,frame){
 const s=newLantern();s.journey.chapter=i;seedChapter(s);
 for(let turn=0;turn<150&&s.journey.status==='playing';turn++){
  const c=chapter(s),wish=s.fruits.find(f=>needed(s,f.level)>0);if(wish){dropLantern(s,wish.id,PLATE,frame);continue;}
  const stick=s.fruits.find(f=>f.level===c.skewer);if(stick&&!s.journey.skewers){dropLantern(s,stick.id,SKEWER,frame);continue;}
  let merged=false;
  for(const f of s.fruits){for(const g of s.fruits){if(f.id===g.id||f.level!==g.level||nextItemLevel(f)===null)continue;if(planLanternMerge(s,f.id,g,frame)&&dropLantern(s,f.id,{x:g.x,y:g.y},frame).ok){merged=true;break;}}if(merged)break;}
  if(merged)continue;
  if(!tapBasket(s,frame).ok)dropLantern(s,s.fruits[0].id,PLATE,frame);
 }
 return s;
}
test('greedy play earns at least two stars on every real board shape, and tapping the basket costs an action',()=>{
 for(let i=0;i<CHAPTERS.length;i++)for(const frame of FRAMES){const s=greedy(i,frame);assert.equal(s.journey.status,'celebrate',`${CHAPTERS[i].guest} ${frame.width}x${frame.depth}`);assert.ok(s.journey.actions<=Math.ceil(CHAPTERS[i].par*1.5),`${CHAPTERS[i].guest} ${frame.width}x${frame.depth}: ${s.journey.actions} actions, par ${CHAPTERS[i].par}`);}
 const s=newLantern(),before=s.journey.actions;assert.equal(tapBasket(s,frame).ok,true);assert.equal(s.journey.actions,before+1);assert.equal(s.journey.untilBasket,3);
});


test('finale checkpoints survive reload and preserve older finished saves',()=>{
 const s=newLantern();Object.assign(s.journey,{chapter:LAST,status:'celebrate'});
 nextChapter(s);assert.equal(s.journey.finale,'pending');
 for(const step of ['pending','letter','seen']){
  s.journey.finale=step;
  const loaded=loadLantern(JSON.stringify(s));
  assert.equal(loaded.journey.status,'complete');assert.equal(loaded.journey.finale,step);
 }
 delete s.journey.finale;
 assert.equal(loadLantern(JSON.stringify(s)).journey.finale,'seen');
 const mid=newLantern();delete mid.journey.finale;
 assert.equal(loadLantern(JSON.stringify(mid)).journey.finale,'pending');
});
