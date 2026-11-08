// Stable group IDs survive new features, hidden sections and configuration imports.
// Move the existing section nodes, including their contents and event listeners.
const SIDEBAR_GROUPS = [
  ['tree','sidebar-tree-section','sidebar.tree'],
  ['rhvideo','rhvideo-sidebar-section','RHVideo'],
  ['devices','device-group-section','sidebar.rhfilesDevices'],
  ['favorites','favorites-sidebar-section','sidebar.favorites'],
  ['quickAccess','quick-access-section','sidebar.quickAccess'],
  ['tags','tags-sidebar-section','sidebar.tags'],
  ['recycle','recycle-sidebar-section','recycle.title'],
  ['recent','recent-sidebar-section','sidebar.recent'],
  ['cloud','cloud-section','sidebar.cloud'],
  ['drives','drives-sidebar-section','sidebar.thisPC'],
  ['wsl','wsl-section','WSL'],
  ['libraries','libraries-sidebar-section','sidebar.libraries'],
  ['network','network-locations-section','sidebar.networkLocations'],
  ['usb','usb-devices-section','sidebar.usbDevices'],
];
function normalizeSidebarOrder(value) {
  const defaults=SIDEBAR_GROUPS.map(([id])=>id),known=new Set(defaults);
  return [...new Set([...(Array.isArray(value)?value:[]).filter(id=>known.has(id)),...defaults])];
}
function sidebarOrderState() {
  const order=normalizeSidebarOrder(G.settings.sidebarSectionOrder);
  return {order,sections:order.map(id=>{
    const [,elementId,key]=SIDEBAR_GROUPS.find(group=>group[0]===id),element=document.getElementById(elementId);
    return {id,label:key.includes('.')?t(key):key,available:!!element,visible:!!element?.getClientRects().length};
  })};
}
function applySidebarOrder() {
  const sidebar=document.getElementById('sidebar');if(!sidebar)return;
  const scroll=sidebar.scrollTop,focused=sidebar.contains(document.activeElement)?document.activeElement:null;
  for(const id of normalizeSidebarOrder(G.settings.sidebarSectionOrder)) {
    const element=document.getElementById(SIDEBAR_GROUPS.find(group=>group[0]===id)[1]);
    if(element?.parentElement===sidebar)sidebar.appendChild(element);
  }
  sidebar.scrollTop=scroll;
  focused?.focus({preventScroll:true});
}
function setSidebarOrder(order) {
  const known=new Set(SIDEBAR_GROUPS.map(([id])=>id));
  if(!Array.isArray(order)||order.some(id=>!known.has(id))||new Set(order).size!==order.length)
    throw new RHFilesAutomationCore.ActionError('INVALID_PARAMS','Expected unique, known sidebar group IDs');
  const next=normalizeSidebarOrder(order),previous=G.settings.sidebarSectionOrder;
  // Persist before moving the UI. A failed write must not pretend it was saved.
  G.settings.sidebarSectionOrder=next;
  try {saveSettings();}catch(error){if(previous===undefined)delete G.settings.sidebarSectionOrder;else G.settings.sidebarSectionOrder=previous;throw error;}
  applySidebarOrder();renderSidebarOrderSettings();return sidebarOrderState();
}
function moveSidebarGroup(id,target,after=false) {
  const order=normalizeSidebarOrder(G.settings.sidebarSectionOrder);
  if(!order.includes(id)||!order.includes(target))throw new RHFilesAutomationCore.ActionError('INVALID_PARAMS','Unknown sidebar group');
  if(id===target)return sidebarOrderState();
  const next=order.filter(value=>value!==id);next.splice(next.indexOf(target)+(after?1:0),0,id);
  return next.every((value,index)=>value===order[index])?sidebarOrderState():setSidebarOrder(next);
}
function resetSidebarOrder(){return setSidebarOrder([]);}
function sidebarOrderAction(name,args) {
  return RHFilesAPI.invoke(name,args).catch(error=>showNotice(String(error)));
}
function sidebarOrderStep(id,direction,visibleOnly=false) {
  const sections=sidebarOrderState().sections.filter(section=>visibleOnly?section.visible:section.available);
  const index=sections.findIndex(section=>section.id===id),target=sections[index+direction];
  if(target)return sidebarOrderAction('sidebar.groups.move',{id,target:target.id,after:direction>0});
}
function refreshSidebarOrderLabels() {
  for(const section of sidebarOrderState().sections) {
    const handle=document.querySelector('#sidebar [data-sidebar-grip="'+section.id+'"]');
    if(handle){handle.title=t('sidebar.reorderHint');handle.setAttribute('aria-label',t('sidebar.reorderGroup',{name:section.label}));}
  }
}
function renderSidebarOrderSettings() {
  const list=document.getElementById('sidebar-order-list');if(!list)return;
  const focused=document.activeElement,focusId=focused?.closest('[data-sidebar-order-id]')?.dataset.sidebarOrderId,focusAction=focused?.dataset.orderStep;
  const sections=sidebarOrderState().sections.filter(section=>section.available);
  list.innerHTML='';
  sections.forEach((section,index)=>{
    const row=document.createElement('div');row.className='sidebar-order-row';row.dataset.sidebarOrderId=section.id;
    const label=document.createElement('span');label.textContent=section.label;row.append(label);
    for(const direction of [-1,1]) {
      const button=document.createElement('button');button.type='button';button.className='dialog-btn sidebar-order-step';button.dataset.orderStep=String(direction);
      button.innerHTML=direction<0?'<svg viewBox="0 0 24 24"><path d="m6 14 6-6 6 6"/></svg>':'<svg viewBox="0 0 24 24"><path d="m6 10 6 6 6-6"/></svg>';
      button.title=t(direction<0?'sidebar.moveUp':'sidebar.moveDown');button.setAttribute('aria-label',button.title+' · '+section.label);
      button.disabled=direction<0?index===0:index===sections.length-1;
      RHFilesUI.listen(button,'click',()=>sidebarOrderStep(section.id,direction),undefined,'sidebar.order.step.'+section.id+'.'+direction);
      row.append(button);
    }
    list.append(row);
  });
  if(focusId&&focusAction)list.querySelector('[data-sidebar-order-id="'+focusId+'"] [data-order-step="'+focusAction+'"]')?.focus({preventScroll:true});
}
function showSidebarOrderSettings() {
  openSettings();switchSettingsSection('appearance');
  document.getElementById('sidebar-order-card')?.scrollIntoView({block:'nearest'});
  document.querySelector('#sidebar-order-list button:not(:disabled)')?.focus({preventScroll:true});
  return {opened:true};
}
function initSidebarOrder() {
  const sidebar=document.getElementById('sidebar');if(!sidebar)return;
  for(const [id,elementId]of SIDEBAR_GROUPS) {
    const section=document.getElementById(elementId);if(!section||section.querySelector(':scope > .sidebar-group-grip'))continue;
    section.classList.add('sidebar-sortable-section');section.dataset.sidebarGroup=id;
    const handle=document.createElement('button');handle.type='button';handle.className='sidebar-group-grip';handle.dataset.sidebarGrip=id;
    handle.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown');
    handle.innerHTML='<svg viewBox="0 0 16 20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="4" r="1.3"/><circle cx="11" cy="4" r="1.3"/><circle cx="5" cy="10" r="1.3"/><circle cx="11" cy="10" r="1.3"/><circle cx="5" cy="16" r="1.3"/><circle cx="11" cy="16" r="1.3"/></svg>';
    section.append(handle);bindSidebarGroupDrag(handle,section,sidebar);
  }
  applySidebarOrder();refreshSidebarOrderLabels();
}
function bindSidebarGroupDrag(handle,section,sidebar) {
  let drag=null,suppressClick=false;
  const id=section.dataset.sidebarGroup;
  const visibleGroups=()=>[...sidebar.querySelectorAll(':scope > [data-sidebar-group]')].filter(node=>node!==section&&node.getClientRects().length);
  function place() {
    if(!drag?.active)return;
    const bounds=sidebar.getBoundingClientRect(),inside=drag.x>=bounds.left&&drag.x<=bounds.right&&drag.y>=bounds.top&&drag.y<=bounds.bottom;
    const groups=visibleGroups();drag.target=null;
    if(inside&&groups.length) {
      const target=groups.find(node=>{const box=node.getBoundingClientRect();return drag.y<(box.top+box.bottom)/2;})||groups.at(-1),box=target.getBoundingClientRect();
      const after=target===groups.at(-1)&&drag.y>=(box.top+box.bottom)/2;
      drag.target={id:target.dataset.sidebarGroup,after};
      Object.assign(drag.marker.style,{display:'block',left:bounds.left+5+'px',width:bounds.width-10+'px',top:Math.max(bounds.top,Math.min(bounds.bottom-3,after?box.bottom:box.top))+'px'});
    }else drag.marker.style.display='none';
    Object.assign(drag.ghost.style,{left:Math.min(innerWidth-180,drag.x+12)+'px',top:Math.min(innerHeight-40,drag.y+12)+'px'});
  }
  function scroll() {
    if(!drag?.active)return;
    const bounds=sidebar.getBoundingClientRect();
    if(drag.x>=bounds.left&&drag.x<=bounds.right&&drag.y>=bounds.top&&drag.y<=bounds.bottom) {
      const speed=drag.y<bounds.top+36?-Math.min(14,(bounds.top+36-drag.y)/2):drag.y>bounds.bottom-36?Math.min(14,(drag.y-bounds.bottom+36)/2):0;
      if(speed){sidebar.scrollTop+=speed;place();}
    }
    drag.frame=requestAnimationFrame(scroll);
  }
  function finish(commit=false) {
    if(!drag)return;const current=drag;drag=null;cancelAnimationFrame(current.frame);
    current.ghost?.remove();current.marker?.remove();section.classList.remove('sidebar-group-dragging');document.body.classList.remove('sidebar-order-dragging');
    if(handle.hasPointerCapture?.(current.pointerId))handle.releasePointerCapture(current.pointerId);
    if(current.active){suppressClick=true;setTimeout(()=>{suppressClick=false;},0);}
    if(commit&&current.active&&current.target)void sidebarOrderAction('sidebar.groups.move',{id,target:current.target.id,after:current.target.after});
  }
  RHFilesUI.listen(handle,'pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||drag)return;event.stopPropagation();
    drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,active:false};
    handle.setPointerCapture(event.pointerId);
  },undefined,'sidebar.order.pointerdown.'+id);
  RHFilesUI.listen(handle,'pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;drag.x=event.clientX;drag.y=event.clientY;
    if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<5)return;
    event.preventDefault();event.stopPropagation();
    if(!drag.active) {
      drag.active=true;drag.ghost=document.createElement('div');drag.ghost.className='sidebar-group-ghost';drag.ghost.textContent=sidebarOrderState().sections.find(value=>value.id===id).label;
      drag.marker=document.createElement('div');drag.marker.className='sidebar-group-drop-line';document.body.append(drag.ghost,drag.marker);
      section.classList.add('sidebar-group-dragging');document.body.classList.add('sidebar-order-dragging');scroll();
    }
    place();
  },undefined,'sidebar.order.pointermove.'+id);
  RHFilesUI.listen(handle,'pointerup',event=>{if(drag&&event.pointerId===drag.pointerId){event.stopPropagation();finish(true);}},undefined,'sidebar.order.pointerup.'+id);
  RHFilesUI.listen(handle,'pointercancel',()=>finish(),undefined,'sidebar.order.cancel.'+id);
  RHFilesUI.listen(handle,'lostpointercapture',()=>finish(),undefined,'sidebar.order.lostcapture.'+id);
  RHFilesUI.listen(window,'blur',()=>finish(),undefined,'sidebar.order.blur.'+id);
  RHFilesUI.listen(document,'keydown',event=>{if(drag&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish();}},true,'sidebar.order.escape.'+id);
  RHFilesUI.listen(handle,'keydown',event=>{
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();event.stopPropagation();void sidebarOrderStep(id,event.key==='ArrowUp'?-1:1,true);}
  },undefined,'sidebar.order.key.'+id);
  RHFilesUI.listen(handle,'click',event=>{event.stopPropagation();if(!suppressClick)void sidebarOrderAction('sidebar.customize');},undefined,'sidebar.order.customize.'+id);
  RHFilesUI.listen(handle,'contextmenu',event=>{event.preventDefault();event.stopPropagation();void sidebarOrderAction('sidebar.customize');},undefined,'sidebar.order.context.'+id);
}
