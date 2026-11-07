import {setTimeout as delay} from 'node:timers/promises';
import {attach,mainDocument,mainHostReady,mainTarget,socketUrl} from './cdp.mjs';

const stopBinding='__jingchuangStopWatcher';
const inMainDocument=`window.top===window&&(${mainDocument.toString()})(location.href)`;
export const disposeAppearance=`(${inMainDocument})?window.__jingchuangAppearance?.dispose():undefined`;

export async function listTargets(port){
  const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1800),redirect:'error'});
  if(!response.ok)throw Error('Debugger target list unavailable');
  const targets=await response.json();
  if(!Array.isArray(targets))throw Error('Unexpected target list');
  return targets;
}

export async function monitorAppearance({port,stopToken,source,verify,isAlive,isEnabled,onReady},{
  targets=listTargets,connect=attach,sleep=delay,now=Date.now
}={}){
  const deadline=now()+45000;
  const clients=new Map();
  let mountedId,ready=false,introAttempted=false,stopRequested=false,reason='Waiting for a verified GPT main window';
  function disconnect(id){clients.get(id)?.close();clients.delete(id);}
  function event({method,params}){
    if(method==='Runtime.bindingCalled'&&params?.name===stopBinding&&params.payload===stopToken)stopRequested=true;
  }
  function evaluate(client,expression){return client.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},2500);}
  const probeHost=`(() => {
    if(!(${inMainDocument}))return null;
    const appearance=window.__jingchuangAppearance;
    return {visible:!document.hidden,body:!!document.body,root:!!document.getElementById('root'),
      width:innerWidth,height:innerHeight,active:!!appearance,mounted:appearance?.mounted===true,
      presented:appearance?.presented===true,stopped:window.__jingchuangRestoreToken===${JSON.stringify(stopToken)}};
  })()`;
  try{
    while(!stopRequested&&isAlive()&&await isEnabled()&&(ready||now()<deadline)){
      let checkingId,verified=false;
      async function verifyOnce(){
        if(!verified){await verify();verified=true;}
      }
      try{
        const candidates=(await targets(port)).filter(mainTarget);
        const eligibleIds=new Set(candidates.map(target=>target.id));
        for(const id of clients.keys())if(!eligibleIds.has(id))disconnect(id);
        if(!eligibleIds.has(mountedId))mountedId=undefined;
        const visible=[];
        for(const target of candidates){
          checkingId=target.id;
          if(!clients.has(target.id)){
            await verifyOnce();
            clients.set(target.id,await connect(socketUrl(target.webSocketDebuggerUrl,port),event));
          }
          const probe=await evaluate(clients.get(target.id),probeHost);
          const host=probe.result?.value;
          if(!host)throw Error('GPT main document is changing');
          if(host?.stopped){stopRequested=true;break;}
          if(host.visible)visible.push({id:target.id,host});
        }
        if(stopRequested)break;
        if(visible.length===1&&mainHostReady(visible[0].host)){
          const {id,host}=visible[0];
          if(mountedId&&mountedId!==id){
            checkingId=mountedId;
            await evaluate(clients.get(mountedId),disposeAppearance);
            mountedId=undefined;
          }
          checkingId=id;
          const client=clients.get(id);
          if(host.mounted){
            mountedId=id;
            if(host.presented&&!ready){ready=true;onReady();}
          }else{
            await verifyOnce();
            if(host.active)await evaluate(client,disposeAppearance);
            await client.call('Runtime.addBinding',{name:stopBinding},2500);
            if(stopRequested||!await isEnabled())break;
            mountedId=id;
            const firstAttempt=!introAttempted;
            introAttempted=true;
            const result=await evaluate(client,`(${inMainDocument})&&!document.hidden?(${source(firstAttempt)}):null`);
            if(result.exceptionDetails)throw Error('景窗未能初始化 GPT 主页面');
            if(result.result?.value===null&&firstAttempt)introAttempted=false;
            if(result.result?.value?.installed!==true)throw Error(result.result?.value?.reason||'GPT 主窗口未接受背景层');
          }
        }else reason='Waiting for a unique visible official GPT main window';
      }catch(error){reason=error.message;if(checkingId)disconnect(checkingId);}
      if(!stopRequested)await sleep(ready?1000:150);
    }
    if(!ready&&!stopRequested&&await isEnabled())throw Error('Integration not confirmed: '+reason);
  }finally{
    const client=clients.get(mountedId);
    if(client&&isAlive())await evaluate(client,disposeAppearance).catch(()=>{});
    for(const id of clients.keys())disconnect(id);
  }
}
