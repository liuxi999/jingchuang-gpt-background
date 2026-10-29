import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {runtimeFiles} from '../runtime/manifest.mjs';
import {binding,sameBinding,hasConsent,remember} from '../runtime/consent.mjs';
import {installAppearance,buildPayload} from '../runtime/integration.mjs';
import {mainTarget,mainHostReady,socketUrl} from '../runtime/cdp.mjs';
import {install} from '../scripts/install.mjs';
const root=resolve('runtime');
async function cleanup(temp){assert.equal(dirname(resolve(temp)).toLowerCase(),resolve(tmpdir()).toLowerCase());assert.match(basename(temp),/^jingchuang-(consent|install)-/);await rm(temp,{recursive:true,force:true});}
test('injection accepts only top main host, rejects the old appearance, and payload is self-contained JavaScript',async()=>{
  assert.equal(installAppearance({top:{}}).installed,false);
  const legacy={__bailiCodexSkin:{}};legacy.top=legacy;assert.match(installAppearance(legacy).reason,/白璃/);
  const payload=await buildPayload(root);new vm.Script(payload);assert.ok(payload.length<150000);assert.doesNotMatch(payload,/data:video\/mp4/);
});
test('CDP adapter rejects remote sockets and Mini/browser targets',()=>{
  assert.equal(mainTarget({type:'page',url:'app://-/index.html?initialRoute=/'}),true);
  assert.equal(mainTarget({type:'page',url:'app://-/index.html?initialRoute=/mini'}),false);assert.equal(mainTarget({type:'page',url:'https://example.org/'}),false);
  assert.throws(()=>socketUrl('ws://evil.example:1234/devtools/page/test',1234));assert.equal(socketUrl('ws://127.0.0.1:1234/devtools/page/test',1234),'ws://127.0.0.1:1234/devtools/page/test');
});
test('main document becomes eligible before GPT finishes rendering chat content',()=>{
  assert.equal(mainHostReady({visible:true,body:true,root:true,width:1200,height:800,loaded:false,content:false}),true);
  for(const value of [{visible:false,body:true,root:true,width:1200,height:800},{visible:true,body:false,root:true,width:1200,height:800},{visible:true,body:true,root:false,width:1200,height:800},{visible:true,body:true,root:true,width:0,height:800}])assert.equal(mainHostReady(value),false);
});
test('consent is bound to every shipped runtime file, verified app version and Windows account',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'jingchuang-consent-'));try{
    await cp(root,temp,{recursive:true});const app={userSid:'test-account',version:'test-version',signature:'Valid OpenAI',family:'test-family',exe:'test.exe'};
    assert.equal(await hasConsent(temp,app),false);await remember(temp,app);assert.equal(await hasConsent(temp,app),true);
    const original=await binding(temp,app);assert.equal(sameBinding({...original,accepted:true},{...original,userSid:'other'}),false);
    for(const file of ['settings.mjs','appearance.css','Run.ps1']){const path=join(temp,file),text=await readFile(path,'utf8');await writeFile(path,text+'\n ');assert.equal(await hasConsent(temp,app),false);await writeFile(path,text);}
    assert.equal(await hasConsent(temp,{...app,version:'updated'}),false);
  }finally{await cleanup(temp);}
});
test('installation whitelist contains no media or local authorization; dry-run and existing destination are safe',async()=>{
  assert.equal(runtimeFiles.some(x=>/\.(png|mp4|webm)$|session|local-consent/.test(x)),false);
  const temp=await mkdtemp(join(tmpdir(),'jingchuang-install-'));try{
    const destination=join(temp,'new-install');const result=await install(destination,{dryRun:true,createShortcut:false});assert.equal(result.dryRun,true);
    await install(destination,{createShortcut:false});await writeFile(join(destination,'personal.txt'),'preserve');await assert.rejects(()=>install(destination,{createShortcut:false}),/已存在/);assert.equal(await readFile(join(destination,'personal.txt'),'utf8'),'preserve');
  }finally{await cleanup(temp);}
});
