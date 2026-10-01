import {FRUITS,WATERMELON,itemTier,nextItemLevel,PLATE,newPicnic,loadPicnic,distance} from './picnic-game.js';

export const CHALLENGE_SAVE_KEY='little-keepsakes-picnic-challenge-v1';
export const GRID={cols:5,rows:5,left:.085,top:.08,width:.83,height:.66};
export const GOAL=2;
export const DROP_EVERY=3;
export const DROP_COUNT=3;
// Paired deliveries are predictable and include higher fruit to keep a round short.
export const CHALLENGE_SUPPLY=[9,9,10,10,6,6,7,7,11,11,5,5];
export const isChallenge=state=>state.challenge?.version===1;
export function cellPoint(cell){return{x:GRID.left+(cell%GRID.cols+.5)*GRID.width/GRID.cols,y:GRID.top+(Math.floor(cell/GRID.cols)+.5)*GRID.height/GRID.rows};}
export function cellAt(point){
 if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||point.x<GRID.left||point.x>=GRID.left+GRID.width||point.y<GRID.top||point.y>=GRID.top+GRID.height)return null;
 return Math.floor((point.y-GRID.top)/GRID.height*GRID.rows)*GRID.cols+Math.floor((point.x-GRID.left)/GRID.width*GRID.cols);
}
export function neighbors(cell){const col=cell%GRID.cols,row=Math.floor(cell/GRID.cols);return [col>0?cell-1:null,col<GRID.cols-1?cell+1:null,row>0?cell-GRID.cols:null,row<GRID.rows-1?cell+GRID.cols:null].filter(n=>n!==null);}
export function newChallenge(){
 const state=newPicnic(),cells=[0,4,6,8,10,14,16,18,20,24,2,22];
 state.fruits=state.fruits.map((fruit,i)=>({...fruit,cell:cells[i],...cellPoint(cells[i])}));
 state.picnicItems=[];state.bubbleWelcome=true;
 state.challenge={version:1,turns:0,untilDrop:DROP_EVERY,pending:[],harvested:0,status:'playing',rng:20260922};
 return state;
}
export function upcomingFruit(state){return state.challenge.pending.length?[...state.challenge.pending]:Array.from({length:DROP_COUNT},(_,i)=>CHALLENGE_SUPPLY[(state.supplyIndex+i)%CHALLENGE_SUPPLY.length]);}
export function emptyCells(state){const occupied=new Set(state.fruits.map(f=>f.cell));return Array.from({length:GRID.cols*GRID.rows},(_,i)=>i).filter(i=>!occupied.has(i));}
export function challengePlan(state,id,point){
 if(state.challenge.status!=='playing')return null;
 const fruit=state.fruits.find(f=>f.id===id),cell=cellAt(point);
 if(!fruit||cell===null||cell===fruit.cell||nextItemLevel(fruit)===null)return null;
 const rest=state.fruits.filter(f=>f.id!==id),occupant=rest.find(f=>f.cell===cell);
 if(occupant&&occupant.level!==fruit.level)return null;
 const nearby=new Set([cell,...neighbors(cell)]),matches=rest.filter(f=>f.level===fruit.level&&nearby.has(f.cell));
 if(!matches.length)return null;
 const position={cell,...cellPoint(cell)},members=[{...fruit,...position},...matches],count=members.length,level=nextItemLevel(fruit),baseReward=(itemTier({level})+1)*10;
 return{members,removed:members.map(f=>f.id),count,level,kind:'fruit',position,baseReward,multiplier:count-1,reward:baseReward*(count-1),bonus:baseReward*(count-2)};
}
function takeCell(state,cells){state.challenge.rng=(Math.imul(state.challenge.rng,1664525)+1013904223)>>>0;return cells[Math.floor(state.challenge.rng/4294967296*cells.length)];}
function finishTurn(state,result){
 const c=state.challenge;c.turns++;result.spawned=[];
 if(c.harvested>=GOAL){c.harvested=GOAL;c.status='won';c.pending=[];result.won=true;return result;}
 // Waiting fruit are delivered first. The next three-turn countdown starts only
 // once the whole previous delivery has landed, so a crowded mat cannot snowball.
 if(!c.pending.length){c.untilDrop--;if(c.untilDrop===0||!state.fruits.length){c.pending=upcomingFruit(state);state.supplyIndex+=DROP_COUNT;c.untilDrop=DROP_EVERY;result.delivery=true;result.emptyRefill=!state.fruits.length;}}
 while(c.pending.length){const free=emptyCells(state);if(!free.length)break;const cell=takeCell(state,free),level=c.pending.shift(),fruit={id:state.nextId++,level,cell,...cellPoint(cell)};state.fruits.push(fruit);result.spawned.push(fruit);if(!state.discovered.includes(level)){state.discovered.push(level);state.discovered.sort((a,b)=>a-b);}}
 result.waiting=c.pending.length;return result;
}
export function dropChallenge(state,id,point,frame){
 const c=state.challenge;
 if(c.status!=='playing')return{ok:false,reason:'Picnic complete! Start a new challenge or undo your last move.'};
 const fruit=state.fruits.find(f=>f.id===id);
 if(!fruit||!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return{ok:false};
 if(distance(point,PLATE,frame)<.82){state.fruits=state.fruits.filter(f=>f.id!==id);state.shared++;state.kindness+=itemTier(fruit)+1;const reward=(itemTier(fruit)+1)*5;state.score+=reward;return finishTurn(state,{ok:true,type:'share',fruit,reward});}
 const cell=cellAt(point);
 if(cell===null)return{ok:false,reason:'Drop on the open cloth above the basket, or share on Pip’s plate.'};
 if(cell===fruit.cell)return{ok:false};
 const plan=challengePlan(state,id,point);
 if(plan){
  const removed=new Set(plan.removed);state.fruits=state.fruits.filter(f=>!removed.has(f.id));
  const merged={id:state.nextId++,level:plan.level,...plan.position};
  const harvested=merged.level===WATERMELON;
  if(harvested){c.harvested++;state.picnics++;}else state.fruits.push(merged);
  const isNew=!state.discovered.includes(merged.level);if(isNew){state.discovered.push(merged.level);state.discovered.sort((a,b)=>a-b);}
  state.merges++;state.score+=plan.reward;
  return finishTurn(state,{...plan,ok:true,type:'merge',fruit:merged,isNew,harvested});
 }
 if(state.fruits.some(f=>f.cell===cell))return{ok:false,reason:'That spot holds a different fruit. Choose an open spot or a match.'};
 Object.assign(fruit,{cell,...cellPoint(cell)});return finishTurn(state,{ok:true,type:'move',fruit});
}
export function loadChallenge(raw){
 try{
  const data=JSON.parse(raw),c=data?.challenge;
  if(data?.version!==1||c?.version!==1||!Array.isArray(data.fruits))return newChallenge();
  const state=loadPicnic(raw),ids=new Set(),cells=new Set();state.fruits=[];
  for(const f of data.fruits){
   if(state.fruits.length>=GRID.cols*GRID.rows)break;
   if(!Number.isSafeInteger(f?.id)||f.id<1||f.id>=1_000_000_000||ids.has(f.id)||!Number.isInteger(f.cell)||f.cell<0||f.cell>=GRID.cols*GRID.rows||cells.has(f.cell)||!Number.isInteger(f.level)||f.level<0||f.level>=FRUITS.length||f.level===WATERMELON)continue;
   ids.add(f.id);cells.add(f.cell);state.fruits.push({id:f.id,level:f.level,cell:f.cell,...cellPoint(f.cell)});
  }
  const int=(value,fallback,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max?value:fallback;
  const harvested=int(c.harvested,0,0,GOAL);
  state.challenge={version:1,turns:int(c.turns,0,0,1_000_000),untilDrop:int(c.untilDrop,DROP_EVERY,1,DROP_EVERY),pending:harvested===GOAL?[]:(Array.isArray(c.pending)?c.pending:[]).filter(n=>Number.isInteger(n)&&n>=0&&n<FRUITS.length&&n!==WATERMELON).slice(0,DROP_COUNT),harvested,status:harvested===GOAL?'won':'playing',rng:int(c.rng,20260922,0,4294967295)};
  state.picnicItems=[];state.bubbleWelcome=true;state.nextId=Math.max(state.nextId,...state.fruits.map(f=>f.id+1),1);
  state.discovered=[...new Set([...state.discovered,...state.fruits.map(f=>f.level),...(harvested?[WATERMELON]:[])])].sort((a,b)=>a-b);
  return state;
 }catch{return newChallenge();}
}
