/* Only portable settings travel. Passwords/HTTP transport stay native. */
const configSync=(()=>{
  let app,form,status,busy=false,timer,applying=false,dirty=false,queued=false;
  const $=id=>document.getElementById(id);
  const favorites=()=>localStorage.getItem('rhfiles.favorites')||'[]';
  function notify(value){
    const before=favorites();localStorage.setItem('rhfiles.favorites',value);
    window.dispatchEvent(new StorageEvent('storage',{key:'rhfiles.favorites',oldValue:before,newValue:value}));
  }
  async function recovery(){
    const rollback=await api.native('sync.rollbackWeb');if(!rollback)return;
    if(JSON.stringify(JSON.parse(favorites()))===JSON.stringify(JSON.parse(rollback.after)))notify(rollback.favorites);
    await api.native('sync.rollbackAck');
  }
  async function boot(){if(api.syncAvailable()&&!workbench.child())await recovery();}
  function paint(){
    if(!status)return;
    const summary=$('sync-state');if(!summary)return;
    const alert=$('config-sync-alert');if(alert){alert.hidden=!['failed','conflict'].includes(status.state);alert.setAttribute('aria-label',status.state==='conflict'?'配置同步有冲突，查看详情':'配置同步失败，查看详情');}
    const names={idle:'尚未同步',syncing:'正在同步…',ready:'正在应用配置…',applying:'正在应用配置…',success:'同步完成',failed:'同步失败',conflict:'需要处理冲突'};
    summary.textContent=(names[status.state]||status.state)+(status.message?'\n'+status.message:'')+(status.lastSuccess?'\n上次完成：'+fmt.date(status.lastSuccess):'');summary.classList.toggle('danger',['failed','conflict'].includes(status.state));
    for(const control of form.elements)control.disabled=busy;
    $('sync-now').disabled=busy;$('sync-local').hidden=$('sync-remote').hidden=status.state!=='conflict';
    const list=$('sync-conflicts');list.replaceChildren();
    for(const item of status.conflicts||[]){const value=item.local||item.remote;list.append(ui.el('li','',item.kind==='profiles'?'网络位置：'+(value?.config?.name||item.id):'收藏：'+(value?.label||value?.name||item.id)));}
  }
  async function refresh(){if(!api.syncAvailable())return;status=await api.native('sync.status');if(form&&!dirty){for(const e of form.elements)if(e.name&&e.name!=='password'&&e.name!=='clearPassword'){if(e.type==='checkbox')e.checked=!!status.config[e.name];else e.value=status.config[e.name]||'';}form.elements.password.placeholder=status.config.hasPassword?'已保存；留空保留原密码':'密码（仅保存在本机）';}paint();return status;}
  function schedule(delay=1800){if(!workbench.primary()||applying)return;clearTimeout(timer);timer=setTimeout(()=>{if(!document.hidden)refresh().then(()=>run(false)).catch(app.error);},delay);}
  async function run(manual=true,choice=''){
    if(busy){if(!manual)queued=true;return;}if(!manual&&!status?.config.enabled)return;
    busy=true;paint();let applied=false;
    try{
      const token=status?.conflictToken||'';
      status=await api.native('sync.run',{manual,web:settingsData.snapshot(localStorage),choice,token});paint();
      if(status.proposalId){
        applying=true;
        const before=favorites();const next=await api.native('sync.apply',{id:status.proposalId,web:settingsData.snapshot(localStorage)});applied=true;
        if(favorites()!==before)throw Error('其他窗格刚修改了收藏，已保留更改；请重新同步');
        notify(JSON.stringify(next.favorites));status=await api.native('sync.ack',{id:next.id});applied=false;
        window.dispatchEvent(new Event('rhfiles-locations-changed'));
      }
      if(manual&&status.state==='success')ui.toast('配置已同步；密码仍只保存在本机');
    }catch(error){
      if(applied){await api.native('sync.rollback');await recovery();}
      await refresh();if(manual)throw error;
    }finally{applying=false;busy=false;paint();if(queued){queued=false;schedule(300);}}
  }
  function init(context){
    app=context;const tab=document.querySelector('[data-settings-section=sync]');tab.hidden=!api.syncAvailable();if(!api.syncAvailable())return;
    const alert=ui.el('button','icon-btn update-indicator sync-attention');alert.id='config-sync-alert';alert.hidden=true;alert.innerHTML=ui.icon('cloud');alert.onclick=()=>app.go({screen:'tool',tool:'settings',section:'sync'}).catch(app.error);document.querySelector('.topbar').insertBefore(alert,$('btn-overflow'));
    const panel=$('config-sync');panel.replaceChildren(ui.el('h2','','WebDAV 配置同步'),ui.el('p','muted','同步网络位置、网络路径收藏和收藏名称；不上传任何登录密码。本地路径收藏、主题、分屏、系统授权、缓存和任务留在各设备。'));
    form=ui.el('form','update-form');
    for(const [name,label,type] of [['enabled','自动同步','checkbox'],['url','WebDAV 文件夹地址（已存在的目录）','url'],['username','WebDAV 用户名','text'],['password','WebDAV 密码（仅本机使用）','password'],['clearPassword','清除已保存的 WebDAV 密码','checkbox'],['insecure','允许明文 HTTP（仅限可信局域网）','checkbox']]){
      const row=ui.el('label','',label),input=document.createElement('input');input.name=name;input.type=type;input.autocomplete='off';if(name==='url')input.placeholder='https://nas.example/dav/RHFiles/';row.append(input);form.append(row);
    }
    const save=ui.el('button','service-action','保存同步设置');save.type='submit';form.append(save);form.oninput=()=>dirty=true;
    form.onsubmit=async event=>{event.preventDefault();try{const values=Object.fromEntries([...form.elements].filter(e=>e.name).map(e=>[e.name,e.type==='checkbox'?e.checked:e.value]));status=await api.native('sync.save',values);form.elements.password.value='';form.elements.clearPassword.checked=false;dirty=false;await refresh();ui.toast('同步设置已保存');schedule(100);}catch(error){app.error(error);}};
    panel.append(form,ui.el('p','muted','启用后：启动、回到应用、修改共享配置后，以及应用在前台时每 5 分钟同步。关闭后只在点击“立即同步”时连接服务器。'));
    const info=ui.el('p','kv');info.id='sync-state';info.setAttribute('role','status');const actions=ui.el('div','button-row');
    const make=(id,label,handler)=>{const b=ui.el('button','',label);b.id=id;b.type='button';b.onclick=()=>Promise.resolve().then(handler).catch(app.error);return b;};
    actions.append(make('sync-now','立即同步',()=>run(true)),make('sync-local','冲突项使用本机更改',()=>resolve('local')),make('sync-remote','冲突项使用云端更改',()=>resolve('remote')));const conflicts=ui.el('ul','muted');conflicts.id='sync-conflicts';panel.append(info,conflicts,actions,
      ui.el('p','muted','同步文件固定为 rhfiles-settings-v1.json，含服务器地址、账号名及网络收藏路径，请使用私有目录。新设备请在“网络位置 → 编辑连接”补填密码。写入前检查云端版本，冲突时由你选择；不会改动实际文件。'),
      ui.el('p','muted','完整加密备份仍在“配置备份”：包含所有可备份配置及密码。导入备份后自动同步保持关闭，检查后再开启，避免把旧配置直接推送到其他设备。'));
    async function resolve(choice){if(await ui.confirm('处理同步冲突？','只处理列出的冲突项，其他项目仍合并。此操作仅改变连接和收藏配置，不删除实际文件。',choice==='local'?'使用本机更改':'使用云端更改',{danger:false,icon:'refresh'}))await run(true,choice);}
    refresh().then(()=>schedule(200)).catch(app.error);
    window.addEventListener('rhfiles-config-changed',()=>schedule());
    window.addEventListener('rhfiles-locations-changed',()=>schedule());
    window.addEventListener('rhfiles-sync-changed',()=>refresh().then(()=>schedule(100)).catch(app.error));
    window.addEventListener('storage',event=>{if(event.key==='rhfiles.favorites')schedule();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh().then(()=>schedule(200)).catch(app.error);});
    if(workbench.primary())setInterval(()=>{if(!document.hidden)schedule(50);},300000);
  }
  return {boot,init,refresh,run};
})();
