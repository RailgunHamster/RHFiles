import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';

test('New File translates the whole dialog and identifies every template by type',{timeout:60000},async t=>{
  const app=await launchApp({emulateFocus:true});
  t.after(()=>app.close());
  await app.evaluate(`(async()=>{
    setLang('zh');
    G.settings.iconMode='system';
    await RHFilesAPI.invoke('navigation.open',{path:${JSON.stringify(app.directory)}});
    await showNewFileDialog(false);
  })()`);
  const dialog=()=>app.evaluate(`(()=>{
    const box=document.querySelector('#newfile-dialog');
    const text=selector=>box.querySelector(selector).textContent;
    return {
      title:text('.dialog-title'),name:text('label'),
      buttons:[...box.querySelectorAll('.dialog-actions button')].map(button=>button.textContent),
      rows:[...box.querySelectorAll('.newfile-template')].map(row=>{
        const svg=row.querySelector('.nft-icon svg'),rect=svg?.getBoundingClientRect();
        return {name:row.querySelector('.nft-name').textContent,ext:row.querySelector('.nft-extension')?.textContent,
          width:rect?.width,height:rect?.height,icon:svg?.innerHTML,mark:svg?.querySelector('text')?.textContent,system:!!row.querySelector('.system-icon-host')};
      }),
    };
  })()`);
  const zh=await dialog();
  assert.deepEqual([zh.title,zh.name,zh.buttons],['新建文件','文件名：',['取消','创建']]);
  assert.deepEqual(zh.rows.map(row=>row.ext),['.txt','.md','.html','.css','.js','.py','.rs','.json','.xml','.yaml','.sh','.bat']);
  assert.equal(zh.rows.find(row=>row.ext==='.json').name,'JSON 文件');
  assert.ok(zh.rows.every(row=>row.name&&!row.name.startsWith('template.')&&row.width===20&&row.height===20&&!row.system));
  assert.equal(new Set(zh.rows.map(row=>row.icon)).size,zh.rows.length);
  for(const [extension,mark] of [['.html','</>'],['.css','#'],['.js','JS'],['.json','{}']]){
    assert.equal(zh.rows.find(row=>row.ext===extension).mark,mark);
  }
  await app.screenshot('new-file-zh');
  await app.evaluate("setLang('en')");
  const en=await dialog();
  assert.deepEqual([en.title,en.name,en.buttons],['New File','File name:',['Cancel','Create']]);
  assert.equal(en.rows.find(row=>row.ext==='.json').name,'JSON File');
  await app.click(`#newfile-templates .newfile-template[data-idx="${zh.rows.findIndex(row=>row.ext==='.json')}"]`);
  assert.equal(await app.evaluate("document.querySelector('#newfile-templates [aria-pressed=true] .nft-extension').textContent"),'.json');
  await app.evaluate("document.querySelector('#newfile-name').value='created.json'");
  await app.click('#newfile-dialog .dialog-actions .primary');
  const created=path.join(app.directory,'created.json');
  await until(()=>fs.existsSync(created),'create the selected JSON template');
  assert.deepEqual(JSON.parse(fs.readFileSync(created,'utf8')),{});
});
