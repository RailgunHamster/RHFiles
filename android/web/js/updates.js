/* Native downloads, no APK bytes/credentials in the WebView. Only user clicks install. */
const androidUpdates=(()=>{
  let app,status,pollTimer,hourTimer,wantInstall=false,installing=false,form,lastAuto=0;
  let generation=0,readSequence=0,appliedRead=0;
  function mutate(){generation++;clearTimeout(pollTimer);}
  const $=id=>document.getElementById(id);
  const active=s=>['checking','downloading','verifying'].includes(s);
  const labels={idle:'尚未检查更新',checking:'正在检查更新…',latest:'当前已是最新版本',available:'发现新版本',downloading:'正在下载 APK…',verifying:'正在校验 APK…',ready:'APK 已下载并校验，可以安装',failed:'更新失败',canceled:'更新已取消'};
  function button(id,label,handler,primary=false){const b=ui.el('button',primary?'primary':'',label);b.id=id;b.type='button';b.onclick=()=>Promise.resolve().then(handler).catch(app.error);return b;}
  async function load(){const current=generation,sequence=++readSequence,next=await api.native('update.status');if(current!==generation||sequence<appliedRead)return status;appliedRead=sequence;status=next;paint();schedule();return status;}
  function schedule(){
    clearTimeout(pollTimer);
    if(active(status?.state))pollTimer=setTimeout(()=>load().catch(app.error),700);
  }
  async function check(manual,reason){mutate();const current=generation,next=await api.native('update.check',{manual,reason});if(current!==generation)return;status=next;paint();schedule();}
  function values(){return Object.fromEntries([...form.elements].filter(e=>e.name).map(e=>[e.name,e.type==='checkbox'?e.checked:e.value]));}
  function showSource(){if(!form)return;const source=form.elements.source.value;$('update-family-fields').hidden=source!=='family';$('update-github-field').hidden=source!=='github';$('update-gitee-field').hidden=source!=='gitee';$('update-proxy-field').hidden=!form.elements.proxyEnabled.checked;}
  async function build(){
    const node=$('app-updates');node.hidden=false;node.replaceChildren(ui.el('h2','','应用更新'));
    const note=ui.el('p','muted','检查更新不会自动下载。点击下载并安装后，会先校验 APK，再打开系统安装确认；不会卸载应用或清空数据。');node.append(note);
    form=ui.el('form','update-form');
    function field(name,label,type,options){
      const row=ui.el('label','',label),input=document.createElement(options?'select':'input');input.name=name;
      if(options)for(const [value,text] of options){const option=ui.el('option','',text);option.value=value;input.append(option);}else input.type=type || 'text';
      input.autocomplete='off';input.spellcheck=false;row.append(input);return row;
    }
    form.append(field('autoCheck','自动检查（启动、进入设置、每小时）','checkbox'),field('source','更新源',null,[['gitee','Gitee（默认）'],['github','GitHub'],['family','家庭服务器（局域网）']]));
    const gitee=field('gitee','Gitee 仓库地址');gitee.id='update-gitee-field';form.append(gitee);
    const github=field('github','GitHub 仓库地址');github.id='update-github-field';form.append(github);
    const family=ui.el('div','update-form');family.id='update-family-fields';family.append(field('family','家庭服务器目录（SMB 或 HTTP/HTTPS）'));
    const connections=await api.native('connections');
    family.append(field('connectionId','SMB 登录配置',null,[['','匿名访问'],...connections.filter(c=>c.type==='smb'&&c.path).map(c=>[c.id,c.name])]));
    const credentials=ui.el('details');credentials.append(ui.el('summary','','新增 / 更换 SMB 登录'),field('smbUsername','用户名（支持 SERVER-HOME\\Administrator）'),field('smbPassword','密码','password'),field('smbDomain','域（可选）'));family.append(credentials);
    family.append(ui.el('p','muted','需登录的共享：可在上方直接填写账号密码并保存，也可选择“网络位置”中已有的 SMB 连接。密码由 Android Keystore 加密保存。目录中需有 releases.android.json；不会读取 Windows 更新清单。'));
    form.append(family,field('proxyEnabled','使用 HTTP 网络代理（Gitee / GitHub / HTTP 下载）','checkbox'));
    const proxy=field('proxy','代理地址，例如 http://192.168.0.10:7890');proxy.id='update-proxy-field';form.append(proxy);
    form.append(ui.el('p','muted','手机上的 127.0.0.1 指手机本身；使用电脑代理请填电脑的局域网 IP。SMB 不经过 HTTP 代理。'));
    const save=ui.el('button','','保存更新设置');save.id='update-save';save.type='submit';form.append(save);
    form.addEventListener('change',showSource);
    form.onsubmit=async e=>{e.preventDefault();save.disabled=true;mutate();try{status=await api.native('update.save',values());for(const name of ['smbUsername','smbPassword','smbDomain'])form.elements[name].value='';wantInstall=false;form=null;ui.toast('更新设置已保存');await onSettings();}catch(error){app.error(error);}finally{save.disabled=false;}};
    node.append(form);
    const info=ui.el('p','kv');info.id='update-state';info.setAttribute('role','status');const progress=document.createElement('progress');progress.id='update-progress';progress.hidden=true;
    const notes=ui.el('pre','update-notes');notes.id='update-notes';
    const actions=ui.el('div','button-row');actions.append(
      button('update-check','立即检查',()=>check(true,'manual')),
      button('update-download','下载并安装',async()=>{mutate();wantInstall=true;try{status=await api.native('update.download');paint();schedule();}catch(e){wantInstall=false;throw e;}},true),
      button('update-install','继续安装',install,true),
      button('update-copy-diagnostics','复制更新诊断',async()=>{await ui.copyText('RHFiles Android code '+status.currentCode+'\n更新源：'+status.config.source+'\n目录：'+status.config[status.config.source]+'\n状态：'+status.state+'\n'+(status.message?.trim()||'系统没有提供具体原因'));ui.toast('更新诊断已复制（不含密码）');}),
      button('update-cancel','取消',async()=>{mutate();wantInstall=false;status=await api.native('update.cancel');paint();schedule();}));
    node.append(info,progress,notes,actions);
    for(const e of form.elements)if(e.name){const value=status.config[e.name] ?? ({source:'gitee',gitee:'https://gitee.com/railgunhamster/RHFiles'})[e.name];if(e.type==='checkbox')e.checked=!!value;else e.value=value ?? '';}
    showSource();paint();
  }
  async function install(){
    if(installing)return;installing=true;wantInstall=false;
    try{const result=await api.native('update.install');ui.toast(result==='permission'?'请允许 RHFiles 安装应用；返回后继续系统安装确认':'请在系统安装窗口确认更新');}
    finally{installing=false;}
  }
  function paint(){
    if(!status)return;
    const chip=$('app-update-chip');if(chip){chip.hidden=!['available','downloading','verifying','ready'].includes(status.state);chip.textContent=status.state==='available'?'发现 RHFiles '+status.release?.version+' · 点此更新':status.state==='ready'?'更新已下载 · 点此安装':labels[status.state];}
    if($('update-state')&&form){
      const r=status.release,progress=$('update-progress'),running=active(status.state);
      $('update-state').textContent=labels[status.state]+(r?' · '+r.version:'')+(status.state==='downloading'?'\n'+fmt.size(status.bytes)+' / '+fmt.size(r.size)+' · '+fmt.size(status.bytes/Math.max(1,(Date.now()-status.started)/1000))+'/s（平均）':'')+(status.message?'\n'+status.message:status.state==='failed'?'\n系统未提供具体原因，请复制更新诊断。':'');
      $('update-state').classList.toggle('danger',status.state==='failed');
      $('update-notes').textContent=r?.notes || '';
      progress.hidden=!['downloading','verifying'].includes(status.state);progress.max=r?.size || 1;progress.value=status.bytes || 0;
      $('update-check').disabled=running || status.state==='ready';
      $('update-download').hidden=!r || !['available','failed','canceled'].includes(status.state);
      $('update-install').hidden=status.state!=='ready';$('update-cancel').hidden=!running;
      for(const e of form.elements)e.disabled=running;
    }
    if(status.state==='ready' && wantInstall && !document.hidden)install().catch(app.error);
    if(['failed','canceled','latest'].includes(status.state))wantInstall=false;
  }
  async function onSettings(){
    await load();if(!form)await build();
    // Refresh connection choices without erasing unsaved settings.
    if(form){const select=form.elements.connectionId,value=select.value;const connections=await api.native('connections');select.replaceChildren();for(const c of [{id:'',name:'匿名访问'},...connections.filter(c=>c.type==='smb'&&c.path)]){const option=ui.el('option','',c.name);option.value=c.id;select.append(option);}select.value=value;}
    await check(false,'settings');
  }
  function init(context){
    app=context;if(!api.updatesAvailable())return;
    const chip=button('app-update-chip','',()=>app.go({screen:'tool',tool:'settings',section:'updates'}));chip.className='native-task-chip';chip.hidden=true;$('app').append(chip);
    load().then(()=>{lastAuto=Date.now();if(workbench.primary())return check(false,'startup');}).catch(app.error);
    if(workbench.primary())hourTimer=setInterval(()=>{if(!document.hidden){lastAuto=Date.now();check(false,'hour').catch(app.error);}},3600000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)load().then(()=>{if(workbench.primary()&&Date.now()-lastAuto>=3600000){lastAuto=Date.now();return check(false,'hour');}}).catch(app.error);});
  }
  return {init,onSettings};
})();
