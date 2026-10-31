import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../src-tauri/src/rhvideo_player.rs',import.meta.url),'utf8');
test('native asynchronous surface cleanup carries its creation generation, never a bare WM_CLOSE',()=>{
 const calls=[...source.matchAll(/PostMessageW\(([^;]+)\);/g)].map(match=>match[1]);assert.equal(calls.length,1);assert(calls[0].includes('WPARAM(self.generation)'));assert(calls[0].includes('LPARAM(std::process::id() as isize)'));assert(!calls[0].includes('WM_CLOSE'));assert.match(source,/RegisterWindowMessageW\(w!\("RHFiles.NativeVideoSurface.Close.v1"\)\)/);
 const start=source.indexOf('if CLOSE_SURFACE.get().is_some_and('),end=source.indexOf('// Child canvases',start);assert(start>0&&end>start);const receiver=source.slice(start,end);assert.match(receiver,/admits\(GetWindowLongPtrW\(hwnd,GWLP_USERDATA\) as usize,wparam\.0,std::process::id\(\) as usize,lparam\.0 as usize\)/);assert(receiver.indexOf('admits(')<receiver.indexOf('DestroyWindow('));
 assert.match(source,/if message==WM_CLOSE\{return LRESULT\(0\);\}/);assert.match(source,/if message==WM_NCDESTROY\{SetWindowLongPtrW\(hwnd,GWLP_USERDATA,0\)/);
});
test('surface identities survive decoder rotation and all constructor handoffs',()=>{
 assert.match(source,/new_with_rotation\(self\.surface,angle\)/);assert.match(source,/let surface = engine\.surface;\s*drop\(engine\);\s*surface\.close\(\)/);
 assert.match(source,/struct SurfaceGuard\(Vec<Surface>\)/);assert.match(source,/let mut children = SurfaceGuard\(Vec::new\(\)\)/);assert.match(source,/if let Err\(Ok\(surfaces\)\)=tx.send\(result\)\{drop\(SurfaceGuard\(surfaces\)\);\}/);
 assert.match(source,/if let Err\(Ok\(surface\)\)=tx.send\(result\)\{if created\{surface.close\(\);\}\}/);
});
