// The Lantern Trail: a little 2.5D RPG chapter of The Lantern Picnic.
// Walk Fernhollow's floating islets, find the friends the mist scattered, calm lonely Mistlings in
// gentle turn-based battles, light the waystones and wake Hazel's beacon.
// This module is the director: input, exploring, conversations, battles, menus, saves and sound.
// Rules live in trail-rules.js, the map in trail-map.js, drawing in trail-stage.js.
import {TrailStage, MIST_LOOK} from './trail-stage.js';
import {WalkGrid} from './trail-grid.js';
import * as MAP from './trail-map.js';
import * as R from './trail-rules.js';
import {SCENES, NOTES, NAMES, PLACES} from './trail-script.js';
import {t, setLang, getLang, translatePage} from './trail-i18n.js';
import {AudioEngine} from '../engine/audio.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const SETTINGS_KEY = 'little-keepsakes-settings-v1'; // shared with the picnic: language and volumes
const TRAIL_PREFS = 'little-keepsakes-trail-prefs-v1';
const touch = matchMedia('(pointer: coarse)').matches;
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const SPEED = 3.3; // world units per second
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (a, b, lambda, dt) => b + (a - b) * Math.exp(-lambda * dt);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ------------------------------------------------------------------------------ settings & save
let shared = {};
try { shared = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch {}
let prefs = {sound: true, timingHelp: false, calm: false};
try { prefs = {...prefs, ...JSON.parse(localStorage.getItem(TRAIL_PREFS) || '{}')}; } catch {}
const languageReady = setLang(shared.language || (navigator.language || '').startsWith('vi') && 'vi' || 'en');
const quiet = () => prefs.calm || motionQuery.matches;
function savePrefs() { try { localStorage.setItem(TRAIL_PREFS, JSON.stringify(prefs)); } catch {} }
function saveLanguage(lang) {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; s.language = lang; localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

let stored = null;
try { stored = localStorage.getItem(R.SAVE_KEY); } catch {}
let state = stored ? R.loadTrail(stored) : null;
if (stored && !state) try { localStorage.setItem(`${R.SAVE_KEY}-unreadable-${Date.now()}`, stored); } catch {}
const hasSave = !!state && (state.pos || state.calmed.length);
state ||= R.newTrail();
let safePos = null; // where a save puts Pip while Pip stands somewhere temporary (a battle slot, a lost battle)
function save() {
  if (mode === 'title' || mode === 'loading') return;
  const p = safePos || battle?.safe || player;
  state.pos = {x: +p.x.toFixed(2), z: +p.z.toFixed(2)};
  try { localStorage.setItem(R.SAVE_KEY, JSON.stringify(state)); } catch {}
}

// ------------------------------------------------------------------------------ world objects
let stage, grid, manifest, audio;
let mode = 'loading'; // loading | title | explore | talk | battle | menu | ending
let time = 0, lastFrame = performance.now(), autosave = 0, placeShown = null, idleHint = 0;
const keys = new Set();
const player = {kind: 'friend', name: 'pip', player: true, x: 0, y: 0, z: 0, vx: 0, vz: 0, pose: 'idle0', flip: false, back: false, walk: 0, hop: 0};
const friends = {pip: player}; // every friend actor, joined or not
let followers = [], trail = [], path = null, pendingUse = null;
let mapFoes = []; // {group, actor, home, wander, cooldown}
let noteActors = [], mists = [];
const tweens = [];

function heightAt(x, z) { return grid.heightAt(x, z); }
function ground(a) { const h = heightAt(a.x, a.z); if (h !== null) a.y = h; return a; }
function spotOf(islet, key, dx = 0, dz = 0) { const p = MAP.spot(islet, key); p.x += dx; p.z += dz; return ground(p); }

/** Run fn(p) every frame for `seconds` (game time), resolving when done. */
function tween(seconds, fn = () => {}) {
  return new Promise(resolve => { const tw = {t: 0, d: Math.max(0.001, seconds * (auto.fast ? 0.2 : 1)), fn, resolve}; tweens.push(tw); fn(0); });
}
/** Test hook (?debug): `fast` shortens every animation, `battles` lets the rules' bot pick commands. */
const auto = {fast: false, battles: false};
const wait = s => tween(s);
const ease = p => p * p * (3 - 2 * p);

// ------------------------------------------------------------------------------ audio
function setupAudio() {
  audio = new AudioEngine({lowPower: touch});
  audio.setVolumes({music: shared.music ?? 0.7, sfx: shared.sfx ?? 0.85, ambience: shared.ambience ?? 0.6, voice: shared.voice ?? 0.8});
  audio.setEnabled(prefs.sound);
  audio.setTimeOfDay('golden', 0);
}
const sfx = (name, opts) => { try { audio?.play(name, opts); } catch {} };
function unlockAudio() { try { audio?.unlock(); } catch {} }

// ------------------------------------------------------------------------------ boot
async function boot() {
  await languageReady;
  translatePage();
  $('language').value = getLang();
  const base = new URL('./assets/lantern-picnic/trail/', document.baseURI);
  try {
    const res = await fetch(new URL('manifest.json', base), {cache: 'no-cache'});
    manifest = await res.json();
  } catch (e) { return fail(e); }
  // the living bits the stage draws come from the same map data the bake used
  const w = MAP.spot('pond', 'water');
  manifest.water = {x: w.x, z: w.z, y: manifest.pondY + 0.04, rx: 1.25 * 1.02 * 1.9, rz: 0.85 * 1.02 * 1.9};
  manifest.islets = MAP.ISLETS;
  manifest.meadows = ['meadow', 'pond', 'oak'].map(id => { const I = MAP.isletById[id]; return {x: I.x, z: I.z, y: I.y, w: I.rx * 1.5, h: I.rz * 1.4, count: id === 'meadow' ? 5 : 3}; });
  grid = new WalkGrid(manifest.grid);
  stage = new TrailStage($('trail'), manifest, base, {touch, quiet: quiet()});
  window.addEventListener('resize', () => stage.resize());
  try { await stage.load(p => { $('load-bar').style.width = `${Math.round(p * 100)}%`; }); } catch (e) { return fail(e); }
  setupAudio();
  buildWorld();
  bindInput();
  $('loading').classList.add('done');
  setTimeout(() => $('loading').hidden = true, 600);
  showTitle();
  requestAnimationFrame(frame);
}
function fail(e) {
  console.error(e);
  $('load-text').textContent = t('The trail could not load. Please check your connection and reload.');
  $('load-retry').hidden = false;
}

function buildWorld() {
  // friends waiting on the islets
  const npc = (name, islet, key, pose = 'idle0', flip = true) => { const p = spotOf(islet, key); friends[name] = {kind: 'friend', name, x: p.x, y: p.y, z: p.z, pose, flip, hop: 0, npc: true}; };
  npc('momo', 'pond', 'momo', 'idle0', false);
  npc('nori', 'wood', 'nori', 'idle0', false);
  npc('juniper', 'oak', 'juniper', 'talk0', true);
  npc('bramble', 'summit', 'bramble', 'idle1', false);
  friends.bramble.sortBias = -0.5; // peeking from behind the rock
  for (const n of R.ORDER) friends[n].alpha = 1;
  // mist walls on every bridge whose gate is still closed
  mists = MAP.BRIDGES.map(br => {
    const {a, b, dx, dz} = MAP.bridgeEnds(br), t0 = 0.55;
    const x = a.x + (b.x - a.x) * t0, z = a.z + (b.z - a.z) * t0, y = (heightAt(x, z) ?? a.y + (b.y - a.y) * t0);
    const px = -dz, pz = dx, puffs = [];
    for (let i = -2; i <= 2; i++) puffs.push([px * i * 0.36 + dx * 0.1 * (i % 2), pz * i * 0.36 + dz * 0.1 * (i % 2), 0.1 + Math.abs(i) * 0.08, 1.05 - Math.abs(i) * 0.08]);
    for (let i = -1; i <= 1; i++) puffs.push([px * i * 0.5 + dx * 0.4, pz * i * 0.5 + dz * 0.4, 0.45, 0.9]);
    return {id: br.id, gate: br.gate, x, y, z, puffs, alpha: 1, clearing: false, ends: [{x: x + px * 1.0, z: z + pz * 1.0}, {x: x - px * 1.0, z: z - pz * 1.0}]};
  });
  stage.mist = mists;
  syncWorld(true);
}

/** Bring every actor, light, wall and blocker in line with the progress (after loads, battles, joins). */
function syncWorld(initial = false) {
  // party and followers
  followers = state.party.filter(n => n !== 'pip').map(n => friends[n]);
  for (const n of R.ORDER) if (n !== 'pip') { const f = friends[n]; f.npc = !state.party.includes(n); f.hidden = false; }
  // Mistlings still gloomy on the map
  const keep = new Map(mapFoes.map(m => [m.actor, m]));
  mapFoes = [];
  for (const g of R.GROUPS) {
    if (state.calmed.includes(g.id)) continue;
    const home = g.boss ? spotOf('summit', 'beacon', 0.2, 0.55) : g.rescue ? spotOf(g.islet, g.rescue) : spotOf(g.islet, g.at);
    g.foes.forEach((type, i) => {
      const old = [...keep.values()].find(m => m.group === g.id && m.index === i);
      const a = old?.actor || {kind: 'foe', type, x: home.x + (i - (g.foes.length - 1) / 2) * 0.9, y: home.y, z: home.z + (i % 2) * 0.5, phase: Math.random() * 6, alpha: 1, calm: 0};
      if (g.boss) { a.scale = 1; a.sortBias = 0.4; a.puzzled = false; }
      mapFoes.push(old || {group: g.id, index: i, actor: a, home, wander: {x: a.x, z: a.z, t: 0}, angle: i * 2.1, cooldown: 0});
    });
  }
  // Hazel's notes still waiting
  noteActors = Object.keys(NOTES).filter(id => !state.notes.includes(id)).map(id => {
    const p = id === 'meadow' ? spotOf('meadow', 'note') : spotOf(id, 'note');
    return {kind: 'note', id, x: p.x, y: p.y + (id === 'meadow' ? 0.42 : 0), z: p.z + (id === 'meadow' ? 0.02 : 0)};
  });
  // waystones, the beacon, opened baskets
  stage.lights = [];
  for (const way of ['way1', 'way2', 'way3']) {
    const lit = !!state.flags[way]; stage.setLit(way, lit);
    if (lit) addLight(way);
  }
  if (state.flags.ending) { stage.setLit('beacon', true); addLight('beacon', 2.6, 4.2); }
  for (const id of state.chests) stage.opened.add(`chest-${id}`);
  // mist walls and their blockers
  for (const m of mists) {
    const open = !!state.flags[m.gate];
    if (open) { m.alpha = initial ? 0 : m.alpha; grid.setBlocker(m.id, null, null, 0, false); }
    else { m.alpha = 1; m.clearing = false; grid.setBlocker(m.id, m.ends[0], m.ends[1], 0.55); }
  }
  // Old Fog sits on the beacon until the end; the beacon's terrace is blocked while it does
  refreshActors();
}
function addLight(id, r = 0.62, pool = 1.6) {
  const p = stage.propById[id];
  if (!p || stage.lights.some(l => l.id === id)) return;
  stage.lights.push({id, x: p.x, y: p.y, z: p.z, dx: p.light?.[0] || 0, dv: p.light?.[1] || -1, r, pool, alpha: 1});
}
function refreshActors() {
  const npcs = R.ORDER.filter(n => n !== 'pip' && !state.party.includes(n)).map(n => friends[n]);
  stage.actors = [player, ...followers, ...npcs, ...mapFoes.map(m => m.actor), ...noteActors];
  renderHud();
}

// ------------------------------------------------------------------------------ title
function showTitle() {
  mode = 'title';
  $('title-screen').hidden = false;
  $('hud').hidden = true;
  $('continue').hidden = !hasSave;
  $('begin').textContent = hasSave ? t('Start a new trail') : t('Begin the trail');
  const p = state.pos || startPoint();
  placePlayer(p.x, p.z);
  stage.snap(player.x, player.y, player.z);
  stage.cam.targetZoom = 0.9;
  $(hasSave ? 'continue' : 'begin').focus({preventScroll: true});
}
function startPoint() { return spotOf('meadow', 'start'); }
/** If Pip stands where nobody fits (an old save, a scenery change), step to the nearest open lawn. */
function unstick() {
  if (grid.clear(player.x, player.z, 0.2)) return;
  const p = grid.nearest(player.x, player.z, 6) || startPoint();
  placePlayer(p.x, p.z);
}
function placePlayer(x, z) {
  player.x = x; player.z = z; ground(player);
  trail = [];
  for (const f of followers) { f.x = x - 0.4; f.z = z + 0.5; ground(f); }
}

async function begin(fresh) {
  unlockAudio();
  $('title-screen').hidden = true;
  if (fresh) {
    try { localStorage.removeItem(R.SAVE_KEY); } catch {}
    state = R.newTrail();
    stage.lit.clear(); stage.opened.clear();
    for (const n of R.ORDER) if (n !== 'pip') { const f = friends[n]; const home = {momo: ['pond', 'momo'], nori: ['wood', 'nori'], juniper: ['oak', 'juniper'], bramble: ['summit', 'bramble']}[n]; Object.assign(f, spotOf(...home)); }
    mapFoes = [];
    syncWorld(true);
    const p = startPoint(); placePlayer(p.x, p.z);
  } else {
    const p = state.pos || startPoint(); placePlayer(p.x, p.z);
    unstick();
  }
  stage.cam.targetZoom = 1;
  mode = 'explore';
  $('hud').hidden = false;
  audio.setIntensity(state.party.length);
  renderHud();
  if (fresh || !state.flags.intro) {
    await talk('intro');
    state.flags.intro = true; save();
    hint(touch ? t('Drag on the left to walk, or tap where to go.') : t('Walk with WASD or the arrow keys. E or Space talks.'));
  }
}

// ------------------------------------------------------------------------------ HUD
/** Paint a friend's (or Old Fog's) face into a canvas. Canvases, not data URLs: reading pixels back
 *  for toDataURL stalled the main thread for most of a second on software-rendered phones. */
function paintFace(canvas, name) {
  const size = 88;
  if (name !== 'fog' && !stage.cast[name]) { stage.rest?.then(() => paintFace(canvas, name)); return; }
  if (canvas.width !== size) { canvas.width = canvas.height = size; }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, size, size);
  if (name === 'fog') {
    const img = stage.mists.fog.base; g.drawImage(img, 0, 0, img.width, img.height, -6, 0, size + 12, size * img.height / img.width + 12);
  } else {
    const cast = stage.cast[name], pose = cast.poses.talk0 || cast.poses.idle0, [fx, fy, fs] = cast.face || [0, 0, cast.cell[0]];
    g.drawImage(cast.img, pose[0] + fx, pose[1] + fy, fs, fs, 0, 0, size, size);
  }
}
const face = name => `<canvas class="face-mini" data-face="${name}" width="88" height="88" aria-hidden="true"></canvas>`;
function paintFaces(root) { for (const c of root.querySelectorAll('canvas[data-face]')) paintFace(c, c.dataset.face); }
function renderHud() {
  if (!stage?.cast) return;
  const level = R.levelOf(state.glow);
  $('party').innerHTML = state.party.map(n => {
    const max = R.maxHeart(n, level), h = state.hearts[n];
    return `<div class="member" title="${t(NAMES[n])}">${face(n)}<span class="heart"><i style="width:${Math.round(h / max * 100)}%"></i></span></div>`;
  }).join('');
  paintFaces($('party'));
  const next = R.LEVELS[level] ?? null, prev = R.LEVELS[level - 1];
  $('level').innerHTML = `<b>${t('Lv {n}', {n: level})}</b><span class="glow-bar"><i style="width:${next ? Math.round((state.glow - prev) / (next - prev) * 100) : 100}%"></i></span>`;
  $('goal').textContent = t(R.objective(state));
  $('sound').setAttribute('aria-pressed', String(prefs.sound));
  $('sound').classList.toggle('off', !prefs.sound);
}
let toastTimer;
function toast(text) {
  const el = $('toast'); el.textContent = text; el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2600);
}
let hintTimer;
function hint(text, seconds = 5) {
  const el = $('hint'); el.textContent = text; el.classList.add('show');
  clearTimeout(hintTimer); hintTimer = setTimeout(() => el.classList.remove('show'), seconds * 1000);
}
function banner(text) { const el = $('place'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }

// ------------------------------------------------------------------------------ input
const stick = {id: null, ox: 0, oy: 0, x: 0, y: 0};
let confirmWaiters = [], lastPad = {a: false, b: false, start: false, dir: 0, at: 0}, tapHandler = null;
function onConfirm() {
  unlockAudio();
  if (ringState && ringState.press === null) { ringState.press = stage.ring?.t ?? 0; return true; }
  const w = confirmWaiters.shift();
  if (w) { w(); return true; }
  return false;
}
const nextConfirm = () => new Promise(r => confirmWaiters.push(r));

function bindInput() {
  addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea')) return;
    const k = e.code;
    if (['Space', 'Enter', 'NumpadEnter', 'KeyE'].includes(k)) {
      if (e.target.closest('button') && (k === 'Space' || k === 'Enter')) return; // the button handles it
      if (e.repeat) return;
      if (mode === 'title') return;
      if (onConfirm()) { e.preventDefault(); return; }
      if (mode === 'explore') { e.preventDefault(); interact(); }
      return;
    }
    if (k === 'Escape') {
      e.preventDefault(); // otherwise the same press would also cancel the menu dialog it just opened
      if (mode === 'menu') closeMenu(); else if (mode === 'talk') skipTalk(); else if (mode === 'battle') battleBack?.(); else if (mode === 'explore') openMenu(); return; }
    if (mode === 'battle' && battleKey?.(e)) { e.preventDefault(); return; }
    if (/^(Arrow|Key[WASD])/.test(k)) { keys.add(k); if (mode === 'explore') { path = null; e.preventDefault(); } }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const canvas = $('trail');
  document.addEventListener('pointerdown', () => { if (ringState && ringState.press === null) { unlockAudio(); onConfirm(); } }, true);
  canvas.addEventListener('pointerdown', e => {
    unlockAudio();
    if (ringState) return; // the document listener above took it
    if (mode === 'talk') { onConfirm(); return; }
    if (mode === 'battle') { tapHandler?.(e); return; }
    if (mode !== 'explore') return;
    const left = e.clientX < innerWidth * 0.45;
    if (e.pointerType !== 'mouse' && left && stick.id === null) {
      stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0; stick.t = performance.now();
      canvas.setPointerCapture(e.pointerId);
      showStick();
      return;
    }
    stick.tap = {id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now()};
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId === stick.id) {
      const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, r = 54, d = Math.hypot(dx, dy);
      const k = d > r ? r / d : 1;
      stick.x = dx * k / r; stick.y = dy * k / r;
      // the floating base follows a thumb that wanders past it
      if (d > r * 1.4) { stick.ox += dx * (1 - r * 1.4 / d); stick.oy += dy * (1 - r * 1.4 / d); }
      path = null; showStick();
    }
  });
  const end = e => {
    if (e.pointerId === stick.id) {
      const quick = performance.now() - stick.t < 220 && Math.hypot(stick.x, stick.y) < 0.15;
      stick.id = null; stick.x = stick.y = 0; showStick();
      if (quick && e.type === 'pointerup') tapAt(e.clientX, e.clientY);
      return;
    }
    if (stick.tap?.id === e.pointerId && e.type === 'pointerup') {
      if (Math.hypot(e.clientX - stick.tap.x, e.clientY - stick.tap.y) < 14) tapAt(e.clientX, e.clientY);
      stick.tap = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  $('begin').addEventListener('click', () => {
    if (hasSave && !$('begin').dataset.armed) { $('begin').dataset.armed = '1'; $('begin').textContent = t('Tap again to start over'); return; }
    begin(true);
  });
  $('continue').addEventListener('click', () => begin(false));
  $('action').addEventListener('click', e => { e.currentTarget.blur(); interact(); });
  $('menu-open').addEventListener('click', e => { e.currentTarget.blur(); openMenu(); });
  $('sound').addEventListener('click', e => { e.currentTarget.blur(); prefs.sound = !prefs.sound; savePrefs(); unlockAudio(); audio.setEnabled(prefs.sound); renderHud(); syncSettings(); });
  $('dialogue').addEventListener('click', () => onConfirm());
  $('skip').addEventListener('click', e => { e.stopPropagation(); skipTalk(); });
  $('language').addEventListener('change', e => changeLanguage(e.target.value));
  $('menu-language').addEventListener('change', e => changeLanguage(e.target.value));
  $('load-retry').addEventListener('click', () => location.reload());
  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));
  $('menu-close').addEventListener('click', () => closeMenu());
  $('menu').addEventListener('cancel', e => { e.preventDefault(); closeMenu(); });
  $('opt-sound').addEventListener('change', e => { prefs.sound = e.target.checked; savePrefs(); unlockAudio(); audio.setEnabled(prefs.sound); renderHud(); });
  $('opt-timing').addEventListener('change', e => { prefs.timingHelp = e.target.checked; savePrefs(); });
  $('opt-calm').addEventListener('change', e => { prefs.calm = e.target.checked; savePrefs(); stage.quiet = quiet(); });
  $('restart').addEventListener('click', () => {
    if ($('restart').dataset.armed) { closeMenu(); begin(true); delete $('restart').dataset.armed; $('restart').textContent = t('Start the trail over'); return; }
    $('restart').dataset.armed = '1'; $('restart').textContent = t('Tap again to start over');
  });
  $('ending-wander').addEventListener('click', () => { $('ending').hidden = true; stage.cam.targetZoom = 1; mode = 'explore'; $('hud').hidden = false; renderHud(); $('trail').focus({preventScroll: true}); });
  motionQuery.addEventListener?.('change', () => { stage.quiet = quiet(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lastFrame = performance.now(); else save(); });
  addEventListener('pagehide', () => save());
}
/** The buttons a gamepad or keyboard can reach right now, in reading order. */
function focusables() {
  const root = mode === 'title' ? $('title-screen') : mode === 'ending' ? $('ending') : mode === 'menu' ? $('menu') : mode === 'battle' ? $('battle') : mode === 'talk' ? $('choices') : null;
  if (!root) return [];
  return [...root.querySelectorAll('button, a[href], select')].filter(el => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length);
}
function moveFocus(delta) {
  const list = focusables(); if (!list.length) return;
  const i = list.indexOf(document.activeElement);
  list[i < 0 ? 0 : (i + delta + list.length) % list.length].focus({preventScroll: true});
  sfx('uiHover');
}
function pressFocused() {
  const list = focusables(), el = document.activeElement;
  if (list.includes(el) && !el.matches('select')) el.click();
  else list[0]?.focus({preventScroll: true});
}
function showStick() {
  const el = $('stick');
  el.hidden = stick.id === null;
  if (stick.id === null) return;
  el.style.transform = `translate(${stick.ox - 56}px, ${stick.oy - 56}px)`;
  $('knob').style.transform = `translate(${stick.x * 34}px, ${stick.y * 34}px)`;
}
async function changeLanguage(lang) {
  await setLang(lang); saveLanguage(lang);
  $('language').value = lang; $('menu-language').value = lang;
  translatePage(); renderHud();
  if (mode === 'title') $('begin').textContent = hasSave ? t('Start a new trail') : t('Begin the trail');
  if (mode === 'menu') showTab(currentTab);
}

function readMove() {
  let x = 0, z = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) z -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) z += 1;
  if (stick.id !== null) { x += stick.x; z += stick.y; }
  const pad = navigator.getGamepads?.()[0];
  if (pad) {
    const ax = pad.axes[0] || 0, az = pad.axes[1] || 0;
    if (mode === 'explore' && Math.hypot(ax, az) > 0.22) { x += ax; z += az; path = null; }
    const a = !!pad.buttons[0]?.pressed, b = !!pad.buttons[1]?.pressed, start = !!pad.buttons[9]?.pressed;
    const dir = pad.buttons[12]?.pressed || az < -0.6 ? -1 : pad.buttons[13]?.pressed || az > 0.6 ? 1 : pad.buttons[14]?.pressed || ax < -0.6 ? -1 : pad.buttons[15]?.pressed || ax > 0.6 ? 1 : 0;
    if (a && !lastPad.a) { if (!onConfirm()) { if (mode === 'explore') interact(); else pressFocused(); } }
    if (b && !lastPad.b) { if (mode === 'battle') battleBack?.(); else if (mode === 'menu') closeMenu(); else if (mode === 'talk') skipTalk(); }
    if (start && !lastPad.start) { if (mode === 'explore') openMenu(); else if (mode === 'menu') closeMenu(); }
    if (mode !== 'explore' && dir && (!lastPad.dir || performance.now() - lastPad.at > 280)) {
      if (stage.marker && battleKey) battleKey({code: dir < 0 ? 'ArrowLeft' : 'ArrowRight'}); else moveFocus(dir);
      lastPad.at = performance.now();
    }
    lastPad = {...lastPad, a, b, start, dir};
  }
  const d = Math.hypot(x, z);
  if (d > 1) { x /= d; z /= d; }
  return {x, z, d: Math.min(1, d)};
}

