// The Blender GLB libraries keep fixed file names, so their URLs carry a fingerprint taken from manifest.json: a browser
// that reloads right after a deploy must not pair the new code with an older cached library. Without a manifest the
// plain URLs still load. Needs the dev server (npm run dev); PICNIC_URL overrides it.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base = (process.env.PICNIC_URL || 'http://localhost:4173').replace(/\/$/, '');
const browser = await chromium.launch({headless: true, ...(!process.env.CI ? {channel: 'chrome'} : {}), args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const errors = [];
try {
  for (const manifest of [true, false]) {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}});
    const p = await context.newPage();
    p.on('pageerror', e => errors.push(e.message));
    const glbs = [];
    p.on('response', r => { if (/\.glb/.test(r.url())) glbs.push({url: r.url(), status: r.status()}); });
    if (!manifest) await p.route('**/manifest.json*', r => r.fulfill({status: 404, body: 'missing'}));
    await p.goto(`${base}/?debug&quality=low`);
    await p.waitForFunction(() => window.__lantern && document.querySelector('#loading').classList.contains('loaded'), null, {timeout: 90000});
    assert.equal(glbs.length, 3, JSON.stringify(glbs));
    assert.ok(glbs.every(g => g.status === 200), JSON.stringify(glbs));
    const versions = new Set(glbs.map(g => new URL(g.url).searchParams.get('v')));
    if (manifest) assert.ok(versions.size === 1 && [...versions][0], 'one fingerprint on all three libraries: ' + [...versions]);
    else assert.deepEqual([...versions], [null], 'plain URLs when the manifest cannot be read');
    await context.close();
    console.log('PASS GLB libraries ' + (manifest ? 'are versioned from the manifest' : 'load without a manifest'));
  }
  assert.deepEqual(errors, []);
  console.log('PASS no browser errors');
} finally { await browser.close(); }
