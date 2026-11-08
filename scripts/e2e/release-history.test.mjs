import test from 'node:test';import assert from 'node:assert/strict';
import {launchApp,until} from '../testing/app-session.mjs';
test('native settings show ten recent records and bounded, independent older pages',async()=>{
  const app=await launchApp();
  try{
    await app.evaluate("RHFilesAPI.invoke('settings.open',{section:'updates'})");
    await app.evaluate(`++_releaseHistoryRequestToken;renderReleaseHistory({source:'bundled',currentVersion:'0.1.112',releases:Array.from({length:103},(_,i)=>({version:'0.1.'+(999-i),publishedAt:'2026-11-01',notesMarkdown:'## entry-'+i}))});true`);
    const state=()=>app.evaluate(`({recent:[...document.querySelectorAll('#settings-release-recent details')].map(d=>Number(d.dataset.releaseIndex)),older:[...document.querySelectorAll('#settings-release-older details')].map(d=>Number(d.dataset.releaseIndex)),page:document.querySelector('.settings-history-pagination output').textContent,loaded:document.querySelectorAll('details[data-loaded=true]').length,firstOpen:document.querySelector('#settings-release-recent details').open})`);
    let s=await state();assert.deepEqual(s.recent,Array.from({length:10},(_,i)=>i));assert.deepEqual(s.older,Array.from({length:10},(_,i)=>i+10));assert.equal(s.page,'1/10');assert.equal(s.loaded,1);
    await app.evaluate("document.querySelector('#settings-release-recent details').open=false;document.getElementById('settings-history-next').focus();document.getElementById('settings-history-next').click();true");
    s=await state();assert.equal(s.page,'2/10');assert.equal(s.firstOpen,false);assert.deepEqual(s.older,Array.from({length:10},(_,i)=>i+20));
    await app.evaluate("document.querySelector('#settings-release-older details').open=true;true");
    await until(()=>app.evaluate("document.querySelector('#settings-release-older details').dataset.loaded==='true'"),'lazy older note');
    assert.match(await app.evaluate("document.querySelector('#settings-release-older .settings-release-notes').textContent"),/entry-20/);
    const last=await app.evaluate("RHFilesAPI.invoke('updates.history.page.set',{page:10})");assert.equal(last.page,10);
    s=await state();assert.deepEqual(s.older,[100,101,102]);assert.equal(s.page,'10/10');assert.equal(s.firstOpen,false);
    assert.equal(await app.evaluate("document.getElementById('settings-history-next').disabled"),true);
    await assert.rejects(app.evaluate("RHFilesAPI.invoke('updates.history.page.set',{page:0})"));
    assert.equal((await app.evaluate("RHFilesAPI.invoke('updates.history.state')")).page,10);
  }finally{await app.close();}
});