/** A tap on the map: walk there, or to whoever or whatever was tapped and use it. */
function tapAt(cx, cy) {
  if (mode !== 'explore') return;
  const hit = pickAt(cx, cy);
  if (hit?.foe) { path = grid.path(player, hit.foe) || null; pendingUse = null; return; }
  if (hit?.thing) {
    if (inReach(hit.thing)) { interact(hit.thing); return; }
    path = grid.path(player, hit.thing.approach || hit.thing) || null; pendingUse = hit.thing;
    return;
  }
  const w = stage.toWorld(cx, cy, heightAt);
  path = grid.path(player, w); pendingUse = null;
  if (path) stage.burst(path.at(-1).x, heightAt(path.at(-1).x, path.at(-1).z) ?? player.y, path.at(-1).z, {kind: 1, count: 5, speed: 0.8, size: 0.35, life: 0.5, up: 0.2, grav: 0});
}
function pickAt(cx, cy) {
  const unit = stage.unit * stage.cam.zoom;
  let best = null, bd = 0.85 * unit;
  for (const m of mapFoes) {
    const s = stage.toScreen(m.actor.x, m.actor.y + 0.6, m.actor.z), d = Math.hypot(s.x - cx, s.y - cy);
    if (d < bd) { bd = d; best = {foe: m.actor}; }
  }
  for (const th of things()) {
    const s = stage.toScreen(th.x, th.y + (th.tall || 0.6), th.z), d = Math.hypot(s.x - cx, s.y - cy);
    if (d < bd * 1.1) { bd = d; best = {thing: th}; }
  }
  return best;
}

