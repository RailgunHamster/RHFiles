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
 assert.deepEqual((await invoke('rhvideo.ui.contract')).missing,[]);receipt.passed=true;
}
