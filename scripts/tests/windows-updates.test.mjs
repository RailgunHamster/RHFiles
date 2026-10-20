import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {context,load,plain} from '../testing/source.mjs';

function fixture(stored){
  const memory=new Map(stored===undefined?[]:[['rhfiles-settings',JSON.stringify(stored)]]);
  const c=context({localStorage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)},G:{},refreshUpdateSettingsStatus:()=>{},loadReleaseHistory:()=>{}});
  load(c,'common.js',['DEFAULT_GITHUB_UPDATE_SOURCE','DEFAULT_GITEE_UPDATE_SOURCE','DEFAULT_SERVER_UPDATE_SOURCE','defaultArchiveToolSettings','normalizeArchiveToolSettings','loadSettings','saveSettings']);
  c.G.settings=c.loadSettings();
  load(c,'main.js',['getUpdateSource','getGiteeUpdateSource','getGithubUpdateSource','getServerUpdateSource']);
  load(c,'dialogs.js',['setUpdateSourceMode','setUpdateSourceLocation']);
  return c;
}
test('Windows clean and incomplete settings default to Gitee',()=>{
  for(const stored of [undefined,{}, {previewDefaultOpen:false}]){
    const c=fixture(stored);assert.equal(c.G.settings.updateSourceMode,'gitee');assert.equal(c.getUpdateSource(),'https://gitee.com/railgunhamster/RHFiles');assert.equal(c.G.settings.updateSourceChoiceVersion,1);
  }
});
test('old bundled GitHub default migrates once without enabling disabled update checks',()=>{
  for(const stored of [{updateSourceMode:'github',githubUpdateSource:'https://github.com/RailgunHamster/RHFiles',autoUpdateEnabled:false},{updateSource:'https://github.com/RailgunHamster/RHFiles',autoUpdateEnabled:false}]){
    const c=fixture(stored);assert.equal(c.G.settings.updateSourceMode,'gitee');assert.equal(c.G.settings.autoUpdateEnabled,false);
    c.setUpdateSourceMode('github');assert.equal(c.getUpdateSource(),'https://github.com/RailgunHamster/RHFiles');
    assert.equal(fixture(plain(c.G.settings)).G.settings.updateSourceMode,'github');
  }
});
for(const stored of [
  {updateSourceMode:'github',githubUpdateSource:'https://github.com/example/custom'},
  {updateSource:'https://github.com/example/custom'},
  {updateSourceMode:'server',serverUpdateSource:'\\\\NAS\\Apps'},
  {updateSource:'\\\\NAS\\Apps'},
  {updateSourceMode:'server',serverUpdateSource:'https://updates.example/windows'},
  {updateSource:'https://gitee.com/example/custom'},
])test('custom source survives default migration: '+JSON.stringify(stored),()=>{
  const c=fixture(stored);assert.equal(c.getUpdateSource(),stored.updateSource||stored.githubUpdateSource||stored.serverUpdateSource);
});
test('all three source fields remain independent and switching updates the effective source',()=>{
  const c=fixture();const inputs={gitee:'https://gitee.com/example/files',github:'https://github.com/example/files',server:'\\\\NAS\\Files'};
  for(const [kind,value]of Object.entries(inputs))c.setUpdateSourceLocation(kind,' '+value+' ');
  for(const [kind,value]of Object.entries(inputs)){c.setUpdateSourceMode(kind);assert.equal(c.getUpdateSource(),value);assert.equal(c.G.settings.updateSource,value);}
  c.setUpdateSourceMode('nonsense');assert.equal(c.G.settings.updateSourceMode,'gitee');
  c.setUpdateSourceLocation('gitee','');assert.equal(c.getUpdateSource(),'https://gitee.com/railgunhamster/RHFiles');
});