// ------------------------------------------------------------------------------ things to use
function things() {
  const list = [], f = state.flags;
  const at = (islet, key, dx = 0, dz = 0) => spotOf(islet, key, dx, dz);
  list.push({id: 'sign', ...at('meadow', 'sign'), reach: 1.3, verb: t('Read'), tall: 1});
  for (const n of noteActors) list.push({id: `note-${n.id}`, note: n.id, x: n.x, y: n.y, z: n.z, reach: 1.25, verb: t('Read')});
  for (const islet of Object.keys(R.CHESTS)) list.push({id: `chest-${islet}`, chest: islet, ...at(islet, 'chest'), reach: 1.35, verb: state.chests.includes(islet) ? t('Look') : t('Open')});
  for (const way of ['way1', 'way2', 'way3']) list.push({id: way, way, ...at(R.WAYSTONES[way].islet, 'way'), reach: 1.45, verb: f[way] ? t('Rest') : t('Light'), tall: 1.4});
  const at2 = a => ({x: a.x, y: a.y, z: a.z});
  if (!f.juniper) list.push({id: 'juniper', npc: 'juniper', ...at2(friends.juniper), reach: 1.6, verb: t('Talk'), tall: 1});
  if (!f.bramble) list.push({id: 'bramble', npc: 'bramble', ...at2(friends.bramble), reach: 1.9, verb: t('Talk'), tall: 1});
  list.push({id: 'beacon', beacon: true, ...at('summit', 'beacon'), reach: 2.6, verb: f.ending ? t('Look') : t('Talk'), tall: 1.6, approach: at('summit', 'beacon', 0.3, 1.9)});
  return list;
}
const inReach = th => dist(player, th) < th.reach;
function nearest() {
  let best = null, bd = Infinity;
  for (const th of things()) { const d = dist(player, th); if (d < th.reach && d < bd) { bd = d; best = th; } }
  return best;
}

async function interact(th = nearest()) {
  if (mode !== 'explore' || !th) return;
  path = null; pendingUse = null;
  faceToward(player, th);
  if (th.id === 'sign') return talk('sign');
  if (th.note) return readNote(th.note);
  if (th.chest) return openChest(th.chest);
  if (th.way) return useWaystone(th.way);
  if (th.npc === 'juniper') return meetJuniper();
  if (th.npc === 'bramble') return meetBramble();
  if (th.beacon) {
    if (state.flags.ending) return talk('beaconLit');
    if (!state.flags.bramble) return talk('beaconWait');
    return startBattle('fog');
  }
}
function faceToward(a, b) { a.flip = b.x < a.x - 0.05; a.back = b.z < a.z - 0.3 && Math.abs(b.z - a.z) > Math.abs(b.x - a.x); }

