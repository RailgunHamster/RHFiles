import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Geometry tests for the native screenshot probe, not product/visual passes.
// Execute its actual test-APK asset so fixture math cannot drift.
const source=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8');
assert(source.includes('getContext().getAssets().open("rhvideo-strip-pixels.js")'));
assert(source.includes('geometry=(JSONObject)expression(library,script)'));
const expression=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/assets/rhvideo-strip-pixels.js',import.meta.url),'utf8');
const rect=(x,y,width,height)=>({x,y,width,height});
function image(bounds,{naturalWidth=200,naturalHeight=100,fit='contain',complete=true,tile=bounds,path='/storage/owned.png',controls=[]}={}){
  return {getBoundingClientRect:()=>bounds,naturalWidth,naturalHeight,complete,fit,parentElement:{getBoundingClientRect:()=>tile,dataset:{mediaPath:path},querySelectorAll:()=>controls.map(bounds=>({getBoundingClientRect:()=>bounds}))}};
}
function measure(rows){
  const value=vm.runInNewContext(expression,{innerWidth:400,innerHeight:800,getComputedStyle:image=>({objectFit:image.fit}),document:{querySelectorAll:()=>rows.map(({bounds,images})=>({getBoundingClientRect:()=>bounds,querySelectorAll:()=>images}))}});
  return JSON.parse(JSON.stringify(value));
}
test('native strip samples the contained image pixels, never its letterbox',()=>{
  const bounds=rect(0,0,100,200),row=measure([{bounds,images:[image(bounds)]}]).rows[0];
  assert.equal(row.area,5000);assert.equal(row.loaded,true);
  assert.deepEqual(row.points,[{x:25,y:87.5,quadrant:0},{x:75,y:87.5,quadrant:1},{x:25,y:112.5,quadrant:2},{x:75,y:112.5,quadrant:3}]);
});
test('native strip respects both a sliced tall image and its clipped row',()=>{
  const bounds=rect(0,0,100,200),row=measure([{bounds,images:[image(rect(0,-100,100,400),{fit:'fill',tile:bounds})]}]).rows[0];
  assert.equal(row.area,20000);
  assert.deepEqual(row.points,[{x:25,y:50,quadrant:0},{x:75,y:50,quadrant:1},{x:25,y:150,quadrant:2},{x:75,y:150,quadrant:3}]);
});
test('native strip chooses an actual visible image independently in both rows',()=>{
  const first=rect(0,0,400,200),second=rect(0,200,400,200),offscreen=image(rect(-2000,0,1000,200),{path:'offscreen'});
  const value=measure([{bounds:first,images:[offscreen,image(rect(0,0,200,200),{path:'first'})]},{bounds:second,images:[image(rect(0,200,200,200),{path:'second'})]}]);
  assert.equal(value.rows.length,2);assert.deepEqual(value.rows.map(row=>row.path),['first','second']);
  assert(value.rows.every(row=>row.area>0&&row.loaded));
});
test('native strip geometry alone cannot make an incomplete or missing image pass',()=>{
  const bounds=rect(0,0,100,200),value=measure([{bounds,images:[image(bounds,{complete:false,naturalWidth:0,naturalHeight:0})]},{bounds,images:[]}]);
  assert.equal(value.rows[0].loaded,false);assert.equal(value.rows[1],null);
  for(const name of ['rhvideo-strip-before-rotation-qa.png','rhvideo-strip-landscape-qa.png','rhvideo-strip-rows-qa.png'])assert(source.includes('assertStripPixels("'+name+'")'));
  assert.match(source,/pixels\.getPixel\(x,y\)/);assert.match(source,/Both strip rows must restore actual image pixels/);
  assert.match(source,/step\("QA: actual strip row pixels /);
  const runner=fs.readFileSync(new URL('../testing/rhvideo-android.mjs',import.meta.url),'utf8');
  assert.match(runner,/output\.includes\('STEP: QA: actual strip row pixels '\+name\+' after '/);
  assert.match(runner,/assets\/rhvideo-strip-pixels\.js/);assert.match(source,/points\.length\(\)==4/);
});
test('native strip sampling excludes the real favorite overlay without hiding it or relaxing source colors',()=>{
  const bounds=rect(0,0,125,78),control=rect(79,6,40,40),row=measure([{bounds,images:[image(bounds,{naturalWidth:125,naturalHeight:78,controls:[control]})]}]).rows[0];
  assert.equal(row.points.length,4);assert.deepEqual(row.points.map(p=>p.quadrant),[0,1,2,3]);
  for(const point of row.points)assert(!(point.x>=77&&point.x<=121&&point.y>=4&&point.y<=48),'No source-color sample can fall under the control or its antialiased edge');
  assert.doesNotMatch(expression,/\.style\s*=|\.remove\(|display\s*=|visibility\s*=|opacity\s*=/);
});
test('native strip sampling still needs four uncovered source points when a huge image exposes one quadrant',()=>{
  const row=measure([{bounds:rect(0,0,100,100),images:[image(rect(0,0,1000,1000),{fit:'fill',tile:rect(0,0,100,100)})]}]).rows[0];
  assert.equal(row.points.length,4);assert(row.points.every(p=>p.quadrant===0&&p.x>0&&p.x<100&&p.y>0&&p.y<100));
  assert.equal(new Set(row.points.map(p=>p.x+':'+p.y)).size,4);
});
test('a fully occluded image cannot pass just because its decode flag and box are valid',()=>{
  const bounds=rect(0,0,100,100),row=measure([{bounds,images:[image(bounds,{controls:[bounds]})]}]).rows[0];
  assert.equal(row.loaded,true);assert.deepEqual(row.points,[]);
});
