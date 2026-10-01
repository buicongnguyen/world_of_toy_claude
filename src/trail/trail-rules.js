// The Lantern Trail's rules: the party, the Mistlings, gentle turn-based "calm" battles, fruit,
// levels, progress and saves. Pure and deterministic (seeded random), with no DOM, so node tests
// can play whole battles and the stage only ever displays this state.

export const SAVE_KEY = 'little-keepsakes-trail-v1';
export const ORDER = ['pip', 'momo', 'nori', 'juniper', 'bramble'];

/** Friends: base heart (health) and warmth (how much a hug calms), growth per level, their special. */
export const PARTY = {
  pip: {heart: 30, warmth: 7, grow: [5, 1.3], special: 'glow', cooldown: 3},
  momo: {heart: 26, warmth: 5, grow: [4, 0.9], special: 'tea', cooldown: 3},
  nori: {heart: 27, warmth: 8, grow: [4, 1.4], special: 'kite', cooldown: 3},
  juniper: {heart: 24, warmth: 6, grow: [4, 1.0], special: 'riddle', cooldown: 3},
  bramble: {heart: 36, warmth: 6, grow: [6, 1.0], special: 'shield', cooldown: 4},
};
export const SPECIALS = {
  glow: {name: 'Lantern Glow', help: 'Warm light calms every Mistling a little.'},
  tea: {name: 'Moonflower Tea', help: 'Heals every friend and wakes sleepy ones.'},
  kite: {name: 'Kite Dash', help: 'A big swoop: twice the calm for one Mistling.'},
  riddle: {name: 'Riddle', help: 'Puzzles a Mistling for two turns and shows what it loves.'},
  shield: {name: 'Lantern Shield', help: 'The mist’s chill is halved for two rounds.'},
  letter: {name: 'Hazel’s notes', help: 'Read Hazel’s notes aloud. Each one you found calms Old Fog.'},
};
export const LEVELS = [0, 18, 45, 85, 140, 210, 300, 410];
export const levelOf = glow => LEVELS.reduce((l, need, i) => glow >= need ? i + 1 : l, 1);
export const maxHeart = (name, level) => Math.round(PARTY[name].heart + PARTY[name].grow[0] * (level - 1));
export const warmthOf = (name, level) => Math.round(PARTY[name].warmth + PARTY[name].grow[1] * (level - 1));

/** Mistlings: gloom (how much calming they need), chill (how hard their mist bites), glow (reward). */
export const FOES = {
  wisp: {name: 'Weepy Wisp', gloom: 16, chill: 5, glow: 6, loves: 'hug', moves: ['chill']},
  puff: {name: 'Grumbly Puff', gloom: 26, chill: 6, glow: 9, loves: 'glow', moves: ['chill', 'chill', 'sulk']},
  flicker: {name: 'Shy Flicker', gloom: 15, chill: 5, glow: 8, loves: 'kite', moves: ['chill', 'hide']},
  sulk: {name: 'Thunder Sulk', gloom: 70, chill: 9, glow: 18, loves: 'riddle', moves: ['chill', 'drizzle', 'chill']},
  fog: {name: 'Old Fog', gloom: 360, chill: 14, glow: 60, loves: 'glow', moves: ['drizzle', 'sigh', 'chill', 'bank', 'chill', 'drizzle'], boss: true, actions: 2},
};
export const LOVES = {hug: 'Loves hugs', glow: 'Loves lantern light', kite: 'Loves kites', riddle: 'Loves riddles'};

/** Fruit from the picnic basket (levels match the picnic's fruit icons). */
export const ITEMS = {
  cherries: {fruit: 0, name: 'Cherries', heal: 12, help: 'Restores 12 heart to one friend.'},
  strawberry: {fruit: 1, name: 'Strawberry', heal: 22, help: 'Restores 22 heart to one friend.'},
  lemon: {fruit: 4, name: 'Lemon', wake: 0.5, help: 'Wakes a sleepy friend with half their heart.'},
  peach: {fruit: 6, name: 'Peach', heal: 45, help: 'Restores 45 heart to one friend.'},
  watermelon: {fruit: 8, name: 'Watermelon', healAll: 18, help: 'Everyone shares: 18 heart each.'},
  dragon: {fruit: 11, name: 'Dragon fruit', reviveAll: true, help: 'Wakes everyone and fills every heart.'},
};

