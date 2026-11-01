import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import net from 'node:net';
import {launchApp,until} from '../testing/app-session.mjs';import {launchRemoteWindowsApp} from '../testing/remote-windows-app.mjs';
const api=(app,id,args={})=>app.evaluate('RHFilesAPI.invoke('+JSON.stringify(id)+','+JSON.stringify(args)+')');
const free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
test('actual Windows native access honors owner consent, opens a live group UNC path, saves through WebClient and cannot auto-regrant after revocation',{skip:process.env.RHFILES_REMOTE_WINDOWS_QA!=='1'},async()=>{
  const a=await launchApp({desktopId:'windows-access-host'});let b,uri;const files=path.join(a.directory,'only-owned-windows-fixtures');fs.mkdirSync(files);fs.writeFileSync(path.join(files,'中文.txt'),'original');
  const bmp=Buffer.alloc(78);bmp.write('BM');bmp.writeUInt32LE(78,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(2,18);bmp.writeInt32LE(3,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);bmp.writeUInt32LE(24,34);for(let i=54;i<78;i++)bmp[i]=i%3?255:0;fs.writeFileSync(path.join(files,'image.bmp'),bmp);
  try{
    b=await launchRemoteWindowsApp();
    const group=await api(a,'groups.create',{name:'Owned Windows access QA',deviceName:'Owned Windows host',permissions:{write:true,delete:true}});
    const request=await api(b,'groups.request',{deviceName:'Owned Windows client'}),approval=await api(a,'groups.approve',{id:group,uri:request.uri,canInvite:false});await api(b,'groups.join',{uri:approval.uri,confirmed:true});
    await api(a,'server.start',{config:{port:0,shares:[{name:'Files',path:files}]}});await api(b,'groups.join',{uri:(await api(a,'groups.export',{id:group})).uri,confirmed:true});
    const peer=(await api(b,'devices.refresh')).devices[0],service=(await api(a,'server.state')).status;
    const endpoint=service.endpoints.find(p=>/^https:\/\/100\./.test(p));assert(endpoint,'owned host has a Tailscale route');await api(b,'groups.connect',{id:group,peer:peer.peer,endpoint});
    const gateway=await api(a,'server.webdavConfigure',{enabled:true,confirmed:true,port:await free()});assert(gateway.url.startsWith('https://winserver.'));
    uri=peer.path+'Files/'+encodeURIComponent('中文.txt');
    await assert.rejects(api(b,'devices.windowsPath',{path:uri}),/compatibility_permission_required/);
    const member=(await api(b,'groups.state')).deviceId;await api(a,'server.webdavCredentials',{group,peer:member});
    const connection=await api(b,'devices.windowsPath',{path:uri});assert.equal(connection.live,true);assert.match(connection.path,/^\\\\winserver\..*@SSL@\d+\\DavWWWRoot\\dav\\Files\\中文\.txt$/);
    const preview=await b.evaluate('call("read_file_preview",'+JSON.stringify({path:connection.path})+')');assert.equal(preview.text_content,'original');
    // Ordinary Windows file APIs go through the real WebClient redirector,
    // not the group JSON file API or a downloaded mirror.
    await b.evaluate('call("rename_file",'+JSON.stringify({path:connection.path,newName:'renamed.txt'})+')');assert.equal(fs.readFileSync(path.join(files,'renamed.txt'),'utf8'),'original');
    const image=await api(b,'devices.windowsPath',{path:peer.path+'Files/image.bmp'});
    const rotated=Buffer.from(bmp);rotated.writeInt32LE(3,18);rotated.writeInt32LE(2,22);
    await b.writeNative(image.path,rotated);
    await until(()=>fs.readFileSync(path.join(files,'image.bmp')).readInt32LE(18)===3,'Windows WebClient file save commits real rotated bytes',20000);
    await b.writeNative(image.path,bmp);
    await until(()=>fs.readFileSync(path.join(files,'image.bmp')).readInt32LE(18)===2,'a second Windows WebClient save succeeds',20000);
    const diagnostics=(await api(b,'groups.diagnostics')).filter(r=>r.trigger==='windows.compatibility');assert(diagnostics.some(r=>r.outcome==='connected'&&r.steps.some(s=>s.method==='windows.webclient'&&s.outcome==='succeeded')));assert(!JSON.stringify(diagnostics).includes('password'));
    await api(a,'server.webdavRevoke',{group,peer:member});await assert.rejects(api(b,'devices.windowsPath',{path:uri}),/compatibility_permission_required/);
    console.log('PASS: real RAILGUNHAMSTER native Windows access, system-trusted TLS, live UNC read/rename/repeated image saves, owner consent and non-resurrecting revocation; production profiles and clipboard untouched. QA binary: '+b.hash);
  }catch(error){console.log('Owned DAV failure diagnostics: '+JSON.stringify((await api(a,'server.webdavCompatibility').catch(()=>({}))).recentFailures||[]));throw error;}
  finally{if(b&&uri)await api(b,'devices.windowsDisconnect',{path:uri,confirmed:true}).catch(error=>console.log('Owned Windows connection cleanup: '+String(error)));await b?.close();try{await api(a,'server.stop')}catch{}await a.close();}
});
