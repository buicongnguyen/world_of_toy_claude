import {t, setLanguage, getLanguage, number, bindStaticText} from './lantern-i18n.js';
import {FRUITS, FRUIT_ORDER, BASKET, PLATE, itemTier, nextItemLevel, mergeGroup} from './picnic-game.js';
import {LANTERN_SAVE, CHAPTERS, SKEWER, LAST, chapter, newLantern, loadLantern, readableSave, settleFruits, dropLantern, tapBasket, nextChapter, nextSupply, needed,
  planLanternMerge, starsFor, replayChapter, leaveReplay, totalStars, seedChapter} from './lantern-game.js';
import {STORY, PROLOGUE, REPLY, FINALE, NAMES, ENDING} from './lantern-story.js';
// Phones and modest computers play on the light 2D stage; capable computers get 3D, whose engine,
// models and shaders are only downloaded when it is chosen.
import {Stage2D, StageArt} from './lantern-stage2d.js';
import {QUALITY, GRAPHICS, is3d, resolveGraphics} from './engine/quality.js';
import {AudioEngine} from './engine/audio.js';
import {PicnicCoins} from './picnic-coins.js';
import {SHOP, KINDS, balance, buy, equip, owns, equipped, keepForRestart} from './lantern-shop.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug'), QUICK = params.has('quick') || params.has('play');
const SETTINGS_KEY = 'little-keepsakes-settings-v1';
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const TIMES = {afternoon: 'Afternoon', golden: 'Golden hour', sunset: 'Sunset', dusk: 'Dusk', night: 'Night'};
const icon = (name, size = 34) => `<img src="./assets/lantern-picnic/icons/${name}.png" width="${size}" height="${size}" alt="" draggable="false">`;
const fruitIcon = (level, size = 34) => icon(`fruit_${level}`, size);
// Blender-rendered UI art (art/blender/render_ui.py) and shop previews (art/blender/render_shop.py)
const uiSrc = name => `./assets/lantern-picnic/ui/${name}.png`;
const coinArt = (size = 34) => `<img class="gold-coin" src="${uiSrc('coin')}" width="${size}" height="${size}" alt="" draggable="false">`;
const fruitName = level => t(FRUITS[level].name);
const shortName = level => t(FRUITS[level].short || FRUITS[level].name);
const plural = level => /s$/.test(shortName(level));
const article = level => plural(level) ? 'some' : /^[aeiou]/i.test(shortName(level)) ? 'an' : 'a';
/** A fruit name inside a sentence: Vietnamese keeps it lower-case after the first word. */
const midName = level => getLanguage() === 'vi' ? shortName(level).replace(/^\p{Lu}/u, c => c.toLowerCase()) : shortName(level);
const many = level => { const n = shortName(level).toLowerCase(); return getLanguage() === 'vi' ? n : /s$/.test(n) ? n : /(ch|sh)$/.test(n) ? `${n}es` : `${n}s`; };

// ------------------------------------------------------------------------------ state & settings
let stored = null;
try { stored = localStorage.getItem(LANTERN_SAVE); } catch {}
const state = stored ? loadLantern(stored) : newLantern();
// A save this version cannot read is kept aside before the fresh story overwrites it.
if (stored && !readableSave(stored)) {
  try { localStorage.setItem(`${LANTERN_SAVE}-unreadable-${Date.now()}`, stored); } catch {}
}
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
if (!stored) state.reducedMotion = motionQuery.matches;
/** Calm motion when the player asked for it in Settings or the device asks for it right now. */
const quietMotion = () => !!state.reducedMotion || motionQuery.matches;
const defaults = {language: 'en', quality: 'auto', stage: 2, music: 0.7, sfx: 0.85, ambience: 0.6, voice: 0.8, hints: true};
let settings = {...defaults};
try { settings = {...defaults, stage: 1, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')}; } catch {}
// 1.3 moves every earlier choice to Automatic once: the light stage on phones, 3D on capable computers
if (settings.stage < 2) Object.assign(settings, {quality: 'auto', stage: 2});
if (!GRAPHICS.includes(settings.quality)) settings.quality = 'auto';
// ?quality= is a one-visit override (tests, look-dev); it never leaks into saved settings
const urlQuality = GRAPHICS.includes(params.get('quality') || '') ? params.get('quality') : null;
const graphicsSetting = urlQuality || settings.quality;
let graphics = resolveGraphics(graphicsSetting);
// A tab that died while 3D was starting (a GPU out of memory takes the tab down without an error)
// leaves this marker behind; the next visit plays on the light stage instead of crashing again.
const BOOT_3D = 'little-keepsakes-3d-booting';
let crashed3d = false;
try { crashed3d = !!localStorage.getItem(BOOT_3D); localStorage.removeItem(BOOT_3D); } catch {}
settings.language = setLanguage(settings.language);
const translateStatic = bindStaticText();
translateStatic();
for (const select of document.querySelectorAll('[data-language]')) select.value = settings.language;
const history = [];
const audio = new AudioEngine({lowPower: matchMedia('(pointer: coarse)').matches});
let world, coins, preview = null, toastTimer, idleTimer, screen = 'loading', celebrateTimer;
// Every cinematic beat carries the token current when it was scheduled; bumping `cine` cancels all
// pending beats at once (undo, advance, revisit, restart), so stale timers can never fire.
let cine = 0, celebrationShown = false;
const later = (token, ms, fn) => setTimeout(() => { if (token === cine) fn(); }, ms);
const barked = new Set(), barkCount = {}, reveals = new Map(), pending = new Set(); // reveal key -> time; wishes about to be spoken

function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
function save() {
  try { localStorage.setItem(LANTERN_SAVE, JSON.stringify(state)); } catch { toast('Playing without a save in this browser.'); }
}
/** Screen readers hear each spoken line once, in full, not every typewriter step. */
function announce(text) { const el = $('sr-live'); el.textContent = ''; requestAnimationFrame(() => { el.textContent = text; }); }
function toast(text) { $('toast').textContent = t(text); $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4200); }
let hintTimer;
const hint = text => {
  const el = $('gesture-hint');
  el.textContent = t(text || 'Arrange matching fruit. Thread a skewer. Share a little happiness.');
  // on phones the hint pops up briefly (CSS keeps it always visible on larger screens)
  el.classList.add('show'); clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('show'), Math.max(4200, el.textContent.length * 65));
};
function sfx(name, opts) { if (state.sound) audio.play(name, opts); }
function applyVolumes() { audio.setVolumes({music: settings.music, sfx: settings.sfx, ambience: settings.ambience, voice: settings.voice}); }

// ------------------------------------------------------------------------------ wishes, as the story presents them
/** 'shown' | 'hidden' (not yet asked for) | 'riddle' (asked for in a riddle). Presentation only:
 *  the rules always accept the real wish, which lets a lucky or clever guess delight the guest. */
function wishState(index) {
  const j = state.journey, c = chapter(state), o = c.orders[index], story = STORY[j.chapter];
  if (!o || j.status !== 'playing' || j.replay || (j.served[o.level] || 0) > 0 || reveals.has(`${j.chapter}:${index}`)) return 'shown';
  if (story?.hidden?.order === index && (pending.has(`${j.chapter}:${index}`) || !(j.served[c.orders[story.hidden.after].level] > 0))) return 'hidden';
  if (story?.riddle?.[o.level]) return 'riddle';
  return 'shown';
}
const orderIndex = level => chapter(state).orders.findIndex(o => o.level === level);
/** True when this fruit is a wish the player can see (hints and highlights never spoil a secret). */
const wishShown = level => needed(state, level) > 0 && wishState(orderIndex(level)) === 'shown';

