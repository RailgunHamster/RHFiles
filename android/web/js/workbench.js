/* Only trusted same-origin app frames use this host. Books run in another origin
 * and process and never receive this bridge. Frames survive mode/size changes. */
const workbench=(()=>{
  const id=new URLSearchParams(location.search).get('pane');
  const parentHost=()=>window.parent!==window?window.parent.RHFilesWorkbench:null;
  let frames=[],active=0,mode='single',preference='auto',clipboard=null,revision=0,lock=null,hinge=null,insets={},capabilities;
  let host,divider,touch,touchEnabled;
  const child=()=>!!parentHost();
  const primary=()=>!child()||id==='first';
  const send=(frame,name,detail)=>frame.contentWindow?.dispatchEvent(new frame.contentWindow.CustomEvent(name,{detail}));
  const broadcast=(name,detail)=>frames.forEach(frame=>{if(frame.dataset.ready==='true')send(frame,name,detail)});
  const indexOf=source=>frames.findIndex(frame=>frame.contentWindow===source);
  const peer=source=>{const index=indexOf(source);return index<0?null:frames[1-index]?.contentWindow?.rhfilesPane};
  const trusted=source=>{if(indexOf(source)<0)throw Error('无效窗格');};
  function setActive(index){active=index;try{localStorage.setItem('rhfiles.panes.active',String(index))}catch{}frames.forEach((frame,i)=>frame.classList.toggle('active-pane',i===active));}
  function getClipboard(){return clipboard?{...clipboard,paths:[...clipboard.paths],revision}:null;}
  function changedClipboard(value){clipboard=value?{mode:value.mode,paths:[...new Set(value.paths)]}:null;revision++;try{localStorage.setItem('rhfiles.panes.clipboard',JSON.stringify(clipboard))}catch{}broadcast('rhfiles-clipboard',getClipboard());}
  function detailFor(frame){
    const bounds=frame.getBoundingClientRect();let localHinge=null;
    if(hinge){const b=hinge.bounds,x1=b.left*innerWidth-bounds.left,x2=b.right*innerWidth-bounds.left,y1=b.top*innerHeight-bounds.top,y2=b.bottom*innerHeight-bounds.top;
      if(x2>0&&x1<bounds.width&&y2>0&&y1<bounds.height)localHinge={...hinge,bounds:{left:Math.max(0,x1)/bounds.width,right:Math.min(bounds.width,x2)/bounds.width,top:Math.max(0,y1)/bounds.height,bottom:Math.min(bounds.height,y2)/bounds.height}};
    }
    return {hinge:localHinge};
  }
  const layouts=[['auto','自动布局','layoutAuto'],['columns','左右分屏','layoutColumns'],['rows','上下分屏','layoutRows'],['single','单窗格','layoutSingle']];
  function openLayout(keyboard=false){
    if(!ui.openSheet('分屏布局',layouts.map(([value,label,icon])=>({label,icon,onSelect:()=>{
      preference=value;try{localStorage.setItem('rhfiles.panes',value)}catch{}layout();
    }})),'每个窗格独立浏览；切换布局不会丢失已打开的位置。'))return;
    const panel=document.getElementById('sheet-panel');panel.classList.add('pane-layout-sheet');panel.classList.toggle('keyboard-navigation',keyboard);
    panel.querySelectorAll('.sheet-item').forEach((button,index)=>{
      button.dataset.layout=layouts[index][0];const selected=layouts[index][0]===preference;
      button.setAttribute('aria-pressed',String(selected));
      if(selected){const check=document.createElement('span');check.className='layout-check';check.innerHTML=ui.icon('check');button.append(check);}
    });
    ui.onClosed(()=>panel.classList.remove('pane-layout-sheet','keyboard-navigation'));
  }
  function layout(){
    const left=(insets.left||0)*innerWidth,right=(insets.right||0)*innerWidth,top=(insets.top||0)*innerHeight,bottom=(insets.bottom||0)*innerHeight;
    Object.assign(host.style,{left:left+'px',right:right+'px',top:top+'px',bottom:bottom+'px'});
    const resolved=paneLayout.resolve(innerWidth-left-right,innerHeight-top-bottom,preference);mode=resolved.mode;host.dataset.mode=mode;
    frames.forEach((frame,index)=>{frame.hidden=mode==='single'&&index!==active;});divider.hidden=mode==='single';
    // Reuse the normal action sheet and keep it within Android's safe viewport.
    document.body.style.setProperty('--app-left',left+'px');
    document.body.style.setProperty('--app-top',top+'px');
    document.body.style.setProperty('--app-height',(innerHeight-top-bottom)+'px');
    document.body.style.setProperty('--app-right',right+'px');
    if(mode!=='single'&&frames.length===1)addFrame('second');
    // A separating physical hinge becomes the divider, not covered content.
    host.style.removeProperty('--first-size');host.style.setProperty('--divider-size','8px');
    if(hinge?.separating&&((mode==='columns'&&hinge.orientation==='vertical')||(mode==='rows'&&hinge.orientation==='horizontal'))){
      const vertical=mode==='columns',viewport=vertical?innerWidth:innerHeight,offset=vertical?left:top,length=viewport-offset-(vertical?right:bottom),b=hinge.bounds,start=(vertical?b.left:b.top)*viewport-offset,end=(vertical?b.right:b.bottom)*viewport-offset;
      if(start>= (vertical?480:420)&&length-end>=(vertical?480:420)){host.style.setProperty('--first-size',start+'px');host.style.setProperty('--divider-size',Math.max(8,end-start)+'px');}
    }
    frames.forEach(frame=>frame.contentDocument?.body?.classList.toggle('concurrent-panes',mode!=='single'));touch?.reset();
    if(capabilities.paneTouch&&touchEnabled!==(mode!=='single')){touchEnabled=mode!=='single';api.native('panes.touch',{enabled:touchEnabled}).catch(()=>{});}
    broadcast('rhfiles-panes-changed',{mode});requestAnimationFrame(()=>frames.forEach(frame=>{if(!frame.hidden&&frame.dataset.ready==='true')send(frame,'rhfiles-window-layout',detailFor(frame))}));
  }
  function addFrame(pane){
    const frame=document.createElement('iframe');frame.className='file-pane';frame.title=pane==='first'?'第一窗格':'第二窗格';frame.src='index.html?pane='+pane;frames.push(frame);host.append(frame);
    frame.onload=()=>{frame.dataset.ready='true';touch.attach(frame);frame.contentWindow.addEventListener('pointerdown',()=>setActive(frames.indexOf(frame)),true);frame.contentWindow.addEventListener('focusin',()=>setActive(frames.indexOf(frame)));send(frame,'rhfiles-clipboard',getClipboard());send(frame,'rhfiles-pane-task',lock?.label||null);layout();};
    return frame;
  }
  async function boot(){
    if(child()||!api.dualPaneAvailable())return false;
    capabilities=await api.native('capabilities');
    if(capabilities.restoreNavigation)try{const pending=JSON.parse(localStorage.getItem('rhfiles.panes.clipboard')||'null');if(['copy','cut'].includes(pending?.mode)&&Array.isArray(pending.paths)&&pending.paths.length<=1000&&pending.paths.every(path=>typeof path==='string'))clipboard=pending;active=localStorage.getItem('rhfiles.panes.active')==='1'?1:0;}catch{}
    document.body.classList.add('workbench-host');
    document.documentElement.dataset.theme=localStorage.getItem('rhfiles.theme')==='dark'?'dark':'light';
    window.addEventListener('storage',event=>{if(event.key==='rhfiles.theme')document.documentElement.dataset.theme=event.newValue==='dark'?'dark':'light';});
    try{preference=localStorage.getItem('rhfiles.panes')||'auto';if(!['auto','single','columns','rows'].includes(preference))preference='auto';}catch{}
    host=document.createElement('main');host.id='workbench';document.body.append(host);
    touch=paneTouch.bind({frames:()=>frames,native:!!capabilities.paneTouch,enabled:()=>mode!=='single'&&!ui.isSheetOpen(),onInteract:frame=>setActive(frames.indexOf(frame)),onScroll:()=>broadcast('rhfiles-pan-scroll')});
    divider=document.createElement('div');divider.className='pane-divider';host.append(divider);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='pane-layout-toggle';toggle.setAttribute('aria-label','分屏布局');toggle.setAttribute('aria-haspopup','dialog');toggle.title='分屏布局';divider.append(toggle);
    toggle.onclick=event=>openLayout(event.detail===0);ui.bindScrim();
    document.addEventListener('pointerdown',()=>document.getElementById('sheet-panel').classList.remove('keyboard-navigation'),true);
    document.addEventListener('keydown',event=>{
      if(!ui.isSheetOpen())return;
      if(event.key==='Escape'){event.preventDefault();ui.closeSheet();}
      if(event.key==='Tab'){
        const panel=document.getElementById('sheet-panel'),buttons=[...panel.querySelectorAll('button:not(:disabled)')];panel.classList.add('keyboard-navigation');
        const index=buttons.indexOf(document.activeElement);
        if(buttons.length&&(index<0||event.shiftKey&&index===0||!event.shiftKey&&index===buttons.length-1)){event.preventDefault();buttons[event.shiftKey?buttons.length-1:0].focus();}
      }
    });
    window.RHFilesWorkbench={
      touch(sample){touch.relay(sample);},
      call(source,kind,command,args){trusted(source);return kind==='native'?api.native(command,args):kind==='asset'?api.assetUrl(command):api.raw(command,args);},
      capabilities(source){trusted(source);return {...capabilities,nativeBack:true};},
      select(source){trusted(source);setActive(indexOf(source));},
      openLayout(source){trusted(source);setActive(indexOf(source));openLayout(!!source.document.activeElement?.matches(':focus-visible'));},
      dual(source){trusted(source);return mode!=='single'&&frames.length===2;},
      other(source){trusted(source);return mode!=='single'?peer(source)?.snapshot():null;},
      clipboard(source,value,expected){trusted(source);if(expected!==undefined&&expected!==revision)return false;changedClipboard(value);return true;},
      currentClipboard(source){trusted(source);return getClipboard();},
      acquire(source,label){trusted(source);if(lock)return false;lock={source,label};broadcast('rhfiles-pane-task',label);return true;},
      release(source){trusted(source);if(lock?.source===source){lock=null;broadcast('rhfiles-pane-task',null);broadcast('rhfiles-files-changed');}},
      refreshOther(source){trusted(source);const other=peer(source);other?.refresh();},
      windowLayout(source){trusted(source);return detailFor(frames[indexOf(source)]);},
    };
    addFrame('first');if(active===1)addFrame('second');layout();setActive(active);
    window.rhfilesHandleBack=()=>{if(ui.isSheetOpen()){ui.closeSheet();return true;}return frames[active]?.contentWindow?.rhfilesHandleBack?.()??true;};
    window.addEventListener('resize',layout);
    window.addEventListener('rhfiles-window-layout',event=>{hinge=event.detail?.hinge||null;insets=event.detail?.insets||{};layout();});
    window.addEventListener('rhfiles-storage-changed',()=>broadcast('rhfiles-storage-changed'));
    api.native('window.layout').then(value=>{hinge=value.hinge;insets=value.insets||{};layout();}).catch(()=>{});
    return true;
  }
  return {boot,child,primary,id,parentHost};
})();
