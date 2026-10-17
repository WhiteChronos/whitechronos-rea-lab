import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readProject,readJson,writeJsonAtomic,withProjectLock,recordEvent} from './store.mjs';
import {assertNoLinks,within,normalizeName} from './paths.mjs';
import {validatePublicationManifest} from './publication-manifest.mjs';

const STATES=new Set(['validating','local-prepared','remote-created','published','failed','unknown']);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const validSha=value=>typeof value==='string'&&/^[a-f0-9]{40,64}$/.test(value);
function identity(repository,state){
 return repository&&Number.isSafeInteger(repository.id)&&repository.id>0&&repository.owner===state.owner&&repository.name===state.repo&&repository.private===true&&repository.url===`https://github.com/${state.owner}/${state.repo}`;
}
function journal(workspace){
 const file=within(workspace,'events.jsonl');
 if(fs.statSync(file).size>16*1024*1024)throw Error('Diário excede o limite de leitura.');
 try{return fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(event=>event.type==='publication-state');}
 catch{throw Error('Diário de publicação inválido.');}
}
/** Private association, not a claim that the product or engine is functional. */
export function readPublication(workspace){
 const project=readProject(workspace),file=within(workspace,'publication.json'),events=journal(workspace);
 if(!fs.existsSync(file)){
  if(events.length)throw Error('Estado de publicação ausente com diário existente.');
  return{state:'not-requested'};
 }
 const state=readJson(file);
 if(state.schemaVersion!==1||state.projectId!==project.id||!STATES.has(state.state)||state.owner!=='WhiteChronos'||typeof state.repo!=='string'||normalizeName(state.repo)!==state.repo||state.repo!==project.name||state.visibility!=='private'||!/^[a-f0-9]{64}$/.test(state.manifestHash??'')||typeof state.operationId!=='string'||typeof state.revision!=='string'||typeof state.createIntent!=='boolean'||(state.repository!==null&&!identity(state.repository,state))||(state.commitSha!==null&&!validSha(state.commitSha)))throw Error('Estado de publicação inválido.');
 if(events.at(-1)?.revision!==state.revision||events.at(-1)?.operationId!==state.operationId||events.at(-1)?.projectId!==project.id||events.at(-1)?.stateHash!==hash(JSON.stringify(state)))throw Error('Estado de publicação divergente do diário.');
 if(state.state==='published'&&(!state.repository||!state.commitSha))throw Error('Estado publicado inválido.');
 return state;
}
function persist(workspace,state,stage,code=null){
 state={...state,state:stage,code,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};
 writeJsonAtomic(within(workspace,'publication.json'),state);
 recordEvent(workspace,{type:'publication-state',projectId:state.projectId,operationId:state.operationId,revision:state.revision,state:stage,code,stateHash:hash(JSON.stringify(state))});
 return state;
}
function prepareStaging(workspace,manifest,files){
 const parent=within(workspace,'publication-staging');assertNoLinks(parent);fs.mkdirSync(parent,{recursive:true});
 const directory=within(parent,crypto.randomUUID());fs.mkdirSync(directory,{mode:0o700});
 for(const entry of files){
  const source=within(manifest.deliveryRoot,entry.path),stat=fs.lstatSync(source);
  if(!stat.isFile()||stat.nlink!==1||stat.size>16*1024*1024)throw Error('Arquivo da entrega alterado antes da cópia.');
  const fd=fs.openSync(source,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
  let body;
  try{
   const opened=fs.fstatSync(fd);
   if(!opened.isFile()||opened.nlink!==1||opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size)throw Error('Arquivo da entrega alterado durante cópia.');
   const buffer=Buffer.alloc(stat.size+1);let count=0;
   while(count<buffer.length){const n=fs.readSync(fd,buffer,count,buffer.length-count,null);if(!n)break;count+=n;}
   if(count!==stat.size)throw Error('Arquivo da entrega alterado durante cópia.');
   body=buffer.subarray(0,count);
  }finally{fs.closeSync(fd);}
  if(hash(body)!==entry.sha256)throw Error('Hash da entrega alterado antes da publicação.');
  const destination=within(directory,entry.path);fs.mkdirSync(path.dirname(destination),{recursive:true});assertNoLinks(destination);
  fs.writeFileSync(destination,body,{flag:'wx',mode:0o600});
 }
 return directory;
}
async function invoke(adapter,name,args){
 try{const result=await adapter[name](args);return result&&typeof result==='object'?result:{ok:false};}
 catch{return{ok:false};} // Never persist raw process or adapter exception text.
}
/** Creates a private repository once, only for explicit own-product files. */
export async function publishProject(workspace,{owner,repo,visibility='private',manifest}={},dependencies={}){
 if(owner!=='WhiteChronos'||typeof repo!=='string'||normalizeName(repo)!==repo||visibility!=='private')throw Error('Proprietário, nome ou visibilidade de publicação inválidos.');
 return withProjectLock(workspace,async()=>{
  const project=readProject(workspace),validated=validatePublicationManifest(workspace,manifest);
  if(repo!==project.name)throw Error('Nome do repositório deve corresponder ao programa.');
  const files=[...validated.files].sort((a,b)=>a.path.localeCompare(b.path));
  const manifestHash=hash(JSON.stringify({programId:validated.programId,files}));
  let state=readPublication(workspace);
  if(state.state!=='not-requested'&&(state.projectId!==project.id||state.owner!==owner||state.repo!==repo||state.manifestHash!==manifestHash))throw Error('Associação de publicação não pode trocar identidade, nome ou entrega.');
  if(state.state==='not-requested')state=persist(workspace,{schemaVersion:1,projectId:project.id,operationId:crypto.randomUUID(),owner,repo,visibility,manifestHash,repository:null,commitSha:null,createIntent:false},'validating');
  const adapter=dependencies.adapter??(await import('./github.mjs')).createGithubAdapter();
  const fail=(stage,code)=>{state=persist(workspace,state,stage,code);return state;};
  const auth=await invoke(adapter,'inspectAuth',{owner,cwd:workspace});
  if(!auth.ok)return fail('failed',['TOOL_UNAVAILABLE','AUTH_REQUIRED','OWNER_MISMATCH'].includes(auth.code)?auth.code:'AUTH_REQUIRED');
  if(typeof auth.login!=='string'||auth.login.toLowerCase()!==owner.toLowerCase())return fail('failed','OWNER_MISMATCH');
  if(state.repository&&state.commitSha){
   const verify=await invoke(adapter,'verifyRemote',{owner,name:repo,cwd:workspace,repositoryId:state.repository.id,commitSha:state.commitSha});
   if(!verify.ok)return fail('unknown','REMOTE_VERIFICATION_REQUIRED');
   if(!identity(verify.repository,state)||verify.repository.id!==state.repository.id||verify.commitSha!==state.commitSha)return fail('unknown','REMOTE_IDENTITY_MISMATCH');
   return fail('published',null);
  }
  if(state.createIntent&&!state.repository){
   // Lookup is informative only. A repository found after an interrupted create
   // cannot be adopted without a persisted identity proving this operation owns it.
   await invoke(adapter,'lookupRepo',{owner,name:repo,cwd:workspace});
   return fail('unknown','CREATION_RECONCILIATION_REQUIRED');
  }
  if(state.repository){
   const lookup=await invoke(adapter,'lookupRepo',{owner,name:repo,cwd:workspace});
   if(!lookup.ok)return fail('failed','REMOTE_LOOKUP_FAILED');
   if(!lookup.exists||!identity(lookup.repository,state)||lookup.repository.id!==state.repository.id)return fail('failed','REMOTE_IDENTITY_MISMATCH');
  }
  let staging;
  try{staging=prepareStaging(workspace,manifest,files);}
  catch{return fail('failed','DELIVERY_CHANGED');}
  state=persist(workspace,state,'local-prepared');
  if(!state.repository){
   const lookup=await invoke(adapter,'lookupRepo',{owner,name:repo,cwd:staging});
   if(!lookup.ok)return fail('failed','REMOTE_LOOKUP_FAILED');
   if(lookup.exists!==false)return fail('failed',lookup.exists===true?'REPOSITORY_COLLISION':'REMOTE_LOOKUP_FAILED');
   state=persist(workspace,{...state,createIntent:true},'local-prepared');
   const created=await invoke(adapter,'createPrivateRepo',{owner,name:repo,cwd:staging});
   if(!created.ok||!identity(created.repository,state))return fail('unknown','CREATION_RECONCILIATION_REQUIRED');
   const {id,name,owner:repositoryOwner,url,private:isPrivate}=created.repository;
   state=persist(workspace,{...state,repository:{id,name,owner:repositoryOwner,url,private:isPrivate}},'remote-created');
  }
  const pushed=await invoke(adapter,'pushCommit',{owner,name:repo,cwd:staging,files,repositoryId:state.repository.id});
  if(validSha(pushed.commitSha))state=persist(workspace,{...state,commitSha:pushed.commitSha},'remote-created');
  if(!pushed.ok||!validSha(pushed.commitSha))return fail(pushed.commitSha?'unknown':'failed','PUSH_VERIFICATION_REQUIRED');
  const verified=await invoke(adapter,'verifyRemote',{owner,name:repo,cwd:staging,repositoryId:state.repository.id,commitSha:state.commitSha});
  if(!verified.ok)return fail('unknown','REMOTE_VERIFICATION_REQUIRED');
  if(!identity(verified.repository,state)||verified.repository.id!==state.repository.id||verified.commitSha!==state.commitSha)return fail('unknown','REMOTE_IDENTITY_MISMATCH');
  return fail('published',null);
 });
}
