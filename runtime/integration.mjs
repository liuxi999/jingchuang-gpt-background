import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openLibraryStore} from './store.mjs';
import {createLibrary} from './library.mjs';
import {createMediaPlayer} from './player.mjs';
import {createRotationClock} from './rotation.mjs';
import {mountSettings} from './settings.mjs';

export function installAppearance(win,css,openStore,makeLibrary,makePlayer,makeClock,makeSettings,options={}) {
  if(win.top!==win)return {installed:false,reason:'not-top-window'};
  if(win.__jingchuangAppearance)return {installed:true,alreadyActive:true};
  if(win.__bailiCodexSkin)return {installed:false,reason:'旧白璃外观仍在运行，请保存工作并正常退出，再用景窗入口打开'};
  const doc=win.document,root=doc.documentElement,host=doc.querySelector('#root');
  if(!doc.body||!host)return {installed:false,reason:'main-window-not-ready'};
  const previous=root.getAttribute('data-jingchuang-active');
  const surface=doc.createElement('div');surface.id='jingchuang-surface';surface.setAttribute('aria-hidden','true');
  const style=doc.createElement('style');style.id='jingchuang-style';style.textContent=css;
  const themeStyle=doc.createElement('style');themeStyle.id='jingchuang-theme';
  doc.head.append(style,themeStyle);doc.body.appendChild(surface);root.setAttribute('data-jingchuang-active','');
  // The first main document is gated immediately. IndexedDB and video decoding
  // must finish behind this surface so GPT content never flashes before the intro.
  const gateStartup=options.playStartup!==false;
  Object.assign(surface.style,gateStartup
    ?{opacity:'1',zIndex:'2147483644',pointerEvents:'auto'}
    :{opacity:'0',zIndex:'0',pointerEvents:'none'});
  const library=makeLibrary(win,openStore(win)),player=makePlayer(win,surface),motion=win.matchMedia('(prefers-reduced-motion: reduce)');
  const listeners=new Set();
  let panel,initialized=false,presented=false,disposed=false,paused=false,busy=false,message='',phase='loading',loadedId=null,requestedId=undefined,requestSerial=0,introSerial=0,introTimer=0,introPlaying=false,themeTimer=0,visualFrame=0;
  function state(){return {...library.snapshot(),ready:initialized,presented,paused,busy,message,phase};}
  function notify(){if(!disposed)for(const fn of listeners)fn(state());}
  function report(value){message=String(value||'');notify();}
  function reduced(){return library.snapshot().prefs.reduceMotion||motion.matches;}
  function syncTheme(){
    if(disposed)return;
    const parts=(win.getComputedStyle(host).color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const dark=parts.length!==3||(parts[0]*.2126+parts[1]*.7152+parts[2]*.0722)/255>.45;
    const p=library.snapshot().prefs,tone=dark?'8,17,30':'245,248,252';
    const text=`html[data-jingchuang-active]{--jc-base:${dark?'#0b1220':'#eef3fa'};--jc-shell:rgba(${tone},.15);--jc-menu:rgba(${tone},${p.menuOpacity});--jc-composer:rgba(${tone},${p.composerOpacity});--jc-readable:rgba(${tone},.92);--jc-ui-fg:${dark?'#e1e8f3':'#183049'};--jc-ui-bg:${dark?'#111d2d':'#f7faff'};--jc-ui-border:${dark?'#40536a':'#adbdcd'};--jc-ui-control:${dark?'#1a2b40':'#edf3f9'};--jc-ui-selected:${dark?'#21486b':'#d7eaff'}}#jingchuang-controls{color-scheme:${dark?'dark':'light'}}`;
    if(themeStyle.textContent!==text)themeStyle.textContent=text;
    surface.style.background=dark?'radial-gradient(ellipse at 15% 20%,#233751,transparent 65%),linear-gradient(145deg,#091321,#1b263b)':'radial-gradient(ellipse at 15% 20%,#dbe8f7,transparent 65%),linear-gradient(145deg,#eef3fa,#cddbef)';
  }
  const clock=makeClock(win,()=>library.next());
  function playbackPreferences(s){return phase==='startup'?{...s.globalPrefs,strength:1,blur:0,fit:'cover',position:'50% 50%'}:s.prefs;}
  function watchIntroProgress(){
    win.clearTimeout(introTimer);
    if(phase==='startup'&&!doc.hidden)introTimer=win.setTimeout(()=>{
      report('启动动画连续 10 秒没有播放进度，已跳过');
      finishIntro();
    },10000);
  }
  function introStarted(){
    if(phase!=='startup'||doc.hidden)return;
    introPlaying=true;watchIntroProgress();synchronize();
  }
  function scheduleSynchronize(){if(!disposed&&!visualFrame)visualFrame=win.requestAnimationFrame(()=>{visualFrame=0;synchronize();});}
  function synchronize(){
    if(disposed)return;
    const s=library.snapshot(),foreground=phase==='startup'||(phase==='loading'&&gateStartup);syncTheme();
    surface.style.opacity=foreground?'1':String(s.prefs.strength);
    surface.style.zIndex=foreground?'2147483644':'0';
    surface.style.pointerEvents=foreground?'auto':'none';
    player.update(playbackPreferences(s),{
      paused:paused&&phase!=='startup',hidden:doc.hidden,reduced:reduced(),
      onStartupPlaying:introStarted,onStartupProgress:watchIntroProgress,onNotice:report,
      onError(value,role){report(value);if(role==='startup')finishIntro();}
    });
    clock.configure(s.prefs.rotationMinutes);clock.hold(paused||doc.hidden||reduced()||phase!=='background'||s.prefs.strength===0);
    if(phase==='startup'&&reduced())finishIntro();
  }
  async function background(){
    if(disposed||!initialized||phase!=='background')return;
    const s=library.snapshot();if(requestedId===s.selectedId){scheduleSynchronize();return;}
    const ticket=++requestSerial;requestedId=s.selectedId;
    try{
      const applied=await player.apply(library.getMedia(s.selectedId),s.prefs);
      if(applied&&!disposed&&ticket===requestSerial&&phase==='background'){loadedId=s.selectedId;synchronize();}
    }catch(e){
      if(!disposed&&ticket===requestSerial){
        const fallback=loadedId!==s.selectedId&&library.getMedia(loadedId)?loadedId:null;
        report(e.message+(fallback?'；已回退到上一个可用背景':'；已切换到默认背景'));
        requestedId=undefined;await library.select(fallback);
      }
    }
  }
  function finishIntro(){
    if(disposed||phase!=='startup')return;
    introSerial++;phase='background';introPlaying=false;watchIntroProgress();
    if(player.clearStartup())loadedId=null;
    requestedId=undefined;synchronize();notify();void background();
  }
  async function replay(){
    if(disposed||!initialized)return;
    const s=library.snapshot(),item=library.getMedia(s.startupId);
    if(!item){report('请先选择启动视频');return;}
    if(reduced()){report('减少动态已启用，已跳过启动动画');return;}
    if(player.clearStartup())loadedId=null;
    const ticket=++introSerial;requestSerial++;phase='startup';introPlaying=false;message='';
    watchIntroProgress();synchronize();notify();
    try{
      const applied=await player.apply(item,playbackPreferences(s),'startup',finishIntro);
      if(applied&&!disposed&&ticket===introSerial){synchronize();notify();}
    }catch(e){if(!disposed&&ticket===introSerial){report('启动动画不可用：'+e.message);finishIntro();}}
  }
  async function importFiles(files,role='background'){
    if(disposed||busy||!initialized)return;
    busy=true;message='';notify();let success=0;const errors=[];
    try{
      for(const file of role==='startup'?files.slice(0,1):files){
        if(disposed)break;
        try{const prepared=await player.prepare(file,role);if(disposed)break;prepared.bytes=file.size;await library.add(prepared,role);success++;}
        catch(e){errors.push(String(file.name||'文件')+'：'+e.message);}
      }
    }finally{busy=false;message=errors.length?`导入成功 ${success} 个；`+errors.join('；'):success?`已导入 ${success} 个素材`:'';notify();}
  }
  async function dispose(){
    if(disposed)return;const saving=library.flush();disposed=true;phase='disposed';introSerial++;requestSerial++;win.clearTimeout(introTimer);win.clearTimeout(themeTimer);if(visualFrame)win.cancelAnimationFrame(visualFrame);
    clock.dispose();observer.disconnect();panel?.dispose();player.dispose();listeners.clear();
    doc.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',visibility);win.removeEventListener('pagehide',dispose);
    surface.remove();style.remove();themeStyle.remove();previous===null?root.removeAttribute('data-jingchuang-active'):root.setAttribute('data-jingchuang-active',previous);
    delete win.__jingchuangAppearance;await saving;await library.dispose();
  }
  function restore(){
    if(options.stopToken){
      win.__jingchuangRestoreToken=options.stopToken;
      try{win.__jingchuangStopWatcher?.(options.stopToken);}catch{/* A reconnect can read the restore token. */}
    }
    return dispose();
  }
  const api={
    subscribe(fn){listeners.add(fn);fn(state());return ()=>listeners.delete(fn);},
    importFiles,select:id=>{message='';clock.reset();return library.select(id);},remove:id=>library.remove(id),removeStartup:()=>library.remove(library.snapshot().startupId),
    preferences:(changes,options)=>{message='';return library.preferences(changes,options);},resetAppearance:()=>{message='';return library.resetAppearance();},flush:()=>library.flush(),replay,skip:finishIntro,report,dispose:restore,
    togglePause(){paused=!paused;message='';synchronize();notify();}
  };
  library.subscribe(()=>{if(disposed)return;if(initialized)void background();scheduleSynchronize();notify();});
  panel=makeSettings(win,api);
  function visibility(){if(doc.hidden)void library.flush();watchIntroProgress();synchronize();notify();}
  const observer=new win.MutationObserver(()=>{win.clearTimeout(themeTimer);themeTimer=win.setTimeout(syncTheme,40);});
  observer.observe(root,{attributes:true,attributeFilter:['class','style','data-theme']});observer.observe(host,{attributes:true,attributeFilter:['class','style','data-theme']});
  doc.addEventListener('visibilitychange',visibility);motion.addEventListener('change',visibility);win.addEventListener('pagehide',dispose,{once:true});
  win.__jingchuangAppearance={
    dispose,replay,openSettings:()=>panel.open(),status:()=>({...state(),player:player.status()}),
    get presented(){return presented;},
    get mounted(){return surface.isConnected&&style.isConnected&&themeStyle.isConnected&&doc.getElementById('root')===host&&!!doc.getElementById('jc-toggle');}
  };
  library.ready.then(()=>{
    if(disposed)return;initialized=true;
    const {prefs,startupId}=library.snapshot();
    if(gateStartup&&prefs.startupEnabled&&library.getMedia(startupId)&&!reduced())void replay();
    else{phase='background';synchronize();notify();void background();}
    win.requestAnimationFrame(()=>win.requestAnimationFrame(()=>{if(!disposed){const rect=surface.getBoundingClientRect();presented=rect.width>0&&rect.height>0;notify();}}));
  }).catch(e=>{phase='background';synchronize();report(e.message);});
  return {installed:true};
}

export async function buildPayload(root,options){
  const css=await readFile(join(root,'appearance.css'),'utf8');
  return `(${installAppearance.toString()})(window,${JSON.stringify(css)},${openLibraryStore.toString()},${createLibrary.toString()},${createMediaPlayer.toString()},${createRotationClock.toString()},${mountSettings.toString()},${JSON.stringify(options)})`;
}
