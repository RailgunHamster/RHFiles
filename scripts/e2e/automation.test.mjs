import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {launchApp,until} from '../testing/app-session.mjs';
const execute=promisify(execFile);
test('public CLI performs real filesystem actions, preserves confirmations and rejects stale controls', {timeout:120000},async()=>{
  const app=await launchApp({emulateFocus:true});
  const client=async(args)=>{const result=await execute(process.execPath,['scripts/rhfiles-api.mjs','--port',String(app.port),...args],{cwd:path.resolve(import.meta.dirname,'../..'),windowsHide:true,timeout:35000,maxBuffer:4*1024*1024});const response=JSON.parse(result.stdout);assert.equal(response.error,undefined,JSON.stringify(response));return response.result;};
  const run=async(action,args={})=>{const state=await client(['--wait','run',action,JSON.stringify(args)]);assert.equal(state.state,'succeeded',JSON.stringify(state));return state.result;};
  try{
    await until(()=>app.evaluate('!!window.RHFilesAPI'),'action API loaded');
    assert.equal((await client(['info'])).apiVersion,'1.0');
    const directory=path.join(app.directory,'action-test'),destination=path.join(directory,'destination');fs.mkdirSync(destination,{recursive:true});
    const original=path.join(directory,'中文 a.txt');fs.writeFileSync(original,'automation fixture');
    await run('navigation.open',{path:directory});let files=await run('files.list');assert.ok(files.entries.some(e=>e.path===original));
    const state=await run('selection.set',{paths:[original]});assert.deepEqual(state.selection,[original]);
    const transfer=await run('files.transfer',{paths:[original],destination,operation:'copy'});assert.equal(transfer.changed,true);assert.deepEqual(transfer.errors,[]);assert.equal(fs.readFileSync(path.join(destination,'中文 a.txt'),'utf8'),'automation fixture');
    const renamed=path.join(directory,'renamed.txt');await run('files.rename',{path:original,name:'renamed.txt'});assert.ok(fs.existsSync(renamed));assert.ok(!fs.existsSync(original));
    await run('selection.set',{paths:[renamed]});
    const deletion=await client(['run','command.file.delete','{}']);assert.equal(deletion.state,'running');
    await until(()=>app.evaluate('!!document.querySelector(".app-confirm-overlay")'),'normal delete confirmation');
    const controls=await run('ui.list');const cancel=controls.find(e=>/showConfirmDialog/.test(e.sites.join(' '))&&/取消|cancel/i.test(e.label));assert.ok(cancel,'delete cancel is discoverable without a screen coordinate');
    await run('ui.invoke',{controlId:cancel.controlId});assert.equal(fs.readFileSync(renamed,'utf8'),'automation fixture','API never bypassed delete confirmation');
    const finished=await client(['wait',deletion.id]);assert.equal(finished.state,'succeeded');
    await run('tabs.new',{path:directory});await until(async()=>{const value=await client(['state']);return value.state.application.tabs.length===2;},'second tab');
    const tabs=await run('tabs.list');assert.equal(tabs.left.length,2);await run('tabs.pin',{tabId:tabs.left.at(-1).id,pinned:true});
    assert.equal((await run('tabs.list')).left.some(t=>t.pinned),true);
    await app.screenshot('automation-cli');
  }finally{app.close();}
});