// ------------------------------------------------------------------------------ HUD
function update() {
  const c = chapter(state), j = state.journey, done = j.status !== 'playing';
  document.body.dataset.time = j.status === 'complete' ? 'night' : c.time;
  $('chapter-number').textContent = t('INVITATION {roman} · {guest}', {roman: ROMAN[j.chapter], guest: c.guest.toUpperCase()}) + (j.replay ? t(' · REVISIT') : '');
  $('guest-seal').innerHTML = icon(c.model, 52);
  $('story-title').textContent = j.status === 'complete' ? t('A clearing full of friends') : t(c.title);
  $('story-line').textContent = t(c.line);
  $('orders').innerHTML = c.orders.map((o, index) => {
    const served = j.served[o.level] || 0, view = wishState(index), story = STORY[j.chapter];
    if (view === 'hidden') return `<div class="order secret"><span class="secret-icon" aria-hidden="true">?</span><div class="copy"><strong>${t('A secret wish')}</strong><small>${t('{guest} hasn’t asked yet', {guest: c.guest})}</small></div><span class="order-count">…</span></div>`;
    if (view === 'riddle') return `<div class="order riddle"><span class="secret-icon" aria-hidden="true">?</span><div class="copy"><strong>“${t(story.riddle[o.level])}”</strong><small>${t('A riddle for {guest}’s plate', {guest: c.guest})}${o.count > 1 ? t(' · {count} wanted', {count: o.count}) : ''}</small></div><span class="order-count">${served}/${o.count}</span></div>`;
    return `<div class="order ${served >= o.count ? 'done' : ''} ${performance.now() - (reveals.get(`${j.chapter}:${index}`) ?? -1e9) < 1400 ? 'revealed' : ''}">${fruitIcon(o.level, 36)}<div class="copy"><strong>${fruitName(o.level)}</strong><small>${t('for {guest}’s plate', {guest: c.guest})}</small></div><span class="order-count">${served}/${o.count}</span></div>`;
  }).join('');
  $('skewer-order').innerHTML = `<div class="skewer-header"><strong>${t('{fruit} skewer', {fruit: midName(c.skewer)})}</strong><small>${j.skewers ? t('✓ served') : `${j.skewer.length}/3`}</small></div><div class="skewer-slots">${[0, 1, 2].map(i => `<div class="skewer-slot ${i < j.skewer.length || j.skewers ? 'filled' : ''}">${fruitIcon(c.skewer, 28)}</div>`).join('')}<i class="stick" aria-hidden="true"></i></div>`;
  const stars = starsFor(j.chapter, Math.max(j.actions, 0) + 1); // the finishing action counts too
  const best = j.records[j.chapter];
  $('par-meter').innerHTML = done ? '' : `<span class="par-stars" role="img" aria-label="${t('{count} star pace', {count: stars})}">${[1, 2, 3].map(i => `<i class="${i <= stars ? 'on' : ''}"></i>`).join('')}</span><span><strong>${j.actions}</strong> ${t('actions · par')} ${c.par}</span>${best ? `<small>${t('best {stars}', {stars: '★'.repeat(best.stars)})}</small>` : ''}`;
  $('keepsake').textContent = t(c.keepsake);
  $('plate-caption').textContent = t('{guest}’s plate', {guest: c.guest});
  $('skewer-caption').textContent = j.skewers ? t('a wish, served') : t('thread 3 {fruit}', {fruit: many(c.skewer)});
  $('basket-timing').textContent = done ? t('Picnic complete') : j.untilBasket ? t(j.untilBasket === 1 ? 'in {count} action' : 'in {count} actions', {count: j.untilBasket}) : t('make a little room');
  $('supply').innerHTML = done ? '' : nextSupply(state).map(level => fruitIcon(level, 24)).join('');
  $('supply').setAttribute('aria-label', t('Next delivery: {fruit}', {fruit: nextSupply(state).map(fruitName).join(', ')}));
  $('evolution').innerHTML = FRUIT_ORDER.map((level, i) => `<div class="fruit-step ${state.discovered.includes(level) ? '' : 'unknown'} ${wishShown(level) ? 'needed' : ''} ${level === c.skewer && !j.skewers ? 'skewer' : ''}" title="${fruitName(level)}${wishShown(level) ? t(' · wished for') : ''}">${fruitIcon(level, 30)}<small>${shortName(level)}</small></div>${i < FRUIT_ORDER.length - 1 ? '<i aria-hidden="true">›</i>' : ''}`).join('');
  $('undo').disabled = !history.length || screen !== 'play';
  $('sound').setAttribute('aria-pressed', String(state.sound));
  $('sound').setAttribute('aria-label', t(state.sound ? 'Turn sound off' : 'Turn sound on'));
  $('sound').classList.toggle('muted', !state.sound);
  const soundIcon = $('sound').querySelector('.ui-icon'), soundSrc = uiSrc(state.sound ? 'sound-on' : 'sound-off');
  if (soundIcon && soundIcon.getAttribute('src') !== soundSrc) soundIcon.setAttribute('src', soundSrc);
  $('sound-toggle').checked = !!state.sound;
  // Continue appears once the celebration card has been seen, never during the lantern-lighting beat.
  $('continue').hidden = screen !== 'play' || !$('celebration').hidden || !(j.status === 'complete' || (j.status === 'celebrate' && celebrationShown));
  $('continue').innerHTML = j.status === 'complete' ? t('See the festival ✧') : j.replay ? `${t('Back to the festival')} <span>→</span>` : `${t('Welcome {guest}', {guest: CHAPTERS[j.chapter + 1]?.guest || t('everyone')})} <span>→</span>`;
  $('basket-label').disabled = done;
  document.body.classList.toggle('quiet', quietMotion());
  if (world) world.systemQuiet = motionQuery.matches;
  const total = totalStars(state);
  $('title-progress').textContent = j.story ? t('Story complete · {stars} of {total} stars', {stars: total, total: CHAPTERS.length * 3}) : j.chapter || j.actions ? t('Invitation {roman} of {last} · {guest} is waiting', {roman: ROMAN[j.chapter], last: ROMAN[LAST], guest: c.guest}) : '';
  $('begin').innerHTML = j.story ? `${t('Return to the festival')} <span>→</span>` : (j.chapter || j.actions || state.score) ? `${t('Continue the picnic')} <span>→</span>` : `${t('Begin the picnic')} <span>→</span>`;
  audio.setIntensity(j.completed.length);
}

/** Where the HUD sits once it has settled into place, ignoring slide-in transforms, so the
 *  board shape never depends on which screen happened to be showing. */
function settledRect(el, container) {
  const r = el.getBoundingClientRect(), m = new DOMMatrixReadOnly(getComputedStyle(container).transform);
  return {top: r.top - m.m42, bottom: r.bottom - m.m42, left: r.left - m.m41, right: r.right - m.m41, height: r.height};
}

/** Screen space left for the board during play. */
function playInsets() {
  const w = innerWidth, h = innerHeight, top = $('hud-top'), bottomBar = $('hud-bottom');
  const card = settledRect($('invitation'), top), tools = settledRect(document.querySelector('.tools'), top);
  const shown = [...bottomBar.children].filter(el => getComputedStyle(el).display !== 'none' && getComputedStyle(el).position !== 'absolute');
  const bottomTop = shown.length ? Math.min(...shown.map(el => settledRect(el, bottomBar).top)) : h - 8;
  if (h < 520 && w > h) return {top: 8, right: w - tools.left + 8, bottom: h - bottomTop + 6, left: card.right + 8}; // landscape phone: sidebar
  if (w >= 980) return {top: Math.max(24, tools.bottom + 8), right: 28, bottom: h - bottomTop + 8, left: card.right + 20};
  // (on phones the undo button rides in the bottom band, level with the basket forecast)
  return {top: Math.max(card.bottom, w <= 560 ? tools.bottom : 0) + 6, right: 8, bottom: h - bottomTop + (w <= 560 ? 10 : 6), left: 8};
}

function layoutSafeArea() {
  if (!world) return;
  // reading an expanded invitation should never shrink or reshape the board beneath it
  const dims = `${innerWidth}x${innerHeight}:${screen}`;
  if ($('invitation').classList.contains('expanded') && layoutSafeArea.key && layoutSafeArea.dims === dims) return;
  layoutSafeArea.dims = dims;
  const w = innerWidth, h = innerHeight, play = playInsets();
  const insets = screen === 'play' ? play : {top: h * 0.08, right: w * 0.08, bottom: h * 0.12, left: w * 0.08};
  const key = JSON.stringify([insets, play]);
  if (key !== layoutSafeArea.key) { layoutSafeArea.key = key; world.setSafeArea(insets, play); }
}

/** Whole-pixel placement keeps labels crisp and still while the camera breathes. */
function moveTo(el, x, y) {
  const t = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  if (el.dataset.at !== t) { el.dataset.at = t; el.style.transform = t; }
}

function placeLabels() {
  if (!world) return;
  const W = world.canvas.clientWidth, H = world.canvas.clientHeight;
  const labels = [['basket-label', BASKET], ['skewer-label', SKEWER], ['plate-label', PLATE]].map(([id, p]) => {
    const el = $(id), q = world.project({...p, y: p.y + 0.075}, 0.08);
    return {el, w: el.offsetWidth, x: q.x - el.offsetWidth / 2, y: Math.min(H - el.offsetHeight - 5, q.y)};
  });
  // On narrow screens the props sit close together: push the labels apart, then back on screen.
  for (let i = 1; i < labels.length; i++) labels[i].x = Math.max(labels[i].x, labels[i - 1].x + labels[i - 1].w + 4);
  const over = labels.at(-1).x + labels.at(-1).w - (W - 4);
  if (over > 0) for (let i = labels.length - 1; i >= 0; i--) labels[i].x = i === labels.length - 1 ? labels[i].x - over : Math.min(labels[i].x, labels[i + 1].x - labels[i].w - 4);
  for (const l of labels) moveTo(l.el, Math.max(4, l.x), l.y);
  if (preview) {
    const q = world.project(preview.point, 1.3), el = $('merge-preview'), half = el.offsetWidth / 2 + 8;
    moveTo(el, Math.max(half, Math.min(W - half, q.x)) - el.offsetWidth / 2, Math.max(el.offsetHeight + 9, Math.min(H - 7, q.y - 8)) - el.offsetHeight);
  }
  for (const b of bubbles) {
    const q = world.headPoint(b.name);
    if (!q) continue;
    moveTo(b.el, Math.max(8, Math.min(W - b.el.offsetWidth - 8, q.x - b.el.offsetWidth * 0.5)), Math.max(8, q.y - b.el.offsetHeight - 6));
  }
}

