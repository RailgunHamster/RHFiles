import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const player=fs.readFileSync(new URL('../../src-tauri/src/rhvideo_player.rs',import.meta.url),'utf8'),request=fs.readFileSync(new URL('../../src-tauri/src/rhvideo.rs',import.meta.url),'utf8');
const section=(source,start,end)=>{const at=source.indexOf(start),last=source.indexOf(end,at+start.length);assert(at>=0&&last>at);return source.slice(at,last);};
test('preload identity is reserved synchronously before the task is spawned',()=>{
 const body=section(player,'pub fn queue_preload(','async fn preload(');
 assert(body.indexOf('preparation.ensure_current()?')<body.indexOf('slot.reserve('));
 assert(body.indexOf('slot.reserve(')<body.indexOf('tauri::async_runtime::spawn('));
 assert.match(body,/jobs\.len\(\)>=64/);assert.match(body,/jobs\.push\(\(ticket,handle\)\)/);
});
test('a late worker cannot allocate a fresh identity or clear a successor',()=>{
 const body=section(player,'async fn preload(','fn presentation_matches(');
 assert.match(body,/ticket:warm_state::Ticket/);assert.match(body,/slot\.admit\(ticket\)/);
 assert.doesNotMatch(body,/clear_preload\(\)|WARM_EPOCH|\.reserve\(/);
 assert.doesNotMatch(player,/static WARM_STATUS|static WARM_EPOCH/);
});
test('preload status, ready ownership and input consumption share one slot lock',()=>{
 assert.match(player,/Mutex<warm_state::Slot<Engine,Value>>/);
 assert.match(player,/slot\.publish\(ticket,value\)/);assert.match(player,/slot\.store\(ticket,engine,value/);
 const body=section(player,'pub async fn play(','pub fn repeat_from(');
 assert.match(body,/\.retire\(json!\(\{"state":"idle"\}\)\)/);assert.match(body,/was_current\s*&&\s*warmed\.url == url/);
});
test('preload construction checks the original ticket before opening media',()=>{
 const body=section(player,'async fn preload(','fn presentation_matches(');
 assert.match(body,/SurfaceGuard\(vec!\[child\]\)/);assert.match(body,/require_preload\(ticket,&worker_preparation\)\?;\s*engine\.open\(/);
 assert.match(body,/worker_preparation=preparation\.clone\(\)/);assert.match(body,/release_preload\(engine\)\.await\?/);
});
test('confirmed close waits for the tracked preload workers and their actual release',()=>{
 const body=section(player,'pub async fn close_single(','pub fn retire_window(');
 assert.match(body,/spawn_blocking\(stop_single\)\.await/);assert.match(body,/finish_preload_shutdown\(\)\.await/);
 assert.match(player,/for \(_,job\) in jobs\{if job\.await/);assert.doesNotMatch(body,/\.abort\(|\.detach\(/);
});
test('all dispatch preload scheduling retains the original account preparation',()=>{
 const body=section(request,'fn schedule_preload(','fn native_preferences(');
 assert.match(body,/preparation:&play_intent::Preparation/);assert.match(body,/queue_preload\(app,url,title,rotation,preparation\.clone\(\)\)/);
 assert.doesNotMatch(body,/async_runtime::spawn/);
 const explicit=section(request,'"player.preload" => {','"presentation.open" => {');
 assert(explicit.indexOf('play_preparation.capture()')<explicit.indexOf('PLAY_LOCK.lock().await'));
 assert.match(explicit,/preparation.ensure_current\(\)\?/);
});
test('preload diagnostics count the worker lifetime, including awaited release, and reap failures rather than leaving loading forever',()=>{
 assert.match(player,/struct ActivePreload;/);assert.match(player,/impl Drop for ActivePreload/);
 const body=section(player,'pub fn queue_preload(','async fn preload(');
 assert(body.indexOf('ActivePreload::new()')<body.indexOf('tauri::async_runtime::spawn('));assert.match(body,/let _activity=activity/);
 assert.match(player,/value\["activeTasks"\]=json!\(WARM_ACTIVE.load/);
 assert.match(player,/Some\(Err\(_\)\)=>\{publish_preload\(\*ticket/);
});
