import {createServer} from "node:http";
import {resolve} from "node:path";
import {FileRepository} from "./repository.mjs";
import {bearer,createDevelopmentVerifier,createJwtVerifier} from "./auth.mjs";
import {ContractError} from "./contract.mjs";
import {callTool,toolDefinitions} from "./domain.mjs";
import {acknowledgeOperation,pullSnapshot,pushSnapshot,readJson} from "./sync.mjs";
import {DeviceLinkService} from "./device-links.mjs";

const port=Number(process.env.PORT??8787);
const host=process.env.HOST??(process.env.PUBLIC_BASE_URL?"0.0.0.0":"127.0.0.1");
const base=(process.env.PUBLIC_BASE_URL??`http://127.0.0.1:${port}`).replace(/\/$/,"");
const resource=`${base}/mcp`,issuer=process.env.OAUTH_ISSUER;
if(!issuer&&!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base))throw new Error("A public MCP deployment requires OAUTH_ISSUER.");
const repository=new FileRepository(resolve(process.env.STILLMORE_DATA_DIR??".stillmore-mcp-data"));
const verifyToken=issuer
 ? createJwtVerifier({issuer,audience:process.env.OAUTH_AUDIENCE??resource,jwksUri:process.env.OAUTH_JWKS_URI})
 : createDevelopmentVerifier(process.env.STILLMORE_DEV_TOKEN??"development-only-token-change-me-123456789");
const deviceLinks=new DeviceLinkService();
const json=(res,status,body,headers={})=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers});res.end(JSON.stringify(body));};
const failure=(res,error)=>{const known=error instanceof ContractError,status=error.code==="unauthorized"?401:error.code==="forbidden"?403:error.code==="not_found"?404:error.code==="payload_too_large"?413:error.code==="sync_conflict"||error.code==="conflict"?409:known?400:500,headers=status===401?{"www-authenticate":`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`}:{};json(res,status,{error:known?error.code:"internal_error",message:known?error.message:"Unexpected server error.",details:known?error.details:undefined},headers);};
const authenticate=async req=>{const token=bearer(req),device=deviceLinks.verify(token);return device??verifyToken(token);};

const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url??"/",base);
 if(req.method==="GET"&&url.pathname==="/health")return json(res,200,{ok:true,service:"stillmore-mcp"});
 if(req.method==="GET"&&url.pathname==="/.well-known/oauth-protected-resource")return json(res,200,{resource,authorization_servers:issuer?[issuer]:[],scopes_supported:["stillmore:read","stillmore:write","stillmore:sync"],resource_name:"StillMore"});
 if(req.method==="POST"&&url.pathname==="/mcp"){
  const identity=await authenticate(req),body=await readJson(req),id=body.id??null;
  if(body.method==="initialize")return json(res,200,{jsonrpc:"2.0",id,result:{protocolVersion:"2025-11-25",capabilities:{tools:{}},serverInfo:{name:"StillMore",version:"0.1.0"}}});
  if(body.method==="notifications/initialized")return json(res,202,{});
  if(body.method==="tools/list")return json(res,200,{jsonrpc:"2.0",id,result:{tools:toolDefinitions}});
  if(body.method==="tools/call"){try{const result=body.params?.name==="create_device_link"?deviceLinks.create(identity):await callTool(repository,identity,body.params?.name,body.params?.arguments??{});return json(res,200,{jsonrpc:"2.0",id,result:{content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result}});}catch(error){const data=error instanceof ContractError?{code:error.code,details:error.details}:undefined;return json(res,200,{jsonrpc:"2.0",id,error:{code:-32000,message:error instanceof Error?error.message:"Tool failed",data}});}}
  return json(res,200,{jsonrpc:"2.0",id,error:{code:-32601,message:"Method not found"}});
 }
 if(url.pathname==="/v1/device-links/exchange"&&req.method==="POST"){const body=await readJson(req);return json(res,200,deviceLinks.exchange(body.code,body.device_name));}
 if(url.pathname==="/v1/device-links/revoke"&&req.method==="POST"){try{const identity=await authenticate(req);deviceLinks.revoke(identity);}catch{}return json(res,200,{revoked:true});}
 if(url.pathname==="/v1/sync/pull"&&req.method==="GET")return json(res,200,await pullSnapshot(repository,await authenticate(req),url.searchParams.get("since_revision")??undefined));
 if(url.pathname==="/v1/sync/push"&&req.method==="POST")return json(res,200,await pushSnapshot(repository,await authenticate(req),await readJson(req)));
 if(url.pathname==="/v1/sync/operations/acknowledge"&&req.method==="POST")return json(res,200,await acknowledgeOperation(repository,await authenticate(req),await readJson(req)));
 if(url.pathname==="/v1/sync/data"&&req.method==="DELETE"){const identity=await authenticate(req);await repository.delete(identity.userId);return json(res,200,{deleted:true});}
 return json(res,404,{error:"not_found",message:"Route not found."});
 }catch(error){failure(res,error);}});

server.listen(port,host,()=>console.log(`StillMore MCP listening on ${base}`));
