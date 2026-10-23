/* Shared desktop/mobile UI. Membership proofs contain public keys only.
 * Local removals have no network/API counterpart that can restore them. */
const deviceGroupView=(()=>{
  const el=(tag,cls='',text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function register(api,call,mobile=false){
    const string={type:'string',minLength:1,maxLength:360000},bool={type:'boolean'};
    const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
    const permissions=object({write:bool,delete:bool});
    const operations={state:object(),create:object({name:string,deviceName:string,permissions},['name','deviceName']),request:object({deviceName:string},['deviceName']),approve:object({id:string,uri:string,canInvite:bool},['id','uri']),join:object({uri:string,confirmed:bool,permissions},['uri','confirmed']),export:object({id:string},['id']),remove:object({id:string,peer:string},['id','peer']),restore:object({id:string,peer:string,confirmed:bool},['id','peer','confirmed']),configure:object({id:string,enabled:bool,permissions},['id','enabled','permissions'])};
    if(mobile)operations.refresh=object();
    for(const [operation,params]of Object.entries(operations))api.register('groups.'+operation,p=>call(operation,p),{params,risk:operation==='state'?'read':'external',description:'Local device-group '+operation+'; local refusals are never cleared by incoming proofs'});
  }
  async function mount(root,options){
    await settingsAutoSave.flush();
    const text=(a,b)=>options.zh===false?b:a,call=options.call;
    root.classList.add('device-groups');root.replaceChildren();
    const title=el('h3','',text('设备组','Device groups')),note=el('p','',text('无需中心服务器。每台设备保留自己的私钥；组成员可以携带签名证明互相认识。本机移除只影响本机，任何同步都不能自动加回。','No central server or shared private key. Members carry signed introductions. Removal affects only this device and cannot be undone by synchronization.'));
    const alert=el('p','dg-status');alert.setAttribute('role','status');const controls=el('div','dg-actions'),body=el('div'),output=el('div');
    root.append(title,note,controls,alert,output,body);
    const safe=fn=>async e=>{const button=e?.currentTarget;if(button)button.disabled=true;alert.textContent='';try{await settingsAutoSave.flush(root);await fn();}catch(error){alert.textContent=String(error.message||error);}finally{if(button)button.disabled=false;}};
    function button(label,fn,id){const b=el('button',options.mobile?'':'dialog-btn',label);b.type='button';RHFilesUI.listen(b,'click',safe(fn),undefined,'groups.'+id);return b;}
    function input(label,value='',type='text'){const row=el('label','dg-field'),field=el(type==='textarea'?'textarea':'input');if(type==='checkbox'){field.type=type;field.checked=!!value;}else{if(type!=='textarea')field.type=type;field.value=value;if(type==='textarea')field.rows=3;}row.append(el('span','',label),field);return {row,field};}
    async function show(value){
      output.replaceChildren();const field=input(text('入组信息（仅包含公开证明）','Group data (public proof only)'),value.uri,'textarea');field.field.readOnly=true;
      output.append(field.row,button(text('复制信息','Copy data'),async()=>{if(options.copy)await options.copy(value.uri);else{field.field.select();if(navigator.clipboard)await navigator.clipboard.writeText(value.uri);else if(!document.execCommand('copy'))throw Error(text('请长按文本复制','Select and copy the text'));}alert.textContent=text('已复制','Copied');},'copy'));
      const svg=value.qrSvg||await options.qr?.(value.uri);
      if(svg){const image=el('img','dg-qr');image.alt=text('设备组二维码','Device group QR');image.src='data:image/svg+xml;base64,'+btoa(svg);output.prepend(image);}else output.append(el('p','',text('信息较长，请复制完整文本传递，不要截断。','Too long for a QR: transfer the complete text without truncation.')));
    }
    const name=input(text('设备名称','Device name'),options.deviceName),groupName=input(text('新设备组名称','New group name'),text('我的设备','My devices'));
    controls.append(name.row,groupName.row,button(text('创建新设备组','Create group'),async()=>{await call('create',{name:groupName.field.value.trim(),deviceName:name.field.value.trim()});await paint();},'create'),button(text('生成本机入组请求','Request to join'),async()=>{await show(await call('request',{deviceName:name.field.value.trim()}));alert.textContent=text('把请求交给有邀请权限的成员。对方批准后，把批准信息贴回下方并加入。新的请求会使上次未使用的批准失效。','Send the request to a member with invitation rights. Paste their approval below. A new request invalidates an unused old approval.');},'request'));
    const incoming=input(text('粘贴入组请求或批准信息','Paste a request or approval'),'','textarea'),trust=input(text('已核对信息来自我信任的设备','I verified this data came from a trusted device'),false,'checkbox');controls.append(incoming.row,trust.row);
    if(options.scan)controls.append(button(text('扫码填写','Scan data'),async()=>{const result=await options.scan();if(result)incoming.field.value=result.uri;},'scan'));
    controls.append(button(text('使用批准信息加入','Join with approval'),async()=>{if(!trust.field.checked)throw Error(text('请先核对来源并勾选确认','Verify the source and check the confirmation first'));await call('join',{uri:incoming.field.value.trim(),confirmed:true});await paint();alert.textContent=text('已加入。电脑需在文件服务中设置共享目录并启动服务。手机点“刷新组设备”发现其他成员电脑。','Joined. Computers must configure roots and start file service. Refresh group devices on your phone to learn other member computers.');},'join'));
    if(options.mobile)controls.append(button(text('刷新组设备','Refresh group devices'),async()=>{alert.textContent=text('正在连接已知成员并交换公开证明…','Connecting to known members…');const r=await call('refresh',{});await paint();alert.textContent=text('已连接 ','Connected ')+r.connected+text(' 台；可用网络位置 ','; locations ')+r.locations+(r.errors?.length?'\n'+r.errors.map(v=>v.device+'：'+v.message).join('\n'):'');},'refresh'));
    async function paint(){
      await settingsAutoSave.flush(root);
      const state=await call('state',{});if(!root.isConnected)return;body.replaceChildren(el('p','dg-identity',text('本机身份：','Device identity: ')+state.deviceId));
      if(!state.groups.length)body.append(el('p','',text('尚未加入设备组。已有组请选择“生成本机入组请求”，不要另建同名组。','No groups yet. To join an existing group, request to join; creating a group with the same name makes a separate group.')));
      for(const group of state.groups){
        const card=el('section','dg-card'),head=el('h4','',group.name),summary=el('p','dg-identity',group.id);card.append(head,summary);
        card.append(button(text('显示组公开信息','Show public group data'),async()=>{await show(await call('export',{id:group.id}));},'export.'+group.id));
        const invite=input(text('允许新成员继续邀请其他设备（默认关闭）','Allow the new member to invite others (off by default)'),false,'checkbox');
        if(group.members.some(m=>m.self&&m.canInvite&&!m.blocked))card.append(invite.row,button(text('批准上方入组请求','Approve pasted request'),async()=>{if(!trust.field.checked)throw Error(text('请先核对请求来源并勾选确认','Verify the source and check the confirmation first'));await show(await call('approve',{id:group.id,uri:incoming.field.value.trim(),canInvite:invite.field.checked}));await paint();alert.textContent=text('把批准信息交回请求设备，在其上确认加入。','Return this approval to the requesting device.');},'approve.'+group.id));
        if(!options.mobile){
          const enabled=input(text('向此组开放本机文件服务','Share local file service with this group'),group.enabled,'checkbox'),write=input(text('允许写入、重命名','Allow write / rename'),group.permissions.write,'checkbox'),remove=input(text('允许永久删除','Allow permanent delete'),group.permissions.delete,'checkbox'),feedback=el('p','dg-status');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
          settingsAutoSave.bind({root,fields:{enabled:enabled.field,write:write.field,delete:remove.field},id:'groups.configure.'+group.id,
            save:value=>call('configure',{id:group.id,enabled:value.enabled,permissions:{write:value.write,delete:value.delete}}),status:(state,error)=>{
              feedback.setAttribute('aria-busy',String(state==='saving'));feedback.textContent=state==='saving'?text('正在保存…','Saving…'):state==='saved'?text('已自动保存','Saved automatically'):text('保存失败，已恢复上次保存的设置：','Could not save; previous settings restored: ')+error;
            }});card.append(enabled.row,write.row,remove.row,feedback);
        }
        for(const peer of group.members){const row=el('div','dg-member'),info=el('div');info.append(el('strong','',peer.name+(peer.self?text('（本机）',' (this device)'):'')),el('span','',peer.blocked?text('本机已移除 · 需手动恢复','Locally removed · manual restore required'):peer.canInvite?text('可邀请新成员','Can invite members'):text('普通成员','Member')),el('code','dg-identity',peer.id));row.append(info,button(peer.blocked?text('手动恢复','Restore locally'):text('本机移除','Remove locally'),async()=>{const restoring=peer.blocked;const message=(restoring?text('确认在本机恢复此设备的访问权限？','Restore this device’s access on this device?'):text('仅在本机移除此设备？不会自动加回，需手动确认才能恢复。','Remove locally? Synchronization cannot add it back.'))+'\n'+peer.name+'\n'+peer.id;const confirmed=options.confirm?await options.confirm(message):window.confirm(message);if(!confirmed)return;await call(restoring?'restore':'remove',{id:group.id,peer:peer.id,...(restoring?{confirmed:true}:{})});await paint();},(peer.blocked?'restore.':'remove.')+group.id+'.'+peer.id));card.append(row);}
        body.append(card);
      }
    }
    await paint();
  }
  return {mount,register};
})();
