import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Geometry tests for the native screenshot probe, not product/visual passes.
// Extract its actual Java-embedded expression so fixture math cannot drift.
const source=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8');
const match=source.match(/geometry=\(JSONObject\)expression\(library,("(?:[^"\\]|\\.)*")\);/);
assert(match,'The actual native strip pixel probe must define its geometry');
const expression=JSON.parse(match[1]);
const rect=(x,y,width,height)=>({x,y,width,height});
function image(bounds,{naturalWidth=200,naturalHeight=100,fit='contain',complete=true,tile=bounds,path='/storage/owned.png'}={}){
  return {getBoundingClientRect:()=>bounds,naturalWidth,naturalHeight,complete,fit,parentElement:{getBoundingClientRect:()=>tile,dataset:{mediaPath:path}}};
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
});