/** Mistling groups on the map: where they gather (an islet spot) and what they leave behind. */
export const GROUPS = [
  {id: 'm1', islet: 'meadow', at: 'fight', foes: ['wisp'], drops: {cherries: 1}, tutorial: true},
  {id: 'm2', islet: 'meadow', at: 'extra', foes: ['wisp', 'wisp'], drops: {strawberry: 1}},
  {id: 'p1', islet: 'pond', at: 'fight', foes: ['wisp', 'puff'], drops: {cherries: 2}, rescue: 'momo'},
  {id: 'p2', islet: 'pond', at: 'extra', foes: ['flicker', 'flicker'], drops: {lemon: 1}},
  {id: 'w1', islet: 'wood', at: 'ring', foes: ['puff', 'flicker', 'wisp'], drops: {peach: 1}, rescue: 'nori'},
  {id: 'w2', islet: 'wood', at: 'extra', foes: ['puff', 'puff'], drops: {strawberry: 1}},
  {id: 'w3', islet: 'wood', at: 'extra2', foes: ['flicker', 'wisp', 'flicker'], drops: {cherries: 2}},
  {id: 'o1', islet: 'oak', at: 'fight', foes: ['sulk', 'wisp'], drops: {watermelon: 1}},
  {id: 'fog', islet: 'summit', at: 'fight', foes: ['fog'], drops: {}, boss: true},
];
export const groupById = Object.fromEntries(GROUPS.map(g => [g.id, g]));

/** Picnic baskets (chests) and what Hazel packed in them. */
export const CHESTS = {
  meadow: {cherries: 2, strawberry: 1},
  pond: {peach: 1, cherries: 1},
  wood: {lemon: 1, cherries: 2},
  oak: {watermelon: 1, strawberry: 1},
};

/** Waystones: what must be calm before each can be lit. */
export const WAYSTONES = {
  way1: {islet: 'meadow', needs: ['m1']},
  way2: {islet: 'wood', needs: ['w1']},
  way3: {islet: 'oak', needs: ['o1', 'juniper']},
};

/** The story's next goal, for the HUD. */
export function objective(s) {
  const f = s.flags;
  if (f.ending) return 'The trail is lit. Hazel is on her way.';
  if (!f.way1) return s.calmed.includes('m1') ? 'Light the waystone by the bridge.' : 'Calm the Mistling in the meadow.';
  if (!f.momo) return 'Cross the bridge and find Momo.';
  if (!f.nori) return 'Follow the steam to Toadstool Wood and find Nori.';
  if (!f.way2) return 'Light the waystone in the wood.';
  if (!f.juniper) return 'Climb Old Oak Hill and answer Juniper’s riddle.';
  if (!f.way3) return s.calmed.includes('o1') ? 'Light the waystone on Old Oak Hill.' : 'Calm the Thunder Sulk on the hill.';
  if (!f.bramble) return 'Climb to the summit. Someone is hiding there.';
  return 'Calm Old Fog and light Hazel’s beacon.';
}

// ------------------------------------------------------------------------------ progress & saves
export function newTrail() {
  return {
    v: 1, party: ['pip'], glow: 0, hearts: {pip: maxHeart('pip', 1)}, items: {cherries: 1}, flags: {},
    calmed: [], chests: [], notes: [], pos: null, respawn: null, time: 0, battles: 0, lovely: 0,
  };
}

/** Read a save; anything unreadable starts afresh (the caller keeps the raw text aside). */
export function loadTrail(text) {
  try {
    const s = JSON.parse(text);
    if (!s || s.v !== 1 || !Array.isArray(s.party) || !s.party.includes('pip')) return null;
    const out = {...newTrail(), ...s, flags: {...s.flags}, items: {...s.items}, hearts: {...s.hearts}};
    out.party = ORDER.filter(n => out.party.includes(n));
    out.calmed = out.calmed.filter(id => groupById[id]);
    const level = levelOf(out.glow);
    for (const n of out.party) out.hearts[n] = Math.max(0, Math.min(maxHeart(n, level), Number.isFinite(out.hearts[n]) ? out.hearts[n] : maxHeart(n, level)));
    for (const [k, v] of Object.entries(out.items)) if (!ITEMS[k] || !(v > 0)) delete out.items[k];
    return repair(out);
  } catch { return null; }
}

