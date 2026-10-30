import test from 'node:test';
import assert from 'node:assert/strict';
import {androidApkRuntimes} from '../testing/android-apk-runtime.mjs';
const library=abi=>'lib/'+abi+'/librhfiles_android_lib.so';
test('APK runtime admission accepts each complete ABI and a complete multi-ABI package',()=>{
 for(const abi of ['arm64-v8a','armeabi-v7a','x86','x86_64'])assert.deepEqual(androidApkRuntimes([library(abi),'lib/'+abi+'/libother.so']),[abi]);
 const all=['arm64-v8a','armeabi-v7a','x86','x86_64'];assert.deepEqual(androidApkRuntimes(all.map(library)),all);
});
test('third-party JNI cannot advertise an unbuilt RHFiles ABI, even when the emulator ABI is complete',()=>{
 assert.throws(()=>androidApkRuntimes([library('x86_64'),'lib/armeabi-v7a/libthirdparty.so']),/Missing RHFiles runtime for armeabi-v7a/);
 assert.throws(()=>androidApkRuntimes(['lib/arm64-v8a/libthirdparty.so']),/Missing RHFiles runtime for arm64-v8a/);
});
test('APK runtime admission rejects empty, malformed and unbounded inventories',()=>{
 for(const entries of [[],null,['assets/index.html'],[null],['lib/other/librhfiles_android_lib.so'],Array(100001).fill(library('x86_64'))])assert.throws(()=>androidApkRuntimes(entries));
});
