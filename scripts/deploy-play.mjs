// Publishes the compiled game to the public play repository over git SSH; GitHub Pages serves it
// from that repository's main branch. The private source repository is never pushed there: the
// play repo has its own history and receives only dist/ (minified code, runtime assets, licenses).
//
//   npm run deploy            build, commit dist/ to the play repo, push
//   PLAY_REPO=<ssh url>       override the target remote
import {spawnSync} from 'node:child_process';
import {cp, mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const remote = process.env.PLAY_REPO || 'git@github.com:buicongnguyen/3D_claudeopus55-play.git';
const site = process.env.PLAY_URL || 'https://buicongnguyen.github.io/3D_claudeopus55-play/';
const work = path.join(root, '.deploy', 'play');
// This script owns only <project>/.deploy/play. Never clean a caller-provided path.
if (path.relative(root, work) !== path.join('.deploy', 'play')) throw new Error('Unexpected deploy directory');

function run(cmd, args, cwd = work) {
  const r = spawnSync(cmd, args, {cwd, stdio: 'inherit'});
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
}
const git = (...args) => run('git', args);
const gitOut = (...args) => spawnSync('git', args, {cwd: work, encoding: 'utf8'}).stdout.trim();

run(process.execPath, [path.join(root, 'scripts/build.mjs')], root);

if (!existsSync(path.join(work, '.git'))) {
  await mkdir(path.dirname(work), {recursive: true});
  run('git', ['clone', remote, work], root);
} else {
  git('fetch', 'origin');
}
if (gitOut('ls-remote', '--heads', 'origin', 'main')) git('checkout', '-B', 'main', 'origin/main');
else git('checkout', '--orphan', 'main');

// The previous build's code chunks stay for one more release: a page Pages cached (for up to ten
// minutes) still imports them, including the 3D chunk it loads on demand.
const previous = new Map();
try {
  const info = JSON.parse(await readFile(path.join(work, 'build-info.json'), 'utf8'));
  for (const name of info.chunks || await readdir(path.join(work, 'js'))) {
    try { previous.set(name, await readFile(path.join(work, 'js', name))); } catch {}
  }
} catch {}
for (const entry of await readdir(work)) if (entry !== '.git') await rm(path.join(work, entry), {recursive: true, force: true});
await cp(path.join(root, 'dist'), work, {recursive: true});
for (const [name, data] of previous) if (!existsSync(path.join(work, 'js', name))) await writeFile(path.join(work, 'js', name), data);
const {version} = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(path.join(work, 'README.md'), `# The Lantern Picnic: play build

Play it at **${site}**

This repository contains only the compiled, playable build of *The Lantern Picnic* (version ${version}), served by GitHub Pages: minified JavaScript, runtime assets (the pre-rendered 2.5D stage the game plays on by default, Draco-compressed GLB models and WebP textures for the optional 3D mode, UI portraits), the Draco decoder and third-party licenses. The source and the Blender asset pipeline are kept in a separate private repository.

Every model, texture, animation and sound in the game is original. Three.js is used under the MIT license (see \`licenses/three.txt\`).
`);

git('add', '-A');
if (!gitOut('status', '--porcelain')) {
  console.log(`Nothing new to deploy; ${site} already serves this build.`);
} else {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const message = [`Deploy The Lantern Picnic ${version} (${stamp} UTC)`, process.env.DEPLOY_TRAILER].filter(Boolean).join('\n\n');
  git('commit', '-m', message);
  git('push', 'origin', 'main');
  console.log(`Pushed the build. GitHub Pages will publish it at ${site} in a minute or two.`);
}
