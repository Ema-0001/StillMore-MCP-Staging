import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {mkdirSync,readFileSync,renameSync,writeFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {FileRepository} from "./repository.mjs";
import {ContractError} from "./contract.mjs";

export function storageKey(value){if(typeof value!=="string"||!/^[A-Za-z0-9+/]{43}=$/.test(value))throw new Error("STILLMORE_STORAGE_KEY must be a base64-encoded 32-byte key.");const key=Buffer.from(value,"base64");if(key.length!==32)throw new Error("Invalid storage key.");return key;}
function seal(value,key,context){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from(context));const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);return{format:"stillmore.encrypted.v1",iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),ciphertext:ciphertext.toString("base64")};}
function unseal(value,key,context){if(value?.format!=="stillmore.encrypted.v1")throw new Error("Encrypted storage required. Migrate existing plaintext records explicitly before production.");const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(value.iv,"base64"));decipher.setAAD(Buffer.from(context));decipher.setAuthTag(Buffer.from(value.tag,"base64"));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext,"base64")),decipher.final()]).toString("utf8"));}

// One server process per persistent directory. FileRepository serializes writes per user.
export class EncryptedFileRepository extends FileRepository{
 constructor(root,key){super(root);this.key=key;}
 async read(userId){const record=await super.read(userId);return record?unseal(record.payload,this.key,`snapshot:${userId}`):null;}
 async write(userId,value){if(value.userId!==userId)throw new ContractError("forbidden","Repository ownership mismatch.");return super.write(userId,{userId,payload:seal(value,this.key,`snapshot:${userId}`)});}
}

export class EncryptedDeviceLinkStore{
 constructor(root,key){this.path=join(resolve(root),"device-links.encrypted.json");this.key=key;}
 load(){try{return unseal(JSON.parse(readFileSync(this.path,"utf8")),this.key,"device-links");}catch(error){if(error?.code==="ENOENT")return{codes:[],tokens:[]};throw error;}}
 save(state){mkdirSync(dirname(this.path),{recursive:true});const tmp=`${this.path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;writeFileSync(tmp,JSON.stringify(seal(state,this.key,"device-links")),{mode:0o600});renameSync(tmp,this.path);}
}

export function productionStorage(env){
 if(!env.STILLMORE_DATA_DIR)throw new Error("Production requires an explicit persistent STILLMORE_DATA_DIR.");
 const root=resolve(env.STILLMORE_DATA_DIR),tempRoots=[env.TEMP,env.TMP,"/tmp","/var/tmp"].filter(Boolean).map(p=>resolve(p));
 if(tempRoots.some(temp=>root===temp||root.startsWith(temp+"/")||root.startsWith(temp+"\\")))throw new Error("Production storage cannot use a temporary directory.");
 const key=storageKey(env.STILLMORE_STORAGE_KEY);
 return{repository:new EncryptedFileRepository(join(root,"snapshots"),key),deviceLinkStore:new EncryptedDeviceLinkStore(root,key)};
}
