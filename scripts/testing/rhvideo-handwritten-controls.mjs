import assert from 'node:assert/strict';
// Shared actual UI/API flow. Only the caller's generated private fixture is used.
export async function exerciseHandwrittenControls({page,server,receipt}){
 const invoke=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify(name)+','+JSON.stringify(args)+')');
 const observe=(name,args)=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify(name)+','+JSON.stringify(args)+').then(value=>({succeeded:true,value}),error=>({succeeded:false,code:error.code,message:error.message}))');
 receipt.cases=[];await invoke('rhvideo.connection.connect',{server,username:'preview',password:'fixture-only'});await invoke('rhvideo.category',{kind:'novel'});
 for(const [action,id]of [['novel.previewSearch','wb-excerpt-search'],['reader.search','wb-chapter-search']]){
  if(action==='novel.previewSearch')await invoke('rhvideo.novel.preview',{id:'novel-0',offset:0});else await invoke('rhvideo.media.open',{kind:'novel',id:'novel-0'});
  const control=(await invoke('ui.list')).find(row=>row.id===id);assert(control,'Actual visible search '+id);const value='长'.repeat(257),semantic=await observe('rhvideo.'+action,{query:value});assert.equal(semantic.succeeded,false);assert.match(semantic.message,/query/);
  const result=await observe('ui.set',{controlId:control.controlId,value});receipt.cases.push({action,semantic,...result});assert.equal(result.succeeded,false,'UI must not turn its rejected '+action+' into success');assert.equal(result.code,semantic.code);assert.equal(result.message,semantic.message);assert.equal((await invoke('ui.set',{controlId:control.controlId,value:'山'})).updated,true);
  if(action==='novel.previewSearch')await invoke('rhvideo.panel.close',{id:'wb-preview'});
 }
 await invoke('rhvideo.settings.open');
 const font=(await invoke('ui.list')).find(row=>row.sites.includes('rhvideo.workbench.settings.readerFont'));assert(font,'Actual font-size settings control');
 const invalidFont=await observe('rhvideo.preferences.set',{key:'readerFont',value:1}),fontUI=await observe('ui.set',{controlId:font.controlId,value:'1'});
 receipt.cases.push({action:'settings.readerFont',semantic:invalidFont,...fontUI});assert.equal(invalidFont.succeeded,false);assert.equal(fontUI.succeeded,false);assert.equal(fontUI.code,invalidFont.code);assert.equal(fontUI.message,invalidFont.message);
 assert.equal((await invoke('ui.set',{controlId:font.controlId,value:'20'})).updated,true);assert.equal((await invoke('rhvideo.preferences.state')).readerFont,20);
 await invoke('rhvideo.shortcuts.open');
 const shortcut=(await invoke('ui.list')).find(row=>row.sites.includes('rhvideo.workbench.shortcut.viewer.next'));assert(shortcut,'Actual viewer shortcut control');
 const invalidShortcut=await observe('rhvideo.shortcuts.set',{scope:'viewer',command:'next',combo:'not-a-shortcut'}),shortcutUI=await observe('ui.set',{controlId:shortcut.controlId,value:'not-a-shortcut'});
 receipt.cases.push({action:'shortcut.viewer.next',semantic:invalidShortcut,...shortcutUI});assert.equal(invalidShortcut.succeeded,false);assert.equal(shortcutUI.succeeded,false);assert.equal(shortcutUI.code,invalidShortcut.code);assert.equal(shortcutUI.message,invalidShortcut.message);
 assert.equal((await invoke('ui.set',{controlId:shortcut.controlId,value:'KeyJ'})).updated,true);assert.equal((await invoke('rhvideo.preferences.state')).shortcuts.viewer.next,'KeyJ');await invoke('rhvideo.panel.close',{id:'wb-settings'});
 assert.deepEqual((await invoke('rhvideo.ui.contract')).missing,[]);receipt.passed=true;
}
