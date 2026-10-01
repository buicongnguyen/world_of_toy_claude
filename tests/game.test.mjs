import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,collect,restore,buyDecoration,claimBonus,loadGame,levelFor,TREASURES,RESTORATIONS,DECORATIONS} from '../src/game.js';

test('chapter can be finished, decorated, and saved without grinding',()=>{
  const state=newGame();
  for(let chapter=0;chapter<3;chapter++){
    for(const t of TREASURES.slice(chapter*3,chapter*3+3))assert.equal(collect(state,t.id).ok,true);
    assert.equal(restore(state,RESTORATIONS[chapter].id).ok,true);
  }
  assert.equal(state.thread,0);assert.equal(state.coins,105);assert.equal(state.xp,132);
  assert.equal(levelFor(state.xp).index,3);assert.equal(claimBonus(state).ok,true);
  for(const d of DECORATIONS)assert.equal(buyDecoration(state,d.id).ok,true);
  assert.equal(state.coins,70);assert.deepEqual(loadGame(JSON.stringify(state)),state);
});
test('repeated actions cannot duplicate rewards or spend twice',()=>{
  const state=newGame();for(const t of TREASURES)collect(state,t.id);
  const before=structuredClone(state);for(const t of TREASURES)assert.equal(collect(state,t.id).ok,false);assert.deepEqual(state,before);
  for(const t of RESTORATIONS)restore(state,t.id);claimBonus(state);buyDecoration(state,'flowers');const complete=structuredClone(state);
  assert.equal(restore(state,'lamp').ok,false);assert.equal(claimBonus(state).ok,false);assert.equal(buyDecoration(state,'flowers').ok,false);assert.deepEqual(state,complete);
});
test('story order and scarce resources are enforced without destroying resources',()=>{
  const state=newGame();assert.equal(restore(state,'lamp').ok,false);assert.equal(buyDecoration(state,'flowers').ok,false);assert.equal(claimBonus(state).ok,false);
  TREASURES.slice(0,3).forEach(t=>collect(state,t.id));const before=structuredClone(state);
  assert.equal(restore(state,'music').ok,false);assert.equal(restore(state,'bear').ok,false);assert.equal(collect(state,'invented').ok,false);assert.deepEqual(state,before);
  assert.equal(restore(state,'lamp').ok,true);assert.equal(state.thread,0);
});
test('malformed and future saves recover; known progress is sanitized',()=>{
  for(const value of ['oops','null','{}','{"version":2}','{"version":1,"collected":4}'])assert.deepEqual(loadGame(value),newGame());
  const state=loadGame(JSON.stringify({version:1,collected:['star','star','missing'],restored:['bear','lamp'],decorations:['flowers'],coins:999999,xp:999,thread:-8,bonusClaimed:true,position:{x:999,z:-999}}));
  assert.deepEqual(state.collected,['star']);assert.deepEqual(state.restored,[]);assert.equal(state.coins,5);assert.equal(state.thread,1);assert.equal(state.xp,8);assert.equal(state.bonusClaimed,false);assert.equal(state.position.x,4.5);assert.equal(state.position.z,-3.4);
});
test('an early cosmetic purchase cannot prevent completing the story',()=>{
  const state=newGame();TREASURES.slice(0,4).forEach(t=>collect(state,t.id));assert.equal(buyDecoration(state,'flowers').ok,true);
  for(const t of TREASURES.slice(4))collect(state,t.id);for(const t of RESTORATIONS)assert.equal(restore(state,t.id).ok,true);assert.equal(state.thread,0);
});
