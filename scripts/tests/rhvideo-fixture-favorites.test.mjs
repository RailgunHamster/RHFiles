import test from'node:test';import assert from'node:assert/strict';import{rhvideoFixture}from'../testing/rhvideo-fixture.mjs';
test('favorite fixture follows the real server newest-favorite ordering and timestamps rather than media-kind order',async()=>{
 const fixture=await rhvideoFixture({videoCount:1,pictureCount:1}),request=async(path,method='GET')=>{const result=await fetch(fixture.url+'/api/v1/'+path,{method,headers:{Authorization:'Bearer fixture-bearer-do-not-persist'}});assert.equal(result.status,200);return result.json();};
 try{
  await request('favorites/video/video-0','PUT');await request('favorites/picture/picture-0','PUT');let items=(await request('favorites')).items;assert.deepEqual(items.map(item=>item.type),['picture','video']);assert(items.every(item=>Number.isFinite(Date.parse(item.favorited_at))));const original=items[1].favorited_at;
  await request('favorites/video/video-0','PUT');items=(await request('favorites')).items;assert.equal(items[0].type,'picture','An idempotent PUT cannot pretend an existing favorite was newly created');assert.equal(items[1].favorited_at,original);
  await request('favorites/video/video-0','DELETE');await request('favorites/video/video-0','PUT');assert.equal((await request('favorites')).items[0].type,'video');
  fixture.favorites.add('novel:novel-0');assert.deepEqual((await request('favorites/ids')).novel_ids,['novel-0']);
 }finally{await fixture.close();}
});
