// Locates the portable Blender 4.5 LTS used by this project and runs it with the given arguments.
// Usage: node scripts/blender.mjs [--gui] <blender args...>
// Lookup order: $BLENDER_EXE, ./.tools (git-ignored), the sibling world_of_toy copy, then PATH.
import {existsSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.platform === 'win32' ? 'blender.exe' : 'blender';
const folder = 'blender-4.5.9-windows-x64';

export function findBlender() {
  const candidates = [
    process.env.BLENDER_EXE,
    path.join(root, '.tools', folder, exe),
    path.resolve(root, '..', 'world_of_toy', '.tools', folder, exe),
  ].filter(Boolean);
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['blender'], {encoding: 'utf8'});
  const found = which.status === 0 && which.stdout.split(/\r?\n/).find(Boolean);
  if (found) return found.trim();
  throw new Error(`Blender 4.5 was not found. Set BLENDER_EXE or place it in .tools/${folder}.\nChecked:\n  ${candidates.join('\n  ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const gui = args[0] === '--gui';
  const blender = findBlender();
  if (args[0] === '--where') { console.log(blender); process.exit(0); }
  if (gui) {
    // The MCP addon auto-starts its socket server once the window is ready.
    const child = spawn(blender, args.slice(1), {cwd: root, detached: true, stdio: 'ignore'});
    child.unref();
    console.log(`Blender opened (${blender}). The MCP for Blender server listens on localhost:9876 once the window is ready.`);
  } else {
    const child = spawn(blender, args, {cwd: root, stdio: 'inherit'});
    child.on('exit', code => process.exit(code ?? 1));
  }
}
