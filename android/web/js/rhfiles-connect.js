/* Camera and mDNS are optional ways to fill the same explicit pairing form.
 * Discovery is untrusted metadata: never send a code until identity is checked. */
const rhFilesConnect=(()=>{
  function mount(root){
    const section=ui.el('section','task-card'),actions=ui.el('div','button-row'),status=ui.el('p','muted'),list=ui.el('div');
    let id=null,stopped=true,timer=null,epoch=0;
    const field=root.elements.pairing;
    function button(label,fn,key){const b=ui.el('button','',label);b.type='button';RHFilesUI.listen(b,'click',()=>Promise.resolve(fn()).catch(e=>{status.textContent=e.message||String(e);}),undefined,'rhfiles.connect.'+key);return b;}
    async function stop(){epoch++;stopped=true;clearTimeout(timer);if(id){const previous=id;id=null;await api.native('lan.stop',{id:previous}).catch(()=>{});}}
    async function use(uri){const value=await api.native('connection.describe',{uri});field.value=value.uri;if(!root.elements.name.value.trim())root.elements.name.value='RHFiles 电脑';status.textContent='已填写配对信息：'+value.endpoints[0]+' · 身份 '+value.fingerprint.slice(0,12).match(/.{4}/g).join(' ')+'。点击“保存连接”完成配对。';await stop();list.replaceChildren();}
    actions.append(button('扫码连接电脑',async()=>{await stop();const value=await api.native('connection.scan');if(value&&root.isConnected)await use(value.uri);},'scan'),button('发现局域网电脑',async()=>{
      await stop();const generation=epoch;list.replaceChildren();stopped=false;status.textContent='正在发现 RHFiles 电脑…';const scan=await api.native('lan.start',{protocol:'rhfiles'});if(generation!==epoch||!root.isConnected){await api.native('lan.stop',{id:scan}).catch(()=>{});return;}id=scan;
      let last='';
      const poll=async()=>{
        if(generation!==epoch)return;
        if(stopped||!root.isConnected||section.hidden){await stop();return;}
        const value=await api.native('lan.state',{id:scan});
        if(generation!==epoch||stopped||!root.isConnected)return;
        const signature=JSON.stringify(value.devices);if(last!==signature){last=signature;list.replaceChildren();for(const device of value.devices){
          const card=ui.el('article','task-card'),url='https://'+device.host+':'+device.port,identity=device.fingerprint.slice(0,12).match(/.{4}/g).join(' ');
          card.append(ui.el('strong','',device.name),ui.el('p','muted',url+' · 身份 '+identity));
          card.append(button('选择这台电脑',()=>{
            if(!root.elements.name.value.trim())root.elements.name.value=device.name;
            list.replaceChildren(card);card.replaceChildren(ui.el('strong','',device.name),ui.el('p','muted',url+' · 身份 '+identity));stop();
            const codeLabel=ui.el('label','','电脑端 10 位配对码'),code=ui.el('input');code.type='password';code.inputMode='numeric';code.maxLength=10;code.autocomplete='off';codeLabel.append(code);
            const verifyLabel=ui.el('label'),verify=ui.el('input');verify.type='checkbox';verifyLabel.append(verify,document.createTextNode('我已核对：电脑端显示的身份为 '+identity));
            card.append(codeLabel,verifyLabel,button('填入配对信息',async()=>{const uri=await api.native('connection.compose',{url,fingerprint:device.fingerprint,code:code.value.trim(),verified:verify.checked});await use(uri);},'compose'));
            status.textContent='发现结果不等于可信设备。请在电脑生成配对码，并核对身份一致；不要把配对码交给身份不符的电脑。';
          },'select'));list.append(card);
        }}
        status.textContent=(value.running?'正在发现… ':'发现结束。')+'找到 '+value.devices.length+' 台电脑。'+(value.warnings||[]).join(' ');
        if(value.running)timer=setTimeout(()=>poll().catch(e=>{if(generation===epoch){status.textContent=e.message||String(e);stop();}}),700);
        else {stopped=true;id=null;}
      };await poll();
    },'discover'),button('停止发现',async()=>{await stop();status.textContent='已停止发现';},'stop'));
    section.append(actions,status,list);field.closest('label').after(section);
    function update(){section.hidden=root.elements.type.value!=='rhfiles';if(section.hidden)stop();}
    RHFilesUI.listen(root.elements.type,'change',update,undefined,'rhfiles.connect.protocol');update();
    const observer=new MutationObserver(()=>{if(!root.isConnected){stop();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
  }
  return {mount};
})();