async function readNote(id) {
  state.notes.push(id); sfx('open');
  noteActors = noteActors.filter(n => n.id !== id);
  refreshActors(); save();
  await talk([{who: 'hazel', text: NOTES[id]}]);
  toast(t('Hazel’s note {n} of 5', {n: state.notes.length}));
}
async function openChest(islet) {
  if (state.chests.includes(islet)) return talk('basketEmpty');
  state.chests.push(islet); R.addItems(state, R.CHESTS[islet]); stage.opened.add(`chest-${islet}`);
  sfx('basket'); sfx('coin');
  const p = spotOf(islet, 'chest'); stage.burst(p.x, p.y + 0.4, p.z, {kind: 5, count: 14, speed: 2, size: 0.3});
  save(); renderHud();
  await talk('basket');
  toast(itemsText(R.CHESTS[islet]));
}
function itemsText(items) { return Object.entries(items).map(([k, n]) => `${t(R.ITEMS[k].name)} ×${n}`).join(' · '); }

async function useWaystone(way) {
  if (state.flags[way]) {
    R.healAll(state); state.respawn = respawnOf(way); save(); renderHud();
    sfx('lanternLight'); toast(t('Everyone rests by the waystone. Hearts are full and the trail is saved.'));
    return;
  }
  if (!R.canLight(state, way)) return talk(way === 'way3' && !state.flags.juniper ? 'oakWay' : 'wayCold');
  state.flags[way] = true; R.healAll(state); state.respawn = respawnOf(way);
  stage.setLit(way, true); addLight(way);
  const p = stage.propById[way];
  stage.burst(p.x, p.y + 1.4, p.z, {kind: 0, count: 26, speed: 2.6, size: 0.5, life: 1.2});
  sfx('lanternLight'); try { audio.stinger('chapter'); } catch {}
  save(); renderHud();
  await talk(way === 'way1' ? 'way1Lit' : 'wayLit');
  openGates();
}
function respawnOf(way) { const p = spotOf(R.WAYSTONES[way].islet, 'way', 0, 0.95); return {x: p.x, z: p.z}; }

/** Clear every mist wall whose gate opened, with a sparkle. */
function openGates() {
  for (const m of mists) {
    if (!state.flags[m.gate] || m.clearing || m.alpha === 0) continue;
    m.clearing = true;
    grid.setBlocker(m.id, null, null, 0, false);
    stage.burst(m.x, m.y + 0.5, m.z, {kind: 3, count: 24, speed: 2.4, size: 0.6, life: 1.4, up: 1});
    sfx('share');
  }
}

async function meetJuniper() {
  await talk('juniper');
  if (state.flags.juniper) { joinParty('juniper'); }
}
async function meetBramble() {
  await talk('bramble');
  R.addItems(state, {dragon: 1});
  joinParty('bramble');
  toast(itemsText({dragon: 1}));
}
function joinParty(name) {
  R.join(state, name);
  const f = friends[name];
  if (!f.npc) return; // already walking with Pip
  f.npc = false; f.sortBias = 0;
  followers = state.party.filter(n => n !== 'pip').map(n => friends[n]);
  stage.burst(f.x, f.y + 0.6, f.z, {kind: 4, count: 20, speed: 2.2, size: 0.45});
  try { audio.stinger('celebrate'); } catch {}
  audio.setIntensity(state.party.length);
  save(); refreshActors(); openGates();
}

// ------------------------------------------------------------------------------ conversations
let talking = null;
async function talk(scene) {
  const lines = typeof scene === 'string' ? SCENES[scene] : scene;
  const prev = mode;
  mode = 'talk';
  $('action').hidden = true; $('hint').classList.remove('show');
  const box = $('dialogue');
  box.hidden = false; box.classList.add('show');
  talking = {skip: false};
  let choice = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], who = line.who;
    if (talking.skip && !line.choices) continue; // skipping stops at a question
    box.dataset.who = who;
    box.className = `dialogue show ${who === 'hazel' ? 'letter' : who === 'sign' ? 'sign' : who === 'narrator' ? 'narrator' : ''}`;
    $('speaker').textContent = NAMES[who] ? t(NAMES[who]) : '';
    const hasFace = ['pip', 'momo', 'nori', 'juniper', 'bramble', 'fog'].includes(who);
    $('face').hidden = !hasFace;
    if (hasFace) paintFace($('face'), who);
    const text = t(line.text);
    $('line-live').textContent = `${NAMES[who] ? t(NAMES[who]) + ': ' : ''}${text}`;
    // camera turns toward whoever speaks
    const speaker = friends[who] || (who === 'fog' ? mapFoes.find(m => m.group === 'fog')?.actor : null);
    if (speaker && speaker !== player) speaker.talking = true;
    if (['pip', 'momo', 'nori', 'juniper', 'bramble'].includes(who)) { try { audio.babble(who, text); } catch {} }
    else if (who === 'fog') { try { audio.babble('juniper', text, {rate: 0.6}); } catch {} }
    await typewrite($('words'), text);
    if (talking.skip && !line.choices) { if (speaker) speaker.talking = false; continue; }
    if (line.choices) {
      choice = await ask(line.choices);
      if (speaker) speaker.talking = false;
      break;
    }
    $('next').hidden = false;
    await nextConfirm();
    $('next').hidden = true;
    if (speaker) speaker.talking = false;
    sfx('ui');
  }
  box.classList.remove('show'); box.hidden = true; $('choices').innerHTML = ''; $('choices').hidden = true;
  try { audio.stopBabble(); } catch {}
  talking = null;
  mode = prev === 'talk' ? 'explore' : prev;
  if (choice) {
    if (choice === 'juniperRight') { state.flags.juniper = true; R.join(state, 'juniper'); save(); }
    return talk(choice);
  }
}
function skipTalk() { if (!talking) return; talking.skip = true; typeDone?.(); const w = confirmWaiters.shift(); w?.(); }
let typeDone = null;
function typewrite(el, text) {
  if (quiet() || talking?.skip || auto.fast) { el.textContent = text; return Promise.resolve(); }
  return new Promise(resolve => {
    let i = 0, timer;
    const finish = () => { clearInterval(timer); el.textContent = text; typeDone = null; confirmWaiters = confirmWaiters.filter(w => w !== finish); resolve(); };
    typeDone = finish;
    confirmWaiters.unshift(finish); // a tap while typing shows the whole line
    el.textContent = '';
    const chars = [...text];
    timer = setInterval(() => { i += 2; el.textContent = chars.slice(0, i).join(''); if (i >= chars.length) finish(); }, 34);
  });
}
function ask(choices) {
  return new Promise(resolve => {
    const box = $('choices'); box.hidden = false; $('next').hidden = true;
    box.innerHTML = '';
    choices.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'choice'; b.textContent = t(c.text);
      b.addEventListener('click', e => { e.stopPropagation(); sfx('ui'); resolve(c.next); });
      box.appendChild(b);
      if (i === 0) setTimeout(() => b.focus({preventScroll: true}), 30);
    });
  });
}

// ------------------------------------------------------------------------------ battles
let battle = null, battleKey = null, battleBack = null, ringState = null;
const SLOTS_FRIENDS = [[-2.2, 0.35], [-2.85, -0.75], [-1.75, 1.35], [-3.35, 0.95], [-2.55, -1.75]];
const SLOTS_FOES = [[1.95, -0.1], [2.7, 1.05], [2.6, -1.25]];

async function startBattle(groupId) {
  if (mode !== 'explore' && mode !== 'talk') return;
  const g = R.groupById[groupId];
  path = null; keys.clear(); stick.id = null; showStick();
  mode = 'battle';
  $('action').hidden = true; $('hint').classList.remove('show');
  if (g.tutorial && !state.flags.tutorialSeen) await talk('m1');
  if (g.rescue && !state.flags[`${g.rescue}Met`]) { await talk(g.rescue); state.flags[`${g.rescue}Met`] = true; }
  if (g.boss) await talk('fog');
  mode = 'battle';
  sfx('whoosh');
  const b = R.newBattle(state, groupId, (Date.now() & 0xffff) + state.battles * 7919);
  const centre = g.boss ? spotOf('summit', 'fight') : g.rescue ? spotOf(g.islet, g.rescue, 0.4, 0.2) : spotOf(g.islet, g.at);
  const members = b.friends.map(f => friends[f.name]);
  const foes = mapFoes.filter(m => m.group === groupId).sort((a, c) => a.index - c.index).map(m => m.actor);
  battle = {b, g, centre, members, foes, lovely: 0, brave: 0, safe: {x: player.x, z: player.z}};
  audio.setIntensity(Math.min(5, state.party.length + 2));
  // everyone hops into place
  const homes = members.map((a, i) => ({x: centre.x + SLOTS_FRIENDS[i][0], z: centre.z + SLOTS_FRIENDS[i][1]}));
  const foeHomes = foes.map((a, i) => g.boss ? {x: centre.x + 1.9, z: centre.z - 0.7} : {x: centre.x + SLOTS_FOES[i][0], z: centre.z + SLOTS_FOES[i][1]});
  const from = [...members, ...foes].map(a => ({x: a.x, z: a.z}));
  const to = [...homes, ...foeHomes];
  for (const a of members) { a.flip = false; a.back = false; a.npc = false; a.hidden = false; }
  for (const a of foes) { a.flipX = false; a.puzzled = false; a.hidden2 = false; a.calm = 0; a.alpha = 1; }
  stage.cam.targetZoom = 1.12;
  await tween(0.55, p => {
    const e = ease(p);
    [...members, ...foes].forEach((a, i) => { a.x = from[i].x + (to[i].x - from[i].x) * e; a.z = from[i].z + (to[i].z - from[i].z) * e; ground(a); if (a.kind === 'friend') { a.hop = Math.sin(p * Math.PI) * 0.25; a.pose = 'hop0'; } });
    stage.battle = e;
  });
  for (const a of members) { a.hop = 0; a.pose = 'idle0'; }
  refreshActors();
  $('battle').hidden = false; $('hud').hidden = true;
  renderBattle();
  if (g.tutorial) battleTip(t('Choose Hug, then tap the Mistling.'));
  while (b.phase === 'command' || b.phase === 'foes') {
    if (b.phase === 'command') await friendTurn();
    else await foesTurn();
  }
  await endBattle();
}

