/* Native-only WebDAV transport. The v1 merge is shared with Android's schema;
 * this never uploads a whole Windows profile, credentials or group membership. */
const desktopConfigSync=(()=>{
  let root,status,preview,conflicts=[],busy=false,applying=false,timer,initialized=false,lastAuto=0,lastFailure=0;
  const text=(zh,en)=>String(_lang||'').startsWith('zh')?zh:en;
  const $=id=>root?.querySelector('#'+id);
  function paint(){
    if(!root||!status)return;
    const names={idle:text('尚未同步','Not synced'),syncing:text('正在同步…','Syncing…'),ready:text('等待同步确认','Awaiting confirmation'),success:text('同步完成','Sync complete'),failed:text('同步失败','Sync failed')};
    $('config-sync-state').textContent=(conflicts.length?text('两端修改了相同项目，请选择冲突处理方式。','Both devices changed the same settings. Choose how to resolve them.'):names[status.state]||status.state)+(status.message?'\n'+status.message:'')+(status.lastSuccess?'\n'+text('上次完成：','Last completed: ')+formatFileDate(status.lastSuccess):'');
    $('config-sync-state').classList.toggle('media-convert-error',status.state==='failed'||conflicts.length>0);
    for(const control of root.querySelectorAll('input,button'))control.disabled=busy||status.busy;
    $('config-sync-local').hidden=$('config-sync-remote').hidden=!conflicts.length;
    $('config-sync-conflicts').textContent=conflicts.map(item=>item.kind==='favoriteOrder'?text('收藏排列顺序','Favorite order'):(item.local?.label||item.remote?.label||item.local?.name||item.remote?.name||item.local?.config?.name||item.remote?.config?.name||item.id)).join('\n');
    const list=$('config-sync-profiles');list.replaceChildren();
    for(const item of status.profiles||[]){const c=item.config,row=document.createElement('div');row.className='settings-row';const label=document.createElement('span');label.textContent=c.name+' · '+String(c.type||'').toUpperCase();row.append(label);
      const button=document.createElement('button');button.type='button';button.className='dialog-btn';const supported=c.type==='smb'&&(!c.port||c.port===445)&&!String(c.host).includes(':');button.textContent=supported?text('打开','Open'):text('保留供其他设备使用','Kept for other devices');button.disabled=!supported||busy;
      if(supported)RHFilesUI.listen(button,'click',()=>{closeSettings();return navigateTo('\\\\'+c.host+(c.share?'\\'+c.share:''));},undefined,'desktop.config-sync.profile.open.'+item.id);row.append(button);list.append(row);
    }
  }
  async function refresh(){if(IS_MAC)return null;status=await call('config_sync_status',{});paint();return status;}
  function fill(){if(!root||!status)return;for(const key of ['enabled','url','username','insecure']){const input=$('config-sync-'+key);if(input.type==='checkbox')input.checked=!!status.config[key];else input.value=status.config[key]||'';}$('config-sync-password').placeholder=status.config.hasPassword?text('已保存；留空保留原密码','Saved; leave blank to keep'):text('仅保存在本机','Stored on this device only');}
  async function save(args){if(busy)throw Error(text('请等待当前同步完成','Wait for the current sync'));status=await call('config_sync_save',{args});preview=null;conflicts=[];fill();if(root){$('config-sync-password').value='';$('config-sync-clearPassword').checked=false;}paint();changed(150);return status;}
  async function run(manual=true,choice=''){
    if(busy)return {state:'busy'};
    if(!manual&&(conflicts.length||Date.now()-lastAuto<60000||Date.now()-lastFailure<300000))return {state:'deferred'};
    await refresh();if(busy||status.busy)return {state:'busy'};if(!manual&&!status.config.enabled)return {state:'disabled'};
    if(choice&&!['local','remote'].includes(choice))throw Error('Invalid conflict choice');
    busy=true;if(!manual)lastAuto=Date.now();status={...status,state:'syncing',message:''};paint();
    try{
      if(!choice)preview=await call('config_sync_preview',{manual,proxy:getUpdateProxy()});
      if(preview?.skipped)return {state:'disabled'};
      if(!preview?.token)throw Error(text('同步预览已过期，请重新同步','The sync preview expired; sync again'));
      const merged=RHFilesSharedConfig.merge(preview.base,preview.local,preview.remote,choice);
      if(merged.conflicts.length&&!choice){conflicts=merged.conflicts;return {state:'conflict',conflicts};}
      applying=true;await call('config_sync_commit',{token:preview.token,document:merged.document});preview=null;conflicts=[];await loadPinnedFolders();await refresh();return {state:'success'};
    }catch(error){lastFailure=Date.now();preview=null;conflicts=[];status={...status,state:'failed',message:String(error)};throw error;
    }finally{applying=false;busy=false;paint();}
  }
  function changed(delay=1800){if(!initialized||applying)return;clearTimeout(timer);timer=setTimeout(()=>{if(!document.hidden)run(false).catch(()=>{});},delay);}
  async function resolve(choice){if(await showConfirmDialog({kind:'restore',title:text('处理同步冲突','Resolve sync conflicts'),message:text('只处理列出的配置冲突，不删除或移动实际文件。','Only the listed settings conflicts are resolved. Actual files are not deleted or moved.'),confirmLabel:choice==='local'?text('使用本机更改','Use local changes'):text('使用云端更改','Use remote changes'),cancelLabel:t('btn.cancel')}))return run(true,choice);return {state:'canceled'};}
  function mount(host){
    root=host;if(!root||IS_MAC)return;
    const field=(key,label,type='text')=>'<div class="settings-row update-location-row"><label for="config-sync-'+key+'">'+esc(label)+'</label><input id="config-sync-'+key+'" type="'+type+'" autocomplete="off" spellcheck="false"></div>';
    root.innerHTML='<div class="settings-card"><div class="settings-card-title">WebDAV '+text('配置同步','settings sync')+'</div><p class="settings-card-description">'+esc(text('与 Android 共用同步文件。同步网络位置、网络收藏、名称及顺序；不上传密码、设备组、本地路径收藏、主题或窗口布局。','Shares the Android sync file. Syncs network locations and network favorites, labels and order. Passwords, device groups, local favorites, themes and window layouts stay local.'))+'</p><form id="config-sync-form">'+
      '<div class="settings-row"><label for="config-sync-enabled">'+text('自动同步','Automatic sync')+'</label><input id="config-sync-enabled" type="checkbox"></div>'+field('url',text('WebDAV 文件夹地址','WebDAV folder URL'),'url')+field('username',text('用户名','Username'))+field('password',text('密码','Password'),'password')+
      '<div class="settings-row"><label for="config-sync-clearPassword">'+text('清除已保存的密码','Clear saved password')+'</label><input id="config-sync-clearPassword" type="checkbox"></div><div class="settings-row"><label for="config-sync-insecure">'+text('允许明文 HTTP（仅可信局域网）','Allow plaintext HTTP (trusted LAN only)')+'</label><input id="config-sync-insecure" type="checkbox"></div><div class="settings-inline-actions"><button type="submit" class="dialog-btn">'+text('保存同步设置','Save sync settings')+'</button></div></form>'+
      '<p class="settings-card-description">'+esc(text('请填写已存在的私有目录，文件名固定为 rhfiles-settings-v1.json。Windows 中收藏的 SMB 路径会同步到手机；其他协议的信息保留供支持它的设备使用。新设备需自行补填密码，Windows SMB 使用系统已保存的网络登录。','Use an existing private folder; the file is rhfiles-settings-v1.json. Windows SMB favorites sync to Android; other protocol records are retained for devices that support them. Passwords must be supplied locally; Windows SMB uses Windows network credentials.'))+'</p><p id="config-sync-state" class="settings-card-description" role="status" style="white-space:pre-line"></p><div id="config-sync-conflicts" class="settings-card-description" style="white-space:pre-line"></div><div class="settings-inline-actions"><button type="button" id="config-sync-now" class="dialog-btn primary">'+text('立即同步','Sync now')+'</button><button type="button" id="config-sync-local" class="dialog-btn" hidden>'+text('冲突项使用本机更改','Use local conflicts')+'</button><button type="button" id="config-sync-remote" class="dialog-btn" hidden>'+text('冲突项使用云端更改','Use remote conflicts')+'</button></div><p class="settings-card-description">'+esc(text('启用后在启动、回到应用、修改共享配置以及前台每 5 分钟按需同步。发生冲突会停止，失败后自动同步至少等待 5 分钟；关闭后只允许手动同步。','When enabled, syncs on startup, returning to the app, shared changes and every five minutes in the foreground. Conflicts stop automatic sync; failures impose a five-minute cooldown. Disabled means manual sync only.'))+'</p></div><div class="settings-card"><div class="settings-card-title">'+text('已同步的网络位置','Synced network locations')+'</div><div id="config-sync-profiles"></div></div>';
    RHFilesUI.listen($('config-sync-form'),'submit',async event=>{event.preventDefault();const args=Object.fromEntries(['enabled','url','username','password','clearPassword','insecure'].map(key=>{const input=$('config-sync-'+key);return [key,input.type==='checkbox'?input.checked:input.value];}));try{await save(args);}catch(error){status={...status,state:'failed',message:String(error)};paint();}},undefined,'desktop.config-sync.save');
    for(const [id,handler]of [['now',()=>run(true)],['local',()=>resolve('local')],['remote',()=>resolve('remote')]])RHFilesUI.listen($('config-sync-'+id),'click',()=>Promise.resolve().then(handler).catch(()=>{}),undefined,'desktop.config-sync.'+id);
    refresh().then(fill).catch(error=>{$('config-sync-state').textContent=String(error);});
  }
  function init(){if(initialized||IS_MAC)return;initialized=true;refresh().then(()=>changed(1000)).catch(()=>{});RHFilesUI.listen(window,'focus',()=>changed(200),undefined,'desktop.config-sync.resume');const listen=window.__TAURI_INTERNALS__?.event?.listen||window.__TAURI__?.event?.listen;if(listen)listen('config-sync-changed',()=>{loadPinnedFolders().catch(()=>{});refresh().catch(()=>{});});setInterval(()=>{if(!document.hidden)changed(100);},300000);}
  return {init,mount,changed,refresh,save,run,resolve};
})();
