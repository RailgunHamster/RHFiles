import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import fs from 'node:fs';
const {describe}=createRequire(import.meta.url)('../../src/js/rhvideo-playback-phase.js');
const playing={opened:true,state:3,renderedFrames:20,durationMs:12000};
for(const [name,patch,phase]of [
 ['actual PLAYING-before-first-picture observation',{renderedFrames:0,decodedFrames:1,decodedAudioBlocks:0},'preparing'],
 ['decoded data is not visible output',{renderedFrames:0,decodedFrames:400,decodedAudioBlocks:300},'preparing'],
 ['missing presentation counter',{renderedFrames:undefined},'preparing'],
 ['one real presentation',{renderedFrames:1},'playing'],
 ['accepted pause before decoder acknowledgement',{pauseRequested:true},'pausing'],
 ['acknowledged pause',{state:4,pauseRequested:true},'paused'],
 ['legacy pause snapshot',{state:4},'paused'],
 ['accepted resume before acknowledgement',{state:4,pauseRequested:false},'resuming'],
 ['pending seek',{pendingSeekMs:5000},'seeking'],
 ['restoring a paused frame',{restoringPausedFrame:true,pauseRequested:true,pendingSeekMs:5000},'restoring'],
 ['input opening',{state:1},'buffering'],['buffering',{state:2},'buffering'],
 ['completed input',{state:6},'ended'],['stopped input',{state:5},'stopped'],
 ['no engine',{opened:false},'stopped'],['input error wins over pending seek',{state:7,pendingSeekMs:5000},'failed'],
 ['failed zero-duration empty input',{state:6,durationMs:0,renderedFrames:0},'failed'],
 ['presentation error wins over stale restore state',{presentationError:'generated display failure',restoringPausedFrame:true},'displayFailed'],
])test(name+' has a truthful shared native-window phase',()=>{const input={...playing,...patch},before=structuredClone(input),value=describe(input);assert.equal(value.phase,phase);assert(value.label&&value.shortLabel);assert.deepEqual(input,before,'Status observation cannot mutate playback');});
test('native window documents load the same status rule before their controllers',()=>{for(const kind of ['player','grid']){const html=fs.readFileSync(new URL('../../src/rhvideo-'+kind+'.html',import.meta.url),'utf8');assert(html.indexOf('js/rhvideo-playback-phase.js')>=0);assert(html.indexOf('js/rhvideo-playback-phase.js')<html.indexOf('js/rhvideo-'+kind+'.js'));}});
