import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('native grid close offloads blocking decoder teardown but awaits release before closing and publishing completion',()=>{
  const source=fs.readFileSync(new URL('../../src-tauri/src/rhvideo.rs',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('"grid.close" => {'),source.indexOf('"player.fullscreen" => {'));
  const ordered=['check_grid_input(&args)?','*GRID_QUEUE.lock()','spawn_blocking(crate::rhvideo_player::stop_grid)','.await.map_err','w.close()','start_preview_commit(app,session)?','return Ok(json!({"closed":true}))'];
  let previous=-1;for(const item of ordered){const position=body.indexOf(item);assert(position>previous,item+' must remain after the preceding confirmed close stage');previous=position;}
  assert.doesNotMatch(body,/rhvideo_player::stop_grid\(\)/,'Synchronous FFI teardown must not return to an async worker');
});