/** Finish any story beat a closed page interrupted: a rescue that was won joins its friend, a solved
 *  riddle joins Juniper, a calmed Old Fog means the ending happened, and nobody wakes with no heart. */
export function repair(s) {
  for (const g of GROUPS) if (g.rescue && s.calmed.includes(g.id)) join(s, g.rescue);
  if (s.flags.juniper) join(s, 'juniper');
  if (s.flags.bramble) join(s, 'bramble');
  if (s.calmed.includes('fog')) s.flags.ending = true;
  const level = levelOf(s.glow);
  for (const n of s.party) if (!(s.hearts[n] > 0)) s.hearts[n] = maxHeart(n, level); // asleep only in battle
  return s;
}

export function join(s, name) {
  if (s.party.includes(name)) return false;
  s.party = ORDER.filter(n => n === name || s.party.includes(n));
  s.hearts[name] = maxHeart(name, levelOf(s.glow));
  s.flags[name] = true;
  return true;
}
export function healAll(s) { const level = levelOf(s.glow); for (const n of s.party) s.hearts[n] = maxHeart(n, level); }
export function addItems(s, items) { for (const [k, n] of Object.entries(items || {})) s.items[k] = (s.items[k] || 0) + n; }

/** Use a fruit outside battle on a friend (or everyone). Returns what happened, or null if it would do nothing. */
export function useItemOutside(s, item, name) {
  const it = ITEMS[item], level = levelOf(s.glow);
  if (!it || !(s.items[item] > 0)) return null;
  const targets = it.healAll || it.reviveAll ? s.party : [name];
  let any = false;
  for (const n of targets) {
    const max = maxHeart(n, level), before = s.hearts[n];
    if (it.reviveAll) s.hearts[n] = max;
    else if (it.healAll) s.hearts[n] = Math.min(max, before + it.healAll);
    else if (it.wake) s.hearts[n] = before > 0 ? before : Math.round(max * it.wake);
    else s.hearts[n] = Math.min(max, before + it.heal);
    if (s.hearts[n] !== before) any = true;
  }
  if (!any) return null;
  if (--s.items[item] <= 0) delete s.items[item];
  return {item, targets};
}

/** Award glow; returns the level change. */
export function addGlow(s, amount) {
  const before = levelOf(s.glow);
  s.glow += amount;
  const after = levelOf(s.glow);
  if (after > before) for (const n of s.party) s.hearts[n] = Math.min(maxHeart(n, after), s.hearts[n] + (maxHeart(n, after) - maxHeart(n, before)));
  return {before, after};
}

export function canLight(s, way) { return WAYSTONES[way].needs.every(n => s.calmed.includes(n) || s.flags[n]); }

// ------------------------------------------------------------------------------ battles
export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function newBattle(s, groupId, seed = 1) {
  const g = groupById[groupId], level = levelOf(s.glow);
  // a friend being rescued fights beside the party in their own rescue
  const names = g.rescue && !s.party.includes(g.rescue) ? ORDER.filter(n => s.party.includes(n) || n === g.rescue) : s.party;
  return {
    group: groupId, round: 1, turn: 0, phase: 'command', shield: 0, seed, rand: rng(seed), letterRead: false,
    friends: names.map(name => ({name, heart: s.party.includes(name) ? s.hearts[name] : maxHeart(name, level), max: maxHeart(name, level), warmth: warmthOf(name, level), cd: 0, guard: false, guest: !s.party.includes(name)})),
    foes: g.foes.map((kind, i) => {
      const f = FOES[kind];
      return {i, kind, gloom: f.gloom, max: f.gloom, chill: f.chill, loves: f.loves, revealed: !!g.tutorial, puzzled: 0, hidden: false, sulking: false, calm: false, step: i};
    }),
    notes: s.notes.length,
  };
}
export const awake = b => b.friends.filter(f => f.heart > 0);
export const active = b => b.foes.filter(f => !f.calm);
export const actor = b => b.friends[b.turn];

/** Which commands the acting friend may use right now. */
export function commands(b, s) {
  const f = actor(b);
  const list = [{id: 'hug'}, {id: PARTY[f.name].special, special: true, ready: f.cd === 0}, {id: 'fruit', ready: Object.keys(s.items).length > 0}, {id: 'guard'}];
  const boss = b.foes.find(x => FOES[x.kind].boss && !x.calm);
  if (f.name === 'pip' && boss && !b.letterRead && s.notes.length > 0 && boss.gloom <= boss.max * 0.6) list.splice(2, 0, {id: 'letter', special: true, ready: true});
  return list;
}
/** Commands that need a Mistling picked. */
export const TARGETED = new Set(['hug', 'kite', 'riddle']);

