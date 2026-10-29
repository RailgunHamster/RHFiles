import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8');

test('unknown Android acceptance modes fail before SDK access or installing any APK',()=>{
  const runner=fileURLToPath(new URL('../testing/rhvideo-android.mjs',import.meta.url));
  for(const mode of ['grid-rotaton','exports-recover','__proto__','grid;adb']){
    const result=spawnSync(process.execPath,[runner,'emulator-5584','missing-product.apk','missing-probe.apk',mode],{encoding:'utf8',windowsHide:true,timeout:10000});
    assert.equal(result.status,1);assert.match(result.stderr,/Unknown owned Android acceptance mode/);assert.equal(result.stdout,'');
  }
});
test('native acceptance permits only the two explicitly owned QA AVD names',()=>{
  const runner=fs.readFileSync(new URL('../testing/rhvideo-android.mjs',import.meta.url),'utf8'),node=parse(runner,{ecmaVersion:'latest',sourceType:'module'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='verifyOwnedAvdName');
  assert(node);const verify=vm.runInNewContext('('+runner.slice(node.start,node.end)+')',{assert});
  verify('RHFilesRhVideoQA20261027\r\nOK\r\n');verify('RHFilesRhVideoQA20261030Audio\nOK\n');
  for(const name of ['','Moto','RHFilesQA','RHFilesRhVideoQA20261030Audio-copy','arbitrary-emulator'])assert.throws(()=>verify(name));
  assert.match(runner,/assert\.equal\(run\(\['shell','getprop','ro\.kernel\.qemu'\]\)\.trim\(\),'1','Physical devices are not allowed'\)/);
});

test('physical player-button acceptance reveals controls with one native gesture, not a delayed background-WebView acknowledgement',()=>{
  const click=source.slice(source.indexOf('private void touchPlayerButton('),source.indexOf('private void revealPlayerControlsByTouch(')).replace(/^\s*\/\/.*$/gm,'');
  const reveal=source.slice(source.indexOf('private void revealPlayerControlsByTouch('),source.indexOf('private void clickPlayerText(')).replace(/^\s*\/\/.*$/gm,'');
  assert.match(click,/revealPlayerControlsByTouch\(\)/);assert.doesNotMatch(click,/action\(|controls\.show|performClick\(/);
  assert.match(reveal,/getGlobalVisibleRect/);assert.match(reveal,/hasWindowFocus/);assert.match(reveal,/getAlpha/);
  assert.equal([...reveal.matchAll(/sendPointerSync\(down\)/g)].length,1);assert.equal([...reveal.matchAll(/sendPointerSync\(up\)/g)].length,1);
  assert.doesNotMatch(reveal,/controllerShowTimeoutMs\s*=|\.performClick\(|while\s*\(/);
});

test('a cold first-click acceptance precedes unrelated image checks while its gallery is intentionally held',()=>{
  assert.match(source,/if\("single"\.equals\(args\.getString\("mode"\)\)\)\{checkReferenceSingle\(\);checkImageContent\(\);checkContextControls\(\);checkFavoriteSlideshow\(\);/);
});

test('grid star and mark acceptance uses actual guarded touches rather than native.ui.invoke',()=>{
  const touch=source.slice(source.indexOf('private void clickNativeLabel('),source.indexOf('private JSONObject waitGridFavorite('));
  assert.doesNotMatch(touch,/native\.ui\.invoke|performClick\(/);for(const guard of ['hasWindowFocus','getAlpha','getGlobalVisibleRect','getLocationOnScreen','getWindowToken'])assert(touch.includes(guard),guard);
  assert.equal([...touch.matchAll(/sendPointerSync\(down\)/g)].length,1);assert.equal([...touch.matchAll(/sendPointerSync\(up\)/g)].length,1);
});
test('rotation acceptance waits for the requested rendered orientation before queuing the opposite rotation',()=>{
  const wait=source.slice(source.indexOf('private JSONObject waitGrid(int count,boolean paused,int orientation)'),source.indexOf('private JSONArray gridIds('));
  assert.match(wait,/ORIENTATION_LANDSCAPE\)ready&=state\.getInt\("canvasWidth"\)>state\.getInt\("canvasHeight"\)/);
  assert.match(wait,/ORIENTATION_PORTRAIT\)ready&=state\.getInt\("canvasHeight"\)>state\.getInt\("canvasWidth"\)/);
  assert.match(wait,/System\.currentTimeMillis\(\)\+30000/,'The existing per-transition frame budget must not grow');
  assert.match(source,/setRotation\(UiAutomation\.ROTATION_FREEZE_90\),"Owned landscape rotation request must be accepted"\);restored=waitGrid\(3,true,android\.content\.res\.Configuration\.ORIENTATION_LANDSCAPE\);[^\n]+setRotation\(UiAutomation\.ROTATION_FREEZE_0\),"Owned portrait rotation request must be accepted"\);restored=waitGrid\(3,true,android\.content\.res\.Configuration\.ORIENTATION_PORTRAIT\)/);
});
test('ordinary grid resizing retains codecs but keeps real background and explicit recreation release paths',()=>{
  const manifest=fs.readFileSync(new URL('../../android/manifest/AndroidManifest.xml',import.meta.url),'utf8'),grid=fs.readFileSync(new URL('../../android/gradle/app/src/main/java/com/railgunhamster/rhfiles/RhVideoGridActivity.kt',import.meta.url),'utf8');
  const declaration=manifest.match(/<activity[^>]+android:name="\.RhVideoGridActivity"[^>]+>/)?.[0];assert(declaration);
  assert.match(declaration,/android:configChanges="orientation\|screenSize\|smallestScreenSize\|screenLayout"/);
  const resize=grid.slice(grid.indexOf('override fun onConfigurationChanged('),grid.indexOf('private fun updatePages('));
  assert.match(resize,/super\.onConfigurationChanged\(newConfig\)/);assert.match(resize,/height=adjustmentHeight\(\)/);assert.match(resize,/grid\.requestLayout\(\)/);
  assert.doesNotMatch(resize,/releasePlayers\(|startPlayers\(|createEngine\(/);
  assert.match(grid,/override fun onStop\(\)\{handler\.removeCallbacks\(update\);releasePlayers\(\);super\.onStop\(\)\}/);
});
test('constant Android probe expressions parse as expressions, not standalone statements',()=>{
  const failures=[];let count=0;
  for(const match of source.matchAll(/\bexpression\(\w+,\s*("(?:\\.|[^"\\])*")\s*\)/g)){
    count++;const expression=JSON.parse(match[1]);
    try{parse('('+expression+');',{ecmaVersion:'latest'});}catch(error){failures.push({line:source.slice(0,match.index).split('\n').length,expression:expression.slice(0,180),message:error.message});}
  }
  assert(count>0,'No constant probe expressions were audited');assert.deepEqual(failures,[],count+' literal probe expressions checked');
});

const body=source.slice(source.indexOf('private Object expression('),source.indexOf('private Object action('));
const templates=[...body.matchAll(/eval\(web,((?:"(?:\\.|[^"\\])*"|nonce|expression|\s|\+)+)\);/g)].map(match=>match[1]);
function render(template,values){return [...template.matchAll(/"(?:\\.|[^"\\])*"|nonce|expression/g)].map(match=>match[0][0]==='"'?JSON.parse(match[0]):values[match[0]]).join('');}
test('the actual Android probe wrapper never publishes an old result into a newer request',async()=>{
  assert.equal(templates.length,2,'Separate reset and execution scripts must remain audited');
  const context=vm.createContext({});context.window=context;
  const run=(nonce,expression)=>{const values={nonce:JSON.stringify(nonce),expression};vm.runInContext(render(templates[0],values),context);vm.runInContext(render(templates[1],values),context);};
  run('old','new Promise(resolve=>globalThis.resolveOld=resolve)');run('current','42');await new Promise(setImmediate);
  assert.equal(context.__rhQa.request,'current');assert.equal(context.__rhQa.value,42);
  context.resolveOld('late');await new Promise(setImmediate);assert.equal(context.__rhQa.request,'current');assert.equal(context.__rhQa.value,42);
});
test('a probe syntax error cannot reuse the previous call acknowledgement',async()=>{
  const context=vm.createContext({});context.window=context;const values={nonce:'"syntax-error"',expression:'let broken=;'};
  context.__rhQa={request:'previous',value:'old success'};vm.runInContext(render(templates[0],values),context);
  assert.throws(()=>vm.runInContext(render(templates[1],values),context),/Unexpected|Syntax/);
  assert.equal(context.__rhQa.request,'syntax-error');assert.equal(Object.hasOwn(context.__rhQa,'value'),false);
});
