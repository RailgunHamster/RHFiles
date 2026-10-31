import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../../src-tauri/'+name,import.meta.url),'utf8');
const cargo=read('Cargo.toml'),lib=read('src/lib.rs'),player=read('src/rhvideo_player.rs'),request=read('src/rhvideo.rs'),trace=read('src/rhvideo_trace.rs'),channel=read('src/rhvideo_diagnostics.rs');
const part=(text,start,end)=>{const begin=text.indexOf(start),finish=text.indexOf(end,begin+start.length);assert(begin>=0&&finish>begin);return text.slice(begin,finish);};
test('optimized host tracing is an explicit nondefault feature, not a production or debug playback mode',()=>{
 assert.match(cargo,/rhvideo-host-trace\s*=\s*\[\s*\]/);assert.doesNotMatch(cargo,/default\s*=\s*\[[^\]]*rhvideo-host-trace/);
 for(const name of ['rhvideo_diagnostics','rhvideo_trace'])assert.match(lib,new RegExp('#\\[cfg\\(all\\(windows,any\\(debug_assertions,feature="rhvideo-host-trace"\\)\\)\\)\\]\\s*mod '+name));
 for(const [start,end]of [['fn diagnostic_logging()','fn network_cache_ms()'],['fn network_cache_ms()','fn trace_open(']])assert.doesNotMatch(part(player,start,end),/rhvideo-host-trace/);
 const enabled=part(trace,'pub(crate) fn enabled()','// Bound both');assert.match(enabled,/cfg!\(debug_assertions\)&&/);
});
test('host producer observations do not enable window hooks, VLC callbacks, or response routing',()=>{
 const hooks=part(player,'pub(crate) fn install_window_trace(','enum ');assert.doesNotMatch(hooks,/rhvideo-host-trace/);
 for(const text of [player,request])for(const line of text.split(/\r?\n/).filter(line=>line.includes('feature="rhvideo-host-trace"')))assert.match(line,/#\[cfg\(/);
 assert.match(player,/#\[cfg\(debug_assertions\)\]\s*if let Some\(trace\)=&player.startup_trace/);
 const body=part(player,'pub(crate) fn diagnostic_trace(','fn bundled_plugin_index(');assert.match(body,/expectedInput/);assert.match(body,/播放输入已改变/);
});
test('trace readback remains nonce-bound, private-profile scoped, bounded and read-only',()=>{
 for(const source of [trace,channel])for(const flag of ['RHFILES_NATIVE_PLAYER_QA','RHFILES_TEST_PROFILE_ROOT','RHFILES_QA_READBACK_NONCE'])assert(source.includes(flag));
 assert.match(channel,/const MAX_LINE:usize=4096/);assert.match(channel,/const MAX_REQUESTS:usize=512/);assert.match(channel,/Only fixed read-only QA operations are allowed/);
 assert.match(trace,/stages\.len\(\)<128/);assert.match(trace,/bounded-process-lifetime/);assert.match(trace,/RHFILES_PLAY_NATIVE_TRACE/);
 assert.doesNotMatch(channel,/TcpListener|UdpSocket|http::|create.*server/i);
 assert.match(channel,/#\[cfg\(not\(debug_assertions\)\)\]\s*\{Err\("Frame readback is disabled in host-only builds"/);
});
test('the exact native request, engine and final return boundaries are measured without delaying replies',()=>{
 assert.match(player,/fn trace_startup\([^]*?#\[cfg\(any\(debug_assertions,feature="rhvideo-host-trace"\)\)\]/);
 assert.match(player,/fn trace_open\([^]*?#\[cfg\(any\(debug_assertions,feature="rhvideo-host-trace"\)\)\]/);
 assert.match(request,/feature="rhvideo-host-trace"\)\)\)\]\s*if let Some\(started\)=command_trace/);
 const stages=part(trace,'pub(crate) fn stage(','pub(crate) fn host_snapshot(');assert.doesNotMatch(stages,/sleep|await|run_on_main_thread|\.emit/);
});
