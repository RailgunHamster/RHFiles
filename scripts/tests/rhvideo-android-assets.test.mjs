import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
test('every packaged media-library HTML script is actually authorized by the Android Activity',()=>{
 const html=fs.readFileSync(new URL('../../src/rhvideo.html',import.meta.url),'utf8'),activity=fs.readFileSync(new URL('../../android/gradle/app/src/main/java/com/railgunhamster/rhfiles/RhVideoActivity.kt',import.meta.url),'utf8'),allowed=new Set([...activity.matchAll(/"(\/rhvideo\/[^"\r\n]+)"/g)].map(v=>v[1]));
 for(const match of html.matchAll(/<script\b[^>]*src="([^"]+)"/g)){const relative=path.posix.normalize('/rhvideo/'+match[1]);assert(allowed.has(relative),'APK bytes alone cannot execute an unapproved script: '+relative);assert(fs.existsSync(new URL('../../src/'+match[1],import.meta.url)));}
 assert(allowed.has('/rhvideo/js/rhvideo-mobile.js'),'The injected native bridge remains explicitly allowed');assert(!allowed.has('/rhvideo/*'),'Do not replace origin/path protection with a wildcard');
});
