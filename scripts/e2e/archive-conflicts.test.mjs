import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp, until} from '../testing/app-session.mjs';
import {archivePayload, run7z} from '../testing/archive-fixtures.mjs';

test('real extraction prompts only for actual conflicting output files and preserves folders', {timeout:180000}, async t=>{
  const app=await launchApp();t.after(()=>app.close());
  t.diagnostic('Archive conflict fixtures and evidence: '+app.directory+'; '+app.artifactDir);
  const invoke=(command,args)=>app.evaluate(`call(${JSON.stringify(command)},${JSON.stringify(args)})`);
  const source=path.join(app.directory,'source'),nested=path.join(source,'nested');fs.mkdirSync(nested,{recursive:true});
  fs.writeFileSync(path.join(source,'root.txt'),'new root');fs.writeFileSync(path.join(nested,'same.txt'),'new nested');
  fs.writeFileSync(path.join(nested,'payload.bin'),archivePayload());
  const zip=path.join(app.directory,'test.zip');run7z(['a','-tzip',zip,path.join(source,'root.txt'),nested]);
  const file=archive=>({name:path.basename(archive),path:archive,extension:archive.split('.').pop(),is_dir:false});
  const start=async(archive,dest,password=null,entryPath=null)=>{
    await app.evaluate(`window.__extractDone=false;window.__extractError=null;extractArchiveTo(${JSON.stringify(file(archive))},${JSON.stringify(dest)},${JSON.stringify(password)},{silent:true,refreshAfter:false,entryPath:${JSON.stringify(entryPath)}}).then(result=>{window.__extractError=result;window.__extractDone=true}).catch(error=>{window.__extractError=String(error);window.__extractDone=true});true`);
  };
  const done=async()=>{await until(()=>app.evaluate('window.__extractDone'),'extraction finished');assert.equal(await app.evaluate('window.__extractError'),null);};
  const dialog=async()=>until(()=>app.evaluate("document.getElementById('conflict-dialog').style.display==='flex'"),'actual conflict dialog');
  const existing=dest=>{
    fs.mkdirSync(path.join(dest,'nested'),{recursive:true});fs.writeFileSync(path.join(dest,'root.txt'),'old root');
    fs.writeFileSync(path.join(dest,'nested/same.txt'),'old nested');fs.writeFileSync(path.join(dest,'nested/keep.txt'),'keep');
  };
  await t.test('right-click Extract Here into a split-volume folder needs no conflict dialog',async()=>{
    const dest=path.join(app.directory,'split');fs.mkdirSync(dest);fs.writeFileSync(path.join(dest,'unrelated.txt'),'keep');
    const archive=path.join(dest,'资料.7z');run7z(['a','-t7z','-v4k','-mx=0',archive,nested]);
    const volumes=fs.readdirSync(dest).filter(name=>name.startsWith('资料.7z.'));
    const originals=new Map(volumes.map(name=>[name,fs.readFileSync(path.join(dest,name))]));
    await app.evaluate(`navigateTo(${JSON.stringify(dest)})`);
    await app.evaluate(`(()=>{const tab=getTab(),i=tab.entries.findIndex(e=>e.name==='资料.7z.002');if(i<0)throw Error('Second volume missing');tab.sel=new Set([i]);showContextMenu(20,20,false);const row=[...document.querySelectorAll('.context-menu > .ctx-item')].find(e=>e.querySelector(':scope > span')?.textContent===t('ctx.extractHere'));if(!row)throw Error('Extract Here missing');row.dataset.extractHere='true';row.scrollIntoView({block:'nearest'});})()`);
    await app.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await app.click('[data-extract-here="true"]');
    await until(()=>fs.existsSync(path.join(dest,'nested/payload.bin')),'Extract Here without false prompt');
    assert.equal(await app.evaluate("document.getElementById('conflict-dialog').style.display==='flex'"),false);
    assert.deepEqual(fs.readFileSync(path.join(dest,'nested/payload.bin')),archivePayload());
    assert.equal(fs.readFileSync(path.join(dest,'unrelated.txt'),'utf8'),'keep');
    for(const [name,bytes] of originals)assert.deepEqual(fs.readFileSync(path.join(dest,name)),bytes);
  });
  for(const choice of ['replace','skip','rename','cancel']) await t.test(`actual nested conflicts: ${choice}`,async()=>{
    const dest=path.join(app.directory,choice);existing(dest);await start(zip,dest);await dialog();
    const plan=await invoke('inspect_archive_extraction',{path:zip,dest,entryPath:null,password:null});
    assert.equal(plan.conflicts.length,2);assert.deepEqual(plan.conflicts.map(e=>e.entryPath.replaceAll('\\','/')).sort(),['nested/same.txt','root.txt']);
    const text=await app.evaluate("document.getElementById('conflict-content').textContent");
    for(const conflict of plan.conflicts){assert.ok(text.includes(conflict.entryPath));assert.ok(text.includes(conflict.targetPath));}
    assert.equal(await app.evaluate("!!document.getElementById('conflict-apply-all')"),false);
    await app.click('#conflict-content details > summary');await app.screenshot('archive-conflicts-'+choice);
    await app.click(`#conflict-content [data-action="${choice}"]`);await done();
    assert.equal(fs.readFileSync(path.join(dest,'nested/keep.txt'),'utf8'),'keep');
    assert.equal(fs.readFileSync(path.join(dest,'root.txt'),'utf8'),choice==='replace'?'new root':'old root');
    assert.equal(fs.readFileSync(path.join(dest,'nested/same.txt'),'utf8'),choice==='replace'?'new nested':'old nested');
    assert.equal(fs.existsSync(path.join(dest,'nested/payload.bin')),choice!=='cancel');
    if(choice==='rename'){
      const renamed=fs.readdirSync(dest).filter(name=>/^root_\d+\.txt$/.test(name));assert.equal(renamed.length,1);
      assert.equal(fs.readFileSync(path.join(dest,renamed[0]),'utf8'),'new root');
      const same=fs.readdirSync(path.join(dest,'nested')).find(name=>/^same_\d+\.txt$/.test(name));assert.ok(same);
      assert.equal(fs.readFileSync(path.join(dest,'nested',same),'utf8'),'new nested');
    }
  });
  await t.test('single-member extraction ignores unrelated conflicting members',async()=>{
    const dest=path.join(app.directory,'member');existing(dest);await start(zip,dest,null,'nested/payload.bin');await done();
    assert.equal(await app.evaluate("document.getElementById('conflict-dialog').style.display==='flex'"),false);
    assert.deepEqual(fs.readFileSync(path.join(dest,'nested/payload.bin')),archivePayload());
    assert.equal(fs.readFileSync(path.join(dest,'root.txt'),'utf8'),'old root');
  });
  await t.test('encrypted headers request a password before detecting real conflicts',async()=>{
    const archive=path.join(app.directory,'encrypted.7z'),dest=path.join(app.directory,'encrypted-output');existing(dest);
    run7z(['a','-t7z','-mhe=on','-p中文 secret',archive,path.join(source,'root.txt')]);await start(archive,dest);
    await until(()=>app.evaluate("!!document.querySelector('dialog input[type=password]')"),'encrypted header password prompt');
    await app.evaluate("document.querySelector('dialog input[type=password]').value='中文 secret';true");
    await app.click('dialog [data-act="ok"]');await dialog();
    await app.click('#conflict-content [data-action="skip"]');await done();
    assert.equal(fs.readFileSync(path.join(dest,'root.txt'),'utf8'),'old root');
  });
  await t.test('backend rechecks changed target types and preserves both files and folders',async()=>{
    const dest=path.join(app.directory,'race');fs.mkdirSync(dest);
    assert.equal((await invoke('inspect_archive_extraction',{path:zip,dest})).conflicts.length,0);
    fs.mkdirSync(path.join(dest,'root.txt'));fs.writeFileSync(path.join(dest,'root.txt/keep.txt'),'keep');
    await assert.rejects(invoke('extract_archive',{path:zip,dest,overwrite:'replace'}),error=>String(error).includes('root.txt'));
    assert.equal(fs.readFileSync(path.join(dest,'root.txt/keep.txt'),'utf8'),'keep');
    assert.equal(fs.existsSync(path.join(dest,'nested')),false);
    const blocked=path.join(app.directory,'blocked');fs.mkdirSync(blocked);fs.writeFileSync(path.join(blocked,'nested'),'block');
    await assert.rejects(invoke('extract_archive',{path:zip,dest:blocked,overwrite:'replace'}));
    assert.equal(fs.readFileSync(path.join(blocked,'nested'),'utf8'),'block');
  });
  await t.test('input archive collisions disable Replace and native overwrite is rejected',async()=>{
    const sourceFile=path.join(source,'self.zip');fs.writeFileSync(sourceFile,'payload named like its own archive');
    const archive=path.join(app.directory,'self.zip');run7z(['a','-tzip',archive,sourceFile]);const bytes=fs.readFileSync(archive);
    await start(archive,app.directory);await dialog();
    assert.equal(await app.evaluate("document.querySelector('#conflict-content [data-action=replace]').disabled"),true);
    await app.click('#conflict-content [data-action="cancel"]');await done();
    await assert.rejects(invoke('extract_archive',{path:archive,dest:app.directory,overwrite:'replace'}));
    assert.deepEqual(fs.readFileSync(archive),bytes);
  });
});
