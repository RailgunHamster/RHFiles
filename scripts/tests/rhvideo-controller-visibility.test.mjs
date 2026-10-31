import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8');
function geometry(){
 // Execute the actual side-effect-free Java comparison expression. Its body
 // uses only integer-coordinate comparisons, with identical JS semantics for
 // these bounded display coordinates; this does not emulate Android Views.
 const match=source.match(/private static boolean fullyVisibleControllerBounds\(([^)]*)\)\s*\{([^{}]+)\}/);assert(match,'Actual probe must check clipped on-screen bounds, not just isShown/alpha');
 const parameters=match[1].split(',').map(value=>value.trim().replace(/^int\s+/,''));assert(parameters.every(name=>/^[a-zA-Z]+$/.test(name)));assert.match(match[2],/^\s*return[\s\S]+;\s*$/);
 return vm.runInNewContext('(function('+parameters.join(',')+'){'+match[2]+'})');
}
const normal=[20,2180,1060,2350,20,2180,1060,2350,0,0,1080,2400,1080,2400];
for(const [name,changes,expected]of [
 ['fully visible',{},true],['clipped during the observed downward hide',{1:2399,3:2542,5:2399,7:2400},false],
 ['already below screen',{1:2401,3:2542,5:2401,7:2542},false],['partly clipped by a status/cutout inset',{1:0,3:170,5:136},false],
 ['partly outside the real display',{2:1100,6:1100},false],['clipped by the actual window',{11:2300},false],
 ['empty clipped rectangle',{7:2180},false],['zero-sized controller',{3:2180},false],['negative screen position',{0:-1,4:-1},false],
 ['translated root/inset still leaves all pixels visible',{8:0,9:136},true],
])test('controller reveal admission: '+name,()=>{const args=[...normal];for(const [key,value]of Object.entries(changes))args[Number(key)]=value;assert.equal(geometry()(...args),expected);});

test('real reveal uses actual bounds and still submits at most one native tap without extending hide time',()=>{
 const start=source.indexOf('private void revealPlayerControlsByTouch('),end=source.indexOf('private void clickPlayerText(',start),body=source.slice(start,end).replace(/^\s*\/\/.*$/gm,'');
 assert.match(body,/fullyVisibleControllerBounds\(/);assert.match(body,/getLocationOnScreen/);assert.match(body,/getGlobalVisibleRect/);assert.match(body,/getWindowVisibleDisplayFrame/);assert.match(body,/getRealSize/);
 assert.equal([...body.matchAll(/sendPointerSync\(down\)/g)].length,1);assert.equal([...body.matchAll(/sendPointerSync\(up\)/g)].length,1);assert.doesNotMatch(body,/performClick\(|controllerShowTimeoutMs\s*=|while\s*\(/);
});
