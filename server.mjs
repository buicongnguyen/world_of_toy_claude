import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const lan = process.argv.includes('--lan');
const port = Number(process.env.PORT || (lan ? 4174 : 4173));
const host = lan ? '0.0.0.0' : '127.0.0.1';
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (['/', '/index.html'].includes(pathname) && ['free', 'challenge'].includes(url.searchParams.get('mode'))) {
      res.writeHead(302, { Location: `/classic.html${url.search}` }).end(); return;
    }
    const filename = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(p => p.startsWith('.'))) {
      res.writeHead(403).end('Forbidden'); return;
    }
    // The phone preview shares only game assets, not project files or tests.
    const asset = relative.split(path.sep).join('/');
    if (lan && !(['index.html', 'classic.html', 'attic.html', 'picnic.css', 'lantern.css', 'style.css'].includes(asset)
      || /^assets\/lantern-picnic\/(icons|ui|shop|2d)\/[\w-]+\.(png|webp|json)$/.test(asset)
      || /^assets\/lantern-picnic\/[\w-]+\.(glb|json|webp)$/.test(asset)
      || /^src\/(engine\/)?[\w-]+\.js$/.test(asset)
      || /^node_modules\/three\/examples\/jsm\/libs\/draco\/gltf\/[\w.-]+\.(js|wasm)$/.test(asset)
      || /^node_modules\/three\/(build|examples\/jsm|src)\/.*\.js$/.test(asset))) {
      res.writeHead(403).end('Forbidden'); return;
    }
    const content = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(content);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, host, () => {
  console.log(`Little Keepsakes is ready at http://localhost:${port}`);
  if (lan) for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (/virtual|vethernet|vmware|wsl/i.test(name)) continue;
    for (const address of addresses || []) if (address.family === 'IPv4' && !address.internal) {
      console.log(`Phone on the same Wi-Fi: http://${address.address}:${port}`);
    }
  }
});