// ------------------------------------------------------------------------------ speech bubbles
const bubbles = [];
function say(name, source, {duration, quiet = false} = {}) {
  const text = t(source);
  const el = document.createElement('div');
  el.className = 'bubble'; el.dataset.friend = name;
  el.innerHTML = `<strong>${name[0].toUpperCase() + name.slice(1)}</strong><span></span>`;
  el.setAttribute('aria-hidden', 'true');
  $('bubbles').append(el);
  announce(`${name[0].toUpperCase() + name.slice(1)}: ${text}`);
  const b = {name, el};
  bubbles.push(b);
  const span = el.querySelector('span'), chars = [...text];
  const reduced = quietMotion();
  if (state.sound && !quiet) { const seconds = audio.babble(name, text); audio.duck(0.35, seconds + 0.4); }
  world?.characters.get(name)?.react('wave');
  let i = reduced ? chars.length : 0;
  span.textContent = chars.slice(0, i).join('');
  const typer = setInterval(() => { i = Math.min(chars.length, i + 2); span.textContent = chars.slice(0, i).join(''); if (i >= chars.length) clearInterval(typer); }, 34);
  b.refreshLanguage = () => { clearInterval(typer); span.textContent = t(source); };
  const life = duration ?? Math.max(3.2, text.length * 0.065);
  b.remove = () => { clearInterval(typer); el.classList.add('leaving'); setTimeout(() => el.remove(), 350); bubbles.splice(bubbles.indexOf(b), 1); };
  b.timer = setTimeout(() => b.remove(), life * 1000);
  return b;
}
function clearBubbles() { for (const b of [...bubbles]) { clearTimeout(b.timer); b.remove(); } audio.stopBabble(); }

// ------------------------------------------------------------------------------ story: dialogue, letters, barks
/** A visual-novel style conversation panel. play(lines) resolves when the scene ends (true) or is
 *  skipped/stopped (false). Lines are [speaker, text, cue?]; cues fire world events on the way. */
const dialogue = {
  run: null,
  get active() { return !!this.run; },
  play(lines, {focus = true, cues = {}} = {}) {
    this.stop();
    const list = (lines || []).filter(l => l && Object.hasOwn(NAMES, l[0]));
    if (!list.length) return Promise.resolve(true);
    return new Promise(resolve => {
      this.run = {list, i: -1, resolve, focus, cues, typer: null, typing: false, text: ''};
      clearBubbles();
      $('dialogue').hidden = false; document.body.classList.add('talking');
      this.advance();
    });
  },
  advance() {
    const r = this.run, el = $('dialogue');
    if (!r) return;
    if (r.typing) { clearInterval(r.typer); r.typing = false; $('dialogue-text').textContent = r.text; el.classList.remove('typing'); return; }
    r.i++;
    if (r.i >= r.list.length) { this.finish(true); return; }
    const [who, source, cue] = r.list[r.i];
    const text = t(source);
    el.dataset.speaker = who; el.classList.toggle('narrator', who === 'narrator');
    $('dialogue-name').textContent = t(NAMES[who]);
    $('dialogue-portrait').innerHTML = who === 'narrator' ? '' : icon(who, 64);
    r.text = text;
    announce(who === 'narrator' ? text : `${t(NAMES[who])}: ${text}`);
    clearInterval(r.typer);
    if (quietMotion()) $('dialogue-text').textContent = text;
    else {
      const chars = [...text];
      let i = 0;
      r.typing = true; el.classList.add('typing'); $('dialogue-text').textContent = '';
      r.typer = setInterval(() => {
        i = Math.min(chars.length, i + 2);
        $('dialogue-text').textContent = chars.slice(0, i).join('');
        if (i >= chars.length) { clearInterval(r.typer); r.typing = false; el.classList.remove('typing'); }
      }, 26);
    }
    const face = world?.speak(who === 'narrator' ? null : who);
    if (r.focus && face && !quietMotion()) world.rig.focus(face, {distance: world.mobile ? 0.52 : 0.4, yaw: r.i % 2 ? 0.12 : -0.12});
    if (who !== 'narrator' && state.sound) { const seconds = audio.babble(who, text); audio.duck(0.35, seconds + 0.3); }
    if (cue) r.cues[cue]?.();
    $('dialogue-next').focus({preventScroll: true});
  },
  /** Skip the rest of the scene; its cues still fire so the world ends up where the story expects. */
  skip() {
    const r = this.run;
    if (!r) return;
    for (const l of r.list.slice(r.i + 1)) if (l[2]) r.cues[l[2]]?.();
    this.finish(false);
  },
  finish(done) {
    const r = this.run;
    if (!r) return;
    clearInterval(r.typer); this.run = null;
    $('dialogue').hidden = true; $('dialogue').classList.remove('typing'); document.body.classList.remove('talking');
    world?.speak(null);
    if (r.focus) world?.rig.release();
    audio.stopBabble();
    if (screen === 'play') world?.canvas.focus({preventScroll: true});
    r.resolve(done);
  },
  refreshLanguage() {
    const r = this.run; if (!r) return;
    clearInterval(r.typer); r.typing = false; r.text = t(r.list[r.i][1]);
    $('dialogue-text').textContent = r.text; $('dialogue-name').textContent = t(NAMES[r.list[r.i][0]]);
    $('dialogue').classList.remove('typing');
  },
  stop() { this.finish(false); },
};

let activeLetter = null;
function renderLetter(letter) {
  $('letter-eyebrow').textContent = t(letter.eyebrow);
  $('letter-text').innerHTML = letter.body.map(line => `<p class="${line.startsWith('P.S.') ? 'ps' : ''}">${t(line)}</p>`).join('');
  $('letter-sign').textContent = t(letter.sign);
  $('letter-close').innerHTML = `${t(letter.button)} <span>→</span>`;
}
/** A handwritten letter over the scene; resolves when it is put away. */
function showLetter(letter) {
  activeLetter = letter; renderLetter(letter);
  return new Promise(resolve => {
    $('letter').hidden = false; sfx('open');
    $('letter-close').focus({preventScroll: true});
    $('letter-close').onclick = () => { activeLetter = null; $('letter').hidden = true; sfx('ui'); resolve(); };
  });
}

/** A short in-play remark from a friend on stage. Most fire once per invitation. */
function bark(key, {repeat = false, delay = 0} = {}) {
  const j = state.journey, list = STORY[j.chapter]?.barks?.[key];
  if (!list?.length || j.replay || (!repeat && barked.has(key))) return;
  barked.add(key);
  const n = barkCount[key] = (barkCount[key] || 0) + 1, [who, text] = list[(n - 1) % list.length];
  if (!world?.characters.get(who)?.root.visible) return;
  const token = cine;
  setTimeout(() => {
    if (token !== cine || screen !== 'play' || dialogue.active) return;
    clearBubbles(); say(who, text, {duration: Math.max(3, text.length * 0.06)});
  }, delay);
}
/** A story line spoken in a bubble during play (reveals, surprises, riddle clues). */
function storyLine(line, delay = 0) {
  if (!line) return;
  const token = cine;
  setTimeout(() => {
    if (token !== cine || !world?.characters.get(line[0])?.root.visible) return;
    clearBubbles(); say(line[0], line[1], {duration: Math.max(3.4, line[1].length * 0.065)});
  }, delay);
}

// ------------------------------------------------------------------------------ actions
function act(fn) {
  const before = structuredClone(state), result = fn();
  if (result.ok) {
    history.push({state: before, reveals: new Map(reveals)}); if (history.length > 100) history.shift();
    world.choreograph(result); world.sync(); world.feedback(result);
    update(); save();
  } else if (result.reason) { toast(result.reasonCode === 'skewer-fruit' ? t('This skewer needs three {fruit}.', {fruit: many(result.level)}) : result.reason); sfx('invalid'); }
  bumpIdle();
  return result;
}

