import test from 'node:test';
import assert from 'node:assert/strict';
import {context,load,plain} from '../testing/source.mjs';

function fixture(proxyUrl='',enabled=false){
  const controls=Object.fromEntries(['protocol','host','port'].map(field=>['settings-proxy-'+field,{value:'',disabled:!enabled,validity:'',setCustomValidity(value){this.validity=value;},reportValidity(){this.reported=true;}}]));
  let saved,refreshes=0;
  const c=context({G:{settings:{proxyEnabled:enabled,proxyUrl,autoUpdateEnabled:false}},document:{getElementById:id=>controls[id]},saveSettings:()=>{saved=plain(c.G.settings);},refreshUpdateSettingsStatus:()=>{refreshes++;},loadReleaseHistory:()=>{},t:key=>key});
  load(c,'main.js',['getUpdateProxy','proxyAddressParts','proxyAddressFromParts']);
  load(c,'dialogs.js',['setProxyEnabled','setProxyPart']);
  return {c,controls,saved:()=>saved,refreshes:()=>refreshes};
}

test('enabling an empty proxy actually uses and saves the local default',()=>{
  const {c,controls,saved}=fixture();assert.equal(c.getUpdateProxy(),null);
  c.setProxyEnabled(true);assert.equal(c.getUpdateProxy(),'http://127.0.0.1:7890');assert.equal(saved().proxyUrl,'http://127.0.0.1:7890');
  assert(Object.values(controls).every(input=>!input.disabled));assert.equal(saved().autoUpdateEnabled,false);
  c.setProxyEnabled(false);assert.equal(c.getUpdateProxy(),null);assert(Object.values(controls).every(input=>input.disabled));
  assert.equal(saved().proxyUrl,'http://127.0.0.1:7890');c.setProxyEnabled(true);assert.equal(c.getUpdateProxy(),'http://127.0.0.1:7890');
});
for(const [address,parts]of [
  ['',{protocol:'http',host:'127.0.0.1',port:'7890'}],
  [' 127.0.0.1:8888 ',{protocol:'http',host:'127.0.0.1',port:'8888'}],
  ['https://proxy.example:8443',{protocol:'https',host:'proxy.example',port:'8443'}],
  ['http://proxy.example',{protocol:'http',host:'proxy.example',port:'80'}],
  ['https://proxy.example:443',{protocol:'https',host:'proxy.example',port:'443'}],
  ['http://[::1]:7890',{protocol:'http',host:'::1',port:'7890'}],
  ['https://[2001:db8::1]:8443',{protocol:'https',host:'2001:db8::1',port:'8443'}],
])test('existing proxy is split without changing its effective endpoint: '+address,()=>{
  const {c}=fixture(address,true);assert.deepEqual(plain(c.proxyAddressParts(address)),parts);
  const parsed=new URL(c.proxyAddressFromParts(parts));assert.equal(parsed.hostname.includes(':')?parsed.hostname.slice(1,-1):parsed.hostname,parts.host);
  assert.equal(parsed.port|| (parsed.protocol==='https:'?'443':'80'),parts.port);
  assert.equal(c.G.settings.proxyUrl,address,'rendering must not rewrite existing settings');
});
test('each cleared field restores its own default, not the other fields',()=>{
  const {c,controls,saved}=fixture('https://proxy.example:9999',true);
  for(const [field,address]of [['host','https://127.0.0.1:9999'],['port','https://127.0.0.1:7890'],['protocol','http://127.0.0.1:7890']]){
    c.setProxyPart(field,' ',controls['settings-proxy-'+field]);assert.equal(saved().proxyUrl,address);assert.equal(controls['settings-proxy-'+field].validity,'');
  }
});
test('parts save immediately and keep the proxy toggle disabled',()=>{
  const {c,controls,saved}=fixture('http://127.0.0.1:7890');
  c.setProxyPart('host',' ::1 ',controls['settings-proxy-host']);c.setProxyPart('port','00080',controls['settings-proxy-port']);
  assert.equal(saved().proxyUrl,'http://[::1]:80');assert.equal(saved().proxyEnabled,false);assert.equal(c.getUpdateProxy(),null);assert.equal(controls['settings-proxy-port'].value,'80');
});
for(const port of ['0','65536','-1','12.5','1e3','123abc','Infinity','１２３'])test('invalid port is rejected without replacing the saved address: '+port,()=>{
  const {c,controls,saved}=fixture('http://proxy.example:8080',true);const input=controls['settings-proxy-port'];
  c.setProxyPart('port',port,input);assert.equal(c.G.settings.proxyUrl,'http://proxy.example:8080');assert.equal(saved(),undefined);assert.equal(input.validity,'settings.proxyInvalidPort');assert.equal(input.reported,true);
  c.setProxyPart('port','65535',input);assert.equal(saved().proxyUrl,'http://proxy.example:65535');assert.equal(input.validity,'');
});
for(const host of ['http://proxy.example','proxy.example:7890','user:secret@proxy.example','example/path','example?token=secret','bad host','[invalid]','\\server'])test('host field rejects URLs, credentials and malformed hosts: '+host,()=>{
  const {c}=fixture();assert.throws(()=>c.proxyAddressFromParts({protocol:'http',host,port:'7890'}),/proxyInvalidHost/);
});
test('invalid imported custom addresses remain visible and are never silently changed',()=>{
  const address='socks5://proxy.example:1080';const {c}=fixture(address,true);
  assert.equal(c.proxyAddressParts(address).host,address);assert.equal(c.getUpdateProxy(),address);assert.equal(c.G.settings.proxyUrl,address);
  assert.throws(()=>c.proxyAddressFromParts({protocol:'socks5',host:'proxy.example',port:'1080'}),/proxyInvalidProtocol/);
});
