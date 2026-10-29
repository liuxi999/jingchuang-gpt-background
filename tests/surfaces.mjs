document.querySelector('#theme').onclick=()=>{const root=document.querySelector('#root');root.dataset.theme=root.dataset.theme==='light'?'dark':'light';};
function menu(id,label){const panel=document.createElement('div');panel.id=id;panel.setAttribute('role','menu');panel.setAttribute('aria-label',label);return panel;}
function list(id){const panel=document.createElement('div');panel.id=id;panel.className='_MenuList_fixture';return panel;}
function item(panel,label){const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitemcheckbox');button.setAttribute('aria-checked','false');button.textContent=label;button.onclick=()=>{button.setAttribute('aria-checked','true');document.querySelector('#fixture-choice').textContent=label;};panel.appendChild(button);}
document.querySelector('#open-menus').onclick=()=>{
  for(const old of document.querySelectorAll('[data-fixture-portal]'))old.remove();
  const popover=document.createElement('div');popover.id='popover-surface';popover.className='_Popover_fixture fixture-portal';popover.setAttribute('data-translucent','');popover.setAttribute('data-fixture-portal','');
  const semantic=menu('popover-semantic','Popover 菜单'),inner=list('popover-list');item(inner,'选择 Popover 项');semantic.appendChild(inner);popover.appendChild(semantic);document.body.appendChild(popover);
  const wrapper=document.createElement('div');wrapper.className='fixture-portal fixture-radix';wrapper.setAttribute('data-radix-popper-content-wrapper','');wrapper.setAttribute('data-fixture-portal','');
  const radix=menu('radix-surface','Radix 菜单');radix.setAttribute('data-radix-menu-content','');const radixList=list('radix-list');item(radixList,'选择 Radix 项');radix.appendChild(radixList);wrapper.appendChild(radix);document.body.appendChild(wrapper);
  const standalone=list('standalone-list');standalone.classList.add('fixture-portal','fixture-list');standalone.setAttribute('role','menu');standalone.setAttribute('aria-label','独立菜单');standalone.setAttribute('data-fixture-portal','');item(standalone,'选择独立菜单项');document.body.appendChild(standalone);
  const submenu=menu('submenu-surface','Portal 子菜单');submenu.className='fixture-portal fixture-submenu';submenu.setAttribute('data-fixture-portal','');submenu.setAttribute('data-radix-menu-content','');item(submenu,'选择子菜单项');document.body.appendChild(submenu);
};
