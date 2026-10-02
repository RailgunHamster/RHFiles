// Sanity-check that business tests actually catch damaged production behavior.
// Mutate only an owned temporary source copy, never the working tree.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root} from './source.mjs';

const cases=[
  ['selection preserved after sorting','filelist.js','if (selectedPaths.has(entry.path)) state.sel.add(index);', 'if (false) state.sel.add(index);'],
  ['keep-both collision avoidance','conflict.js','while (used.has(fileNameKey(candidate)))','while (false && used.has(fileNameKey(candidate)))'],
  ['pinned tab reorder boundary','tabs.js','if ((tabs[fromIndex].pinned === true) !== (tabs[targetIndex].pinned === true)) return false;',''],
  ['stale listing response','tabs.js','if (token !== tab._refreshToken || tab.path !== requestedPath) return;','if (false) return;'],
  ['typed substring search','keyboard.js','normalizeTypeSearchText(entry.name).includes(normalizedQuery)','normalizeTypeSearchText(entry.name).startsWith(normalizedQuery)'],
  ['undo serialization','undoredo.js','if (historyBusy || !undoStack.length) return;','if (!undoStack.length) return;'],
  ['overwrite must not enter undo history','ops.js','if (!overwrites) trackCopy(src, targetPath);','trackCopy(src, targetPath);'],
];
const tests=['file-browser','file-operations','navigation-search'].map(n=>path.join(root,'scripts/tests/'+n+'.test.mjs'));
const run=sourceRoot=>spawnSync(process.execPath,['--test','--test-reporter=tap',...tests],{cwd:root,encoding:'utf8',timeout:30000,
  env:{...process.env,RHFILES_TEST_SOURCE_ROOT:sourceRoot,FC_RUNS:'100',FC_SEED:'20261002'}});
const baseline=run(root);if(baseline.status!==0)throw Error('Baseline must pass before mutation checks\n'+baseline.stdout+baseline.stderr);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-mutants-'));
const scriptDir=path.join(temporary,'src/js');fs.mkdirSync(scriptDir,{recursive:true});
for(const file of ['filelist','conflict','tabs','keyboard','undoredo','ops','remote','common','pane']){
  fs.copyFileSync(path.join(root,'src/js/'+file+'.js'),path.join(scriptDir,file+'.js'));
}
let failures=0;
for(const [name,file,before,after] of cases){
  const destination=path.join(scriptDir,file),original=fs.readFileSync(destination,'utf8');
  if(!original.includes(before))throw Error('Mutation no longer matches production source: '+name);
  fs.writeFileSync(destination,original.replace(before,after));
  const result=run(temporary);fs.writeFileSync(destination,original);
  const caught=result.status!==null && result.status!==0 && /(AssertionError|ERR_ASSERTION|Counterexample:)/.test(result.stdout) && !/(SyntaxError|ReferenceError)/.test(result.stdout+result.stderr);
  console.log(`${caught?'CAUGHT':'SURVIVED/INVALID'}: ${name}`);
  if(!caught){failures++;console.error((result.stdout+result.stderr).slice(-5000));}
}
// Validate the owned target before recursive cleanup; keep failed evidence.
if(!failures && path.dirname(temporary)===fs.realpathSync(os.tmpdir()) && path.basename(temporary).startsWith('rhfiles-mutants-'))fs.rmSync(temporary,{recursive:true});
else console.log('Mutation fixture: '+temporary);
if(failures)process.exitCode=1;
