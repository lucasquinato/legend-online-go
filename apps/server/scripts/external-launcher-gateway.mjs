import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, renameSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, gunzipSync, brotliDecompressSync } from 'node:zlib';

export function validAsset(bytes, path, mime = '') {
  if (!bytes.length || bytes.length > 128*1024*1024 || /text\/html/i.test(mime) || /^\s*(?:<!doctype html|<html)/i.test(bytes.subarray(0,128).toString())) return false;
  try {
    const magic = bytes.subarray(0,3).toString();
    if (/\.swf$/i.test(path)) {
      if(bytes.length<8)return false;
      if(magic==='FWS')return bytes.length===bytes.readUInt32LE(4);
      if(magic==='CWS')return inflateSync(bytes.subarray(8),{maxOutputLength:128*1024*1024}).length+8===bytes.readUInt32LE(4);
      return false;
    }
    if(/\/(?:tempinfos|sns_temp)\.xml$/i.test(path)) {
      if(bytes[0]===60 || bytes.subarray(0,3).toString('hex')==='efbbbf')return true;
      const body=inflateSync(bytes.subarray(bytes[0]===0x78?0:4),{maxOutputLength:128*1024*1024});
      return bytes.readUInt32BE(0)===bytes.length-4 || body.length>0;
    }
    if(/\/avata\.xml$/i.test(path) && bytes[0]===0x78) { inflateSync(bytes,{maxOutputLength:128*1024*1024});return true; }
    return true;
  }catch{return false;}
}

