import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../src-tauri/src/rhvideo_player.rs',import.meta.url),'utf8');
test('fresh-surface state follows canvas history across decoder replacement, not an input-id reset',()=>{
 assert.match(source,/surface_history:crate::rhvideo::player_host::SurfaceHistory/);
 assert.match(source,/surface_history:Default::default\(\)/);
 const rotation=source.slice(source.indexOf('fn replace_rotation_renderer('),source.indexOf('fn configure_rotation('));assert.match(rotation,/next\.surface_history=self\.surface_history/);
 const open=source.slice(source.indexOf('fn open(&mut self,'),source.indexOf('fn state(&self)')),recorded=open.indexOf('self.surface_history.begin_input()'),identity=open.indexOf('self.input_id=INPUT_SEQUENCE');assert(recorded>=0&&identity>recorded);
 assert.match(source,/value\["freshSurfaceInput"\]=json!\(self\.surface_history\.fresh_input\(\)\)/);
});
test('native asynchronous surface cleanup carries its creation generation, never a bare WM_CLOSE',()=>{
 const calls=[...source.matchAll(/PostMessageW\(([^;]+)\);/g)].map(match=>match[1]);assert.equal(calls.length,1);assert(calls[0].includes('WPARAM(self.generation)'));assert(calls[0].includes('LPARAM(std::process::id() as isize)'));assert(!calls[0].includes('WM_CLOSE'));assert.match(source,/RegisterWindowMessageW\(w!\("RHFiles.NativeVideoSurface.Close.v1"\)\)/);
 const start=source.indexOf('if CLOSE_SURFACE.get().is_some_and('),end=source.indexOf('// Child canvases',start);assert(start>0&&end>start);const receiver=source.slice(start,end);assert.match(receiver,/admits\(GetWindowLongPtrW\(hwnd,GWLP_USERDATA\) as usize,wparam\.0,std::process::id\(\) as usize,lparam\.0 as usize\)/);assert(receiver.indexOf('admits(')<receiver.indexOf('DestroyWindow('));
 assert.match(source,/if message==WM_CLOSE\{return LRESULT\(0\);\}/);
 const destroyStart=source.indexOf('if message==WM_NCDESTROY{',source.indexOf('unsafe extern "system" fn surface_proc('));
 const destroyEnd=source.indexOf('\n        if message==',destroyStart);assert(destroyStart>=0&&destroyEnd>destroyStart);
 const destroy=source.slice(destroyStart,destroyEnd);
 assert.match(destroy,/KillTimer\(Some\(hwnd\),REPAINT_TIMER\)/);
 assert.match(destroy,/paints\.remove\(&\(hwnd\.0 as usize,GetWindowLongPtrW\(hwnd,GWLP_USERDATA\) as usize\)\)/);
 assert.match(destroy,/SetWindowLongPtrW\(hwnd,GWLP_USERDATA,0\)/);
 assert(destroy.indexOf('paints.remove(')<destroy.indexOf('SetWindowLongPtrW('),'remove the generation-bound retry before clearing its identity');
});
test('surface identities survive decoder rotation and all constructor handoffs',()=>{
 assert.match(source,/new_with_rotation\(self\.surface,angle\)/);assert.match(source,/let surface = engine\.surface;\s*drop\(engine\);\s*surface\.close\(\)/);
 assert.match(source,/struct SurfaceGuard\(Vec<Surface>\)/);assert.match(source,/let mut children = SurfaceGuard\(Vec::new\(\)\)/);assert.match(source,/if let Err\(Ok\(surfaces\)\)=tx.send\(result\)\{drop\(SurfaceGuard\(surfaces\)\);\}/);
 assert.match(source,/if let Err\(Ok\(surface\)\)=tx.send\(result\)\{if created\{surface.close\(\);\}\}/);
});
