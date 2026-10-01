// Installs the addon bundled with the pinned MCP for Blender server into the project's Blender.
// Keeping both halves from one package version avoids protocol mismatches.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findBlender} from './blender.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {...process.env, DISABLE_TELEMETRY: 'true', UV_PYTHON_PREFERENCE: 'only-managed'};
const locate = spawnSync('uvx', ['--python', '3.11', '--from', 'mcp-for-blender==2.0.3', 'python', '-c',
  "import blender_mcp,os;print(os.path.join(os.path.dirname(blender_mcp.__file__),'bundled','addon.py'))"],
  {encoding: 'utf8', env});
if (locate.status !== 0) { console.error(locate.stderr || 'uvx failed. Install uv first: winget install astral-sh.uv'); process.exit(1); }
const addon = locate.stdout.trim().split(/\r?\n/).at(-1);
const run = spawnSync(findBlender(), ['--background', '--python', path.join(root, 'tools/blender-mcp/install_addon.py'), '--', addon],
  {cwd: root, stdio: 'inherit'});
process.exit(run.status ?? 1);