function drop(id, point) {
  const c = chapter(state), views = c.orders.map((o, i) => wishState(i));
  const grouped = mergeGroup(state, id, point, world.frame).length > 0;
  const result = act(() => dropLantern(state, id, point, world.frame));
  if (!result.ok) { if (!result.reason) sfx('drop'); return result; }
  const at = result.type === 'merge' ? result.fruit : point;
  if (result.reward) coins.award(at, result.reward, result.count || 2);
  const story = STORY[state.journey.chapter];
  if (result.type === 'merge') {
    sfx('merge', {tier: itemTier({level: result.level}), chain: result.chain, count: result.count});
    if (result.bonus) celebrateBloom(result);
    else hint(t('{merge}{chain} {outputs} · +{reward} joys.', {merge: t('{count}-fruit merge', {count: result.count}), chain: result.chain > 1 ? ' · ' + t('{count}-step chain', {count: result.chain}) + '!' : '', outputs: outputSummary(result.outputs), reward: number(result.reward)}));
    if (!result.completed) { if (result.chain > 1 || result.count > 2) bark('chain', {repeat: true}); else bark('firstMerge'); }
  } else if (result.type === 'skewer') {
    sfx('thread', {slot: result.served ? 3 : state.journey.skewer.length});
    if (result.served) setTimeout(() => sfx('skewerDone'), 350);
    hint(result.served ? 'Three little fruits, one lovely skewer. Served with love.' : t('{count} of 3 on the skewer. Keep threading the same fruit.', {count: state.journey.skewer.length}));
    if (result.served && !result.completed) { bark('skewerDone'); bark('halfway', {delay: 3200}); }
  } else if (result.type === 'serve') {
    sfx('serve'); setTimeout(() => sfx('eat'), 420);
    const index = orderIndex(result.fruit.level), secret = views[index] !== 'shown';
    if (secret) { reveals.set(`${state.journey.chapter}:${index}`, performance.now()); sfx('star', {index: 2}); }
    hint(secret ? t('{guest} gasps. You guessed a secret wish!', {guest: c.guest}) : t('{guest} loved that. One wish closer to a lantern.', {guest: c.guest}));
    if (!result.completed) {
      if (views[index] === 'hidden') storyLine(story.hidden.surprise, 500);
      else bark('serve', {repeat: true, delay: 500});
      // serving the first wish loosens a shy guest's tongue: the unspoken wish is revealed
      const h = story?.hidden;
      if (h && views[h.order] === 'hidden' && index === h.after) {
        // the wish stays secret until the guest actually says it
        const key = `${state.journey.chapter}:${h.order}`, token = cine;
        pending.add(key); update();
        later(token, 2600, () => {
          pending.delete(key);
          // a lucky guess already served the unspoken wish: no need to ask for it any more
          if (reveals.has(key) || !needed(state, c.orders[h.order].level)) { update(); return; }
          reveals.set(key, performance.now()); storyLine(h.line); sfx('star', {index: 1}); update();
        });
      }
      if (c.orders.every(o => (state.journey.served[o.level] || 0) >= o.count)) bark('halfway', {delay: 3200});
    }
  } else if (result.type === 'share') {
    sfx('share'); hint('A little extra for the table. You made room for something new.');
    if (!result.completed) bark('share');
  } else if (grouped) {
    // a merge that has nowhere to put its result politely becomes a move; say so
    sfx('move'); hint('No room for the new fruit there. Make a little space first.'); toast('No room for the merged fruit there. Clear a little space first.');
  } else { sfx('move'); hint('A lovely spot. Rearranging never uses an action.'); }
  if (result.spawned?.length) setTimeout(() => sfx('basket'), 120);
  if (result.completed) complete(result);
  return result;
}

function add() {
  if (screen !== 'play') return {ok: false};
  world?.cancel();
  const r = act(() => tapBasket(state, world.frame));
  if (r.ok) { sfx('basket'); hint('Fresh fruit! Asking the basket uses an action; it also refills by itself every three.'); }
  return r;
}

function undo() {
  if (!history.length || screen !== 'play') return;
  world.cancel(); clearTimeout(celebrateTimer); cine++; dialogue.stop(); pending.clear(); clearBubbles();
  const wasCelebrating = state.journey.status !== 'playing';
  const entry = history.pop();
  Object.assign(state, entry.state, {sound: state.sound, reducedMotion: state.reducedMotion, shop: state.shop});
  reveals.clear(); for (const [key, at] of entry.reveals) reveals.set(key, at);
  settleFruits(state, world.frame); // a snapshot from before a rotation is re-seated on today's board
  coins.settle(); $('celebration').hidden = true; celebrationShown = false; world.paused = false;
  if (wasCelebrating) world.rig.reset();
  world.sync(); if (wasCelebrating) { world.updateKeepsakes(); world.setChapterLook(); }
  update(); save(); sfx('undo');
  hint('One little step back. The whole action is restored.');
  bumpIdle();
}

/** "Strawberry ×2 + Plum": merge outputs grouped by fruit. */
function outputSummary(outputs) {
  const counts = new Map();
  for (const f of outputs) counts.set(f.level, (counts.get(f.level) || 0) + 1);
  return [...counts].map(([level, n]) => `${shortName(level)}${n > 1 ? ` ×${n}` : ''}`).join(' + ');
}

/** The bloom-combo easter egg: center combos of 3+ grow one fewer upgrades than merged. */
function celebrateBloom(result) {
  hint(t('✧ Bloom combo! {fruit} ×{count} became {outputs} · +{reward} joys.', {fruit: shortName(result.members[0].level), count: result.count, outputs: outputSummary(result.outputs), reward: number(result.reward)}));
  setTimeout(() => sfx('star', {index: 2}), 260);
  if (!settings.comboEgg) {
    settings.comboEgg = true; saveSettings();
    toast('✧ You found a secret: fruit merged in the middle of a group bloom into bonus fruit!');
    const guest = chapter(state).model;
    if (world?.characters.get(guest)?.root.visible) later(cine, 700, () => { clearBubbles(); say(guest, 'Oh! It bloomed into more than we started with!', {duration: 3.6}); });
  }
}

function onPreview(target) {
  preview = target;
  const el = $('merge-preview');
  el.hidden = !target;
  if (!target) return;
  const c = chapter(state);
  // near the plate, a secret or riddle wish stays a secret until the fruit is actually offered
  const secret = (target.type === 'serve' && wishState(orderIndex(target.level)) !== 'shown') || (target.type === 'share' && c.orders.some((o, i) => wishState(i) !== 'shown'));
  if (secret) el.innerHTML = `${fruitIcon(target.level, 30)}<span><strong>${t('Offer it to {guest}?', {guest: c.guest})}</strong><small>${t('Maybe it’s the wish…')}</small></span>`;
  else if (target.type === 'merge') el.innerHTML = `${fruitIcon(target.level, 34)}<span><strong>${target.bonus ? t('✧ Bloom combo') : target.chain > 1 ? t('{count}-step chain', {count: target.chain}) : t('{count}-fruit merge', {count: target.count})} · +${target.reward}</strong><small>${outputSummary(target.outputs)}</small></span>`;
  else if (target.type === 'serve') el.innerHTML = `${fruitIcon(target.level, 30)}<span><strong>${t('A wish, fulfilled')}</strong><small>${t('Serve to {guest} · +60 joys', {guest: c.guest})}</small></span>`;
  else if (target.type === 'share') el.innerHTML = `<span><strong>${t('Share to make room')}</strong><small>${t('Not on today’s wish')}</small></span>`;
  else if (target.type === 'skewer') el.innerHTML = `${fruitIcon(target.level, 30)}<span><strong>${t('Thread fruit {count} of 3', {count: target.count})}</strong><small>${target.count === 3 ? t('Complete the skewer · +120 joys') : t('Save it for the skewer')}</small></span>`;
  else el.innerHTML = `${fruitIcon(target.level, 30)}<span><strong>${state.journey.skewers ? t('Skewer already served') : t('This stick wants {fruit}', {fruit: midName(target.level)})}</strong><small>${state.journey.skewers ? t('Finish the plate wish.') : t('Drop here to keep your fruit where it was.')}</small></span>`;
  el.dataset.kind = secret ? 'secret' : target.type;
}

// ------------------------------------------------------------------------------ idle hints
function bumpIdle() {
  clearTimeout(idleTimer);
  world?.showHint(null);
  if (!settings.hints || screen !== 'play' || state.journey.status !== 'playing') return;
  // Pip's first picnic coaches right away; later invitations wait for a real pause
  const coach = STORY[state.journey.chapter]?.coach && !state.journey.replay && state.journey.actions < 4;
  idleTimer = setTimeout(suggest, coach ? 2600 : 14000);
}
function suggest() {
  if (screen !== 'play' || world.selection || world.paused || document.querySelector('dialog[open]') || state.journey.status !== 'playing' || dialogue.active) return;
  const c = chapter(state), j = state.journey, story = STORY[j.chapter];
  // a riddle left unsolved for a while earns a friendly clue from the guest
  const riddle = c.orders.findIndex((o, i) => wishState(i) === 'riddle');
  if (riddle >= 0) {
    const level = c.orders[riddle].level;
    reveals.set(`${j.chapter}:${riddle}`, performance.now()); update();
    storyLine(story.riddleHints?.[level]);
    const fruit = state.fruits.find(f => f.level === level);
    if (fruit) world.showHint([fruit.id]);
    hint(t('{fruit}! That’s the answer to {guest}’s riddle.', {fruit: fruitName(level), guest: c.guest}));
    return;
  }
  const merge = () => {
    for (const f of state.fruits) {
      const other = state.fruits.find(g => g.id !== f.id && g.level === f.level && nextItemLevel(g) !== null);
      if (other && planLanternMerge(state, f.id, other, world.frame)) { world.showHint([f.id, other.id]); return [f, other]; }
    }
    return null;
  };
  // Pip's first lesson is Hazel's secret: two little things make one bigger thing
  if (story?.coach && !j.replay && j.actions === 0) {
    const pair = merge();
    if (pair) { hint(t('Drag two {fruit} together. Two little things make one bigger thing.', {fruit: shortName(pair[0].level).toLowerCase()})); return; }
  }
  const wish = state.fruits.find(f => wishShown(f.level));
  if (wish) { world.showHint([wish.id]); hint(t('{fruit} is on {guest}’s wish. Drag it to the plate.', {fruit: fruitName(wish.level), guest: c.guest})); return; }
  const stick = state.fruits.find(f => f.level === c.skewer && !j.skewers);
  if (stick) { world.showHint([stick.id]); hint(t('{fruit} would look lovely on the skewer.', {fruit: (getLanguage() === 'en' ? (plural(stick.level) ? 'Those ' : 'That ') : '') + shortName(stick.level).toLowerCase()})); return; }
  const pair = merge();
  if (pair) { hint(t('Two {fruit} would make {next}.', {fruit: many(pair[0].level), next: (getLanguage() === 'en' ? article(nextItemLevel(pair[0])) + ' ' : '') + shortName(nextItemLevel(pair[0])).toLowerCase()})); return; }
  hint('Tap the basket for fresh fruit. It uses an action, so merge first if you can.');
}