function battleActor(name) { return battle.members[battle.b.friends.findIndex(f => f.name === name)]; }
function battleTip(text) { const el = $('battle-tip'); el.textContent = text; el.hidden = !text; }

function renderBattle() {
  const b = battle.b, cur = R.actor(b);
  $('battle-party').innerHTML = b.friends.map((f, i) => {
    const sp = R.PARTY[f.name].special;
    return `<div class="card ${f === cur && b.phase === 'command' ? 'active' : ''} ${f.heart <= 0 ? 'sleepy' : ''}" data-friend="${f.name}">
      ${face(f.name)}<div><b>${t(NAMES[f.name])}</b><span class="heart"><i style="width:${Math.round(f.heart / f.max * 100)}%"></i></span>
      <small>${f.heart <= 0 ? t('sleepy') : `${f.heart}/${f.max}`}<span class="cd">${f.cd ? ` · ${t(R.SPECIALS[sp].name)} ${t('in {n}', {n: f.cd})}` : ''}</span></small></div></div>`;
  }).join('');
  paintFaces($('battle-party'));
  for (const card of document.querySelectorAll('#battle-party .card')) card.addEventListener('click', () => pickFriend?.(card.dataset.friend));
  renderFoeLabels();
}
function renderFoeLabels() {
  const b = battle.b, box = $('foe-labels');
  box.innerHTML = b.foes.map((f, i) => f.calm ? '' : `<div class="foe-label" data-foe="${i}"><b>${t(R.FOES[f.kind].name)}</b><span class="gloom"><i style="width:${Math.round(f.gloom / f.max * 100)}%"></i></span>${f.revealed ? `<small>♥ ${t(R.LOVES[f.loves])}</small>` : ''}</div>`).join('');
  placeFoeLabels();
}
function placeFoeLabels() {
  if (!battle) return;
  for (const el of document.querySelectorAll('.foe-label')) {
    const a = battle.foes[+el.dataset.foe], size = MIST_LOOK[a.type].size * (a.scale || 1);
    const s = stage.toScreen(a.x, a.y + 0.45 + size * 1.05, a.z);
    el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
  }
}

let pickFriend = null;
async function friendTurn() {
  const b = battle.b, f = R.actor(b), a = battleActor(f.name);
  renderBattle();
  const cmds = R.commands(b, state);
  a.pose = 'talk0';
  const cmd = auto.battles ? botCommand(b, f, cmds) : await chooseCommand(f, cmds);
  if (!cmd) return; // turn re-asked
  a.pose = 'idle0';
  await perform(f, a, cmd);
}

function chooseCommand(f, cmds) {
  return new Promise(resolve => {
    const box = $('commands');
    $('turn').textContent = t('{name}’s turn', {name: t(NAMES[f.name])});
    const label = id => ({hug: t('Hug'), fruit: t('Fruit'), guard: t('Guard')})[id] || t(R.SPECIALS[id].name);
    const helpOf = id => ({hug: t('A warm hug calms one Mistling.'), fruit: t('Share fruit from the basket.'), guard: t('Brace together: half the chill this round.')})[id] || t(R.SPECIALS[id].help);
    box.innerHTML = cmds.map((c, i) => `<button class="cmd ${c.special ? 'special' : ''} cmd-${c.id}" data-i="${i}" ${c.ready === false ? 'disabled' : ''}><span class="key">${i + 1}</span><b>${label(c.id)}</b><small>${c.ready === false && c.special ? t('ready in {n}', {n: f.cd}) : helpOf(c.id)}</small></button>`).join('');
    box.hidden = false; $('back').hidden = true;
    const pick = async i => {
      const c = cmds[i];
      if (!c || c.ready === false) { sfx('invalid'); return; }
      sfx('ui');
      cleanup();
      let target, item, friend;
      if (R.TARGETED.has(c.id)) { target = await chooseFoe(); if (target === null) return resolve(chooseCommand(f, cmds)); }
      if (c.id === 'fruit') { const r = await chooseFruit(); if (!r) return resolve(chooseCommand(f, cmds)); ({item, friend} = r); }
      resolve({id: c.id, target, item, friend});
    };
    const buttons = [...box.querySelectorAll('button')];
    buttons.forEach(btn => btn.addEventListener('click', () => pick(+btn.dataset.i)));
    const first = buttons.find(btn => !btn.disabled); setTimeout(() => first?.focus({preventScroll: true}), 20);
    battleKey = e => { const n = Number(e.key); if (n >= 1 && n <= cmds.length) { pick(n - 1); return true; } return false; };
    battleBack = null;
    function cleanup() { battleKey = null; box.hidden = true; }
  });
}

function chooseFoe() {
  const b = battle.b, alive = R.active(b);
  if (alive.length === 1) return Promise.resolve(alive[0].i);
  return new Promise(resolve => {
    let idx = Math.max(0, alive.findIndex(f => f.i === battle.lastTarget));
    const show = () => { const a = battle.foes[alive[idx].i]; stage.marker = {x: a.x, y: a.y, z: a.z, h: 0.4 + MIST_LOOK[a.type].size * (a.scale || 1)}; };
    show();
    battleTip(touch ? t('Tap a Mistling.') : t('Pick a Mistling: arrows, then Enter. Or click one.'));
    $('back').hidden = false;
    const done = v => { stage.marker = null; battleKey = null; battleBack = null; tapHandler = null; $('back').hidden = true; confirmWaiters = confirmWaiters.filter(w => w !== confirm); battleTip(''); if (v !== null) battle.lastTarget = v; resolve(v); };
    const confirm = () => done(alive[idx].i);
    confirmWaiters.push(confirm);
    battleKey = e => {
      if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(e.code)) { idx = (idx + alive.length - 1) % alive.length; show(); sfx('uiHover'); return true; }
      if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(e.code)) { idx = (idx + 1) % alive.length; show(); sfx('uiHover'); return true; }
      return false;
    };
    battleBack = () => done(null);
    $('back').onclick = () => done(null);
    tapHandler = e => {
      const unit = stage.unit * stage.cam.zoom;
      let best = -1, bd = 1.1 * unit;
      alive.forEach((f, j) => { const a = battle.foes[f.i], s = stage.toScreen(a.x, a.y + 0.5 + MIST_LOOK[a.type].size * 0.4, a.z), d = Math.hypot(s.x - e.clientX, s.y - e.clientY); if (d < bd) { bd = d; best = j; } });
      if (best >= 0) { idx = best; show(); done(alive[idx].i); }
    };
  });
}

function chooseFruit() {
  return new Promise(resolve => {
    const box = $('fruit-pick'), b = battle.b;
    const entries = Object.entries(state.items).filter(([, n]) => n > 0);
    box.innerHTML = entries.map(([id, n]) => `<button class="fruit" data-item="${id}"><span class="fruit-icon" style="${fruitStyle(R.ITEMS[id].fruit)}"></span><b>${t(R.ITEMS[id].name)} ×${n}</b><small>${t(R.ITEMS[id].help)}</small></button>`).join('');
    box.hidden = false; $('back').hidden = false;
    const finish = v => { box.hidden = true; $('back').hidden = true; battleBack = null; pickFriend = null; battleTip(''); resolve(v); };
    battleBack = () => finish(null);
    $('back').onclick = () => finish(null);
    for (const btn of box.querySelectorAll('button')) btn.addEventListener('click', () => {
      const item = btn.dataset.item, it = R.ITEMS[item];
      sfx('ui');
      if (it.healAll || it.reviveAll) return finish({item});
      // single fruit: who gets it? the friend who needs it most is suggested
      box.hidden = true;
      const need = b.friends.filter(f => it.wake ? f.heart <= 0 : f.heart > 0 && f.heart < f.max);
      if (!need.length) { toast(t('Nobody needs that right now.')); box.hidden = false; return; }
      battleTip(t('Who gets the {fruit}? Tap a friend’s card.', {fruit: t(it.name)}));
      for (const card of document.querySelectorAll('#battle-party .card')) card.classList.toggle('pickable', need.some(f => f.name === card.dataset.friend));
      pickFriend = name => { if (need.some(f => f.name === name)) { for (const c of document.querySelectorAll('.card.pickable')) c.classList.remove('pickable'); finish({item, friend: name}); } };
      if (need.length === 1) pickFriend(need[0].name);
    });
    setTimeout(() => box.querySelector('button')?.focus({preventScroll: true}), 20);
  });
}
// fruit icons come from the light stage's fruit atlas (4 x 3 cells), already cached for picnic players
const FRUIT_ATLAS = new URL('./assets/lantern-picnic/2d/fruit-wide.webp', document.baseURI).href;
const fruitStyle = level => `background-image:url(${FRUIT_ATLAS});background-size:400% 300%;background-position:${(level % 4) / 3 * 100}% ${Math.floor(level / 4) / 2 * 100}%`;

