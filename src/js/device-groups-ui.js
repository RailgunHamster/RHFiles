/* Shared desktop/mobile UI. Membership proofs contain public keys only.
 * Local removals have no network/API counterpart that can restore them. */
const deviceGroupView=(()=>{
  const el=(tag,cls='',text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function register(api,call,mobile=false){
    const string={type:'string',minLength:1,maxLength:360000},bool={type:'boolean'};
    const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
    const permissions=object({write:bool,delete:bool});
    const operations={state:object(),diagnostics:object(),connect:object({id:string,peer:string,endpoint:{type:'string',maxLength:256}},['id','peer']),create:object({name:string,deviceName:string,permissions},['name','deviceName']),request:object({deviceName:string},['deviceName']),approve:object({id:string,uri:string,canInvite:bool},['id','uri']),join:object({uri:string,confirmed:bool,permissions},['uri','confirmed']),export:object({id:string},['id']),remove:object({id:string,peer:string},['id','peer']),restore:object({id:string,peer:string,confirmed:bool},['id','peer','confirmed']),forget:object({id:string,confirmed:bool},['id','confirmed']),configure:object({id:string,enabled:bool,permissions},['id','enabled','permissions'])};
    if(mobile)operations.refresh=object();
    if(!mobile)operations.invite=object({id:string,canInvite:bool},['id']);
    operations.cancel=object({id:string,peer:string},['id','peer']);
    for(const [operation,params]of Object.entries(operations))api.register('groups.'+operation,p=>call(operation,p),{params,risk:['state','diagnostics'].includes(operation)?'read':operation==='forget'?'destructive':'external',description:'Local device-group '+operation+'; local refusals are never cleared by incoming proofs'});
  }
  async function mount(root,options){
    await settingsAutoSave.flush();
    const text=(a,b)=>options.zh===false?b:a,call=options.call;
    root.classList.add('device-groups');root.replaceChildren();
    const title=el('h3','',text('设备组','Device groups')),note=el('p','',text('无需中心服务器。每台设备保留自己的私钥；组成员可以携带签名证明互相认识。本机移除只影响本机，任何同步都不能自动加回。','No central server or shared private key. Members carry signed introductions. Removal affects only this device and cannot be undone by synchronization.'));
    const alert=el('p','dg-status');alert.setAttribute('role','status');const controls=el('div','dg-actions'),body=el('div'),output=el('div'),diagnostics=el('details','dg-diagnostics');
    diagnostics.append(el('summary','',text('连接诊断','Connection diagnostics')));
    const diagnosticBody=el('div');diagnostics.append(diagnosticBody);
    root.append(title,note,controls,alert,output,diagnostics,body);
    const safe=fn=>async e=>{const button=e?.currentTarget;if(button)button.disabled=true;alert.textContent='';try{await settingsAutoSave.flush(root);await fn();}catch(error){alert.textContent=String(error.message||error);}finally{if(button)button.disabled=false;}};
    function button(label,fn,id){const b=el('button',options.mobile?'':'dialog-btn',label);b.type='button';RHFilesUI.listen(b,'click',safe(fn),undefined,'groups.'+id);return b;}
    function input(label,value='',type='text'){const row=el('label','dg-field'),field=el(type==='textarea'?'textarea':'input');if(type==='checkbox'){field.type=type;field.checked=!!value;}else{if(type!=='textarea')field.type=type;field.value=value;if(type==='textarea')field.rows=3;}row.append(el('span','',label),field);return {row,field};}
    const codes={connected:['已连接 · 身份已验证','Connected · identity verified'],unreachable:['当前不可达 · 无法确定是否离线','Unreachable · offline status unknown'],network_changed:['本机网络已变化','Local network changed'],authorization_rejected:['授权被拒绝，不再换路重试','Authorization rejected; route retries stopped'],authorization_revoked:['本机授权已移除','Local authorization removed'],cooldown:['重试冷却中','Retry cooldown'],cancelled:['已取消','Cancelled'],timeout:['等待超时（不能证明设备离线）','Timed out (not proof of offline status)'],transport_error:['连接失败，原因未确定','Transport failure, cause unknown'],connection_rejected_or_unreachable:['连接被拒绝或不可达','Connection refused or unreachable'],identity_mismatch:['地址上的设备身份不符，未发送凭据','Wrong device at address; credentials withheld'],identity_or_tls_failure:['TLS 或设备身份校验失败','TLS or identity verification failed'],identity_verified:['已核验设备公钥身份','Device public-key identity verified'],address_changed_verified:['新地址验证成功，已恢复','New address verified; recovered'],local_network_changed:['本机链路变化，旧尝试作废','Local link changed; old attempt discarded'],no_matching_announcement:['未收到匹配广播（不能证明路由器屏蔽）','No matching announcement (blocking not proven)'],untrusted_hints_received:['收到候选地址，仍须验证身份','Address hints received; identity verification required'],signed_packet_received:['已取得并核验签名地址信息','Signed address information verified'],no_online_peer:['没有现存在线组会话','No existing online group session'],peer_unresponsive:['组成员未响应','Group peer unresponsive'],discovery_unavailable:['系统发现不可用','System discovery unavailable'],already_connected:['已连接，无需继续尝试','Already connected; skipped'],duplicate:['重复地址，已合并','Duplicate address; deduplicated'],budget_exhausted:['已达到次数或时间上限','Attempt/time budget exhausted'],not_enabled:['额外 UDP 广播未启用','Additional UDP broadcast disabled'],enter_private_address_or_exchange_group_data:['可手动填写私网地址，或交换新的组公开信息','Enter a private address or exchange fresh public group data'],waiting_network:['短暂等待链路稳定，预算不重置','Briefly waiting for link stability; budget unchanged'],response_slow:['已连接，等待响应较久（原因未确定）','Connected; slow response (cause uncertain)'],response_received:['已收到服务器响应','Server response received'],cancelled_or_timeout:['请求已停止或超时','Request stopped or timed out']};
    const methods={last_success:['上次成功地址','Last successful address'],saved_address:['保存的地址','Saved address'],known_address:['已知签名地址','Known signed address'],manual:['手动地址','Manual address'],trusted_peers:['在线组成员交换','Online trusted peers'],mdns:['局域网 mDNS 发现','LAN mDNS discovery'],udp:['额外 UDP 广播','Additional UDP broadcast'],manual_help:['手动恢复入口','Manual recovery'],network:['本机网络','Local network'],budget:['重试预算','Retry budget'],file_request:['实际文件请求','Actual file request']};
    methods.challenge=['TLS 连接与身份挑战','TLS connection and challenge'];methods.session=['签名认证与公开证明交换','Signed authentication and proof exchange'];methods.capabilities=['文件访问权限检查','File access permission check'];
    methods.coalesce=['合并同一设备的连接请求','Coalesced device connection'];methods.authorization=['本机组授权检查','Local group authorization'];
    Object.assign(codes,{busy:['已有连接任务等待超时','Timed out waiting for an existing connection'],reused_verified_route:['复用刚完成验证的连接','Reused the just-verified connection'],invalid_identity_proof:['设备签名证明无效，已停止','Invalid identity proof; stopped'],endpoint_not_signed:['设备未签名确认该地址','Endpoint not confirmed by device signature'],invalid_response:['服务器响应格式无效','Invalid server response'],invalid_challenge:['身份挑战格式无效','Invalid authentication challenge'],response_too_large:['服务器响应超过安全上限','Server response exceeds safety limit'],response_interrupted:['服务器响应中断','Server response interrupted'],tls_unavailable:['TLS 组件不可用','TLS unavailable']});
    Object.assign(codes,{manual_retry_allowed:['手动重试获准，不受自动冷却阻挡','Manual retry admitted during automatic cooldown'],manual_rate_limited:['刚刚已手动尝试，请稍候再试','Manual retry was just attempted; please wait'],bounded_transport_retry:['短暂退避后重试一次，仍使用原预算','Retrying transport once after a short backoff; same budget'],remote_loopback_ignored:['对方的回环地址不能用于远程访问，已跳过','Remote loopback address skipped'],history_not_saved:['连接成功，但地址历史未能保存','Connected, but address history could not be saved'],tailscale_address:['Tailscale 地址（不代表已确认直连或中继）','Tailscale address (direct/relay path not determined)'],lan_address:['局域网地址','LAN address'],loopback:['本机或显式转发地址','Local or explicitly forwarded address']});
    methods.warm_retry=['原地址受限重试','Bounded retry of the same address'];methods.history=['本机地址记忆','Local address history'];
    codes.session_expired=['会话失效，重新验证一次，不重放文件操作','Session expired; authenticate once without replaying file operations'];
    codes.remote_self_address_ignored=['对方地址与本机网卡地址相同，已跳过；显式转发请填写手动地址','Peer hint points to this device; skipped. Use a manual address for an intentional tunnel.'];
    const label=(map,key)=>map[key]?text(...map[key]):String(key||'').startsWith('http_')?text('服务器已响应：HTTP ','Server responded: HTTP ')+String(key).slice(5):({operation_unconfirmed:text('操作结果未确认，未自动重放，请核对目标','Operation outcome unknown; not replayed; check destination'),server_response_error:text('服务器返回错误，不是设备离线','Server returned an error, not offline'),invalid_endpoint:text('地址无效，仅允许不含凭据的 HTTPS 私网地址','Invalid endpoint; HTTPS private address without credentials required')}[key]||String(key||''));
    async function showDiagnostics(){
      // Reading diagnostics never starts a scan or connection.
      const reports=await call('diagnostics',{});diagnosticBody.replaceChildren();
      if(!reports.length)diagnosticBody.append(el('p','',text('暂无记录。打开组设备或点击“连接设备”后可查看；此处不会自动探测。','No records. Open a group device or connect explicitly. This view never probes automatically.')));
      for(const report of reports){const card=el('section','dg-report');
        card.append(el('strong','',label(codes,report.outcome)),el('p','dg-identity',new Date(report.startedAt).toLocaleString(options.zh===false?'en':'zh-CN')+' · '+report.durationMs+' ms · '+report.peer));
        if(report.endpoint)card.append(el('code','dg-endpoint',report.endpoint));
        if(report.routeType)card.append(el('p','',label(codes,report.routeType)));
        if(Number.isInteger(report.attempts))card.append(el('p','',text('尝试 ','Attempts ')+report.attempts+'/6 · '+text('剩余预算 ','Remaining budget ')+Math.max(0,report.remainingMs||0)+' ms'));
        if(report.retryAfterMs>0)card.append(el('p','',text('自动请求冷却剩余（记录时）：','Automatic-request cooldown remaining at time of report: ')+Math.ceil(report.retryAfterMs/1000)+text(' 秒；可主动点击“连接设备”受限重试。',' seconds; Connect device allows a rate-limited manual retry.')));
        const list=el('ol','dg-steps');for(const step of report.steps||[]){const row=el('li','dg-step');row.dataset.outcome=step.outcome;row.append(el('strong','',label(methods,step.method)),el('span','',label(codes,step.code)+' · '+step.durationMs+' ms'));if(step.endpoint)row.append(el('code','dg-endpoint',step.endpoint));list.append(row);}card.append(list);diagnosticBody.append(card);
      }
    }
    async function connectPeer(group,peer,address){
      alert.textContent=text('正在按需连接，最多 15 秒、6 次尝试…','Connecting on demand; up to 15 seconds / 6 attempts…');
      let observer;
      if(typeof MutationObserver==='function'){
        observer=new MutationObserver(()=>{if(!root.isConnected||root.getClientRects().length===0){observer.disconnect();call('cancel',{id:group,peer}).catch(()=>{});}});
        observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true});
      }
      let result;
      try{result=await call('connect',{id:group,peer,...(address.trim()?{endpoint:address.trim()}:{})});}
      finally{observer?.disconnect();}
      if(!root.isConnected)return;diagnostics.open=true;await showDiagnostics();alert.textContent=label(codes,result?.outcome||'unreachable');
    }
    diagnostics.append(button(text('刷新记录（不重试）','Refresh records (no retry)'),showDiagnostics,'diagnostics.refresh'),button(text('复制诊断','Copy diagnostics'),async()=>{const report=JSON.stringify(await call('diagnostics',{}),null,2);if(options.copy)await options.copy(report);else await navigator.clipboard.writeText(report);alert.textContent=text('已复制不含凭据的诊断记录','Copied diagnostics without credentials');},'diagnostics.copy'));
    RHFilesUI.listen(diagnostics,'toggle',()=>{if(diagnostics.open)showDiagnostics().catch(e=>{alert.textContent=String(e);});},undefined,'groups.diagnostics.open');
    async function show(value){
      output.replaceChildren();const field=input(text('入组信息（仅包含公开证明）','Group data (public proof only)'),value.uri,'textarea');field.field.readOnly=true;
      output.append(field.row,button(text('复制信息','Copy data'),async()=>{if(options.copy)await options.copy(value.uri);else{field.field.select();if(navigator.clipboard)await navigator.clipboard.writeText(value.uri);else if(!document.execCommand('copy'))throw Error(text('请长按文本复制','Select and copy the text'));}alert.textContent=text('已复制','Copied');},'copy'));
      const svg=value.qrSvg||await options.qr?.(value.uri);
      if(svg){const image=el('img','dg-qr');image.alt=text('设备组二维码','Device group QR');image.src='data:image/svg+xml;base64,'+btoa(svg);output.prepend(image);}else output.append(el('p','',text('信息较长，请复制完整文本传递，不要截断。','Too long for a QR: transfer the complete text without truncation.')));
    }
    const initialState=await call('state',{});if(!root.isConnected)return;
    const name=input(text('设备名称','Device name'),initialState.defaultDeviceName||options.deviceName||''),groupName=input(text('新设备组名称','New group name'),text('我的设备','My devices'));
    controls.append(name.row,groupName.row,button(text('创建新设备组','Create group'),async()=>{await call('create',{name:groupName.field.value.trim(),deviceName:name.field.value.trim()});await paint();},'create'),button(text('生成本机入组请求','Request to join'),async()=>{await show(await call('request',{deviceName:name.field.value.trim()}));alert.textContent=text('把请求交给有邀请权限的成员。对方批准后，把批准信息贴回下方并加入。新的请求会使上次未使用的批准失效。','Send the request to a member with invitation rights. Paste their approval below. A new request invalidates an unused old approval.');},'request'));
    const incoming=input(text('粘贴入组请求或批准信息','Paste a request or approval'),'','textarea'),trust=input(text('已核对信息来自我信任的设备','I verified this data came from a trusted device'),false,'checkbox');controls.append(incoming.row,trust.row);
    if(options.scan)controls.append(button(text('扫码','Scan QR'),async()=>{await options.scan();await paint();await options.forgotten?.({});},'scan'));
    controls.append(button(text('使用批准信息加入','Join with approval'),async()=>{if(!trust.field.checked)throw Error(text('请先核对来源并勾选确认','Verify the source and check the confirmation first'));await call('join',{uri:incoming.field.value.trim(),confirmed:true});await paint();alert.textContent=text('已加入。电脑需在文件服务中设置共享目录并启动服务。手机点“刷新组设备”发现其他成员电脑。','Joined. Computers must configure roots and start file service. Refresh group devices on your phone to learn other member computers.');},'join'));
    if(options.mobile)controls.append(button(text('刷新组设备','Refresh group devices'),async()=>{alert.textContent=text('正在连接已知成员并交换公开证明…','Connecting to known members…');const r=await call('refresh',{});await paint();await options.forgotten?.(r);alert.textContent=text('已连接 ','Connected ')+r.connected+text(' 台；可用网络位置 ','; locations ')+r.locations+(r.errors?.length?'\n'+r.errors.map(v=>v.device+'：'+v.message).join('\n'):'')+(r.cleanupErrors?.length?'\n'+r.cleanupErrors.join('\n'):'');},'refresh'));
    async function paint(state){
      await settingsAutoSave.flush(root);
      state=state||await call('state',{});if(!root.isConnected)return;body.replaceChildren(el('p','dg-identity',text('本机身份：','Device identity: ')+state.deviceId));
      if(!state.groups.length)body.append(el('p','',text('尚未加入设备组。已有组请选择“生成本机入组请求”，不要另建同名组。','No groups yet. To join an existing group, request to join; creating a group with the same name makes a separate group.')));
      for(const group of state.groups){
        const card=el('section','dg-card'),head=el('h4','',group.name),summary=el('p','dg-identity',group.id);card.append(head,summary);
        card.append(button(text('显示组公开信息','Show public group data'),async()=>{await show(await call('export',{id:group.id}));},'export.'+group.id));
        const invite=input(text('允许新成员继续邀请其他设备（默认关闭）','Allow the new member to invite others (off by default)'),false,'checkbox');
        if(!options.mobile&&group.members.some(m=>m.self&&m.canInvite&&!m.blocked))card.append(button(text('邀请新设备（扫码加入）','Invite device (scan to join)'),async()=>{await show(await call('invite',{id:group.id,canInvite:invite.field.checked}));alert.textContent=text('请用手机 RHFiles 的“扫码”扫描。邀请两分钟内有效，仅可加入一台设备；加入后权限统一受此设备组控制。','Scan with RHFiles on your phone. Valid for two minutes and one device; all file access remains controlled by this group.');},'invite.'+group.id));
        if(group.members.some(m=>m.self&&m.canInvite&&!m.blocked))card.append(invite.row,button(text('批准上方入组请求','Approve pasted request'),async()=>{if(!trust.field.checked)throw Error(text('请先核对请求来源并勾选确认','Verify the source and check the confirmation first'));await show(await call('approve',{id:group.id,uri:incoming.field.value.trim(),canInvite:invite.field.checked}));await paint();alert.textContent=text('把批准信息交回请求设备，在其上确认加入。','Return this approval to the requesting device.');},'approve.'+group.id));
        if(!options.mobile){
          const enabled=input(text('向此组开放本机文件服务','Share local file service with this group'),group.enabled,'checkbox'),write=input(text('允许写入、重命名','Allow write / rename'),group.permissions.write,'checkbox'),remove=input(text('允许永久删除','Allow permanent delete'),group.permissions.delete,'checkbox'),feedback=el('p','dg-status');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
          settingsAutoSave.bind({root,fields:{enabled:enabled.field,write:write.field,delete:remove.field},id:'groups.configure.'+group.id,
            save:value=>call('configure',{id:group.id,enabled:value.enabled,permissions:{write:value.write,delete:value.delete}}),status:(state,error)=>{
              feedback.setAttribute('aria-busy',String(state==='saving'));feedback.textContent=state==='saving'?text('正在保存…','Saving…'):state==='saved'?text('已自动保存','Saved automatically'):text('保存失败，已恢复上次保存的设置：','Could not save; previous settings restored: ')+error;
            }});card.append(enabled.row,write.row,remove.row,feedback);
        }
        for(const peer of group.members){const row=el('div','dg-member'),info=el('div');info.append(el('strong','',peer.name+(peer.self?text('（本机）',' (this device)'):'')),el('span','',peer.blocked?text('本机已移除 · 需手动恢复','Locally removed · manual restore required'):peer.canInvite?text('可邀请新成员','Can invite members'):text('普通成员','Member')),el('code','dg-identity',peer.id));row.append(info,button(peer.blocked?text('手动恢复','Restore locally'):text('本机移除','Remove locally'),async()=>{const restoring=peer.blocked;const message=(restoring?text('确认在本机恢复此设备的访问权限？','Restore this device’s access on this device?'):text('仅在本机移除此设备？不会自动加回，需手动确认才能恢复。','Remove locally? Synchronization cannot add it back.'))+'\n'+peer.name+'\n'+peer.id;const confirmed=options.confirm?await options.confirm(message):window.confirm(message);if(!confirmed)return;await call(restoring?'restore':'remove',{id:group.id,peer:peer.id,...(restoring?{confirmed:true}:{})});await paint();},(peer.blocked?'restore.':'remove.')+group.id+'.'+peer.id));card.append(row);}
        for(const peer of group.members.filter(p=>!p.self&&!p.blocked&&p.server)){
          const row=el('div','dg-connect'),address=input(text('恢复地址（选填，HTTPS 私网 IP:端口）','Recovery address (optional, HTTPS private IP:port)'));
          row.append(el('strong','',peer.name),button(text('连接设备','Connect device'),()=>connectPeer(group.id,peer.id,address.field.value),'connect.'+group.id+'.'+peer.id),address.row);
          row.append(button(text('取消连接','Cancel connection'),()=>call('cancel',{id:group.id,peer:peer.id}),'cancel.'+group.id+'.'+peer.id));card.append(row);
        }
        const forget=button(text('删除本机设备组','Delete group from this device'),async()=>{
          const message=text('删除本机保存的整个设备组？组将从界面移除，不保留恢复入口；手机上由此组生成的网络位置也会移除。不会删除实际文件，也不影响其他客户端或其他设备组。以后需要重新生成入组请求，由仍保留组信息且有邀请权限的客户端批准。','Delete this entire group from this device? It will disappear without a restore entry, along with its generated mobile network locations. Files, other clients and other groups are unaffected. To rejoin later, generate a new request and have a remaining invite-capable member approve it.')+'\n\n'+group.name+'\n'+group.id;
          const confirmed=options.confirm?await options.confirm(message):window.confirm(message);if(!confirmed)return;
          const result=await call('forget',{id:group.id,confirmed:true});output.replaceChildren();await paint();await options.forgotten?.(result);
          alert.textContent=text('已删除本机设备组。其他客户端仍保留组信息。','Group deleted from this device. Other clients keep their copies.')+(result?.cleanupErrors?.length?'\n'+text('部分网络位置清理失败，点击“刷新组设备”重试：','Some locations could not be removed; refresh group devices to retry: ')+result.cleanupErrors.join('\n'):'');
        },'forget.'+group.id);forget.classList.add('dg-forget');card.append(forget);body.append(card);
      }
    }
    await paint(initialState);
  }
  return {mount,register};
})();
