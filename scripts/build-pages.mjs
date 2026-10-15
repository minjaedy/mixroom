import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const version=process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(version))throw Error('A Git commit is required for the Pages build');
const output=path.resolve('dist-site');await fs.mkdir(output,{recursive:true});await fs.cp('public',output,{recursive:true});
for(const item of await fs.readdir(output)){const filename=path.join(output,item);if(!/\.(html|js|css)$/.test(item))continue;let source=await fs.readFile(filename,'utf8');
  if(item.endsWith('.html')){
    source=source.replace('<head>','<head><meta name="app-version" content="'+version+'">');
    source=source.replace(/((?:src|href)=["'])(\.\/[^"'?]+\.(?:js|css|webmanifest))(["'])/g,`$1$2?v=${version}$3`);
  }else if(item.endsWith('.js'))source=source.replace(/(from\s*['"])(\.\/[^'"?]+\.js)(['"])/g,`$1$2?v=${version}$3`);
  else source=source.replace(/(url\(['"]?)(\.\/[^'"?)]+\.css)(['"]?\))/g,`$1$2?v=${version}$3`);
  if(item==='sw.js')source='// Build '+version+'\n'+source.replace("importScripts('./badge-core.js')","importScripts('./badge-core.js?v="+version+"')");
  await fs.writeFile(filename,source);
}
await fs.writeFile(path.join(output,'version.json'),JSON.stringify({version})+'\n');
console.log('Prepared Pages assets for '+version);
