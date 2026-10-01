// npm run assets:2d — bakes the 2.5D art for the light 2D stage with headless Chrome (GPU).
// Serves the repo, opens tools/bake/ once per layout at that layout's image size, runs every job and
// writes assets/lantern-picnic/2d/ (backgrounds, previews, cloth patterns, sprite atlases, manifests).
//   BAKE_LAYOUTS=wide,tall,strip  BAKE_JOBS=bg:afternoon,fruit (subset, for look-development)  BAKE_PORT=4199
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'assets', 'lantern-picnic', '2d');
const port = Number(process.env.BAKE_PORT || 4199);
const SIZES = {wide: [2560, 1600], tall: [1440, 2880], strip: [2560, 1280]};
const layouts = (process.env.BAKE_LAYOUTS || 'wide,tall,strip').split(',').filter(l => SIZES[l]);
const only = process.env.BAKE_JOBS ? new Set(process.env.BAKE_JOBS.split(',')) : null;

const server = spawn(process.execPath, ['server.mjs'], {cwd: root, env: {...process.env, PORT: String(port)}, stdio: 'ignore'});
const stop = () => { try { server.kill(); } catch {} };
process.on('exit', stop);
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`http://127.0.0.1:${port}/tools/bake/index.html`)).ok) break; } catch {}
  await new Promise(r => setTimeout(r, 200));
}

if (!only) await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});
const browser = await chromium.launch({channel: process.env.BAKE_CHANNEL || 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
const shared = {version: 1, layouts: {}, lanterns: null, skyLantern: null};
let written = 0, bytes = 0;
try {
  for (const layout of layouts) {
    const [w, h] = SIZES[layout];
    const context = await browser.newContext({viewport: {width: w / 2, height: h / 2}, deviceScaleFactor: 2});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/tools/bake/index.html?layout=${layout}`);
    await page.waitForFunction(() => window.bake?.ready, null, {timeout: 180000});
    const size = await page.evaluate(() => [bake.world.canvas.width, bake.world.canvas.height]);
    if (size[0] !== w || size[1] !== h) throw new Error(`${layout}: canvas is ${size.join('x')}, expected ${w}x${h}`);
    const jobs = (await page.evaluate(s => bake.jobs({shared: s}), layout === 'wide')).filter(j => !only || only.has(j) || only.has(j.split(':')[0]));
    if (only) for (const j of only) if (j.startsWith('ref:')) jobs.push(j); // look-development references, never shipped
    for (const job of jobs) {
      const t0 = Date.now();
      const results = await page.evaluate(j => bake.run(j), job);
      for (const {file, data} of results) {
        const buf = Buffer.from(data, 'base64');
        await writeFile(path.join(out, file), buf);
        written++; bytes += buf.length;
        console.log(`${layout} ${job.padEnd(28)} ${file.padEnd(34)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB  ${Date.now() - t0} ms`);
      }
      if (errors.length) throw new Error(`${layout} ${job}: ${errors.join('\n')}`);
    }
    const manifest = await page.evaluate(() => bake.manifest());
    if (layout === 'wide' && manifest.sprites.lanterns) { shared.lanterns = manifest.sprites.lanterns; shared.skyLantern = manifest.sprites.skyLantern; }
    const file = `manifest-${layout}.json`;
    if (only) { // keep what earlier full bakes recorded for jobs that did not run this time
      try {
        const old = JSON.parse(await readFile(path.join(out, file), 'utf8'));
        for (const k of ['bg', 'preview', 'cloth', 'clothGain', 'friends', 'lanterns']) manifest.files[k] = {...old.files[k], ...manifest.files[k]};
        for (const k of ['fruit', 'skyLantern', 'pond']) manifest.files[k] ??= old.files[k];
        if (manifest.pond) manifest.pond.mask ??= old.pond?.mask ?? null;
        manifest.sprites = {...old.sprites, ...manifest.sprites, friends: {...old.sprites?.friends, ...manifest.sprites.friends}};
      } catch {}
    }
    await writeFile(path.join(out, file), JSON.stringify(manifest, null, 1));
    shared.layouts[layout] = file;
    await context.close();
  }
  if (!only) {
    shared.files = {lanterns: Object.fromEntries(Object.entries(shared.lanterns || {}).map(([k, v]) => [k, v.file])), skyLantern: shared.skyLantern?.file};
    await writeFile(path.join(out, 'manifest.json'), JSON.stringify(shared, null, 1));
  }
  console.log(`BAKE_COMPLETE ${written} images, ${(bytes / 1048576).toFixed(2)} MB -> ${path.relative(root, out)}`);
} finally {
  await browser.close();
  stop();
}
