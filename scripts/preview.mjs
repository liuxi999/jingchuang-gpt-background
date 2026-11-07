import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPayload} from '../runtime/integration.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const payload=await buildPayload(join(root,'runtime'));
const reattachPayload=await buildPayload(join(root,'runtime'),{playStartup:false,stopToken:'preview-session'});
const routes=new Map([['/',['tests/host.html','text/html']],['/host.css',['tests/host.css','text/css']],['/host.mjs',['tests/host.mjs','text/javascript']]]);
routes.set('/surfaces.html',['tests/surfaces.html','text/html']);routes.set('/surfaces.css',['tests/surfaces.css','text/css']);routes.set('/surfaces.mjs',['tests/surfaces.mjs','text/javascript']);
const server=createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://127.0.0.1'),path=url.pathname;
    const route=routes.get(path);
    if(path!=='/payload.mjs'&&!route){res.writeHead(404);res.end();return;}
    const data=path==='/payload.mjs'?Buffer.from(url.searchParams.has('reattach')?reattachPayload:payload):await readFile(join(root,route[0]));
    res.writeHead(200,{'Content-Type':(path==='/payload.mjs'?'text/javascript':route[1])+'; charset=utf-8','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src blob:; connect-src 'none'; object-src 'none'; base-uri 'none'"});
    res.end(req.method==='HEAD'?'':data);
  }catch{res.writeHead(500);res.end('Preview unavailable');}
});
const port=Number(process.argv.find(x=>x.startsWith('--port='))?.slice(7)||0);
server.listen(port,'127.0.0.1',()=>console.log('模拟 GPT 宿主，非真实客户端：http://127.0.0.1:'+server.address().port+'/'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
