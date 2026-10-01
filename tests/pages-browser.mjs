import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const prefix=process.env.STATIC_BASE_PATH||'/world_of_toy/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.wasm':'application/wasm'};
let server;
if(!process.env.PAGES_URL){
 server=http.createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(!pathname.startsWith(prefix)){res.writeHead(404).end();return;}
   const relative=pathname.slice(prefix.length)||'index.html',file=path.resolve(root,relative);
   if(path.relative(root,file).startsWith('..')){res.writeHead(403).end();return;}
   const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data);
  }catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
}
const base=process.env.PAGES_URL||`http://127.0.0.1:${server.address().port}${prefix}`;
const browser=await chromium.launch({headless:true,...(!process.env.CI?{channel:'chrome'}:{}),args:['--enable-unsafe-swiftshader']});
const errors=[];
const state=p=>p.evaluate(()=>__lantern.getState());
async function ready(page){await page.waitForFunction(()=>window.__lantern,null,{timeout:60000});await page.waitForFunction(()=>getComputedStyle(document.querySelector('#loading')).opacity==='0');await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));await page.waitForFunction(()=>__lantern.getDeliveries()===0&&!__lantern.cameraBusy());}
// phones get the light stage automatically; desktops ask for it here (Automatic may pick 3D on a
// capable computer, which is checked separately below)
const PLAY='?debug&play',LIGHT='?debug&play&quality=2d';
async function point(page,fruit){return page.evaluate(f=>{const p=__lantern.project(f,.6),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x+p.x,y:r.y+p.y};},fruit);}
await mkdir('artifacts',{recursive:true});
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),requested=[],scripts=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requested.push(r.url()));
  page.on('response',r=>{if(/\.js(\?|$)/.test(r.url()))scripts.push(r.body().then(b=>b.toString()).catch(()=>''));});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  const play=mobile?PLAY:LIGHT;
  await page.goto(new URL(play,base).href);await ready(page);
  assert.equal(await page.evaluate(()=>__lantern.getRenderStats().quality),'2d');
  assert.ok((await page.evaluate(()=>__lantern.getAssets())).some(f=>/^fruit-\w+\.webp$/.test(f)),'baked 2D art loaded');
  assert.deepEqual(requested.filter(u=>/\.glb(\?|$)|draco/.test(u)),[],'the light stage never downloads the 3D models');
  assert.equal((await Promise.all(scripts)).some(js=>js.includes('WebGLRenderer')),false,'the light stage never downloads three.js');
  const art=requested.filter(u=>/\/2d\/[\w-]+\.webp/.test(u));
  assert.ok(art.length>3&&art.every(u=>/\.webp\?v=[\w-]{10}$/.test(u)),'baked art is requested by content hash: '+art.slice(0,3).join(' '));
  const initial=await state(page),a=await point(page,initial.fruits[0]),b=await point(page,initial.fruits[1]);
  if(mobile){await page.touchscreen.tap(a.x,a.y);await page.touchscreen.tap(b.x,b.y);}else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();}
  assert.equal((await state(page)).score,20);await page.waitForFunction(()=>!document.querySelector('.flying-coin'));
  await page.reload();await ready(page);assert.equal((await state(page)).score,20);
  const merged=await state(page);
  await page.locator('#menu')[mobile?'tap':'click']();
  await page.locator('#language').selectOption('vi');
  assert.equal(await page.locator('html').getAttribute('lang'),'vi');
  assert.match(await page.locator('#orders').innerText(),/Dâu tây/);
  await page.locator('#settings-dialog [data-close]')[mobile?'tap':'click']();
  assert.deepEqual(await state(page),merged,'compiled translation preserves progress');
  await page.reload();await ready(page);
  assert.equal(await page.locator('html').getAttribute('lang'),'vi');
  assert.deepEqual(await state(page),merged,'compiled language and progress persist');
  await page.locator('#menu')[mobile?'tap':'click']();
  await page.locator('#language').selectOption('en');
  await page.locator('#settings-dialog [data-close]')[mobile?'tap':'click']();
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.deepEqual(await state(page),merged);

  if(mobile)await page.locator('#menu').tap();else await page.locator('#menu').click();
  await page.getByRole('link',{name:'Original free play & bubbles'}).evaluate(el=>el.href+='&debug');
  await page.getByRole('link',{name:'Original free play & bubbles'}).click();await page.waitForFunction(()=>window.__picnic);
  assert.equal(new URL(page.url()).pathname,new URL('./classic.html',base).pathname);assert.equal(new URL(page.url()).searchParams.get('mode'),'free');assert.ok((await page.evaluate(()=>__picnic.getState())).fruits.length>0);
  await page.locator('#mode-link').evaluate(el=>el.href+='&debug');await page.locator('#mode-link').click();await page.waitForFunction(()=>window.__picnic);assert.equal(await page.locator('#round-panel').isVisible(),true);
  await page.goto(new URL(play,base).href);await ready(page);assert.equal((await state(page)).score,20);
  await page.screenshot({path:`artifacts/pages-${mobile?'mobile':'desktop'}.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await context.close();console.log(`PASS: ${mobile?'mobile touch':'desktop mouse'} on project subpath: light 2D stage without 3D downloads, portraits, merge, coins, save/reload, original modes, return and layout`);
 }
 {
  // Cinematic 3D stays one setting away: three.js, the Blender libraries and the Draco decoder load on request
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(new URL('?debug&play&quality=low',base).href);await ready(page);
  assert.equal(await page.evaluate(()=>__lantern.getRenderStats().quality),'low');
  assert.ok(await page.evaluate(()=>__lantern.getAssets().length)>=50,'Blender libraries loaded');
  const initial=await state(page),a=await point(page,initial.fruits[0]),b=await point(page,initial.fruits[1]);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();
  assert.ok((await state(page)).score>initial.score);
  await context.close();console.log('PASS: Cinematic 3D on request: lazy three.js chunk, Blender libraries, Draco and a merge');
 }
 assert.deepEqual(errors,[]);console.log(`PASS: no missing assets or browser errors at ${base}`);
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
