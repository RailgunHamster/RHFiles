import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {deferred} from '../testing/source.mjs';
const require=createRequire(import.meta.url),D=require('../../src/js/rhvideo-duplicates.js');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const member=(n,kind='picture')=>({id:String(n),key:kind+':'+n,media_type:kind,filename:'中文 '+n,preview_url:`/api/v1/duplicates/preview/${kind}/${n}?v=${'ab'.repeat(32)}`,size:100,resolution:'1600x1000',busy:false,stale:false});
const group=(n=1,members=Array.from({length:4},(_,n)=>member(n)))=>({id:id(n),scan_id:id(100),media_type:members[0].media_type,member_count:members.length,similarity:99.8,stale:false,members:{items:members,total:members.length,page:1,pages:1}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({before,groups=[group()],pageCount=1}={}){
  const actions=new Map(),schemas=new Map(),risks=new Map(),calls=[];
  const server={scan:null,reviews:[]};let serial=1000,changed=0;
  const controller=D.install({processId:'owned-test-process',requestId:()=>id(serial++),ready:async()=>{},mediaChanged:async()=>{changed++;},
    action:(name,schema,handler,risk)=>{actions.set(name,handler);schemas.set(name,schema);risks.set(name,risk);},object:(properties={},required=[])=>({properties,required}),
    native:async(command,args)=>{
      calls.push({command,...structuredClone(args)});
      if(before){const value=await before(command,args,server);if(value!==undefined)return structuredClone(value);}
      switch(args.name){
        case 'duplicates.status':return structuredClone(server);
        case 'duplicates.groups':return {items:structuredClone(groups),page:args.query.page,pages:pageCount,total:groups.length};
        case 'duplicates.scan':server.scan={id:id(200),status:'queued',can_cancel:true,progress:{done:0,total:4}};return structuredClone(server.scan);
        case 'duplicates.cancel':server.scan={...server.scan,cancel_requested:true};return structuredClone(server.scan);
        case 'duplicates.confirm':{const job={id:id(300),group_id:args.body.group_id,keeper_key:args.body.keeper_key,status:'queued',total:3,done:0,failed:0};server.reviews=[job];return structuredClone(job);}
        case 'duplicates.review':return {...structuredClone(server.reviews[0]),items:[{key:'picture:1',filename:'测试',status:'done'}],page:args.query.page,pages:2};
        default:throw Error('Unexpected native operation '+args.name);
      }
    }});
  const invoke=(name,args={})=>actions.get('duplicates.'+name)(args);
  const state=()=>invoke('state');
  const target=(key='picture:0')=>({groupId:id(1),key,expectedRevision:state().revision});
  const keep=()=>invoke('keep',target());
  const confirm=()=>invoke('confirm',{groupId:id(1),keeperKey:'picture:0',scanId:id(100),expectedRevision:state().revision});
  return {controller,invoke,state,target,keep,confirm,calls,server,schemas,risks,changed:()=>changed};
}

test('read-only opening uses bounded groups and does not start a scan or review',async()=>{
  const f=fixture();await f.invoke('open');assert.equal(f.state().opened,true);assert.equal(f.state().groups.length,1);
  assert.deepEqual(f.calls.map(call=>call.name),['duplicates.status','duplicates.groups']);
  assert.deepEqual(f.calls[1].query,{kind:'all',page:1,limit:6});assert.equal(f.risks.get('duplicates.confirm'),'destructive');
  assert.deepEqual(JSON.parse(JSON.stringify(f.state())),f.state());
});
test('confirmation sends the exact selected keeper and scan only after explicit selection',async()=>{
  const f=fixture();await f.invoke('open');await assert.rejects(f.confirm(),/保留项/);await f.keep();
  const job=await f.confirm();assert.equal(job.keeper_key,'picture:0');await flush();
  const writes=f.calls.filter(call=>call.name==='duplicates.confirm');assert.equal(writes.length,1);
  assert.equal(writes[0].confirmation,'RHVIDEO:duplicates.confirm');assert.deepEqual(writes[0].body,{request_id:id(1000),group_id:id(1),scan_id:id(100),keeper_key:'picture:0'});
  assert.equal(f.state().choices[id(1)],undefined);
});
test('stale revision, stale groups and unloaded keepers never reach a destructive operation',async()=>{
  const f=fixture();await f.invoke('open');await assert.rejects(async()=>f.invoke('keep',{...f.target(),expectedRevision:'old-process:0:1'}),/改变/);
  await assert.rejects(async()=>f.invoke('keep',f.target('picture:unknown')),/先加载/);
  const g=group();g.stale=true;const stale=fixture({groups:[g]});await stale.invoke('open');await assert.rejects(stale.confirm(),/过期/);
  assert.equal([...f.calls,...stale.calls].filter(call=>call.name==='duplicates.confirm').length,0);
});
test('uncertain failed writes are not replayed and require a new explicit keeper selection',async()=>{
  let fail=true;const f=fixture({before:(_command,args)=>{if(args.name==='duplicates.confirm'&&fail){fail=false;throw Error('owned response lost');}}});
  await f.invoke('open');await f.keep();await assert.rejects(f.confirm(),/不会自动重发/);await flush();
  assert.equal(f.calls.filter(call=>call.name==='duplicates.confirm').length,1);assert.equal(f.state().busy,false);assert.match(f.state().error,/response lost/);
  await assert.rejects(f.confirm(),/保留项/);assert.equal(f.calls.filter(call=>call.name==='duplicates.confirm').length,1);
  await f.keep();await f.confirm();const posts=f.calls.filter(call=>call.name==='duplicates.confirm');assert.equal(posts.length,2);assert.notEqual(posts[0].body.request_id,posts[1].body.request_id);
});
test('one in-flight write rejects duplicate clicks instead of issuing two requests',async()=>{
  const wait=deferred(),f=fixture({before:(_command,args)=>args.name==='duplicates.confirm'?wait.promise:undefined});await f.invoke('open');await f.keep();
  const first=f.confirm();await flush();await assert.rejects(f.confirm(),/正在处理/);assert.equal(f.calls.filter(call=>call.name==='duplicates.confirm').length,1);
  wait.resolve({id:id(300),group_id:id(1),keeper_key:'picture:0',status:'queued',total:3,done:0,failed:0});await first;
});
test('a confirmed job stays on the server while closing, without hidden client polling',async()=>{
  const wait=deferred(),f=fixture({before:(_command,args)=>args.name==='duplicates.confirm'?wait.promise:undefined});await f.invoke('open');await f.keep();
  const write=f.confirm();await flush();await f.invoke('close');const count=f.calls.length;
  wait.resolve({id:id(300),group_id:id(1),keeper_key:'picture:0',status:'queued',total:3,done:0,failed:0});await write;await flush();
  assert.equal(f.state().opened,false);assert.equal(f.calls.length,count);assert.equal(f.state().reviews[0].id,id(300));
});
test('account changes discard old read and write results without touching the next account',async()=>{
  const wait=deferred(),f=fixture({before:(_command,args)=>args.name==='duplicates.groups'?wait.promise:undefined});const opening=f.invoke('open');await flush();f.controller.reset();
  wait.resolve({items:[group()],total:1,page:1,pages:1});await assert.rejects(opening,/账户已改变/);assert.equal(f.state().groups.length,0);assert.equal(f.state().busy,false);
  const writeWait=deferred(),w=fixture({before:(_command,args)=>args.name==='duplicates.confirm'?writeWait.promise:undefined});await w.invoke('open');await w.keep();const writing=w.confirm();await flush();w.controller.reset();
  writeWait.resolve({id:id(300),group_id:id(1),keeper_key:'picture:0',status:'queued',total:3,done:0,failed:0});await assert.rejects(writing,/账户已改变/);assert.equal(w.state().reviews.length,0);assert.equal(w.state().error,'');
});
test('same group identifier with a new scan invalidates the old choice (ABA guard)',async()=>{
  const groups=[group()],f=fixture({groups});await f.invoke('open');await f.keep();const old=f.state().revision;
  groups[0].scan_id=id(101);await f.invoke('refresh');assert.notEqual(f.state().revision,old);assert.equal(f.state().choices[id(1)],undefined);
  await assert.rejects(f.invoke('confirm',{groupId:id(1),scanId:id(100),keeperKey:'picture:0',expectedRevision:old}),/改变/);
  assert.equal(f.calls.filter(call=>call.name==='duplicates.confirm').length,0);
});
test('a choice on another group page is retained but not blindly applied to a new scan',async()=>{
  const first=group(),second=group(2);const f=fixture({pageCount:2,before:(_command,args)=>args.name==='duplicates.groups'?{items:[args.query.page===1?first:second],page:args.query.page,pages:2,total:2}:undefined});
  await f.invoke('open');await f.keep();await f.invoke('page',{page:2});assert.equal(f.state().choices[id(1)],'picture:0');await f.invoke('page',{page:1});assert.equal(f.state().choices[id(1)],'picture:0');
});
test('members pagination deduplicates initial rows, retains loaded rows on unchanged refresh and rejects looping pages',async()=>{
  const g=group();g.member_count=14;g.members.total=14;let repeat=false;
  const f=fixture({groups:[g],before:(_command,args)=>args.name==='duplicates.members'?{items:Array.from({length:12},(_,n)=>member(n)),total:14,page:repeat?1:args.query.page,pages:2}:undefined});
  await f.invoke('open');await f.invoke('more',{groupId:id(1),expectedRevision:f.state().revision});assert.equal(f.state().groups[0].members.items.length,12);
  await f.invoke('refresh');assert.equal(f.state().groups[0].members.items.length,12);
  repeat=true;await assert.rejects(f.invoke('more',{groupId:id(1),expectedRevision:f.state().revision}),/分页没有返回/);
});
test('scan and cancellation obey active jobs and server-provided permission',async()=>{
  const f=fixture();await f.invoke('open');await f.invoke('scan');await flush();assert.equal(f.state().scan.id,id(200));
  await assert.rejects(f.invoke('scan'),/尚未结束/);await assert.rejects(f.invoke('cancelScan',{id:id(201)}),/改变/);
  await f.invoke('cancelScan',{id:id(200)});assert.equal(f.state().scan.cancel_requested,true);assert.equal(f.calls.filter(call=>call.name==='duplicates.cancel').length,1);
});
test('an old backend is reported explicitly and cannot receive an unprepared scan',async()=>{
  const f=fixture({before:(_command,args)=>{if(args.name==='duplicates.status')throw Error('HTTP 404');}});
  await assert.rejects(f.invoke('open'),/更新 RHVideo 后端/);assert.equal(f.state().supported,false);
  await assert.rejects(f.invoke('scan'),/先读取/);assert.equal(f.calls.filter(call=>call.name==='duplicates.scan').length,0);
});
test('successful manual recovery clears an old read error rather than continuing to claim failure',async()=>{
  let fail=true;const f=fixture({before:(_command,args)=>{if(args.name==='duplicates.status'&&fail)throw Error('temporary network failure');}});
  await assert.rejects(f.invoke('open'),/temporary/);fail=false;await f.invoke('refresh');assert.equal(f.state().error,'');assert.equal(f.state().supported,true);
});
test('completed or partially failed reviews refresh media once and expose real per-item results',async()=>{
  const f=fixture();await f.invoke('open');await f.keep();await f.confirm();await flush();f.server.reviews[0]={...f.server.reviews[0],status:'partial',done:2,failed:1};
  await f.invoke('refresh');assert.equal(f.changed(),1);await f.invoke('refresh');assert.equal(f.changed(),1);
  const detail=await f.invoke('review',{id:id(300),page:2});assert.equal(detail.page,2);assert.equal(f.state().review.page,2);assert.equal(detail.items[0].status,'done');
});
test('preview source validation never accepts URLs, path traversal, other kinds or extra query parameters',()=>{
  assert.equal(D.previewPath(member(1)),member(1).preview_url);
  for(const url of ['https://evil.invalid/a','/api/v1/auth/me','/api/v1/duplicates/preview/picture/1?token=secret','/api/v1/duplicates/preview/picture/1?v='+('ab'.repeat(32))+'&url=evil'])assert.throws(()=>D.previewPath({...member(1),preview_url:url}),/预览地址/);
  assert.throws(()=>D.previewPath({...member(1),key:'video:1'}),/成员标识/);
  const bad=group();bad.members.items.push({...bad.members.items[0]});assert.throws(()=>D.validatePage({items:[bad],page:1,pages:1,total:1},true),/成员列表/);
});
