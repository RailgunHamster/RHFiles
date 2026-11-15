import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {parse} from 'acorn';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('phone file-server UI and scripts share enumerable schema-checked actions',()=>{
 let lookup;const handlers=new Map(),calls=[],registry={register:(id,fn,meta)=>handlers.set(id,{fn,...meta}),provideState(){},provideRunLookup:fn=>{lookup=fn;}};
 const context=vm.createContext({RHFilesAutomationCore:{ActionError:Error},window:{RHFilesAPI:registry},api:{native(){},automationAvailable:()=>false,serverStatus:()=>({running:false})},deviceGroupView:{register(){}},workbench:{id:'first'},fmt:{sortChoices:[]}});
 vm.runInContext(read('android/web/js/automation-android.js')+';globalThis.installPhone=androidAutomation.install',context);
 context.installPhone({state:{},ready:()=>true,startServer:p=>calls.push(['start',p]),stopServer:()=>calls.push(['stop']),chooseServerRoots:p=>calls.push(['roots',p]),serverRoots:()=>[],serverAutoStart:()=>({enabled:false}),setServerAutoStart:enabled=>calls.push(['autoStart',enabled]),saveServerShare:p=>calls.push(['save',p]),removeServerShare:path=>calls.push(['remove',path])});
 assert.equal(typeof lookup,'function');
 for(const id of ['state','start','stop','roots','shares','share.save','share.remove'])assert(handlers.has('fileServer.'+id));
 const start=handlers.get('fileServer.start');assert.equal(start.params.additionalProperties,false);assert.equal(start.params.properties.roots.maxItems,8);
 const share={name:'Phone',path:'/storage/emulated/0/Download'};
 start.fn({roots:[share]});handlers.get('fileServer.stop').fn();handlers.get('fileServer.roots').fn({path:share.path});
 assert.deepEqual(handlers.get('fileServer.shares').fn(),[]);
 handlers.get('fileServer.share.save').fn(share);handlers.get('fileServer.share.remove').fn({path:share.path});
 assert.deepEqual(handlers.get('fileServer.autoStart.state').fn(),{enabled:false});
 const setting=handlers.get('fileServer.autoStart.set');
 assert.deepEqual(Array.from(setting.params.required),['enabled']);
 setting.fn({enabled:true});
 assert.deepEqual(calls,[['start',{roots:[share]}],['stop'],['roots',{path:share.path}],['save',share],['remove',share.path],['autoStart',true]]);
 const ui=read('android/web/js/app.js');assert.match(ui,/on\('btn-server-toggle',\(\)=>RHFilesAPI\.invoke\(state\.server\?\.running\?'fileServer\.stop':'fileServer\.start'\)/);assert.match(ui,/仅向设备组成员开放以下目录/);
});
test('startup shares only saved directories after opt-in and runs at most once per app launch',async()=>{
 const source=read('android/web/js/app.js');
 const nodes=parse(source,{ecmaVersion:'latest'}).body[0].expression.callee.body.body;
 const names=['serverRoots','serverAutoStart','setServerAutoStart','launchSavedServer'];
 const functions=names.map(name=>{
  const node=nodes.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);
  assert(node,'Missing production function '+name);return source.slice(node.start,node.end);
 }).join('\n');
 const roots=[{name:'Phone',path:'/storage/emulated/0/Download'}];
 function fixture({enabled=false,shares=roots,primary=true,hidden=false,running=true}={}){
  const choices=new Map([['rhfiles.phoneFileShareAutoStart',enabled?'1':'0'],['rhfiles.phoneFileShares',JSON.stringify(shares)]]);
  const starts=[],toasts=[],state={route:{tool:'server'}};let refreshes=0;
  const scope=vm.createContext({bootReady:true,checkedServerAutoStart:false,workbench:{primary:()=>primary},document:{hidden},state,paneHost:()=>null,
   saved:(key,fallback)=>choices.get(key)??fallback,cache:(key,value)=>choices.set(key,value),paintServerAutoStart(){},
   api:{nativeAvailable:()=>true,serverStartOnLaunch:async shares=>{starts.push(JSON.parse(JSON.stringify(shares)));return running?{running}:{running,autoStartError:'目录已拔出'};}},
   ui:{toast:message=>toasts.push(message)},refreshServer:async()=>{refreshes++;},
  });
  vm.runInContext(functions,scope);
  return {scope,starts,toasts,refreshes:()=>refreshes,state};
 }
 for(const options of [{},{enabled:true,shares:[]},{enabled:true,primary:false},{enabled:true,hidden:true}]){
  const item=fixture(options);await item.scope.launchSavedServer();assert.deepEqual(item.starts,[]);
 }
 const enabled=fixture();
 await enabled.scope.launchSavedServer();
 assert.equal(enabled.scope.setServerAutoStart(true).enabled,true);
 await enabled.scope.launchSavedServer();
 assert.deepEqual(enabled.starts,[],'Changing the setting only takes effect on next launch');
 const allowed=fixture({enabled:true});
 await Promise.all([allowed.scope.launchSavedServer(),allowed.scope.launchSavedServer()]);
 assert.deepEqual(allowed.starts,[roots]);
 allowed.state.server.running=false;
 await allowed.scope.launchSavedServer();
 assert.equal(allowed.starts.length,1,'Returning to the foreground must not undo a manual stop');
 assert.equal(allowed.refreshes(),1);
 const failed=fixture({enabled:true,running:false});
 await failed.scope.launchSavedServer();await failed.scope.launchSavedServer();
 assert.equal(failed.state.server.running,false);
 assert.deepEqual(failed.toasts,['自动启动共享失败：目录已拔出']);
 assert.equal(failed.starts.length,1,'Failed startup is surfaced without retries');
});
test('retired independent password server is not callable from the shipped Android IPC handler',()=>{
 const rust=read('android/src-tauri/src/lib.rs'),handler=rust.slice(rust.indexOf('.invoke_handler('));assert.doesNotMatch(handler,/server::(?:get_reverse_server_status|start_reverse_server|stop_reverse_server)/);
 assert.match(read('android/manifest/AndroidManifest.xml'),/DeviceFileService[^>]*exported="false"[^>]*foregroundServiceType="connectedDevice"/);
 assert.match(read('android/manifest/AndroidManifest.xml'),/DeviceFileService[^>]*stopWithTask="true"/);
 const bridge=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/GroupServiceAuthority.kt');assert.match(bridge,/@Keep/);assert.match(bridge,/DeviceGroups\.serverOperation/);
 const native=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/DeviceFileServer.kt');assert.match(native,/START_NOT_STICKY/);assert.match(native,/storage\.local/);assert.doesNotMatch(native,/PARTIAL_WAKE_LOCK/);
});
