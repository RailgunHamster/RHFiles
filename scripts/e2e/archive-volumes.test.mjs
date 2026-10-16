import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp, until} from '../testing/app-session.mjs';
import {archivePayload, run7z, splitZip} from '../testing/archive-fixtures.mjs';
import {root} from '../testing/source.mjs';

test('split archive context menus extract real volume sets and report incomplete sets', {timeout:180000}, async t => {
  const app=await launchApp();t.after(()=>app.close());
  t.diagnostic('Split archive fixtures and evidence: '+app.directory+'; '+app.artifactDir);
  const invoke=(cmd,args)=>app.evaluate(`call(${JSON.stringify(cmd)},${JSON.stringify(args)})`);
  const payload=archivePayload(), source=path.join(app.directory,'payload.bin');fs.writeFileSync(source,payload);
  const volumes=path.join(app.directory,'volumes');fs.mkdirSync(volumes);
  const seven=path.join(volumes,'资料.7z'), numberedZip=path.join(volumes,'numeric.zip');
  run7z(['a','-t7z','-v4k','-mx=0',seven,source]);
  run7z(['a','-tzip','-v4k','-mx=0',numberedZip,source]);
  const fullZip=path.join(app.directory,'full.zip');run7z(['a','-tzip','-mx=0',fullZip,source]);
  splitZip(fullZip,path.join(volumes,'spanned'));
  const rarFixture=path.join(root,'scripts/testing/fixtures/split-rar');
  for(const name of fs.readdirSync(rarFixture).filter(name=>name.endsWith('.rar'))) {
    fs.copyFileSync(path.join(rarFixture,name),path.join(volumes,name));
    const part=Number(/part(\d+)/.exec(name)[1]);
    fs.copyFileSync(path.join(rarFixture,name),path.join(volumes,part===1?'legacy.rar':'legacy.r'+String(part-2).padStart(2,'0')));
  }
  for(const name of fs.readdirSync(volumes).filter(name=>/^资料\.7z\.\d+$/.test(name))) {
    fs.copyFileSync(path.join(volumes,name),path.join(volumes,'generic.'+name.split('.').pop()));
  }
  await app.evaluate(`navigateTo(${JSON.stringify(volumes)})`);
  const chooseMenu = async (names, isRight=false) => {
    if(isRight) await app.evaluate(`G.dualOn=true; G.rp.path=${JSON.stringify(volumes)}; true`);
    const entries=await invoke('list_dir',{path:volumes});
    const labels=await app.evaluate(`(()=>{const pane=${isRight?'G.rp':'getTab()'};pane.entries=${JSON.stringify(entries)};pane.sel=new Set(pane.entries.map((e,i)=>${JSON.stringify(names)}.includes(e.name)?i:-1).filter(i=>i>=0));if(pane.sel.size!==${names.length})throw Error('Selected fixture missing');showContextMenu(20,20,${isRight});return [...document.querySelectorAll('.context-menu > .ctx-item > span')].map(e=>e.textContent);})()`);
    await app.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const extractLabel=await app.evaluate(`t('ctx.extractHere')`);
    assert.ok(labels.includes(extractLabel),'extraction action must be visible: '+JSON.stringify(labels));
    return labels;
  };
  const clickExtractTo = async (folder) => {
    await app.evaluate(`(()=>{const label=t('ctx.extractTo',{name:${JSON.stringify(folder)}});const row=[...document.querySelectorAll('.context-menu > .ctx-item')].find(e=>e.querySelector(':scope > span')?.textContent===label);if(!row)throw Error('Named extract action is missing: '+label);row.dataset.splitExtract='true';row.scrollIntoView({block:'nearest'});})()`);
    await app.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await app.click('[data-split-extract="true"]');
  };
  for(const [name,folder] of [['资料.7z.002','资料'],['numeric.zip.002','numeric'],['spanned.z01','spanned'],['sample.part03.rar','sample'],['legacy.r00','legacy'],['generic.002','generic']]) {
    await t.test(`right-click ${name} locates the entry and restores exact bytes`, async () => {
      await chooseMenu([name]);
      await clickExtractTo(folder);
      const target=path.join(volumes,folder,'payload.bin');
      try { await until(()=>fs.existsSync(target) && fs.statSync(target).size===payload.length,'complete extracted payload'); }
      catch(error) {await app.screenshot('split-extraction-failure');throw error;}
      assert.deepEqual(fs.readFileSync(target),payload);
    });
  }
  await t.test('opening a later volume browses complete archive contents in its own pane', async () => {
    const selected=path.join(volumes,'资料.7z.002');
    await app.evaluate(`activateEntry({name:'资料.7z.002',path:${JSON.stringify(selected)},extension:'002',is_dir:false},false,0)`);
    const info=await app.evaluate('({path:getTab().archivePath,entries:getTab().archiveEntries})');
    assert.equal(info.path,selected);assert.equal(info.entries.find(e=>e.name==='payload.bin').size,payload.length);
    await app.evaluate('closeArchive(false)');
  });
  await t.test('late extraction completion must not close a newly opened archive', async () => {
    const selected=path.join(volumes,'资料.7z.002'),destination=path.join(app.directory,'late-extraction');
    await app.evaluate(`(()=>{window.__lateCall=call;window.__lateReady=false;window.__lateDone=false;window.__lateError=null;call=async(cmd,args)=>{const result=await __lateCall(cmd,args);if(cmd==='extract_7z'&&args.dest===${JSON.stringify(destination)}){window.__lateReady=true;await new Promise(resolve=>window.__releaseExtraction=resolve);}return result;};extractArchiveTo({name:'资料.7z.002',path:${JSON.stringify(selected)},extension:'002'},${JSON.stringify(destination)}).then(()=>window.__lateDone=true).catch(e=>window.__lateError=String(e));})()`);
    try {
      await until(()=>app.evaluate('window.__lateReady'),'hold completed extraction response');
      await app.evaluate(`activateEntry({name:'资料.7z.002',path:${JSON.stringify(selected)},extension:'002',is_dir:false},false,0)`);
      assert.equal(await app.evaluate('getTab().archivePath'),selected);
      await app.evaluate('window.__releaseExtraction();true');
      await until(()=>app.evaluate('window.__lateDone || window.__lateError'),'late extraction task settled');
      assert.equal(await app.evaluate('window.__lateError'),null);
      assert.equal(await app.evaluate('getTab().archivePath'),selected,'a completed file task cannot navigate the user out of an archive');
      assert.deepEqual(fs.readFileSync(path.join(destination,'payload.bin')),payload);
    } finally {
      await app.evaluate('call=window.__lateCall;window.__releaseExtraction?.();true');
      await app.evaluate('closeArchive(false)');
    }
  });
  await t.test('whole-set selection offers one named destination and one extraction task in the right pane', async () => {
    const names=fs.readdirSync(volumes).filter(name=>/^资料\.7z\.\d+$/.test(name));
    const labels=await chooseMenu(names,true);
    assert.ok(!labels.includes(await app.evaluate("t('ctx.extractEach')")),'one family must not appear as several archives');
    const destination=path.join(app.directory,'deduplicated');
    await app.evaluate(`window.__splitDone=false;window.__splitFailure=null;window.__splitCount=0;window.__splitOriginal=extractArchiveTo;extractArchiveTo=async(...args)=>{window.__splitCount++;return window.__splitOriginal(...args)};extractArchives(${JSON.stringify(names.map(name=>({name,path:path.join(volumes,name),extension:name.split('.').pop(),is_dir:false})))},()=>${JSON.stringify(destination)}).then(()=>window.__splitDone=true).catch(e=>window.__splitFailure=String(e));true`);
    await until(()=>app.evaluate('window.__splitDone || window.__splitFailure'),'deduplicated batch');
    assert.equal(await app.evaluate('window.__splitFailure'),null);
    assert.equal(await app.evaluate('window.__splitCount'),1);
    await app.evaluate('extractArchiveTo=window.__splitOriginal;removeContextMenu();true');
    assert.deepEqual(fs.readFileSync(path.join(destination,'payload.bin')),payload);
  });
  await t.test('encrypted split volumes accept the correct password and reject a wrong one', async () => {
    const encrypted=path.join(volumes,'encrypted.7z');run7z(['a','-t7z','-v4k','-mx=0','-p中文 secret',encrypted,source]);
    const selected=encrypted+'.002';
    const sample=await invoke('archive_encryption_probe',{path:selected});assert.equal(sample,'payload.bin');
    assert.equal(await invoke('verify_archive_password',{path:selected,entry:sample,password:'wrong'}),false);
    assert.equal(await invoke('verify_archive_password',{path:selected,entry:sample,password:'中文 secret'}),true);
    const dest=path.join(app.directory,'decrypted');
    await invoke('extract_7z',{archive:selected,dest,password:'中文 secret',operationId:'split-encrypted',overwrite:'skip'});
    assert.deepEqual(fs.readFileSync(path.join(dest,'payload.bin')),payload);
  });
  await t.test('missing entry volume explains the missing path and does not report success', async () => {
    const missing=path.join(app.directory,'missing.7z.002');fs.writeFileSync(missing,'not a first volume');
    const dest=path.join(app.directory,'missing-output');
    await assert.rejects(invoke('extract_7z',{archive:missing,dest,operationId:'split-missing',overwrite:'skip'}),error=>String(error).includes('missing.7z.001'));
    assert.ok(!fs.existsSync(dest));
  });
  await t.test('missing intermediate volume fails and preserves source parts', async () => {
    const broken=path.join(app.directory,'broken');fs.mkdirSync(broken);
    const names=fs.readdirSync(volumes).filter(name=>/^numeric\.zip\.\d+$/.test(name));
    for(const name of names.filter(name=>!name.endsWith('.002')))fs.copyFileSync(path.join(volumes,name),path.join(broken,name));
    const selected=path.join(broken,'numeric.zip.001'), before=fs.readFileSync(selected);
    await assert.rejects(invoke('extract_archive',{path:selected,dest:path.join(app.directory,'broken-output'),operationId:'split-incomplete',overwrite:'skip'}));
    assert.deepEqual(fs.readFileSync(selected),before);
  });
});
