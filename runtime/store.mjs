// Stores only user-imported backgrounds and appearance preferences, never conversation data.
export function openLibraryStore(win) {
  let db, opening, closed=false;
  async function open() {
    if(closed)throw Error('背景库已关闭');
    if(db)return db;
    if(!opening)opening=new Promise((resolve,reject)=>{
      if(!win.indexedDB){reject(Error('当前客户端无法使用本机背景库'));return;}
      const request=win.indexedDB.open('jingchuang-gpt-background-v1',1);
      const timer=win.setTimeout(()=>reject(Error('背景库打开超时，请重新打开客户端')),6000);
      request.onupgradeneeded=()=>{request.result.createObjectStore('media',{keyPath:'id'});request.result.createObjectStore('state');};
      request.onerror=()=>{win.clearTimeout(timer);reject(request.error||Error('无法打开背景库'));};
      request.onblocked=()=>{win.clearTimeout(timer);reject(Error('背景库正在被其他窗口更新'));};
      request.onsuccess=()=>{
        win.clearTimeout(timer);
        if(closed){request.result.close();reject(Error('背景库已关闭'));return;}
        db=request.result;db.onversionchange=()=>{db.close();db=null;opening=null;};resolve(db);
      };
    }).catch(e=>{opening=null;throw e;});
    return opening;
  }
  async function transaction(mode,operate) {
    const connection=await open();
    return new Promise((resolve,reject)=>{
      const tx=connection.transaction(['media','state'],mode);
      let result;
      try{result=operate(tx.objectStore('media'),tx.objectStore('state'));}
      catch(e){tx.abort();reject(e);return;}
      tx.oncomplete=()=>resolve(typeof result==='function'?result():result);
      tx.onerror=tx.onabort=()=>reject(tx.error||Error('背景库读写失败'));
    });
  }
  return {
    load:()=>transaction('readonly',(media,state)=>{const a=media.getAll(),b=state.get('current');return ()=>({items:a.result,state:b.result});}),
    commit:({upsert=[],remove=[],state})=>transaction('readwrite',(media,settings)=>{
      for(const item of upsert)media.put(item);
      for(const id of remove)media.delete(id);
      settings.put(state,'current');
    }),
    close(){closed=true;db?.close();}
  };
}