// ------------------------------------------------------------------------------ story flow
/** The winning action: the lantern lights, the friends talk it over, then the stars. */
function complete(result) {
  const j = state.journey, index = j.chapter, finale = index === LAST && !j.replay, token = ++cine;
  clearTimeout(idleTimer); world.showHint(null); clearBubbles();
  later(token, 900, () => { sfx('lanternLight'); if (state.sound) audio.stinger(finale ? 'finale' : 'lantern'); audio.duck(0.5, 5); });
  world.celebrate(index);
  const outro = !j.replay && !QUICK ? STORY[index]?.outro : null;
  celebrateTimer = later(token, quietMotion() ? 300 : QUICK ? 1500 : 3600, async () => {
    if (outro?.length) {
      world.paused = true;
      await dialogue.play(outro);
      if (token !== cine) return;
    }
    if (state.journey.outro === 'pending') { state.journey.outro = 'seen'; save(); }
    showCelebration(result);
  });
}

let celebrationResult = {};
function renderCelebration(result = celebrationResult) {
  const j = state.journey, c = chapter(state), record = j.records[j.chapter], story = STORY[j.chapter];
  const stars = result.stars ?? (record ? starsFor(j.chapter, j.actions) : 0);
  $('celebrate-eyebrow').textContent = j.replay ? t('A PICNIC, REVISITED') : t('INVITATION {roman} · COMPLETE', {roman: ROMAN[j.chapter]});
  $('celebrate-title').textContent = t(story.celebrate[0]);
  $('celebrate-line').textContent = t(story.celebrate[1]);
  $('tally-actions').textContent = j.actions; $('tally-par').textContent = c.par;
  $('tally-joys').textContent = number(state.score - j.startScore);
  $('stars').setAttribute('aria-label', t('{count} of 3 stars', {count: stars}));
  const recipe = (result.firstThree ?? stars === 3) ? t(' · Hazel’s recipe card found') : '';
  $('keepsake-reveal').innerHTML = `${t('✧ Keepsake:')} <strong>${t(c.keepsake)}</strong>${result.improved ? ` · <em>${t('new best')}</em>` : ''}${recipe}`;
  $('next-invitation').innerHTML = j.replay ? `${t('Back to the festival')} <span>→</span>` : j.chapter < LAST ? `${t('Welcome {guest}', {guest: CHAPTERS[j.chapter + 1].guest})} <span>→</span>` : `${t('Light the festival')} <span>✧</span>`;
}

function showCelebration(result = {}) {
  const j = state.journey;
  if (j.status !== 'celebrate' || screen !== 'play') return; // a stale beat must never cover the next picnic
  world.cancel();
  const record = j.records[j.chapter];
  const stars = result.stars ?? record?.stars ?? 0; // saves from before stars existed have no record to show
  celebrationResult = result; renderCelebration(result);
  const starEls = [...$('stars').children];
  starEls.forEach(el => el.className = '');
  $('stars').setAttribute('aria-label', t('{count} of 3 stars', {count: stars}));
  $('celebration').hidden = false; celebrationShown = true;
  world.paused = true;
  const token = cine;
  starEls.forEach((el, i) => later(token, 500 + i * 380, () => { if (i < stars) { el.className = 'on'; sfx('star', {index: i}); } else el.className = 'off'; }));
  $('next-invitation').focus({preventScroll: true});
  update();
}

function advance() {
  const j = state.journey;
  if (j.status === 'complete') { festival({replay: true}); return; }
  clearTimeout(celebrateTimer); cine++; dialogue.stop();
  world.cancel(); clearBubbles(); world.rig.reset();
  $('celebration').hidden = true; celebrationShown = false;
  const replay = j.replay, wasLast = j.chapter === LAST;
  if (!nextChapter(state)) { world.paused = false; update(); return; }
  history.length = 0; coins.settle();
  world.sync(true); world.updateKeepsakes(); world.setChapterLook();
  update(); save();
  if (state.journey.status === 'complete') { world.placeCast(); audio.setTimeOfDay('night', 3); if (!replay && wasLast) festival(); else { setScreen('play'); hint('The festival glows on. Revisit any invitation from the Journey.'); } return; }
  startChapter({walkIn: true});
}

function resetChapterStory() { barked.clear(); reveals.clear(); pending.clear(); for (const k of Object.keys(barkCount)) delete barkCount[k]; }

/** Chapter card and fly-in, the guest's walk-in, then the arrival conversation. */
async function startChapter({walkIn = false, cinematic = true} = {}) {
  const c = chapter(state), j = state.journey, story = STORY[j.chapter], token = ++cine;
  resetChapterStory();
  audio.setTimeOfDay(c.time, quietMotion() ? 0 : 5);
  const play = () => {
    if (token !== cine) return;
    $('chapter-card').hidden = true;
    setScreen('play'); hint(c.line); bumpIdle();
    world.canvas.focus({preventScroll: true});
  };
  if (!cinematic || QUICK) { world.placeCast({walkIn: false}); play(); return; }
  setScreen('cinematic');
  $('card-number').textContent = t('INVITATION {roman} OF {last}', {roman: ROMAN[j.chapter], last: ROMAN[LAST]});
  $('card-title').textContent = t(c.title);
  $('card-time').textContent = `${t(TIMES[c.time])} · ${t(story.place)}`;
  $('chapter-card').hidden = false;
  if (state.sound) { audio.stinger('chapter'); audio.play('whoosh'); }
  const moving = !quietMotion();
  if (moving) world.rig.flyIn(3.4);
  world.placeCast({walkIn: walkIn && moving});
  await new Promise(resolve => {
    world.callbacks.onArrive = () => resolve();
    startChapter.skip = () => { world.rig.shot = null; world.rig.apply(world.rig.base); world.placeCast(); resolve(); };
    later(token, !moving ? 1800 : walkIn ? 5600 : 3600, resolve);
  });
  startChapter.skip = null;
  if (token !== cine) return;
  $('chapter-card').hidden = true;
  // the full arrival scene plays once per invitation; revisits and resumed picnics get a one-line greeting
  const intro = !j.replay && j.actions === 0 ? story.intro : [[c.model, c.line]];
  await dialogue.play(intro);
  play();
}

/** Five lanterns lit: the whole clearing sends lanterns up, the far islands answer, a letter comes home. */
async function festival({replay = false} = {}) {
  const token = ++cine;
  if (replay) state.journey.finale = 'pending';
  save();
  world.resetFestival();
  setScreen('cinematic');
  audio.setTimeOfDay('night', 3);
  if (!QUICK && state.journey.finale === 'letter') {
    world.rig.orbit(true, world.titlePose('ending'));
    return finishFestival(token);
  }
  world.finale();
  world.rig.orbit(true, world.titlePose(QUICK ? 'ending' : 'festival'));
  if (state.sound) later(token, 600, () => audio.stinger('finale'));
  if (QUICK) { later(token, 400, showEnding); return; }
  let landed;
  const arrival = new Promise(resolve => { landed = resolve; });
  const cues = {answer: () => world.answer(), reply: () => world.sendReply(landed)};
  await new Promise(resolve => {
    // skipping during the rising lanterns jumps straight to the conversation (and then through it)
    startChapter.skip = () => { if (dialogue.active) dialogue.skip(); else resolve(); };
    later(token, quietMotion() ? 300 : 4200, resolve);
  });
  if (token !== cine) return;
  await dialogue.play(FINALE, {focus: false, cues});
  if (token !== cine) return;
  if (!world.reply) world.sendReply(landed);
  await Promise.race([arrival, new Promise(resolve => { setTimeout(resolve, 9000); startChapter.skip = resolve; })]);
  if (token !== cine) return;
  startChapter.skip = null;
  await finishFestival(token);
}

async function finishFestival(token) {
  state.journey.finale = 'letter'; save();
  await showLetter(REPLY);
  if (token !== cine) return;
  state.journey.finale = 'seen'; save();
  showEnding();
}

