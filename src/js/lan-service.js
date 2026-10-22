/* Local administration only. All actions also have stable command-line APIs. */
const lanService=(()=>{
  const zh=()=>String(_lang||'').startsWith('zh'),text=(a,b)=>zh()?a:b;
  const listen=(node,event,fn,id)=>RHFilesUI.listen(node,event,fn,undefined,'lan.'+id);
  const el=(tag,cls,value)=>{const n=document.createElement(tag);n.className=cls||'';if(value!==undefined)n.textContent=value;return n;};
  function button(label,fn,id){const b=el('button','dialog-btn',label);b.type='button';listen(b,'click',fn,id);return b;}
  async function copy(text){if(!await writeTextClipboard(text))await call('copy_file_path',{path:text});}
  function input(label,value,type='text'){const row=el('label','settings-row'),field=el('input');field.type=type;if(type==='checkbox')field.checked=!!value;else field.value=value??'';row.append(el('span','',label),field);return {row,field};}
  async function mount(host){
    if(!host)return;host.replaceChildren(el('p','settings-card-description',text('正在读取服务状态…','Loading service state…')));
    const model=await call('lan_service_state',{}).catch(error=>{host.textContent=String(error);return null;});if(!model||!host.isConnected)return;
    const status=model.status,running=!!status?.running,card=el('div','settings-card'),note=el('p','settings-card-description');
    note.textContent=text('仅共享你添加的本机目录。默认只读，写入和删除分别授权；此版本不覆盖已有文件。关闭窗口后服务继续运行，退出 RHFiles 才停止。请仅在可信局域网使用。','Only explicitly selected local folders are shared. Read-only by default; write and delete grants are separate. Existing files are never replaced in v1. The service continues when the window is hidden and stops when RHFiles exits. Use on trusted LANs.');
    card.append(el('h3','settings-card-title',text(running?'服务运行中':'服务已停止',running?'Service running':'Service stopped')),note);
    const failure=el('p','settings-update-failure');failure.setAttribute('role','alert');const actions=el('div','settings-inline-actions');
    const safe=fn=>async()=>{failure.textContent='';try{await fn();}catch(error){failure.textContent=String(error);}};
    if(!running){
      const rows=el('div'),shares=model.config.shares?.length?model.config.shares:[{name:text('文件','Files'),path:(getTab()?.path||'').includes('://')?'':getTab()?.path||''}];
      function add(share){const box=el('div','settings-card'),name=input(text('共享名称','Share name'),share.name),path=input(text('本机文件夹完整路径','Full local folder path'),share.path);box.append(name.row,path.row,button(text('移除此目录','Remove folder'),()=>box.remove(),'share.remove'));box.fields={name:name.field,path:path.field};rows.append(box);}
      shares.forEach(add);const port=input(text('监听端口（0 = 自动）','Port (0 = automatic)'),model.config.port??39128,'number');port.field.min=0;port.field.max=65535;
      actions.append(button(text('添加共享目录','Add shared folder'),()=>add({name:'',path:''}),'share.add'),button(text('启动文件服务','Start file service'),safe(async()=>{
        const config={port:Number(port.field.value),shares:[...rows.children].map(n=>({name:n.fields.name.value.trim(),path:n.fields.path.value.trim()}))};
        await call('lan_service_start',{config});await mount(host);
      }),'start'));card.append(rows,port.row);
    }else{
      if(status.discoveryError)card.append(el('p','settings-update-failure',status.discoveryError));
      for(const endpoint of status.endpoints){const address=el('code','settings-card-description',endpoint);address.style.cssText='display:block;font-size:13px;line-height:1.8;overflow-wrap:anywhere';card.append(address);}
      card.append(el('p','settings-card-description',text('WebDAV 地址：','WebDAV URL: ')+status.endpoints.map(p=>p+'/dav/').join(' · ')));
      const grants=el('div'),write=input(text('允许新设备写入、重命名','Allow new devices to write / rename'),false,'checkbox'),remove=input(text('允许新设备永久删除文件','Allow new devices to permanently delete'),false,'checkbox');grants.append(write.row,remove.row);card.append(grants);
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
      for(const device of status.devices){const row=el('div','settings-row'),copy=el('span','',device.name+' · '+text(device.permissions.write?'可写':'只读',device.permissions.write?'Write':'Read-only')+(device.permissions.delete?text(' · 可删除',' · Delete'):''));row.append(copy,button(text('撤销授权','Revoke'),safe(async()=>{await call('lan_service_revoke',{id:device.id});await mount(host); }),'revoke.'+device.id));card.append(row);}
    }
    card.append(actions,failure);host.replaceChildren(card);
  }
  return {mount};
})();
