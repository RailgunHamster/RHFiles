import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8'),trace=read('src-tauri/src/rhvideo_trace.rs'),request=read('src-tauri/src/rhvideo.rs'),channel=read('src-tauri/src/rhvideo_diagnostics.rs');
const part=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a);return source.slice(a,b);};
test('precise Wry observation has a distinct private opt-in and fixed first-play budget',()=>{
 const gate=part(trace,'fn wry_queue_enabled()','pub(crate) fn arm_wry_queue(');assert.match(gate,/queue_permitted\(owned\(\),host_enabled\(\),/);assert(gate.includes('RHFILES_QA_WRY_DISPATCH_TRACE'));
 assert.match(trace,/const WRY_QUEUE_LIMIT:u32=32/);assert.match(trace,/const WRY_QUEUE_WINDOW:Duration=Duration::from_secs\(12\)/);assert.match(trace,/if self\.origin\.is_none\(\)/);assert.match(trace,/now\.checked_duration_since\(self\.origin\?\)/);
 const arm=part(request,'let command_trace=','if let Some(run)=');assert.match(arm,/action=="play"/);assert.match(arm,/#\[cfg\(all\(windows,any\(debug_assertions,feature="rhvideo-host-trace"\)\)\)\]\s*if let Some\(started\)=command_trace\{crate::rhvideo_trace::arm_wry_queue\(started\);\}/);
});
test('only the private library controller can install the observational subclass',()=>{
 const install=part(trace,'pub(crate) fn install_wry_queue_trace(','fn owned()');for(const token of ['window.label()!="window-rhvideo"','!wry_queue_enabled()','with_webview','ParentWindow','GetWindowThreadProcessId','process!=std::process::id()','SetWindowSubclass'])assert(install.includes(token));
 assert.doesNotMatch(install,/FindWindow|EnumWindows|set_focus|show\(|SetForeground|PostMessage|SendMessage/);
 const creation=part(request,'pub(crate) async fn client_window(','fn queue_info()');assert.match(creation,/#\[cfg\(any\(debug_assertions,feature="rhvideo-host-trace"\)\)\]\s*crate::rhvideo_trace::install_wry_queue_trace\(window\)/);
});
test('Wry responder messages are only bracketed and forwarded, never decoded or replaced',()=>{
 const callback=part(trace,'unsafe extern "system" fn wry_queue_proc(','pub(crate) fn install_wry_queue_trace(');assert(callback.includes('Wry::ExecMsg'));assert.match(callback,/DefSubclassProc\(hwnd,message,wparam,lparam\)/);assert.match(callback,/WM_NCDESTROY/);assert.match(callback,/RemoveWindowSubclass/);
 assert.doesNotMatch(callback,/wparam\.0|lparam\.0|Box::from_raw|PostMessage|SendMessage|SetResponse|Complete\(|set_media|set_rate|sleep|await/);
});
test('queue capability exposes bounds and counts without message pointers or request data',()=>{
 const snapshot=part(trace,'pub(crate) fn wry_queue_snapshot()','fn wry_message_started()');for(const key of ['enabled','installed','armed','messages','messageLimit','windowMs','scope'])assert(snapshot.includes('"'+key+'"'));
 assert.doesNotMatch(snapshot,/hwnd|wparam|lparam|uri|nonce|body|headers|password/);assert.match(channel,/"wryQueue":crate::rhvideo_trace::wry_queue_snapshot\(\)/);
});
