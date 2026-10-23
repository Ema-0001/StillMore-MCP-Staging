import {createHash,randomBytes,randomInt} from "node:crypto";
import {ContractError} from "./contract.mjs";

const hash=value=>createHash("sha256").update(value).digest("hex");
const normalize=value=>String(value??"").replace(/[^0-9]/g,"");
export class DeviceLinkService {
 #codes=new Map(); #tokens=new Map();
 constructor({codeLifetimeMs=600_000,tokenLifetimeMs=90*86_400_000}={}){this.codeLifetimeMs=codeLifetimeMs;this.tokenLifetimeMs=tokenLifetimeMs;}
 create(identity,now=Date.now()){for(const [key,value] of this.#codes)if(value.expiresAt<=now)this.#codes.delete(key);let code;do{code=String(randomInt(0,100_000_000)).padStart(8,"0");}while(this.#codes.has(hash(code)));const expiresAt=now+this.codeLifetimeMs;this.#codes.set(hash(code),{userId:identity.userId,expiresAt});return{code:`${code.slice(0,4)} ${code.slice(4)}`,expires_at:new Date(expiresAt).toISOString(),single_use:true};}
 exchange(rawCode,deviceName="StillMore Android",now=Date.now()){const code=normalize(rawCode);if(!/^\d{8}$/.test(code))throw new ContractError("invalid_link_code","Enter the 8-digit connection code.");const key=hash(code),record=this.#codes.get(key);this.#codes.delete(key);if(!record||record.expiresAt<=now)throw new ContractError("invalid_link_code","The connection code is invalid or expired.");const token=`sm1_${randomBytes(32).toString("base64url")}`,expiresAt=now+this.tokenLifetimeMs;this.#tokens.set(hash(token),{userId:record.userId,scopes:["stillmore:read","stillmore:write","stillmore:sync"],deviceName:String(deviceName).slice(0,80),expiresAt});return{access_token:token,token_type:"Bearer",expires_at:new Date(expiresAt).toISOString(),user_id:record.userId,account_label:"Connected assistant"};}
 verify(token,now=Date.now()){if(typeof token!=="string"||!token.startsWith("sm1_"))return null;const digest=hash(token),record=this.#tokens.get(digest);if(!record||record.expiresAt<=now){this.#tokens.delete(digest);throw new ContractError("unauthorized","Device connection expired. Link StillMore again.");}return{userId:record.userId,scopes:record.scopes,deviceName:record.deviceName,deviceTokenHash:digest};}
 revoke(identity){if(identity.deviceTokenHash)this.#tokens.delete(identity.deviceTokenHash);}
}
