// Emulator QA only: loopback CONNECT relay, without TLS interception or tokens.
// API traffic uses the host's direct connection; public release downloads use
// its existing HTTP proxy. Never shipped in the APK or exposed on the LAN.
import http from 'node:http';
import net from 'node:net';
const allowed=new Set(['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com']);
const sockets=new Set();
const server=http.createServer((_req,res)=>res.writeHead(405).end());
server.on('connect',(req,client,head)=>{
  const [host,port]=req.url.split(':');
  if(port!=='443'||!allowed.has(host)){client.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  const direct=host==='api.github.com';
  const remote=net.connect(direct?{host,port:443}:{host:'127.0.0.1',port:7890});
  for(const socket of [client,remote]){sockets.add(socket);socket.setTimeout(45000);socket.on('close',()=>sockets.delete(socket));socket.on('timeout',()=>socket.destroy());}
  client.on('error',()=>remote.destroy());remote.on('error',()=>client.destroy());
  remote.once('connect',()=>{
    if(direct)client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    else remote.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`);
    if(head.length)remote.write(head);
    client.pipe(remote);remote.pipe(client);
  });
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,loopbackOnly:true,tlsInterception:false})));
const close=()=>{for(const socket of sockets)socket.destroy();server.close(()=>process.exit(0));};
process.on('SIGINT',close);process.on('SIGTERM',close);