function botCommand(b, f, cmds) {
  const foes = R.active(b), weakest = foes.reduce((a, x) => x.gloom < a.gloom ? x : a, foes[0]);
  const has = id => cmds.find(c => c.id === id && c.ready !== false);
  const hurt = b.friends.filter(m => m.heart > 0 && m.heart < m.max * 0.4);
  if (has('letter')) return {id: 'letter'};
  if (f.name === 'momo' && has('tea') && hurt.length) return {id: 'tea'};
  if (f.name === 'pip' && has('glow') && foes.length > 1) return {id: 'glow'};
  if (f.name === 'nori' && has('kite')) return {id: 'kite', target: weakest.i};
  if (f.name === 'bramble' && has('shield') && !b.shield) return {id: 'shield'};
  return {id: 'hug', target: weakest.i};
}

/** The shrinking-ring timing: resolves 'lovely' when tapped as the rings meet. */
async function timingRing(target, dur = 0.85) {
  if (auto.battles) { await wait(dur); return 'lovely'; }
  const help = prefs.timingHelp, start = help ? 0.5 : 0.7, late = help ? 0.24 : 0.13;
  stage.ring = {x: target.x, y: target.y, z: target.z, h: target.kind === 'foe' ? 0.55 + MIST_LOOK[target.type].size * 0.35 : 0.6, t: 0, dur, sweet: false};
  ringState = {press: null};
  await tween(dur + late, p => {
    const tt = p * (dur + late);
    stage.ring.t = Math.min(dur, tt);
    stage.ring.sweet = tt >= dur * start;
    return ringState.press !== null; // a tap ends the ring at once
  });
  const pressed = ringState.press;
  ringState = null; stage.ring = null;
  return pressed !== null && pressed >= dur * start ? 'lovely' : null;
}

async function perform(f, a, cmd) {
  const b = battle.b, target = cmd.target !== undefined ? battle.foes[cmd.target] : null;
  let timing = null;
  const home = {x: a.x, z: a.z};
  if (['hug', 'kite', 'riddle'].includes(cmd.id)) {
    // step toward the Mistling, then the timing ring
    const to = {x: target.x - 0.9, z: target.z + 0.15};
    await tween(0.22, p => { const e = ease(p); a.x = home.x + (to.x - home.x) * e; a.z = home.z + (to.z - home.z) * e; ground(a); a.hop = Math.sin(p * Math.PI) * 0.35; a.pose = 'hop0'; });
    a.hop = 0; a.pose = cmd.id === 'riddle' ? 'talk0' : 'cheer0';
    if (b.round === 1 && battle.g.tutorial && !state.flags.tutorialSeen) battleTip(t('Tap (or press Space) as the rings meet for a Lovely hug!'));
    timing = await timingRing(target);
    battleTip('');
  } else if (cmd.id === 'glow' || cmd.id === 'letter') {
    a.pose = 'cheer1';
    const c = battle.foes.find(x => !x.calm) || target;
    timing = cmd.id === 'glow' ? await timingRing({...c, kind: 'foe', type: c.type}, 0.95) : null;
  } else if (cmd.id === 'tea' || cmd.id === 'shield') {
    a.pose = cmd.id === 'tea' ? 'eat0' : 'cheer0';
    timing = cmd.id === 'tea' ? await timingRing(a, 0.9) : null;
  } else if (cmd.id === 'fruit') a.pose = 'eat1';
  else if (cmd.id === 'guard') a.pose = 'idle1';
  const events = R.act(b, state, cmd, timing);
  if (!events.length) {
    a.pose = 'idle0'; a.x = home.x; a.z = home.z; ground(a);
    if (cmd.id === 'tea') toast(t('Everyone is already full of heart.'));
    return;
  }
  if (timing === 'lovely') { battle.lovely++; stage.text(t('Lovely!'), a.x, a.y + 0.4, a.z, '#ffe27a', 1.15); sfx('star'); }
  await showEvents(events, a);
  if (['hug', 'kite', 'riddle'].includes(cmd.id)) {
    const from = {x: a.x, z: a.z};
    await tween(0.25, p => { const e = ease(p); a.x = from.x + (home.x - from.x) * e; a.z = from.z + (home.z - from.z) * e; ground(a); a.hop = Math.sin(p * Math.PI) * 0.25; a.pose = 'hop1'; });
  }
  a.hop = 0; a.pose = 'idle0';
  renderBattle();
}

async function showEvents(events, actor) {
  for (const e of events) {
    if (e.type === 'calm') {
      const foe = battle.foes[e.foe];
      foe.hit = 1; stage.shake(e.loved ? 0.25 : 0.15);
      stage.cam.kickX = 0.08;
      stage.burst(foe.x, foe.y + 0.6, foe.z, {kind: e.lovely ? 0 : 1, count: e.loved ? 16 : 10, speed: 2.2, size: 0.42});
      stage.text(`${e.amount}`, foe.x, foe.y + 0.75 + MIST_LOOK[foe.type].size * 0.4, foe.z, e.loved ? '#ffc6e0' : '#fff3c4', e.loved ? 1.2 : 1);
      if (e.loved) setTimeout(() => stage.text(t('It loves that!'), foe.x, foe.y + 1.3 + MIST_LOOK[foe.type].size * 0.4, foe.z, '#ffd2e6', 0.8), 120);
      sfx('merge', {tier: e.loved ? 6 : 3, chain: e.lovely ? 2 : 1});
      if (e.letter) { await talk('fogHalf'); mode = 'battle'; }
      await wait(0.28);
    } else if (e.type === 'calmed') {
      const foe = battle.foes[e.foe];
      sfx('share');
      await tween(0.6, p => { foe.calm = p; foe.rise = p * 0.5; });
      stage.burst(foe.x, foe.y + 0.8, foe.z, {kind: 2, count: 18, speed: 1.6, size: 0.4, life: 1.4, up: 1.6, grav: -0.5});
      renderFoeLabels();
    } else if (e.type === 'miss') {
      const foe = battle.foes[e.foe];
      stage.text(t('It’s hiding!'), foe.x, foe.y + 1.1, foe.z, '#d8e8ff', 0.9); sfx('invalid'); await wait(0.35);
    } else if (e.type === 'puzzled') {
      const foe = battle.foes[e.foe]; foe.puzzled = true;
      stage.text(t('Puzzled!'), foe.x, foe.y + 1.2, foe.z, '#e2d4ff', 1); sfx('pick'); await wait(0.25); renderFoeLabels();
    } else if (e.type === 'heal') {
      const m = battleActor(e.friend);
      m.flash = 1; m.flashCool = false;
      stage.burst(m.x, m.y + 0.6, m.z, {kind: 4, count: 10, speed: 1.4, size: 0.35, up: 1.2, grav: -0.4});
      stage.text(e.woke ? t('Awake!') : `+${e.amount}`, m.x, m.y + 0.5, m.z, '#c9ffc4', 1);
      if (e.woke) { const s = battle.b.friends.find(x => x.name === e.friend); if (s) m.sleepy = false; }
      sfx('eat'); await wait(0.22);
    } else if (e.type === 'shield') {
      for (const m of battle.members) { m.flash = 1; m.flashCool = true; }
      stage.text(t('Lantern Shield!'), actor.x, actor.y + 0.6, actor.z, '#d2e6ff', 1); sfx('thread'); await wait(0.35);
    } else if (e.type === 'guard') {
      stage.text(t('Braced'), actor.x, actor.y + 0.5, actor.z, '#e8f0ff', 0.85); sfx('drop'); await wait(0.2);
    } else if (e.type === 'letter') {
      stage.text(t('Hazel’s notes ×{n}', {n: e.notes}), actor.x, actor.y + 0.6, actor.z, '#fff0c8', 1); sfx('open'); await wait(0.3);
    }
  }
  renderFoeLabels();
}

async function foesTurn() {
  const b = battle.b;
  $('turn').textContent = t('The mist stirs…');
  renderBattle();
  for (let guard = 0; guard < 12; guard++) {
    const plan = R.planFoe(b);
    if (!plan) break;
    const foe = battle.foes[plan.foe];
    if (plan.move === 'puzzled' || plan.move === 'sulk' || plan.move === 'hide' || plan.move === 'bank' || plan.move === 'idle') {
      const events = R.applyFoe(b, plan);
      const words = {puzzled: t('Still puzzled…'), sulk: t('Sulking…'), hide: t('Hides in the fog!'), bank: t('Gathers its fog!'), idle: '…'}[plan.move];
      stage.text(words, foe.x, foe.y + 1.2 + MIST_LOOK[foe.type].size * 0.3, foe.z, '#e0dcff', 0.85);
      foe.hidden2 = plan.move === 'hide' || plan.move === 'bank';
      if (plan.move === 'puzzled') foe.puzzled = b.foes[plan.foe].puzzled > 0;
      for (const e of events) if (e.type === 'bank') stage.text(`+${e.amount}`, foe.x, foe.y + 0.8, foe.z, '#c9c4ff', 0.9);
      sfx(plan.move === 'puzzled' ? 'pick' : 'whoosh');
      renderFoeLabels();
      await wait(0.55);
      continue;
    }
    // a chill drifts toward its target; brace by tapping as it lands
    const targets = plan.targets.map(n => battleActor(n));
    const lead = targets[0], from = {x: foe.x, z: foe.z};
    const to = plan.move === 'drizzle' ? from : {x: lead.x + 0.85, z: lead.z - 0.1};
    if (!state.flags.braceSeen) battleTip(t('Tap (or press Space) as the mist reaches you to brace!'));
    const brave = await (async () => {
      const ring = timingRing(lead, plan.move === 'sigh' ? 0.9 : 0.75);
      await tween(0.5, p => { const e = ease(p); foe.x = from.x + (to.x - from.x) * e; foe.z = from.z + (to.z - from.z) * e; foe.rise = Math.sin(p * Math.PI) * 0.2; });
      return (await ring) === 'lovely';
    })();
    battleTip('');
    if (!state.flags.braceSeen) state.flags.braceSeen = true;
    const events = R.applyFoe(b, plan, brave);
    if (brave) { battle.brave++; stage.text(t('Brave!'), lead.x, lead.y + 1.1, lead.z, '#bfe3ff', 1.1); sfx('star'); }
    for (const e of events) if (e.type === 'chill') {
      const m = battleActor(e.friend);
      m.flash = 1; m.flashCool = true; stage.shake(e.brave ? 0.12 : 0.3);
      stage.burst(m.x, m.y + 0.6, m.z, {kind: 3, count: e.brave ? 6 : 12, speed: 1.8, size: 0.4});
      stage.text(`-${e.amount}`, m.x, m.y + 0.3, m.z, '#cfe0ff', 1);
      if (e.sleepy) { m.sleepy = true; stage.text(t('Sleepy…'), m.x, m.y + 0.9, m.z, '#e6e0ff', 0.85); }
    }
    sfx(plan.move === 'drizzle' ? 'splash' : 'land', {size: 0.6});
    renderBattle();
    await tween(0.35, p => { const e = ease(p); foe.x = to.x + (from.x - to.x) * e; foe.z = to.z + (from.z - to.z) * e; foe.rise = 0; });
    if (b.phase === 'lost') break;
  }
  if (b.phase === 'foes') R.endRound(b);
  battle.foes.forEach((f, i) => { f.hidden2 = !!b.foes[i].hidden; f.puzzled = b.foes[i].puzzled > 0; });
  renderBattle();
}

