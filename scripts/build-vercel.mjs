import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import './build.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'.vercel','output');
// Clear only this generated output; preserve the local Vercel project link.
if(path.relative(root,output)!==path.join('.vercel','output'))throw new Error('Unexpected Vercel output directory');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp(path.join(root,'dist'),path.join(output,'static'),{recursive:true});
await writeFile(path.join(output,'config.json'),JSON.stringify({version:3},null,2)+'\n');
console.log('Vercel preview prepared in .vercel/output. Only the playable static build will be uploaded.');