function renderEnding() {
  const total = totalStars(state);
  $('ending-line').textContent = `${t(ENDING)} ${t('You gathered {score} golden joys and {stars} of {total} stars.', {score: number(state.score), stars: total, total: CHAPTERS.length * 3})}`;
  $('ending-stars').innerHTML = CHAPTERS.map((c, i) => {
    const rec = state.journey.records[i];
    return `<span title="${c.guest}">${icon(c.model, 40)}<b>${rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : state.journey.completed.includes(i) ? t('Lit') : '☆☆☆'}</b></span>`;
  }).join('');
}
function showEnding() {
  cine++; dialogue.stop(); startChapter.skip = null;
  setScreen('ending'); renderEnding();
  $('ending').hidden = false;
}

// ------------------------------------------------------------------------------ screens
function setScreen(name) {
  screen = name;
  document.body.dataset.screen = name;
  $('title-screen').hidden = name !== 'title';
  for (const id of ['hud-top', 'hud-bottom', 'world-labels']) $(id).inert = name !== 'play';
  if (name !== 'ending') $('ending').hidden = true;
  if (name !== 'cinematic') $('chapter-card').hidden = true;
  if (world) {
    world.mode = name === 'play' ? 'play' : name === 'title' ? 'title' : 'cinematic';
    if (name === 'title' || name === 'ending') world.rig.orbit(true, world.titlePose(name));
    else if (name === 'play') world.rig.orbit(false);
    world.paused = name !== 'play' || !$('celebration').hidden && state.journey.status !== 'playing';
  }
  update();
  // Reframe only when the layout really changes, never mid-drag during play.
  requestAnimationFrame(layoutSafeArea);
}

async function begin() {
  await audio.unlock();
  audio.setEnabled(state.sound);
  sfx('ui');
  const j = state.journey;
  if (j.status === 'complete') {
    world.placeCast();
    if (!QUICK && j.finale !== 'seen') { festival(); return; }
    setScreen('play'); hint('The festival glows on. Revisit any invitation from the Journey.'); return;
  }
  if (j.status === 'celebrate') {
    setScreen('play');
    const outro = !j.replay && !QUICK && j.outro === 'pending' ? STORY[j.chapter]?.outro : null;
    if (outro?.length) {
      const token = ++cine; world.paused = true;
      await dialogue.play(outro);
      if (token !== cine) return;
    }
    if (j.outro === 'pending') { j.outro = 'seen'; save(); }
    showCelebration(); return;
  }
  const fresh = j.chapter === 0 && j.actions === 0 && !j.completed.length && !j.story;
  if (fresh && !QUICK) {
    const token = ++cine;
    setScreen('cinematic');
    await showLetter(PROLOGUE);
    if (token !== cine) return;
  }
  startChapter({walkIn: j.actions === 0});
}

function openDialog(d) { world?.cancel(); clearTimeout(idleTimer); world?.showHint(null); if (world) world.paused = true; sfx('open'); d.showModal(); }
function closeDialogs() { for (const d of document.querySelectorAll('dialog[open]')) d.close(); }

function renderJourney() {
  const j = state.journey;
  const recipes = Object.values(j.records).filter(r => r?.stars === 3).length;
  $('journey-summary').innerHTML = (j.story ? t('Every lantern is lit. {stars} of {total} stars · {recipes} of {chapters} of Hazel’s recipe cards. Revisit any picnic to beat your best.', {stars: totalStars(state), total: CHAPTERS.length * 3, recipes, chapters: CHAPTERS.length}) : t('Light all five lanterns to finish the story. Three stars on an invitation finds one of Grandma Hazel’s recipe cards.'))
    + (j.replay ? ` <button class="glass-button" id="leave-replay">${t('Leave this revisit')}</button>` : '');
  $('journey-list').innerHTML = CHAPTERS.map((c, i) => {
    const rec = j.records[i], lit = j.completed.includes(i), reached = j.story || i <= j.chapter, current = i === j.chapter && !j.story;
    const status = rec ? t('{stars} · best {actions} actions · par {par}', {stars: '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars), actions: rec.actions, par: c.par}) : lit ? t('Lit') : current ? t('In progress') : reached ? t('Not yet lit') : '';
    const memory = lit ? `<span class="journey-memory">${t(STORY[i].memory)}</span>` : '';
    const recipe = lit ? (rec?.stars === 3 ? `<span class="journey-recipe">✧ ${t(STORY[i].recipe)}</span>` : `<span class="journey-recipe locked">${t('Three stars here finds one of Hazel’s recipe cards.')}</span>`) : '';
    return `<li class="journey-item ${reached ? '' : 'locked'} ${current ? 'current' : ''}" data-time="${c.time}">
      <span class="journey-portrait">${reached ? icon(c.model, 48) : '<b>?</b>'}</span>
      <span class="journey-copy"><small>${ROMAN[i]} · ${t(TIMES[c.time])}</small><strong>${reached ? t(c.title) : t('A friend yet to arrive')}</strong><em>${status}</em>${memory}${recipe}</span>
      ${j.story ? `<button class="glass-button replay" data-replay="${i}" aria-label="${t('Revisit {title}', {title: t(c.title)})}">${t('Revisit')}</button>` : ''}
    </li>`;
  }).join('');
  const leave = $('leave-replay');
  if (leave) leave.onclick = () => {
    if (!leaveReplay(state)) return;
    clearTimeout(celebrateTimer); cine++; dialogue.stop(); history.length = 0;
    closeDialogs(); $('celebration').hidden = true; celebrationShown = false; world.rig.reset();
    world.sync(true); world.updateKeepsakes(true); world.setChapterLook(); world.placeCast(); audio.setTimeOfDay('night', 3); update(); save();
    setScreen('play'); hint('Back at the festival. The lanterns glow on.');
  };
}

// ------------------------------------------------------------------------------ Hazel's Trunk
let shopKind = 'blanket';
function openShop(kind = shopKind) { shopKind = kind; renderShop(); openDialog($('shop-dialog')); }
function renderShop(bought) {
  $('shop-balance').textContent = number(balance(state));
  for (const tab of document.querySelectorAll('.shop-tabs [role=tab]')) {
    const on = tab.dataset.kind === shopKind;
    tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1;
    if (on) $('shop-list').setAttribute('aria-labelledby', tab.id);
  }
  $('shop-list').innerHTML = SHOP.filter(item => item.kind === shopKind).map(item => {
    const mine = owns(state, item.id), inUse = equipped(state, item.kind) === item.id, afford = balance(state) >= item.price;
    const action = inUse ? `<span class="in-use">${t('✓ On the picnic')}</span>`
      : mine ? `<button class="glass-button" data-equip="${item.id}">${t('Use it')}</button>`
      : `<button class="primary-button" data-buy="${item.id}" ${afford ? '' : 'disabled'} aria-label="${t('Buy {item} for {price} golden joys', {item: t(item.name), price: number(item.price)})}">${coinArt(22)} ${number(item.price)}</button>`;
    return `<li class="shop-card ${inUse ? 'equipped' : ''} ${bought === item.id ? 'just-bought' : ''}" data-kind="${item.kind}">
      <span class="shop-art"><img src="./assets/lantern-picnic/shop/${item.id}.png" alt="" loading="lazy" draggable="false">${inUse ? `<b class="shop-badge">${t('In use')}</b>` : ''}</span>
      <strong>${t(item.name)}</strong><small>${t(item.blurb)}</small>${action}</li>`;
  }).join('');
}
for (const tab of document.querySelectorAll('.shop-tabs [role=tab]')) {
  tab.onclick = () => { shopKind = tab.dataset.kind; sfx('ui'); renderShop(); };
  tab.onkeydown = e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); shopKind = KINDS[(KINDS.indexOf(shopKind) + 1) % KINDS.length]; renderShop(); document.querySelector(`.shop-tabs [data-kind=${shopKind}]`).focus(); };
}
$('shop-list').addEventListener('click', e => {
  const buyButton = e.target.closest('[data-buy]'), useButton = e.target.closest('[data-equip]');
  if (buyButton) {
    const r = buy(state, buyButton.dataset.buy);
    if (!r.ok) { sfx('invalid'); if (r.reasonCode === 'joys') toast(t('{count} more golden joys needed.', {count: number(r.missing)})); return; }
    // purchases are final: no Undo can take the joys back from under a keepsake
    history.length = 0;
    world.applyLooks(); coins.settle(); update(); save();
    sfx('star', {index: 2}); sfx('coin');
    $('shop-purse').classList.remove('bump'); void $('shop-purse').offsetWidth; $('shop-purse').classList.add('bump');
    renderShop(r.item.id);
    toast(t('{item} is on the picnic now.', {item: t(r.item.name)}));
  } else if (useButton) {
    const r = equip(state, useButton.dataset.equip);
    if (!r.ok) return;
    world.applyLooks(); save(); sfx('ui'); renderShop();
    toast(t('{item} is on the picnic now.', {item: t(r.item.name)}));
  }
});

