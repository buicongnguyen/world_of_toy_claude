import {FRUITS,FRUIT_ORDER,newPicnic,loadPicnic,findSpace,distance,mergeGroup,nextItemLevel,itemTier,PLATE,DEFAULT_FRAME} from './picnic-game.js';
import {newShop,loadShop} from './lantern-shop.js';
export const LANTERN_SAVE='little-keepsakes-lantern-v1';
export const SKEWER={x:.43,y:.86};
// Five invitations across one evening. `par` is the number of actions a planning player needs:
// the best of several hundred rollouts on the hardest real board shape (desktop, landscape and
// three phone depths), plus one. Asking the basket for fruit costs an action; automatic deliveries
// are free. Greedy play lands on two stars; three stars reward thinking ahead.
export const CHAPTERS=[
 {guest:'Pip',model:'pip',time:'afternoon',title:'A little light for Pip',line:'“I kept a place for you. Shall we make something sweet?”',wish:'A berry welcome',orders:[{level:1,count:2}],skewer:0,keepsake:'The first lantern',par:8,supply:[0,0,0,1,0,0,2,2,0,0,1,1],start:[0,0,0,0,0,0,2,2,3,3]},
 {guest:'Momo',model:'momo',time:'golden',title:'A seat for someone new',line:'“I followed the light. Is there room for one more?”',wish:'A taste of sunshine',orders:[{level:3,count:2},{level:5,count:1}],skewer:9,keepsake:'A pot of moonflower tea',par:9,supply:[9,9,9,3,3,4,4,5,9,9,2,2],start:[9,9,9,9,2,2,2,2,4,4,4,4]},
 {guest:'Nori',model:'nori',time:'sunset',title:'The lanterns we share',line:'“The clearing used to be so quiet. Look at it now.”',wish:'A moonlit feast',orders:[{level:8,count:1}],skewer:6,keepsake:'Nori’s paper bunting',par:9,supply:[6,6,6,7,7,10,10,6,6,7,7,11],start:[6,6,6,6,7,7,10,10,5,5,10,10]},
 {guest:'Juniper',model:'juniper',time:'dusk',title:'Stories after sundown',line:'“Hoo! I saw your lanterns from the old oak. Will you stay for a story?”',wish:'A storyteller’s supper',orders:[{level:4,count:2},{level:10,count:1}],skewer:5,keepsake:'Juniper’s storybook',par:10,supply:[4,4,3,3,5,4,4,3,3,9,9,5],start:[4,4,4,4,5,5,3,3,3,3,9,9]},
 {guest:'Bramble',model:'bramble',time:'night',title:'The festival of little lights',line:'“I’m a little shy… but I brought a lantern of my own.”',wish:'A festival feast',orders:[{level:11,count:1},{level:7,count:1}],skewer:10,keepsake:'A sky full of lanterns',par:11,supply:[10,10,6,5,5,10,6,6,4,10,10,6],start:[10,10,10,10,10,10,6,6,5,5,4,4]}
];
export const LAST=CHAPTERS.length-1;
const plural=f=>{const n=(f.short||f.name).toLowerCase();return /s$/.test(n)?n:/(ch|sh)$/.test(n)?n+'es':n+'s';};
const START_POINTS=[[.23,.22],[.39,.23],[.62,.23],[.79,.23],[.25,.44],[.43,.46],[.64,.45],[.81,.44],[.28,.65],[.48,.64],[.67,.64],[.82,.65]];
export const chapter=s=>CHAPTERS[s.journey.chapter];
export const isComplete=s=>s.journey.status==='complete';
export function starsFor(index,actions){const par=CHAPTERS[index].par;return actions<=par?3:actions<=Math.ceil(par*1.5)?2:1;}
export function seedChapter(s){s.fruits=chapter(s).start.map((level,i)=>({id:s.nextId++,level,x:START_POINTS[i][0],y:START_POINTS[i][1]}));s.journey.served=Object.fromEntries(chapter(s).orders.map(o=>[o.level,0]));s.journey.skewer=[];s.journey.skewers=0;s.journey.untilBasket=3;s.journey.supply=0;s.journey.actions=0;s.journey.startScore=s.score;s.journey.status='playing';s.fruits.forEach(f=>{if(!s.discovered.includes(f.level))s.discovered.push(f.level);});}
export function newLantern(){const s=newPicnic();s.fruits=[];s.nextId=1;s.bubbleWelcome=true;s.picnicItems=[];s.discovered=[0,2,3];s.journey={version:2,chapter:0,completed:[],served:{},skewer:[],skewers:0,untilBasket:3,supply:0,actions:0,startScore:0,status:'playing',records:{},replay:false,story:false,finale:'pending',outro:'seen'};s.shop=newShop();seedChapter(s);return s;}
/** Re-seat every fruit on a board of a new shape: biggest first, each on the nearest free spot. */
export function settleFruits(s,frame=DEFAULT_FRAME){const placed={fruits:[],picnicItems:[]};let moved=false;for(const f of [...s.fruits].sort((a,b)=>FRUITS[b.level].radius-FRUITS[a.level].radius||a.id-b.id)){const p=findSpace(placed,f,f.level,frame);if(p&&(p.x!==f.x||p.y!==f.y)){Object.assign(f,p);moved=true;}placed.fruits.push(f);}return moved;}
export function nextSupply(s){return Array.from({length:3},(_,i)=>chapter(s).supply[(s.journey.supply+i)%chapter(s).supply.length]);}
export function needed(s,level){const order=chapter(s).orders.find(o=>o.level===level);return order?Math.max(0,order.count-(s.journey.served[level]||0)):0;}
export function protectedLevel(s,level){return needed(s,level)>0||(s.journey.skewers===0&&level===chapter(s).skewer);}
export function satisfied(s){return chapter(s).orders.every(o=>(s.journey.served[o.level]||0)>=o.count)&&s.journey.skewers>=1;}
export function basket(s,frame=DEFAULT_FRAME){
 if(s.journey.status!=='playing')return{ok:false};
 const spawned=[];
 for(let i=0;i<3;i++){
  if(s.fruits.length>=22)break;
  const level=chapter(s).supply[s.journey.supply%chapter(s).supply.length],p=findSpace(s,{x:.18+(i*.13),y:.64},level,frame);
  if(!p)break;const f={id:s.nextId++,level,...p};s.fruits.push(f);spawned.push(f);s.journey.supply++;if(!s.discovered.includes(level))s.discovered.push(level);
 }
 if(!spawned.length)return{ok:false,reason:'Make a little room by merging or serving fruit.'};
 s.journey.untilBasket=3;return{ok:true,type:'basket',spawned};
}
/** The player asks the basket for fruit: a real choice, so it spends one action (automatic deliveries are free). */
export function tapBasket(s,frame=DEFAULT_FRAME){
 const r=basket(s,frame);if(r.ok){s.journey.actions++;r.counted=true;}return r;
}
function finish(s,result,frame){
 const j=s.journey;j.actions++;j.untilBasket--;
 if(satisfied(s)){
  j.status='celebrate';if(!j.replay)j.outro='pending';if(!j.completed.includes(j.chapter))j.completed.push(j.chapter);s.score+=150;result.reward=(result.reward||0)+150;result.completed=true;j.skewer=[];
  const stars=starsFor(j.chapter,j.actions),best=j.records[j.chapter],earned=s.score-j.startScore;
  result.stars=stars;result.best=!best||stars>best.stars||(stars===best.stars&&j.actions<best.actions);result.improved=!!best&&result.best;result.firstThree=stars===3&&(best?.stars||0)<3;
  j.records[j.chapter]={stars:Math.max(stars,best?.stars||0),actions:best?Math.min(best.actions,j.actions):j.actions,score:Math.max(earned,best?.score||0)};
  return result;
 }
 if(j.untilBasket<=0||s.fruits.length===0){const b=basket(s,frame);result.spawned=b.spawned||[];if(!b.ok)j.untilBasket=0;}
 return result;
}
export function planLanternMerge(s,id,point,frame=DEFAULT_FRAME){
 if(s.journey.status!=='playing')return null;
 const group=mergeGroup(s,id,point,frame);if(!group.length)return null;
 const original=group[0].level,removed=group.map(f=>f.id),count=group.length,anchor=count===2?group[1]:point;
 let level=nextItemLevel(group[0]),reward=(itemTier({level})+1)*10*(count-1),chain=1;
 const rest={...s,fruits:s.fruits.filter(f=>!removed.includes(f.id)),picnicItems:[]};
 // Only the active result chains. Extra outputs from this gesture cannot eat each other.
 while(nextItemLevel({level})!==null){
  // A chain never eats a fruit the guest is still waiting for, or the open skewer's fruit.
  if(protectedLevel(s,level))break;
  const match=rest.fruits.filter(f=>f.level===level&&distance(f,anchor,frame)<FRUITS[level].radius*2+.12).sort((a,b)=>distance(a,anchor,frame)-distance(b,anchor,frame)||a.id-b.id)[0];
  if(!match)break;removed.push(match.id);rest.fruits=rest.fruits.filter(f=>f.id!==match.id);level=nextItemLevel({level});chain++;reward+=(itemTier({level})+1)*10;
 }
 const position=findSpace(rest,anchor,level,frame);if(!position)return null;
 const outputs=[{level,...position}];rest.fruits.push({id:-1,...outputs[0]});
 // Easter egg: a center combo blooms. Three fruit give two upgrades and four give three
 // (always one fewer than merged); the extra upgrades are a bonus beyond the fruit put in.
 const extras=Array.from({length:count-2},()=>nextItemLevel({level:original}));
 for(const extra of extras){const p=findSpace(rest,group.at(-1),extra,frame);if(!p)return null;const out={level:extra,...p};outputs.push(out);rest.fruits.push({id:-outputs.length,...out});}
 return{type:'merge',kind:'fruit',level,count,chain,reward,bonus:extras.length,position,members:[...group,...s.fruits.filter(f=>removed.includes(f.id)&&!group.some(g=>g.id===f.id))],removed,outputs};
}
export function previewLantern(s,id,point,frame=DEFAULT_FRAME){
 const f=s.fruits.find(f=>f.id===id);if(!f||s.journey.status!=='playing')return null;
 if(distance(point,PLATE,frame)<1.0)return{type:needed(s,f.level)?'serve':'share',point:PLATE,level:f.level,reward:needed(s,f.level)?60:0};
 if(distance(point,SKEWER,frame)<1.03)return{type:f.level===chapter(s).skewer&&s.journey.skewers===0?'skewer':'wrong-skewer',point:SKEWER,level:chapter(s).skewer,count:s.journey.skewer.length+1};
 const plan=planLanternMerge(s,id,point,frame);return plan?{...plan,point:plan.position}:null;
}
export function dropLantern(s,id,point,frame=DEFAULT_FRAME){
 const f=s.fruits.find(f=>f.id===id);if(!f||s.journey.status!=='playing'||!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return{ok:false};
 const target=previewLantern(s,id,point,frame);
 if(target?.type==='wrong-skewer')return{ok:false,reasonCode:s.journey.skewers?'skewer-served':'skewer-fruit',level:chapter(s).skewer,reason:s.journey.skewers?'Your skewer is already served. Follow the plate wish.':`This skewer needs three ${plural(FRUITS[chapter(s).skewer])}.`};
 if(target?.type==='serve'||target?.type==='share'){
  s.fruits=s.fruits.filter(a=>a.id!==id);s.shared++;const reward=target.type==='serve'?60:0;if(reward)s.journey.served[f.level]=(s.journey.served[f.level]||0)+1;s.score+=reward;
  return finish(s,{ok:true,type:target.type,fruit:f,reward},frame);
 }
 if(target?.type==='skewer'){
  s.fruits=s.fruits.filter(a=>a.id!==id);s.journey.skewer.push(f.level);let reward=0,served=false;
  if(s.journey.skewer.length>=3){s.journey.skewers=1;served=true;reward=120;s.score+=reward;}
  return finish(s,{ok:true,type:'skewer',fruit:f,reward,served},frame);
 }
 if(target?.type==='merge'){
  s.fruits=s.fruits.filter(a=>!target.removed.includes(a.id));const outputs=target.outputs.map(out=>({id:s.nextId++,...out}));s.fruits.push(...outputs);s.score+=target.reward;s.merges++;
  outputs.forEach(out=>{if(!s.discovered.includes(out.level))s.discovered.push(out.level);});
  return finish(s,{...target,ok:true,fruit:outputs[0],outputs},frame);
 }
 const position=findSpace(s,point,f.level,frame,[id]);if(!position||distance(f,position,frame)<.015)return{ok:false};Object.assign(f,position);return{ok:true,type:'move',fruit:f};
}
export function nextChapter(s){
 const j=s.journey;if(j.status!=='celebrate')return false;
 // A revisited picnic returns to the finished story.
 if(j.replay){j.replay=false;j.chapter=LAST;j.status='complete';j.story=true;s.fruits=[];j.served=Object.fromEntries(CHAPTERS[LAST].orders.map(o=>[o.level,o.count]));j.skewer=[];j.skewers=1;return true;}
 if(j.chapter===LAST){j.status='complete';j.story=true;j.finale='pending';s.fruits=[];return true;}
 j.chapter++;seedChapter(s);return true;
}
/** Leave a revisit early: back to the finished festival, records untouched. */
export function leaveReplay(s){
 const j=s.journey;if(!j.replay)return false;
 j.replay=false;j.chapter=LAST;j.status='complete';j.story=true;s.fruits=[];j.served=Object.fromEntries(CHAPTERS[LAST].orders.map(o=>[o.level,o.count]));j.skewer=[];j.skewers=1;j.actions=0;return true;
}
/** After the story, any invitation can be revisited to earn more stars. */
export function replayChapter(s,index){
 const j=s.journey;if(!j.story||!CHAPTERS[index]||j.status==='playing'&&!j.replay)return false;
 j.chapter=index;j.replay=true;seedChapter(s);return true;
}
export function totalStars(s){return Object.values(s.journey.records||{}).reduce((n,r)=>n+(r?.stars||0),0);}
/** True when this build can read the save; anything else is backed up before a fresh story replaces it. */
export function readableSave(raw){try{const d=JSON.parse(raw),j=d?.journey;return d?.version===1&&[1,2].includes(j?.version)&&Number.isInteger(j.chapter)&&j.chapter>=0&&j.chapter<CHAPTERS.length;}catch{return false;}}
export function loadLantern(raw){
 try{
  if(!readableSave(raw))return newLantern();
  const data=JSON.parse(raw),j=data.journey;
  const s=loadPicnic(JSON.stringify({...data,fruits:Array.isArray(data.fruits)?data.fruits:[]}));s.picnicItems=[];s.bubbleWelcome=true;s.discovered=[...new Set((Array.isArray(data.discovered)?data.discovered:[]).filter(l=>Number.isInteger(l)&&FRUITS[l]))];s.fruits.forEach(f=>{if(!s.discovered.includes(f.level))s.discovered.push(f.level);});
  const safe=(v,max=1e6)=>Number.isSafeInteger(v)&&v>=0?Math.min(v,max):0;
  const records={};
  if(j.records&&typeof j.records==='object')for(const [k,r]of Object.entries(j.records)){const i=Number(k);if(CHAPTERS[i]&&r&&[1,2,3].includes(r.stars))records[i]={stars:r.stars,actions:safe(r.actions,9999),score:safe(r.score)};}
  const story=j.version===2&&j.story===true;
  // Older finished saves stay finished; the festival button can replay their missing ending.
  const finale=['pending','letter','seen'].includes(j.finale)?j.finale:story?'seen':'pending';
  const outro=j.outro==='pending'?'pending':'seen';
  const v1=j.version===1;
  s.journey={version:2,chapter:j.chapter,completed:[...new Set((Array.isArray(j.completed)?j.completed:[]).filter(v=>Number.isInteger(v)&&v>=0&&v<CHAPTERS.length&&(story||v<=j.chapter)))],served:{},skewer:[],skewers:safe(j.skewers,1),untilBasket:safe(j.untilBasket,3),supply:safe(j.supply),actions:v1?0:safe(j.actions),startScore:v1?s.score:Math.min(safe(j.startScore),s.score),status:'playing',records,replay:j.version===2&&j.replay===true&&story,story,finale,outro};
  for(const o of chapter(s).orders)s.journey.served[o.level]=safe(j.served?.[o.level],o.count);
  s.journey.skewer=(Array.isArray(j.skewer)?j.skewer:[]).filter(v=>v===chapter(s).skewer).slice(0,3);
  if(s.journey.skewer.length>=3||s.journey.skewers){s.journey.skewers=1;s.journey.skewer=[];}
  if(j.version===2&&j.status==='complete'&&story&&!s.journey.replay)s.journey.status='complete';
  else if(satisfied(s)){
   // Saves from the three-invitation release end at Nori; they continue to the new invitations.
   s.journey.status='celebrate';if(!s.journey.completed.includes(j.chapter))s.journey.completed.push(j.chapter);
  }
  s.shop=loadShop(data.shop,s.score);
  return s;
 }catch{return newLantern();}
}
