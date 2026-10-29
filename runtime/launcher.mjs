import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {createInterface} from 'node:readline/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {buildPayload} from './integration.mjs';
import {mainTarget,mainHostReady,socketUrl,attach} from './cdp.mjs';
import {hasConsent,remember,forget} from './consent.mjs';
const root=dirname(fileURLToPath(import.meta.url)), exec=promisify(execFile);
const bundledPS=join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','native','powershell','pwsh.exe');
// Prefer the already-installed PowerShell 7 runtime. Do not change or bypass execution policy.
const powershell=process.env.JINGCHUANG_POWERSHELL || (existsSync(bundledPS)?bundledPS:'pwsh.exe');
async function platform(action,extra=[]) {
  const {stdout}=await exec(powershell,['-NoProfile','-NonInteractive','-File',join(root,'platform.ps1'),'-Action',action,...extra],{timeout:15000,maxBuffer:1024*1024,windowsHide:true});
  return stdout.replace(/^\uFEFF/,'').trim();
}
async function inspect(){return JSON.parse(await platform('Inspect'));}
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
    console.log('景窗是非官方 GPT 内部背景工具，不更改电脑桌面壁纸。\n此入口会在已登录的 GPT 客户端打开仅监听 127.0.0.1 的调试端口；同机其他程序可能连接。端口持续到 GPT 完全退出。\n“恢复 GPT 原外观”或撤销授权不会关闭该端口；完全退出并从官方图标打开才会关闭。\n授权绑定当前 Windows 账户、官方客户端版本和工具代码；变化后需重新确认。');
    const prompt=createInterface({input:process.stdin,output:process.stdout});
    let consent;try{consent=await prompt.question('Type YES to accept AND REMEMBER for this account/app version (anything else cancels): ');}finally{prompt.close();}
    if(consent!=='YES'){console.log('Cancelled. Nothing was started.');return;}
    await remember(root,app);
  }
  const source=await buildPayload(root);
  const port=Number(await platform('Port'));if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid loopback port');
  console.log('Starting signed official Codex '+app.version+'. No installed files will be changed.');
  // Hide helper consoles, NEVER pass SW_HIDE to the official GUI process.
  const child=spawn(app.exe,['--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`],{detached:true,stdio:'ignore',windowsHide:false});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
  let reason='Waiting for verified app listener',client,listenerVerified=false;
  const until=Date.now()+45000;
  while(Date.now()<until) {
    try {
      if(!listenerVerified){
        const identity=JSON.parse(await platform('Listener',['-Port',String(port),'-Executable',app.exe,'-ExpectedPid',String(child.pid),'-WaitMilliseconds','10000']));
        if(identity.verified!==true||identity.pid!==child.pid)throw new Error('Listener identity not verified');
        listenerVerified=true;
      }
      const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1800),redirect:'error'});
      if(!response.ok)throw new Error('Debugger target list unavailable');
      const targets=await response.json();if(!Array.isArray(targets))throw new Error('Unexpected target list');
      const candidates=targets.filter(mainTarget);
      if(candidates.length!==1)throw new Error('No unique official main window; refusing to inject into an ambiguous target');
      const target=candidates[0];client=await attach(socketUrl(target.webSocketDebuggerUrl,port));
      const host=await client.call('Runtime.evaluate',{expression:`(() => {const r=document.getElementById('root');return {visible:!document.hidden,body:!!document.body,root:!!r,width:innerWidth,height:innerHeight};})()`,returnByValue:true});
      const h=host.result?.value;
      if(!mainHostReady(h))throw new Error('Waiting for visible official main document (not a hidden Mini host)');
      const answer=await client.call('Runtime.evaluate',{expression:source,awaitPromise:true,returnByValue:true},20000);
      if(answer.exceptionDetails || answer.result?.value?.installed!==true)throw new Error(answer.result?.value?.reason||'GPT 主窗口未接受背景层');
      for(let i=0;i<200;i++){
        const r=await client.call('Runtime.evaluate',{expression:'window.__jingchuangAppearance?.status()',returnByValue:true});
        if(r.result?.value?.presented){
          await writeFile(join(root,'session.json'),JSON.stringify({port,exe:app.exe,targetId:target.id,version:app.version,startedAt:new Date().toISOString()},null,2));
          console.log('Jingchuang GPT background is visible. Ctrl+Alt+B opens settings. Helper now exits; debugger remains until the official app fully exits.');
          client.close();return;
        }
        if(!r.result?.value)throw new Error('Visual layer was removed after an initialization failure');
        await delay(100);
      }
      throw new Error('Artwork initialization timeout');
    }catch(error){reason=error.message;client?.close();client=null;}
    await delay(100);
  }
  throw new Error('Integration not confirmed: '+reason+'. No app package files were modified. Fully exit Codex and relaunch from the original icon to close any debug listener.');
}
export async function restore() {
  const {readFile}=await import('node:fs/promises');
  const session=JSON.parse(await readFile(join(root,'session.json'),'utf8'));
  const app=await inspect();if(app.exe.toLowerCase()!==String(session.exe).toLowerCase())throw new Error('Application changed; close and relaunch from the original icon instead');
  if(!Number.isInteger(session.port)||session.port<1024||session.port>65535)throw new Error('Invalid saved port');
  const identity=JSON.parse(await platform('Listener',['-Port',String(session.port),'-Executable',app.exe]));
  if(identity.verified!==true)throw new Error('Refusing unverified restore connection');
  const response=await fetch(`http://127.0.0.1:${session.port}/json/list`,{redirect:'error',signal:AbortSignal.timeout(1800)});
  const targets=await response.json();const target=targets.find(x=>x.id===session.targetId&&mainTarget(x));
  if(!target)throw new Error('The original main window no longer exists; close and relaunch normally');
  const client=await attach(socketUrl(target.webSocketDebuggerUrl,session.port));
  try{const result=await client.call('Runtime.evaluate',{expression:'window.__jingchuangAppearance?.dispose()',awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw new Error('Restore script failed');
  }finally{client.close();}
  await unlink(join(root,'session.json')).catch(()=>{});
  console.log('Appearance restored. The debug port is STILL OPEN. Fully exit Codex and use the original icon to close it.');
}
if(process.argv.includes('--restore'))restore().catch(e=>{console.error(e.message);process.exitCode=1;});
else main().catch(e=>{console.error(e.message);process.exitCode=e.exitCode||1;});
