import {readJson} from './sync.mjs';

const routes=new Map([
 ['/health',['GET']],
 ['/.well-known/oauth-protected-resource',['GET']],
 ['/.well-known/oauth-protected-resource/mcp',['GET']],
 ['/.well-known/oauth-protected-resource/mcp/v2',['GET']],
 ['/mcp',['POST','GET','DELETE']],['/mcp/v2',['POST','GET','DELETE']],
 ['/v1/device-links/exchange',['POST']],['/v1/device-links/revoke',['POST']],
 ['/v1/sync/pull',['GET']],['/v1/sync/push',['POST']],
 ['/v1/sync/operations/acknowledge',['POST']],['/v1/sync/data',['DELETE']]
]);
const respond=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};

// The configured HTTPS origin is trusted by the operator, never chosen by a request.
// Authentication and per-account authorization are enforced by that service.
export function createUpstreamProxy(value,{fetchImpl=fetch}={}){
 const base=new URL(value);
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/api/stillmore')throw Error('STILLMORE_UPSTREAM_URL must be an HTTPS /api/stillmore URL without credentials or query.');
 return async(req,res)=>{
  const incoming=new URL(req.url??'/','http://stillmore.invalid'),methods=routes.get(incoming.pathname);
  if(!methods)return respond(res,404,{error:'not_found'});
  if(!methods.includes(req.method)){res.writeHead(405,{allow:methods.join(', ')});return res.end();}
  const target=new URL(base);target.pathname=base.pathname+incoming.pathname;target.search=incoming.search;
  const headers={'accept':'application/json'};
  for(const name of ['authorization','mcp-protocol-version','mcp-session-id'])if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
  let body;
  if(req.method==='POST'){body=JSON.stringify(await readJson(req));headers['content-type']='application/json';}
  try{
   const response=await fetchImpl(target,{method:req.method,headers,body,redirect:'error',signal:AbortSignal.timeout(30000)});
   const outputHeaders={'cache-control':'no-store','x-content-type-options':'nosniff'};
   for(const name of ['content-type','www-authenticate','allow','mcp-session-id','mcp-protocol-version']){const value=response.headers.get(name);if(value)outputHeaders[name]=value;}
   const chunks=[];let bytes=0;
   if(response.body){const reader=response.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>6*1024*1024){await reader.cancel();throw Error('Upstream response too large.');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}}
   res.writeHead(response.status,outputHeaders);res.end(chunks.length?Buffer.concat(chunks):undefined);
  }catch{return respond(res,502,{error:'service_unavailable',message:'StillMore synchronization is temporarily unavailable. Your local inventory is unchanged.'});}
 };
}
