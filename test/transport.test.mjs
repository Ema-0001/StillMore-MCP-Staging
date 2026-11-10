import test,{after} from "node:test";
import assert from "node:assert/strict";
process.env.PUBLIC_BASE_URL="http://127.0.0.1:8787";
delete process.env.OAUTH_ISSUER;
delete process.env.STILLMORE_UPSTREAM_URL;
process.env.STILLMORE_DEV_TOKEN="synthetic-transport-test-token-000000000000";
const {server}=await import("../src/server.mjs");
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${server.address().port}`;
after(()=>new Promise(resolve=>server.close(resolve)));
function rpc(body,authorized=true){return fetch(base+"/mcp",{method:"POST",headers:{"content-type":"application/json",...(authorized?{authorization:`Bearer ${process.env.STILLMORE_DEV_TOKEN}`}:{})},body:JSON.stringify({jsonrpc:"2.0",...body})});}
test("MCP negotiates client-supported protocol versions",async()=>{for(const protocolVersion of ["2024-11-05","2025-03-26","2025-06-18","2025-11-25"]){const response=await rpc({id:1,method:"initialize",params:{protocolVersion}}),body=await response.json();assert.equal(body.result.protocolVersion,protocolVersion);assert.ok(body.result.capabilities.tools);}});
test("notification acknowledgements contain no JSON-RPC response body",async()=>{const response=await rpc({method:"notifications/initialized"});assert.equal(response.status,202);assert.equal(await response.text(),"");});
test("tool discovery exposes the recipe save and shopping actions",async()=>{const response=await rpc({id:2,method:"tools/list"}),body=await response.json(),names=body.result.tools.map(t=>t.name);assert.ok(names.includes("save_meal_plan"));assert.ok(names.includes("add_shopping_items"));});
test("tool failures use MCP isError so the assistant can recover",async()=>{const response=await rpc({id:3,method:"tools/call",params:{name:"list_inventory",arguments:{}}}),body=await response.json();assert.equal(body.result.isError,true);assert.equal(body.error,undefined);assert.equal(JSON.parse(body.result.content[0].text).code,"not_linked");});
test("unauthenticated clients receive the OAuth resource challenge",async()=>{const response=await rpc({id:4,method:"tools/list"},false);assert.equal(response.status,401);assert.match(response.headers.get("www-authenticate"),/oauth-protected-resource/);});
test("path-scoped discovery and standard ping work",async()=>{for(const path of ["/.well-known/oauth-protected-resource","/.well-known/oauth-protected-resource/mcp","/.well-known/oauth-protected-resource/mcp/v2"]){const response=await fetch(base+path);assert.equal(response.status,200);assert.equal((await response.json()).resource_name,"StillMore");}const response=await rpc({id:5,method:"ping"});assert.deepEqual((await response.json()).result,{});});
test("unsupported streaming methods return the required method-not-allowed response",async()=>{const response=await fetch(base+"/mcp");assert.equal(response.status,405);assert.equal(response.headers.get("allow"),"POST");});
