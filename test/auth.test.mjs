import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {createJwtVerifier} from "../src/auth.mjs";
const issuer="https://identity.invalid/",audience="https://stillmore.invalid/mcp";
const pair=generateKeyPairSync("rsa",{modulusLength:2048});
const claims=()=>({iss:issuer,aud:audience,sub:"synthetic-user",exp:Math.floor(Date.now()/1000)+300,scope:"stillmore:read"});
function token(payload,alg="RS256",keys=pair){const header=Buffer.from(JSON.stringify({alg,kid:"test-key"})).toString("base64url"),body=Buffer.from(JSON.stringify(payload)).toString("base64url"),input=`${header}.${body}`,signature=sign("sha256",Buffer.from(input),alg==="ES256"?{key:keys.privateKey,dsaEncoding:"ieee-p1363"}:keys.privateKey);return`${input}.${signature.toString("base64url")}`;}
function verifier(keys=pair,alg="RS256"){return createJwtVerifier({issuer,audience,jwksUri:issuer+"jwks",loadKeys:async()=>[{...keys.publicKey.export({format:"jwk"}),kid:"test-key",alg,use:"sig"}]});}
test("valid OAuth tokens retain the authenticated account and its original scopes",async()=>{assert.deepEqual(await verifier()(token(claims())),{userId:"synthetic-user",scopes:["stillmore:read"]});});
test("expiry is mandatory and must be a finite NumericDate",async()=>{for(const exp of [undefined,null,"9999999999",0,Math.floor(Date.now()/1000)-1])await assert.rejects(()=>verifier()(token({...claims(),exp})),e=>e.code==="unauthorized");});
test("future and malformed nbf claims are rejected",async()=>{for(const nbf of ["tomorrow",null,Date.now()/1000+300])await assert.rejects(()=>verifier()(token({...claims(),nbf})),e=>e.code==="unauthorized");});
test("wrong audience, issuer, subject and scope types are rejected",async()=>{for(const patch of [{aud:"other"},{iss:"other"},{sub:""},{scope:["stillmore:write"]}])await assert.rejects(()=>verifier()(token({...claims(),...patch})),e=>e.code==="unauthorized");});
test("a changed payload cannot reuse a valid signature",async()=>{const signed=token(claims()).split(".");signed[1]=Buffer.from(JSON.stringify({...claims(),sub:"other-user"})).toString("base64url");await assert.rejects(()=>verifier()(signed.join(".")),e=>e.code==="unauthorized");});
test("ES256 accepts the standard JOSE fixed-width signature encoding",async()=>{const ec=generateKeyPairSync("ec",{namedCurve:"prime256v1"});assert.equal((await verifier(ec,"ES256")(token(claims(),"ES256",ec))).userId,"synthetic-user");});
test("malformed tokens return an authentication error",async()=>{for(const value of [null,"a.b.c","e30.bnVsbA.AA","x".repeat(17000)])await assert.rejects(()=>verifier()(value),e=>e.code==="unauthorized");});
