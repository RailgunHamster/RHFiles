// Real native directory enumeration + WebView2 pointer events and text preview.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {launchApp,until} from './testing/app-session.mjs';
const app=await launchApp();
try{
  const folder=path.join(app.directory,'files');fs.mkdirSync(folder);
  for(const name of ['a.txt','b.txt'])fs.writeFileSync(path.join(folder,name),'Unique preview '+name);
  const nested=path.join(folder,'nested');fs.mkdirSync(nested);fs.writeFileSync(path.join(nested,'child.txt'),'Unique nested child');
  await app.evaluate(`navigateTo(${JSON.stringify(folder)})`);
  const click=async(selector,button='left')=>{
    const point=await app.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing '+${JSON.stringify(selector)});const r=el.getBoundingClientRect();return {x:r.x+Math.min(70,r.width/2),y:r.y+r.height/2}})()`);
    await app.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await app.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button,buttons:button==='right'?2:1,clickCount:1});
    await app.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button,clickCount:1});
  };
  const rightClick=selector=>click(selector,'right');
  const assertPreview=async name=>until(()=>app.evaluate(`document.getElementById('preview-file-name').textContent===${JSON.stringify(name)} && document.getElementById('preview-content').textContent.includes(${JSON.stringify(name==='child.txt'?'Unique nested child':'Unique preview '+name)})`),'preview '+name);
  for(const layout of ['details','cards','thumbnails','columns']){
    console.log('Testing layout',layout);
    await app.evaluate(`G.layout=${JSON.stringify(layout)};getTab().sel.clear();renderFiles(getTab(),'file-list','status-count','status-selection',false);setPreviewPaneVisible(true,false);true`);
    const index=await app.evaluate('Object.fromEntries(getTab().entries.map((e,i)=>[e.name,i]))');
    const selector=name=>`#file-list [data-index="${index[name]}"]`;
    await click(selector('a.txt'));
    try{await assertPreview('a.txt');}catch(error){console.error(await app.evaluate("({layout:G.layout,pane:G.lastActivePane,preview:G.previewOn,inspector:G.inspectorTab,selection:getSelectedPaths(),header:document.getElementById('preview-file-name').textContent,body:document.getElementById('preview-content').textContent})"));throw error;}
    await rightClick(selector('b.txt'));await assertPreview('b.txt');await app.evaluate('removeContextMenu()');
    if(layout==='columns'){
      await click(selector('nested'));await until(()=>app.evaluate("!!document.querySelector('.column-col:nth-child(2) .column-item')"),'nested column');
      await rightClick('.column-col:nth-child(2) .column-item');await assertPreview('child.txt');
      assert.equal(await app.evaluate('getSelectedPaths()[0].path'),path.join(nested,'child.txt'));await app.evaluate('removeContextMenu()');
    }
  }
  await app.evaluate(`G.layout='details';toggleDualPane(true);rpNavigateTo(${JSON.stringify(folder)})`);
  await app.evaluate('setPreviewPaneVisible(true,false)');
  await rightClick('#right-file-list [data-index="2"]');
  await until(()=>app.evaluate("G.lastActivePane==='right' && document.getElementById('preview-file-name').textContent===getSelectedPaths(true)[0]?.name"),'right pane preview');
  await app.screenshot('context-preview');
  console.log(JSON.stringify({pass:true,layouts:4,nestedColumn:true,rightPane:true,artifacts:app.artifactDir}));
}finally{app.close();}
