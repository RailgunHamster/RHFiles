// Loopback-only, synthetic WebDAV config service for APK business tests.
import http from 'node:http';
let version=1,writes=0,remoteEdits=0,violations=[];
const id='11111111-1111-4111-8111-111111111111';
let doc={schemaVersion:1,profiles:[{id,config:{type:'smb',name:'Cloud Sync QA',host:'qa-cloud.invalid',share:'Public',username:'qa-cloud'}}],favorites:['Z','A','M'].map(name=>({name,path:`remote://${id}/${name}`,isDir:true,label:name==='Z'?'QA cloud alias':name}))};
const server=http.createServer(async(req,res)=>{
 if(req.url==='/qa-state')return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({version,writes,remoteEdits,violations,doc}));
 if(req.url==='/qa-reverse'&&req.method==='POST'){doc.favorites.reverse();version++;remoteEdits++;return res.writeHead(204).end();}
 if(req.url!=='/sync/rhfiles-settings-v1.json')return res.writeHead(404).end();
 if(req.headers.authorization!=='Basic '+Buffer.from('sync-user:qa-sync-password').toString('base64'))return res.writeHead(401).end();
 if(req.method==='GET')return res.writeHead(200,{'Content-Type':'application/json',ETag:`"qa-${version}"`}).end(JSON.stringify(doc));
 if(req.method==='PUT'){
  if(req.headers['if-match']!==`"qa-${version}"`)return res.writeHead(412).end();
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)return res.writeHead(413).end();chunks.push(chunk)}const text=Buffer.concat(chunks).toString('utf8');
  if(/"password"\s*:|must-stay-local|qa-sync-password|rhfiles\.theme|\/storage\//.test(text)){violations.push('Nonportable/secret data uploaded');return res.writeHead(400).end();}
  try{doc=JSON.parse(text)}catch{return res.writeHead(400).end()}version++;writes++;return res.writeHead(204,{ETag:`"qa-${version}"`}).end();
 }
 res.writeHead(405).end();
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,endpoint:`http://10.0.2.2:${server.address().port}/sync/`})));
