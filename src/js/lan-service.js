/* Local administration only. All actions also have stable command-line APIs. */
const lanService=(()=>{
  const renders=new WeakMap();
  const zh=()=>String(_lang||'').startsWith('zh'),text=(a,b)=>zh()?a:b;
  const listen=(node,event,fn,id)=>RHFilesUI.listen(node,event,fn,undefined,'lan.'+id);
  const el=(tag,cls,value)=>{const n=document.createElement(tag);n.className=cls||'';if(value!==undefined)n.textContent=value;return n;};
  function button(label,fn,id){const b=el('button','dialog-btn',label);b.type='button';listen(b,'click',fn,id);return b;}
  async function copy(text){if(!await writeTextClipboard(text))await call('copy_file_path',{path:text});}
  function input(label,value,type='text'){const row=el('label','settings-row'),field=el('input');field.type=type;if(type==='checkbox')field.checked=!!value;else field.value=value??'';row.append(el('span','',label),field);return {row,field};}
  async function mount(host){
    if(!host)return;const ticket=(renders.get(host)||0)+1;renders.set(host,ticket);await settingsAutoSave.flush();
    if(renders.get(host)!==ticket||!host.isConnected)return;host.replaceChildren(el('p','settings-card-description',text('正在读取服务状态…','Loading service state…')));
    const model=await call('lan_service_state',{}).catch(error=>{if(renders.get(host)===ticket)host.textContent=String(error);return null;});if(!model||!host.isConnected||renders.get(host)!==ticket)return;
    const status=model.status,running=!!status?.running,card=el('div','settings-card'),note=el('p','settings-card-description');
    note.textContent=text('可添加文件夹或整块本机磁盘。权限按设备授权，写入和永久删除分别开启，不覆盖已有文件。共享整盘会开放当前 Windows 账号可访问的文件，请只邀请可信设备加入设备组；RHFiles 配置、私钥和内部临时文件始终排除。关闭窗口后服务继续运行，退出 RHFiles 才停止。','Share local folders or entire local drives. Write and permanent delete are separate per-device grants; existing files are never replaced. Whole-drive sharing exposes files accessible to your Windows account: invite trusted devices into a group only. RHFiles profiles, private keys and internal staging are always excluded. Hiding the window keeps the service running; exiting RHFiles stops it.');
    card.append(el('h3','settings-card-title',text(running?'服务运行中':'服务已停止',running?'Service running':'Service stopped')),note);
    const failure=el('p','settings-update-failure');failure.setAttribute('role','alert');const actions=el('div','settings-inline-actions');
    const safe=fn=>async()=>{failure.textContent='';try{await settingsAutoSave.flush(host);await fn();}catch(error){failure.textContent=String(error);}};
    function autosave(fields,save,id,normalize){
      const feedback=el('p','settings-card-description');feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
      settingsAutoSave.bind({root:host,fields,save,id:'lan.'+id,normalize,status:(state,error)=>{
        feedback.hidden=false;feedback.className=state==='error'?'settings-update-failure':'settings-card-description';feedback.setAttribute('aria-busy',String(state==='saving'));
        feedback.textContent=state==='saving'?text('正在保存…','Saving…'):state==='saved'?text('已自动保存','Saved automatically'):text('保存失败，已恢复上次保存的设置：','Could not save; previous settings restored: ')+error;
      }});return feedback;
    }
    // Keep primary controls visible before a long list of drive/device cards.
    card.append(actions,failure);
    if(!running){
      const rows=el('div'),shares=model.config.shares?.length?model.config.shares:[{name:text('文件','Files'),path:(getTab()?.path||'').includes('://')?'':getTab()?.path||''}];
      function add(share){const box=el('div','settings-card'),name=input(text('共享名称','Share name'),share.name),path=input(text('本机文件夹完整路径','Full local folder path'),share.path);box.append(name.row,path.row,button(text('移除此目录','Remove folder'),()=>box.remove(),'share.remove'));box.fields={name:name.field,path:path.field};rows.append(box);}
      shares.forEach(add);const port=input(text('监听端口（0 = 自动）','Port (0 = automatic)'),model.config.port??39128,'number');port.field.min=0;port.field.max=65535;
      actions.append(button(text('添加共享目录','Add shared folder'),()=>add({name:'',path:''}),'share.add'));
      if(!IS_MAC)actions.append(button(text('改为全部本机磁盘','Use all local drives'),safe(async()=>{
        const drives=await call('lan_service_drives',{});if(!drives.length)throw Error(text('没有可用的本机磁盘','No local drives available'));
        rows.replaceChildren();drives.forEach(add);
      }),'share.drives'));
      actions.append(button(text('启动文件服务','Start file service'),safe(async()=>{
        const config={port:Number(port.field.value),shares:[...rows.children].map(n=>({name:n.fields.name.value.trim(),path:n.fields.path.value.trim()}))};
        await call('lan_service_start',{config});await mount(host);
      }),'start'));card.append(rows,port.row);
    }else{
      if(status.discoveryError)card.append(el('p','settings-update-failure',status.discoveryError));
      for(const endpoint of status.endpoints){const address=el('code','settings-card-description',endpoint);address.style.cssText='display:block;font-size:13px;line-height:1.8;overflow-wrap:anywhere';card.append(address);}
      card.append(el('p','settings-card-description',text('WebDAV 地址：','WebDAV URL: ')+status.endpoints.map(p=>p+'/dav/').join(' · ')));
      actions.append(button(text('复制 HTTPS 公共证书','Copy HTTPS public certificate'),safe(()=>copy(status.certificatePem)),'certificate.copy'),button(text('停止共享','Stop sharing'),safe(async()=>{await call('lan_service_stop',{});await mount(host); }),'stop'));
      card.append(el('p','settings-card-description',text('仅设备组内已授权的设备可以访问，包含 WebDAV；旧独立配对及专用账号不再有效。','Only authorized device-group members can access files, including WebDAV. Old independent pairings and app credentials are no longer valid.')));
    }
    const startup=el('div','settings-card'),restore=input(text('启动 RHFiles 时恢复文件服务','Restore file service when RHFiles starts'),model.config.autoStart,'checkbox'),login=input(text('Windows 登录后在托盘自动启动','Start in tray after Windows login'),model.startup?.loginEnabled,'checkbox');
    startup.append(el('h3','settings-card-title',text('自动启动','Automatic startup')),restore.row);
    if(model.startup?.supported)startup.append(login.row);
    startup.append(el('p','settings-card-description',text('开关更改后自动保存。先成功启动一次以保存共享目录；自动启动只恢复已保存的范围和设备权限。登录启动不是无人登录也运行的系统服务；便携版移动后请关闭再开启登录启动。停止共享仅停止本次运行，不更改自动启动设置。','Switch changes save automatically. Start once to save shared folders; automatic startup restores only saved roots and device grants. Login startup is not a pre-login system service. Toggle login startup off and on after moving a portable installation. Stop sharing affects this session, not startup preferences.')),
      autosave({autoStart:restore.field,login:login.field},value=>call('lan_service_startup',value),'startup',(value,key)=>{
        if(key==='login'&&value.login)value.autoStart=true;if(key==='autoStart'&&!value.autoStart)value.login=false;if(!model.startup?.supported)value.login=false;return value;
      }));
    if(model.startupError)startup.append(el('p','settings-update-failure',text('上次自动启动失败：','Last automatic startup failed: ')+model.startupError));
    card.append(startup);
    host.replaceChildren(card);
    const groups=el('div');card.append(groups);await deviceGroupView.mount(groups,{zh:zh(),deviceName:text('我的电脑','My computer'),call:(command,args)=>call('device_groups',{command,args}),copy,browse:(group,peer)=>RHFilesAPI.invoke('devices.open',{group,peer}),confirm:message=>showConfirmDialog({kind:'restore',title:text('设备组','Device group'),message,confirmLabel:text('确认','Confirm')})});
  }
  return {mount};
})();
