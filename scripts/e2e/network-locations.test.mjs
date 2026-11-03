import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {launchApp,until} from '../testing/app-session.mjs';
import {root} from '../testing/source.mjs';

test('real saved FTP/SFTP/WebDAV locations list, create, copy, rename, reject overwrite and delete only disposable fixtures',async()=>{
  const app=await launchApp({emulateFocus:true});let fixture,fixtureErrors='';
  try{
    const remote=path.join(app.directory,'protocol-server'),local=path.join(app.directory,'local-fixtures');fs.mkdirSync(remote);fs.mkdirSync(local);
    fs.writeFileSync(path.join(remote,'中文 a & b.txt'),'owned-server-content');fs.mkdirSync(path.join(remote,'existing-folder'));fs.writeFileSync(path.join(remote,'existing-folder','keep.txt'),'do not replace');
    const python=process.env.RHFILES_PROTOCOL_TEST_PYTHON||path.join(root,'test-artifacts/protocol-test-venv/Scripts/python.exe');
    if(!fs.existsSync(python))throw Error('Provision protocol-test-venv with paramiko and pyftpdlib (or RHFILES_PROTOCOL_TEST_PYTHON)');
    fixture=spawn(python,['scripts/testing/protocol-fixtures.py',remote],{cwd:root,windowsHide:true});let output='',errors='';fixture.stdout.on('data',d=>output+=d);fixture.stderr.on('data',d=>{errors+=d;fixtureErrors+=d;});
    const ports=await until(()=>{if(fixture.exitCode!==null)throw Error('Fixture exited: '+errors);try{return JSON.parse(output.trim().split('\n')[0]);}catch{return null;}},'loopback protocol fixtures');
    const invoke=(name,args={})=>app.evaluate(`RHFilesAPI.invoke(${JSON.stringify(name)},${JSON.stringify(args)})`);
    const native=(action,args={})=>app.evaluate(`call('network_location',{action:${JSON.stringify(action)},args:${JSON.stringify(args)}})`);
    const reports=[];
    for(const type of ['ftp','sftp','webdav']){
      const config={type,name:'Owned QA '+type,username:'rhfiles-qa',...(type==='webdav'?{url:`http://127.0.0.1:${ports.webdav}/dav/`,insecure:true}:{host:'127.0.0.1',port:ports[type],...(type==='ftp'?{insecure:true}:{})})};
      const fingerprint=type==='sftp'?(await invoke('networkLocations.probe',{config})).fingerprint:undefined;
      if(type==='sftp'){
        // Repeated fresh, read-only handshakes catch the intermittent WinCNG DH
        // regression. No reconnect retries and no writes until all probes pass.
        for(let handshake=0;handshake<64;handshake++)assert.equal((await invoke('networkLocations.probe',{config})).fingerprint,fingerprint);
      }
      const {id}=await invoke('networkLocations.save',{config,password:'owned-fixture-only',...(fingerprint?{fingerprint}:{})});
      const profile=(await invoke('networkLocations.list')).profiles.find(p=>p.id===id);assert.equal(profile.hasPassword,true);assert(!JSON.stringify(profile).includes('owned-fixture-only'));
      const call=(operation,p='/',extra={})=>native('fs',{id,operation,path:p,...extra});
      const entries=await call('list');assert(entries.some(p=>p.name==='中文 a & b.txt'));
      await invoke('networkLocations.open',{id,newTab:true});assert.equal((await invoke('navigation.state')).path,`remote://${id}/`);
      const content=Buffer.concat([Buffer.from('upload-'+type+'\r\nline\n'),Buffer.from([0,255,26,13,10,128])]);
      const source=path.join(local,type+'.txt');fs.writeFileSync(source,content);
      const folder='/qa-'+type;await call('mkdir',folder);await call('upload',folder+'/uploaded.txt',{localPath:source});
      const out=path.join(local,type+'-downloaded.txt');await call('download',folder+'/uploaded.txt',{localPath:out});assert.deepEqual(fs.readFileSync(out),content);
      await call('rename',folder+'/uploaded.txt',{newName:'renamed.txt'});
      await assert.rejects(call('upload',folder+'/renamed.txt',{localPath:source}));assert.deepEqual(fs.readFileSync(path.join(remote,'qa-'+type,'renamed.txt')),content);
      const listing=await app.evaluate(`call('list_dir',{path:${JSON.stringify(`remote://${id}${folder}`)}})`);assert.deepEqual(listing.map(e=>e.name),['renamed.txt']);
      await call('delete',folder+'/renamed.txt',{isDir:false});await call('delete',folder,{isDir:true});
      if(type==='sftp'){
        await invoke('networkLocations.save',{id,config,password:'owned-fixture-only',fingerprint:'SHA256:WRONG'});await assert.rejects(call('list'),/ssh_host_key_changed/);
        await invoke('networkLocations.save',{id,config,password:'owned-fixture-only',fingerprint});
      }
      const bad={...config,...(type==='webdav'?{url:`http://127.0.0.1:${ports.webdav}/dav/changed/`}:{host:'localhost'})};
      await invoke('networkLocations.save',{id,config:bad});assert.equal((await invoke('networkLocations.list')).profiles.find(p=>p.id===id).hasPassword,false);
      reports.push({type,passed:true});
    }
    assert.equal(fs.readFileSync(path.join(remote,'existing-folder','keep.txt'),'utf8'),'do not replace');
    await invoke('networkLocations.show');assert.equal(await app.evaluate('!!document.querySelector("#network-locations-dialog [role=dialog]")'),true);
    await app.screenshot('network-locations');fs.writeFileSync(path.join(app.artifactDir,'protocol-results.json'),JSON.stringify(reports,null,2));
  }finally{fs.writeFileSync(path.join(app.artifactDir,'owned-protocol-fixture.log'),fixtureErrors);fixture?.stdin.end();fixture?.kill();await app.close();}
});
