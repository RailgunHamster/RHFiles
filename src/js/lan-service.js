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
      for(const warning of status.recoveryWarnings||[])card.append(el('p','settings-update-failure',warning));
      for(const endpoint of status.endpoints){const address=el('code','settings-card-description',endpoint);address.style.cssText='display:block;font-size:13px;line-height:1.8;overflow-wrap:anywhere';card.append(address);}
      card.append(el('p','settings-card-description',text('设备组 WebDAV 协议入口（不是可直接添加到资源管理器的网络位置）：','Group WebDAV protocol endpoints (not directly mappable in Explorer): ')+status.endpoints.map(p=>p+'/dav/').join(' · ')));
      const gateway=status.webdavCompatibility,compatibilityEnabled=!!gateway||!!model.webdavConfig?.enabled,compatibility=el('div','settings-card');compatibility.append(el('h3','settings-card-title',text('资源管理器 · WebDAV','Explorer · WebDAV')),
        el('p','settings-card-description',text('原有设备组入口使用设备证书；Windows 网络位置请使用下面的独立可信 HTTPS 入口。兼容凭据只属于所选组成员，移除组或成员后立即失效，重新加入也不会恢复旧凭据。密码不参与配置同步。','The original endpoint uses a pinned device certificate. Windows network locations use the separate trusted HTTPS endpoint below. Compatibility credentials belong to the selected group member and are revoked on group/member removal, including after rejoining. Passwords are never synchronized.')));
      compatibility.append(button(text(compatibilityEnabled?'关闭兼容入口':'启用 Tailscale HTTPS 兼容入口',compatibilityEnabled?'Disable compatibility endpoint':'Enable Tailscale HTTPS endpoint'),safe(async()=>{
        if(!compatibilityEnabled&&!await showConfirmDialog({kind:'external',title:text('启用可信 HTTPS','Enable trusted HTTPS'),message:text('需要已连接的 Tailscale。本机 ts.net 域名会写入公开证书透明度日志，不公开文件或密码。继续？','Requires connected Tailscale. The machine’s ts.net domain enters public certificate-transparency logs, not your files or passwords. Continue?'),confirmLabel:text('启用','Enable')}))return;
        await RHFilesAPI.invoke('server.webdavConfigure',{enabled:!compatibilityEnabled,confirmed:!compatibilityEnabled});await mount(host);
      }),'webdav.configure'));
      if(gateway){
        const address=el('code','settings-card-description',gateway.url);address.style.overflowWrap='anywhere';compatibility.append(address,button(text('复制网络位置地址','Copy network-location URL'),safe(()=>copy(gateway.url)),'webdav.address'));
        if(gateway.error)compatibility.append(el('p','settings-update-failure',gateway.error));
        const members=el('select');members.setAttribute('aria-label',text('兼容授权所属组成员','Group member for compatibility access'));
        const state=await call('device_groups',{command:'state',args:{}});for(const group of state.groups||[])if(group.enabled&&!group.left)for(const member of group.members||[])if(!member.blocked){const option=el('option','',group.name+' · '+member.name);option.value=JSON.stringify({group:group.id,peer:member.id});members.append(option);}
        const credential=el('pre','settings-card-description');credential.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';credential.setAttribute('aria-live','polite');
        compatibility.append(members,button(text('生成并复制兼容凭据','Generate and copy compatibility credentials'),safe(async()=>{if(!members.value)throw Error(text('没有已开放服务的组成员','No enabled group members'));const result=await RHFilesAPI.invoke('server.webdavCredentials',JSON.parse(members.value));const value=gateway.url+'\n'+text('用户名：','Username: ')+result.username+'\n'+text('密码：','Password: ')+result.password;credential.textContent=value;await copy(value); }),'webdav.credentials'),button(text('撤销该成员的兼容凭据','Revoke this member’s compatibility credentials'),safe(async()=>{if(members.value)await RHFilesAPI.invoke('server.webdavRevoke',JSON.parse(members.value));credential.textContent='';}),'webdav.revoke'),credential,
          el('p','settings-card-description',text('在资源管理器添加网络位置，填写上面的地址及兼容用户名/密码。客户端需 Windows WebClient；本功能不会安装系统组件或降低证书/密码安全设置。证书在启动服务时自动检查续期。','Add a network location in Explorer using this URL and compatibility username/password. The client requires Windows WebClient. No system components are installed or TLS/password safeguards weakened. Certificates are checked/renewed when the service starts.')));
      }
      const detail=el('p','settings-card-description');detail.setAttribute('role','status');compatibility.append(button(text('检查并复制兼容性诊断','Check and copy compatibility diagnostics'),safe(async()=>{const result=await call('lan_service_webdav_compatibility',{});const states={running:text('正在运行','running'),stopped:text('已停止','stopped'),not_installed:text('未安装','not installed'),pending:text('状态切换中','pending'),unknown:text('无法确定','unknown'),not_windows:text('非 Windows 系统','not Windows')};detail.textContent=text('本机 Windows WebClient：','Local Windows WebClient: ')+(states[result.webClient?.state]||states.unknown)+text('。未修改系统配置。','. No system settings changed.');await copy(JSON.stringify(result,null,2));}),'webdav.compatibility'),detail);card.append(compatibility);
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
