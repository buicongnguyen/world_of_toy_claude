import test from 'node:test';
import assert from 'node:assert/strict';
import {newPicnic,dropFruit,addFruit,mergeTarget,mergePlan,additionMergePlan,findSpace,loadPicnic,FRUITS,FRUIT_ORDER,PLATE,MAX_FRUITS,distance} from '../src/picnic-game.js';
const frame={width:14,depth:9.8};
const pair=level=>({...newPicnic(),fruits:[{id:1,level,x:.3,y:.3},{id:2,level,x:.5,y:.3}],nextId:3});
test('each matching pair produces exactly one next fruit and one reward',()=>{for(let tier=0;tier<FRUIT_ORDER.length-1;tier++){const level=FRUIT_ORDER[tier];const s=pair(level);const result=dropFruit(s,1,s.fruits[1],frame);assert.equal(result.type,'merge');assert.equal(s.fruits.length,1);assert.equal(s.fruits[0].level,FRUIT_ORDER[tier+1]);assert.equal(s.score,(tier+2)*10);assert.equal(s.merges,1);assert.equal(dropFruit(s,1,{x:.5,y:.3},frame).ok,false);assert.equal(s.score,(tier+2)*10);}});
test('different fruit are repositioned without consuming or merging',()=>{const s=pair(0);s.fruits[1].level=1;const result=dropFruit(s,1,s.fruits[1],frame);assert.equal(result.type,'move');assert.equal(s.fruits.length,2);assert.equal(s.score,0);assert.ok(distance(s.fruits[0],s.fruits[1],frame)>=FRUITS[0].radius+FRUITS[1].radius);});
test('nearby matching fruit snap; a distant pair stays independent',()=>{let s=pair(0);assert.equal(mergeTarget(s,1,{x:.53,y:.31},frame).id,2);assert.equal(mergeTarget(s,1,{x:.7,y:.6},frame),null);assert.equal(dropFruit(s,1,{x:.7,y:.6},frame).type,'move');});
test('sharing removes one fruit, grows Pip, and final fruit has a single bonus',()=>{const s=pair(8);const result=dropFruit(s,1,PLATE,frame);assert.equal(result.type,'share');assert.equal(result.feast,true);assert.equal(s.score,160);assert.equal(s.kindness,12);assert.equal(s.picnics,1);assert.equal(s.shared,1);assert.equal(s.fruits.length,1);assert.equal(dropFruit(s,1,PLATE,frame).ok,false);assert.equal(s.score,160);});
test('highest fruits do not disappear when placed together',()=>{const s=pair(8);assert.equal(dropFruit(s,1,s.fruits[1],frame).type,'move');assert.equal(s.fruits.length,2);assert.equal(s.score,0);});
test('basket supplies predictable fruit, respects capacity, and consumes no currency',()=>{const s=newPicnic();const before=s.score;while(s.fruits.length<MAX_FRUITS)assert.equal(addFruit(s,{x:.4,y:.4},frame).ok,true);const snapshot=structuredClone(s);assert.equal(addFruit(s).ok,false);assert.deepEqual(s,snapshot);assert.equal(s.score,before);assert.equal(s.fruits.length,MAX_FRUITS);});
test('invalid and out-of-bounds drops cannot destroy or strand fruit',()=>{const s=pair(3);assert.equal(dropFruit(s,1,{x:NaN,y:2}).ok,false);const result=dropFruit(s,1,{x:-10,y:20},frame);assert.equal(result.ok,true);assert.ok(result.fruit.x>0&&result.fruit.x<1);assert.ok(result.fruit.y>0&&result.fruit.y<.755);assert.equal(s.fruits.length,2);});
test('portrait placement fits all starting fruit and supports merging',()=>{const s=newPicnic(),portrait={width:7.4,depth:11.8};for(const f of s.fruits)assert.ok(findSpace(s,f,f.level,portrait,[f.id]));const target=s.fruits.find(f=>f.level===5);const other=s.fruits.find(f=>f.level===5&&f.id!==target.id);assert.equal(dropFruit(s,other.id,target,portrait).type,'merge');});
test('saved picnic recovers malformed fields without touching the attic schema',()=>{assert.deepEqual(loadPicnic('not-json'),newPicnic());assert.deepEqual(loadPicnic('{"version":1,"collected":[]}'),newPicnic());const s=pair(2);dropFruit(s,1,s.fruits[1],frame);const loaded=loadPicnic(JSON.stringify(s));assert.deepEqual(loaded.fruits,s.fruits);assert.equal(loaded.score,s.score);const bad=loadPicnic(JSON.stringify({version:1,fruits:[{id:1,level:99,x:0,y:0},{id:2,level:3,x:99,y:-20},{id:2,level:4,x:.4,y:.4}],score:-5,kindness:'8'}));assert.equal(bad.fruits.length,1);assert.equal(bad.score,0);assert.equal(bad.kindness,0);assert.ok(bad.fruits[0].x<1&&bad.fruits[0].y>0);});

