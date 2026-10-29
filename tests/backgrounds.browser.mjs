async page => {
  page.setDefaultTimeout(20000);
  const checks=[],state=()=>page.evaluate(()=>window.__jingchuangAppearance.status());
  const saved=()=>page.waitForFunction(()=>window.__jingchuangAppearance.status().saved&&!window.__jingchuangAppearance.status().busy);
  await page.waitForFunction(()=>window.__jingchuangAppearance?.status().presented);
  // All media is generated inside this isolated mock origin. No personal files,
  // external assets, chat content, account data or native GPT UI is accessed.
  await page.evaluate(async()=>{
    await window.__jingchuangAppearance.dispose();
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');
    const image=async(name,color)=>{ctx.fillStyle=color;ctx.fillRect(0,0,320,180);const thumbnail=canvas.toDataURL('image/jpeg');const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));return {name,type:blob.type,kind:'image',blob,thumbnail,bytes:blob.size,width:320,height:180};};
    const a=await image('blue.png','#366b8a'),b=await image('amber.png','#b48458');
    const stream=canvas.captureStream(15),mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('Fixture encoder unavailable');
    const recorder=new MediaRecorder(stream,{mimeType:mime}),chunks=[];
    const finished=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve;});recorder.start();
    for(let n=0;n<12;n++){ctx.fillStyle=n%2?'#779e7b':'#537f8a';ctx.fillRect(0,0,320,180);await new Promise(resolve=>setTimeout(resolve,80));}recorder.stop();await finished;stream.getTracks().forEach(t=>t.stop());
    const blob=new Blob(chunks,{type:'video/webm'}),video={name:'motion.webm',type:'video/webm',kind:'video',blob,thumbnail:canvas.toDataURL('image/jpeg'),bytes:blob.size,width:320,height:180};
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('jingchuang-gpt-background-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction(['media','state'],'readwrite'),media=tx.objectStore('media');media.clear();for(const [index,item] of [a,b,video].entries())media.put({...item,id:['fixture-a','fixture-b','fixture-v'][index],role:'background',order:index+1});tx.objectStore('state').put({schema:1,selectedId:'fixture-a',startupId:null,prefs:{strength:.42,blur:6,fit:'contain',position:'100% 0%',menuOpacity:.67,composerOpacity:.61}},'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  });
  await page.addInitScript(()=>{
    window.__fixtureWrites={state:0,media:0};const original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){if(this.name==='media')window.__fixtureWrites.media++;if(this.name==='state')window.__fixtureWrites.state++;return original.apply(this,args);};
  });
  await page.reload();await page.waitForFunction(()=>window.__jingchuangAppearance?.status().presented);
  let s=await state();
  for(const id of ['fixture-a','fixture-b','fixture-v']){const p=s.appearanceById[id];if(p.strength!==.42||p.blur!==6||p.fit!=='contain'||p.position!=='100% 0%')throw Error('Legacy appearance changed');}
  let writes=await page.evaluate(()=>window.__fixtureWrites);if(writes.state||writes.media)throw Error('Migration wrote media/state unnecessarily');
  checks.push('Real IndexedDB legacy migration preserves all three media and old appearance without rewriting files');
  const panel=page.getByRole('region',{name:'景窗背景设置'}),toggle=page.getByRole('button',{name:'景窗 · 设置',exact:true});
  const tab=async name=>{if(!await panel.isVisible())await toggle.click();await page.getByRole('tab',{name,exact:true}).click();};
  const choose=async name=>{await tab('背景库');await page.getByRole('button',{name:'使用背景：'+name,exact:true}).click();await saved();};
  const range=async(name,value,pointerup=true)=>{await tab('外观');await page.getByRole('slider',{name,exact:true}).evaluate((e,values)=>{e.value=String(values.value);e.dispatchEvent(new Event('input',{bubbles:true}));if(values.pointerup)e.dispatchEvent(new Event('pointerup',{bubbles:true}));},{value,pointerup});if(pointerup)await saved();};
  await tab('外观');
  await page.evaluate(()=>{window.__visualUpdates=0;new MutationObserver(()=>window.__visualUpdates++).observe(document.querySelector('#jingchuang-theme'),{childList:true,subtree:true,characterData:true});window.__fixtureWrites={state:0,media:0};const input=document.querySelector('[data-pref=menuOpacity]');for(let n=0;n<100;n++){input.value=String(10+n%85);input.dispatchEvent(new Event('input',{bubbles:true}));}});
  if((await state()).saved)throw Error('Pending range input incorrectly marked saved');
  await saved();writes=await page.evaluate(()=>({...window.__fixtureWrites,visual:window.__visualUpdates}));
  if(writes.state!==1||writes.media!==0||writes.visual!==1)throw Error('Expected one debounced state write and one frame of style changes: '+JSON.stringify(writes));
  await range('菜单不透明度',52);await range('输入框不透明度',57);
  checks.push('100 range input events produce one visual frame and one metadata-only save; pointer release flushes');
  await range('背景强度',25);await range('背景模糊',2);await page.getByLabel('背景显示方式',{exact:true}).selectOption('cover');await page.getByLabel('背景对齐',{exact:true}).selectOption('0% 100%');await saved();
  await choose('amber.png');await range('背景强度',70);await range('背景模糊',4);await page.getByLabel('背景显示方式',{exact:true}).selectOption('contain');await page.getByLabel('背景对齐',{exact:true}).selectOption('100% 100%');await saved();
  await choose('motion.webm');await range('背景强度',40);await range('背景模糊',1);await page.getByLabel('背景显示方式',{exact:true}).selectOption('cover');await page.getByLabel('背景对齐',{exact:true}).selectOption('50% 50%');await saved();
  await page.waitForFunction(()=>window.__jingchuangAppearance.status().player.playing);
  await page.evaluate(()=>{window.__activeVideo=document.querySelector('#jingchuang-surface video');window.__mediaReloads=0;window.__activeVideo.addEventListener('loadeddata',()=>window.__mediaReloads++);window.__fixtureWrites={state:0,media:0};});
  await range('背景模糊',3);await range('背景强度',45);
  const video=await page.evaluate(()=>({same:window.__activeVideo===document.querySelector('#jingchuang-surface video'),playing:!window.__activeVideo.paused,reloads:window.__mediaReloads,mediaWrites:window.__fixtureWrites.media}));
  if(!video.same||!video.playing||video.reloads||video.mediaWrites)throw Error('Changing appearance reloaded/stopped/rewrote the video');
  checks.push('Distinct image/video configurations; appearance adjustments preserve the exact playing video and avoid Blob writes');
  for(const [name,id,strength,blur] of [['blue.png','fixture-a',.25,2],['amber.png','fixture-b',.7,4],['motion.webm','fixture-v',.45,3]]){await choose(name);s=await state();if(s.selectedId!==id||s.prefs.strength!==strength||s.prefs.blur!==blur||s.prefs.menuOpacity!==.52||s.prefs.composerOpacity!==.57)throw Error('Background/global settings leaked');}
  await choose('blue.png');await range('背景模糊',9,false);await choose('amber.png');s=await state();if(s.appearanceById['fixture-a'].blur!==9||s.prefs.blur!==4)throw Error('Pending edits leaked across backgrounds');
  await page.reload();await page.waitForFunction(()=>window.__jingchuangAppearance?.status().presented);s=await state();if(s.selectedId!=='fixture-b'||s.prefs.strength!==.7||s.prefs.blur!==4||s.appearanceById['fixture-a'].blur!==9)throw Error('Per-media settings did not survive reload');
  checks.push('Manual switching and reload restore each look; pending changes remain assigned to the previous background');
  await tab('背景库');await page.getByRole('button',{name:'恢复默认背景',exact:true}).click();await saved();await tab('外观');
  for(const name of ['背景模糊','背景显示方式','背景对齐'])if(!await page.getByLabel(name,{exact:true}).isDisabled())throw Error('Neutral background should disable '+name);
  await range('背景强度',60);await choose('blue.png');if((await state()).prefs.strength!==.25)throw Error('Neutral strength overwrote image strength');
  await tab('外观');await page.getByRole('button',{name:'重置此背景显示',exact:true}).click();await saved();s=await state();if(s.prefs.strength!==.85||s.prefs.blur!==0||s.prefs.fit!=='cover'||s.prefs.position!=='50% 50%'||s.appearanceById['fixture-b'].strength!==.7||s.prefs.menuOpacity!==.52)throw Error('Reset changed other background/global settings');
  checks.push('Neutral background has its own strength and disabled media controls; reset only changes the selected media');
  await choose('amber.png');await tab('启动动画');
  await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('jingchuang-gpt-background-v1',1);r.onsuccess=()=>resolve(r.result);});const item=await new Promise(resolve=>{const tx=db.transaction('media','readonly'),r=tx.objectStore('media').get('fixture-v');r.onsuccess=()=>resolve(r.result);});db.close();const transfer=new DataTransfer();transfer.items.add(new File([item.blob],'intro.webm',{type:'video/webm'}));const input=document.querySelector('input[aria-label="选择本地启动视频"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>!!window.__jingchuangAppearance.status().startupId&&!window.__jingchuangAppearance.status().busy);await saved();
  await page.getByRole('button',{name:'重播启动动画',exact:true}).click();await page.waitForFunction(()=>window.__jingchuangAppearance.status().player.role==='startup');
  const intro=await page.evaluate(()=>{const v=document.querySelector('#jingchuang-surface video');return {fit:v.style.objectFit,position:v.style.objectPosition,blur:v.style.filter,opacity:document.querySelector('#jingchuang-surface').style.opacity};});
  if(intro.fit!=='cover'||intro.position!=='50% 50%'||intro.blur!=='none'||intro.opacity!=='1')throw Error('Startup inherited background configuration');
  await page.getByRole('button',{name:'跳过启动动画',exact:true}).click();await page.waitForFunction(()=>window.__jingchuangAppearance.status().phase==='background'&&window.__jingchuangAppearance.status().player.role==='background');
  checks.push('Startup video uses cover/center/full strength without inheriting the selected wallpaper configuration');
  await tab('外观');await range('菜单不透明度',39,false);await page.getByRole('button',{name:'关闭景窗设置',exact:true}).click();await saved();if((await state()).prefs.menuOpacity!==.39)throw Error('Closing settings lost pending edits');
  await range('输入框不透明度',43,false);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await saved();await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  checks.push('Closing settings and hiding the window flush pending values');
  await range('菜单不透明度',52);await range('输入框不透明度',57);await page.screenshot({path:'output/playwright/05-background-settings-dark.png'});
  await page.getByRole('button',{name:'关闭景窗设置',exact:true}).click();await page.getByRole('button',{name:'切换明暗主题',exact:true}).click();await page.waitForFunction(()=>getComputedStyle(document.querySelector('#jingchuang-controls')).colorScheme==='light');await tab('外观');await page.screenshot({path:'output/playwright/06-background-settings-light.png'});
  const examples=await page.evaluate(()=>[getComputedStyle(document.querySelector('.jc-preview-menu')).backgroundColor,getComputedStyle(document.querySelector('.jc-preview-composer')).backgroundColor]);if(!examples[0].includes('0.52')||!examples[1].includes('0.57'))throw Error('Examples do not show the actual opacity');
  await range('背景强度',72,false);await page.evaluate(()=>window.__jingchuangAppearance.dispose());await page.reload();await page.waitForFunction(()=>window.__jingchuangAppearance?.status().presented);if((await state()).prefs.strength!==.72)throw Error('Removing appearance lost pending settings');
  checks.push('Dark/light examples match preferences; normal restore flushes pending values before reload');
  await page.evaluate(()=>window.__jingchuangAppearance.dispose());
  return {passed:true,checks};
}
