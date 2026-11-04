// Saved SMB/SFTP/FTP/FTPS/WebDAV locations. Device-group trust is intentionally
// separate; only password-free connection metadata participates in config sync.
const networkLocations=(()=>{
  let profiles=[],dialog,list,editor,errorNode;
  const text=(zh,en)=>String(_lang||'').startsWith('zh')?zh:en;
  const native=(action,args={})=>call('network_location',{action,args});
  const label=id=>profiles.find(p=>p.id===id)?.config.name||text('网络位置','Network location');
  const display=path=>{const u=new URL(path);return label(u.host)+decodeURIComponent(u.pathname);};
  async function refresh(){profiles=(await native('list')).profiles;paint();return {profiles};}
  async function save(p){const result=await native('save',p);await refresh();desktopConfigSync.changed();return result;}
  async function remove(p){
    if(!await showConfirmDialog({title:text('移除网络位置','Remove network location'),message:label(p.id),detail:text('只移除连接配置、本机密码及该连接的收藏，不删除服务器上的文件。','Removes this connection, its local password and bookmarks, not files on the server.'),confirmLabel:t('btn.delete')}))return {removed:false};
    const result=await native('remove',p);await refresh();desktopConfigSync.changed();return result;
  }
  async function open(p){
    const profile=profiles.find(item=>item.id===p.id);
    if(profile&&!profile.hasPassword&&profile.config.username&&profile.config.username!=='anonymous'&&profile.config.type!=='smb'){
      if(!dialog)await show();edit(profile);errorNode.textContent=text('密码不会随配置同步，请在此设备补填一次。','Passwords are not synchronized. Enter credentials on this device.');throw Error(errorNode.textContent);
    }
    const result=await native('open',p);dialog?.remove();dialog=null;closeSettings();
    if(p.newTab)addTab(result.path,false);await navigateTo(result.path);return result;
  }
  function button(label,action,id,secondary=false){const b=document.createElement('button');b.type='button';b.className=secondary?'dialog-btn':'sidebar-item';b.textContent=label;RHFilesUI.listen(b,'click',()=>Promise.resolve().then(action).catch(showError),undefined,id);return b;}
  function showError(error){if(errorNode?.isConnected)errorNode.textContent=String(error);else showNotice(String(error));}
  function paint(){
    const host=document.getElementById('network-locations-list');if(host){host.replaceChildren();for(const p of profiles){const b=button(p.config.name,()=>open({id:p.id}),'networkLocations.open.'+p.id);b.dataset.path='remote://'+p.id+'/';b.dataset.apiAction='networkLocations.open';b.title=String(p.config.type).toUpperCase()+' · '+(p.config.host||p.config.url||'');const icon=document.createElement('span');icon.className='network-protocol-badge';icon.textContent=p.config.type.toUpperCase();b.prepend(icon);host.append(b);}}
    if(list?.isConnected){list.replaceChildren();for(const p of profiles){const row=document.createElement('div');row.className='network-location-row';const name=document.createElement('div');name.className='network-location-name';const title=document.createElement('strong');title.textContent=p.config.name;const detail=document.createElement('small');detail.textContent=p.config.type.toUpperCase()+' · '+(p.config.host||p.config.url||'');name.append(title,detail);row.append(name,button(text('打开','Open'),()=>open({id:p.id}),'networkLocations.manager.open.'+p.id,true),button(text('编辑','Edit'),()=>edit(p),'networkLocations.edit.'+p.id,true),button(text('移除','Remove'),()=>remove({id:p.id}),'networkLocations.remove.'+p.id,true));list.append(row);}}
    const h=document.getElementById('network-locations-heading');if(h)h.textContent=text('网络位置','Network locations');
    const m=document.querySelector('#network-locations-manage > span');if(m)m.textContent=text('管理网络位置…','Manage network locations…');
    const discovery=document.getElementById('network-discovery-heading');if(discovery)discovery.textContent=text('局域网 SMB 共享','Nearby SMB shares');
    if(document.getElementById('home-page')?.style.display!=='none'&&typeof renderHomeNetworkLocations==='function')renderHomeNetworkLocations();
  }
  function edit(profile){
    editor.replaceChildren();const c=profile?.config||{type:'smb',name:'',host:'',username:'',share:'',port:445,insecure:false},form=document.createElement('form');form.className='network-location-form';
    const fields={};function field(key,title,options={}){const row=document.createElement('label');row.className='network-location-field';const label=document.createElement('span');label.textContent=title;const input=document.createElement(options.values?'select':'input');input.name=key;if(options.values){for(const value of options.values){const option=document.createElement('option');option.value=value;option.textContent=value==='ftps'?'FTPS (TLS)':value.toUpperCase();input.append(option);}}else {input.type=options.type||'text';input.autocomplete='off';}if(input.type==='checkbox')input.checked=!!c[key];else input.value=key==='password'?'':String(c[key]??'');row.append(label,input);form.append(row);fields[key]=input;return input;}
    const type=field('type',text('协议','Protocol'),{values:['smb','sftp','ftp','ftps','webdav']});
    field('name',text('名称','Name'));field('host',text('主机名或 IP','Host or IP'));field('port',text('端口','Port'),{type:'number'});fields.port.min=1;fields.port.max=65535;
    field('share',text('SMB 共享名（留空列出共享）','SMB share (empty lists shares)'));
    field('url',text('WebDAV 文件夹 URL','WebDAV folder URL'));
    field('domain',text('SMB 域（可选）','SMB domain (optional)'));
    field('username',text('用户名','Username'));field('password',text('本机密码（留空保留）','Local password (empty keeps saved)'),{type:'password'});
    fields.password.placeholder=profile?.hasPassword?text('已保存；不参与配置同步','Saved; never synchronized'):text('新设备需要在这里补填密码','Enter credentials on each new device');
    field('clearPassword',text('清除本机保存的密码','Clear locally saved password'),{type:'checkbox'});
    field('insecure',text('明确允许明文连接（FTP / HTTP）','Explicitly allow plaintext (FTP / HTTP)'),{type:'checkbox'});
    const update=()=>{const value=type.value;for(const key of ['host','port','share','domain','url','insecure'])fields[key].parentElement.hidden=key==='url'?value!=='webdav':key==='share'||key==='domain'?value!=='smb':key==='insecure'?!['ftp','webdav'].includes(value):value==='webdav';};
    RHFilesUI.listen(type,'change',()=>{fields.port.value=type.value==='smb'?'445':type.value==='sftp'?'22':'21';update();},undefined,'networkLocations.form.type');update();
    const note=document.createElement('p');note.className='settings-card-description';note.textContent=text('SMB 使用 Windows 网络连接。SFTP 首次保存前会显示服务器 SHA-256 指纹，确认后才发送密码。FTP 不加密；建议使用 SFTP、FTPS 或 HTTPS WebDAV。','SMB uses Windows connections. SFTP shows a SHA-256 server fingerprint before sending credentials. FTP is unencrypted; prefer SFTP, FTPS or HTTPS WebDAV.');form.append(note);
    const actions=document.createElement('div');actions.className='dialog-actions';const submit=document.createElement('button');submit.type='submit';submit.className='dialog-btn primary';submit.textContent=text('保存连接','Save connection');actions.append(button(t('btn.cancel'),()=>editor.replaceChildren(),'networkLocations.form.cancel',true),submit);form.append(actions);
    RHFilesUI.listen(form,'submit',async event=>{
      event.preventDefault();errorNode.textContent='';submit.disabled=true;
      try{
        const value=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.type==='checkbox'?v.checked:v.value.trim()]));
        if(!value.name)throw Error(text('请输入连接名称','Enter a connection name'));
        const config={type:value.type,name:value.name,username:value.username};
        if(value.type==='webdav'){config.url=value.url;config.insecure=value.insecure;}else{config.host=value.host;config.port=Number(value.port);if(value.type==='smb'){config.share=value.share;config.domain=value.domain;}if(value.type==='ftp')config.insecure=value.insecure;}
        let fingerprint=profile?.fingerprint||'';
        if(value.type==='sftp'&&(!fingerprint||!profile||['type','host','port','username'].some(k=>c[k]!==config[k]))){
          const probe=await native('probe',{config});
          if(!await showConfirmDialog({title:text('确认 SFTP 服务器指纹','Verify SFTP server fingerprint'),message:config.host+':'+config.port,detail:probe.fingerprint+'\n'+text('请与服务器管理员提供的指纹核对。确认前不会发送密码。','Compare this with the fingerprint provided by the server administrator. No password is sent before confirmation.'),confirmLabel:text('信任此指纹','Trust this fingerprint')}))return;
          fingerprint=probe.fingerprint;
        }
        await save({...(profile?{id:profile.id}:{}),config,password:fields.password.value,clearPassword:value.clearPassword,...(fingerprint?{fingerprint}:{})});editor.replaceChildren();
      }catch(error){showError(error);}finally{submit.disabled=false;}
    },undefined,'networkLocations.form.save');editor.append(form);fields.name.focus();
  }
  async function show(){
    if(IS_MAC){await showFtpDialog();return {opened:true};}
    dialog?.remove();dialog=document.createElement('div');dialog.className='overlay';dialog.id='network-locations-dialog';dialog.style.display='flex';
    const box=document.createElement('div');box.className='dialog-box dialog-wide';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
    const heading=document.createElement('div');heading.className='dialog-title';heading.textContent=text('网络位置','Network locations');
    const body=document.createElement('div');body.className='dialog-scroll';list=document.createElement('div');editor=document.createElement('div');errorNode=document.createElement('p');errorNode.className='media-convert-error';errorNode.setAttribute('role','status');
    body.append(list,editor,errorNode);const actions=document.createElement('div');actions.className='dialog-actions';actions.append(button(text('添加位置','Add location'),()=>edit(),'networkLocations.add',true),button(t('btn.close'),()=>{dialog.remove();dialog=null;},'networkLocations.close',true));box.append(heading,body,actions);dialog.append(box);document.body.append(dialog);await refresh();return {opened:true};
  }
  async function init(){const btn=document.getElementById('network-locations-manage');if(btn)RHFilesUI.listen(btn,'click',()=>window.RHFilesAPI.invoke('networkLocations.show').catch(showError),undefined,'networkLocations.sidebar.manage');if(IS_MAC){if(btn)btn.querySelector('span').textContent=text('连接 FTP…','Connect to FTP…');return {profiles:[]};}const listen=window.__TAURI__?.event?.listen||window.__TAURI_INTERNALS__?.event?.listen;if(listen)listen('config-sync-changed',()=>refresh().catch(()=>{})).catch(()=>{});return refresh();}
  const string={type:'string',maxLength:8192},id={type:'string',pattern:'^[a-f0-9-]{36}$'},object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false}),api=window.RHFilesAPI;
  api.register('networkLocations.list',refresh,{params:object({}),risk:'read'});
  api.register('networkLocations.show',show,{params:object({}),risk:'ui'});
  api.register('networkLocations.open',open,{params:object({id,newTab:{type:'boolean'}},['id']),risk:'external'});
  const config=object({type:{type:'string',enum:['smb','sftp','ftp','ftps','webdav']},name:string,host:string,port:{type:'integer',minimum:1,maximum:65535},url:string,share:string,domain:string,username:string,insecure:{type:'boolean'}},['type','name']);
  api.register('networkLocations.save',save,{params:object({id,config,password:string,clearPassword:{type:'boolean'},fingerprint:string},['config']),risk:'write',description:'Save shared connection metadata; credentials and SSH host-key pins are encrypted locally and bound to this exact connection identity.'});
  api.register('networkLocations.remove',remove,{params:object({id},['id']),risk:'destructive',description:'Confirm removal of connection metadata/local secret only, never remote files.'});
  api.register('networkLocations.probe',p=>native('probe',p),{params:object({config},['config']),risk:'external',description:'Read an SSH server fingerprint without authenticating or saving trust.'});
  api.register('networkLocations.fs',p=>native('fs',p),{params:object({id,operation:{type:'string',enum:['list','mkdir','rename','delete','upload','download']},path:string,newName:string,isDir:{type:'boolean'},localPath:string},['id','operation','path']),risk:'write',description:'Protocol filesystem adapter with bounded isolated Windows workers. Writes are not retried and existing destinations are not replaced automatically.'});
  return {init,refresh,show,display,label,native};
})();