function formation(count,dimensions=frame){
 const center={x:.5,y:.4},state={...newPicnic(),fruits:[{id:1,level:0,x:.12,y:.12}],nextId:count+1};
 for(let i=0;i<count-1;i++){const angle=i*Math.PI*2/(count-1);state.fruits.push({id:i+2,level:0,x:center.x+Math.cos(angle)*.84/dimensions.width,y:center.y+Math.sin(angle)*.84/dimensions.depth});}
 return{state,center};
}
test('third in the gap and fourth in the triangle earn larger rewards on both surfaces',()=>{
 for(const dimensions of [frame,{width:7.4,depth:11.8}])for(const count of [3,4,5]){
  const{state,center}=formation(count,dimensions);
  for(const f of state.fruits.slice(1))assert.equal(mergePlan(state,f.id,f,dimensions),null,'outer fruit must stay separate while being arranged');
  const before=structuredClone(state),plan=mergePlan(state,1,center,dimensions);assert.deepEqual(state,before,'preview must not change anything');
  assert.equal(plan.count,count);assert.equal(plan.reward,20*(count-1));
  const result=dropFruit(state,1,center,dimensions);assert.equal(result.count,count);assert.equal(result.reward,plan.reward);assert.equal(result.bonus,20*(count-2));assert.equal(state.fruits.length,1);assert.equal(state.fruits[0].level,1);assert.equal(state.merges,1);
  const complete=structuredClone(state);assert.equal(dropFruit(state,1,center,dimensions).ok,false);assert.deepEqual(state,complete);
 }
});
test('off-center placement and remote chains cannot receive the center bonus',()=>{
 const{state,center}=formation(3);state.fruits.push({id:8,level:0,x:center.x+1.68/frame.width,y:center.y});state.nextId=9;
 assert.equal(mergePlan(state,1,center,frame).count,3,'remote fruit touches a neighbor but cannot reach the dropped fruit');
 assert.equal(mergePlan(state,1,{x:center.x+.5/frame.width,y:center.y},frame).count,2,'moving away from the middle only reaches one outer fruit');
 const result=dropFruit(state,1,center,frame);assert.equal(result.count,3);assert.ok(state.fruits.some(f=>f.id===8));
});
test('old held position and mixed types cannot bridge a combo',()=>{
 const{state,center}=formation(3);state.fruits.push({id:8,level:0,x:.13,y:.13},{id:9,level:1,...center});state.nextId=10;
 const plan=mergePlan(state,1,center,frame);assert.deepEqual(new Set(plan.removed),new Set([1,2,3]));assert.equal(plan.count,3);
});
test('a fruit dragged from the basket can complete a group as one action',()=>{
 const{state,center}=formation(3);state.fruits=state.fruits.filter(f=>f.id!==1);const before=structuredClone(state);
 const plan=additionMergePlan(state,center,frame);assert.equal(plan.count,3);assert.deepEqual(state,before);
 const result=addFruit(state,center,frame,{merge:true});assert.equal(result.type,'merge');assert.equal(result.count,3);assert.equal(state.score,40);assert.equal(state.supplyIndex,1);assert.equal(state.fruits.length,1);
 const saved=loadPicnic(JSON.stringify(state));assert.equal(saved.score,40);assert.deepEqual(saved.fruits,state.fruits);
});


test('expanded fruit chain keeps legacy save identities and merges all new fruits',()=>{
 const names=['Cherries','Strawberry','Grapes','Orange','Lemon','Pear','Peach','Pineapple','Watermelon'];
 const old=newPicnic();old.fruits=names.map((_,level)=>({id:level+1,level,x:.2+(level%3)*.25,y:.15+Math.floor(level/3)*.22}));old.score=731;old.discovered=names.map((_,i)=>i);
 const restored=loadPicnic(JSON.stringify(old));assert.equal(restored.score,731);assert.deepEqual(restored.fruits.map(f=>FRUITS[f.level].name),names);
 assert.equal(new Set(FRUIT_ORDER).size,12);assert.deepEqual([...FRUIT_ORDER].sort((a,b)=>a-b),FRUITS.map((_,i)=>i));
 for(const [from,to]of [[2,9],[9,3],[5,10],[10,6],[7,11],[11,8]])for(const count of [2,3,4]){
  const state=pair(from),center={x:.5,y:.35};state.fruits=[{id:1,level:from,x:.1,y:.1}];
  for(let i=0;i<count-1;i++){const a=i*Math.PI*2/(count-1);state.fruits.push({id:i+2,level:from,x:center.x+Math.cos(a)*.06,y:center.y+Math.sin(a)*.07});}state.nextId=count+1;
  const result=dropFruit(state,1,center,frame);assert.equal(result.count,count);assert.equal(result.fruit.level,to);assert.equal(result.reward,(FRUIT_ORDER.indexOf(to)+1)*10*(count-1));assert.deepEqual(loadPicnic(JSON.stringify(state)).fruits,state.fruits);
 }
});
