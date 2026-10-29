import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('phone file-server UI and scripts share enumerable schema-checked actions',()=>{
 let lookup;const handlers=new Map(),calls=[],registry={register:(id,fn,meta)=>handlers.set(id,{fn,...meta}),provideState(){},provideRunLookup:fn=>{lookup=fn;}};
 const context=vm.createContext({RHFilesAutomationCore:{ActionError:Error},window:{RHFilesAPI:registry},api:{native(){},automationAvailable:()=>false,serverStatus:()=>({running:false})},deviceGroupView:{register(){}},workbench:{id:'first'},fmt:{sortChoices:[]}});
 vm.runInContext(read('android/web/js/automation-android.js')+';globalThis.installPhone=androidAutomation.install',context);
 context.installPhone({state:{},ready:()=>true,startServer:p=>calls.push(['start',p]),stopServer:()=>calls.push(['stop']),chooseServerRoots:()=>calls.push(['roots'])});
 assert.equal(typeof lookup,'function');
 for(const id of ['state','start','stop','roots'])assert(handlers.has('fileServer.'+id));
 const start=handlers.get('fileServer.start');assert.equal(start.params.additionalProperties,false);assert.equal(start.params.properties.roots.maxItems,8);start.fn({roots:[{name:'Phone',path:'/storage/emulated/0/Download'}]});handlers.get('fileServer.stop').fn();handlers.get('fileServer.roots').fn();assert.deepEqual(calls.map(v=>v[0]),['start','stop','roots']);
 const ui=read('android/web/js/app.js');assert.match(ui,/on\('btn-server-toggle',\(\)=>RHFilesAPI\.invoke\(state\.server\?\.running\?'fileServer\.stop':'fileServer\.start'\)/);assert.match(ui,/仅向设备组成员开放以下目录/);
});
test('retired independent password server is not callable from the shipped Android IPC handler',()=>{
 const rust=read('android/src-tauri/src/lib.rs'),handler=rust.slice(rust.indexOf('.invoke_handler('));assert.doesNotMatch(handler,/server::(?:get_reverse_server_status|start_reverse_server|stop_reverse_server)/);
 assert.match(read('android/manifest/AndroidManifest.xml'),/DeviceFileService[^>]*exported="false"[^>]*foregroundServiceType="connectedDevice"/);
 const bridge=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/GroupServiceAuthority.kt');assert.match(bridge,/@Keep/);assert.match(bridge,/DeviceGroups\.serverOperation/);
 const native=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/DeviceFileServer.kt');assert.match(native,/START_NOT_STICKY/);assert.match(native,/storage\.local/);assert.doesNotMatch(native,/PARTIAL_WAKE_LOCK/);
});
