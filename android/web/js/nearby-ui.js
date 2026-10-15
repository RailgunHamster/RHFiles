/* Shared Windows/Android view. android-sync.ps1 mirrors this canonical source. */
const nearbyView=(()=>{
  function mount(root,config){
    const zh=!config.lang||config.lang.startsWith('zh'),tr=(a,b)=>zh?a:b;
    const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
    const styleId='nearby-view-style';if(!document.getElementById(styleId)){const style=el('style');style.id=styleId;style.textContent=`.nearby-ui{position:relative;color:var(--text);font:14px/1.5 system-ui,sans-serif;padding:4px;--n-line:var(--line,var(--border,#ddd));--n-card:var(--surface,var(--bg-card,#f7f8fa))}.nearby-ui h2{margin:8px 0;font-size:20px}.nearby-ui h3{margin:16px 0 8px;font-size:16px}.nearby-ui p{overflow-wrap:anywhere;margin:8px 0}.nearby-ui input{box-sizing:border-box;width:100%;min-height:44px;padding:8px 12px;color:inherit;background:var(--bg-input,var(--bg,#fff));border:1px solid var(--n-line);border-radius:8px;font:inherit;user-select:text}.nearby-ui button{min-height:44px;border:1px solid var(--n-line);border-radius:8px;background:var(--n-card);padding:8px 14px;color:inherit;font:inherit;cursor:pointer}.nearby-ui button:disabled{opacity:.45;cursor:default}.nearby-ui .n-primary{background:var(--accent,#246ac1);color:white;border-color:transparent}.nearby-ui label{display:block;margin:10px 0;font-size:13px}.nearby-ui label input{margin-top:6px}.nearby-ui .n-muted{color:var(--muted,var(--text-3,#6e7580));font-size:13px}.nearby-ui .n-row{display:flex;gap:8px;align-items:center;margin:10px 0;flex-wrap:wrap}.nearby-ui .n-row input{flex:1;min-width:170px}.nearby-ui .n-card{background:var(--n-card);border:1px solid var(--n-line);border-radius:12px;padding:14px;margin:12px 0;overflow-wrap:anywhere}.nearby-ui .n-peer{display:block;width:100%;text-align:left;white-space:pre-line;margin:8px 0}.nearby-ui progress{width:100%;height:8px;accent-color:var(--accent)}.nearby-ui .n-code{font:600 23px/1.5 ui-monospace,monospace;letter-spacing:2px;user-select:text}.nearby-ui .n-error{color:var(--danger,#ba3030);white-space:pre-line}.nearby-ui .n-confirm{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:20px;background:#10182066}.nearby-ui .n-confirm>div{background:var(--bg,#fff);border:1px solid var(--n-line);box-shadow:0 8px 40px #0003;border-radius:16px;padding:22px;max-width:440px;width:100%;box-sizing:border-box}.nearby-ui .n-confirm p{white-space:pre-line;max-height:45vh;overflow:auto}.nearby-ui .n-summary{white-space:pre-line}`;document.head.append(style);}
    root.replaceChildren();root.classList.add('nearby-ui');let disposed=false,status=null,paths=[...(config.paths||[])],timer,working=false,peerSignature='',confirmDismiss;
    const call=(command,args={})=>config.call(command,args);
    const size=config.formatSize||((bytes)=>bytes<1024?bytes+' B':(bytes/1024**2).toFixed(1)+' MB');
    const message=el('p','n-error');message.setAttribute('role','alert');
    const fail=error=>{message.textContent=String(error?.message||error)};
    const run=handler=>Promise.resolve().then(()=>{message.textContent='';return handler();}).catch(fail);
    const button=(text,handler,primary=false)=>{const node=el('button',primary?'n-primary':'',text);node.type='button';node.onclick=()=>run(handler);return node;};
    function confirm(title,text,caption){if(confirmDismiss)return Promise.resolve(false);return new Promise(resolve=>{const layer=el('div','n-confirm'),box=el('div'),row=el('div','n-row');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.append(el('h3','',title),el('p','',text),row);const finish=value=>{confirmDismiss=null;layer.remove();resolve(value)};confirmDismiss=()=>finish(false);row.append(button(tr('取消','Cancel'),()=>finish(false)),button(caption,()=>finish(true),true));layer.append(box);root.append(layer);row.lastChild.focus();});}
    const title=el('h2','',tr('附近互传','Nearby Transfer'));root.append(title,el('p','n-muted',tr('同一局域网 · TLS 加密 · 接收端每次确认','Same LAN · TLS encrypted · Receiver approval required')));
    const aliasLabel=el('label','',tr('本机名称','Device name')),alias=el('input');alias.value=localStorage.getItem('rhfiles.nearby.alias')||config.defaultAlias||tr('我的设备','My device');alias.maxLength=80;aliasLabel.append(alias);
    const enabled=button(tr('开启附近互传','Enable Nearby'),async()=>{
      if(working)return;working=true;enabled.disabled=true;
      try{if(status?.running){await call('nearby_stop');await config.lifetime?.(false);}else{
        if(!await confirm(tr('开启局域网互传？','Enable local transfers?'),tr('只公布设备名和接收码，不共享磁盘。接收文件需要确认。Windows 如出现防火墙提示，请仅允许可信的专用网络。','Only the device name and receiver code are announced, not your disk. Incoming batches require approval. Allow only trusted private networks in Windows Firewall.'),tr('开启','Enable')))return;
        localStorage.setItem('rhfiles.nearby.alias',alias.value);await config.lifetime?.(true);try{await call('nearby_start',{alias:alias.value||config.defaultAlias});}catch(error){await config.lifetime?.(false);throw error;}
      }await refresh();}finally{working=false;enabled.disabled=false;}
    },true);
    enabled.dataset.nearby='toggle';
    const identity=el('section','n-card'),code=el('div','n-code'),addresses=el('p','n-muted'),discovery=el('p','n-muted');identity.append(el('strong','',tr('本机接收码（让发送端核对）','Receiver code (compare on sender)')),code,addresses,discovery);
    root.append(aliasLabel,enabled,identity);
    const destinationLabel=el('label','',tr('接收文件夹（每批会新建独立子文件夹）','Receive folder (new subfolder per batch)')),destination=el('input');destination.value=config.destination||'';destination.spellcheck=false;destinationLabel.append(destination);root.append(destinationLabel);
    destination.dataset.nearby='destination';
    if(config.otherFolder)root.append(button(tr('使用另一窗格当前文件夹','Use the other pane folder'),()=>{const path=config.otherFolder();if(!path)throw Error(tr('请先在另一窗格打开本机目标文件夹','Open a local destination in the other pane first'));destination.value=path;}));
    const summary=el('p','n-summary'),updateSummary=()=>{summary.textContent=paths.length?tr('已选 '+paths.length+' 项：\n','Selected '+paths.length+' items:\n')+paths.slice(0,5).map(path=>path.split(/[\\/]/).pop()).join('\n')+(paths.length>5?'\n…':''):tr('先在文件列表多选，再打开附近互传。','Select items in the file list, then open Nearby Transfer.');peerSignature='';};
    root.append(el('h3','',tr('发送','Send')),summary);updateSummary();
    if(config.folder)root.append(button(tr('发送当前浏览的文件夹','Send the browsed folder'),()=>{paths=[config.folder];updateSummary();paintPeers();}));
    const manual=el('div','n-row'),address=el('input');address.placeholder='192.168.1.10:54435';address.setAttribute('aria-label',tr('对端 IP:端口','Peer IP:port'));address.spellcheck=false;
    manual.append(address,button(tr('连接地址','Connect'),async()=>{if(!status?.running)throw Error(tr('请先开启互传','Enable Nearby first'));await call('nearby_probe',{address:address.value});await refresh();}));root.append(manual);
    const peers=el('section'),tasks=el('section');root.append(peers,el('h3','',tr('传输任务','Transfers')),tasks,message);
    const names={scanning:tr('扫描文件','Scanning'),waiting:tr('等待接收确认','Awaiting approval'),accepted:tr('等待发送端开始','Waiting for sender'),sending:tr('正在发送','Sending'),receiving:tr('正在接收','Receiving'),verifying:tr('正在核验并保存','Verifying and saving'),completed:tr('已完成','Completed'),canceled:tr('已取消','Canceled'),expired:tr('等待超时','Expired'),failed:tr('失败','Failed')};
    const isActive=state=>['scanning','waiting','accepted','sending','receiving','verifying'].includes(state);
    function paintPeers(){const list=status?.running?status.peers||[]:[];const signature=JSON.stringify([list.map(p=>[p.id,p.alias,p.address]),paths]);if(signature===peerSignature)return;peerSignature=signature;peers.replaceChildren();if(!list.length){peers.append(el('p','n-muted',tr('没有发现设备？请在两端开启互传，连接同一 Wi-Fi；也可手动输入地址。','No devices? Enable Nearby on both devices on the same Wi-Fi, or enter an address.')));return}
      for(const peer of list){const send=button(peer.alias+'\n'+peer.address+' · '+tr('接收码 ','Code ')+peer.code,async()=>{if(!paths.length)throw Error(tr('请先在文件列表选择文件','Select files in the file list first'));const selected=[...paths];if(!await confirm(tr('确认发送到此设备？','Send to this device?'),peer.alias+'\n'+peer.address+'\n'+tr('请核对对端显示的十二位接收码：','Compare all 12 characters shown on the receiver:')+'\n'+peer.code+'\n\n'+tr(selected.length+' 项；来源不会删除。',selected.length+' items; sources are kept.'),tr('接收码一致，发送','Codes match — send')))return;await call('nearby_send',{peerId:peer.id,confirmedFingerprint:peer.id,sources:selected});await refresh();});send.classList.add('n-peer');send.disabled=!paths.length;peers.append(send);}
    }
    function paint(){
      const running=!!status?.running;enabled.textContent=running?tr('关闭附近互传','Disable Nearby'):tr('开启附近互传','Enable Nearby');alias.disabled=running;
      identity.hidden=!running;code.textContent=(status?.code||'').match(/.{1,4}/g)?.join(' ')||'';addresses.textContent=(status?.addresses||[]).join('\n')||tr('未检测到 Wi-Fi 地址；可尝试手动连接。','No Wi-Fi address detected; try a manual connection.');
      discovery.textContent=status?.discoveryError?tr('自动发现不可用，可手动连接：','Discovery unavailable; connect manually: ')+status.discoveryError:tr('设备名可以伪造，请始终核对接收码。','Device names can be spoofed; always compare receiver codes.');paintPeers();
      const wanted=new Set();for(const job of status?.transfers||[]){wanted.add(job.id);let card=[...tasks.children].find(n=>n.dataset.job===job.id);if(!card){card=el('article','n-card');card.dataset.job=job.id;card.append(el('strong','n-state'),el('p','n-current'),el('progress'),el('p','n-details'),el('p','n-error'),el('div','n-row'));tasks.append(card);}
        card.querySelector('.n-state').textContent=(job.direction==='receive'?tr('接收自 ','Receive from '):tr('发送到 ','Send to '))+job.peer+' · '+(names[job.state]||job.state);
        card.querySelector('.n-current').textContent=job.current||job.preview.join(' · ');const progress=card.querySelector('progress');progress.max=job.total||1;progress.value=job.bytes;progress.hidden=!isActive(job.state);
        card.querySelector('.n-details').textContent=size(job.bytes)+' / '+size(job.total)+' · '+job.count+tr(' 项',' items')+(job.bytes?' · '+size(job.bytes/Math.max(1,(Date.now()-job.started)/1000))+tr('/s（平均）','/s average'):'')+(job.output?'\n'+job.output:'');card.querySelector('.n-error').textContent=job.message;
        const actions=card.querySelector('.n-row');if(actions.dataset.state!==job.state){actions.dataset.state=job.state;actions.replaceChildren();
          if(job.state==='waiting'&&job.direction==='receive')actions.append(button(tr('接收','Accept'),async()=>{const target=destination.value;if(!await confirm(tr('接收这批文件？','Accept these files?'),tr('来源名称未经身份认证：','Sender name is not authenticated: ')+job.peer+' ('+job.address+')\n'+job.preview.join('\n')+'\n\n'+tr('保存到：','Save to: ')+target,tr('确认接收','Accept')))return;await call('nearby_accept',{id:job.id,destination:target});await refresh();},true));
          if(isActive(job.state))actions.append(button(job.direction==='receive'&&job.state==='waiting'?tr('拒绝','Reject'):tr('取消','Cancel'),async()=>{await call('nearby_cancel',{id:job.id});await refresh();}));
          if(job.state==='completed'&&job.output&&config.open)actions.append(button(tr('打开接收文件夹','Open received folder'),()=>config.open(job.output)));
        }
      }
      for(const card of [...tasks.children])if(card.dataset.job&&!wanted.has(card.dataset.job))card.remove();
      let interrupted=tasks.querySelector('.n-interrupted');if(status?.interrupted?.length){if(!interrupted){interrupted=el('p','n-interrupted n-error');tasks.append(interrupted)}interrupted.textContent=tr('上次异常退出留下未完成接收目录，请检查后在文件管理器中清理：\n','Unfinished receive folders from an interrupted run; inspect before cleanup:\n')+status.interrupted.join('\n');}else interrupted?.remove();
    }
    async function refresh(){if(disposed||!root.isConnected)return;status=await call('nearby_status');if(!disposed)paint();}
    async function poll(){clearTimeout(timer);try{await refresh();}catch(error){if(!disposed)fail(error)}finally{if(!disposed&&root.isConnected)timer=setTimeout(poll,1000);}}
    root.addEventListener('keydown',event=>{if(event.key==='Escape'&&confirmDismiss){event.stopImmediatePropagation();event.preventDefault();confirmDismiss();}},true);
    poll();return {refresh,back(){if(confirmDismiss){confirmDismiss();return true}return false},destroy(){disposed=true;clearTimeout(timer);confirmDismiss?.();root.classList.remove('nearby-ui');}};
  }
  return {mount};
})();
