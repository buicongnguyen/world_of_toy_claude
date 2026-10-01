export const PICNIC_SAVE_KEY='little-keepsakes-picnic-v1';
export const FRUITS=[
  {name:'Cherries',color:'#f72f85',radius:.40},
  {name:'Strawberry',color:'#ff4796',radius:.42},
  {name:'Grapes',color:'#9251f3',radius:.43,hasFace:false},
  {name:'Orange',color:'#ff941c',radius:.46},
  {name:'Lemon',color:'#ffdb19',radius:.47},
  {name:'Pear',color:'#26d6ac',radius:.49},
  {name:'Peach',color:'#ed79c2',radius:.52},
  {name:'Pineapple',color:'#ffc139',radius:.54,hasFace:false},
  {name:'Watermelon',color:'#25cfc3',radius:.68},
  {name:'Ruby apple',short:'Apple',color:'#ff4264',radius:.45},
  {name:'Twilight plum',short:'Plum',color:'#7562ec',radius:.50},
  {name:'Dragon fruit',short:'Dragon fruit',color:'#fc56bf',radius:.59,hasFace:false},
];
// Catalogue IDs stay stable so existing saved toys keep their identity.
// Progression is explicit: adding a fruit never renumbers a saved watermelon.
export const FRUIT_ORDER=[0,1,2,9,3,4,5,10,6,7,11,8];
export const WATERMELON=8;
export const SUPPLY=[0,1,2,9,3,4,5,10,6,7,11,2];
export const PICNIC_ITEMS=[
  {name:'Tiny bubble',short:'Tiny glow',color:'#73dced',radius:.29},
  {name:'Glow bubble',short:'Glow',color:'#b296ff',radius:.39},
  {name:'Lemonade',short:'Lemonade',color:'#ffe068',radius:.44},
  {name:'Picnic sandwich',short:'Sandwich',color:'#f0b06d',radius:.49},
  {name:'Dream teapot',short:'Teapot',color:'#c28cf0',radius:.57},
  {name:'Picnic hamper',short:'Hamper',color:'#eeb974',radius:.65},
];
export const BUBBLE_JAR={x:.40,y:.87};
export const family=item=>item?.kind==='picnic'?'picnic':'fruit';
export const catalogue=kind=>kind==='picnic'?PICNIC_ITEMS:FRUITS;
export const itemInfo=item=>catalogue(family(item))[item.level];
export const itemTier=item=>family(item)==='picnic'?item.level:FRUIT_ORDER.indexOf(item.level);
export const nextItemLevel=item=>family(item)==='picnic'?(item.level<PICNIC_ITEMS.length-1?item.level+1:null):(FRUIT_ORDER[itemTier(item)+1]??null);
export const allItems=state=>[...state.fruits,...(state.picnicItems||[])];
export const MAX_FRUITS=24;
export const PLATE={x:.73,y:.87};
export const BASKET={x:.14,y:.87};
export const DEFAULT_FRAME={width:14,depth:9.8};
export const GIFTS=[{at:3,name:'A flower for the table'},{at:8,name:'A very tiny tea party'},{at:15,name:'A picnic in bloom'}];
const START=[
  [0,.15,.18],[0,.31,.28],[1,.51,.16],[1,.72,.26],
  [2,.84,.15],[2,.15,.44],[3,.37,.48],[3,.64,.45],
  [4,.84,.55],[4,.53,.65],[5,.25,.66],[5,.86,.37],
];
export function newPicnic(){return{version:1,fruits:START.map(([level,x,y],i)=>({id:i+1,level,x,y})),picnicItems:[],picnicDiscovered:[0],bubbleWelcome:false,nextId:13,supplyIndex:0,score:0,merges:0,shared:0,kindness:0,picnics:0,discovered:[0,1,2,3,4,5],pip:{x:.91,y:.89},sound:false,reducedMotion:false};}
export function distance(a,b,frame=DEFAULT_FRAME){return Math.hypot((a.x-b.x)*frame.width,(a.y-b.y)*frame.depth);}
export function clampPoint(point,level,frame=DEFAULT_FRAME,kind='fruit'){const r=catalogue(kind)[level].radius+.07;return{x:Math.max(.045+r/frame.width,Math.min(.955-r/frame.width,point.x)),y:Math.max(.05+r/frame.depth,Math.min(.755-r/frame.depth,point.y))};}
export function findSpace(state,point,level,frame=DEFAULT_FRAME,ignore=[],kind='fruit'){
  const blocked=p=>allItems(state).some(f=>!ignore.includes(f.id)&&distance(f,p,frame)<itemInfo(f).radius+catalogue(kind)[level].radius+.035);
  const p=clampPoint(point,level,frame,kind);if(!blocked(p))return p;
  for(let radius=.14;radius<Math.max(frame.width,frame.depth);radius+=.14){for(let a=0;a<Math.PI*2;a+=.35){const q=clampPoint({x:p.x+Math.cos(a)*radius/frame.width,y:p.y+Math.sin(a)*radius/frame.depth},level,frame,kind);if(!blocked(q))return q;}}
  return null;
}
// The held fruit participates at its proposed drop position, never at its old spot.
// The dropped fruit must reach every member directly. This makes the middle of
// a pair or triangle meaningful; a remote chain cannot extend the group.
export function mergeGroup(state,id,point,frame=DEFAULT_FRAME){
  const fruit=allItems(state).find(f=>f.id===id);
  if(!fruit||nextItemLevel(fruit)===null||!Number.isFinite(point.x)||!Number.isFinite(point.y))return [];
  const held={...fruit,x:point.x,y:point.y};
  const candidates=allItems(state).filter(f=>f.id!==id&&f.level===fruit.level&&family(f)===family(fruit))
    .sort((a,b)=>distance(a,point,frame)-distance(b,point,frame)||a.id-b.id);
  const reach=itemInfo(fruit).radius*2+.16;
  const members=[held,...candidates.filter(candidate=>distance(held,candidate,frame)<=reach)];
  return members.length>=2?members:[];
}
export function mergeTarget(state,id,point,frame=DEFAULT_FRAME){return mergeGroup(state,id,point,frame)[1]??null;}
export function mergePlan(state,id,point,frame=DEFAULT_FRAME){
  const members=mergeGroup(state,id,point,frame);if(!members.length)return null;
  const level=nextItemLevel(members[0]),removed=members.map(f=>f.id),count=members.length,kind=family(members[0]);
  const position=findSpace(state,count>2?members[0]:members[1],level,frame,removed,kind);
  const baseReward=(itemTier({level,kind})+1)*10,multiplier=count-1;
  return{members,removed,count,level,kind,position,baseReward,multiplier,reward:baseReward*multiplier,bonus:baseReward*(count-2)};
}
export function nextFruit(state){return SUPPLY[state.supplyIndex%SUPPLY.length];}
export function additionMergePlan(state,point,frame=DEFAULT_FRAME,kind='fruit'){
  const held={id:state.nextId,level:kind==='picnic'?0:nextFruit(state),...point,...(kind==='picnic'?{kind}: {})};
  const key=kind==='picnic'?'picnicItems':'fruits';
  return mergePlan({...state,[key]:[...(state[key]||[]),held]},held.id,point,frame);
}
function applyMerge(state,plan){
  const{level,removed,count,reward,bonus,multiplier,kind}=plan,ids=new Set(removed),key=kind==='picnic'?'picnicItems':'fruits',discovery=kind==='picnic'?'picnicDiscovered':'discovered';
  state[key]=state[key].filter(f=>!ids.has(f.id));
  const merged={id:state.nextId++,level,...plan.position,...(kind==='picnic'?{kind}: {})};state[key].push(merged);
  const isNew=!state[discovery].includes(level);if(isNew){state[discovery].push(level);state[discovery].sort((a,b)=>a-b);}
  state.merges++;state.score+=reward;
  return{ok:true,type:'merge',fruit:merged,removed,count,reward,bonus,multiplier,isNew};
}
export function addFruit(state,point={x:.17,y:.65},frame=DEFAULT_FRAME,{merge=false}={}){
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return{ok:false};
  if(merge){
    const plan=additionMergePlan(state,point,frame);
    if(plan){
      if(!plan.position)return{ok:false,reason:'Move this group somewhere with a little more space.'};
      state.nextId++;state.supplyIndex++;
      return applyMerge(state,plan);
    }
  }
  if(allItems(state).length>=MAX_FRUITS)return{ok:false,reason:'A full little table! Combine something or share it with Pip.'};
  const level=nextFruit(state),p=findSpace(state,point,level,frame);if(!p)return{ok:false,reason:'Make a little room by merging or sharing a fruit.'};
  const fruit={id:state.nextId++,level,...p};state.fruits.push(fruit);state.supplyIndex++;return{ok:true,type:'add',fruit};
}
export function dropFruit(state,id,point,frame=DEFAULT_FRAME){
  const fruit=allItems(state).find(f=>f.id===id);if(!fruit||!Number.isFinite(point.x)||!Number.isFinite(point.y))return{ok:false};
  const kind=family(fruit),key=kind==='picnic'?'picnicItems':'fruits';
  if(distance(point,PLATE,frame)<1.03){
    const feast=kind==='fruit'&&fruit.level===WATERMELON,hamper=kind==='picnic'&&fruit.level===PICNIC_ITEMS.length-1;
    state[key]=state[key].filter(f=>f.id!==id);state.shared++;state.kindness+=itemTier(fruit)+1;const reward=(itemTier(fruit)+1)*5+(feast?100:hamper?80:0);state.score+=reward;if(feast||hamper)state.picnics++;
    return{ok:true,type:'share',fruit,reward,feast,hamper};
  }
  const plan=mergePlan(state,id,point,frame);
  if(plan){
    if(!plan.position)return{ok:false,reason:'Move this group somewhere with a little more space.'};
    return applyMerge(state,plan);
  }
  const p=findSpace(state,point,fruit.level,frame,[id],kind);if(!p)return{ok:false,reason:'There is no room here. Your toy is back where it was.'};
  if(distance(fruit,p,frame)<.015)return{ok:false};Object.assign(fruit,p);return{ok:true,type:'move',fruit};
}
export function addBubble(state,point={x:.43,y:.65},frame=DEFAULT_FRAME,{merge=false}={}){
 if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return{ok:false};
 if(merge){const plan=additionMergePlan(state,point,frame,'picnic');if(plan){if(!plan.position)return{ok:false,reason:'Move this group somewhere with a little more space.'};state.nextId++;return applyMerge(state,plan);}}
 if(allItems(state).length>=MAX_FRUITS)return{ok:false,reason:'The mat is full. Combine or share a toy to make room.'};
 const p=findSpace(state,point,0,frame,[],'picnic');if(!p)return{ok:false,reason:'Make a little room for a new bubble.'};
 const fruit={id:state.nextId++,kind:'picnic',level:0,...p};state.picnicItems.push(fruit);return{ok:true,type:'add',fruit};
}
export function introduceBubbles(state,frame=DEFAULT_FRAME){
 if(state.bubbleWelcome)return;state.bubbleWelcome=true;
 if(state.picnicItems.length)return;
 for(const point of [{x:.43,y:.3},{x:.6,y:.28}])addBubble(state,point,frame);
}
export function movePip(state,point){if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return{ok:false};state.pip={x:Math.max(.05,Math.min(.95,point.x)),y:Math.max(.08,Math.min(.95,point.y))};return{ok:true,type:'pip'};}
export function loadPicnic(raw){
  try{const data=JSON.parse(raw);if(data?.version!==1||!Array.isArray(data.fruits))return newPicnic();const state=newPicnic(),seen=new Set();state.fruits=[];
    for(const f of data.fruits.slice(0,MAX_FRUITS)){if(!Number.isSafeInteger(f?.id)||f.id<1||f.id>=1_000_000_000||seen.has(f.id)||!Number.isInteger(f.level)||f.level<0||f.level>=FRUITS.length||!Number.isFinite(f.x)||!Number.isFinite(f.y))continue;seen.add(f.id);state.fruits.push({id:f.id,level:f.level,x:Math.max(.045,Math.min(.955,f.x)),y:Math.max(.05,Math.min(.755,f.y))});}
    for(const f of (Array.isArray(data.picnicItems)?data.picnicItems:[]).slice(0,MAX_FRUITS-state.fruits.length)){if(!Number.isSafeInteger(f?.id)||f.id<1||f.id>=1_000_000_000||seen.has(f.id)||!Number.isInteger(f.level)||f.level<0||f.level>=PICNIC_ITEMS.length||!Number.isFinite(f.x)||!Number.isFinite(f.y))continue;seen.add(f.id);state.picnicItems.push({id:f.id,kind:'picnic',level:f.level,x:Math.max(.045,Math.min(.955,f.x)),y:Math.max(.05,Math.min(.755,f.y))});}
    state.picnicDiscovered=[...new Set([0,...(Array.isArray(data.picnicDiscovered)?data.picnicDiscovered:[]).filter(n=>Number.isInteger(n)&&n>=0&&n<PICNIC_ITEMS.length),...state.picnicItems.map(f=>f.level)])].sort((a,b)=>a-b);state.bubbleWelcome=data.bubbleWelcome===true;
    for(const key of ['score','merges','shared','kindness','picnics','supplyIndex'])state[key]=Number.isSafeInteger(data[key])&&data[key]>=0?Math.min(data[key],1_000_000):0;
    state.nextId=Math.max(Math.max(1,...allItems(state).map(f=>f.id))+1,Number.isSafeInteger(data.nextId)&&data.nextId<1_000_000_000?data.nextId:1);state.discovered=[...new Set([0,1,2,3,4,5,...(Array.isArray(data.discovered)?data.discovered:[]).filter(n=>Number.isInteger(n)&&n>=0&&n<FRUITS.length),...state.fruits.map(f=>f.level)])].sort((a,b)=>a-b);
    if(data.pip)movePip(state,data.pip);state.sound=data.sound===true;state.reducedMotion=data.reducedMotion===true;return state;
  }catch{return newPicnic();}
}
