import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createLibrary} from '../runtime/library.mjs';
function setup(seed={items:[],state:null},clock={setTimeout,clearTimeout}){
  let record=structuredClone(seed),fail=false,readFail=false,closed=false;const writes=[];
  const store={async load(){if(readFail)throw Error('blocked');return structuredClone(record);},async commit({upsert,remove,state}){writes.push({mediaWrites:upsert.length,remove:[...remove],state:structuredClone(state)});if(fail)throw Error('quota');const map=new Map(record.items.map(x=>[x.id,x]));for(const x of upsert)map.set(x.id,structuredClone(x));for(const id of remove)map.delete(id);record={items:[...map.values()],state:structuredClone(state)};},close(){closed=true;}};
  return {store,win:{crypto:webcrypto,...clock},writes,closed:()=>closed,fail(value){fail=value;},readFail(value){readFail=value;},record:()=>record};
}
function time(){let now=0,id=0;const jobs=new Map();return {setTimeout(fn,delay){jobs.set(++id,{at:now+delay,fn});return id;},clearTimeout(id){jobs.delete(id);},async advance(ms){const end=now+ms;for(;;){const entry=[...jobs.entries()].filter(([,x])=>x.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;jobs.delete(entry[0]);await entry[1].fn();}now=end;},count:()=>jobs.size};}
const media=(name='a.png',kind='image')=>({name,kind,type:kind==='video'?'video/mp4':'image/png',blob:new Blob(['fixture']),thumbnail:'data:image/jpeg;base64,Zg==',width:20,height:20,bytes:7});
test('neutral defaults, selected media and all preferences survive controller recreation',async()=>{
  const env=setup(),a=createLibrary(env.win,env.store);await a.ready;
  assert.equal(a.snapshot().selectedId,null);assert.equal(a.snapshot().prefs.startupEnabled,false);assert.equal(a.snapshot().prefs.rotationMinutes,0);
  const id=await a.add(media());await a.preferences({fit:'contain',position:'100% 0%',strength:.5,blur:4,menuOpacity:.8,composerOpacity:.3,rotationMinutes:5});
  const b=createLibrary(env.win,env.store);await b.ready;assert.equal(b.snapshot().selectedId,id);assert.equal(await b.getMedia(id).blob.text(),'fixture');assert.equal(b.snapshot().prefs.composerOpacity,.3);assert.equal(b.snapshot().prefs.rotationMinutes,5);
  assert.equal('blob' in b.snapshot().items[0],false);
});
test('removing active background returns to neutral without deleting other media',async()=>{
  const env=setup(),library=createLibrary(env.win,env.store);await library.ready;const a=await library.add(media('a.png')),b=await library.add(media('b.png'));
  await library.remove(a);assert.equal(library.snapshot().selectedId,null);assert.equal(library.snapshot().items[0].id,b);await library.select(b);await library.select(null);assert.equal(library.snapshot().items.length,1);
});
test('startup video is independent, replacement removes old video and removal disables startup',async()=>{
  const env=setup(),library=createLibrary(env.win,env.store);await library.ready;const bg=await library.add(media());const first=await library.add(media('one.mp4','video'),'startup');await library.preferences({startupEnabled:true,startupSound:true});const second=await library.add(media('two.mp4','video'),'startup');
  assert.equal(library.snapshot().selectedId,bg);assert.equal(library.getMedia(first),null);assert.equal(library.snapshot().startupId,second);await library.remove(second);assert.equal(library.snapshot().prefs.startupEnabled,false);assert.equal(library.snapshot().startupId,null);
  await assert.rejects(()=>library.add(media(),'startup'));
});
test('quota failure remains truthful and unsaved imports are retried with later preferences',async()=>{
  const env=setup(),library=createLibrary(env.win,env.store);await library.ready;env.fail(true);const id=await library.add(media());assert.equal(library.snapshot().saved,false);assert.match(library.snapshot().warning,/未能保存/);assert.equal(library.getMedia(id).name,'a.png');env.fail(false);await library.preferences({blur:3});assert.equal(library.snapshot().saved,true);assert.equal(env.record().items[0].id,id);
});
test('serialized writes preserve rapid selection/preferences and removed unsaved files stay removed',async()=>{
  const env=setup(),library=createLibrary(env.win,env.store);await library.ready;const a=await library.add(media('a.png')),b=await library.add(media('b.png'));
  await Promise.all([library.select(b),library.preferences({blur:7},{targetId:b}),library.preferences({strength:.2},{targetId:b})]);assert.equal(env.record().state.selectedId,b);assert.equal(env.record().state.appearanceById[b].blur,7);assert.equal(env.record().state.appearanceById[b].strength,.2);
  env.fail(true);const c=await library.add(media('c.png'));await library.remove(c);env.fail(false);await library.preferences({blur:5});assert.deepEqual(env.record().items.map(x=>x.id),[a,b]);
});
test('failed reads never overwrite an inaccessible existing library',async()=>{
  const env=setup(),a=createLibrary(env.win,env.store);await a.ready;await a.add(media());const original=structuredClone(env.record());env.readFail(true);const b=createLibrary(env.win,env.store);await b.ready;await b.preferences({blur:2});assert.equal(b.snapshot().saved,false);assert.deepEqual(env.record(),original);
});
test('rotation visits backgrounds in insertion order and ignores startup video',async()=>{
  const env=setup(),library=createLibrary(env.win,env.store);await library.ready;const a=await library.add(media('a.png'));await library.add(media('intro.mp4','video'),'startup');const b=await library.add(media('b.png'));await library.next();assert.equal(library.snapshot().selectedId,b);await library.next();assert.equal(library.snapshot().selectedId,a);
});
test('library order survives IndexedDB primary-key ordering after reload',async()=>{
  const env=setup(),a=createLibrary(env.win,env.store);await a.ready;const ids=[];for(const name of ['first.png','second.png','third.png'])ids.push(await a.add(media(name)));
  const store={...env.store,async load(){const record=await env.store.load();record.items.reverse();return record;}};
  const b=createLibrary(env.win,store);await b.ready;assert.deepEqual(b.snapshot().items.map(x=>x.id),ids);await b.next();assert.equal(b.snapshot().selectedId,ids[1]);
});
test('preferences are bounded, unknown values revert and invalid selection is rejected',async()=>{
  const env=setup(),library=createLibrary(env.win,env.store);await library.ready;await library.preferences({strength:5,menuOpacity:0,rotationMinutes:2,position:'script',fit:'stretch'});const p=library.snapshot().prefs;assert.equal(p.strength,1);assert.equal(p.menuOpacity,.1);assert.equal(p.rotationMinutes,0);assert.equal(p.position,'50% 50%');assert.equal(p.fit,'cover');await assert.rejects(()=>library.select('missing'));
});
test('two images and a video restore independent appearance through select, rotation and reload; global settings stay global',async()=>{
  const env=setup(),library=createLibrary(env.win,env.store);await library.ready;
  const a=await library.add(media('a.png')),b=await library.add(media('b.png')),v=await library.add(media('v.mp4','video'));
  const looks=[{strength:.2,blur:2,fit:'contain',position:'0% 0%'},{strength:.6,blur:8,fit:'cover',position:'100% 100%'},{strength:.4,blur:3,fit:'contain',position:'50% 0%'}];
  for(const [index,id] of [a,b,v].entries())await library.preferences(looks[index],{targetId:id});
  await library.preferences({menuOpacity:.3,composerOpacity:.7,reduceMotion:true});
  for(const [index,id] of [a,b,v].entries()){await library.select(id);const s=library.snapshot();for(const [key,value] of Object.entries(looks[index]))assert.equal(s.prefs[key],value);assert.equal(s.prefs.menuOpacity,.3);assert.equal(s.prefs.composerOpacity,.7);}
  await library.select(a);await library.next();assert.equal(library.snapshot().selectedId,b);assert.equal(library.snapshot().prefs.blur,8);
  const reloaded=createLibrary(env.win,env.store);await reloaded.ready;assert.deepEqual(reloaded.snapshot().appearanceById,library.snapshot().appearanceById);
  await reloaded.select(null);assert.equal(reloaded.snapshot().prefs.strength,.85);await reloaded.preferences({strength:.55});await reloaded.select(a);assert.equal(reloaded.snapshot().prefs.strength,.2);await reloaded.select(null);assert.equal(reloaded.snapshot().prefs.strength,.55);
});
test('legacy records inherit the old look without writes or media copies; new imports use new defaults',async()=>{
  const entries=['a','b','v'].map((id,index)=>({...media(id+'.png',index===2?'video':'image'),id,role:'background',order:index+1}));
  const old={strength:.33,blur:9,fit:'contain',position:'100% 0%',menuOpacity:.67,composerOpacity:.61};
  const env=setup({items:entries,state:{schema:1,selectedId:'a',prefs:old}}),library=createLibrary(env.win,env.store);await library.ready;
  assert.equal(env.writes.length,0);for(const id of ['a','b','v'])assert.deepEqual(library.snapshot().appearanceById[id],{strength:.33,blur:9,fit:'contain',position:'100% 0%'});
  await library.preferences({menuOpacity:.4});assert.equal(env.writes[0].mediaWrites,0);assert.equal(env.record().state.schema,1);for(const item of env.record().items)assert.equal(await item.blob.text(),'fixture');
  const fresh=await library.add(media('new.png'));assert.deepEqual(library.snapshot().appearanceById[fresh],{strength:.85,blur:0,fit:'cover',position:'50% 50%'});assert.equal(library.snapshot().appearanceById.a.strength,.33);
});
test('100 input events preview immediately but coalesce into one metadata-only write after 250ms idle',async()=>{
  const clock=time(),env=setup(undefined,clock),library=createLibrary(env.win,env.store);await library.ready;const id=await library.add(media());env.writes.length=0;
  for(let n=1;n<=100;n++)await library.preferences({strength:n/100,blur:n%21},{deferSave:true,targetId:id});
  assert.equal(library.snapshot().prefs.strength,1);assert.equal(library.snapshot().saved,false);assert.equal(clock.count(),1);assert.equal(env.writes.length,0);
  await clock.advance(249);assert.equal(env.writes.length,0);await clock.advance(1);await library.flush();assert.equal(env.writes.length,1);assert.equal(env.writes[0].mediaWrites,0);assert.equal(env.record().state.appearanceById[id].strength,1);assert.equal(library.snapshot().saved,true);
});
test('flush on pointer release cancels the timer; switching commits the previous background without leaking its settings',async()=>{
  const clock=time(),env=setup(undefined,clock),library=createLibrary(env.win,env.store);await library.ready;const a=await library.add(media('a.png')),b=await library.add(media('b.png'));env.writes.length=0;
  await library.preferences({strength:.22},{deferSave:true,targetId:a});await library.flush();assert.equal(clock.count(),0);assert.equal(env.writes.length,1);
  await library.preferences({blur:12},{deferSave:true,targetId:a});await library.select(b);assert.equal(clock.count(),0);assert.equal(library.snapshot().prefs.blur,0);assert.equal(env.record().state.appearanceById[a].blur,12);assert.equal(env.record().state.appearanceById[b].blur,0);
  await library.preferences({strength:.4},{deferSave:true,targetId:a});await library.flush();assert.equal(library.snapshot().prefs.strength,.85);assert.equal(env.record().state.appearanceById[a].strength,.4);assert.ok(env.writes.every(x=>x.mediaWrites===0));
});
test('normal close commits pending changes before store close, while a failed save remains retryable',async()=>{
  const clock=time(),env=setup(undefined,clock),library=createLibrary(env.win,env.store);await library.ready;const id=await library.add(media());env.writes.length=0;
  env.fail(true);await library.preferences({blur:6},{deferSave:true});await library.flush();assert.equal(library.snapshot().saved,false);assert.match(library.snapshot().warning,/未能保存/);
  env.fail(false);await library.flush();assert.equal(library.snapshot().saved,true);await library.preferences({blur:11},{deferSave:true});await library.dispose();assert.equal(env.record().state.appearanceById[id].blur,11);assert.equal(clock.count(),0);assert.equal(env.closed(),true);assert.ok(env.writes.every(x=>x.mediaWrites===0));
});
test('reset only affects the requested background; removal also deletes its appearance record',async()=>{
  const env=setup(),library=createLibrary(env.win,env.store);await library.ready;const a=await library.add(media('a.png')),b=await library.add(media('b.png'));
  await library.preferences({strength:.1,blur:7,menuOpacity:.42},{targetId:a});await library.preferences({strength:.5,blur:3},{targetId:b});await library.select(a);await library.resetAppearance();
  assert.deepEqual(library.snapshot().appearanceById[a],{strength:.85,blur:0,fit:'cover',position:'50% 50%'});assert.equal(library.snapshot().appearanceById[b].blur,3);assert.equal(library.snapshot().prefs.menuOpacity,.42);
  await library.remove(a);assert.equal(a in env.record().state.appearanceById,false);assert.equal(library.snapshot().selectedId,null);assert.equal(env.record().items.length,1);
});