const vary = (b, v) => v * (0.9 + b.rand() * 0.2);

function calmFoe(b, foe, amount, events, extra = {}) {
  if (foe.calm) return;
  const before = foe.gloom;
  foe.gloom = Math.max(0, Math.round(foe.gloom - amount));
  events.push({type: 'calm', foe: foe.i, amount: before - foe.gloom, ...extra});
  if (foe.gloom === 0) { foe.calm = true; events.push({type: 'calmed', foe: foe.i}); }
}

/**
 * The acting friend does `cmd` ({id, target, item, friend}); `timing` is 'lovely' when the player hit the ring.
 * Returns the events in order. Advances the turn; the caller then runs foe turns when phase is 'foes'.
 */
export function act(b, s, cmd, timing = null) {
  const f = actor(b), events = [];
  if (b.phase !== 'command' || !f) return events;
  const lovely = timing === 'lovely' ? 1.5 : 1;
  const foe = cmd.target !== undefined ? b.foes[cmd.target] : null;
  const loved = (target, kind) => target.loves === kind ? 1.6 : 1;
  const soothe = target => target.sulking ? 0.5 : 1;
  if (TARGETED.has(cmd.id) && (!foe || foe.calm)) return events;
  switch (cmd.id) {
    case 'hug': {
      if (foe.hidden) { events.push({type: 'miss', foe: foe.i}); break; }
      const k = loved(foe, 'hug');
      calmFoe(b, foe, vary(b, f.warmth) * k * lovely * soothe(foe), events, {loved: k > 1, lovely: lovely > 1, by: f.name});
      foe.sulking = false;
      break;
    }
    case 'glow':
      for (const t of active(b)) { t.hidden = false; calmFoe(b, t, vary(b, f.warmth * 0.75) * loved(t, 'glow') * lovely * soothe(t), events, {loved: t.loves === 'glow', lovely: lovely > 1, by: f.name}); t.sulking = false; }
      f.cd = PARTY.pip.cooldown;
      break;
    case 'kite': {
      const k = loved(foe, 'kite');
      foe.hidden = false;
      calmFoe(b, foe, vary(b, f.warmth * 2) * k * lovely * soothe(foe), events, {loved: k > 1, lovely: lovely > 1, by: f.name});
      foe.sulking = false;
      f.cd = PARTY.nori.cooldown;
      break;
    }
    case 'riddle': {
      foe.puzzled = 2; foe.revealed = true; foe.hidden = false;
      events.push({type: 'puzzled', foe: foe.i});
      calmFoe(b, foe, vary(b, f.warmth * 0.5) * loved(foe, 'riddle') * lovely, events, {loved: foe.loves === 'riddle', lovely: lovely > 1, by: f.name});
      f.cd = PARTY.juniper.cooldown;
      break;
    }
    case 'tea':
      for (const m of b.friends) {
        const before = m.heart;
        m.heart = m.heart > 0 ? Math.min(m.max, m.heart + Math.round(m.max * 0.35 * lovely)) : Math.round(m.max * 0.3);
        if (m.heart !== before) events.push({type: 'heal', friend: m.name, amount: m.heart - before, woke: before === 0});
      }
      if (!events.length) return events; // everyone is full: the tea stays in the pot and the turn is not spent
      f.cd = PARTY.momo.cooldown;
      break;
    case 'shield':
      b.shield = 2; events.push({type: 'shield'});
      f.cd = PARTY.bramble.cooldown;
      break;
    case 'letter': {
      const boss = b.foes.find(x => FOES[x.kind].boss && !x.calm);
      b.letterRead = true;
      events.push({type: 'letter', notes: s.notes.length});
      calmFoe(b, boss, boss.max * 0.07 * Math.min(5, s.notes.length), events, {by: 'pip', letter: true});
      break;
    }
    case 'fruit': {
      const it = ITEMS[cmd.item];
      if (!it || !(s.items[cmd.item] > 0)) return events;
      const targets = it.healAll || it.reviveAll ? b.friends : [b.friends.find(m => m.name === cmd.friend) || f];
      for (const m of targets) {
        const before = m.heart;
        if (it.reviveAll) m.heart = m.max;
        else if (it.healAll) m.heart = m.heart > 0 ? Math.min(m.max, m.heart + it.healAll) : m.heart;
        else if (it.wake) m.heart = m.heart > 0 ? m.heart : Math.round(m.max * it.wake);
        else m.heart = m.heart > 0 ? Math.min(m.max, m.heart + it.heal) : m.heart;
        if (m.heart !== before) events.push({type: 'heal', friend: m.name, amount: m.heart - before, woke: before === 0, item: cmd.item});
      }
      if (!events.length) return events; // nothing to heal: the fruit stays in the bag and the turn is not spent
      if (--s.items[cmd.item] <= 0) delete s.items[cmd.item];
      break;
    }
    case 'guard':
      f.guard = true; f.cd = Math.max(0, f.cd - 1); events.push({type: 'guard', friend: f.name});
      break;
    default: return events;
  }
  if (lovely > 1) s.lovely = (s.lovely || 0) + 1;
  advance(b);
  return events;
}

