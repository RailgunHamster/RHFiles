import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../../'+name,import.meta.url),'utf8'),player=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/PlaybackActivity.kt');
test('favorite failure details use the published RHVideo mobile command and input guard',async()=>{
 const source=read('src/js/rhvideo-workbench.js').replace(/\r\n/g,'\n'),start=source.indexOf('if (ctx.mobile) {\n        action(\n          "grid.target"'),end=source.indexOf('async function image(media)',start),actions=new Map(),calls=[];assert(start>=0&&end>start);
 const c=vm.createContext({ctx:{mobile:true},action:(name,schema,handler)=>actions.set(name,{schema,handler}),object:(properties={},required=[])=>({properties,required}),native:async(...args)=>calls.push(args)});vm.runInContext(source.slice(start,end),c);const control=actions.get('player.control');assert(control.schema.properties.command.enum.includes('favorite.error'));await control.handler({command:'favorite.error',expectedInputId:17});assert.deepEqual(calls,[['player.control',{command:'favorite.error',expectedInputId:17}]]);
});
test('favorite failure menu opens full read-only details through the guarded command instead of a disabled truncated row',()=>{
 assert.match(player,/menu\.menu\.add\(0,9,4,"收藏失败 · 查看详情"\)/);assert.match(player,/9->rhUiAction\(JSONObject\(\)\.put\("command","favorite\.error"\)\.put\("expectedInputId",rotateInput\)\)/);
 assert.doesNotMatch(player,/menu\.menu\.add\("收藏失败：\$error"\)\.isEnabled=false/);
 const start=player.indexOf('private fun showRhFavoriteError()');assert(start>=0);const body=player.slice(start,player.indexOf('\n  private fun ',start+1));assert.match(body,/favoriteState\("video",currentRhId\(\),w\.generation\)/);assert.match(body,/RhVideoMediaChrome\.errorDetails\(this,error\)/);assert.match(body,/setPositiveButton\("关闭",null\)/);assert.doesNotMatch(body,/toggleFavorite|\.play\(|\.prepare\(|setNegativeButton|重试|取消/);
 const chrome=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/RhVideoMediaChrome.kt');assert.match(chrome,/fun errorDetails\(context:Context,error:String\)/);assert.match(chrome,/setTextIsSelectable\(true\)/);assert.match(player,/rhFavoriteErrorDialog\?\.dismiss\(\);rhFavoriteErrorDialog=null/);
});
