import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';
import {execFileSync} from 'node:child_process';
const invoke=(app,id,args={})=>app.evaluate('RHFilesAPI.invoke('+JSON.stringify(id)+','+JSON.stringify(args)+')');
function bitmap(){const b=Buffer.alloc(70);b.write('BM');b.writeUInt32LE(70,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(2,18);b.writeInt32LE(2,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);b.writeUInt32LE(16,34);for(let i=54;i<70;i++)b[i]=i%3?255:0;return b;}
test('desktop group protocol browses real shared files in ordinary tabs with bounded previews and live revocation',async()=>{
  const a=await launchApp({desktopId:'device-browser-host'}),b=await launchApp({desktopId:'device-browser-client',emulateFocus:true});
  const root=path.join(a.directory,'only-fixture-files');fs.mkdirSync(root);fs.mkdirSync(path.join(root,'中文 % #'));
  fs.writeFileSync(path.join(root,'中文 % #','A.txt'),'fixture · 中文预览 0123456789');fs.writeFileSync(path.join(root,'中文 % #','a-lower.txt'),'lower');fs.writeFileSync(path.join(root,'image.bmp'),bitmap());
  fs.writeFileSync(path.join(root,'中文 % #','data.json'),'{"value":9007199254740993}');
  fs.writeFileSync(path.join(root,'中文 % #','truncated.json'),'{}'+' '.repeat(40000)+'null');
  fs.mkdirSync(path.join(root,'pages'));for(let i=0;i<2011;i++)fs.writeFileSync(path.join(root,'pages','item-'+i+'.txt'),'fixture');
  execFileSync('attrib.exe',['+H','+S',root],{windowsHide:true}); // Same backing attributes as C:\ and D:\, only on this owned fixture.
  try{
    const group=await invoke(a,'groups.create',{name:'RH browser QA',deviceName:'Fixture host',permissions:{write:true,delete:true}});
    const req=await invoke(b,'groups.request',{deviceName:'Fixture computer'}),approval=await invoke(a,'groups.approve',{id:group,uri:req.uri,canInvite:false});await invoke(b,'groups.join',{uri:approval.uri,confirmed:true});
    await invoke(a,'server.start',{config:{port:0,shares:[{name:'Files',path:root}]}});
    await invoke(b,'groups.join',{uri:(await invoke(a,'groups.export',{id:group})).uri,confirmed:true});
    const devices=await invoke(b,'devices.refresh');assert.equal(devices.devices.length,1);const device=devices.devices[0],base=device.path;
    assert.equal((await invoke(b,'groups.diagnostics')).length,0,'Listing known devices must not probe');
    assert.equal(await b.evaluate("document.querySelectorAll('#device-group-locations [data-path]').length"),1);
    assert(await b.evaluate("!!(document.getElementById('device-group-section').compareDocumentPosition(document.getElementById('pinned-list').closest('.sidebar-section'))&Node.DOCUMENT_POSITION_FOLLOWING)"),'RHFiles devices appear above Favorites');
    // Both isolated instances run on this same host. A real remote device's
    // loopback/local-adapter hints are intentionally ignored; use the explicit
    // local-forward address supported by the ordinary connection API.
    const port=(await invoke(a,'server.state')).status.port;
    assert.equal((await invoke(b,'groups.connect',{id:group,peer:device.peer,endpoint:'https://127.0.0.1:'+port})).outcome,'connected');
    const beforeAlias=await invoke(b,'groups.diagnostics');
    const alias=await invoke(b,'devices.resolve',{address:'rh://Fixture host/Files/中文 %25 %23/A.txt'});
    assert.equal(alias.path,base+'Files/'+encodeURIComponent('中文 % #')+'/A.txt');
    assert.deepEqual(await invoke(b,'groups.diagnostics'),beforeAlias,'Name resolution is local, without network discovery');
    await invoke(b,'navigation.open',{path:'rh://Fixture host/Files/中文 %25 %23/A.txt'});
    assert.deepEqual((await invoke(b,'navigation.state')).selection,[alias.path],'CLI and UI both resolve aliases and reveal files');
    await b.evaluate('enterEditMode(false)');
    assert.equal(await b.evaluate("document.getElementById('path-input').value"),'rh://Fixture host/Files/中文 %25 %23');
    await b.send('Input.insertText',{text:'rh://Fixture host/Files/'});
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
    await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
    await until(async()=>(await invoke(b,'navigation.state')).path===base+'Files','actual address-bar Enter opens the device folder');
    await invoke(b,'devices.open',{group,peer:device.peer});assert.equal((await invoke(b,'files.list')).entries[0].name,'Files');
    await invoke(b,'navigation.open',{path:base+'Files/'});assert.equal((await invoke(b,'files.list')).total,3);
    const child=base+'Files/'+encodeURIComponent('中文 % #');await invoke(b,'navigation.open',{path:child});
    const content=await invoke(b,'files.list');assert(content.entries.some(e=>e.name==='A.txt'));assert.equal((await invoke(b,'navigation.state')).path,child);
    const textPath=child+'/A.txt';await invoke(b,'selection.set',{paths:[textPath]});
    await until(()=>b.evaluate("document.getElementById('preview-content').textContent.includes('中文预览')"),'remote text preview');
    for(const [name, expected] of [['data.json',null],['truncated.json','incomplete']]){
      await invoke(b,'selection.set',{paths:[child+'/'+name]});
      await until(async()=>(await invoke(b,'preview.json.state')).open,'remote JSON preview');
      assert.equal((await invoke(b,'preview.json.mode.set',{mode:'tree'})).treeError,expected);
      if(!expected)assert.equal(await b.evaluate("document.querySelector('.json-tree-number')?.textContent"),'9007199254740993');
    }
    // Only this private fixture's text clipboard adapter is captured. The
    // packaged copy handlers, local group state and shortcut routing are real;
    // this test must never overwrite the user's Windows clipboard.
    await b.evaluate('window.__copyAddressQA={original:writeTextClipboard,values:[]};writeTextClipboard=async text=>{__copyAddressQA.values.push(text);return true};true');
    try{
      assert.deepEqual(await invoke(b,'files.copyPaths',{paths:[textPath,child+'/a-lower.txt']}),{copied:2});
      const expected='rh://Fixture host/Files/中文 %25 %23/A.txt\r\nrh://Fixture host/Files/中文 %25 %23/a-lower.txt';
      assert.equal(await b.evaluate('__copyAddressQA.values.at(-1)'),expected);
      await invoke(b,'selection.set',{paths:[textPath,child+'/a-lower.txt']});
      await b.evaluate("document.activeElement?.blur();focusFilePane(document.getElementById('file-list'));true");
      await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'C',code:'KeyC',modifiers:10,windowsVirtualKeyCode:67,nativeVirtualKeyCode:67});
      await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'C',code:'KeyC',modifiers:10,windowsVirtualKeyCode:67,nativeVirtualKeyCode:67});
      await until(()=>b.evaluate('__copyAddressQA.values.length===2'),'actual Ctrl+Shift+C copies the full remote selection');
      const visualOrder=(await invoke(b,'files.list')).entries.filter(e=>[textPath,child+'/a-lower.txt'].includes(e.path)).map(e=>'rh://Fixture host/Files/中文 %25 %23/'+e.name).join('\r\n');
      assert.equal(await b.evaluate('__copyAddressQA.values.at(-1)'),visualOrder,'The shortcut follows the displayed file order, not API selection-request order');
      await b.evaluate('showTabPreview(document.querySelector("#tab-bar .tab.active"))');
      assert.equal(await b.evaluate('document.querySelector(".tab-preview-path").textContent'),'Fixture host/Files/中文 % #');
      await b.screenshot('device-readable-address-hover');
      assert.deepEqual(await invoke(b,'devices.address',{path:textPath}),{address:expected.split('\r\n')[0]});
      assert.deepEqual(await invoke(b,'devices.copyStableAddress',{path:textPath}),{address:textPath});
      assert.equal(await b.evaluate('__copyAddressQA.values.at(-1)'),textPath);
      assert.equal((await invoke(b,'navigation.state')).path,child,'Formatting must not replace the stored identity path');
    }finally{await b.evaluate('writeTextClipboard=__copyAddressQA.original;delete window.__copyAddressQA;hideTabPreview();true');}
    const found=await invoke(b,'devices.search',{path:base+'Files',query:'regex:^A\\.txt$'});assert.equal(found.length,1);assert.equal(found[0].path,textPath);
    const pages=await invoke(b,'devices.entries',{path:base+'Files/pages'});assert.equal(pages.length,2011);assert.equal(new Set(pages.map(v=>v.path)).size,2011);
    await invoke(b,'navigation.open',{path:base+'Files'});const imagePath=base+'Files/image.bmp';await invoke(b,'selection.set',{paths:[imagePath]});
    await until(()=>b.evaluate("document.querySelector('#preview-content img')?.naturalWidth===2"),'real streamed remote image');
    assert.match(await invoke(b,'devices.thumbnail',{path:imagePath}),/^iVBOR/,'remote thumbnail is actual PNG, not placeholder');
    const cap=(await invoke(b,'devices.resource',{path:textPath})).url;
    const range=await b.evaluate('(async()=>{const r=await fetch('+JSON.stringify(cap)+',{headers:{Range:"bytes=0-6"}});return {status:r.status,range:r.headers.get("Content-Range"),bytes:(await r.arrayBuffer()).byteLength}})()');
    assert.equal(range.status,206);assert.equal(range.bytes,7);assert.match(range.range,/^bytes 0-6\//);
    const denied=await b.evaluate('fetch('+JSON.stringify(cap.replace('127.0.0.1','localhost'))+').then(r=>r.status)');assert.equal(denied,403,'loopback Host is validated');
    const reads=value=>value.filter(r=>r.trigger==='file.list').map(r=>r.startedAt);
    const before=reads(await invoke(b,'groups.diagnostics'));await new Promise(r=>setTimeout(r,4500));assert.deepEqual(reads(await invoke(b,'groups.diagnostics')),before,'Idle remote tabs cannot start periodic network reads');
    assert(await b.evaluate("document.getElementById('breadcrumb').textContent.includes('Fixture host')"));
    await b.screenshot('device-browser-normal-tab');
    await invoke(b,'groups.remove',{id:group,peer:device.peer});await until(async()=>(await invoke(b,'devices.list')).devices.length===0,'removed device disappears');
    assert.equal(await b.evaluate('fetch('+JSON.stringify(cap)+').then(r=>r.status)'),401,'old media capability is revoked');
    assert.equal((await invoke(b,'files.list')).total,0,'stale contents do not remain usable after local removal');
    await assert.rejects(invoke(b,'devices.entries',{path:base+'Files'}),/authorization_revoked|已撤销|已移除/);
    console.log('PASS: native group JSON browsing, ordinary tabs, 2011-entry paging, CJK/% paths, search, text/image/range, no idle polling and local revocation');
  }catch(error){const reports=await invoke(b,'groups.diagnostics').catch(()=>[]);fs.writeFileSync(path.join(b.artifactDir,'device-diagnostics.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({diagnostics:reports.slice(0,4).map(r=>({trigger:r.trigger,outcome:r.outcome,steps:r.steps})),navigation:await b.evaluate("document.querySelector('.navigation-error')?.textContent").catch(()=>null)}));throw error;}
  finally{try{await invoke(a,'server.stop')}catch{}a.close();b.close();}
});
