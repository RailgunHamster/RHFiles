import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {browserPort,listenBrowserLoopback} from '../testing/browser-loopback.mjs';
class Ports extends EventEmitter{
  constructor(ports,error){super();this.ports=ports;this.listening=false;this.count=0;this.closed=0;this.error=error;}
  listen(port,host,ready){assert.equal(port,0);assert.equal(host,'127.0.0.1');this.count++;if(this.error){queueMicrotask(()=>this.emit('error',this.error));return;}this.port=this.ports[Math.min(this.count-1,this.ports.length-1)];this.listening=true;queueMicrotask(ready);}
  address(){return {address:'127.0.0.1',family:'IPv4',port:this.port};}
  close(done){this.closed++;this.listening=false;queueMicrotask(done);}
}
test('auto-selected ports exclude browser/Fetch restrictions and invalid or privileged numbers',()=>{
  for(const p of [0,80,443,1023,1719,1720,1723,2049,3659,4045,4190,5060,5061,6000,6566,6665,6666,6667,6668,6669,6679,6697,10080,65536,NaN,9000.5,'8080'])assert.equal(browserPort(p),false,String(p));
  for(const p of [1024,1721,1722,1724,4191,6678,6680,8080,9222,10081,49152,65535])assert.equal(browserPort(p),true,String(p));
});
test('a forbidden allocated port is closed before publishing the next usable listener',async()=>{
  const server=new Ports([6000,10080,9222]),address=await listenBrowserLoopback(server);assert.equal(address.port,9222);assert.equal(server.count,3);assert.equal(server.closed,2);assert.equal(server.listenerCount('error'),0);assert.equal(server.listening,true);
});
test('allocation has a finite budget and does not hide genuine socket errors by retrying them',async()=>{
  const blocked=new Ports([6667]);await assert.rejects(listenBrowserLoopback(blocked),/allocation budget/);assert.equal(blocked.count,16);assert.equal(blocked.closed,16);assert.equal(blocked.listening,false);
  const error=Object.assign(Error('owned socket error'),{code:'EACCES'}),failed=new Ports([],error);await assert.rejects(listenBrowserLoopback(failed),e=>e===error);assert.equal(failed.count,1);assert.equal(failed.closed,0);assert.equal(failed.listenerCount('error'),0);
});
test('the real ephemeral HTTP endpoint is loopback-only and usable by unmodified Fetch',async()=>{
  const server=http.createServer((_req,res)=>res.end('owned-fixture'));
  try{const address=await listenBrowserLoopback(server);assert(browserPort(address.port));assert.equal(address.address,'127.0.0.1');const response=await fetch(`http://127.0.0.1:${address.port}`);assert.equal(await response.text(),'owned-fixture');}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
