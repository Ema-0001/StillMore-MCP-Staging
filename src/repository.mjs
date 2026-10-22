import {mkdir,readFile,rename,rm,writeFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {createHash} from "node:crypto";
import {ContractError} from "./contract.mjs";

export class MemoryRepository {
  #values=new Map();
  async read(userId){const value=this.#values.get(userId);return value?structuredClone(value):null;}
  async write(userId,value){if(value.userId!==userId)throw new ContractError("forbidden","Repository ownership mismatch.");this.#values.set(userId,structuredClone(value));}
  async delete(userId){this.#values.delete(userId);}
}

export class FileRepository {
  #queues=new Map();
  constructor(root){this.root=root;}
  path(userId){const digest=createHash("sha256").update(userId).digest("hex");return join(this.root,`${digest}.json`);}
  async read(userId){try{const parsed=JSON.parse(await readFile(this.path(userId),"utf8"));if(parsed.userId!==userId)throw new ContractError("forbidden","Repository ownership mismatch.");return parsed;}catch(error){if(error?.code==="ENOENT")return null;throw error;}}
  async write(userId,value){if(value.userId!==userId)throw new ContractError("forbidden","Repository ownership mismatch.");const previous=this.#queues.get(userId)??Promise.resolve();const next=previous.then(async()=>{const path=this.path(userId),temp=`${path}.${process.pid}.${Date.now()}.tmp`;await mkdir(dirname(path),{recursive:true});await writeFile(temp,JSON.stringify(value),{encoding:"utf8",mode:0o600});await rename(temp,path);});this.#queues.set(userId,next.catch(()=>{}));return next;}
  async delete(userId){await rm(this.path(userId),{force:true});}
}
