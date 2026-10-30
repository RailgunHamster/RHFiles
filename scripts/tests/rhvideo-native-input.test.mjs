import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../src-tauri/src/rhvideo.rs',import.meta.url),'utf8');
const start=source.indexOf('async fn diagnostic_library_key('),end=source.indexOf('#[tauri::command]',start),adapter=source.slice(start,end);
test('the real-key QA adapter is absent from release and cannot inject arbitrary keys',()=>{
  assert(start>0&&end>start);
  assert.match(source.slice(start-48,start),/#\[cfg\(all\(windows,debug_assertions\)\)\]/);
  assert.match(adapter,/RHFILES_NATIVE_PLAYER_QA/);assert.match(adapter,/Some\("Home"\)=>0x24,Some\("End"\)=>0x23,_=>return Err/);
  assert.match(source,/#\[cfg\(all\(windows,debug_assertions\)\)\]\s*"diagnostics\.libraryKey"/);
});
test('real-key injection requires the already-focused owned library, no held modifiers and a single bounded submission',()=>{
  for(const marker of ['get_webview_window("window-rhvideo")','GetForegroundWindow()','IsChild(hwnd,focused)','GetAsyncKeyState'])assert(adapter.indexOf(marker)>=0&&adapter.indexOf(marker)<adapter.indexOf('SendInput(&events'));
  assert.match(adapter,/if sent!=2\{/);assert.match(adapter,/dwFlags:flags\|KEYEVENTF_KEYUP/);
  assert.equal((adapter.match(/SendInput\(&events,/g)||[]).length,1);
  assert.match(adapter,/if sent==1\{unsafe\{SendInput\(&events\[1\.\.\]/,'A partial DOWN can only be released, never pressed again');
  assert.match(adapter,/MapVirtualKeyW\(key as u32,MAPVK_VK_TO_VSC_EX\)/);assert.match(adapter,/KEYEVENTF_SCANCODE/);
  assert.doesNotMatch(adapter,/set_focus|SetForegroundWindow|AttachThreadInput|MoveFocus|sleep|retry/);
});
test('negative focus testing can only activate the main window of an already-foreground QA process',()=>{
  const start=source.indexOf('async fn diagnostic_activate_main('),end=source.indexOf('#[cfg(all(windows,debug_assertions))]',start),focus=source.slice(start,end);
  assert.match(source.slice(start-48,start),/#\[cfg\(all\(windows,debug_assertions\)\)\]/);
  assert.match(focus,/RHFILES_NATIVE_PLAYER_QA/);assert.match(focus,/GetForegroundWindow/);assert.match(focus,/webview_windows\(\)\.values\(\)\.any/);
  assert.match(focus,/get_webview_window\("main"\)/);assert.doesNotMatch(focus,/SendInput|args\[|\.build\(/);
  const test=fs.readFileSync(new URL('../e2e/rhvideo-slideshow.test.mjs',import.meta.url),'utf8');
  assert(test.indexOf('diagnostics.activateMain')>test.indexOf('both native navigation key down/up pairs'));
});
