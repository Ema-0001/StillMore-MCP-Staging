import {createPublicKey,verify} from "node:crypto";
import {ContractError} from "./contract.mjs";

const decode=value=>JSON.parse(Buffer.from(value,"base64url").toString("utf8"));
const cache=new Map();
async function keys(uri){const hit=cache.get(uri);if(hit&&hit.until>Date.now())return hit.value;const response=await fetch(uri,{headers:{accept:"application/json"},signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error("JWKS unavailable");const body=await response.json();if(!Array.isArray(body.keys))throw new Error("Invalid JWKS");cache.set(uri,{value:body.keys,until:Date.now()+300_000});return body.keys;}
const unauthorized=()=>new ContractError("unauthorized","Invalid or expired bearer token.");
export function createJwtVerifier({issuer,audience,jwksUri,loadKeys=keys}){
 if(!issuer||!audience||!jwksUri)throw new Error("issuer, audience and jwksUri are required");
 return async token=>{
  if(typeof token!=="string"||token.length>16_384)throw unauthorized();
  const parts=token.split(".");if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))throw unauthorized();
  let header,payload;try{header=decode(parts[0]);payload=decode(parts[1]);}catch{throw unauthorized();}
  if(!header||!payload||!["RS256","ES256"].includes(header.alg)||typeof header.kid!=="string")throw unauthorized();
  const now=Date.now()/1000;
  // NumericDate must be a finite number; missing/string exp used to bypass expiry checks.
  if(payload.iss!==issuer||!(payload.aud===audience||Array.isArray(payload.aud)&&payload.aud.includes(audience))||typeof payload.sub!=="string"||!payload.sub.trim()||!Number.isFinite(payload.exp)||payload.exp<=now||payload.nbf!==undefined&&(!Number.isFinite(payload.nbf)||payload.nbf>now)||payload.scope!==undefined&&typeof payload.scope!=="string")throw unauthorized();
  const jwk=(await loadKeys(jwksUri)).find(key=>key.kid===header.kid&&(!key.use||key.use==="sig")&&(!key.alg||key.alg===header.alg)&&(!key.key_ops||key.key_ops.includes("verify"))&&(header.alg==="RS256"?key.kty==="RSA":key.kty==="EC"&&key.crv==="P-256"));
  if(!jwk)throw unauthorized();
  let valid=false;
  try{const key=createPublicKey({key:jwk,format:"jwk"});valid=verify(header.alg==="RS256"?"RSA-SHA256":"sha256",Buffer.from(`${parts[0]}.${parts[1]}`),header.alg==="ES256"?{key,dsaEncoding:"ieee-p1363"}:key,Buffer.from(parts[2],"base64url"));}catch{throw unauthorized();}
  if(!valid)throw unauthorized();
  return{userId:payload.sub,scopes:(payload.scope??"").split(/\s+/).filter(Boolean)};
 };
}
export function createDevelopmentVerifier(secret){if(!secret||secret.length<32)throw new Error("A development token of at least 32 characters is required.");return async token=>{if(token!==secret)throw new ContractError("unauthorized","Invalid bearer token.");return{userId:"development-user",scopes:["stillmore:read","stillmore:write","stillmore:sync"]};};}
export function bearer(request){const value=request.headers.authorization;if(typeof value!=="string"||!value.startsWith("Bearer "))throw new ContractError("unauthorized","Bearer authorization required.");return value.slice(7);}
