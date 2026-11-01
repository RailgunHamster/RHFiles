import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('native grid close offloads blocking decoder teardown but awaits release before closing and publishing completion',()=>{
  const source=fs.readFileSync(new URL('../../src-tauri/src/rhvideo.rs',import.meta.url),'utf8');
  const route=source.slice(source.indexOf('"grid.close" => {'),source.indexOf('"player.fullscreen" => {'));
  const body=source.slice(source.indexOf('async fn finish_grid_close('),source.indexOf('async fn close_grid_scope('));
  for(const [code,ordered]of [[route,['GRID_LOAD.lock().await','check_grid_input(&args)?','finish_grid_close(app,session).await']],[body,['*GRID_QUEUE.lock()','spawn_blocking(crate::rhvideo_player::stop_grid)','.await.map_err','view.close()','start_preview_commit(app,session)?','Ok(json!({"closed":true}))']]]){let previous=-1;for(const item of ordered){const position=code.indexOf(item);assert(position>previous,item+' must remain after the preceding confirmed close stage');previous=position;}}
  assert.doesNotMatch(route+body,/rhvideo_player::stop_grid\(\)/,'Synchronous FFI teardown must not return to an async worker');
  assert.match(body,/host\["kind"\]=="popup"[\s\S]*?view.close\(\)/,'A library close cannot close its containing physical window');
});