// ------------------------------------------------------------------------------ wiring
$('score-coin').innerHTML = coinArt(34);
$('shop-coin').innerHTML = coinArt(32);
$('undo').onclick = undo;
$('menu').onclick = () => { renderSettings(); openDialog($('settings-dialog')); };
$('help-open').onclick = () => openDialog($('help-dialog'));
$('settings-open').onclick = () => { renderSettings(); openDialog($('settings-dialog')); };
$('journey-open').onclick = () => { renderJourney(); openDialog($('journey-dialog')); };
$('ending-journey').onclick = () => { renderJourney(); openDialog($('journey-dialog')); };
$('shop-open').onclick = $('shop-button').onclick = $('ending-shop').onclick = () => openShop();
$('settings-shop').onclick = () => { $('settings-dialog').close(); openShop(); };
$('settings-journey').onclick = () => { $('settings-dialog').close(); renderJourney(); openDialog($('journey-dialog')); };
$('settings-dialog').addEventListener('close', disarmRestart);
$('settings-help').onclick = () => { $('settings-dialog').close(); openDialog($('help-dialog')); };
$('ending-stay').onclick = () => { $('ending').hidden = true; setScreen('play'); world.placeCast(); };
$('close-help').onclick = $('back-to-play').onclick = () => $('help-dialog').close();
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => b.closest('dialog').close();
for (const d of document.querySelectorAll('dialog')) d.addEventListener('close', () => {
  sfx('close');
  if (world) world.paused = screen !== 'play' || (!$('celebration').hidden);
  if (screen === 'play') { world?.canvas.focus({preventScroll: true}); bumpIdle(); }
});
$('journey-list').addEventListener('click', e => {
  const b = e.target.closest('[data-replay]');
  if (!b) return;
  const i = Number(b.dataset.replay);
  if (!replayChapter(state, i)) return;
  clearTimeout(celebrateTimer); cine++; dialogue.stop();
  history.length = 0; closeDialogs(); $('ending').hidden = true; $('celebration').hidden = true; celebrationShown = false;
  world.rig.orbit(false); world.rig.reset(); world.resetFestival();
  world.sync(true); world.updateKeepsakes(true); world.setChapterLook(); update(); save();
  startChapter({walkIn: false});
});
$('begin').onclick = begin;
$('card-toggle').onclick = () => { const open = !$('invitation').classList.contains('expanded'); $('invitation').classList.toggle('expanded', open); $('card-toggle').setAttribute('aria-expanded', String(open)); sfx('ui'); requestAnimationFrame(layoutSafeArea); };
async function setSound(on) {
  state.sound = on;
  await audio.unlock();
  audio.setEnabled(state.sound);
  if (!audio.available && state.sound) { state.sound = false; toast('Sound is unavailable in this browser.'); }
  update(); save();
}
$('sound-toggle').onchange = e => setSound(e.target.checked);
$('sound').onclick = async () => {
  state.sound = !state.sound;
  await audio.unlock();
  audio.setEnabled(state.sound);
  if (!audio.available && state.sound) { state.sound = false; toast('Sound is unavailable in this browser.'); }
  update(); save();
};
$('basket-label').onclick = add;
$('skewer-label').onclick = () => { if (world.selection?.type === 'fruit') { const id = world.selection.id; world.cancel(); drop(id, SKEWER); } else hint(t('Drag three {fruit} onto the bamboo skewer.', {fruit: many(chapter(state).skewer)})); };
$('plate-label').onclick = () => { if (world.selection?.type === 'fruit') { const id = world.selection.id; world.cancel(); drop(id, PLATE); } else hint(t('Drop the pictured wishes onto {guest}’s plate. Other fruit makes room.', {guest: chapter(state).guest})); };
$('next-invitation').onclick = $('continue').onclick = () => { sfx('ui'); advance(); };
$('admire').onclick = () => { $('celebration').hidden = true; world.paused = false; world.rig.reset({glide: true}); update(); world.canvas.focus({preventScroll: true}); hint('A well-earned rest. Continue from the invitation whenever you like.'); };
$('chapter-card').onclick = () => startChapter.skip?.();
$('dialogue').onclick = e => { if (!e.target.closest('button')) dialogue.advance(); };
$('dialogue-next').onclick = () => dialogue.advance();
$('dialogue-skip').onclick = () => dialogue.skip();

function renderSettings() {
  $('quality').value = urlQuality || settings.quality;
  for (const k of ['music', 'sfx', 'ambience', 'voice']) { $(`vol-${k}`).value = settings[k]; fillSlider($(`vol-${k}`)); }
  $('sound-toggle').checked = !!state.sound;
  $('quiet-motion').checked = !!state.reducedMotion;
  $('show-hints').checked = !!settings.hints;
  const info = world?.info();
  $('render-note').textContent = !info ? '' : info.quality === '2d' ? t('Light stage: hand-painted from the 3D clearing, gentle on any device.')
    : t('Rendering at {quality} quality{resolution}.', {quality: t(QUALITY[info.quality].label), resolution: info.scale < 1 ? t(' · resolution {percent}% to keep things smooth', {percent: Math.round(info.scale * 100)}) : ''});
}
$('quality').onchange = e => {
  const before = settings.quality;
  settings.quality = e.target.value; saveSettings();
  const next = resolveGraphics(settings.quality);
  // moving between the light stage and 3D swaps renderers: save, then reopen the clearing
  if (world && is3d(next) !== is3d(world.info().quality)) {
    save();
    // only once the story and the new choice are really stored, or the reload would lose both
    const stored = (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)).quality === settings.quality && localStorage.getItem(LANTERN_SAVE) === JSON.stringify(state); } catch { return false; } })();
    if (!stored) { settings.quality = e.target.value = before; toast('This browser is not saving right now, so the graphics stay as they are.'); return; }
    const query = location.search.slice(1).split('&').filter(p => p && !/^quality(=|$)/.test(p)).join('&');
    location.replace(location.pathname + (query ? `?${query}` : '') + location.hash);
    return;
  }
  world?.setQuality(next); renderSettings();
};
function fillSlider(el) { el.style.setProperty('--fill', `${Math.round(Number(el.value) / Number(el.max || 1) * 100)}%`); }
for (const k of ['music', 'sfx', 'ambience', 'voice']) $(`vol-${k}`).oninput = e => { settings[k] = Number(e.target.value); fillSlider(e.target); applyVolumes(); saveSettings(); };
$('quiet-motion').onchange = e => { state.reducedMotion = e.target.checked; coins?.settle(); update(); save(); };
$('show-hints').onchange = e => { settings.hints = e.target.checked; saveSettings(); bumpIdle(); };
let restartConfirm = false;
function disarmRestart() { restartConfirm = false; $('restart-label').textContent = t('Start the story again'); $('restart').classList.remove('armed'); }
$('restart').onclick = () => {
  if (!restartConfirm) { restartConfirm = true; $('restart-label').textContent = t('Replace this story and all stars? Tap again.'); $('restart').classList.add('armed'); return; }
  disarmRestart();
  // the trunk keeps its keepsakes; only the purse starts again with the new story
  const keep = {sound: state.sound, reducedMotion: state.reducedMotion, shop: keepForRestart(state.shop)};
  Object.assign(state, newLantern(), keep);
  clearTimeout(celebrateTimer); cine++; dialogue.stop(); activeLetter = null; $('letter').hidden = true;
  history.length = 0; world.cancel(); coins.settle(); clearBubbles();
  $('celebration').hidden = true; celebrationShown = false; $('ending').hidden = true; closeDialogs();
  world.rig.reset(); world.resetFestival(); world.applyLooks();
  world.sync(true); world.updateKeepsakes(true); world.setChapterLook(true);
  update(); save(); setScreen('title');
};

