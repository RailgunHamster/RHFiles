import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';
const api=(app,id,args={})=>app.evaluate('RHFilesAPI.invoke('+JSON.stringify(id)+','+JSON.stringify(args)+')');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('ordinary desktop copy/cut/paste streams local↔group and group↔group, merges folders, resolves file conflicts and reports real progress',async()=>{
  const a=await launchApp({desktopId:'transfer-host-a'}),b=await launchApp({desktopId:'transfer-client',emulateFocus:true}),c=await launchApp({desktopId:'transfer-host-c'});
  const rootA=path.join(a.directory,'shared-fixtures'),rootC=path.join(c.directory,'shared-fixtures'),local=path.join(b.directory,'local-fixtures');
  for(const root of [rootA,rootC,local])fs.mkdirSync(root);
  let group;
  try{
    group=await api(a,'groups.create',{name:'Owned transfer QA',deviceName:'Host A',permissions:{write:true,delete:true}});
    for(const[app,name]of [[b,'Client'],[c,'Host C']]){const request=await api(app,'groups.request',{deviceName:name}),approval=await api(a,'groups.approve',{id:group,uri:request.uri,canInvite:true});await api(app,'groups.join',{uri:approval.uri,confirmed:true,permissions:{write:true,delete:true}});}
    await api(c,'groups.join',{uri:(await api(a,'groups.export',{id:group})).uri,confirmed:true});
    await api(a,'server.start',{config:{port:0,shares:[{name:'Files',path:rootA}]}});await api(c,'server.start',{config:{port:0,shares:[{name:'Files',path:rootC}]}});
    await api(a,'groups.join',{uri:(await api(c,'groups.export',{id:group})).uri,confirmed:true});await api(b,'groups.join',{uri:(await api(a,'groups.export',{id:group})).uri,confirmed:true});
    const devices=(await api(b,'devices.refresh')).devices,deviceA=devices.find(v=>v.name==='Host A'),deviceC=devices.find(v=>v.name==='Host C');assert(deviceA&&deviceC);
    for(const[host,device]of [[a,deviceA],[c,deviceC]]){const port=(await api(host,'server.state')).status.port;assert.equal((await api(b,'groups.connect',{id:group,peer:device.peer,endpoint:'https://127.0.0.1:'+port})).outcome,'connected');}
    const remoteA=deviceA.path+'Files',remoteC=deviceC.path+'Files';
    await b.evaluate("window.__rhfilesSuppressNativeClipboard=true;window.__transferAlerts=[];window.alert=message=>window.__transferAlerts.push(String(message));window.__deviceProgress=[];window.__TAURI__.event.listen('op-progress',event=>{if(window.__deviceProgress.length<10000)window.__deviceProgress.push(event.payload)});true");
    fs.mkdirSync(path.join(local,'中文 % #'));fs.mkdirSync(path.join(local,'中文 % #','empty'));fs.writeFileSync(path.join(local,'中文 % #','data.bin'),Buffer.alloc(5*1024*1024+37,0x5a));fs.writeFileSync(path.join(local,'中文 % #','.hidden'),'hidden');
    const paste=async(source,destination,cut=false)=>{
      const parent=source.startsWith('rhfiles-device:')?source.slice(0,source.lastIndexOf('/')):path.dirname(source);
      await until(async()=>{await api(b,'navigation.open',{path:parent});return (await api(b,'files.list')).entries.some(e=>e.path===source);},'new fixture appears in its parent listing',10000);
      await api(b,'selection.set',{paths:[source]});await api(b,'command.file.'+(cut?'cut':'copy'));await api(b,'navigation.open',{path:destination});await api(b,'command.file.paste');assert.deepEqual(await b.evaluate('window.__transferAlerts'),[]);
    };
    await paste(path.join(local,'中文 % #'),remoteA);
    await b.evaluate('undo()');assert(!fs.existsSync(path.join(rootA,'中文 % #')));assert(fs.existsSync(path.join(local,'中文 % #','data.bin')));await b.evaluate('redo()');assert.deepEqual(await b.evaluate('window.__transferAlerts'),[]);
    assert.equal(sha(path.join(local,'中文 % #','data.bin')),sha(path.join(rootA,'中文 % #','data.bin')));assert(fs.statSync(path.join(rootA,'中文 % #','empty')).isDirectory());assert.equal(fs.readFileSync(path.join(rootA,'中文 % #','.hidden'),'utf8'),'hidden');
    fs.mkdirSync(path.join(local,'downloads'));await paste(remoteA+'/'+encodeURIComponent('中文 % #'),path.join(local,'downloads'));assert.equal(sha(path.join(rootA,'中文 % #','data.bin')),sha(path.join(local,'downloads','中文 % #','data.bin')));
    await paste(remoteA+'/'+encodeURIComponent('中文 % #'),remoteC);assert.equal(sha(path.join(rootA,'中文 % #','data.bin')),sha(path.join(rootC,'中文 % #','data.bin')));
    const progress=await b.evaluate('window.__deviceProgress');assert(progress.some(p=>p.bytesTransferred>0&&p.bytesTransferred<p.totalBytes&&p.percentage<100),'native intermediate byte progress is observable');assert(progress.some(p=>p.status==='complete'&&p.percentage===100));
    fs.writeFileSync(path.join(local,'upload-move.txt'),'upload move');await paste(path.join(local,'upload-move.txt'),remoteA,true);assert(!fs.existsSync(path.join(local,'upload-move.txt')));assert.equal(fs.readFileSync(path.join(rootA,'upload-move.txt'),'utf8'),'upload move');
    await b.evaluate('undo()');assert.equal(fs.readFileSync(path.join(local,'upload-move.txt'),'utf8'),'upload move');assert(!fs.existsSync(path.join(rootA,'upload-move.txt')));await b.evaluate('redo()');assert(!fs.existsSync(path.join(local,'upload-move.txt')));assert.deepEqual(await b.evaluate('window.__transferAlerts'),[]);
    fs.writeFileSync(path.join(rootA,'download-move.txt'),'download move');await paste(remoteA+'/download-move.txt',local,true);assert(!fs.existsSync(path.join(rootA,'download-move.txt')));assert.equal(fs.readFileSync(path.join(local,'download-move.txt'),'utf8'),'download move');
    fs.writeFileSync(path.join(rootA,'peer-move.txt'),'peer move');await paste(remoteA+'/peer-move.txt',remoteC,true);assert(!fs.existsSync(path.join(rootA,'peer-move.txt')));assert.equal(fs.readFileSync(path.join(rootC,'peer-move.txt'),'utf8'),'peer move');
    fs.mkdirSync(path.join(local,'merged'));fs.writeFileSync(path.join(local,'merged','new.txt'),'new');fs.mkdirSync(path.join(rootA,'merged'));fs.writeFileSync(path.join(rootA,'merged','keep.txt'),'keep');await paste(path.join(local,'merged'),remoteA);assert.equal(fs.readFileSync(path.join(rootA,'merged','keep.txt'),'utf8'),'keep');assert.equal(fs.readFileSync(path.join(rootA,'merged','new.txt'),'utf8'),'new');
    // Regular-file Replace uses the same real confirmation UI as local paste.
    fs.writeFileSync(path.join(local,'conflict.txt'),'replacement');fs.writeFileSync(path.join(rootA,'conflict.txt'),'old');await api(b,'navigation.open',{path:local});await api(b,'selection.set',{paths:[path.join(local,'conflict.txt')]});await api(b,'command.file.copy');await api(b,'navigation.open',{path:remoteA});
    await b.evaluate("window.__pasteResult='running';RHFilesAPI.invoke('command.file.paste').then(()=>window.__pasteResult='done').catch(error=>window.__pasteResult=String(error));true");
    await until(()=>b.evaluate("document.getElementById('conflict-dialog').style.display==='flex'"),'actual replace confirmation');await b.click('#conflict-dialog [data-action=replace]');await until(()=>b.evaluate("window.__pasteResult==='done'"),'confirmed replacement committed');assert.equal(fs.readFileSync(path.join(rootA,'conflict.txt'),'utf8'),'replacement');assert.deepEqual(await b.evaluate('window.__transferAlerts'),[]);
    // Confirmation authorizes the displayed object, not any future occupant
    // of its path. Replace it while the real conflict dialog is open.
    fs.writeFileSync(path.join(local,'racing.txt'),'source');fs.writeFileSync(path.join(rootA,'racing.txt'),'old');
    await api(b,'navigation.open',{path:local});await api(b,'selection.set',{paths:[path.join(local,'racing.txt')]});await api(b,'command.file.copy');await api(b,'navigation.open',{path:remoteA});
    await b.evaluate("window.__pasteResult='running';RHFilesAPI.invoke('command.file.paste').then(()=>window.__pasteResult='done').catch(error=>window.__pasteResult=String(error));true");
    await until(()=>b.evaluate("document.getElementById('conflict-dialog').style.display==='flex'"),'racing target confirmation');
    fs.renameSync(path.join(rootA,'racing.txt'),path.join(rootA,'racing-original.txt'));fs.writeFileSync(path.join(rootA,'racing.txt'),'external new occupant');
    await b.click('#conflict-dialog [data-action=replace]');await until(()=>b.evaluate("window.__pasteResult!=='running'"),'stale confirmation fails without mutation');
    assert.equal(fs.readFileSync(path.join(rootA,'racing.txt'),'utf8'),'external new occupant');assert.equal(fs.readFileSync(path.join(rootA,'racing-original.txt'),'utf8'),'old');assert((await b.evaluate('window.__transferAlerts')).some(v=>/conflict|变化/.test(v)));await b.evaluate('window.__transferAlerts=[];true');
    // No whole-folder replacement, even through the native/API entry point.
    fs.mkdirSync(path.join(rootA,'protected'));fs.writeFileSync(path.join(rootA,'protected','keep'),'keep');fs.writeFileSync(path.join(local,'protected'),'file');
    await assert.rejects(api(b,'devices.transfer',{operation:'copy',src:path.join(local,'protected'),dest:remoteA,overwrite:true}),/conflict/);assert.equal(fs.readFileSync(path.join(rootA,'protected','keep'),'utf8'),'keep');
    // Read-only group permissions fail without changing the source or target.
    await api(a,'groups.configure',{id:group,enabled:true,permissions:{write:false,delete:false}});fs.writeFileSync(path.join(local,'denied'),'keep');await assert.rejects(api(b,'devices.transfer',{operation:'copy',src:path.join(local,'denied'),dest:remoteA}),/forbidden|unauthorized/);assert(!fs.existsSync(path.join(rootA,'denied')));assert.equal(fs.readFileSync(path.join(local,'denied'),'utf8'),'keep');
    await api(a,'groups.configure',{id:group,enabled:true,permissions:{write:true,delete:true}});
    // A new connection is explicitly established after permission rotation.
    await api(b,'groups.connect',{id:group,peer:deviceA.peer,endpoint:'https://127.0.0.1:'+(await api(a,'server.state')).status.port});
    fs.writeFileSync(path.join(local,'cancel.bin'),Buffer.alloc(32*1024*1024,0x6b));
    await b.evaluate("window.__cancelTransfer={state:'running'};RHFilesAPI.invoke('devices.transfer',"+JSON.stringify({operation:'copy',src:path.join(local,'cancel.bin'),dest:remoteA,operationId:'owned-transfer-cancel'})+").then(value=>window.__cancelTransfer={state:'done',value}).catch(error=>window.__cancelTransfer={state:'failed',error:String(error)});true");
    await until(()=>b.evaluate("window.__deviceProgress.some(p=>p.operationId==='owned-transfer-cancel'&&p.bytesTransferred>0&&p.bytesTransferred<p.totalBytes)"),'native in-flight upload',30000);
    await b.evaluate("call('cancel_operation',{operationId:'owned-transfer-cancel'})");await until(()=>b.evaluate("window.__cancelTransfer.state!=='running'"),'cancel settles without replay',30000);assert.equal((await b.evaluate('window.__cancelTransfer')).state,'failed');assert(!fs.existsSync(path.join(rootA,'cancel.bin')));assert(fs.existsSync(path.join(local,'cancel.bin')));
    assert(!fs.readdirSync(rootA).some(v=>/^RHFiles-transfer-.*\.partial$/.test(v)),'normal and conflicted transfers do not leave published temporary files');
    const self=(await api(b,'groups.state')).deviceId;fs.writeFileSync(path.join(local,'revoke.bin'),Buffer.alloc(64*1024*1024,0x4e));
    await b.evaluate("window.__revokeTransfer={state:'running'};RHFilesAPI.invoke('devices.transfer',"+JSON.stringify({operation:'copy',src:path.join(local,'revoke.bin'),dest:remoteA,operationId:'owned-transfer-revoke'})+").then(value=>window.__revokeTransfer={state:'done',value}).catch(error=>window.__revokeTransfer={state:'failed',error:String(error)});true");
    await until(()=>b.evaluate("window.__deviceProgress.some(p=>p.operationId==='owned-transfer-revoke'&&p.bytesTransferred>0&&p.bytesTransferred<p.totalBytes)"),'group-bound in-flight transfer',30000);
    await api(a,'groups.remove',{id:group,peer:self});await until(()=>b.evaluate("window.__revokeTransfer.state!=='running'"),'removal interrupts transfer',30000);assert.equal((await b.evaluate('window.__revokeTransfer')).state,'failed');assert(!fs.existsSync(path.join(rootA,'revoke.bin')));assert(fs.existsSync(path.join(local,'revoke.bin')));
    await api(a,'groups.restore',{id:group,peer:self,confirmed:true});await api(b,'groups.connect',{id:group,peer:deviceA.peer,endpoint:'https://127.0.0.1:'+(await api(a,'server.state')).status.port});
    await api(b,'navigation.open',{path:remoteA});await b.screenshot('native-device-transfer-tasks');
    console.log('PASS: actual native copy/cut/paste local↔device/device↔device, byte hashes, empty/hidden/CJK names, merge, confirmation, checked move, permission denial and scoped cancellation. Artifacts: '+b.artifactDir);
  }finally{for(const app of [a,c]){try{await api(app,'server.stop')}catch{}}await a.close();await b.close();await c.close();}
});
