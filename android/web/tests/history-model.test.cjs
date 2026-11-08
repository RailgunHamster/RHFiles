const test=require('node:test'),assert=require('node:assert/strict'),model=require('../js/history-model.js');
test('all folder transports retain opaque paths and omit passwords and connection configuration',()=>{
  let records=[];
  for(const path of ['/storage/emulated/0/Download','content://documents/tree/primary%3APictures','remote://smb-id/Public/中文','remote://rhfiles-id/D/Movies','remote://sftp-id/home/me','rh://WINSERVER/D/','rhfiles-device://group/device/D/']){
    records=model.visit(records,{screen:'folder',path,password:'do-not-save',token:'do-not-save'},'位置',path,1000+records.length);
    assert.equal(records[0].path,path);assert.equal(records[0].route.path,path);
  }
  assert.equal(records.length,7);assert(!JSON.stringify(records).includes('do-not-save'));
});
test('revisiting moves one location to the front and retains shortcut or category boundaries',()=>{
  let records=model.visit([],{screen:'folder',path:'/Download',boundary:'/Download',boundaryLabel:'下载'},'下载','下载',1000);
  records=model.visit(records,{screen:'folder',path:'/Pictures'},'图片','图片',2000);
  records=model.visit(records,{screen:'folder',path:'/Download',boundary:'/Download',boundaryLabel:'下载'},'下载','下载',3000);
  assert.equal(records.length,2);assert.equal(records[0].path,'/Download');assert.equal(records[0].route.boundary,'/Download');
  records=model.visit(records,{screen:'library',category:'image',folder:'/Pictures'},'图片分类','图片',4000);
  assert.equal(records[0].route.category,'image');assert.equal(records[0].route.folder,'/Pictures');
});
test('history is bounded, rejects executable URLs and credential URLs, and tolerates corrupt data',()=>{
  let records=[];for(let i=0;i<250;i++)records=model.visit(records,{screen:'folder',path:'/folder/'+i},String(i),'本机',i+1);
  assert.equal(records.length,model.limit);assert.equal(records[0].path,'/folder/249');
  for(const path of ['javascript:alert(1)','https://user:secret@example.test/','remote://user:secret@host/share','/bad\u0000path'])assert.equal(model.visit([],{screen:'folder',path},'bad','bad',1).length,0);
  assert.deepEqual(model.clean([null,{},'wrong',{route:{screen:'folder',path:'/valid'},visitedAt:Number.MAX_SAFE_INTEGER}]),[]);
  assert.deepEqual(model.clean(null),[]);
});
