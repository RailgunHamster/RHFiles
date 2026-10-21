/* Versioned application actions. No eval, synthetic clicks or network listener.
 * Both physical UI handlers and automation execute the registered callback. */
(function(root,factory){const core=factory();if(typeof module==='object'&&module.exports)module.exports=core;else{root.RHFilesAutomationCore=core;root.RHFilesAPI=core.create();root.RHFilesUI=core.surface(root.document,root.RHFilesAPI);}})(globalThis,()=>{
  'use strict';
  const VERSION='1.0';
  const forbidden=new Set(['__proto__','prototype','constructor']);
  const secret=/password|passphrase|secret|token|credential|authorization|cookie/i;
  const uuid=()=>{if(globalThis.crypto.randomUUID)return globalThis.crypto.randomUUID();const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));bytes[6]=bytes[6]&15|64;bytes[8]=bytes[8]&63|128;return [...bytes].map((b,i)=>([4,6,8,10].includes(i)?'-':'')+b.toString(16).padStart(2,'0')).join('');};
  class ActionError extends Error{constructor(code,message,details){super(message);this.code=code;if(details!==undefined)this.details=details;}}
  const fail=(code,message,details)=>{throw new ActionError(code,message,details);};
  function json(value,depth=0){
    if(depth>32)fail('INVALID_PARAMS','JSON is too deeply nested');
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(Array.isArray(value))return value.map(v=>json(v,depth+1));
    const proto=value&&typeof value==='object'?Object.getPrototypeOf(value):null;
    if(value&&typeof value==='object'&&(proto===null||Object.getPrototypeOf(proto)===null&&proto.constructor?.name==='Object')){const out={};for(const [key,v]of Object.entries(value)){if(forbidden.has(key))fail('INVALID_PARAMS','Reserved JSON key');out[key]=json(v,depth+1);}return out;}
    fail('INVALID_PARAMS','Only JSON values are accepted');
  }
  function canonical(value){return JSON.stringify(Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);}
  function redact(value){if(Array.isArray(value))return value.map(redact);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,secret.test(k)?'[REDACTED]':redact(v)]));return value;}
  function validate(value,schema={},path='$'){
    if(schema.enum&&!schema.enum.some(v=>canonical(v)===canonical(value)))fail('INVALID_PARAMS',path+' is not an allowed value');
    if(!schema.type)return;
    const type=Array.isArray(value)?'array':value===null?'null':typeof value;
    if(schema.type==='integer'?!Number.isSafeInteger(value):schema.type!==type)fail('INVALID_PARAMS',path+' must be '+schema.type);
    if(type==='object'){
      for(const key of schema.required||[])if(!Object.hasOwn(value,key))fail('INVALID_PARAMS',path+'.'+key+' is required');
      for(const [key,v]of Object.entries(value)){if(schema.additionalProperties===false&&!Object.hasOwn(schema.properties||{},key))fail('INVALID_PARAMS',path+'.'+key+' is unknown');validate(v,schema.properties?.[key]||{},path+'.'+key);}
    }
    if(type==='array'){
      if(value.length>(schema.maxItems??100000)||value.length<(schema.minItems??0))fail('INVALID_PARAMS',path+' has an invalid item count');
      value.forEach((v,i)=>validate(v,schema.items||{},path+'['+i+']'));
    }
    if(type==='string'&&(value.length>(schema.maxLength??262144)||value.length<(schema.minLength??0)))fail('INVALID_PARAMS',path+' has an invalid length');
    if((type==='number')&&(value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity)))fail('INVALID_PARAMS',path+' is outside its allowed range');
  }
  function result(value){if(value===undefined)return null;if(value&&typeof value==='object'&&typeof value.nodeType==='number')return {uiChanged:true};try{return json(value);}catch{fail('INVALID_RESULT','Action did not return serializable JSON');}}
  const errorOf=e=>({code:typeof e?.code==='string'?e.code:'ACTION_FAILED',message:String(e?.message||e),...(e?.details===undefined?{}:{details:redact(e.details)})});
  function create({instanceId=uuid(),now=Date.now,maxRuns=128,maxActive=32}={}){
    const commands=new Map(),runs=new Map(),keys=new Map(),states=new Map();let sequence=0,completionSequence=0;
    function register(id,handler,description={}){
      if(!/^[a-zA-Z][a-zA-Z0-9_.-]{0,199}$/.test(id)||typeof handler!=='function')fail('INVALID_ACTION','Invalid action registration');
      if(commands.has(id))fail('DUPLICATE_ACTION','Action already registered: '+id);
      const spec={id,description:description.description||id,risk:description.risk||'ui',params:description.params||{type:'object',properties:{},additionalProperties:false},...description};
      commands.set(id,{handler,spec});return()=>commands.delete(id);
    }
    function describe(id){const command=commands.get(id);if(!command)fail('ACTION_NOT_FOUND','Unknown action: '+id);return json(command.spec);}
    function list(){return [...commands.keys()].sort().map(describe);}
    function checked(id,params){const command=commands.get(id);if(!command)fail('ACTION_NOT_FOUND','Unknown action: '+id);const copy=json(params);if(JSON.stringify(copy).length>262144)fail('INVALID_PARAMS','Action request exceeds 256 KiB');validate(copy,command.spec.params);return {command,copy};}
    async function invoke(id,params={}){const {command,copy}=checked(id,params);return result(await command.handler(copy));}
    function summary(run){return {id:run.id,action:run.action,state:run.state,startedAt:run.startedAt,finishedAt:run.finishedAt,...(run.error?{error:run.error}:{}),...(run.state==='succeeded'?{result:run.result}:{})};}
    function prune(){for(const [key,entry]of keys)if(now()-entry.at>30*60*1000&&!runs.get(entry.id)?.active)keys.delete(key);const finished=[...runs.values()].filter(r=>!r.active).sort((a,b)=>a.completionOrder-b.completionOrder);for(const r of finished.slice(0,Math.max(0,runs.size-maxRuns)))runs.delete(r.id);}
    function completed(state,key){state.active=false;state.finishedAt=now();state.completionOrder=++completionSequence;if(key&&keys.get(key)?.id===state.id)keys.get(key).at=state.finishedAt;prune();}
    function run(id,params={},options={}){
      const {command,copy}=checked(id,params),fingerprint=id+':'+canonical(copy),key=options.key;
      if(key!==undefined&&(typeof key!=='string'||!key.length||key.length>200))fail('INVALID_PARAMS','Idempotency key must contain 1–200 characters');
      if(key&&keys.has(key)){const previous=keys.get(key);if(previous.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT','This key belongs to a different action or parameters');const old=runs.get(previous.id);if(!old)fail('RESULT_EXPIRED','Previous result expired; do not automatically repeat the action');return summary(old);}
      if([...runs.values()].filter(r=>r.active).length>=maxActive)fail('BUSY','Too many active automation actions');
      const state={id:instanceId+':'+(++sequence),action:id,state:'running',active:true,startedAt:now(),finishedAt:null};runs.set(state.id,state);if(key)keys.set(key,{id:state.id,fingerprint,at:now()});
      // Begin immediately, but return an ID before dialogs or long work complete.
      try{state.promise=Promise.resolve(command.handler(copy)).then(v=>{state.result=result(v);state.state='succeeded';},e=>{state.error=errorOf(e);state.state='failed';}).catch(e=>{state.error=errorOf(e);state.state='failed';}).finally(()=>completed(state,key));}
      catch(e){state.error=errorOf(e);state.state='failed';completed(state,key);}
      prune();return summary(state);
    }
    function status(id){const entry=runs.get(id);if(!entry)fail('RUN_NOT_FOUND','Run is unknown, expired, or belongs to a previous app instance');return summary(entry);}
    function lookup(key){const entry=keys.get(key);if(!entry)fail('RUN_NOT_FOUND','No request with this key in this app instance');if(!runs.has(entry.id))fail('RESULT_EXPIRED','This result expired; do not automatically repeat the operation');return status(entry.id);}
    async function wait(id,timeoutMs=30000){if(!Number.isSafeInteger(timeoutMs)||timeoutMs<0||timeoutMs>30000)fail('INVALID_PARAMS','Wait is limited to 0–30000 ms');const entry=runs.get(id);if(!entry)fail('RUN_NOT_FOUND','Unknown run');let timer;try{if(entry.active&&timeoutMs)await Promise.race([entry.promise,new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);})]);return status(id);}finally{clearTimeout(timer);}}
    function provideState(name,read){if(states.has(name))fail('DUPLICATE_ACTION','Duplicate state provider');states.set(name,read);}
    function snapshot(){const out={};for(const [name,read]of states)try{out[name]=redact(result(read()));}catch(e){out[name]={error:errorOf(e)};}return {apiVersion:VERSION,instanceId,state:out};}
    async function rpc(request){
      const id=['string','number'].includes(typeof request?.id)&&Number.isFinite(typeof request.id==='number'?request.id:0)?request.id:null;
      try{
        const input=json(request);if(input.jsonrpc!=='2.0'||!Object.hasOwn(input,'id')||!['string','number'].includes(typeof input.id))fail('INVALID_REQUEST','JSON-RPC 2.0 with a string or numeric id is required');
        if(Object.keys(input).some(k=>!['jsonrpc','id','method','params'].includes(k)))fail('INVALID_REQUEST','Unknown JSON-RPC envelope field');
        const p=input.params??{};let value;
        if(input.method==='api.describe'){validate(p,{type:'object',properties:{},additionalProperties:false});value={apiVersion:VERSION,instanceId,transport:'local-only',methods:['api.describe','actions.list','actions.describe','actions.run','runs.status','runs.lookup','runs.wait','state.get']};}
        else if(input.method==='actions.list'){validate(p,{type:'object',properties:{},additionalProperties:false});value=list();}
        else if(input.method==='actions.describe'){validate(p,{type:'object',properties:{action:{type:'string'}},required:['action'],additionalProperties:false});value=describe(p.action);}
        else if(input.method==='actions.run'){validate(p,{type:'object',properties:{action:{type:'string'},args:{type:'object'},key:{type:'string'}},required:['action'],additionalProperties:false});value=run(p.action,p.args??{},{key:p.key});}
        else if(input.method==='runs.status'){validate(p,{type:'object',properties:{runId:{type:'string'}},required:['runId'],additionalProperties:false});value=status(p.runId);}
        else if(input.method==='runs.lookup'){validate(p,{type:'object',properties:{key:{type:'string',minLength:1,maxLength:200}},required:['key'],additionalProperties:false});value=lookup(p.key);}
        else if(input.method==='runs.wait'){validate(p,{type:'object',properties:{runId:{type:'string'},timeoutMs:{type:'integer',minimum:0,maximum:30000}},required:['runId'],additionalProperties:false});value=await wait(p.runId,p.timeoutMs??30000);}
        else if(input.method==='state.get'){validate(p,{type:'object',properties:{},additionalProperties:false});value=snapshot();}
        else fail('METHOD_NOT_FOUND','Unknown JSON-RPC method');
        return {jsonrpc:'2.0',id,result:value};
      }catch(error){const detail=errorOf(error),codes={INVALID_REQUEST:-32600,METHOD_NOT_FOUND:-32601,INVALID_PARAMS:-32602};return {jsonrpc:'2.0',id,error:{code:codes[detail.code]??-32000,message:detail.message,data:{code:detail.code,...(detail.details===undefined?{}:{details:detail.details})}}};}
    }
    return {version:VERSION,instanceId,register,list,describe,invoke,run,status,lookup,wait,provideState,snapshot,rpc};
  }

  function surface(document,registry){
    const records=new WeakMap(),controls=new WeakMap(),byId=new Map(),inlineMark=Symbol('rhfiles-inline');let next=0;
    const events=['click','dblclick','auxclick','contextmenu','input','beforeinput','change','submit','reset','focus','blur','focusin','focusout','select','keydown','keyup','pointerdown','pointermove','pointerup','pointercancel','pointerenter','pointerleave','pointerover','pointerout','mousedown','mousemove','mouseup','mouseenter','mouseleave','mouseover','mouseout','touchstart','touchmove','touchend','touchcancel','dragstart','dragover','dragenter','dragleave','drop','dragend','wheel','toggle'];
    const idFor=node=>{const fingerprint=JSON.stringify(identity(node));let entry=controls.get(node);if(!entry||entry.fingerprint!==fingerprint){if(entry)byId.delete(entry.id);entry={id:'ui-'+(++next),fingerprint};controls.set(node,entry);}byId.set(entry.id,new WeakRef(node));return entry.id;};
    const isElement=node=>node?.nodeType===1;
    function bound(node){let map=records.get(node);if(!map){map=new Map();records.set(node,map);}return map;}
    function listen(node,type,listener,options,site){
      if(!node?.addEventListener||listener==null)return;
      if(!events.includes(type))return node.addEventListener(type,listener,options);
      const map=bound(node),entries=map.get(type)||[],capture=typeof options==='boolean'?options:!!options?.capture;
      if(entries.some(e=>e.active&&e.original===listener&&e.capture===capture))return;
      const entry={original:listener,capture,site:site||'unspecified',active:!options?.signal?.aborted,once:!!options?.once};
      entry.call=function(event){if(!entry.active)return;try{return typeof listener==='function'?listener.call(node,event):listener.handleEvent(event);}finally{if(entry.once)entry.active=false;}};
      entries.push(entry);map.set(type,entries);idFor(node);node.addEventListener(type,entry.call,options);
      options?.signal?.addEventListener('abort',()=>{entry.active=false;},{once:true});
    }
    function remove(node,type,listener,options){const capture=typeof options==='boolean'?options:!!options?.capture;for(const entry of records.get(node)?.get(type)||[])if(entry.original===listener&&entry.capture===capture&&entry.active){entry.active=false;node.removeEventListener(type,entry.call,options);}node?.removeEventListener?.(type,listener,options);}
    function assign(node,type,listener,site){if(!node)return listener;const property='on'+type,map=bound(node);for(const e of map.get(type)||[])if(e.property)e.active=false;if(listener==null){node[property]=null;return listener;}const entry={original:listener,capture:false,site:site||'property',active:true,property:true};entry.call=function(e){return listener.call(node,e);};entry.call[inlineMark]=true;map.set(type,[...(map.get(type)||[]),entry]);idFor(node);node[property]=entry.call;return listener;}
    function scan(){
      if(!document)return;
      for(const node of document.querySelectorAll(events.map(e=>'[on'+e+']').join(','))){for(const type of events){const callback=node['on'+type];if(typeof callback==='function'&&node.hasAttribute('on'+type)&&!callback[inlineMark])assign(node,type,callback,'inline:'+(node.id||node.getAttribute('data-command')||(node.getAttribute('on'+type).match(/[a-zA-Z_$][\w$]*\s*\(/)||['handler'])[0].replace(/\s*\($/,'')));}}
      for(const node of document.querySelectorAll('button,input,select,textarea,a[href],summary,[role=button],[draggable=true],canvas,video,audio,[id]'))if(node.id||node.scrollHeight>node.clientHeight||['BUTTON','INPUT','SELECT','TEXTAREA','A','SUMMARY','CANVAS','VIDEO','AUDIO'].includes(node.tagName)||node.hasAttribute('role')||node.draggable)idFor(node);
      for(const [id,ref]of byId){const node=ref.deref();if(!node||(isElement(node)&&!node.isConnected))byId.delete(id);else idFor(node);}
    }
    function visible(node){if(!isElement(node))return true;return !node.closest('[hidden],[inert]')&&node.getClientRects().length>0;}
    function disabled(node){return !!(node?.disabled||node?.closest?.('fieldset[disabled],[aria-disabled=true],[inert]'));}
    function resolve(id){scan();const node=byId.get(id)?.deref();if(!node||(isElement(node)&&!node.isConnected))fail('STALE_CONTROL','Control no longer belongs to this screen');if(!visible(node))fail('CONTROL_HIDDEN','Control is not visible');if(disabled(node))fail('CONTROL_DISABLED','Control is disabled');return node;}
    function relevant(node,type){const out=[];for(let current=node;current;current=current.parentNode){for(const e of records.get(current)?.get(type)||[])if(e.active)out.push({node:current,entry:e});}if(node!==document?.defaultView)for(const e of records.get(document?.defaultView)?.get(type)||[])if(e.active)out.push({node:document.defaultView,entry:e});return out;}
    function identity(node){const target={};for(let cur=node;isElement(cur);cur=cur.parentElement){for(const key of ['path','tabId','pane','command','action','id','layout','settingsSection']){const value=cur.dataset?.[key];if(value!==undefined&&target[key]===undefined)target[key]=value;}if(cur.id&&!target.owner)target.owner=cur.id;if(cur.getAttribute('name')&&!target.name)target.name=cur.getAttribute('name');}return target;}
    function label(node){return (node?.getAttribute?.('aria-label')||node?.getAttribute?.('data-i18n')||node?.getAttribute?.('title')||node?.textContent||node?.id||'').trim().slice(0,240);}
    function dangerous(node){return !!node?.closest?.('.danger,.destructive,[data-danger=true]')||/永久删除|清空全部|删除所有|permanently delete|delete permanently|empty all/i.test(label(node));}
    const confirmation=new WeakMap();
    function token(node){let value=confirmation.get(node);if(!value){value=uuid();confirmation.set(node,value);}return value;}
    function list({includeHidden=false,offset=0,limit=1000}={}){
      scan();return [...byId].filter(([,ref])=>{const node=ref.deref();return node&&(includeHidden||visible(node));}).slice(offset,offset+limit).map(([controlId,ref])=>{const node=ref.deref();const bindings=events.filter(type=>relevant(node,type).length);const value={controlId,id:node.id||null,kind:isElement(node)?node.tagName.toLowerCase():node===document?'document':'window',label:label(node),target:identity(node),events:bindings,enabled:!disabled(node),visible:visible(node),sites:[...new Set(bindings.flatMap(type=>relevant(node,type).map(e=>e.entry.site)))],...(dangerous(node)?{risk:'destructive',confirmationToken:token(node)}:{risk:'ui'})};if(node.type==='password'||secret.test(node.name||node.id||''))value.sensitive=true;else if(['INPUT','TEXTAREA','SELECT'].includes(node.tagName)){value.value=node.value;if(node.type==='checkbox'||node.type==='radio')value.checked=node.checked;}if(node.tagName==='SELECT')value.options=[...node.options].map(o=>({value:o.value,label:o.text,disabled:o.disabled}));return value;});
    }
    function eventFor(node,type,params={}){
      const rect=node.getBoundingClientRect?.()||{left:0,top:0,width:0,height:0};
      const data={target:node,currentTarget:node,type,defaultPrevented:false,cancelBubble:false,isTrusted:false,button:0,buttons:0,detail:1,ctrlKey:false,shiftKey:false,altKey:false,metaKey:false,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,...params};
      if(Object.keys(params).some(k=>!['key','code','keyCode','which','button','buttons','ctrlKey','shiftKey','altKey','metaKey','clientX','clientY','deltaX','deltaY','deltaMode','pointerId','pointerType','detail','relatedTarget','repeat','location','data','inputType','touches','changedTouches'].includes(k)))fail('INVALID_PARAMS','Unsupported event field');
      data.preventDefault=()=>{data.defaultPrevented=true;};data.stopPropagation=()=>{data.cancelBubble=true;};data.stopImmediatePropagation=()=>{data.cancelBubble=true;data.immediate=true;};data.composedPath=()=>{const path=[];for(let p=node;p;p=p.parentNode)path.push(p);return path;};return data;
    }
    async function fire(node,type,params={}){
      const event=eventFor(node,type,params),pending=[];let current;
      const handlers=relevant(node,type),ancestors=[...new Set(handlers.map(h=>h.node))];
      const nonBubbling=['focus','blur','mouseenter','mouseleave','pointerenter','pointerleave'].includes(type);
      const ordered=[...ancestors.reverse().flatMap(n=>handlers.filter(h=>h.node===n&&h.entry.capture)),...handlers.filter(h=>!h.entry.capture&&(!nonBubbling||h.node===node))];
      for(const item of ordered){if(event.immediate||event.cancelBubble&&item.node!==current)break;current=item.node;event.currentTarget=item.node;const value=item.entry.call(event);if(value===false&&item.entry.property)event.preventDefault();pending.push(Promise.resolve(value));}
      if(type==='click'&&!event.defaultPrevented){
        if(node.tagName==='SUMMARY'){const details=node.parentElement;if(details?.tagName==='DETAILS'){details.open=!details.open;pending.push(fire(details,'toggle'));}}
        else if(node.tagName==='BUTTON'&&node.type==='submit'&&node.form){if(!node.form.checkValidity())fail('INVALID_FORM','Required or invalid form fields');pending.push(fire(node.form,'submit',{detail:0}));}
        else if(node.tagName==='A'&&node.href&&!handlers.length)fail('INTERACTION_REQUIRED','A native link requires the platform open action');
        else if(!handlers.length&&!['checkbox','radio'].includes(node.type)&&node.tagName!=='SUMMARY')fail('ACTION_UNAVAILABLE','This event has no registered application handler');
      }
      await Promise.all(pending);return {controlId:idFor(node),event:type};
    }
    async function invoke({controlId,event='click',data={},confirmationToken,acknowledge=false}){
      const node=resolve(controlId);if(!events.includes(event))fail('INVALID_PARAMS','Unsupported UI event');
      if(dangerous(node)){if(!acknowledge||confirmationToken!==token(node))fail('CONFIRMATION_REQUIRED','Read this current control and explicitly confirm its token');confirmation.delete(node);}
      if(node.type==='file')fail('INTERACTION_REQUIRED','System file pickers require a trusted user gesture');
      if(['checkbox','radio'].includes(node.type)&&event==='click')fail('INVALID_PARAMS','Use ui.set with an explicit checked value');
      return fire(node,event,data);
    }
    async function set({controlId,value,checked,open,commit=true}){
      const node=resolve(controlId);if(node.readOnly)fail('CONTROL_READ_ONLY','Field is read-only');
      if(node.type==='file')fail('INTERACTION_REQUIRED','Cannot inject files into a system picker');
      if(node.tagName==='DETAILS'){if(typeof open!=='boolean')fail('INVALID_PARAMS','An explicit open boolean is required');node.open=open;return {controlId,open};}
      if(!['INPUT','SELECT','TEXTAREA'].includes(node.tagName))fail('INVALID_PARAMS','Control is not an editable field');
      const old={value:node.value,checked:node.checked};
      try{
        if(['checkbox','radio'].includes(node.type)){if(typeof checked!=='boolean')fail('INVALID_PARAMS','An explicit checked boolean is required');node.checked=checked;}
        else{if(typeof value!=='string')fail('INVALID_PARAMS','Field value must be a string');if(node.tagName==='SELECT'&&![...node.options].some(o=>o.value===value&&!o.disabled))fail('INVALID_PARAMS','Select value is not an enabled option');node.value=value;}
        if(commit&&!node.checkValidity())fail('INVALID_PARAMS','Field value violates its constraints');
      }catch(error){node.value=old.value;node.checked=old.checked;throw error;}
      if(commit&&['checkbox','radio'].includes(node.type))await fire(node,'click');
      await fire(node,'input');if(commit)await fire(node,'change');return {controlId,updated:true};
    }
    const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
    registry.register('ui.list',list,{risk:'read',description:'List live controls and their registered handlers; paginated to avoid huge virtualized-list responses',params:object({includeHidden:{type:'boolean'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:2000}})});
    registry.register('ui.invoke',invoke,{description:'Call registered UI handlers directly, without a synthetic click. Destructive buttons require their current confirmation token.',params:object({controlId:{type:'string'},event:{type:'string',enum:events},data:{type:'object'},confirmationToken:{type:'string'},acknowledge:{type:'boolean'}},['controlId'])});
    registry.register('ui.set',set,{description:'Set a field through its existing input/change handler',params:object({controlId:{type:'string'},value:{type:'string'},checked:{type:'boolean'},open:{type:'boolean'},commit:{type:'boolean'}},['controlId'])});
    registry.register('ui.scroll',({controlId,top,left})=>{const node=resolve(controlId);if(top!==undefined)node.scrollTop=top;if(left!==undefined)node.scrollLeft=left;return {top:node.scrollTop,left:node.scrollLeft};},{params:object({controlId:{type:'string'},top:{type:'number',minimum:0},left:{type:'number',minimum:0}},['controlId'])});
    registry.register('ui.focus',({controlId})=>{const node=resolve(controlId);node.focus?.({preventScroll:true});return {controlId};},{params:object({controlId:{type:'string'}},['controlId'])});
    registry.register('ui.submenu',async({controlId,open})=>{const node=resolve(controlId);if(!node.matches?.('.ctx-item')||!node.querySelector(':scope > .ctx-submenu'))fail('INVALID_PARAMS','Not an application context submenu');node.classList.toggle('automation-expanded',open);if(open)await fire(node,'mouseenter');return {controlId,open};},{description:'Expand a CSS-only context submenu without requiring a pointer hover',params:object({controlId:{type:'string'},open:{type:'boolean'}},['controlId','open'])});
    registry.register('ui.media',async({controlId,command,value})=>{const node=resolve(controlId);if(!['VIDEO','AUDIO'].includes(node.tagName))fail('INVALID_PARAMS','Not a media element');switch(command){case 'play':await node.play();break;case 'pause':node.pause();break;case 'seek':if(!Number.isFinite(node.duration)||value<0||value>node.duration)fail('INVALID_PARAMS','Seek is outside media duration');node.currentTime=value;break;case 'rate':if(!(value>=.25&&value<=4))fail('INVALID_PARAMS','Playback rate must be 0.25–4');node.playbackRate=value;break;case 'volume':if(!(value>=0&&value<=1))fail('INVALID_PARAMS','Volume must be 0–1');node.volume=value;break;case 'mute':node.muted=true;break;case 'unmute':node.muted=false;break;}return {paused:node.paused,position:node.currentTime,duration:Number.isFinite(node.duration)?node.duration:null,rate:node.playbackRate,volume:node.volume,muted:node.muted};},{description:'Control HTML media without emulating platform-owned playback buttons',params:object({controlId:{type:'string'},command:{type:'string',enum:['play','pause','seek','rate','volume','mute','unmute']},value:{type:'number'}},['controlId','command'])});
    registry.provideState('dialogs',()=>document?[...document.querySelectorAll('[role=dialog],[role=alertdialog],.overlay,.sheet')].filter(visible).map(node=>({controlId:idFor(node),title:(node.querySelector('.dialog-title,.sheet-title,h1,h2')?.textContent||node.getAttribute('aria-label')||'').slice(0,300)})):[]);
    // Discover dynamic/inline controls lazily when an API client asks for them.
    // A full-document MutationObserver scan would hurt large virtualized lists.
    return {listen,remove,assign,scan,list,invoke,set,idFor};
  }
  return {VERSION,ActionError,create,surface,validate,redact,errorOf};
});
