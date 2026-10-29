export function mountSettings(win,api) {
  const doc=win.document;
  const controls=doc.createElement('div');controls.id='jingchuang-controls';
  controls.innerHTML=`<section id="jingchuang-settings" aria-label="景窗背景设置" hidden>
    <header><strong>景窗 <small>GPT 内部背景</small></strong><button type="button" aria-label="关闭景窗设置" data-action="close">关闭 ×</button></header>
    <div role="tablist" aria-label="背景设置分类"><button type="button" role="tab" id="jc-tab-library" aria-controls="jc-library" aria-selected="true">背景库</button><button type="button" role="tab" id="jc-tab-startup" aria-controls="jc-startup" aria-selected="false" tabindex="-1">启动动画</button><button type="button" role="tab" id="jc-tab-appearance" aria-controls="jc-appearance" aria-selected="false" tabindex="-1">外观</button></div>
    <section id="jc-library" role="tabpanel" aria-labelledby="jc-tab-library"><div class="jc-actions"><button type="button" data-action="import">导入背景</button><button type="button" data-action="default">恢复默认背景</button></div><p class="jc-hint">图片 PNG/JPG/WebP · 视频 MP4/WebM · 单文件最大 100MB<br>仅更改 GPT 内部背景，素材保存在本机。</p><input type="file" aria-label="导入本地背景" multiple hidden accept=".png,.jpg,.jpeg,.webp,.mp4,.webm"><div id="jc-grid" class="jc-grid"></div><label>自动轮播 <select aria-label="自动轮播" data-pref="rotationMinutes"><option value="0">关闭</option><option value="1">每 1 分钟</option><option value="5">每 5 分钟</option><option value="15">每 15 分钟</option></select></label></section>
    <section id="jc-startup" role="tabpanel" aria-labelledby="jc-tab-startup" hidden><p class="jc-hint">选一个进入 GPT 时播放一次的视频，随后转入聊天背景。</p><div class="jc-actions"><button type="button" data-action="import-startup">选择启动视频</button><button type="button" data-action="remove-startup">移除视频</button></div><input type="file" aria-label="选择本地启动视频" hidden accept=".mp4,.webm"><p id="jc-startup-name"></p><label><input type="checkbox" data-pref="startupEnabled">启用启动动画</label><label><input type="checkbox" data-pref="startupSound">启用启动视频声音</label><button type="button" data-action="replay">重播启动动画</button></section>
    <section id="jc-appearance" role="tabpanel" aria-labelledby="jc-tab-appearance" hidden>
      <p id="jc-current-background" class="jc-scope"></p><p class="jc-hint">以下四项仅影响当前背景，切换后自动恢复各自设置。</p>
      <label>背景强度 <input type="range" aria-label="背景强度" data-pref="strength" min="0" max="100" step="1"><output data-output="strength"></output></label>
      <label>背景模糊 <input type="range" aria-label="背景模糊" data-pref="blur" min="0" max="20" step="1"><output data-output="blur"></output></label>
      <label>显示方式 <select aria-label="背景显示方式" data-pref="fit"><option value="cover">填满</option><option value="contain">完整显示</option></select></label>
      <label>背景对齐 <select aria-label="背景对齐" data-pref="position"><option value="0% 0%">左上</option><option value="50% 0%">上中</option><option value="100% 0%">右上</option><option value="0% 50%">左中</option><option value="50% 50%">居中</option><option value="100% 50%">右中</option><option value="0% 100%">左下</option><option value="50% 100%">下中</option><option value="100% 100%">右下</option></select></label>
      <button type="button" data-action="reset-appearance">重置此背景显示</button>
      <hr><strong class="jc-section-title">全局界面设置</strong>
      <label>菜单不透明度 <input type="range" aria-label="菜单不透明度" data-pref="menuOpacity" min="10" max="95" step="1"><output data-output="menuOpacity"></output></label>
      <label>输入框不透明度 <input type="range" aria-label="输入框不透明度" data-pref="composerOpacity" min="10" max="95" step="1"><output data-output="composerOpacity"></output></label>
      <p class="jc-hint">数值越高，底色越不透明。菜单指 GPT 的下拉和右键菜单，不影响景窗设置框。</p>
      <div class="jc-preview-grid"><figure><figcaption>GPT 菜单示例</figcaption><div class="jc-preview-stage" role="img" aria-label="GPT 菜单不透明度示例"><div class="jc-preview-menu"><span>常用操作</span><span>更多选项</span></div></div></figure><figure><figcaption>输入框示例</figcaption><div class="jc-preview-stage" role="img" aria-label="输入框不透明度示例"><div class="jc-preview-composer">在这里输入…<span>↵</span></div></div></figure></div>
      <label><input type="checkbox" data-pref="reduceMotion">减少动态</label><p class="jc-hint">系统减少动态设置也会生效；视频暂停、跳过启动动画。</p>
    </section>
    <p id="jc-status" role="status" aria-live="polite"></p><footer><button type="button" data-action="pause">暂停背景</button><button type="button" data-action="restore">恢复 GPT 原外观</button></footer>
  </section><div class="jc-launch"><button type="button" id="jc-toggle" aria-expanded="false" aria-controls="jingchuang-settings">景窗 · 设置</button><button type="button" id="jc-skip" hidden>跳过启动动画</button></div>`;
  doc.body.appendChild(controls);
  const panel=controls.querySelector('#jingchuang-settings'),toggle=controls.querySelector('#jc-toggle'),grid=controls.querySelector('#jc-grid');
  const tabs=[...controls.querySelectorAll('[role=tab]')];
  let disposed=false,gridKey='',enabled=false,activeScope=null;
  function flush(){void api.flush().catch(e=>api.report(e.message));}
  function setOpen(open,returnFocus=false){if(!open&&!panel.hidden)flush();panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(!open&&returnFocus)toggle.focus({preventScroll:true});}
  function outside(e){if(!panel.hidden&&!e.composedPath().includes(controls))setOpen(false);}
  function key(e){
    if(e.ctrlKey&&e.altKey&&e.code==='KeyB'){e.preventDefault();setOpen(panel.hidden);}
    else if(e.key==='Escape'&&!panel.hidden){e.preventDefault();e.stopPropagation();setOpen(false,true);}
    else if(e.key==='Escape')api.skip();
  }
  function bind(action,fn){controls.querySelector(`[data-action="${action}"]`).onclick=()=>Promise.resolve().then(fn).catch(e=>api.report(e.message));}
  toggle.onclick=()=>setOpen(panel.hidden);bind('close',()=>setOpen(false,true));
  const files=controls.querySelector('input[aria-label="导入本地背景"]'),startup=controls.querySelector('input[aria-label="选择本地启动视频"]');
  bind('import',()=>files.click());bind('import-startup',()=>startup.click());
  files.onchange=()=>{void api.importFiles([...files.files]).finally(()=>{files.value='';});};
  startup.onchange=()=>{const file=startup.files?.[0];if(file)void api.importFiles([file],'startup').finally(()=>{startup.value='';});};
  bind('default',()=>api.select(null));bind('remove-startup',()=>api.removeStartup());bind('replay',()=>{setOpen(false);return api.replay();});
  bind('pause',()=>api.togglePause());bind('restore',()=>api.dispose());
  bind('reset-appearance',()=>api.resetAppearance());
  for(const tab of tabs){
    tab.onclick=()=>{for(const candidate of tabs){const active=candidate===tab;candidate.setAttribute('aria-selected',String(active));candidate.tabIndex=active?0:-1;controls.querySelector('#'+candidate.getAttribute('aria-controls')).hidden=!active;}};
    tab.onkeydown=e=>{const direction=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(direction){e.preventDefault();const next=tabs[(tabs.indexOf(tab)+direction+tabs.length)%tabs.length];next.click();next.focus();}};
  }
  for(const input of controls.querySelectorAll('[data-pref]')){
    const percent=['strength','menuOpacity','composerOpacity'].includes(input.dataset.pref);
    input.addEventListener(input.type==='range'?'input':'change',()=>{
      let value=input.type==='checkbox'?input.checked:input.type==='range'||input.dataset.pref==='rotationMinutes'?Number(input.value):input.value;
      if(percent)value/=100;
      void api.preferences({[input.dataset.pref]:value},{deferSave:input.type==='range',targetId:activeScope}).catch(e=>api.report(e.message));
    });
    if(input.type==='range'){input.addEventListener('pointerup',flush);input.addEventListener('pointercancel',flush);input.addEventListener('blur',flush);}
  }
  const unsubscribe=api.subscribe(state=>{
    if(disposed)return;enabled=state.ready;const scopeChanged=activeScope!==state.selectedId;activeScope=state.selectedId;
    for(const button of controls.querySelectorAll('[data-action="import"],[data-action="import-startup"]'))button.disabled=!enabled||state.busy;
    for(const input of controls.querySelectorAll('[data-pref]')){
      const key=input.dataset.pref,pct=['strength','menuOpacity','composerOpacity'].includes(key),value=state.prefs[key];
      if(input.type==='checkbox')input.checked=!!value;else if(doc.activeElement!==input||scopeChanged)input.value=String(pct?Math.round(value*100):value);
      input.disabled=!enabled||(state.selectedId===null&&['blur','fit','position'].includes(key));
      const output=controls.querySelector(`[data-output="${key}"]`);if(output)output.textContent=pct?Math.round(value*100)+'%':value+'px';
    }
    const current=state.items.find(x=>x.id===state.selectedId);
    controls.querySelector('#jc-current-background').textContent=current?'当前背景：'+current.name:'当前背景：默认渐变（可调整强度；其他显示选项需先选择素材）';
    controls.querySelector('[data-action="reset-appearance"]').disabled=!enabled||!current;
    const library=state.items.filter(x=>x.role==='background');
    const nextKey=JSON.stringify([library.map(x=>[x.id,x.name]),state.selectedId]);
    if(nextKey!==gridKey){
      gridKey=nextKey;grid.replaceChildren();
      if(!library.length){const empty=doc.createElement('p');empty.className='jc-hint';empty.textContent='还没有背景，导入你喜欢的图片或视频。';grid.appendChild(empty);}
      for(const item of library){
        const card=doc.createElement('article');card.className='jc-card';
        const pick=doc.createElement('button');pick.type='button';pick.className='jc-pick';pick.setAttribute('aria-label','使用背景：'+item.name);pick.setAttribute('aria-pressed',String(state.selectedId===item.id));
        const image=doc.createElement('img');image.alt='';if(item.thumbnail?.startsWith('data:image/jpeg;base64,'))image.src=item.thumbnail;
        const caption=doc.createElement('span');caption.textContent=(state.selectedId===item.id?'✓ ':'')+item.name;
        const meta=doc.createElement('small'),bytes=item.bytes||0;
        meta.textContent=(item.kind==='video'?'视频':'图片')+' · '+(bytes?bytes<1048576?Math.max(1,Math.round(bytes/1024))+' KB':(bytes/1048576).toFixed(1)+' MB':item.width+' × '+item.height);
        pick.append(image,caption,meta);pick.onclick=()=>void api.select(item.id).catch(e=>api.report(e.message));
        const remove=doc.createElement('button');remove.type='button';remove.className='jc-delete';remove.textContent='删除';remove.setAttribute('aria-label','删除背景：'+item.name);remove.onclick=()=>void api.remove(item.id).catch(e=>api.report(e.message));
        card.append(pick,remove);grid.appendChild(card);
      }
    }
    const startupItem=state.items.find(x=>x.id===state.startupId);
    controls.querySelector('#jc-startup-name').textContent=startupItem?'当前：'+startupItem.name:'尚未选择启动视频';
    controls.querySelector('[data-action="remove-startup"]').disabled=!startupItem||state.busy;
    controls.querySelector('[data-action="replay"]').disabled=!startupItem||!enabled||state.busy;
    controls.querySelector('[data-pref="startupEnabled"]').disabled=!startupItem||!enabled;
    controls.querySelector('[data-action="pause"]').textContent=state.paused?'继续背景':'暂停背景';
    controls.querySelector('#jc-skip').hidden=state.phase!=='startup';
    controls.querySelector('#jc-status').textContent=state.warning?state.warning+(state.message?'；'+state.message:''):state.message||(!enabled?'正在打开本机背景库…':state.busy?'正在导入并检查素材…':state.saved?'已在本机保存':'正在保存…');
  });
  controls.querySelector('#jc-skip').onclick=()=>api.skip();
  win.addEventListener('pointerdown',outside,true);win.addEventListener('keydown',key,true);
  return {open(){setOpen(true);},dispose(){if(disposed)return;disposed=true;unsubscribe();win.removeEventListener('pointerdown',outside,true);win.removeEventListener('keydown',key,true);controls.remove();}};
}