export const gameHost = host => ['oasgames.com', 'creaction-network.com'].some(root => host === root || host.endsWith('.' + root));
export function assetUrl(value) {
  try { const url = new URL(value); return gameHost(url.hostname) && /\.(?:swf|bswf|png|jpg|jpeg|gif|dat|xml)(?:$)/i.test(url.pathname); } catch { return false; }
}
// Separate namespace: another release must never replace the local client's files.
export function createExternalGateway({ directory, port = 8090, debugPort = 9223, enableDebugger = true, fetchAsset = fetch }) {
  mkdirSync(join(directory, 'objects'), { recursive: true });
  const db = new DatabaseSync(join(directory, 'cache.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,origin TEXT,path TEXT,bytes INTEGER,sha256 TEXT,content_type TEXT,saved_at TEXT,transport TEXT);');
  db.exec('CREATE TABLE IF NOT EXISTS requests(origin TEXT,path TEXT,observed_at TEXT,status INTEGER,detail TEXT,PRIMARY KEY(origin,path));');
  const status = { httpRequests: 0, httpsTunnels: 0, captured: 0, rejected: 0, debugTargets: 0, debuggerReady: false, bodyUnavailable: 0, downloads: 0, downloadFailures: 0, cacheHits: 0, queued: 0, downloading: 0 };
  const sockets = new Set(), debuggers = new Map();
  const queue=[], inFlight=new Map();let timer,closed=false;
  function record(url, code, detail) {
    const parsed=new URL(url);db.prepare('INSERT INTO requests VALUES(?,?,?,?,?) ON CONFLICT(origin,path) DO UPDATE SET observed_at=excluded.observed_at,status=excluded.status,detail=excluded.detail').run(parsed.origin,parsed.pathname,new Date().toISOString(),code,detail);
  }
  function cached(url) {
    const parsed=new URL(url),id=createHash('sha256').update(parsed.origin+parsed.pathname).digest('hex');
    const row=db.prepare('SELECT * FROM assets WHERE id=?').get(id);if(!row)return;
    try{const b=readFileSync(join(directory,'objects',row.sha256+'.bin'));if(b.length===row.bytes && createHash('sha256').update(b).digest('hex')===row.sha256 && validAsset(b,row.path,row.content_type))return {...row,body:b};}catch{}
  }
  function save(url, bytes, mime, transport) {
    if (!assetUrl(url) || !validAsset(bytes,new URL(url).pathname,mime)) { status.rejected++; return false; }
    const parsed = new URL(url), path = parsed.pathname;
    const sha = createHash('sha256').update(bytes).digest('hex');
    const id = createHash('sha256').update(parsed.origin + path).digest('hex');
    const temp = join(directory, randomUUID() + '.part'); writeFileSync(temp, bytes); renameSync(temp, join(directory, 'objects', sha + '.bin'));
    db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes,sha256=excluded.sha256,content_type=excluded.content_type,saved_at=excluded.saved_at,transport=excluded.transport').run(id, parsed.origin, path, bytes.length, sha, mime ?? '', new Date().toISOString(), transport);
    record(url,200,'saved:'+transport);status.captured++; return true;
  }
  async function download(url, headers={}) {
    if(!assetUrl(url))return false;
    if(cached(url)){status.cacheHits++;return true;}
    if(inFlight.has(url))return inFlight.get(url);
    let done;const promise=new Promise(resolve=>done=resolve);inFlight.set(url,promise);
    queue.push({url,headers,done});status.queued=queue.length;pump();return promise;
  }
  function pump(){
    while(!closed&&status.downloading<2&&queue.length){const task=queue.shift();status.queued=queue.length;status.downloading++;
      void (async()=>{
        let result=false;try{
          const headers={};for(const [name,value]of Object.entries(task.headers))if(['user-agent','accept','referer','origin','cookie'].includes(name.toLowerCase()))headers[name]=String(value);
          const response=await fetchAsset(task.url,{headers,redirect:'manual',signal:AbortSignal.timeout(90000)});
          if(response.status!==200){record(task.url,response.status,'download-http-error');throw new Error('HTTP '+response.status);}
          const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>128*1024*1024)throw new Error('oversize');chunks.push(Buffer.from(chunk));}
          const bytes=Buffer.concat(chunks),length=response.headers.get('content-length');
          if(!response.headers.get('content-encoding')&&length!==null&&Number(length)!==bytes.length)throw new Error('incomplete');
          result=save(task.url,bytes,response.headers.get('content-type')??'','direct-binary');
          if(!result)throw new Error('invalid-asset');status.downloads++;
        }catch(error){if(!closed){status.downloadFailures++;record(task.url,0,'download-failed:'+(/HTTP \d+|oversize|incomplete|invalid-asset/.test(error.message)?error.message:'network-error'));}}
        finally{task.done(result);inFlight.delete(task.url);status.downloading--;if(!closed)pump();}
      })();
    }
  }
  const server = http.createServer((request, reply) => {
    if (request.url === '/healthz') { reply.setHeader('content-type','application/json'); reply.end(JSON.stringify({ok:true,proxy:`http://127.0.0.1:${port}`,debugPort,...status})); return; }
    let url; try { url = new URL(request.url); } catch { reply.writeHead(400).end(); return; }
    if (!['http:', 'https:'].includes(url.protocol)) { reply.writeHead(400).end(); return; }
    status.httpRequests++;
    if(request.method==='GET'&&assetUrl(url.href)){const saved=cached(url.href);if(saved){status.cacheHits++;reply.writeHead(200,{'content-type':saved.content_type,'content-length':saved.bytes});reply.end(saved.body);return;}}
    const headers = { ...request.headers, host: url.host }; delete headers['proxy-connection']; delete headers['proxy-authorization'];
    const outgoing = (url.protocol === 'https:' ? https : http).request(url, { method: request.method, headers }, incoming => {
      reply.writeHead(incoming.statusCode ?? 502, incoming.headers);
      const chunks = []; let size = 0, candidate = request.method === 'GET' && incoming.statusCode === 200 && assetUrl(url.href);
      incoming.on('data', chunk => { if(candidate) { size += chunk.length; if(size <= 128*1024*1024) chunks.push(chunk); else candidate=false; } });
      incoming.on('end', () => { if(candidate)try{let b=Buffer.concat(chunks);const encoding=incoming.headers['content-encoding'];if(encoding==='gzip')b=gunzipSync(b);else if(encoding==='deflate')b=inflateSync(b);else if(encoding==='br')b=brotliDecompressSync(b);if(!save(url.href,b,incoming.headers['content-type'],'http-proxy'))void download(url.href,request.headers);}catch{void download(url.href,request.headers);} });
      incoming.pipe(reply);
    });
    outgoing.setTimeout(30000, () => outgoing.destroy(new Error('Upstream timeout')));
    outgoing.on('error', () => { if(!reply.headersSent)reply.writeHead(502);reply.end(); });
    request.pipe(outgoing);
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close',()=>sockets.delete(socket)); });
  server.on('connect', (request, client, head) => {
    let host, remotePort;
    try { const url = new URL('http://' + request.url); host=url.hostname;remotePort=Number(url.port || 443); } catch { client.end('HTTP/1.1 400 Bad Request\r\n\r\n');return; }
    const remote = net.connect(remotePort,host); sockets.add(remote);remote.on('close',()=>sockets.delete(remote));
    remote.on('connect',()=>{status.httpsTunnels++;client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);client.pipe(remote);remote.pipe(client);});
    remote.on('error',()=>client.destroy());client.on('error',()=>remote.destroy());client.on('close',()=>remote.destroy());
  });
  function attach(target) {
    if(debuggers.has(target.id)) return;
    const ws = new WebSocket(target.webSocketDebuggerUrl); debuggers.set(target.id,ws);
    const responses = new Map(), pending = new Map(), requests = new Map(); let next=1;
    function send(method,params={}) { const id=next++;ws.send(JSON.stringify({id,method,params}));return id; }
    ws.addEventListener('open',()=>{status.debuggerReady=true;status.debugTargets=debuggers.size;send('Network.enable');});
    ws.addEventListener('message',event=>{
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.method==='Network.requestWillBeSent') {
        const r=message.params.request;if(assetUrl(r.url)&&r.method==='GET'){requests.set(message.params.requestId,r);record(r.url,0,'requested');}
      } else if(message.method==='Network.responseReceived') {
        const r=message.params.response;if(assetUrl(r.url)){record(r.url,r.status,'response-observed');if(r.status===200){r.requestHeaders=requests.get(message.params.requestId)?.headers??{};responses.set(message.params.requestId,r);}requests.delete(message.params.requestId);}
      } else if(message.method==='Network.loadingFinished') {
        const r=responses.get(message.params.requestId);if(r){responses.delete(message.params.requestId);pending.set(send('Network.getResponseBody',{requestId:message.params.requestId}),r);}
      } else if(pending.has(message.id)) {
        const r=pending.get(message.id);pending.delete(message.id);
        if(message.error || !message.result){status.bodyUnavailable++;void download(r.url,r.requestHeaders);return;}
        // Text conversion of compressed XML/SWF destroys binary bytes. Obtain
        // those from the origin, even when CEF claims a textual response body.
        const textualBinary=!message.result.base64Encoded && /\.(?:swf|bswf|dat|xml)(?:\?|$)/i.test(r.url) && (!/^\s*(?:\uFEFF)?\s*</.test(message.result.body)||message.result.body.includes('\uFFFD'));
        if(textualBinary || !save(r.url,Buffer.from(message.result.body,message.result.base64Encoded?'base64':'utf8'),r.mimeType,'cef-debugger'))void download(r.url,r.requestHeaders);
      }
    });
    ws.addEventListener('error',()=>{});ws.addEventListener('close',()=>{debuggers.delete(target.id);status.debugTargets=debuggers.size;status.debuggerReady=debuggers.size>0;});
  }
  async function discover() {
    try { const r=await fetch(`http://127.0.0.1:${debugPort}/json/list`,{signal:AbortSignal.timeout(1000)});for(const target of await r.json())if(target.type==='page'&&target.webSocketDebuggerUrl)attach(target); } catch {}
  }
  return { server, status, save, download, async start() {
    await new Promise((done,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',done);});
    // Repair previously captured text-corrupted binary resources from their
    // original URL; preserved object files remain available for diagnostics.
    for(const row of db.prepare('SELECT origin,path FROM assets').all())if(!cached(row.origin+row.path))void download(row.origin+row.path);
    for(const row of db.prepare('SELECT origin,path FROM requests ORDER BY observed_at DESC LIMIT 500').all())if(!cached(row.origin+row.path))void download(row.origin+row.path);
    if(enableDebugger){await discover();timer=setInterval(discover,2000);}return server.address();
  }, async close(){closed=true;if(timer)clearInterval(timer);for(const task of queue.splice(0))task.done(false);for(const ws of debuggers.values())ws.close();for(const socket of sockets)socket.destroy();await new Promise(done=>server.close(done));await Promise.allSettled([...inFlight.values()]);db.close();} };
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const gateway=createExternalGateway({directory:resolve('data/external-oas')});
  await gateway.start();console.log(JSON.stringify({event:'external-gateway-ready',proxy:'http://127.0.0.1:8090',debugPort:9223,cache:'data/external-oas',tls:'CONNECT unchanged; asset bodies via optional local CEF debugger'}));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void gateway.close().then(()=>process.exit()));
}
