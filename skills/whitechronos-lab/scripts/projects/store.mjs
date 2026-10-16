import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {normalizeName,assertSeparatePaths,assertNoLinks,within} from './paths.mjs';

export function writeJsonAtomic(file,value,io=fs){
 assertNoLinks(file);const tmp=file+'.'+crypto.randomUUID()+'.tmp';
 try{io.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});io.renameSync(tmp,file);}
 finally{if(io.existsSync(tmp))io.unlinkSync(tmp);}
}
export function readJson(file){assertNoLinks(file);if(fs.statSync(file).size>4*1024*1024)throw Error('Estado excede 4 MiB.');return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
export function readProject(workspace){
 const p=readJson(within(workspace,'project.json'));
 if(p.schemaVersion!==1)throw Error('schemaVersion não suportada.');
 if(!['independent','reuse'].includes(p.mode)||typeof p.id!=='string'||typeof p.target!=='string'||normalizeName(p.name)!==p.name)throw Error('Manifesto inválido.');
 assertSeparatePaths({target:p.target,workspace,destination:p.destination});return p;
}
export function createProject({target,name,workspace,mode}){
 if(!['independent','reuse'].includes(mode))throw Error('Mode independent ou reuse obrigatório.');
 const finalName=normalizeName(name);target=assertNoLinks(target);workspace=assertNoLinks(workspace);
 assertSeparatePaths({target,workspace});if(!fs.statSync(target).isDirectory())throw Error('Alvo deve ser diretório.');
 const revision=spawnSync('git',['-C',target,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).stdout?.trim();
 const now=new Date().toISOString();
 const p={schemaVersion:1,id:crypto.randomUUID(),journalRevision:crypto.randomUUID(),originalName:name,name:finalName,target,format:'unverified',revision:revision&&/^[a-f0-9]{40,64}$/.test(revision)?revision:null,sourceHashes:{},mode,createdAt:now,updatedAt:now};
 fs.mkdirSync(workspace);writeJsonAtomic(path.join(workspace,'project.json'),p);writeJsonAtomic(path.join(workspace,'tasks.json'),[]);
 fs.mkdirSync(path.join(workspace,'runs'));fs.mkdirSync(path.join(workspace,'reports'));
 fs.writeFileSync(path.join(workspace,'events.jsonl'),JSON.stringify({type:'created',at:now,projectId:p.id,journalRevision:p.journalRevision})+'\n',{flag:'wx'});return p;
}
export async function withProjectLock(workspace,callback){
 readProject(workspace);const file=within(workspace,'.project.lock');let fd;
 try{fd=fs.openSync(file,'wx');}catch(e){if(e.code==='EEXIST')throw Error('Workspace bloqueado por outro escritor; inspecione o bloqueio.');throw e;}
 try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));return await callback();}
 finally{fs.closeSync(fd);fs.unlinkSync(file);}
}
export function recordEvent(workspace,event){
 try{fs.appendFileSync(within(workspace,'events.jsonl'),JSON.stringify({...event,at:new Date().toISOString()})+'\n');}
 catch(e){throw Error('Estado gravado, mas diário divergente: '+e.message);}
}
