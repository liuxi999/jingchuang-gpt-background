import {execFile,fork,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {createInterface} from 'node:readline/promises';
import {randomUUID} from 'node:crypto';
import {buildPayload} from './integration.mjs';
import {mainTarget,socketUrl,attach} from './cdp.mjs';
import {disposeAppearance,listTargets,monitorAppearance} from './monitor.mjs';
import {hasConsent,remember,forget} from './consent.mjs';
const launcher=fileURLToPath(import.meta.url),root=dirname(launcher),exec=promisify(execFile);
const sessionPath=join(root,'session.json');
const bundledPS=join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','native','powershell','pwsh.exe');
// Prefer the already-installed PowerShell 7 runtime. Do not change or bypass execution policy.
const powershell=process.env.JINGCHUANG_POWERSHELL || (existsSync(bundledPS)?bundledPS:'pwsh.exe');
async function platform(action,extra=[]) {
  const {stdout}=await exec(powershell,['-NoProfile','-NonInteractive','-File',join(root,'platform.ps1'),'-Action',action,...extra],{timeout:15000,maxBuffer:1024*1024,windowsHide:true});
  return stdout.replace(/^\uFEFF/,'').trim();
}
async function inspect(){return JSON.parse(await platform('Inspect'));}
function validPort(port){return Number.isInteger(port)&&port>=1024&&port<=65535;}
function validPid(pid){return Number.isInteger(pid)&&pid>0;}
async function verifyListener(port,exe,pid,wait=0){
  const args=['-Port',String(port),'-Executable',exe,'-WaitMilliseconds',String(wait)];
  if(pid)args.push('-ExpectedPid',String(pid));
  const identity=JSON.parse(await platform('Listener',args));
  if(identity.verified!==true||(pid&&identity.pid!==pid))throw Error('Listener identity not verified');
}
async function readSession(){
  try{return JSON.parse(await readFile(sessionPath,'utf8'));}
  catch(e){if(e.code!=='ENOENT')throw e;return null;}
}
function startWatcher(port,pid){
  return new Promise((resolve,reject)=>{
    const watcher=fork(launcher,['--watch',String(port),String(pid)],{
      detached:true,windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],execArgv:[]
    });
    watcher.once('error',reject);
    watcher.once('exit',()=>reject(Error('景窗接入辅助进程提前结束')));
    watcher.once('message',message=>{
      if(watcher.connected)watcher.disconnect();
      watcher.unref();
      if(message.ready===true)resolve();else reject(Error(message.error||'景窗接入未完成'));
    });
  });
}
async function watch(port,pid){
  if(!process.connected||!validPort(port)||!validPid(pid))throw Error('Invalid watcher launch');
  const app=await inspect();
  const verify=async wait=>{
    if(!await hasConsent(root,app))throw Error('本机调试授权已失效');
    await verifyListener(port,app.exe,pid,wait);
  };
  await verify(10000);
  const stopToken=randomUUID();
  const startup=await buildPayload(root,{stopToken,playStartup:true});
  const background=await buildPayload(root,{stopToken,playStartup:false});
  await writeFile(sessionPath,JSON.stringify({port,pid,exe:app.exe,version:app.version,stopToken,startedAt:new Date().toISOString()},null,2));
  await monitorAppearance({
    port,stopToken,source:first=>first?startup:background,verify,
    isAlive(){try{process.kill(pid,0);return true;}catch{return false;}},
    async isEnabled(){return existsSync(join(root,'local-consent.json'))&&(await readSession())?.stopToken===stopToken;},
    onReady(){if(process.connected)process.send({ready:true},()=>{});}
  });
}
async function main() {
  if(process.platform!=='win32')throw new Error('This launcher is Windows-only');
  if(process.arch!=='x64')throw new Error('景窗首版仅支持 Windows x64');
  if(process.argv.includes('--forget-risk')){await forget(root);console.log('Remembered authorization removed. This does NOT close an already running debug port.');return;}
  const app=await inspect();
  if(process.argv.includes('--probe')){const {userSid,...publicInfo}=app;console.log(JSON.stringify(publicInfo,null,2));return;}
  if(process.argv.includes('--remember-risk')||process.argv.includes('--accept-local-debug-risk'))throw new Error('请使用交互式启动入口，本人阅读提示并输入 YES；不支持预先写入授权');
  const remembered=await hasConsent(root,app);
  if(process.argv.includes('--check-consent')){console.log(JSON.stringify({remembered,version:app.version,launchPerformed:false}));process.exitCode=remembered?0:2;return;}
  if(app.running.length)throw new Error('GPT 客户端正在运行。请保存工作并正常完全退出（包括 Mini/后台），然后从“景窗 · GPT背景”启动。工具不会结束或重启你的客户端。');
  if(!remembered){
    if(process.argv.includes('--desktop')){const e=new Error('First authorization required');e.exitCode=2;throw e;}
    if(!process.argv.includes('--interactive'))throw new Error('请从 Start-GPT.cmd 交互式启动并阅读本机调试授权提示');
    console.log('景窗是非官方 GPT 内部背景工具，不更改电脑桌面壁纸。\n此入口会在已登录的 GPT 客户端打开仅监听 127.0.0.1 的调试端口。同机其他程序可能连接。端口持续到 GPT 完全退出。\n辅助进程会在本次运行期间恢复重建主页面上的景窗。选择“恢复 GPT 原外观”或撤销授权可停止自动接入。\n完全退出 GPT 后，调试端口会关闭。授权绑定当前 Windows 账户、官方客户端版本和工具代码，变化后需重新确认。');
    const prompt=createInterface({input:process.stdin,output:process.stdout});
    let consent;try{consent=await prompt.question('Type YES to accept AND REMEMBER for this account/app version (anything else cancels): ');}finally{prompt.close();}
    if(consent!=='YES'){console.log('Cancelled. Nothing was started.');return;}
    await remember(root,app);
  }
  const port=Number(await platform('Port'));if(!validPort(port))throw new Error('Invalid loopback port');
  console.log('Starting signed official Codex '+app.version+'. No installed files will be changed.');
  // Hide helper consoles, NEVER pass SW_HIDE to the official GUI process.
  const child=spawn(app.exe,['--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`],{detached:true,stdio:'ignore',windowsHide:false});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
  try{await startWatcher(port,child.pid);}
  catch(error){throw Error(error.message+'\n完全退出 GPT 即可关闭本次启动的调试端口。');}
  console.log('景窗已接入 GPT。右下角或 Ctrl+Alt+B 可打开设置；本次运行期间将自动恢复主窗口中的景窗。');
}
export async function restore() {
  const session=await readSession();
  if(!session){console.log('当前没有景窗接入会话。');return;}
  const app=await inspect();
  if(app.exe.toLowerCase()!==String(session.exe).toLowerCase()||app.version!==session.version)throw Error('GPT 版本已变化，请完全退出后从官方图标启动');
  if(!validPort(session.port)||(session.stopToken&&!validPid(session.pid)))throw Error('Invalid saved session');
  await verifyListener(session.port,app.exe,session.pid);
  await unlink(sessionPath).catch(e=>{if(e.code!=='ENOENT')throw e;});
  const candidates=(await listTargets(session.port)).filter(mainTarget);
  const target=session.stopToken?(candidates.length===1?candidates[0]:null):candidates.find(x=>x.id===session.targetId);
  if(target){
    const client=await attach(socketUrl(target.webSocketDebuggerUrl,session.port));
    try{
      const result=await client.call('Runtime.evaluate',{expression:disposeAppearance,awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails)throw Error('Restore script failed');
    }finally{client.close();}
  }
  console.log('已停止本次景窗接入。完全退出 GPT 后调试端口会关闭。');
}
if(process.argv[2]==='--watch')watch(Number(process.argv[3]),Number(process.argv[4])).catch(e=>{
  if(process.connected)process.send({error:e.message},()=>{});
  process.exitCode=1;
});
else if(process.argv.includes('--restore'))restore().catch(e=>{console.error(e.message);process.exitCode=1;});
else main().catch(e=>{console.error(e.message);process.exitCode=e.exitCode||1;});
