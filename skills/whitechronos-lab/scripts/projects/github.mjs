import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {normalizeName,within,assertNoLinks} from './paths.mjs';

const messages={INVALID_INPUT:'Dados de publicação inválidos.',TOOL_UNAVAILABLE:'GitHub CLI indisponível.',AUTH_REQUIRED:'Autenticação do GitHub CLI necessária.',OWNER_MISMATCH:'A conta autenticada não corresponde ao proprietário autorizado.',LOOKUP_FAILED:'Não foi possível confirmar o repositório no GitHub.',REMOTE_MISMATCH:'A identidade ou privacidade do repositório não corresponde à publicação.',REPOSITORY_EXISTS:'O repositório já existe; criação recusada.',CREATE_UNKNOWN:'Resultado da criação desconhecido; reconciliação necessária.',ASSOCIATION_REQUIRED:'Identidade remota persistida necessária para enviar arquivos.',FILES_INVALID:'A seleção de arquivos para publicação é inválida.',GIT_FAILED:'A preparação Git ou o envio falhou.',VERIFY_FAILED:'Não foi possível confirmar o commit remoto.'};
const fail=(code,extra={})=>({ok:false,code,message:messages[code],...extra});
const validSha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
function validInput({owner,name,cwd}={}){
 try{return typeof owner==='string'&&owner.toLowerCase()==='whitechronos'&&normalizeName(name)===name&&typeof cwd==='string'&&path.isAbsolute(cwd);}catch{return false;}
}
function defaultRun(executable,args,{cwd,timeoutMs,env,shell,windowsHide}){
 const result=spawnSync(executable,args,{cwd,timeout:timeoutMs,env,shell,windowsHide,encoding:'utf8',maxBuffer:2*1024*1024});
 return {exitCode:result.status,stdout:result.stdout??'',stderr:result.stderr??'',errorCode:result.error?.code};
}
function isolatedEnvironment(){
 const env={...process.env};
 for(const key of Object.keys(env))if(/^GIT_/i.test(key))delete env[key];
 // Existing Git config, templates, hooks, filters and credential helpers are not inherited.
 return {...env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.platform()==='win32'?'NUL':'/dev/null',GIT_CONFIG_COUNT:'0',GIT_ATTR_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',GH_PROMPT_DISABLED:'1',GH_HOST:'github.com'};
}
function parseResponse(stdout){
 const text=typeof stdout==='string'?stdout:'';
 const headers=text.match(/^HTTP\/\S+\s+(\d{3})[^\r\n]*\r?\n/);
 const body=headers?text.slice(text.search(/\r?\n\r?\n/)).trim():text;
 try{return {status:headers?Number(headers[1]):null,data:JSON.parse(body)};}catch{return {status:headers?Number(headers[1]):null,data:null};}
}
function repository(data,{owner,name}){
 if(!data||!Number.isSafeInteger(data.id)||data.id<=0||data.owner?.login?.toLowerCase()!==owner.toLowerCase()||data.name!==name||data.private!==true||data.html_url!==`https://github.com/${data.owner.login}/${name}`)return null;
 return {id:data.id,owner:data.owner.login,name,url:data.html_url,private:true};
}
function selectedFiles(cwd,files){
 if(!Array.isArray(files)||files.length===0||files.length>1000)throw Error();
 assertNoLinks(cwd);const seen=new Set();let bytes=0;
 return files.map(entry=>{
  if(!entry||typeof entry!=='object'||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error();
  const relative=entry.path;
  if(typeof relative!=='string'||relative.includes('\\')||relative.startsWith('-')||relative.split('/').some(p=>!p||p==='.'||['.git','.empty-hooks'].includes(p.toLowerCase()))||/[\0\r\n:]/.test(relative))throw Error();
  const key=relative.toLowerCase();if(seen.has(key))throw Error();seen.add(key);
  const source=within(cwd,relative);const stat=fs.lstatSync(source);if(!stat.isFile()||stat.nlink!==1||stat.size>16*1024*1024)throw Error();
  bytes+=stat.size;if(bytes>64*1024*1024)throw Error();
  const fd=fs.openSync(source,'r');let content;
  try{
   const opened=fs.fstatSync(fd);if(!opened.isFile()||opened.nlink!==1||opened.size!==stat.size||opened.ino!==stat.ino||opened.dev!==stat.dev)throw Error();
   content=Buffer.alloc(stat.size);let offset=0;
   while(offset<content.length){const count=fs.readSync(fd,content,offset,content.length-offset,null);if(count===0)throw Error();offset+=count;}
   if(fs.fstatSync(fd).size!==stat.size)throw Error();
  }finally{fs.closeSync(fd);}
  if(crypto.createHash('sha256').update(content).digest('hex')!==entry.sha256)throw Error();
  return {path:relative,content};
 });
}

/** All errors are fixed public messages: subprocess output is never returned. */
export function createGithubAdapter({run=defaultRun}={}){
 async function execute(executable,args,cwd,timeoutMs=30000,env=isolatedEnvironment()){
  try{
   const result=await run(executable,args,{cwd,timeoutMs,shell:false,windowsHide:true,env});
   return {...result,ok:result?.exitCode===0&&!result.errorCode,missing:result?.errorCode==='ENOENT'};
  }catch(error){return {ok:false,missing:error?.code==='ENOENT',exitCode:null};}
 }
 const api=(route,cwd,include=false)=>execute('gh',['api','--hostname','github.com',route,...(include?['--include']:[])],cwd);
 async function inspectAuth(input={}){
  if(!validInput({...input,name:input.name??'authentication-2.0'}))return fail('INVALID_INPUT');
  const auth=await execute('gh',['auth','status','--hostname','github.com'],input.cwd);
  if(!auth.ok)return fail(auth.missing?'TOOL_UNAVAILABLE':'AUTH_REQUIRED');
  const user=await api('user',input.cwd);if(!user.ok)return fail('AUTH_REQUIRED');
  const login=parseResponse(user.stdout).data?.login;
  if(typeof login!=='string'||login.toLowerCase()!==input.owner.toLowerCase())return fail('OWNER_MISMATCH');
  return {ok:true,login};
 }
 async function lookupRepo(input={}){
  if(!validInput(input))return fail('INVALID_INPUT');
  const result=await api(`repos/${input.owner}/${input.name}`,input.cwd,true);
  const parsed=parseResponse(result.stdout);
  if(!result.ok){if(result.exitCode===1&&parsed.status===404&&parsed.data?.message==='Not Found')return {ok:true,exists:false};return fail(result.missing?'TOOL_UNAVAILABLE':'LOOKUP_FAILED');}
  const remote=repository(parsed.data,input);return remote?{ok:true,exists:true,repository:remote}:fail('REMOTE_MISMATCH');
 }
 async function createPrivateRepo(input={}){
  if(!validInput(input))return fail('INVALID_INPUT');
  const existing=await lookupRepo(input);if(!existing.ok)return existing;if(existing.exists)return fail('REPOSITORY_EXISTS');
  const created=await execute('gh',['repo','create',`${input.owner}/${input.name}`,'--private'],input.cwd,60000);
  if(!created.ok)return fail('CREATE_UNKNOWN',{state:'unknown'});
  const verified=await lookupRepo(input);
  return verified.ok&&verified.exists?{ok:true,repository:verified.repository}:fail('CREATE_UNKNOWN',{state:'unknown'});
 }
 async function pushCommit(input={}){
  if(!validInput(input))return fail('INVALID_INPUT');
  if(!Number.isSafeInteger(input.repositoryId)||input.repositoryId<=0)return fail('ASSOCIATION_REQUIRED');
  let files;try{files=selectedFiles(input.cwd,input.files);}catch{return fail('FILES_INVALID');}
  const remote=await lookupRepo(input);if(!remote.ok)return remote;if(!remote.exists||remote.repository.id!==input.repositoryId)return fail('REMOTE_MISMATCH');
  let staging;
  try{
   staging=fs.mkdtempSync(path.join(os.tmpdir(),'whitechronos-publish-'));
   const hooks=path.join(staging,'.empty-hooks');fs.mkdirSync(hooks);
   for(const file of files){const destination=path.join(staging,file.path);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,file.content,{flag:'wx'});}
   const prefix=['-c',`core.hooksPath=${hooks}`,'-c','commit.gpgSign=false','-c','core.autocrlf=false','-c','core.attributesFile='+ (os.platform()==='win32'?'NUL':'/dev/null'),'-c','credential.helper=','-c','credential.helper=!gh auth git-credential'];
   const git=(args,timeoutMs=30000)=>execute('git',[...prefix,...args],staging,timeoutMs);
   if(!(await git(['init','--initial-branch=main','--template=','--object-format=sha1'])).ok)return fail('GIT_FAILED');
   // Windows counts UTF16 code units in CreateProcess. Bound the entire argv,
   // including conservative quote/escape overhead, rather than only path count.
   const argumentCost=value=>2*value.length+3;
   const baseCost=10+[...prefix,'add','--'].reduce((sum,value)=>sum+argumentCost(value),0);
   let batch=[],batchCost=baseCost;
   for(const file of files){
    const cost=argumentCost(file.path);if(baseCost+cost>16000)return fail('GIT_FAILED');
    if(batchCost+cost>16000){if(!(await git(['add','--',...batch])).ok)return fail('GIT_FAILED');batch=[];batchCost=baseCost;}
    batch.push(file.path);batchCost+=cost;
   }
   if(batch.length&&!(await git(['add','--',...batch])).ok)return fail('GIT_FAILED');
   const index=await git(['ls-files','--stage','-z']);if(!index.ok||typeof index.stdout!=='string')return fail('GIT_FAILED');
   const records=index.stdout.split('\0').filter(Boolean);if(records.length!==files.length)return fail('GIT_FAILED');
   const expected=new Map(files.map(file=>[file.path,crypto.createHash('sha1').update(`blob ${file.content.length}\0`).update(file.content).digest('hex')]));
   for(const record of records){const match=/^100644 ([a-f0-9]{40}) 0\t([\s\S]+)$/.exec(record);if(!match||expected.get(match[2])!==match[1])return fail('GIT_FAILED');expected.delete(match[2]);}
   if(expected.size)return fail('GIT_FAILED');
   for(const args of [['-c','user.name=WhiteChronos','-c','user.email=WhiteChronos@users.noreply.github.com','commit','--no-verify','-m','Publish independent program'],['remote','add','origin',remote.repository.url+'.git']])if(!(await git(args)).ok)return fail('GIT_FAILED');
   const head=await git(['rev-parse','HEAD']);const commitSha=head.stdout?.trim();if(!head.ok||!validSha(commitSha))return fail('GIT_FAILED');
   // Never force an update. A concurrent remote change is refused by Git.
   const branch=await git(['ls-remote','--heads','origin','refs/heads/main']);if(!branch.ok||branch.stdout.trim())return fail('GIT_FAILED');
   const pushed=await git(['push','--porcelain','origin','HEAD:refs/heads/main'],120000);
   return pushed.ok?{ok:true,commitSha}:fail('GIT_FAILED',{commitSha});
  }catch{return fail('GIT_FAILED');}
  finally{if(staging)try{fs.rmSync(staging,{recursive:true,force:true});}catch{/* No subprocess data or paths are exposed. */}}
 }
 async function verifyRemote(input={}){
  if(!validInput(input)||!Number.isSafeInteger(input.repositoryId)||!validSha(input.commitSha))return fail('INVALID_INPUT');
  const remote=await lookupRepo(input);if(!remote.ok)return remote;if(!remote.exists||remote.repository.id!==input.repositoryId)return fail('REMOTE_MISMATCH');
  const commit=await api(`repos/${input.owner}/${input.name}/commits/main`,input.cwd);
  if(!commit.ok||parseResponse(commit.stdout).data?.sha!==input.commitSha)return fail('VERIFY_FAILED');
  return {ok:true,repository:remote.repository,commitSha:input.commitSha};
 }
 return {inspectAuth,lookupRepo,createPrivateRepo,pushCommit,verifyRemote};
}
