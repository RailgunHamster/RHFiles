// Runs against the installed APK on an isolated emulator. All files are fixtures.
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {androidSession,until} from './android-session.mjs';

const session=await androidSession(process.env.RHFILES_TEST_EMULATOR,{notifications:true});
const {adb,evaluate}=session;
const root='/storage/emulated/0/Download/rhfiles-rename-'+randomUUID();
const frame="(document.querySelector('.file-pane')?.contentWindow || window)";
const api=(id,args={})=>evaluate(frame+'.RHFilesAPI.invoke('+JSON.stringify(id)+','+JSON.stringify(args)+')');
const native=(id,args={})=>evaluate('api.native('+JSON.stringify(id)+','+JSON.stringify(args)+')');
const waitJob=id=>until(async()=>{
  const j=await native('job.status',{id});
  return !['running','scanning','queued','paused'].includes(j.state) && j;
},'file task finishes');
const files=new Set(['old-one','old-two','keep']);
const moves=[];
let deniedSource;
const dav=http.createServer((req,res)=>{
  if(req.method==='PROPFIND'){
    res.writeHead(207,{'Content-Type':'application/xml'}).end('<d:multistatus xmlns:d="DAV:">'+
      [...files].map(name=>'<d:response><d:href>/dav/'+name+'</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>8</d:getcontentlength></d:prop></d:propstat></d:response>').join('')+'</d:multistatus>');
  }else if(req.method==='MOVE'){
    const name=new URL(req.url,'http://localhost').pathname.split('/').pop(),to=new URL(req.headers.destination).pathname.split('/').pop();
    if(name===deniedSource)return res.writeHead(403).end();
    if(req.headers.overwrite!=='F'||!files.has(name)||files.has(to))return res.writeHead(412).end();
    files.delete(name);files.add(to);moves.push([name,to]);res.writeHead(201).end();
  }else res.writeHead(405).end();
});
let reverse,connectionId;
try {
  adb('shell','mkdir','-p',root+'/old-folder');
  for(const name of ['old-a.txt','old-folder/keep','taken.txt'])adb('shell','touch',root+'/'+name);
  await api('navigation.open',{path:root});
  const paths=[root+'/old-a.txt',root+'/old-folder'];
  await api('selection.set',{paths});
  const inPane=expr=>evaluate('((w,d)=>{'+expr+'})('+frame+','+frame+'.document)');
  await inPane("d.querySelector('[data-action=rename]').click()");
  await until(()=>inPane("return !!d.querySelector('.batch-rename-form')"),'batch rename sheet');
  const type=(index,value)=>inPane("const e=d.querySelectorAll('.batch-field input')["+index+"];e.value="+JSON.stringify(value)+";e.dispatchEvent(new w.Event('input',{bubbles:true}));");
  await type(0,'old-');await type(1,'new-');
  assert.equal(await inPane("return d.querySelectorAll('.batch-preview-row').length"),2);
  await inPane("d.querySelector('.batch-rename-form [type=submit]').click()");
  const localJob=await until(async()=>(await native('jobs')).find(j=>j.op==='batch-rename'&&j.args.changes[0].parent===root),'background job');
  assert.equal((await waitJob(localJob.id)).state,'completed');
  assert.deepEqual(adb('shell','ls','-1',root).split(/\r?\n/).sort(),['new-a.txt','new-folder','taken.txt']);
  assert.equal(adb('shell','ls',root+'/new-folder'),'keep');
  const changes=[['new-folder','another'],['new-a.txt','taken.txt']].map(([oldName,name])=>({parent:root,path:root+'/'+oldName,oldName,name}));
  const conflict=await waitJob(await native('job.start',{op:'batch-rename',args:{changes}}));
  assert.equal(conflict.state,'failed');assert.equal(conflict.done,0);assert.match(conflict.message,/目标已存在/);
  assert.equal(adb('shell','ls',root+'/new-folder'),'keep');
  await new Promise(resolve=>dav.listen(0,'127.0.0.1',resolve));
  reverse=adb('reverse','tcp:0','tcp:'+dav.address().port);
  assert.match(reverse,/^\d+$/);
  connectionId=await native('connection.save',{name:'Batch rename QA',type:'webdav',url:'http://127.0.0.1:'+reverse+'/dav/',insecure:true});
  const remote='remote://'+connectionId+'/';
  await api('navigation.open',{path:remote});
  const args={paths:[remote+'old-one',remote+'old-two'],find:'^old-(.*)',replace:'new-$1',regex:true};
  assert.equal((await api('files.batchRename.preview',args)).error,'');
  const job=await api('files.batchRename.start',args);
  const result=await waitJob(job.jobId);
  assert.equal(result.state,'completed',JSON.stringify(result.failures));
  assert.deepEqual(moves,[['old-one','new-one'],['old-two','new-two']]);
  await api('navigation.refresh');
  deniedSource='new-two';
  const partial=await api('files.batchRename.start',{paths:[remote+'new-one',remote+'new-two'],find:'new',replace:'final'});
  const failed=await waitJob(partial.jobId);
  assert.equal(failed.state,'failed');
  assert.equal(failed.done,1);
  assert.equal(failed.failures[0].path,remote+'new-two');
  assert.match(failed.failures[0].message,/403/);
  assert.deepEqual([...files].sort(),['final-one','keep','new-two']);
  console.log('PASS: selection sheet, file and nonempty folder, conflict before any write, WebDAV regex + two no-overwrite moves, journaled partial failure on HTTP 403.');
}finally{
  try{
    if(connectionId)await native('connection.delete',{id:connectionId});
    if(reverse)adb('reverse','--remove','tcp:'+reverse);
    if(dav.listening)await new Promise(resolve=>dav.close(resolve));
  }finally{session.close();}
}
