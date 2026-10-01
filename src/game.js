export const SAVE_KEY = 'little-keepsakes-v1';
export const TREASURES = [
  { id: 'thread-peach', name: 'Peach thread', kind: 'spool', x: -0.9, z: 1.9, color: '#d6886c', thought: 'A loose thread. Maybe it can hold something together.' },
  { id: 'button-blue', name: 'A sky-blue button', kind: 'button', x: 2.8, z: 2.25, color: '#7a9aaf', thought: 'A tiny sky, with four little windows.' },
  { id: 'star', name: 'A folded paper star', kind: 'star', x: -2.7, z: 0.35, color: '#eac779', thought: 'Someone wished on this. I hope it came true.' },
  { id: 'thread-sage', name: 'Sage thread', kind: 'spool', x: 0.1, z: -1.8, color: '#889b78', thought: 'The same green as my little scarf.' },
  { id: 'button-rose', name: 'A rose-colored button', kind: 'button', x: 3.9, z: 0.6, color: '#c7807e', thought: 'Small things can still be useful.' },
  { id: 'thread-gold', name: 'Golden thread', kind: 'spool', x: -3.9, z: 2.35, color: '#d7b568', thought: 'A little piece of afternoon sunshine.' },
  { id: 'star-letter', name: 'A star from a letter', kind: 'star', x: 1.9, z: 0.5, color: '#edd9ab', thought: 'There is handwriting on the back. “See you soon.”' },
  { id: 'button-ivory', name: 'A familiar button', kind: 'button', x: -1.65, z: -1.7, color: '#d7b78f', thought: 'This feels like the coat I was made from.' },
  { id: 'thread-lilac', name: 'Lavender thread', kind: 'spool', x: 1.65, z: 3.2, color: '#a59cbd', thought: 'Enough for one more small kindness.' },
];
export const RESTORATIONS = [
  { id: 'lamp', name: 'The little lamplight', short: 'Bring back the light', x: -3.15, z: -1.75, approach: {x:-2.9,z:-0.65}, cost: 3, title: 'A light left on', subtitle: 'Memory 01 · The late-night maker', quote: '“Just one more stitch, Ada. Then you can meet your friend.”', text: 'The lamplight remembers a pair of careful hands. A green coat becoming a scarf. A little girl trying very hard to stay awake. You were made here, one patient stitch at a time.', after: 'I was not made in a factory. I was made for someone.' },
  { id: 'music', name: 'The quiet music box', short: 'Find the lost melody', x: 2.8, z: -1.35, approach: {x:2.65,z:-0.15}, cost: 3, requires: 'lamp', title: 'The almost-right song', subtitle: 'Memory 02 · A room that danced', quote: '“It misses a note. That is how you know it is ours.”', text: 'Ada used to wind the box before every great expedition across the bedroom rug. You were always the captain. The missing note was where she laughed. The room was never quiet when you were together.', after: 'Perhaps a little imperfect is a little more ours.' },
  { id: 'bear', name: 'A friend with a loose stitch', short: 'Mend an old friend', x: -0.1, z: -2.8, approach: {x:0.1,z:-1.1}, cost: 3, requires: 'music', title: 'Room for one more', subtitle: 'Memory 03 · The things we take', quote: '“New flat. New windows. Same old friends.”', text: 'Tucked behind the bear is a note, folded around a moving-day list. At the very bottom: “Pip, Bear, music box.” The boxes were never a goodbye. Ada was making room for you in the next part of her life.', after: 'We were not left behind. We were waiting to come along.' },
];
export const DECORATIONS = [
  { id: 'flowers', name: 'A little bloom', description: 'Daisies for the windowsill.', cost: 20, icon: 'flower' },
  { id: 'bunting', name: 'Everyday celebration', description: 'A string of soft, happy colors.', cost: 30, icon: 'flag' },
  { id: 'cushion', name: 'Somewhere soft', description: 'A rose cushion, just Pip-sized.', cost: 25, icon: 'heart' },
];
export const LEVELS = [
  { min: 0, name: 'A little spark' },
  { min: 24, name: 'Curious little soul' },
  { min: 64, name: 'A helping hand' },
  { min: 110, name: 'Keeper of small things' },
];
export function newGame() { return { version: 1, collected: [], restored: [], decorations: [], coins: 0, thread: 0, xp: 0, bonusClaimed: false, position: {x:0.25,z:1.8}, sound: false, reducedMotion: false }; }
export function levelFor(xp) { let level=0; LEVELS.forEach((v,i)=>{if(xp>=v.min)level=i;}); return { index:level, ...LEVELS[level], next: LEVELS[level+1]?.min ?? null }; }
export function collect(state, id) {
  if (!TREASURES.some(t=>t.id===id) || state.collected.includes(id)) return {ok:false};
  state.collected.push(id); state.thread++; state.coins+=5; state.xp+=8;
  return {ok:true, coins:5, xp:8, thread:1};
}
export function restore(state, id) {
  const item=RESTORATIONS.find(t=>t.id===id);
  if(!item || state.restored.includes(id))return {ok:false, reason:'This keepsake is already restored.'};
  if(item.requires && !state.restored.includes(item.requires))return {ok:false,reason:`First, ${RESTORATIONS.find(t=>t.id===item.requires).short.toLowerCase()}.`};
  if(state.thread<item.cost)return {ok:false,reason:`Find ${item.cost-state.thread} more ${item.cost-state.thread===1?'piece':'pieces'} of thread in the room.`};
  state.thread-=item.cost; state.restored.push(id); state.coins+=20; state.xp+=20;
  return {ok:true, coins:20, xp:20};
}
export function buyDecoration(state,id) {
  const item=DECORATIONS.find(t=>t.id===id);
  if(!item || state.decorations.includes(id) || state.coins<item.cost)return {ok:false};
  state.coins-=item.cost; state.decorations.push(id); return {ok:true};
}
export function claimBonus(state) {
  if(state.restored.length!==RESTORATIONS.length || state.bonusClaimed)return {ok:false};
  state.coins+=40; state.bonusClaimed=true; return {ok:true,coins:40};
}
export function loadGame(raw) {
  try {
    const data=JSON.parse(raw); if(data?.version!==1)return newGame();
    const state=newGame();
    state.collected=[...new Set((Array.isArray(data.collected)?data.collected:[]).filter(id=>TREASURES.some(t=>t.id===id)))];
    // Rebuild progression, so malformed storage cannot break the chapter economy.
    for(const item of RESTORATIONS) {
      if(Array.isArray(data.restored) && data.restored.includes(item.id) && (!item.requires || state.restored.includes(item.requires)) && state.collected.length>=3*(state.restored.length+1))state.restored.push(item.id);
    }
    state.thread=state.collected.length-state.restored.length*3;
    state.xp=state.collected.length*8+state.restored.length*20;
    state.bonusClaimed=data.bonusClaimed===true && state.restored.length===3;
    state.coins=state.collected.length*5+state.restored.length*20+(state.bonusClaimed?40:0);
    for(const item of DECORATIONS)if(Array.isArray(data.decorations)&&data.decorations.includes(item.id)&&state.coins>=item.cost){state.decorations.push(item.id);state.coins-=item.cost;}
    if(Number.isFinite(data.position?.x)&&Number.isFinite(data.position?.z))state.position={x:Math.max(-4.5,Math.min(4.5,data.position.x)),z:Math.max(-3.4,Math.min(3.5,data.position.z))};
    state.sound=data.sound===true; state.reducedMotion=data.reducedMotion===true;
    return state;
  } catch { return newGame(); }
}
