export function createLibrary(win,store) {
  const defaults={strength:.85,blur:0,fit:'cover',position:'50% 50%',menuOpacity:.65,composerOpacity:.65,reduceMotion:false,rotationMinutes:0,startupEnabled:false,startupSound:false};
  const positions=new Set(['0% 0%','50% 0%','100% 0%','0% 50%','50% 50%','100% 50%','0% 100%','50% 100%','100% 100%']);
  const listeners=new Set(),items=new Map(),dirty=new Map(),removed=new Set(),appearanceById=new Map(),pendingRevisions=new Set();
  const appearanceKeys=['strength','blur','fit','position'];
  let selectedId=null,startupId=null,prefs={...defaults},saved=true,warning='',revision=0,queue=Promise.resolve(),disposed=false,closing=false,loadFailed=false,loaded=false,saveTimer=0,needsWrite=false;
  const number=(v,a,b,d)=>Number.isFinite(Number(v))?Math.max(a,Math.min(b,Number(v))):d;
  function normalize(p={}){return {
    strength:number(p.strength,0,1,defaults.strength),blur:number(p.blur,0,20,0),fit:p.fit==='contain'?'contain':'cover',position:positions.has(p.position)?p.position:defaults.position,
    menuOpacity:number(p.menuOpacity,.1,.95,defaults.menuOpacity),composerOpacity:number(p.composerOpacity,.1,.95,defaults.composerOpacity),
    reduceMotion:p.reduceMotion===true,rotationMinutes:[1,5,15].includes(p.rotationMinutes)?p.rotationMinutes:0,startupEnabled:p.startupEnabled===true,startupSound:p.startupSound===true
  };}
  function normalizeAppearance(value={}){const normalized=normalize(value);return Object.fromEntries(appearanceKeys.map(key=>[key,normalized[key]]));}
  function appearanceRecord(){return Object.fromEntries([...appearanceById].map(([id,value])=>[id,{...value}]));}
  function snapshot(){
    const appearance=selectedId?appearanceById.get(selectedId)||normalizeAppearance():{...normalizeAppearance(),strength:prefs.strength};
    return {items:[...items.values()].map(({blob,...metadata})=>metadata),selectedId,startupId,prefs:{...prefs,...appearance},globalPrefs:{...prefs},appearanceById:appearanceRecord(),saved,warning,revision};
  }
  function emit(){if(!disposed)for(const listener of listeners)listener(snapshot());}
  function changed(){revision++;needsWrite=true;saved=false;emit();}
  function cancelSave(){if(saveTimer)win.clearTimeout(saveTimer);saveTimer=0;}
  function persist(){
    cancelSave();
    if(!needsWrite||disposed||pendingRevisions.has(revision))return queue;
    const ticket=revision,upsert=[...dirty.values()],remove=[...removed];
    const state={schema:1,selectedId,startupId,prefs:{...prefs},appearanceById:appearanceRecord()};
    pendingRevisions.add(ticket);
    queue=queue.catch(()=>{}).then(async()=>{
      try{
        // A failed initial read must never silently overwrite an existing inaccessible library.
        if(loadFailed)throw Error('请重新打开 GPT 后再尝试保存');
        // An earlier queued write may already have stored these blobs. Appearance
        // edits only write the small state record, never the same media again.
        await store.commit({upsert:upsert.filter(item=>dirty.get(item.id)===item),remove:remove.filter(id=>removed.has(id)),state});
        for(const item of upsert)if(dirty.get(item.id)===item)dirty.delete(item.id);
        for(const id of remove)if(!items.has(id))removed.delete(id);
        if(ticket===revision){needsWrite=false;saved=true;warning='';emit();}
        return true;
      }catch{if(ticket===revision){saved=false;warning='本次改动仅在当前窗口有效，未能保存到本机；请检查空间或重新打开 GPT';emit();}return false;}
      finally{pendingRevisions.delete(ticket);}
    });return queue;
  }
  function flush(){cancelSave();return persist();}
  const ready=(async()=>{
    try{
      const record=await store.load();if(disposed)return;
      if(record.state&&record.state.schema!==1)throw Error('不支持的背景库版本');
      for(const item of (record.items||[]).sort((a,b)=>(a.order??a.addedAt??0)-(b.order??b.addedAt??0))){
        if(typeof item.id==='string'&&item.blob?.size>0&&item.blob.size<=100*1024*1024&&['background','startup'].includes(item.role)&&['image','video'].includes(item.kind))items.set(item.id,item);
      }
      const state=record.state||{};prefs=normalize(state.prefs);
      // Additive migration: retain schema/database/media and copy the old look
      // into every existing background. Persist on the next normal edit.
      for(const item of items.values())if(item.role==='background')appearanceById.set(item.id,normalizeAppearance(state.appearanceById?.[item.id]||prefs));
      selectedId=items.get(state.selectedId)?.role==='background'?state.selectedId:null;
      startupId=items.get(state.startupId)?.role==='startup'?state.startupId:null;
    }catch{loadFailed=true;saved=false;warning='上次背景库无法读取；当前显示默认背景，请重新打开 GPT 后重试';}
    loaded=true;emit();
  })();
  return {
    ready,snapshot,getMedia:id=>items.get(id)||null,
    subscribe(fn){listeners.add(fn);fn(snapshot());return ()=>listeners.delete(fn);},
    async add(prepared,role='background'){
      await ready;if(disposed||closing)return;await flush();if(disposed||closing)return;
      if(!['background','startup'].includes(role)||!prepared?.blob||!['image','video'].includes(prepared.kind)||(role==='startup'&&prepared.kind!=='video'))throw Error('无效的背景素材');
      if(prepared.blob.size<=0||prepared.blob.size>100*1024*1024)throw Error('素材大小必须在 0 至 100MB 之间');
      const order=Math.max(0,...[...items.values()].map(x=>x.order||0))+1;
      const item={...prepared,id:win.crypto.randomUUID(),role,order,addedAt:Date.now()};
      items.set(item.id,item);dirty.set(item.id,item);
      if(role==='startup'){
        if(startupId){items.delete(startupId);dirty.delete(startupId);removed.add(startupId);}startupId=item.id;
      }else{appearanceById.set(item.id,normalizeAppearance());if(!selectedId)selectedId=item.id;}
      changed();await persist();return item.id;
    },
    async select(id){await ready;if(disposed||closing)return;if(id!==null&&items.get(id)?.role!=='background')throw Error('背景不存在');await flush();if(disposed||closing)return;selectedId=id;changed();return persist();},
    async remove(id){await ready;if(disposed||closing||!items.has(id))return;await flush();if(disposed||closing)return;items.delete(id);dirty.delete(id);removed.add(id);appearanceById.delete(id);if(selectedId===id)selectedId=null;if(startupId===id){startupId=null;prefs.startupEnabled=false;}changed();return persist();},
    async preferences(changes,{deferSave=false,targetId=selectedId}={}){
      if(!loaded)await ready;if(disposed||closing)return;
      if(targetId!==null&&items.get(targetId)?.role!=='background')throw Error('要调整的背景已不存在');
      const globals=Object.fromEntries(Object.entries(changes).filter(([key])=>!appearanceKeys.includes(key)));
      prefs=normalize({...prefs,...globals});
      const local=Object.fromEntries(Object.entries(changes).filter(([key])=>appearanceKeys.includes(key)));
      if(targetId!==null)appearanceById.set(targetId,normalizeAppearance({...appearanceById.get(targetId),...local}));
      else if('strength' in local)prefs.strength=number(local.strength,0,1,defaults.strength);
      changed();
      if(deferSave){cancelSave();saveTimer=win.setTimeout(()=>{saveTimer=0;void persist();},250);return true;}
      return persist();
    },
    async resetAppearance(id=selectedId){if(id===null)return;return this.preferences(normalizeAppearance(),{targetId:id});},
    async next(){await ready;const list=[...items.values()].filter(x=>x.role==='background');if(!list.length)return;const index=list.findIndex(x=>x.id===selectedId);return this.select(list[(index+1)%list.length].id);},
    flush,
    async dispose(){if(disposed||closing)return;closing=true;listeners.clear();await flush().catch(()=>{});disposed=true;store.close();}
  };
}
