import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const request=fs.readFileSync(new URL('../../src-tauri/src/rhvideo.rs',import.meta.url),'utf8');
const player=fs.readFileSync(new URL('../../src-tauri/src/rhvideo_player.rs',import.meta.url),'utf8');
const branch=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)+start.length));
test('close and back fence prior preparations before waiting on the playback lock, after input validation',()=>{
  const body=branch(request,'"player.close" | "player.back" => {','"player.closeParent"=>{');
  const ordered=['check_input(&args)?','session.play_preparation.cancel()','PLAY_LOCK.lock().await'];
  let previous=-1;for(const token of ordered){const at=body.indexOf(token);assert(at>previous,token);previous=at;}
  assert.match(body,/rhvideo_player::close_single\(\)\.await\?/);
  assert.match(player,/spawn_blocking\(stop_single\)\.await[\s\S]*?finish_preload_shutdown\(\)\.await/);
});
test('new playback captures an account-owned fence before any playback lock wait',()=>{
  const session=branch(request,'struct Session {','#[derive(Clone,Copy)]');
  assert.match(session,/play_preparation:\s*play_intent::Epoch/);
  const body=request.slice(request.indexOf('let session = current()?;',request.indexOf('"connect" => {')));
  assert.match(body,/let preparation=session\.play_preparation\.capture\(\)/);
  assert(body.indexOf('let preparation=session.play_preparation.capture()')<body.indexOf('PLAY_LOCK.lock().await'));
});
test('an account change while close waits cannot stop the replacement account',()=>{
  const body=branch(request,'"player.close" | "player.back" => {','"player.closeParent"=>{');
  const guarded=body.indexOf('GENERATION.load(Ordering::SeqCst)!=closing_generation');
  assert(guarded>body.indexOf('PLAY_LOCK.lock().await'));
  assert(guarded<body.indexOf('flush_playback()'));
  assert(guarded<body.indexOf('rhvideo_player::close_single().await'));
});
for(const [name,start,end] of [['open','"play" => {','"player.repeatCurrent"'],['navigate','"player.next" | "player.previous" | "player.seekQueue" | "player.seekParent" => {','"player.options" => {'],['options','"player.options" => {','"player.diagnosticFrame"']])test(name+' rejects a retired queued preparation before changing playback',()=>{
  const body=branch(request,start,end),locked=body.indexOf('PLAY_LOCK.lock().await');assert(locked>=0);
  assert.match(body.slice(locked,locked+105),/preparation\.ensure_current\(\)\?/);
});
test('decoder construction and input opening use the captured fence, not a refreshed ticket',()=>{
  const body=player.slice(player.indexOf('pub async fn play('),player.indexOf('pub fn repeat_from('));
  assert.match(body,/preparation:crate::rhvideo::play_intent::Preparation/);
  assert.match(body,/Ok\(engine\) => \{worker_preparation\.ensure_current\(\)\?/);
  assert.match(body,/worker_preparation\.ensure_current\(\)\?;\s*engine\.open\(/);
  assert.match(body,/preparation\.ensure_current\(\)\?;\s*warmed\.open\(/);
  assert.doesNotMatch(body,/play_preparation\.capture/);
});
