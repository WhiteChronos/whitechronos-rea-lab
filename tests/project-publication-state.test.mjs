import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {setup} from './project-helpers.mjs';
import {readProject} from '../skills/whitechronos-lab/scripts/projects/store.mjs';
import {publishProject,readPublication} from '../skills/whitechronos-lab/scripts/projects/publication.mjs';

const SHA='a'.repeat(40);
function fixture(t){
 const f=setup(t),deliveryRoot=path.join(f.root,'delivery');fs.mkdirSync(deliveryRoot);
 const bodies={'LICENSE':'MIT - fixture own code','ATTRIBUTIONS.md':'Own fixture; no upstream source copied.','main.mjs':'export const answer=42;'};
 const files=Object.entries(bodies).map(([name,body])=>{fs.writeFileSync(path.join(deliveryRoot,name),body);return{path:name,sha256:crypto.createHash('sha256').update(body).digest('hex'),kind:name==='main.mjs'?'product':'documentation'};});
 const manifest={schemaVersion:1,programId:readProject(f.workspace).id,deliveryRoot,files};
 const calls=[],repository={id:91,name:'Demo-2.0',owner:'WhiteChronos',url:'https://github.com/WhiteChronos/Demo-2.0',private:true};
 const adapter={
  async inspectAuth(){calls.push('auth');return{ok:true,login:'WhiteChronos'};},
  async lookupRepo(){calls.push('lookup');return{ok:true,exists:false};},
  async createPrivateRepo(){calls.push('create');return{ok:true,repository};},
  async pushCommit(args){calls.push('push');assert.equal(readPublication(f.workspace).repository.id,91);assert.notEqual(args.cwd,deliveryRoot);assert.deepEqual(fs.readdirSync(args.cwd).sort(),Object.keys(bodies).sort());return{ok:true,commitSha:SHA};},
  async verifyRemote(){calls.push('verify');return{ok:true,repository,commitSha:SHA};}
 };
 return{...f,manifest,calls,repository,adapter,options:{owner:'WhiteChronos',repo:'Demo-2.0',manifest}};
}
test('fresh publication persists all stages, explicit product bytes and remote ID before push',async t=>{
 const f=fixture(t);assert.equal(readPublication(f.workspace).state,'not-requested');
 const r=await publishProject(f.workspace,f.options,{adapter:f.adapter});assert.equal(r.state,'published');assert.equal(r.commitSha,SHA);
 assert.deepEqual(f.calls,['auth','lookup','create','push','verify']);
 const events=fs.readFileSync(path.join(f.workspace,'events.jsonl'),'utf8');
 for(const state of ['validating','local-prepared','remote-created','published'])assert.ok(events.includes('"state":"'+state+'"'));
});
test('repeat publication only verifies the existing association',async t=>{
 const f=fixture(t);await publishProject(f.workspace,f.options,{adapter:f.adapter});f.calls.length=0;
 assert.equal((await publishProject(f.workspace,f.options,{adapter:f.adapter})).state,'published');assert.deepEqual(f.calls,['auth','verify']);
});
test('collision never pushes or creates',async t=>{
 const f=fixture(t);f.adapter.lookupRepo=async()=>({ok:true,exists:true,repository:f.repository});
 const r=await publishProject(f.workspace,f.options,{adapter:f.adapter});assert.equal(r.state,'failed');assert.equal(r.code,'REPOSITORY_COLLISION');assert.equal(f.calls.includes('create'),false);assert.equal(f.calls.includes('push'),false);
});
test('unknown creation result never automatically creates or adopts on retry',async t=>{
 const f=fixture(t);f.adapter.createPrivateRepo=async()=>{f.calls.push('create');return{ok:false,state:'unknown',message:'private secret must not escape'};};
 assert.equal((await publishProject(f.workspace,f.options,{adapter:f.adapter})).state,'unknown');
 f.adapter.lookupRepo=async()=>{f.calls.push('lookup');return{ok:true,exists:true,repository:f.repository};};
 const r=await publishProject(f.workspace,f.options,{adapter:f.adapter});assert.equal(r.state,'unknown');assert.equal(f.calls.filter(x=>x==='create').length,1);assert.equal(r.repository,null);
 assert.equal(JSON.stringify(r).includes('private secret'),false);
});
test('persisted create intent recovers conservatively after interruption',async t=>{
 const f=fixture(t);let snapshot,events;f.adapter.createPrivateRepo=async()=>{snapshot=fs.readFileSync(path.join(f.workspace,'publication.json'));events=fs.readFileSync(path.join(f.workspace,'events.jsonl'));throw Error('transport secret');};
 const r=await publishProject(f.workspace,f.options,{adapter:f.adapter});assert.equal(r.state,'unknown');
 fs.writeFileSync(path.join(f.workspace,'publication.json'),snapshot);fs.writeFileSync(path.join(f.workspace,'events.jsonl'),events);
 f.calls.length=0;assert.equal((await publishProject(f.workspace,f.options,{adapter:f.adapter})).state,'unknown');assert.equal(f.calls.includes('create'),false);
});
test('failed push resumes only the persisted verified ID without creating again',async t=>{
 const f=fixture(t);const push=f.adapter.pushCommit;f.adapter.pushCommit=async()=>({ok:false,code:'PUSH_FAILED'});
 assert.equal((await publishProject(f.workspace,f.options,{adapter:f.adapter})).state,'failed');
 f.adapter.lookupRepo=async()=>({ok:true,exists:true,repository:f.repository});f.adapter.pushCommit=push;
 assert.equal((await publishProject(f.workspace,f.options,{adapter:f.adapter})).state,'published');assert.equal(f.calls.filter(x=>x==='create').length,1);
});
test('verification failure after push retains SHA and retries verification without another push',async t=>{
 const f=fixture(t),verify=f.adapter.verifyRemote;f.adapter.verifyRemote=async()=>({ok:false,code:'NETWORK_FAILED'});
 assert.equal((await publishProject(f.workspace,f.options,{adapter:f.adapter})).state,'unknown');f.calls.length=0;f.adapter.verifyRemote=verify;
 assert.equal((await publishProject(f.workspace,f.options,{adapter:f.adapter})).state,'published');assert.deepEqual(f.calls,['auth','verify']);
});
test('identity, name, owner, visibility and delivered content cannot change on retry',async t=>{
 const f=fixture(t);await publishProject(f.workspace,f.options,{adapter:f.adapter});
 for(const change of [{repo:'Other-2.0'},{owner:'Other'},{visibility:'public'},{manifest:{...f.manifest,programId:'different'}}])await assert.rejects(publishProject(f.workspace,{...f.options,...change},{adapter:f.adapter}));
 fs.writeFileSync(path.join(f.manifest.deliveryRoot,'main.mjs'),'export const answer=43;');
 await assert.rejects(publishProject(f.workspace,f.options,{adapter:f.adapter}));
});
test('lookup failures and wrong auth never cause creation; raw errors are discarded',async t=>{
 const f=fixture(t);f.adapter.inspectAuth=async()=>({ok:true,login:'wrong'});
 assert.equal((await publishProject(f.workspace,f.options,{adapter:f.adapter})).state,'failed');assert.equal(f.calls.includes('create'),false);
 f.adapter.inspectAuth=async()=>({ok:true,login:'WhiteChronos'});f.adapter.lookupRepo=async()=>{throw Error('password=very-secret');};
 const r=await publishProject(f.workspace,f.options,{adapter:f.adapter});assert.equal(r.state,'failed');assert.equal(JSON.stringify(r).includes('very-secret'),false);
});
test('remote identity or privacy mismatch refuses resume',async t=>{
 const f=fixture(t);f.adapter.pushCommit=async()=>({ok:false});await publishProject(f.workspace,f.options,{adapter:f.adapter});
 f.adapter.lookupRepo=async()=>({ok:true,exists:true,repository:{...f.repository,id:999}});
 assert.equal((await publishProject(f.workspace,f.options,{adapter:f.adapter})).code,'REMOTE_IDENTITY_MISMATCH');
});
test('concurrent publication is rejected while first owns workspace lock',async t=>{
 const f=fixture(t);let release,entered;const gate=new Promise(r=>{release=r;}),entry=new Promise(r=>{entered=r;});
 f.adapter.inspectAuth=async()=>{entered();await gate;return{ok:true,login:'WhiteChronos'};};
 const first=publishProject(f.workspace,f.options,{adapter:f.adapter});await entry;
 await assert.rejects(publishProject(f.workspace,f.options,{adapter:f.adapter}),/bloqueado/);release();assert.equal((await first).state,'published');
});
test('corrupt publication state and orphan journal are rejected',async t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.workspace,'publication.json'),'{}');assert.throws(()=>readPublication(f.workspace),/inválid/);
 fs.unlinkSync(path.join(f.workspace,'publication.json'));fs.appendFileSync(path.join(f.workspace,'events.jsonl'),JSON.stringify({type:'publication-state',state:'validating'})+'\n');
 await assert.rejects(publishProject(f.workspace,f.options,{adapter:f.adapter}),/diário/);
});
test('valid-shaped state tampering is detected by journal digest',async t=>{
 const f=fixture(t);await publishProject(f.workspace,f.options,{adapter:f.adapter});
 const state=readPublication(f.workspace);state.repository.id=72;fs.writeFileSync(path.join(f.workspace,'publication.json'),JSON.stringify(state));
 assert.throws(()=>readPublication(f.workspace),/diário/);
});
test('creation reply extra fields never enter persisted state',async t=>{
 const f=fixture(t);f.adapter.createPrivateRepo=async()=>({ok:true,repository:{...f.repository,untrusted:'password=private-extra'}});
 const r=await publishProject(f.workspace,f.options,{adapter:f.adapter});assert.equal(r.state,'published');assert.equal(JSON.stringify(r).includes('private-extra'),false);
});
test('manifest mutation between validation and copy causes no remote write',async t=>{
 const f=fixture(t);f.adapter.inspectAuth=async()=>{fs.writeFileSync(path.join(f.manifest.deliveryRoot,'main.mjs'),'altered');return{ok:true,login:'WhiteChronos'};};
 const r=await publishProject(f.workspace,f.options,{adapter:f.adapter});assert.equal(r.code,'DELIVERY_CHANGED');assert.equal(f.calls.includes('create'),false);
});
test('another repository name cannot be selected even on first publication',async t=>{
 const f=fixture(t);await assert.rejects(publishProject(f.workspace,{...f.options,repo:'Other-2.0'},{adapter:f.adapter}),/corresponder/);assert.deepEqual(f.calls,[]);
});
test('uncertain push with known commit resumes through verification only',async t=>{
 const f=fixture(t);f.adapter.pushCommit=async()=>({ok:false,commitSha:SHA});
 assert.equal((await publishProject(f.workspace,f.options,{adapter:f.adapter})).state,'unknown');f.calls.length=0;
 assert.equal((await publishProject(f.workspace,f.options,{adapter:f.adapter})).state,'published');assert.deepEqual(f.calls,['auth','verify']);
});
test('auth failure preserves only known operator-action codes',async t=>{
 const f=fixture(t);
 for(const code of ['TOOL_UNAVAILABLE','AUTH_REQUIRED','OWNER_MISMATCH','password=private']){
  f.adapter.inspectAuth=async()=>({ok:false,code,message:'private text'});
  const r=await publishProject(f.workspace,f.options,{adapter:f.adapter});assert.equal(r.code,code.startsWith('password')?'AUTH_REQUIRED':code);assert.equal(JSON.stringify(r).includes('private text'),false);
 }
});
