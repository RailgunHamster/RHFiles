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
    note.textContent=text('可添加文件夹或整块本机磁盘。权限按设备授权，写入和永久删除分别开启，不覆盖已有文件。共享整盘会开放当前 Windows 账号可访问的文件，请只配对可信设备；RHFiles 配置、私钥和内部临时文件始终排除。关闭窗口后服务继续运行，退出 RHFiles 才停止。','Share local folders or entire local drives. Write and permanent delete are separate per-device grants; existing files are never replaced. Whole-drive sharing exposes files accessible to your Windows account: pair trusted devices only. RHFiles profiles, private keys and internal staging are always excluded. Hiding the window keeps the service running; exiting RHFiles stops it.');
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
      const defaults=model.config.newDevicePermissions||{},grants=el('div'),write=input(text('允许新设备写入、重命名','Allow new devices to write / rename'),defaults.write,'checkbox'),remove=input(text('允许新设备永久删除文件','Allow new devices to permanently delete'),defaults.delete,'checkbox');
      grants.append(el('h3','settings-card-title',text('新配对设备的默认权限','Default grants for newly paired devices')),write.row,remove.row,
        el('p','settings-card-description',text('更改后自动保存，供之后生成的配对码和 WebDAV 账号使用，不修改已有设备或设备组权限。已生成的配对码需重新生成才能使用新权限。','Saved automatically for future pairing codes and WebDAV credentials, without changing existing devices or device groups. Generate a new pairing code to use changed grants.')),
        autosave({write:write.field,delete:remove.field},permissions=>call('lan_service_defaults',{permissions}),'defaults'));card.append(grants);
      const permissions=()=>({write:write.field.checked,delete:remove.field.checked}),pairing=el('div','settings-card');pairing.hidden=true;
      const deviceName=input(text('WebDAV 账号备注','WebDAV credential label'),'WebDAV');card.append(deviceName.row);
      actions.append(button(text('生成手机配对码','Pair a phone'),safe(async()=>{
        const pair=await call('lan_service_pair',{permissions:permissions()});pairing.replaceChildren();pairing.hidden=false;
        const img=el('img');img.width=240;img.height=240;img.alt=text('RHFiles 配对二维码','RHFiles pairing QR code');img.src='data:image/svg+xml;base64,'+btoa(pair.qrSvg);
        pairing.append(img,el('h3','',pair.code),el('p','settings-card-description',text('身份核对：','Verify identity: ')+pair.fingerprint.slice(0,12).match(/.{4}/g).join(' ')),el('p','settings-card-description',text('两分钟内有效，仅能使用一次。手机：网络位置 → 添加 → 扫码，或发现电脑后核对身份并填写配对码。','Valid for two minutes, single use. Phone: Network locations → Add → Scan, or discover this computer, verify its identity and enter the code.')),
          button(text('复制配对信息','Copy pairing data'),safe(()=>copy(pair.connectionUri)),'pair.copy'));
      }),'pair'),button(text('创建 WebDAV 专用账号','Create WebDAV app credential'),safe(async()=>{
        const name=deviceName.field.value.trim();if(!name)throw Error(text('请填写账号备注','Enter a credential label'));
        const credential=await call('lan_service_credential',{name,permissions:permissions()});pairing.hidden=false;pairing.replaceChildren(el('p','settings-card-description',text('密码只显示这一次。第三方客户端需要信任此电脑的 HTTPS 证书。','The password is shown once. Third-party clients must trust this computer’s HTTPS certificate.')),
          el('pre','',JSON.stringify({username:credential.username,password:credential.password},null,2)));
      }),'credential'),button(text('复制 HTTPS 公共证书','Copy HTTPS public certificate'),safe(()=>copy(status.certificatePem)),'certificate.copy'),button(text('刷新设备列表','Refresh devices'),()=>mount(host),'refresh'),button(text('停止共享','Stop sharing'),safe(async()=>{await call('lan_service_stop',{});await mount(host); }),'stop'));
      card.append(pairing,el('p','settings-card-description',text('证书 SHA-256：','Certificate SHA-256: ')+status.fingerprint));
      for(const device of status.devices){
        const box=el('div','settings-card'),write=input(text('允许写入、重命名','Allow write / rename'),device.permissions.write,'checkbox'),remove=input(text('允许永久删除','Allow permanent delete'),device.permissions.delete,'checkbox');
        box.append(el('h3','settings-card-title',device.name),write.row,remove.row,
          autosave({write:write.field,delete:remove.field},permissions=>call('lan_service_permissions',{id:device.id,permissions}),'permissions.'+device.id),
          button(text('撤销授权','Revoke'),safe(async()=>{await call('lan_service_revoke',{id:device.id});await mount(host); }),'revoke.'+device.id));card.append(box);
      }
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
    const groups=el('div');card.append(groups);await deviceGroupView.mount(groups,{zh:zh(),deviceName:text('我的电脑','My computer'),call:(command,args)=>call('device_groups',{command,args}),copy,confirm:message=>showConfirmDialog({kind:'restore',title:text('设备组','Device group'),message,confirmLabel:text('确认','Confirm')})});
  }
  return {mount};
})();
