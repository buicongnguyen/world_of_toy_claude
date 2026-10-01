import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {VI} from '../src/lantern-vi.js';
import {t, setLanguage, getLanguage, number} from '../src/lantern-i18n.js';
import {STORY, PROLOGUE, REPLY, FINALE, NAMES, ENDING} from '../src/lantern-story.js';
import {CHAPTERS, newLantern, dropLantern, SKEWER} from '../src/lantern-game.js';
import {FRUITS} from '../src/picnic-game.js';
const strings = v => typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];
test('Vietnamese covers every story line, chapter, fruit and literal UI key', () => {
  const names = new Set(['Pip', 'Momo', 'Nori', 'Juniper', 'Bramble']);
  const display = strings([STORY, PROLOGUE, REPLY, FINALE, NAMES, ENDING]).filter(s => s && !/^[a-z]+$/.test(s) && !names.has(s));
  display.push(...CHAPTERS.flatMap(c => [c.title, c.line, c.wish, c.keepsake]), ...FRUITS.flatMap(f => [f.name, f.short].filter(Boolean)));
  for (const file of ['lantern-main.js', 'lantern-scene.js', 'lantern-stage2d.js']) {
    const source = fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/(?:\bt|\bhint|\btoast)\('([^']*)'/g)) display.push(match[1]);
  }
  for (const key of display) assert.ok(VI[key]?.trim(), 'Missing: ' + key);
});
test('translations preserve interpolation variables and fall back safely', () => {
  const variables = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const [source, translated] of Object.entries(VI)) assert.deepEqual(variables(translated), variables(source), source);
  setLanguage('vi');
  assert.equal(t('Welcome {guest}', {guest: 'Momo'}), 'Chào đón Momo');
  assert.equal(number(12345), '12.345');
  assert.equal(t('Future untranslated line'), 'Future untranslated line');
  assert.equal(t('toString'), 'toString');
  assert.equal(t('Welcome {guest}'), 'Chào đón {guest}');
  assert.equal(t('Welcome {guest}', Object.create({guest:'unexpected'})), 'Chào đón {guest}');
  setLanguage('unknown'); assert.equal(getLanguage(), 'en');
  assert.equal(t('Welcome {guest}', {guest: 'Momo'}), 'Welcome Momo');
  assert.equal(number(12345), '12,345');
});
test('localized skewer errors expose stable data without changing rules or saves', () => {
  const state = newLantern(), before = structuredClone(state);
  const wrong = state.fruits.find(f => f.level !== 0);
  const result = dropLantern(state, wrong.id, SKEWER);
  assert.equal(result.ok, false); assert.equal(result.reasonCode, 'skewer-fruit'); assert.equal(result.level, 0);
  assert.deepEqual(state, before);
});