async function endBattle() {
  const {b, g} = battle;
  $('battle').hidden = true; battleTip('');
  stage.marker = null; stage.ring = null;
  if (g.tutorial) state.flags.tutorialSeen = true;
  const result = R.finishBattle(state, b), won = result.won, gid = g.id;
  // Write the whole outcome before any scene plays, so a page closed mid-scene keeps a consistent story
  if (won && g.rescue) R.join(state, g.rescue);
  if (won && g.boss) state.flags.ending = true;
  if (!won) { R.healAll(state); safePos = state.respawn || startPoint(); }
  save();
  if (won) {
    sfx('cheer'); try { audio.stinger('celebrate'); } catch {}
    for (const m of battle.members) if (m.heart !== 0) { m.pose = 'cheer0'; m.sleepy = false; }
    for (const f of battle.foes) stage.burst(f.x, f.y + 1, f.z, {kind: 2, count: 10, speed: 1.2, size: 0.4, up: 2, grav: -0.6, life: 1.6});
    await tween(0.9, p => { for (const f of battle.foes) { f.rise = 0.5 + p * 2.5; f.alpha = 1 - p; } for (const m of battle.members) m.hop = Math.abs(Math.sin(p * Math.PI * 2)) * 0.3; });
    const lines = [t('+{n} glow', {n: result.glow})];
    if (Object.keys(result.drops || {}).length) lines.push(itemsText(result.drops));
    toast(lines.join(' · '));
    if (result.after > result.before) {
      sfx('skewerDone');
      setTimeout(() => toast(t('Level {n}! Hearts and hugs grow stronger.', {n: result.after})), 1400);
    }
    if (battle.lovely + battle.brave >= 3) setTimeout(() => stage.text(t('What teamwork!'), player.x, player.y + 1.6, player.z, '#fff0c8'), 300);
  } else {
    sfx('undo');
    stage.fadeColor = '#1a1430';
    await tween(0.9, p => { stage.fade = p * 0.85; });
  }
  for (const m of battle.members) { m.hop = 0; m.pose = 'idle0'; m.flash = 0; m.sleepy = false; }
  stage.cam.targetZoom = 1;
  const home = battle.safe;
  battle = null;
  await tween(0.4, p => { stage.battle = 1 - p; });
  stage.battle = 0;
  mapFoes = mapFoes.filter(m => !(won && m.group === gid));
  if (won) {
    // a battle slot may stand in a bush: Pip steps back to where the battle began
    placePlayer(home.x, home.z);
    if (gid === 'm1') await talk('m1Won');
    if (g.rescue) { await talk(`${g.rescue}Join`); joinParty(g.rescue); }
  } else {
    await talk('sleepy');
    placePlayer(safePos.x, safePos.z); stage.snap(player.x, player.y, player.z);
    for (const m of mapFoes) if (m.group === gid) { m.cooldown = 6; const i = m.index; Object.assign(m.actor, {x: m.home.x + (i - 1) * 0.9, z: m.home.z, alpha: 1, calm: 0, rise: 0, hidden2: false, puzzled: false}); ground(m.actor); }
    await tween(0.8, p => { stage.fade = 0.85 * (1 - p); });
    stage.fade = 0;
  }
  safePos = null;
  unstick();
  // friends fall back in line behind Pip
  trail = [];
  for (const f of followers) { f.x = player.x - 0.3; f.z = player.z + 0.4; ground(f); }
  syncWorld();
  audio.setIntensity(state.party.length);
  if (won && g.boss) return ending();
  mode = 'explore'; $('hud').hidden = false;
  save(); renderHud();
}

async function ending() {
  mode = 'talk';
  state.flags.ending = true;
  const beacon = stage.propById.beacon;
  stage.setLit('beacon', true); addLight('beacon', 2.6, 4.2);
  stage.burst(beacon.x, beacon.y + 2.5, beacon.z, {kind: 0, count: 60, speed: 4, size: 0.7, life: 2, up: 2, grav: 0.4});
  for (let i = 0; i < 4; i++) setTimeout(() => stage.burst(beacon.x + (Math.random() - 0.5) * 4, beacon.y + 1, beacon.z + (Math.random() - 0.5) * 3, {kind: 2, count: 25, speed: 1.5, size: 0.4, up: 3, grav: -0.8, life: 2.4}), i * 450);
  try { audio.stinger('finale'); } catch {}
  stage.cam.targetZoom = 0.9;
  focus = {x: beacon.x + 0.8, y: beacon.y + 1.2, z: beacon.z + 0.6};
  // far across the clouds, a single lantern answers
  const answer = {id: 'answer', x: beacon.x + 3.4, y: beacon.y + 4.6, z: beacon.z - 3.2, dx: 0, dv: 0, r: 0.42, pool: 0, alpha: 0};
  stage.lights.push(answer);
  tween(3.2, p => { answer.alpha = Math.max(0, p * 1.3 - 0.3) * 0.95; });
  save();
  await talk('ending');
  // the end card
  $('hud').hidden = true; $('toast').classList.remove('show'); stage.texts.length = 0;
  const min = Math.max(1, Math.round(state.time / 60));
  $('ending-stats').innerHTML = [
    [t('Friends found'), `${state.party.length}/5`], [t('Hazel’s notes'), `${state.notes.length}/5`],
    [t('Lovely moments'), state.lovely || 0], [t('Minutes on the trail'), min],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('ending').hidden = false; mode = 'ending'; focus = null;
  $('ending-home').focus({preventScroll: true});
}

// ------------------------------------------------------------------------------ menu
let currentTab = 'bag';
function openMenu() {
  if (mode !== 'explore') return;
  mode = 'menu'; sfx('open');
  syncSettings();
  showTab(currentTab);
  const d = $('menu'); if (!d.open) d.showModal();
}
function closeMenu() {
  const d = $('menu'); if (d.open) d.close();
  if (mode === 'menu') mode = 'explore';
  sfx('close'); renderHud();
  $('trail').focus({preventScroll: true});
}
function syncSettings() {
  $('opt-sound').checked = prefs.sound; $('opt-timing').checked = prefs.timingHelp; $('opt-calm').checked = prefs.calm;
  $('menu-language').value = getLang();
}
function showTab(tab) {
  currentTab = tab;
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== tab;
  const level = R.levelOf(state.glow);
  if (tab === 'bag') {
    const entries = Object.entries(state.items).filter(([, n]) => n > 0);
    $('bag-list').innerHTML = entries.length ? entries.map(([id, n]) => `<li><span class="fruit-icon" style="${fruitStyle(R.ITEMS[id].fruit)}"></span><div><b>${t(R.ITEMS[id].name)} ×${n}</b><small>${t(R.ITEMS[id].help)}</small></div><button class="small-button" data-use="${id}">${t('Use')}</button></li>`).join('') : `<li class="empty">${t('The basket is empty. Hazel hid picnic baskets on every islet.')}</li>`;
    for (const b of $('bag-list').querySelectorAll('[data-use]')) b.addEventListener('click', () => useFromBag(b.dataset.use));
  }
  if (tab === 'party') {
    $('party-list').innerHTML = state.party.map(n => {
      const sp = R.SPECIALS[R.PARTY[n].special];
      return `<li>${face(n)}<div><b>${t(NAMES[n])}</b><small>${t('Heart {h}/{max} · Warmth {w}', {h: state.hearts[n], max: R.maxHeart(n, level), w: R.warmthOf(n, level)})}</small><small><em>${t(sp.name)}</em>: ${t(sp.help)}</small></div></li>`;
    }).join('') + `<li class="empty">${t('Level {n} · {g} glow', {n: level, g: state.glow})}</li>`;
    paintFaces($('party-list'));
  }
  if (tab === 'notes') {
    $('notes-list').innerHTML = state.notes.length ? state.notes.map(id => `<li class="note"><small>${t(PLACES[id])}</small><p>${t(NOTES[id])}</p></li>`).join('') : `<li class="empty">${t('No notes yet. Hazel tucked five of them along the trail.')}</li>`;
  }
}
function useFromBag(id) {
  const it = R.ITEMS[id];
  let target = 'pip';
  if (!it.healAll && !it.reviveAll) {
    const level = R.levelOf(state.glow);
    const need = state.party.filter(n => it.wake ? state.hearts[n] <= 0 : state.hearts[n] < R.maxHeart(n, level)).sort((a, b) => state.hearts[a] / R.maxHeart(a, level) - state.hearts[b] / R.maxHeart(b, level));
    if (!need.length) { toast(t('Everyone is already full of heart.')); return; }
    target = need[0];
  }
  const r = R.useItemOutside(state, id, target);
  if (!r) { toast(t('Everyone is already full of heart.')); return; }
  sfx('eat'); save(); renderHud(); showTab('bag');
  toast(t('{name} shared the {fruit}.', {name: t(NAMES[target]), fruit: t(it.name)}));
}

// ------------------------------------------------------------------------------ the frame
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  time += dt;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t += dt;
    const p = Math.min(1, tw.t / tw.d), stop = tw.fn(p) === true;
    if (p >= 1 || stop) { tweens.splice(i, 1); tw.resolve(); }
  }
  if (mode === 'explore') updateExplore(dt);
  else if (mode === 'title') {
    // the camera drifts slowly over the islets behind the title
    const a = time * 0.05;
    stage.follow(Math.sin(a) * 6, 1, Math.cos(a * 0.8) * 9 - 3, 0, 0, dt, 0.6);
  } else if (mode !== 'ending') stage.follow(focusPoint().x, focusPoint().y, focusPoint().z, 0, 0, dt, 3.5);
  if (mode === 'battle' || mode === 'talk' || mode === 'explore' || mode === 'menu') state.time += dt;
  animateActors(dt);
  readMove(); // keeps the gamepad's buttons live in every mode
  stage.update(dt);
  stage.draw();
  stage.govern(dt);
  if (battle) placeFoeLabels();
  requestAnimationFrame(frame);
}
let focus = null; // a cinematic's subject, when the camera should leave Pip
function focusPoint() {
  if (focus) return focus;
  if (battle) return {x: battle.centre.x + 0.1, y: battle.centre.y, z: battle.centre.z + 0.4};
  return player;
}

