export function createMediaPlayer(win,container) {
  const doc=win.document,candidates=new Set();
  let current=null,generation=0,disposed=false,preferences={},context={paused:false,hidden:false,reduced:false};
  const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',mp4:'video/mp4',webm:'video/webm'};
  const allowed=new Set(Object.values(types));
  function validate(file,role='background'){
    if(!file||!Number.isFinite(file.size)||file.size<=0)throw Error('请选择非空的图片或视频');
    if(file.size>100*1024*1024)throw Error('单个文件不能超过 100MB');
    const type=file.type||types[String(file.name||'').split('.').pop().toLowerCase()];
    if(!allowed.has(type)||(role==='startup'&&!type.startsWith('video/')))throw Error(role==='startup'?'启动动画支持 MP4、WebM 视频':'背景支持 PNG、JPG、WebP、MP4、WebM');
    return type;
  }
  function release(candidate){
    if(!candidate||candidate.released)return;candidate.released=true;candidate.cancel?.();
    if(candidate.kind==='video'){candidate.element.pause();candidate.element.removeAttribute('src');candidate.element.load();}
    candidate.element.remove();win.URL.revokeObjectURL(candidate.url);candidates.delete(candidate);
  }
  function held(candidate){
    return current!==candidate||disposed||candidate.released||context.hidden||context.paused||context.reduced||preferences.reduceMotion||(candidate.role==='background'&&preferences.strength===0);
  }
  function startVideo(candidate){
    if(candidate.playingPromise)return;
    const e=candidate.element;
    function started(){if(candidate.role==='startup'&&!held(candidate))context.onStartupPlaying?.();}
    const attempt=(async()=>{
      try{await e.play();}
      catch{
        if(held(candidate))return;
        if(candidate.role==='startup'&&preferences.startupSound&&!candidate.autoplayMuted){
          candidate.autoplayMuted=true;e.muted=true;e.defaultMuted=true;e.setAttribute('muted','');
          try{
            await e.play();
            if(!held(candidate))context.onNotice?.('启动视频声音被客户端阻止，已自动静音播放');
            started();return;
          }catch{if(held(candidate))return;}
        }
        context.onError?.('视频播放被客户端阻止，请暂停后继续或换一个文件',candidate.role);return;
      }
      started();
    })();
    candidate.playingPromise=attempt;
    void attempt.finally(()=>{if(candidate.playingPromise===attempt)candidate.playingPromise=null;});
  }
  async function decode(blob,type,purpose='prepare'){
    const kind=type.startsWith('video/')?'video':'image',element=doc.createElement(kind==='video'?'video':'img');
    const candidate={element,kind,url:win.URL.createObjectURL(blob),released:false,role:'background',purpose};candidates.add(candidate);
    element.setAttribute('aria-hidden','true');
    Object.assign(element.style,{position:'absolute',inset:'0',width:'100%',height:'100%',objectFit:'cover',pointerEvents:'none',opacity:'0'});
    if(kind==='video'){element.muted=true;element.defaultMuted=true;element.playsInline=true;element.preload='auto';element.setAttribute('muted','');}
    else element.alt='';
    container.appendChild(element);
    try{
      await new Promise((resolve,reject)=>{
        const event=kind==='video'?'loadeddata':'load';
        const timer=win.setTimeout(fail,15000);
        function clean(){win.clearTimeout(timer);element.removeEventListener(event,done);element.removeEventListener('error',fail);candidate.cancel=null;}
        function done(){clean();resolve();}
        function fail(){clean();reject(Error('文件无法解码，已保留当前背景'));}
        candidate.cancel=()=>{clean();reject(Error('素材载入已取消'));};
        element.addEventListener(event,done,{once:true});element.addEventListener('error',fail,{once:true});element.src=candidate.url;
        if(kind==='video')element.load();
      });
      if(disposed||candidate.released)throw Error('播放器已关闭');
      return candidate;
    }catch(e){release(candidate);throw e;}
  }
  function synchronize(){
    if(!current)return;
    const e=current.element;
    e.style.objectFit=preferences.fit||'cover';e.style.objectPosition=preferences.position||'50% 50%';
    e.style.filter=current.role==='background'?`blur(${preferences.blur||0}px)`:'none';
    e.style.transform=current.role==='background'&&preferences.blur?'scale(1.05)':'';
    if(current.kind==='video'){
      e.loop=current.role==='background';e.muted=current.role==='background'||!preferences.startupSound||current.autoplayMuted===true;
      const hold=context.hidden||context.paused||context.reduced||preferences.reduceMotion||(current.role==='background'&&preferences.strength===0);
      if(hold)e.pause();
      else if(e.paused)startVideo(current);
    }
  }
  return {
    validate,
    async prepare(file,role='background'){
      const type=validate(file,role),candidate=await decode(file,type);
      try{
        const canvas=doc.createElement('canvas');canvas.width=240;canvas.height=135;
        const drawing=canvas.getContext('2d');drawing.fillStyle='#172338';drawing.fillRect(0,0,240,135);
        const e=candidate.element,w=e.videoWidth||e.naturalWidth,h=e.videoHeight||e.naturalHeight;
        if(!w||!h)throw Error('素材没有可显示的画面');
        const scale=Math.min(240/w,135/h);drawing.drawImage(e,(240-w*scale)/2,(135-h*scale)/2,w*scale,h*scale);
        return {blob:file,type,kind:candidate.kind,name:String(file.name||'本地背景').slice(0,240),thumbnail:canvas.toDataURL('image/jpeg',.75),width:w,height:h};
      }finally{release(candidate);}
    },
    async apply(item,prefs,role='background',onEnded){
      const ticket=++generation;preferences=prefs;
      for(const candidate of [...candidates])if(candidate!==current&&candidate.purpose==='apply')release(candidate);
      if(role==='startup'&&current?.kind==='video')current.element.pause();
      if(!item){release(current);current=null;return true;}
      let candidate;
      try{
        validate({size:item.blob?.size,type:item.type,name:item.name},role);
        candidate=await decode(item.blob,item.type,'apply');
        if(disposed||ticket!==generation){release(candidate);return false;}
        const previous=current;current=candidate;candidate.role=role;
        if(role==='startup'){
          let previousTime=0;
          const element=candidate.element;
          element.addEventListener('ended',()=>{if(current===candidate)onEnded?.();},{once:true});
          element.addEventListener('error',()=>{if(current===candidate&&!candidate.released)context.onError?.('启动视频播放失败',role);});
          element.addEventListener('timeupdate',()=>{
            if(!held(candidate)&&element.currentTime>previousTime){previousTime=element.currentTime;context.onStartupProgress?.();}
          });
        }
        candidate.element.style.opacity='1';release(previous);synchronize();return true;
      }catch(e){if(ticket===generation&&!disposed)throw e;return false;}
    },
    update(prefs,nextContext){preferences=prefs;context={...context,...nextContext};synchronize();},
    clearStartup(){
      if(current?.role!=='startup')return false;
      release(current);current=null;return true;
    },
    status(){return {kind:current?.kind||null,role:current?.role||null,playing:current?.kind==='video'&&!current.element.paused,autoplayMuted:current?.autoplayMuted===true,mediaCount:candidates.size};},
    dispose(){disposed=true;generation++;for(const candidate of [...candidates])release(candidate);current=null;}
  };
}
