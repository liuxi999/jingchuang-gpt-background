async page => {
  page.setDefaultTimeout(15000);
  await page.waitForFunction(()=>window.__jingchuangAppearance?.status().presented);
  const panel=page.getByRole('region',{name:'景窗背景设置'}),toggle=page.getByRole('button',{name:'景窗 · 设置',exact:true});
  const show=async()=>{if(!await panel.isVisible())await toggle.click();await page.getByRole('tab',{name:'外观',exact:true}).click();};
  const sample=()=>page.evaluate(()=>{
    const names=['normal-composer','normal-body','nested-form','home-composer','home-body','expanded-composer','expanded-body','classic-form','popover-surface','popover-semantic','popover-list','radix-surface','radix-list','standalone-list','submenu-surface','unrelated-dialog','unrelated-popover','jingchuang-settings'];
    return Object.fromEntries(names.map(id=>{const e=document.getElementById(id);if(!e)return [id,null];const s=getComputedStyle(e);const parts=s.backgroundColor.match(/[\d.]+/g).map(Number);return [id,{alpha:parts.length===4?parts[3]:1,background:s.backgroundColor,image:s.backgroundImage,border:s.borderTopColor,shadow:s.boxShadow,color:s.color}];}));
  });
  const near=(actual,expected,name)=>{if(Math.abs(actual-expected)>.003)throw Error(name+': expected alpha '+expected+', got '+actual);};
  async function slider(name,value){
    await show();const control=page.getByRole('slider',{name,exact:true});await control.focus();await page.keyboard.press(value===95?'End':'Home');
    if(value===50)for(let i=0;i<40;i++)await page.keyboard.press('ArrowRight');
    if(await control.inputValue()!==String(value))throw Error('Native keyboard range interaction failed: '+name);
    await page.waitForFunction(()=>window.__jingchuangAppearance.status().saved);
  }
  const checks=[];
  await page.getByRole('button',{name:'打开测试菜单',exact:true}).click();await show();
  for(const theme of ['dark','light']){
    if(theme==='light'){await page.getByRole('button',{name:'关闭景窗设置',exact:true}).click();await page.getByRole('button',{name:'切换明暗主题',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#jingchuang-controls')&&getComputedStyle(document.querySelector('#jingchuang-controls')).colorScheme==='light');}
    await slider('菜单不透明度',50);await slider('输入框不透明度',50);
    const baseline=await sample();
    for(const value of [10,50,95]){
      await slider('输入框不透明度',value);const s=await sample();
      for(const id of ['normal-composer','home-body','expanded-composer','classic-form'])near(s[id].alpha,value/100,theme+' '+id);
      for(const id of ['normal-body','nested-form','home-composer','expanded-body'])near(s[id].alpha,0,theme+' no duplicate layer '+id);
      for(const id of ['popover-surface','radix-surface','standalone-list','submenu-surface'])near(s[id].alpha,.5,theme+' independent menu '+id);
      for(const id of ['normal-composer','home-body','expanded-composer'])if(s[id].border!==baseline[id].border||s[id].shadow!==baseline[id].shadow||s[id].color!==baseline[id].color)throw Error('Composer decoration changed');
    }
    for(const value of [10,50,95]){
      await slider('菜单不透明度',value);const s=await sample();
      for(const id of ['popover-surface','radix-surface','standalone-list','submenu-surface']){near(s[id].alpha,value/100,theme+' '+id);if(s[id].image!=='none')throw Error('Opaque menu gradient remained');}
      for(const id of ['popover-semantic','popover-list','radix-list'])near(s[id].alpha,0,theme+' no duplicate menu '+id);
      for(const id of ['normal-composer','home-body','expanded-composer','classic-form'])near(s[id].alpha,.95,theme+' independent composer '+id);
      const examples=await page.evaluate(()=>[getComputedStyle(document.querySelector('.jc-preview-menu')).backgroundColor,getComputedStyle(document.querySelector('.jc-preview-composer')).backgroundColor]);
      near(Number(examples[0].match(/[\d.]+/g)[3]),value/100,theme+' menu example');near(Number(examples[1].match(/[\d.]+/g)[3]),.95,theme+' composer example');
      for(const id of ['unrelated-dialog','unrelated-popover','jingchuang-settings'])if(s[id].background!==baseline[id].background||s[id].image!==baseline[id].image)throw Error('Non-menu surface changed: '+id);
    }
    checks.push(theme+': 10/50/95 via native range keyboard; normal/home/expanded/legacy composer; independent, single-layer Portal menus; other surfaces unchanged');
  }
  await page.getByRole('button',{name:'打开测试菜单',exact:true}).click();let s=await sample();near(s['popover-surface'].alpha,.95,'reopened popup');
  const item=page.getByRole('menuitemcheckbox',{name:'选择 Radix 项',exact:true});const before=await item.evaluate(e=>getComputedStyle(e).backgroundColor);await item.hover();const hovered=await item.evaluate(e=>getComputedStyle(e).backgroundColor);if(before===hovered)throw Error('Menu hover was lost');await item.click();if(await item.getAttribute('aria-checked')!=='true')throw Error('Menu selection failed');
  await page.getByRole('textbox',{name:'普通聊天输入',exact:true}).fill('输入与焦点正常');if(await page.getByRole('textbox',{name:'普通聊天输入',exact:true}).textContent()!=='输入与焦点正常')throw Error('Editor input failed');
  checks.push('Dynamically reopened menus inherit saved opacity; menu hover, selection, text input and focus work');
  await page.reload();await page.waitForFunction(()=>window.__jingchuangAppearance?.status().presented);await page.getByRole('button',{name:'打开测试菜单',exact:true}).click();s=await sample();near(s['normal-composer'].alpha,.95,'reloaded composer');near(s['popover-surface'].alpha,.95,'reloaded menu');await show();
  await page.screenshot({path:'output/playwright/04-opacity-regression.png'});
  checks.push('Both saved settings restore after reload');
  await page.getByRole('button',{name:'恢复 GPT 原外观',exact:true}).click();await page.waitForFunction(()=>!window.__jingchuangAppearance);s=await sample();near(s['normal-composer'].alpha,1,'restored host composer');if(s['popover-surface'].image==='none')throw Error('Original popup gradient did not restore');
  await page.getByRole('textbox',{name:'首页聊天输入',exact:true}).fill('恢复原外观后输入正常');
  checks.push('Restore removes overrides and returns original host surfaces and working input');
  return {passed:true,checks};
}
