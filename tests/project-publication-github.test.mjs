import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const adapterModule=await import('../skills/whitechronos-lab/scripts/projects/github.mjs').catch(()=>({}));
const sha='a'.repeat(40);
const repo={id:314,name:'demo-2.0',owner:{login:'WhiteChronos'},html_url:'https://github.com/WhiteChronos/demo-2.0',private:true};
const args={owner:'WhiteChronos',name:'demo-2.0',cwd:os.tmpdir()};
const success=value=>({exitCode:0,stdout:typeof value==='string'?value:JSON.stringify(value),stderr:''});
const selected=(content='Own product')=>[{path:'README.md',sha256:crypto.createHash('sha256').update(content).digest('hex')}];
const indexOutput=(content='Own product')=>success('100644 '+crypto.createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex')+' 0\tREADME.md\0');
function harness(responses){
 const calls=[];
 const run=async(executable,argv,options)=>{calls.push({executable,argv,options});const next=responses.shift();if(next instanceof Error)throw next;assert.ok(next,'unexpected process');return next;};
 assert.equal(typeof adapterModule.createGithubAdapter,'function','publication adapter is implemented');
 return {adapter:adapterModule.createGithubAdapter({run}),calls};
}
test('auth requires CLI auth status and matching API identity without token commands',async()=>{
 const {adapter,calls}=harness([success('logged in'),success({login:'WhiteChronos'})]);
 assert.equal((await adapter.inspectAuth({owner:'WhiteChronos',cwd:os.tmpdir()})).ok,true);
 assert.deepEqual(calls.map(c=>c.argv),[['auth','status','--hostname','github.com'],['api','--hostname','github.com','user']]);
 for(const c of calls){assert.equal(c.options.shell,false);assert.equal(c.options.windowsHide,true);assert.equal(c.options.env.GH_HOST,'github.com');assert.ok(c.options.timeoutMs>0);}
});
test('missing CLI, failing auth, and wrong login are sanitized failures',async()=>{
 for(const [responses,code] of [[[Object.assign(new Error('synthetic-private-value'),{code:'ENOENT'})],'TOOL_UNAVAILABLE'],[[{exitCode:1,stdout:'synthetic-private-value',stderr:'synthetic-private-value'}],'AUTH_REQUIRED'],[[success(''),success({login:'OtherOwner'})],'OWNER_MISMATCH']]){
  const {adapter}=harness(responses);const result=await adapter.inspectAuth(args);assert.equal(result.ok,false);assert.equal(result.code,code);assert.ok(!JSON.stringify(result).includes('synthetic-private-value'));
 }
});
test('lookup distinguishes confirmed HTTP404 from network and authentication failures',async()=>{
 for(const [response,expected] of [[{exitCode:1,stdout:'HTTP/2.0 404 Not Found\r\n\r\n{"message":"Not Found"}',stderr:''},'absent'],[{exitCode:1,stdout:'',stderr:'network synthetic-private-value'},'LOOKUP_FAILED'],[{exitCode:1,stdout:'HTTP/2.0 401 Unauthorized\n\n{}',stderr:''},'LOOKUP_FAILED'],[{exitCode:null,stdout:'HTTP/2.0 404 Not Found\n\n{}',stderr:''},'LOOKUP_FAILED']]){
  const {adapter}=harness([response]);const result=await adapter.lookupRepo(args);if(expected==='absent')assert.deepEqual(result,{ok:true,exists:false});else {assert.equal(result.ok,false);assert.equal(result.code,expected);}
 }
});
test('existing repository exposes verified identity while public or wrong owner fails',async()=>{
 for(const [data,ok] of [[repo,true],[{...repo,private:false},false],[{...repo,owner:{login:'OtherOwner'}},false],[{...repo,html_url:'https://attacker.invalid/x'},false]]){
  const {adapter}=harness([success(data)]);const result=await adapter.lookupRepo(args);assert.equal(result.ok,ok);if(ok){assert.equal(result.exists,true);assert.equal(result.repository.id,314);}
 }
});
test('invalid owner and metacharacter names cannot start a process',async()=>{
 const {adapter,calls}=harness([]);
 for(const method of ['inspectAuth','lookupRepo','createPrivateRepo','pushCommit','verifyRemote']){
  assert.equal((await adapter[method]({...args,owner:'OtherOwner'})).ok,false);
  assert.equal((await adapter[method]({...args,name:'demo;evil-2.0'})).ok,false);
 }
 assert.equal(calls.length,0);
});
test('creation refuses collisions before any mutation',async()=>{
 const {adapter,calls}=harness([success(repo)]);const result=await adapter.createPrivateRepo(args);assert.equal(result.code,'REPOSITORY_EXISTS');assert.equal(calls.length,1);
});
test('creation only uses private flag and verifies remote identity afterwards',async()=>{
 const {adapter,calls}=harness([{exitCode:1,stdout:'HTTP/2.0 404 Not Found\n\n{"message":"Not Found"}',stderr:''},success('created'),success(repo)]);
 const result=await adapter.createPrivateRepo(args);assert.equal(result.ok,true);assert.equal(result.repository.private,true);
 assert.deepEqual(calls[1].argv,['repo','create','WhiteChronos/demo-2.0','--private']);
});
test('creation with unknown outcome never retries and never leaks error text',async()=>{
 for(const failure of [Object.assign(new Error('synthetic-private-value'),{code:'ETIMEDOUT'}),{exitCode:null,stdout:'synthetic-private-value',stderr:''},{exitCode:1,stdout:'',stderr:'synthetic-private-value'}]){
 const {adapter,calls}=harness([{exitCode:1,stdout:'HTTP/2.0 404 Not Found\n\n{"message":"Not Found"}',stderr:''},failure]);const result=await adapter.createPrivateRepo(args);assert.equal(result.state,'unknown');assert.equal(calls.length,2);assert.ok(!JSON.stringify(result).includes('synthetic-private-value'));}
});
test('remote verification checks repository ID, owner, privacy and exact commit',async()=>{
 for(const [data,commit,id,ok] of [[repo,{sha},314,true],[repo,{sha:'b'.repeat(40)},314,false],[repo,{sha},999,false],[{...repo,private:false},{sha},314,false]]){
  const {adapter}=harness([success(data),success(commit)]);const result=await adapter.verifyRemote({...args,repositoryId:id,commitSha:sha});assert.equal(result.ok,ok);
 }
});
test('push stages only bounded selected files in fresh git root with isolated configuration',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'publication-github-test-'));fs.writeFileSync(path.join(root,'README.md'),'Own product\n');fs.writeFileSync(path.join(root,'private.txt'),'not selected');
 try{
  const {adapter,calls}=harness([success(repo),success(''),success(''),indexOutput('Own product\n'),success(''),success(''),success(sha+'\n'),success(''),success('')]);
  const result=await adapter.pushCommit({...args,cwd:root,files:selected('Own product\n'),repositoryId:314});assert.equal(result.ok,true);assert.equal(result.commitSha,sha);
  const git=calls.filter(c=>c.executable==='git');assert.ok(git.length>=6);const add=git.find(c=>c.argv.includes('add'));assert.deepEqual(add.argv.slice(add.argv.indexOf('add')),['add','--','README.md']);assert.notEqual(add.options.cwd,root);
  for(const c of git){assert.equal(c.options.shell,false);assert.equal(c.options.env.GIT_CONFIG_NOSYSTEM,'1');assert.ok(c.argv.includes('core.hooksPath='+path.join(c.options.cwd,'.empty-hooks')));}
  assert.ok(!fs.existsSync(add.options.cwd),'staging is removed after operation');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('push refuses unsafe selections and unassociated repository before git mutation',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'publication-github-test-'));fs.writeFileSync(path.join(root,'README.md'),'Own product');
 try{for(const files of [[],['../private.txt'],['.git/config'],['README.md','README.md'],['README.md'],[{path:'README.md'}],[{path:'README.md',sha256:'f'.repeat(64)}]]){const {adapter,calls}=harness([]);assert.equal((await adapter.pushCommit({...args,cwd:root,files,repositoryId:314})).ok,false);assert.equal(calls.length,0);}
 const {adapter,calls}=harness([]);assert.equal((await adapter.pushCommit({...args,cwd:root,files:['README.md']})).code,'ASSOCIATION_REQUIRED');assert.equal(calls.length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('null git status and failed push remain failures with sanitized messages',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'publication-github-test-'));fs.writeFileSync(path.join(root,'README.md'),'Own product');
 try{for(const responses of [[success(repo),{exitCode:null,stdout:'synthetic-private-value',stderr:''}],[success(repo),success(''),success(''),indexOutput(),success(''),success(''),success(sha),success(''),{exitCode:1,stdout:'synthetic-private-value',stderr:''}]]){
 const {adapter}=harness(responses);const result=await adapter.pushCommit({...args,cwd:root,files:selected(),repositoryId:314});assert.equal(result.ok,false);assert.ok(!JSON.stringify(result).includes('synthetic-private-value'));}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('changed Git index bytes are rejected before commit or push',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'publication-github-test-'));fs.writeFileSync(path.join(root,'README.md'),'Own product');
 try{const {adapter,calls}=harness([success(repo),success(''),success(''),indexOutput('changed bytes')]);const result=await adapter.pushCommit({...args,cwd:root,files:selected(),repositoryId:314});assert.equal(result.ok,false);assert.equal(calls.some(c=>c.argv.includes('commit')),false);assert.equal(calls.some(c=>c.argv.includes('push')),false);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('files larger than 16MiB are refused before any subprocess',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'publication-github-test-'));const content=Buffer.alloc(16*1024*1024+1);fs.writeFileSync(path.join(root,'README.md'),content);
 try{const {adapter,calls}=harness([]);const result=await adapter.pushCommit({...args,cwd:root,files:selected(content),repositoryId:314});assert.equal(result.code,'FILES_INVALID');assert.equal(calls.length,0);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('600 long paths are staged in bounded Windows argument batches without dropping files',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'publication-github-test-'));
 const content='Own program\n';const hash=crypto.createHash('sha256').update(content).digest('hex');
 const blob=crypto.createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
 const files=Array.from({length:600},(_,i)=>({path:`program-${String(i).padStart(3,'0')}-${'a'.repeat(70)}.mjs`,sha256:hash}));
 for(const file of files)fs.writeFileSync(path.join(root,file.path),content);
 const calls=[];
 const run=async(executable,argv,options)=>{
  calls.push({executable,argv,options});if(executable==='gh')return success(repo);
  if(argv.includes('ls-files'))return success(files.map(file=>`100644 ${blob} 0\t${file.path}\0`).join(''));
  if(argv.includes('rev-parse'))return success(sha);return success('');
 };
 try{
  const adapter=adapterModule.createGithubAdapter({run});assert.equal((await adapter.pushCommit({...args,cwd:root,files,repositoryId:314})).ok,true);
  const adds=calls.filter(call=>call.argv.includes('add')&&call.argv.includes('--'));assert.ok(adds.length>1,'long selections require multiple add batches');
  assert.deepEqual(adds.flatMap(call=>call.argv.slice(call.argv.indexOf('add')+2)),files.map(file=>file.path));
  for(const call of adds){assert.ok(call.argv.reduce((length,arg)=>length+2*arg.length+3,10)<=16000,'conservative UTF16 command length stays bounded');assert.equal(call.options.shell,false);}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
