import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.json':'application/json; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,name==='/'?'index.html':'.'+name);
    if(relative(root,path).startsWith('..')||!types[extname(path)]){res.writeHead(404);res.end();return}
    const data=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)],'Cache-Control':'no-cache'});res.end(data);
  }catch{res.writeHead(404);res.end()}
});
server.listen(4187,'127.0.0.1',()=>console.log('UI references: http://127.0.0.1:4187/'));