function updateExplore(dt) {
  let input = readMove();
  if (input.d < 0.08 && path?.length) {
    const next = path[0], dx = next.x - player.x, dz = next.z - player.z, d = Math.hypot(dx, dz);
    if (d < 0.18) { path.shift(); if (!path.length) { path = null; if (pendingUse && inReach(pendingUse)) { const th = pendingUse; pendingUse = null; interact(th); } } }
    else input = {x: dx / d, z: dz / d, d: 1};
  } else if (input.d >= 0.08) { path = null; pendingUse = null; }
  const tvx = input.x * SPEED * (input.d > 0.08 ? 1 : 0), tvz = input.z * SPEED * (input.d > 0.08 ? 1 : 0);
  player.vx = damp(player.vx, tvx, 22, dt); player.vz = damp(player.vz, tvz, 22, dt);
  const before = {x: player.x, z: player.z};
  const moved = grid.move(player.x, player.z, player.vx * dt, player.vz * dt);
  player.x = moved.x; player.z = moved.z; ground(player);
  const step = Math.hypot(player.x - before.x, player.z - before.z);
  if (step > 0.0005) {
    if (!trail.length || dist(trail.at(-1), player) > 0.1) { trail.push({x: player.x, y: player.y, z: player.z}); if (trail.length > 80) trail.shift(); }
  }
  // followers keep to Pip's footsteps, about one friend-length apart
  followers.forEach((f, i) => {
    const back = (i + 1) * 8, p = trail[trail.length - 1 - back];
    if (!p) return;
    const fx = f.x, fz = f.z;
    if (dist(f, p) > 4) { f.x = p.x; f.z = p.z; } else { f.x = damp(f.x, p.x, 9, dt); f.z = damp(f.z, p.z, 9, dt); }
    ground(f);
    f.vx = (f.x - fx) / dt; f.vz = (f.z - fz) / dt;
  });
  stage.follow(player.x, player.y, player.z, player.vx, player.vz, dt);
  // Mistlings wander, and come closer when Pip does
  for (const m of mapFoes) {
    const a = m.actor, g = R.groupById[m.group];
    m.cooldown = Math.max(0, m.cooldown - dt);
    if (g.rescue) { // circling the friend they are pestering
      m.angle += dt * (quiet() ? 0.3 : 0.85);
      const c = friends[g.rescue];
      a.x = c.x + Math.cos(m.angle + m.index * 2.1) * 1.25; a.z = c.z + Math.sin(m.angle + m.index * 2.1) * 0.85; ground(a);
      if (!m.cooldown && dist(player, c) < 2.4 && mode === 'explore') { startBattle(m.group); return; }
      continue;
    }
    if (g.boss) {
      a.x = m.home.x; a.z = m.home.z; a.y = m.home.y + 0.7; // curled on top of the beacon
      if (state.flags.bramble && !m.cooldown && dist(player, m.home) < 2.3 && mode === 'explore') { startBattle('fog'); return; }
      continue;
    }
    const dp = dist(player, a);
    let tx = m.wander.x, tz = m.wander.z;
    m.wander.t -= dt;
    if (m.wander.t <= 0) { const ang = Math.random() * Math.PI * 2, r = Math.random() * 1.2; m.wander = {x: m.home.x + Math.cos(ang) * r + (m.index - 1) * 0.6, z: m.home.z + Math.sin(ang) * r * 0.7, t: 2 + Math.random() * 3}; }
    const chase = !m.cooldown && dp < 3 && dist(player, m.home) < 4.2;
    if (chase) { tx = player.x; tz = player.z; }
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz), sp = chase ? 1.5 : 0.5;
    if (d > 0.05) { const mv = grid.move(a.x, a.z, dx / d * Math.min(d, sp * dt), dz / d * Math.min(d, sp * dt), 0.18); a.x = mv.x; a.z = mv.z; ground(a); a.flipX = dx < 0; }
    if (!m.cooldown && dp < 0.8 && mode === 'explore') { startBattle(m.group); return; }
  }
  // the walls of mist ask for something warm
  for (const m of mists) {
    if (m.alpha <= 0.5 || m.clearing) continue;
    if (dist(player, m) < 1.5 && time - (m.told || -99) > 8) { m.told = time; talk('bridgeMist'); return; }
  }
  // islet names when stepping onto one
  const I = MAP.ISLETS.find(I => ((player.x - I.x) / I.rx) ** 2 + ((player.z - I.z) / I.rz) ** 2 < 0.7);
  if (I && I.id !== placeShown) { placeShown = I.id; banner(t(PLACES[I.id])); }
  // the action button
  const th = nearest();
  const btn = $('action');
  btn.hidden = !th;
  if (th) { const label = th.verb; if (btn.dataset.label !== label) { btn.dataset.label = label; $('action-label').textContent = label; } }
  autosave += dt;
  if (autosave > 8) { autosave = 0; save(); }
  idleHint += dt;
  if (step > 0.001) idleHint = 0;
}

function animateActors(dt) {
  const all = [player, ...followers, ...R.ORDER.map(n => friends[n]).filter(f => f.npc)];
  for (const a of all) {
    if (a.flash) a.flash = Math.max(0, a.flash - dt * 2.5);
    if (battle && battle.members.includes(a)) {
      if (a.sleepy) continue;
      if (a.pose === 'idle0' || a.pose === 'idle1') a.pose = Math.sin(time * 2 + a.x) > 0 ? 'idle0' : 'idle1';
      continue;
    }
    const v = Math.hypot(a.vx || 0, a.vz || 0);
    if (a === player || followers.includes(a)) {
      if (v > 0.3) {
        a.walk += v * dt;
        if (Math.abs(a.vx) > 0.2) a.flip = a.vx < 0;
        a.back = a.vz < -0.35 * v ? true : a.vz > 0.2 * v ? false : a.back;
        const f = Math.floor(a.walk / 0.24) % 4;
        a.pose = `${a.back ? 'bwalk' : 'walk'}${f}`;
        if (a === player && f !== a.lastStep && (f === 0 || f === 2)) sfx('footstep', {size: 0.35});
        a.lastStep = f;
      } else a.pose = a.back ? 'back0' : (Math.sin(time * 1.6 + a.x) > 0.2 ? 'idle1' : 'idle0');
    } else if (a.npc) {
      // waiting friends turn toward Pip, and fret when the mist pesters them
      const near = dist(player, a) < 4;
      if (near && mode === 'explore') a.flip = player.x < a.x;
      const pestered = mapFoes.some(m => R.groupById[m.group].rescue === a.name);
      a.pose = a.talking ? (Math.sin(time * 9) > 0 ? 'talk0' : 'talk1') : pestered ? (Math.sin(time * 5 + a.x) > 0.6 ? 'hop0' : 'idle1') : near ? 'wave0' : (Math.sin(time * 1.4 + a.z) > 0 ? 'idle0' : 'idle1');
      if (a.name === 'bramble' && !near) a.pose = 'idle1';
    }
    if (a.talking && !a.npc) a.pose = Math.sin(time * 9) > 0 ? 'talk0' : 'talk1';
  }
  for (const m of mapFoes) if (m.actor.hit) m.actor.hit = Math.max(0, m.actor.hit - dt * 4);
}

// ------------------------------------------------------------------------------ test hooks
if (DEBUG) {
  window.__trail = {
    get state() { return state; }, get stage() { return stage; }, get grid() { return grid; }, get mode() { return mode; }, get battle() { return battle; },
    player, friends, things, R, MAP,
    teleport(x, z) { placePlayer(x, z); stage.snap(player.x, player.y, player.z); },
    interact: th => interact(typeof th === 'string' ? things().find(x => x.id === th) : th),
    startBattle, joinParty, openGates,
    /** Play the current battle to the end with the rules' bot (no animations). */
    auto,
    confirm: () => onConfirm(),
    waiters: () => confirmWaiters.length,
    perf: () => ({...stage.stats, dpr: stage.dpr, unit: stage.unit}),
  };
}

boot();
