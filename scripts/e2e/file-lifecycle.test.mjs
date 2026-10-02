import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchApp,until} from '../testing/app-session.mjs';
import {validateReport} from '../testing/report.mjs';

test('real file-manager business workflows in an isolated RHFiles instance',{timeout:180000},async t=>{
  const app=await launchApp();const results=[];t.after(()=>app.close());
  const invoke=(cmd,args={})=>app.evaluate(`call(${JSON.stringify(cmd)},${JSON.stringify(args)})`);
  const source=path.join(app.directory,'source'),dest=path.join(app.directory,'destination');
  fs.mkdirSync(source);fs.mkdirSync(dest);fs.mkdirSync(path.join(source,'empty'));
  const file=path.join(source,'中文 #1%.txt'),bytes=Buffer.from('完整字节校验\r\nRHFiles\0binary-tail');fs.writeFileSync(file,bytes);
  fs.writeFileSync(path.join(source,'file2.json'),'{}');fs.writeFileSync(path.join(source,'file10.json'),'{}');
  async function step(name,fn){
    let error;
    await t.test(name,async()=>{try{await fn();results.push({name,status:'PASS'});}catch(e){error=e;results.push({name,status:'FAIL',error:String(e)});throw e;}});
    const report={passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,skipped:0,total:results.length,results};
    fs.writeFileSync(path.join(app.artifactDir,'business-results.json'),JSON.stringify(report,null,2));
    if(error){await app.screenshot('failure').catch(()=>{});throw error;}
  }
  await step('first window-state save in a fresh profile can be loaded again',async()=>{
    const id=await invoke('get_window_label');await invoke('delete_window_state',{windowId:id});
    await invoke('save_current_window_geometry',{stateJson:'{"test":"fresh"}'});
    const saved=await invoke('load_window_state',{windowId:id});
    assert.equal(saved.sort_order,0);assert.equal(saved.state_json,'{"test":"fresh"}');
  });
  await step('address bar file URI opens parent and selects the literal Unicode filename',async()=>{
    assert.equal(await app.evaluate(`navigateAddressInput(${JSON.stringify(pathToFileURL(file).href)},false)`),true);
    const state=await app.evaluate('({path:getTab().path,selected:[...getTab().sel].map(i=>getTab().entries[i].path)})');
    assert.equal(state.path,source);assert.deepEqual(state.selected,[file]);
  });
  await step('changing sort and view mode preserves the selected file',async()=>{
    for(const layout of ['details','cards','thumbnails']){
      const selected=await app.evaluate(`setLayout(${JSON.stringify(layout)});sortBy('modified');sortBy('name');[...getTab().sel].map(i=>getTab().entries[i].path)`);
      assert.deepEqual(selected,[file]);
    }
    await app.evaluate("setLayout('details')");
  });
  await step('create folder, rename, copy tree and move tree preserve disk content',async()=>{
    const made=await invoke('new_folder',{parent:source});assert.ok(fs.statSync(made).isDirectory());
    await invoke('rename_file',{path:made,newName:'新建目录'});const folder=path.join(source,'新建目录');
    fs.writeFileSync(path.join(folder,'payload'),bytes);
    const copy=path.join(dest,'copy'),moved=path.join(dest,'moved');
    await invoke('copy_path_exact',{src:folder,dest:copy});assert.deepEqual(fs.readFileSync(path.join(copy,'payload')),bytes);
    await invoke('move_path_exact',{src:copy,dest:moved});assert.equal(fs.existsSync(copy),false);assert.deepEqual(fs.readFileSync(path.join(moved,'payload')),bytes);
    assert.deepEqual(fs.readFileSync(path.join(folder,'payload')),bytes);
  });
  await step('real IPC rejects conflicting rename without overwriting either file',async()=>{
    const a=path.join(dest,'a.txt'),b=path.join(dest,'b.txt');fs.writeFileSync(a,'A');fs.writeFileSync(b,'B');
    await assert.rejects(()=>invoke('rename_file',{path:a,newName:'b.txt'}));assert.equal(fs.readFileSync(a,'utf8'),'A');assert.equal(fs.readFileSync(b,'utf8'),'B');
  });
  await step('file drag hovers another tab, switches to it, asks copy/move and copies exact bytes',async()=>{
    await app.evaluate(`addTab(${JSON.stringify(dest)},false)`);
    await until(()=>app.evaluate(`getTab().path===${JSON.stringify(dest)} && getTab()._loaded`),'destination tab');
    const destinationTab=await app.evaluate('G.activeTab');
    await app.evaluate(`addTab(${JSON.stringify(source)},false)`);
    await until(()=>app.evaluate(`getTab().path===${JSON.stringify(source)} && getTab()._loaded`),'source tab');
    const sourceSelector=await app.evaluate(`(()=>{const index=getTab().entries.findIndex(e=>e.path===${JSON.stringify(file)});if(index<0)throw Error('Missing source');return '#file-list .file-row[data-index="'+index+'"] .row-fname';})()`);
    await app.drag(sourceSelector,`.tab[data-tab-id="${destinationTab}"]`,'#file-list');
    await until(()=>app.evaluate("!!document.querySelector('.app-file-drop-overlay')"),'copy/move dialog');
    assert.equal(await app.evaluate('G.activeTab'),destinationTab);
    await app.click('.app-file-drop-overlay .dialog-actions button:nth-child(2)');
    await until(()=>fs.existsSync(path.join(dest,path.basename(file))),'copied drag payload');
    assert.deepEqual(fs.readFileSync(path.join(dest,path.basename(file))),bytes);assert.deepEqual(fs.readFileSync(file),bytes);
  });
  await step('ZIP creation and extraction through the native commands preserves members',async()=>{
    if(!await invoke('is_7z_available'))throw Error('7-Zip required for this E2E case (install 7-Zip; do not count this as a pass)');
    const zip=path.join(app.directory,'bundle.zip'),out=path.join(app.directory,'extracted');
    await invoke('create_archive',{sources:[source],dest:zip});
    const entries=await invoke('list_archive',{path:zip});assert.ok(entries.some(e=>e.path.replaceAll('\\','/').endsWith('source/中文 #1%.txt')));
    await invoke('extract_archive',{path:zip,dest:out,entryPath:null,password:null,operationId:'e2e-extract',overwrite:'skip'});
    assert.deepEqual(fs.readFileSync(path.join(out,'source',path.basename(file))),bytes);assert.ok(fs.statSync(path.join(out,'source/empty')).isDirectory());
  });
  await step('permanent delete can be cancelled at either confirmation before deleting multiple fixtures',async()=>{
    const a=path.join(dest,'a.txt'),b=path.join(dest,'b.txt');await app.evaluate(`navigateTo(${JSON.stringify(dest)})`);
    await app.evaluate(`getTab().sel=new Set(getTab().entries.map((e,i)=>[e,i]).filter(([e])=>${JSON.stringify([a,b])}.includes(e.path)).map(([,i])=>i));window.__deleteTest=deleteSelectedPermanently(false);true`);
    await until(()=>app.evaluate("!!document.querySelector('.app-confirm-overlay')"),'first deletion confirmation');
    await app.click('.app-confirm-overlay .dialog-actions button:first-child');await app.evaluate('window.__deleteTest');
    assert.ok(fs.existsSync(a)&&fs.existsSync(b));
    await app.evaluate('window.__deleteTest=deleteSelectedPermanently(false);true');
    await until(()=>app.evaluate("!!document.querySelector('.app-confirm-overlay')"),'first confirmation after cancel');
    await app.click('.app-confirm-overlay .dialog-actions button:last-child');
    await until(()=>app.evaluate("!!document.querySelector('.app-confirm-overlay')"),'second deletion confirmation');
    assert.ok(fs.existsSync(a)&&fs.existsSync(b));await app.click('.app-confirm-overlay .dialog-actions button:first-child');await app.evaluate('window.__deleteTest');
    assert.ok(fs.existsSync(a)&&fs.existsSync(b));
    await app.evaluate('window.__deleteTest=deleteSelectedPermanently(false);true');
    await until(()=>app.evaluate("!!document.querySelector('.app-confirm-overlay')"),'repeat first confirmation');
    await app.click('.app-confirm-overlay .dialog-actions button:last-child');
    await until(()=>app.evaluate("!!document.querySelector('.app-confirm-overlay')"),'repeat second confirmation');
    await app.click('.app-confirm-overlay .dialog-actions button:last-child');await app.evaluate('window.__deleteTest');
    assert.equal(fs.existsSync(a),false);assert.equal(fs.existsSync(b),false);assert.ok(fs.existsSync(file));
  });
  validateReport({passed:results.length,failed:0,skipped:0,total:results.length,results},{minimum:8});
  t.diagnostic('Isolated fixtures and evidence: '+app.directory+'; '+app.artifactDir);
});
