import {mkdir,readFile,writeFile,copyFile,access,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runtimeFiles,version} from '../runtime/manifest.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),exec=promisify(execFile);
const defaultOutput=join(root,'dist');
const documents=['README.md','LICENSE','THIRD-PARTY-NOTICES.md','CHANGELOG.md'];
const portableFiles=['Install.cmd',...documents,...runtimeFiles.map(x=>'runtime/'+x),'scripts/install.mjs'];
const forbidden=/(?:local-consent|session\.json|\.log$|\.lnk$|\.(?:png|jpe?g|webp|mp4|webm)$|output\/)/i;
async function prepare(stage,name,files){
  const directory=join(stage,name);await mkdir(directory,{recursive:true});
  const hashes={};
  for(const file of files){
    if(forbidden.test(file)||file.includes('..'))throw Error('发布白名单包含不允许的文件：'+file);
    const data=await readFile(join(root,file));const destination=join(directory,file);await mkdir(dirname(destination),{recursive:true});await copyFile(join(root,file),destination);
    hashes[file]=createHash('sha256').update(data).digest('hex');
  }
  await writeFile(join(directory,'FILES.sha256.json'),JSON.stringify(hashes,null,2));return directory;
}
export async function packageRelease({output=defaultOutput}={}){
  const stage=join(output,'.stage-'+randomUUID()),name='jingchuang-'+version+'-win-x64',zip=join(output,name+'.zip');
  await mkdir(output,{recursive:true});
  try{
    try{await access(zip);throw Error('发布包已存在，请保留原包并更改版本号后重新打包');}catch(e){if(e.code!=='ENOENT')throw e;}
    const directory=await prepare(stage,name,portableFiles);
    await exec('powershell.exe',['-NoProfile','-NonInteractive','-File',join(root,'scripts','archive.ps1'),'-Source',directory,'-Destination',zip],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
    const checksum=createHash('sha256').update(await readFile(zip)).digest('hex')+'  '+name+'.zip';
    const checksums=join(output,'SHA256SUMS.txt');await writeFile(checksums,checksum+'\n');
    return {version,archives:[zip],checksums};
  }finally{await rm(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))packageRelease().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