function advance(b) {
  if (!active(b).length) { b.phase = 'won'; return; }
  let next = b.turn + 1;
  while (next < b.friends.length && b.friends[next].heart <= 0) next++;
  if (next < b.friends.length) { b.turn = next; return; }
  b.phase = 'foes'; b.foeTurn = 0;
}

/** What the next Mistling will do (null when the foes' turn is over). Call applyFoe with it. */
export function planFoe(b) {
  while (b.foeTurn < b.foes.length && b.foes[b.foeTurn].calm) b.foeTurn++;
  if (b.foeTurn >= b.foes.length) return null;
  const foe = b.foes[b.foeTurn], F = FOES[foe.kind];
  if (foe.puzzled > 0) return {foe: foe.i, move: 'puzzled'};
  let move = F.moves[foe.step % F.moves.length];
  // the boss gathers itself when low, at most every few turns
  if (move === 'bank' && foe.gloom > foe.max * 0.7) move = 'chill';
  if ((move === 'sulk' || move === 'hide') && b.rand() < 0.35) move = 'chill';
  const targets = awake(b);
  if (!targets.length) return {foe: foe.i, move: 'idle'};
  if (move === 'drizzle') return {foe: foe.i, move, targets: targets.map(t => t.name)};
  if (move === 'sulk' || move === 'hide' || move === 'bank') return {foe: foe.i, move};
  // chill and sigh pick a friend, leaning toward whoever has the most heart left
  const weights = targets.map(t => 0.5 + t.heart / t.max), sum = weights.reduce((a, w) => a + w, 0);
  let r = b.rand() * sum, pick = targets[0];
  for (let i = 0; i < targets.length; i++) { r -= weights[i]; if (r <= 0) { pick = targets[i]; break; } }
  return {foe: foe.i, move, targets: [pick.name]};
}

/** Resolve a planned foe move; `brave` is true when the player braced in time (halves the chill). */
export function applyFoe(b, plan, brave = false) {
  const foe = b.foes[plan.foe], events = [];
  foe.step++;
  if (plan.move === 'puzzled') { events.push({type: 'confused', foe: foe.i}); foe.acted = 0; b.foeTurn++; return events; }
  else if (plan.move === 'sulk') { foe.sulking = true; events.push({type: 'sulk', foe: foe.i}); }
  else if (plan.move === 'hide') { foe.hidden = true; events.push({type: 'hide', foe: foe.i}); }
  else if (plan.move === 'bank') { const before = foe.gloom; foe.gloom = Math.min(foe.max, foe.gloom + 20); foe.hidden = true; events.push({type: 'bank', foe: foe.i, amount: foe.gloom - before}); }
  else if (plan.targets) {
    const scale = plan.move === 'drizzle' ? 0.55 : plan.move === 'sigh' ? 1.7 : 1;
    for (const name of plan.targets) {
      const m = b.friends.find(x => x.name === name);
      if (!m || m.heart <= 0) continue;
      let dmg = vary(b, foe.chill * scale) * (b.shield > 0 ? 0.5 : 1) * (m.guard ? 0.5 : 1) * (brave ? 0.5 : 1);
      dmg = Math.max(1, Math.round(dmg));
      m.heart = Math.max(0, m.heart - dmg);
      b.lowest = Math.min(b.lowest ?? 1, m.heart / m.max);
      events.push({type: 'chill', foe: foe.i, friend: name, amount: dmg, brave, sleepy: m.heart === 0});
    }
  }
  // big Mistlings act more than once a round
  foe.acted = (foe.acted || 0) + 1;
  if (foe.acted >= (FOES[foe.kind].actions || 1)) { foe.acted = 0; b.foeTurn++; }
  if (!awake(b).length) b.phase = 'lost';
  return events;
}

