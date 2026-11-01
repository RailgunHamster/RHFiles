import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {context,load,plain} from '../testing/source.mjs';

function fixture(stored){
  const memory=new Map(stored===undefined?[]:[['rhfiles-settings',JSON.stringify(stored)]]);
  const c=context({localStorage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)},G:{},refreshUpdateSettingsStatus:()=>{},loadReleaseHistory:()=>{}});
  load(c,'common.js',['DEFAULT_GITHUB_UPDATE_SOURCE','DEFAULT_CNB_UPDATE_SOURCE','defaultArchiveToolSettings','normalizeArchiveToolSettings','loadSettings','saveSettings']);
  c.G.settings=c.loadSettings();
  c.storedSettings=()=>JSON.parse(memory.get('rhfiles-settings')||'null');
  load(c,'main.js',['getUpdateSource','getCnbUpdateSource','getGithubUpdateSource']);
  load(c,'dialogs.js',['setUpdateSourceMode','setUpdateSourceLocation']);
  return c;
}
test('Windows clean and incomplete settings default to CNB without family update fields',()=>{
  for(const stored of [undefined,{}, {previewDefaultOpen:false}]){
    const c=fixture(stored);assert.equal(c.G.settings.updateSourceMode,'cnb');assert.equal(c.getUpdateSource(),'https://cnb.cool/railgunhamster/RHFiles');assert.equal(c.G.settings.updateSourceChoiceVersion,2);assert(!('serverUpdateSource' in c.G.settings));
  }
});
test('old bundled GitHub default migrates once without enabling disabled update checks',()=>{
  for(const stored of [{updateSourceMode:'github',githubUpdateSource:'https://github.com/RailgunHamster/RHFiles',autoUpdateEnabled:false},{updateSource:'https://github.com/RailgunHamster/RHFiles',autoUpdateEnabled:false}]){
    const c=fixture(stored);assert.equal(c.G.settings.updateSourceMode,'cnb');assert.equal(c.G.settings.autoUpdateEnabled,false);
    c.setUpdateSourceMode('github');assert.equal(c.getUpdateSource(),'https://github.com/RailgunHamster/RHFiles');
    assert.equal(fixture(plain(c.G.settings)).G.settings.updateSourceMode,'github');
  }
});
for(const stored of [
  {updateSourceMode:'github',githubUpdateSource:'https://github.com/example/custom'},
  {updateSource:'https://github.com/example/custom'},
  {updateSourceMode:'github',updateSourceChoiceVersion:1,githubUpdateSource:'https://github.com/RailgunHamster/RHFiles'},
  {updateSource:'https://cnb.cool/example/sub/custom'},
])test('custom source survives default migration: '+JSON.stringify(stored),()=>{
  const c=fixture(stored);assert.equal(c.getUpdateSource(),stored.updateSource||stored.githubUpdateSource);
});
for(const source of [{updateSourceMode:'server',serverUpdateSource:'\\\\NAS\\Apps'},{updateSource:'\\\\NAS\\Apps'},{updateSourceMode:'server',serverUpdateSource:'https://updates.example/windows'},{updateSourceMode:'gitee',giteeUpdateSource:'https://gitee.com/example/custom'},{updateSource:'https://gitee.com/example/custom'}])test('retired family/Gitee source migrates to CNB and cannot return from backup: '+JSON.stringify(source),()=>{
  const c=fixture({...source,autoUpdateEnabled:false});assert.equal(c.G.settings.updateSourceMode,'cnb');assert.equal(c.getUpdateSource(),'https://cnb.cool/railgunhamster/RHFiles');assert.equal(c.G.settings.autoUpdateEnabled,false);assert(!('serverUpdateSource' in c.G.settings));assert(!('giteeUpdateSource' in c.G.settings));
  assert(!('serverUpdateSource' in c.storedSettings()));assert(!('giteeUpdateSource' in c.storedSettings()));assert.equal(c.storedSettings().autoUpdateEnabled,false);
});

test('both public source fields remain independent and retired source setters cannot restore family addresses',()=>{
  const c=fixture();const inputs={cnb:'https://cnb.cool/example/sub/files',github:'https://github.com/example/files'};
  for(const [kind,value]of Object.entries(inputs))c.setUpdateSourceLocation(kind,' '+value+' ');
  for(const [kind,value]of Object.entries(inputs)){c.setUpdateSourceMode(kind);assert.equal(c.getUpdateSource(),value);assert.equal(c.G.settings.updateSource,value);}
  c.setUpdateSourceMode('nonsense');assert.equal(c.G.settings.updateSourceMode,'cnb');
  c.setUpdateSourceLocation('cnb','');assert.equal(c.getUpdateSource(),'https://cnb.cool/railgunhamster/RHFiles');
  c.setUpdateSourceLocation('server','\\\\NAS\\Files');assert(!('serverUpdateSource' in c.G.settings));
});
