import {existsSync,readFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {parse} from 'dotenv';
// OpenNext compiles ALL three Next env modes, not just NODE_ENV, into next-env.mjs.
// Runtime credentials belong in custom ignored files and Workers Secrets instead.
const roots=new Set([process.cwd()]);let directory=resolve(process.cwd());
for(;;){
 if(existsSync(join(directory,'pnpm-workspace.yaml'))){roots.add(directory);break;}
 const parent=dirname(directory);if(parent===directory)break;directory=parent;
}
const names=['.env','.env.local',...['production','development','test'].flatMap(mode=>[`.env.${mode}`,`.env.${mode}.local`])];
const unsafe=[...roots].flatMap(root=>names.map(name=>join(root,name))).filter(file=>existsSync(file)&&Object.keys(parse(readFileSync(file,'utf8'))).length);
if(unsafe.length)throw new Error('OpenNext would embed local environment files: '+unsafe.map(file=>relative(process.cwd(),file)).join(', ')+'. Use custom ignored runtime files and Workers Secrets.');
console.log('Verified credential-free Cloudflare build environment.');
