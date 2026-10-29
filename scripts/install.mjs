import {mkdir,readFile,copyFile,access} from 'node:fs/promises';
import {dirname,join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runtimeFiles} from '../runtime/manifest.mjs';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),exec=promisify(execFile);
export async function install(destination,{dryRun=false,createShortcut=true}={}){
  if(!isAbsolute(destination))throw Error('安装目录必须是绝对路径');
  try{await access(destination);throw Error('安装目录已存在；为保护现有设置，拒绝覆盖。请使用新目录或先手动备份。');}catch(e){if(e.code!=='ENOENT')throw e;}
  const files=[...runtimeFiles,'README.md','LICENSE','THIRD-PARTY-NOTICES.md','CHANGELOG.md'];
  // Validate the complete whitelist before creating the destination.
  for(const file of files)await readFile(join(project,runtimeFiles.includes(file)?'runtime':'',file));
  if(dryRun)return {destination,files,dryRun:true};
  await mkdir(destination,{recursive:true});
  for(const file of files)await copyFile(join(project,runtimeFiles.includes(file)?'runtime':'',file),join(destination,file));
  if(createShortcut)await exec(process.execPath,[join(destination,'shortcut.mjs'),'--install'],{windowsHide:true,timeout:20000});
  return {destination,files,shortcutInstalled:createShortcut,launchPerformed:false};
}
async function main(){
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('首版仅支持 Windows x64');
  const argument=process.argv.find(x=>x.startsWith('--destination='));
  let destination=argument?.slice(14);
  if(!destination){const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);[Environment]::GetFolderPath('MyDocuments')"],{windowsHide:true});destination=join(stdout.trim(),'Codex','Jingchuang');}
  console.log(JSON.stringify(await install(destination,{dryRun:process.argv.includes('--dry-run')}),null,2));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(e.message);process.exitCode=1;});
