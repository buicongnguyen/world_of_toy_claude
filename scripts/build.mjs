import {cp, mkdir, readFile, writeFile, readdir, rm, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,transform} from 'esbuild';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
/** Drop PNG text and timestamp chunks (tEXt, zTXt, iTXt, tIME); image data is untouched. */
function stripPngText(png){
 const keep=[png.subarray(0,8)];
 for(let at=8;at<png.length;){
  const size=png.readUInt32BE(at),type=png.toString('latin1',at+4,at+8),end=at+12+size;
  if(!['tEXt','zTXt','iTXt','tIME'].includes(type))keep.push(png.subarray(at,end));
  at=end;
 }
 return Buffer.concat(keep);
}
const out=path.join(root,'dist');
// This script owns only <project>/dist. Never clean a caller-provided path.
if(path.relative(root,out)!=='dist')throw new Error('Unexpected build directory');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});

const result=await build({
 absWorkingDir:root,entryPoints:['src/lantern-main.js','src/picnic-main.js','src/main.js'],
 outdir:path.join(out,'js'),bundle:true,format:'esm',splitting:true,minify:true,
 sourcemap:false,target:'es2022',entryNames:'[name]-[hash]',chunkNames:'shared-[hash]',
 legalComments:'eof',metafile:true
});
const entries=new Map(Object.entries(result.metafile.outputs).filter(([,value])=>value.entryPoint)
 .map(([file,value])=>[value.entryPoint,'./'+path.relative(out,path.resolve(root,file)).split(path.sep).join('/')]));
for(const [file,entry] of [['index.html','src/lantern-main.js'],['classic.html','src/picnic-main.js'],['attic.html','src/main.js']]){
 const html=(await readFile(path.join(root,file),'utf8'))
  .replace(/<script type="importmap">[\s\S]*?<\/script>/,'')
  .replace(/<meta name="draco-path" content="[^"]*">/,'<meta name="draco-path" content="./draco/">')
  .replace(`./${entry}`,entries.get(entry));
 await writeFile(path.join(out,file),html);
}
for(const file of ['lantern.css','picnic.css','style.css']){
 const css=await transform(await readFile(path.join(root,file),'utf8'),{loader:'css',minify:true});
 await writeFile(path.join(out,file),css.code);
}
// Runtime assets only: GLB libraries, UI portraits, key art, the manifest and the baked 2D stage.
await mkdir(path.join(out,'assets/lantern-picnic'),{recursive:true});
for(const entry of await readdir(path.join(root,'assets/lantern-picnic'),{withFileTypes:true})){
 if(entry.isDirectory()&&['icons','ui','shop','2d'].includes(entry.name)){
  // Blender stamps renders with metadata (including the .blend file's local path); ship pixels only.
  const dir=path.join('assets/lantern-picnic',entry.name),versions={};
  await mkdir(path.join(out,dir));
  for(const file of await readdir(path.join(root,dir))){
   if(file.endsWith('-preview.webp'))continue; // bake look-dev thumbnails; the stage never loads them
   if(file.endsWith('.png'))await writeFile(path.join(out,dir,file),stripPngText(await readFile(path.join(root,dir,file))));
   else if(/\.(webp|json)$/.test(file)){
    const data=await readFile(path.join(root,dir,file));
    await writeFile(path.join(out,dir,file),data);
    versions[file]=createHash('sha256').update(data).digest('base64url').slice(0,10);
   }
  }
  // The baked art keeps fixed names and Pages caches it for minutes, so the light stage asks for
  // <file>?v=<content hash> from these versions: a deploy never pairs new manifests with old pictures.
  if(entry.name==='2d'){
   const file=path.join(out,dir,'manifest.json'),shared=JSON.parse(await readFile(file,'utf8'));
   await writeFile(file,JSON.stringify({...shared,versions}));
  }
 }
 else if(/\.(glb|json|webp)$/.test(entry.name))await cp(path.join(root,'assets/lantern-picnic',entry.name),path.join(out,'assets/lantern-picnic',entry.name));
}
// The Draco decoder the GLTF loader needs for Blender's compressed meshes.
await mkdir(path.join(out,'draco'));
for(const file of ['draco_decoder.js','draco_decoder.wasm','draco_wasm_wrapper.js'])
 await cp(path.join(root,'node_modules/three/examples/jsm/libs/draco/gltf',file),path.join(out,'draco',file));
// Browsers receive compiled code and runtime assets, without original source or maps.
await mkdir(path.join(out,'licenses'));
await cp(path.join(root,'node_modules/three/LICENSE'),path.join(out,'licenses/three.txt'));
await writeFile(path.join(out,'.nojekyll'),'');
await writeFile(path.join(out,'build-info.json'),JSON.stringify({
 name:'The Lantern Picnic',version:JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,
 commit:process.env.GITHUB_SHA||null,
 chunks:(await readdir(path.join(out,'js'))).sort() // the deploy keeps these for one more release
},null,2)+'\n');
let bytes=0,files=0;
async function measure(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await measure(file);else{files++;bytes+=(await stat(file)).size;}}}
await measure(out);console.log(`Built ${files} static files (${(bytes/1024/1024).toFixed(2)} MiB) in dist/; works at / or any project subfolder.`);
