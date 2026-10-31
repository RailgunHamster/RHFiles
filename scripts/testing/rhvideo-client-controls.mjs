import assert from 'node:assert/strict';
import {rhvideoFixture} from './rhvideo-fixture.mjs';

export function clientControlsFixture(){
 return rhvideoFixture({videoCount:0,galleryVideoCount:0,pictureCount:3,failFavoriteIds:['picture:picture-0'],
  beforeMedia:({path,image})=>image&&path==='/storage/pictures/1.svg'?{body:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><broken'),contentType:'image/svg+xml'}:null,
 });
}
// Same shipped controls and transport on Windows and Android. Server failures
// are confined to this generated fixture; no client handlers are replaced.
export async function exerciseClientControls({page,server,fixture,receipt}){
 const invoke=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify(name)+','+JSON.stringify(args)+')');
 const observe=(name,args)=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify(name)+','+JSON.stringify(args)+').then(value=>({succeeded:true,value}),error=>({succeeded:false,code:error?.code??null,message:String(error?.message??error)}))');
 const control=async(site,id)=>{const row=(await invoke('ui.list')).find(row=>row.kind==='button'&&row.target.id===id&&row.sites.includes(site));assert(row,'Actual visible '+site+' for '+id);return row;};
 receipt.cases=[];
 await invoke('rhvideo.connection.connect',{server,username:'preview',password:'fixture-only'});
 await invoke('rhvideo.category',{kind:'picture'});await invoke('rhvideo.sort',{value:'nameAsc'});
 const args={id:'picture-0',kind:'picture'},semantic=await observe('rhvideo.favorite.toggle',args);
 receipt.semanticFavorite=semantic;
 assert.equal(semantic.succeeded,false);assert.match(semantic.message,/503|favorite|收藏/i);
 const heart=await control('rhvideo.card.favorite','picture-0'),favoriteUI=await observe('ui.invoke',{controlId:heart.controlId});
 receipt.cases.push({action:'card.favorite',semantic,...favoriteUI});
 assert.equal(favoriteUI.succeeded,false,'A failed favorite cannot be a successful UI receipt');
 assert.equal(favoriteUI.code,semantic.code);assert.equal(favoriteUI.message,semantic.message);
 assert.equal(fixture.requests.filter(row=>row.path==='/api/v1/favorites/picture/picture-0').length,2,'Exactly one request per explicit operation, no automatic retry');
 assert.equal(fixture.favorites.has('picture:picture-0'),false);
 const broken={id:'picture-1',kind:'picture'},imageError=await observe('rhvideo.media.open',broken);
 assert.equal(imageError.succeeded,false);assert.match(imageError.message,/图片/);await invoke('rhvideo.image.close');
 for(const site of ['rhvideo.card.open','rhvideo.card.title','rhvideo.card.secondary']){
  const button=await control(site,'picture-1'),result=await observe('ui.invoke',{controlId:button.controlId});
  receipt.cases.push({action:site,semantic:imageError,...result});
  assert.equal(result.succeeded,false,'An undecodable image cannot produce a successful '+site+' receipt');
  assert.equal(result.code,imageError.code);assert.equal(result.message,imageError.message);
  const image=await invoke('rhvideo.image.state');assert.equal(image.loading,false);assert.match(image.error,/图片/);
  await invoke('rhvideo.image.close');
 }
 const valid=await control('rhvideo.card.open','picture-2');assert.equal((await invoke('ui.invoke',{controlId:valid.controlId})).event,'click');
 const image=await invoke('rhvideo.image.state');assert.equal(image.current.id,'picture-2');assert.equal(image.loading,false);assert.equal(image.error,'');
 await invoke('rhvideo.image.close');assert.deepEqual((await invoke('rhvideo.ui.contract')).missing,[]);receipt.passed=true;
}
