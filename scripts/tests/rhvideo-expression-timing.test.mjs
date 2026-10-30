import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {expressionTimings} from '../testing/rhvideo-expression-timing.mjs';
const run='a'.repeat(32),fields=['elapsedMs','evals','polls','mainQueueMs','mainQueueMaxMs','callbackMs','callbackMaxMs','callbackMissing','resetEvalMs','launchEvalMs','pollEvalMs','pollSleepMs'];
const sample=(extra={})=>({protocol:1,run,sequence:1,pid:42,label:'rhvideo.player.state',outcome:'value',clock:'android-elapsed-realtime',...Object.fromEntries(fields.map(key=>[key,0])),...extra});
const line=row=>'10-31 02:00:00.123 42 43 I RHVideoQATiming: '+JSON.stringify(row)+'\r\n';

test('Android expression timing admits only this run and preserves the Android clock distinction',()=>{
  const result=expressionTimings(line(sample({elapsedMs:120,mainQueueMs:80}))+line(sample({run:'b'.repeat(32)})),run);
  assert.equal(result.records.length,1);assert.equal(result.records[0].mainQueueMs,80);assert.match(result.scope,/not native API execution/);assert.equal(result.clock,'android-elapsed-realtime');assert.equal(result.rejected,0);
});
test('timing records cannot persist arguments, results, errors, paths, or arbitrary log content',()=>{
  const result=expressionTimings('Bearer secret\n'+line(sample({password:'secret',path:'private',result:'secret'}))+line(sample({sequence:2,label:'rhvideo.player.state secret'})),run);
  assert.equal(result.records.length,1);assert.equal(result.rejected,1);assert.doesNotMatch(JSON.stringify(result),/secret|private|password|"path"|"result"/);
});
test('malformed, nonfinite, duplicate, wrong-scope and oversized records do not become timing evidence',()=>{
  const invalid=[{protocol:3},{clock:'host'},{sequence:0},{sequence:513},{label:'x'.repeat(170)},{pid:-1},{elapsedMs:-1},{polls:1.5},{mainQueueMs:3600001},{outcome:'succeeded'},...fields.map(key=>({[key]:null}))];
  for(const value of invalid)assert.equal(expressionTimings(line(sample(value)),run).records.length,0,JSON.stringify(value));
  const duplicate=expressionTimings(line(sample())+line(sample()),run);assert.equal(duplicate.records.length,1);assert.equal(duplicate.rejected,1);
  assert.equal(expressionTimings('I RHVideoQATiming: not JSON\n',run).records.length,0);for(const identity of ['',null,'g'.repeat(32),'a'.repeat(33)])assert.throws(()=>expressionTimings('',identity));
});
test('one-dispatch protocol is distinguished from two-dispatch measurements and missing phases stay invalid',()=>{
  const modern=sample({protocol:2,evals:2,polls:1,dispatchEvalMs:37});delete modern.resetEvalMs;delete modern.launchEvalMs;
  const receipt=expressionTimings(line(sample({evals:3,resetEvalMs:10,launchEvalMs:20}))+line({...modern,sequence:2}),run);
  assert.equal(receipt.records[0].protocol,1);assert.equal(receipt.records[0].dispatchEvals,2);assert.equal(receipt.records[0].dispatchEvalMs,30);
  assert.equal(receipt.records[1].protocol,2);assert.equal(receipt.records[1].dispatchEvals,1);assert.equal(receipt.records[1].dispatchEvalMs,37);assert(!Object.hasOwn(receipt.records[1],'resetEvalMs'));
  delete modern.dispatchEvalMs;assert.equal(expressionTimings(line(modern),run).records.length,0);
});
test('record collection is capped at the same 512-action budget and snapshots are independent',()=>{
  const text=Array.from({length:520},(_,i)=>line(sample({sequence:i+1}))).join(''),a=expressionTimings(text,run),b=expressionTimings(text,run);
  assert.equal(a.records.length,512);assert.equal(a.rejected,8);a.records[0].label='changed';assert.equal(b.records[0].label,'rhvideo.player.state');
});

test('a truncated log or a missing middle sequence is explicitly incomplete, even when every remaining record is valid',()=>{
  const tail=expressionTimings(line(sample({sequence:58}))+line(sample({sequence:59}))+line(sample({sequence:61})),run);
  assert.equal(tail.records.length,3);assert.equal(tail.rejected,0);assert.equal(tail.dropped,0);assert.equal(tail.missingSequences,58);
  assert.equal(expressionTimings(line(sample())+line(sample({sequence:2})),run).missingSequences,0);
});
test('probe timing is opt-in, contains no result serialization and preserves original per-eval/action budgets',()=>{
  const source=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8');
  const timing=source.slice(source.indexOf('private static final class ExpressionTiming'),source.indexOf('private final java.util.Set<Activity>'));
  assert.doesNotMatch(timing,/expression|script|password|params|value\.toString|Thread\.sleep|evaluateJavascript/);
  assert.match(source,/expressionTimingSequence>=512/);assert.match(source,/traceRun\.matches\("\[a-f0-9\]\{32\}"\)/);
  assert.match(source,/latch\.await\(15,TimeUnit\.SECONDS\)/);assert.match(source,/System\.currentTimeMillis\(\)\+45000/);assert.match(source,/Thread\.sleep\(100\)/);
  assert.match(source,/expressionTiming\.remove\(\);if\(timing!=null\)timing\.finish\(outcome\)/);
  const host=fs.readFileSync(new URL('../testing/rhvideo-android.mjs',import.meta.url),'utf8');assert.match(host,/RHFILES_QA_EXPRESSION_TIMING/);assert.match(host,/expression-timing-enabled/);assert.match(host,/not native|expressionTimings/);
});

test('bootstrap reads have their own fixed protocol and cannot masquerade as a business operation dispatch',()=>{
 const value=sample({protocol:3,label:'native.bootstrap.main',outcome:'timeout',evals:1,polls:1,firstCheckMs:15000,callbackMissing:1});
 const result=expressionTimings(line(value),run);assert.equal(result.records.length,1);const row=result.records[0];
 assert.equal(row.readinessChecks,1);assert.equal(row.firstCheckMs,15000);assert.equal(row.callbackMissing,1);assert.equal(row.outcome,'timeout');
 assert(!Object.hasOwn(row,'dispatchEvals'));assert(!Object.hasOwn(row,'dispatchEvalMs'));assert(!Object.hasOwn(row,'resetEvalMs'));
 for(const extra of [{protocol:2,dispatchEvalMs:15},{label:'rhvideo.player.state'},{label:'native.bootstrap.private'},{firstCheckMs:null}])assert.equal(expressionTimings(line({...value,...extra}),run).records.length,0);
});

test('bootstrap timing wraps the original readiness evaluations without adding polling, UI actions or a larger budget',()=>{
 const source=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8');
 const ready=source.slice(source.indexOf('private void ready('),source.indexOf('\n  private ',source.indexOf('private void ready(')+1));
 assert.match(ready,/beginExpressionTiming\("native\.bootstrap\."/);assert.match(ready,/end=start\+45000/);assert.match(ready,/Thread\.sleep\(500\)/);
 assert.equal([...ready.matchAll(/eval\(web,/g)].length,2,'Original predicate and terminal diagnostic only');
 assert.doesNotMatch(ready,/nativeCall\(|\.invoke\(|performClick|\.reload\(|\.focus\(/);
 assert.match(ready,/catch\(TimeoutException error\)\{outcome="timeout";throw error;\}/);assert.match(ready,/expressionTiming\.remove\(\);if\(timing!=null\)timing\.finish\(outcome\)/);
});
