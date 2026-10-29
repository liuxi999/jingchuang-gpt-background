import test from 'node:test';
import assert from 'node:assert/strict';
import {createMediaPlayer} from '../runtime/player.mjs';
function browser({playFailures=0}={}){
  let serial=0,remainingPlayFailures=playFailures,playCalls=0;const urls=new Map(),revoked=new Set(),elements=[];
  class Element extends EventTarget{
    constructor(tag){super();this.tag=tag;this.style={};this.paused=true;this.naturalWidth=this.videoWidth=1024;this.naturalHeight=this.videoHeight=576;elements.push(this);}
    setAttribute(){} removeAttribute(name){if(name==='src')this._src='';}
    set src(value){this._src=value;if(this.tag==='img')this.load();}get src(){return this._src;}
    load(){const file=urls.get(this._src);if(file&&!file.slow)queueMicrotask(()=>this.dispatchEvent(new Event(file.bad?'error':this.tag==='img'?'load':'loadeddata')));}
    pause(){this.paused=true;}play(){playCalls++;if(remainingPlayFailures-->0){this.paused=true;return Promise.reject(Error('autoplay blocked'));}this.paused=false;return Promise.resolve();}remove(){this.removed=true;}
  }
  const win={setTimeout,clearTimeout,URL:{createObjectURL(blob){const url='blob:test/'+(++serial);urls.set(url,blob);return url;},revokeObjectURL(url){revoked.add(url);}},document:{createElement(tag){if(tag==='canvas')return {getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,Zg=='};return new Element(tag);}}};
  return {win,container:{appendChild(){}},revoked,elements,finish(file){for(const element of elements)if(urls.get(element.src)===file)element.dispatchEvent(new Event(element.tag==='img'?'load':'loadeddata'));},count:()=>serial,playCalls:()=>playCalls};
}
function file(name='test.mp4',options={}){return Object.assign(new Blob(['media'],{type:name.endsWith('.png')?'image/png':'video/mp4'}),{name,...options});}
const item=blob=>({blob,name:blob.name,type:blob.type});
const prefs={strength:.85,fit:'cover',position:'50% 50%',blur:0,startupSound:false,reduceMotion:false};
test('player keeps last good media on a corrupt selection and rejects oversized/unsupported files',async()=>{
  const env=browser(),player=createMediaPlayer(env.win,env.container);await player.apply(item(file()),prefs);const first=env.elements[0];
  await assert.rejects(()=>player.apply(item(file('broken.mp4',{bad:true})),prefs),/无法解码/);assert.equal(first.removed,undefined);assert.equal(player.status().kind,'video');
  assert.throws(()=>player.validate({size:101*1024*1024,type:'video/mp4'}),/100MB/);assert.throws(()=>player.validate({size:5,type:'text/html'}),/支持/);assert.throws(()=>player.validate(file('test.png'),'startup'),/启动动画/);
  player.dispose();assert.equal(env.revoked.size,env.count());
});
test('switching selected background does not cancel a concurrent file import',async()=>{
  const env=browser(),player=createMediaPlayer(env.win,env.container),slow=file('import.png',{slow:true});
  const importing=player.prepare(slow);await player.apply(item(file()),prefs);env.finish(slow);const prepared=await importing;
  assert.equal(prepared.name,'import.png');assert.equal(player.status().kind,'video');assert.equal(player.status().mediaCount,1);player.dispose();assert.equal(env.revoked.size,env.count());
});
test('last display selection wins; muted background honors pause, reduced motion, hidden window and zero strength',async()=>{
  const env=browser(),player=createMediaPlayer(env.win,env.container),slow=file('old.mp4',{slow:true});
  const older=player.apply(item(slow),prefs);await player.apply(item(file('new.mp4')),prefs);assert.equal(await older,false);assert.equal(player.status().playing,true);
  const active=env.elements.find(x=>!x.removed);assert.equal(active.muted,true);assert.equal(active.loop,true);
  for(const context of [{paused:true},{paused:false,reduced:true},{reduced:false,hidden:true}]){player.update(prefs,context);assert.equal(player.status().playing,false);}
  player.update({...prefs,strength:0},{hidden:false});assert.equal(player.status().playing,false);player.update(prefs,{});assert.equal(player.status().playing,true);
  player.dispose();assert.equal(env.revoked.size,env.count());
});
test('startup is a separate non-looping slot, optional sound, and emits completion once',async()=>{
  const env=browser(),player=createMediaPlayer(env.win,env.container);let complete=0;
  await player.apply(item(file('intro.mp4')),{...prefs,startupSound:true},'startup',()=>complete++);
  const active=env.elements.find(x=>!x.removed);assert.equal(active.loop,false);assert.equal(active.muted,false);active.dispatchEvent(new Event('ended'));active.dispatchEvent(new Event('ended'));assert.equal(complete,1);
  player.fade();assert.equal(active.paused,true);assert.equal(active.style.opacity,'0');player.dispose();
});
test('blocked audible startup automatically retries muted without skipping the animation',async()=>{
  const env=browser({playFailures:1}),player=createMediaPlayer(env.win,env.container),notices=[],errors=[];
  player.update({...prefs,startupSound:true},{onNotice:value=>notices.push(value),onError:value=>errors.push(value)});
  await player.apply(item(file('intro.mp4')),{...prefs,startupSound:true},'startup');
  await new Promise(resolve=>setTimeout(resolve,0));
  const active=env.elements.find(x=>!x.removed);
  assert.equal(env.playCalls(),2);assert.equal(active.muted,true);assert.equal(player.status().playing,true);assert.equal(player.status().autoplayMuted,true);
  assert.deepEqual(notices,['启动视频声音被客户端阻止，已自动静音播放']);assert.deepEqual(errors,[]);player.dispose();
});
test('startup reports an error only when both audible and muted playback are blocked',async()=>{
  const env=browser({playFailures:2}),player=createMediaPlayer(env.win,env.container),notices=[],errors=[];
  player.update({...prefs,startupSound:true},{onNotice:value=>notices.push(value),onError:value=>errors.push(value)});
  await player.apply(item(file('intro.mp4')),{...prefs,startupSound:true},'startup');
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(env.playCalls(),2);assert.deepEqual(notices,[]);assert.deepEqual(errors,['视频播放被客户端阻止，请暂停后继续或换一个文件']);player.dispose();
});