document.addEventListener('visibilitychange', () => { world?.cancel(); if (document.hidden) coins?.settle(); save(); });
window.addEventListener('pagehide', save);
window.addEventListener('resize', () => {
  coins?.settle(); requestAnimationFrame(layoutSafeArea);
  // phones report a rotation before the HUD has reflowed into its new shape: measure again once it has
  clearTimeout(layoutSafeArea.settle); layoutSafeArea.settle = setTimeout(() => { layoutSafeArea.dims = null; layoutSafeArea(); }, 350);
});
document.addEventListener('keydown', e => {
  if (e.target.closest?.('input, select, dialog')) return;
  if (!$('letter').hidden) return; // the letter's own button takes Enter
  if (dialogue.active) {
    if (e.key === 'Escape') { e.preventDefault(); dialogue.skip(); }
    else if ([' ', 'Enter'].includes(e.key) && !e.target.closest?.('button')) { e.preventDefault(); dialogue.advance(); }
    return;
  }
  if (screen === 'cinematic' && [' ', 'Enter', 'Escape'].includes(e.key)) { e.preventDefault(); startChapter.skip?.(); }
  if (screen === 'title' && e.key === 'Enter' && document.activeElement === document.body) begin();
});
// Some touch browsers suppress a button click immediately after a canvas drag.
let touch = null, lastTouch = null;
document.addEventListener('pointerdown', e => { const b = e.target.closest?.('button'); if (e.pointerType === 'touch' && e.isPrimary && b && !b.disabled) touch = {b, id: e.pointerId, x: e.clientX, y: e.clientY}; });
document.addEventListener('pointercancel', () => { touch = null; });
document.addEventListener('pointerup', e => { if (!touch || e.pointerId !== touch.id) return; const t = touch; touch = null; if (t.b === e.target.closest?.('button') && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10 && !t.b.disabled) { e.preventDefault(); lastTouch = {id: t.id, x: e.clientX, y: e.clientY, at: performance.now()}; t.b.click(); } });
document.addEventListener('click', e => { if (e.isTrusted && e.detail > 0 && lastTouch && performance.now() - lastTouch.at < 750 && (e.pointerId === lastTouch.id || Math.hypot(e.clientX - lastTouch.x, e.clientY - lastTouch.y) < 12)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
document.addEventListener('pointerdown', () => { if (state.sound) audio.unlock().then(() => audio.setEnabled(true)); }, {once: true});

function changeLanguage(value) {
  world?.cancel();
  settings.language = setLanguage(value); saveSettings(); translateStatic();
  for (const select of document.querySelectorAll('[data-language]')) select.value = settings.language;
  disarmRestart();
  update(); renderSettings(); renderJourney(); coins?.settle();
  if ($('shop-dialog').open) renderShop();
  dialogue.refreshLanguage();
  if (activeLetter && !$('letter').hidden) renderLetter(activeLetter);
  if (!$('chapter-card').hidden) {
    $('card-number').textContent = t('INVITATION {roman} OF {last}', {roman: ROMAN[state.journey.chapter], last: ROMAN[LAST]});
    $('card-title').textContent = t(chapter(state).title);
    $('card-time').textContent = `${t(TIMES[chapter(state).time])} · ${t(STORY[state.journey.chapter].place)}`;
  }
  if (!$('celebration').hidden) renderCelebration();
  if (!$('ending').hidden) renderEnding();
  for (const bubble of bubbles) bubble.refreshLanguage();
  $('toast').classList.remove('visible'); hint(chapter(state).line);
  requestAnimationFrame(layoutSafeArea);
}
for (const select of document.querySelectorAll('[data-language]')) select.onchange = e => changeLanguage(e.target.value);

// ------------------------------------------------------------------------------ boot
update();
applyVolumes();
const loadingText = ['Unpacking handmade toys…', 'Stitching the picnic cloth…', 'Hanging paper lanterns…', 'Waking the fireflies…'];
const progress = f => {
  $('progress-bar').style.width = `${Math.round(f * 100)}%`;
  $('loading-text').textContent = t(loadingText[Math.min(loadingText.length - 1, Math.floor(f * loadingText.length))]);
  document.querySelector('.progress').setAttribute('aria-valuenow', String(Math.round(f * 100)));
};
/** The light stage: baked art on a 2D canvas. */
async function lightStage(callbacks) {
  const stage = new Stage2D($('picnic'), state, callbacks, new StageArt(new URL('./assets/lantern-picnic/2d/', document.baseURI)), {insets: playInsets()});
  await stage.load(progress);
  return stage;
}
/** Cinematic 3D: three.js, the GLB models and the post-processing chain, fetched only now. */
async function cinematicStage(callbacks, quality) {
  // no WebGL2, no 3D: find out before downloading the engine and 7 MB of models
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) throw new Error('WebGL2 is not available');
  probe.getExtension('WEBGL_lose_context')?.loseContext();
  if (!urlQuality) try { localStorage.setItem(BOOT_3D, '1'); } catch {}
  try {
    const [{LanternWorld}, {AssetLibrary}] = await Promise.all([import('./lantern-scene.js'), import('./engine/assets.js')]);
    const library = await new AssetLibrary().load(new URL('./assets/lantern-picnic/', document.baseURI), progress);
    return new LanternWorld($('picnic'), state, callbacks, library, {quality, insets: playInsets()});
  } catch (error) {
    // an error is not a crash: the marker only speaks for tabs that died outright
    try { localStorage.removeItem(BOOT_3D); } catch {}
    throw error;
  }
}
// a canvas keeps the first kind of context it hands out, so the other renderer needs a fresh one
const freshCanvas = () => $('picnic').replaceWith($('picnic').cloneNode(false));
let lightFallback = false;
if (crashed3d && !urlQuality && is3d(graphics)) {
  // 3D took this tab down last time: play light, and keep it light until the player asks for 3D
  graphics = '2d'; settings.quality = '2d'; saveSettings(); lightFallback = true;
}
try {
  const callbacks = {
    onDrop: drop, onAdd: add, onUndo: undo, onPreview, onHint: hint, onFrame: placeLabels,
    onPick: () => { sfx('pick'); bumpIdle(); },
    onLand: () => sfx('land', {size: 0.4}),
    onSettle: () => {},
    onFriend: name => { sfx('cheer'); if (state.sound) audio.babble(name, 'Hello there!'); },
    onSkip: () => dialogue.active ? dialogue.advance() : startChapter.skip?.(),
    onFirework: () => sfx('firework'),
    onPond: () => { sfx('splash'); bumpIdle(); },
    onReseat: () => save(),
  };
  if (is3d(graphics)) {
    try { world = await cinematicStage(callbacks, graphics); }
    catch (error) {
      // 3D cannot start in this browser (no WebGL2, a lost GPU): play light rather than stop at an error
      // screen whose "Try again" would fail the same way. A saved 3D choice goes back to Automatic, so
      // the next visit does not download the 3D clearing only to fail again.
      console.warn('3D unavailable, opening the light stage', error);
      if (!urlQuality && settings.quality !== 'auto') { settings.quality = 'auto'; saveSettings(); lightFallback = true; }
      freshCanvas(); world = await lightStage(callbacks);
    }
  } else {
    // one retry first: a single failed request on a flaky phone connection should not cost the 3D download
    try { world = await lightStage(callbacks); }
    catch { try { world = await lightStage(callbacks); } catch (error) {
      // no baked art (a partial deploy, a blocked request): the 3D clearing still works
      console.warn('Light stage unavailable, opening the 3D clearing', error);
      freshCanvas(); world = await cinematicStage(callbacks, 'low');
    } }
  }
  coins = new PicnicCoins({layer: $('coin-flights'), score: $('score'), counter: $('coin-counter'),
    origin: p => { const q = world.project(p, 0.6), r = world.canvas.getBoundingClientRect(); return {x: r.x + q.x, y: r.y + q.y}; },
    total: () => balance(state), format: number, icon: coinArt, label: value => t('{score} little joys earned', {score: number(value)}), quiet: quietMotion, onCollect: () => sfx('coin')});
  audio.setTimeOfDay(chapter(state).time, 0);
  if (DEBUG) window.__lantern = {
    getState: () => structuredClone(state), project: (p, y = 0.6) => world.project(p, y), getFrame: () => ({...world.frame}),
    getSelection: () => world.selection ? structuredClone(world.selection) : null, getRenderStats: () => world.info(),
    getAssets: () => world.library ? [...world.library.meshes.keys(), ...world.library.friends.keys()] : world.loadedFiles(), getDeliveries: () => world.deliveries,
    getScreen: () => screen, getTime: () => world.tod.key, life: () => world.lifeInfo?.() ?? null, skip: () => startChapter.skip?.(), cameraBusy: () => world.rig.busy,
    dialogue: () => dialogue.active ? {speaker: $('dialogue').dataset.speaker, text: dialogue.run.list[dialogue.run.i]?.[1]} : null,
    wishes: () => chapter(state).orders.map((o, i) => wishState(i)),
    looks: () => ({blanket: world.blanketId, glow: `#${world.lanternGlow.getHexString()}`, textured: world.blanketId === 'blanket-cornflower' || !!world.blanketTextures?.has(world.blanketId)}),
    // debug only: jump to an invitation with the earlier ones lit, for look-development
    jump: i => {
      Object.assign(state.journey, {chapter: i, completed: [...Array(i).keys()], status: 'playing', replay: false});
      seedChapter(state); history.length = 0;
      world.sync(true); world.updateKeepsakes(true); world.setChapterLook(true); world.placeCast(); update();
    },
    world,
  };
  document.body.classList.remove('booting');
  // Compile shaders and draw two frames while the loading card still covers the scene, so the
  // fade never stalls over the title; the title reveals itself once the card has truly gone.
  await world.warmUp();
  try { localStorage.removeItem(BOOT_3D); } catch {}
  $('loading').classList.add('loaded');
  world.startLife?.(); // the 3D clearing's koi and butterflies arrive a moment after it is on screen
  const reveal = () => document.body.classList.add('revealed');
  $('loading').addEventListener('transitionend', e => { if (e.propertyName === 'opacity') reveal(); }, {once: true});
  setTimeout(reveal, 1200);
  update();
  if (lightFallback) toast('3D could not start on this device, so the light stage is open. Settings can switch back to 3D.');
  if (QUICK) {
    setScreen('play'); world.placeCast();
    if (state.journey.status === 'celebrate') showCelebration(); else if (state.journey.status === 'complete') hint('The festival glows on. Revisit any invitation from the Journey.'); else hint(chapter(state).line);
    bumpIdle();
  } else setScreen('title');
} catch (error) {
  console.error(error);
  $('loading').classList.add('failed');
  $('loading-text').innerHTML = `${t('The clearing needs a little help.')} <button class="text-button" id="retry">${t('Try again')}</button> <a href="./classic.html?mode=free">${t('Open the original picnic')}</a>`;
  $('retry').onclick = () => location.reload();
}
