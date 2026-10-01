// npm run assets:trail — bakes The Lantern Trail's map art with headless Chrome (GPU).
// Serves the repo, opens tools/bake-trail/ at the plate's size, runs every job and writes
// assets/lantern-picnic/trail/ (ground tiles, prop atlas, friend sheets, manifest with the walk grid).
//   TRAIL_JOBS=ref (one composited look-development plate with every prop, never shipped)
//   TRAIL_HOUR=golden  BAKE_PORT=4198
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PLATE} from '../../src/trail/trail-map.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'assets', 'lantern-picnic', 'trail');
const look = path.join(root, 'artifacts', 'trail-bake');
const port = Number(process.env.BAKE_PORT || 4198);
const hour = process.env.TRAIL_HOUR || 'golden';
const only = process.env.TRAIL_JOBS ? process.env.TRAIL_JOBS.split(',') : null;
const reference = only?.includes('ref');

const server = spawn(process.execPath, ['server.mjs'], {cwd: root, env: {...process.env, PORT: String(port)}, stdio: 'ignore'});
const stop = () => { try { server.kill(); } catch {} };
process.on('exit', stop);
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`http://127.0.0.1:${port}/tools/bake-trail/index.html`)).ok) break; } catch {}
  await new Promise(r => setTimeout(r, 200));
}
const target = reference ? look : out;
if (!only) await rm(out, {recursive: true, force: true});
await mkdir(target, {recursive: true});
const browser = await chromium.launch({channel: process.env.BAKE_CHANNEL || 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
let written = 0, bytes = 0;
try {
  const context = await browser.newContext({viewport: {width: PLATE.w, height: PLATE.h}, deviceScaleFactor: 1});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (process.env.BAKE_VERBOSE) console.log('page:', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/tools/bake-trail/index.html?hour=${hour}`);
  await page.waitForFunction(() => window.bake?.ready || window.bakeError, null, {timeout: 240000});
  if (errors.length) throw new Error(errors.join('\n'));
  const jobs = only || await page.evaluate(() => bake.jobs());
  for (const job of jobs) {
    const t0 = Date.now();
    const results = await page.evaluate(j => bake.run(j), job);
    for (const {file, data} of results) {
      const buf = Buffer.from(data, 'base64');
      await writeFile(path.join(target, file), buf);
      written++; bytes += buf.length;
      console.log(`${job.padEnd(14)} ${file.padEnd(26)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB  ${Date.now() - t0} ms`);
    }
    if (errors.length) throw new Error(`${job}: ${errors.join('\n')}`);
  }
  if (!only) await writeFile(path.join(out, 'manifest.json'), JSON.stringify(await page.evaluate(() => bake.manifest())));
  console.log(`BAKE_COMPLETE ${written} images, ${(bytes / 1048576).toFixed(2)} MB -> ${path.relative(root, target)}`);
} finally {
  await browser.close();
  stop();
}