/** After every foe acted: next round. */
export function endRound(b) {
  if (b.phase === 'won' || b.phase === 'lost') return;
  b.round++;
  if (b.shield > 0) b.shield--;
  for (const f of b.friends) { f.guard = false; if (f.cd > 0) f.cd--; }
  for (const f of b.foes) if (!f.calm) { f.hidden = f.hidden && b.rand() < 0.3; if (f.puzzled > 0) f.puzzled--; }
  b.phase = 'command';
  b.turn = b.friends.findIndex(f => f.heart > 0);
  if (b.turn < 0) b.phase = 'lost';
}

/** Write a finished battle back into the progress; returns the rewards. */
export function finishBattle(s, b) {
  const g = groupById[b.group];
  s.battles = (s.battles || 0) + 1;
  for (const f of b.friends) if (!f.guest) s.hearts[f.name] = b.phase === 'won' ? Math.max(1, f.heart) : f.heart;
  if (b.phase !== 'won') return {won: false};
  const glow = g.foes.reduce((a, k) => a + FOES[k].glow, 0);
  if (!s.calmed.includes(g.id)) s.calmed.push(g.id);
  addItems(s, g.drops);
  const level = addGlow(s, glow);
  // sleepy friends wake up gently after a win
  for (const n of s.party) if (s.hearts[n] <= 0) s.hearts[n] = 1;
  return {won: true, glow, drops: g.drops, ...level};
}

/** A whole battle played by a simple, sensible bot (for tests and balance checks). */
export function autoplay(s, groupId, {seed = 1, lovelyRate = 0.5, braveRate = 0.4, maxRounds = 60} = {}) {
  const b = newBattle(s, groupId, seed), luck = rng(seed * 31 + 7);
  while (b.round <= maxRounds && b.phase !== 'won' && b.phase !== 'lost') {
    while (b.phase === 'command') {
      const f = actor(b), cmds = commands(b, s), foes = active(b);
      const weakest = foes.reduce((a, x) => (x.hidden ? 999 : x.gloom) < (a.hidden ? 999 : a.gloom) ? x : a, foes[0]);
      const hurt = b.friends.filter(m => m.heart > 0 && m.heart < m.max * 0.4), sleepy = b.friends.filter(m => m.heart <= 0);
      const timing = luck() < lovelyRate ? 'lovely' : null;
      const has = id => cmds.find(c => c.id === id && c.ready !== false);
      let cmd = {id: 'hug', target: weakest.i};
      if (has('letter')) cmd = {id: 'letter'};
      else if (f.name === 'momo' && has('tea') && (hurt.length >= 2 || sleepy.length)) cmd = {id: 'tea'};
      else if (sleepy.length && s.items.lemon) cmd = {id: 'fruit', item: 'lemon', friend: sleepy[0].name};
      else if (hurt.length && (s.items.peach || s.items.strawberry || s.items.cherries)) cmd = {id: 'fruit', item: s.items.peach ? 'peach' : s.items.strawberry ? 'strawberry' : 'cherries', friend: hurt[0].name};
      else if (f.name === 'bramble' && has('shield') && b.shield === 0) cmd = {id: 'shield'};
      else if (f.name === 'pip' && has('glow') && foes.length >= 2) cmd = {id: 'glow'};
      else if (f.name === 'nori' && has('kite')) cmd = {id: 'kite', target: (foes.find(x => x.loves === 'kite') || foes.reduce((a, x) => x.gloom > a.gloom ? x : a)).i};
      else if (f.name === 'juniper' && has('riddle')) cmd = {id: 'riddle', target: foes.reduce((a, x) => x.gloom > a.gloom ? x : a).i};
      if (!act(b, s, cmd, timing).length) act(b, s, {id: 'guard'});
    }
    while (b.phase === 'foes') {
      const plan = planFoe(b);
      if (!plan) { endRound(b); break; }
      applyFoe(b, plan, luck() < braveRate);
    }
  }
  return b;
}
