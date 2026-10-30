import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {latencySummary} from '../testing/rhvideo-android-ui-latency.mjs';

test('UI timing reports host delivery and renderer execution separately, never conflating their clocks',()=>{
 assert.deepEqual(latencySummary([{hostMs:800,rendererMs:12},{hostMs:100,rendererMs:4},{hostMs:300,rendererMs:1}]),{count:3,hostMs:{minimum:100,median:300,maximum:800},rendererMs:{minimum:1,median:4,maximum:12}});
 for(const rows of [[],Array(101).fill({hostMs:1,rendererMs:1}),[{hostMs:-1,rendererMs:1}],[{hostMs:1,rendererMs:NaN}],[{hostMs:1}],null])assert.throws(()=>latencySummary(rows));
});

test('UI latency diagnostic keeps normal exact-byte admission and a finite one-shot workload',()=>{
 const text=fs.readFileSync(new URL('../testing/rhvideo-android-ui-latency.mjs',import.meta.url),'utf8');
 for(const required of ['admitLocalClockDevice','androidApkRuntimes','No install or runtime substitution','diagnosticOnly:true','budgetMs:180000','controller.signal.aborted','No action or reload on error','background-library-with-native-player'])assert(text.includes(required));
 assert.doesNotMatch(text,/\['install'|Page\.reload|audioStart|codecMode|wm','size|pm','clear|emu','kill/);
});
