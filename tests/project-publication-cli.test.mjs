import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {setup} from './project-helpers.mjs';
import {readProject} from '../skills/whitechronos-lab/scripts/projects/store.mjs';
import {configurePublication,deliverProject} from '../skills/whitechronos-lab/scripts/projects/delivery.mjs';
import {projectMain} from '../skills/whitechronos-lab/scripts/projects/cli.mjs';

function fixture(t){
 const f=setup(t),deliveryRoot=path.join(f.root,'delivery');fs.mkdirSync(deliveryRoot);
 const files=Object.entries({'LICENSE':'MIT\n','ATTRIBUTIONS.md':'Independent own example.\n','main.mjs':'export const answer=42;\n'}).map(([name,body])=>{fs.writeFileSync(path.join(deliveryRoot,name),body);return{path:name,sha256:crypto.createHash('sha256').update(body).digest('hex'),kind:name.endsWith('.mjs')?'product':'documentation'};});
 f.manifest={schemaVersion:1,programId:readProject(f.workspace).id,deliveryRoot,files};
 fs.writeFileSync(path.join(f.workspace,'delivery-manifest.json'),JSON.stringify(f.manifest));return f;
}
test('delivery validates own files without publication when no policy is active',async t=>{
 const f=fixture(t);let calls=0;
 const result=await deliverProject(f.workspace,{manifest:f.manifest},{publish:()=>{calls++;}});
 assert.equal(result.state,'delivery-validated');assert.equal(result.publication.state,'not-requested');assert.equal(calls,0);
 assert.equal(result.productRuntimeVerified,false);
});
test('explicit per-workspace policy invokes publisher on delivery only and propagates failure',async t=>{
 const f=fixture(t);await configurePublication(f.workspace,{enabled:true,owner:'WhiteChronos',repo:'Demo-2.0'});
 let called;const result=await deliverProject(f.workspace,{manifest:f.manifest},{publish:async(w,o)=>{called={w,o};return{state:'failed',code:'AUTH_REQUIRED'};}});
 assert.equal(called.w,f.workspace);assert.equal(called.o.repo,'Demo-2.0');assert.equal(result.publication.code,'AUTH_REQUIRED');
 await configurePublication(f.workspace,{enabled:false,owner:'WhiteChronos',repo:'Demo-2.0'});
 const again=await deliverProject(f.workspace,{manifest:f.manifest},{publish:()=>assert.fail('disabled')});assert.equal(again.publication.state,'not-requested');
});
test('policy and documentation-only delivery reject mismatched identities and malformed input',async t=>{
 const f=fixture(t);
 for(const config of [{enabled:'true',owner:'WhiteChronos',repo:'Demo-2.0'},{enabled:true,owner:'Other',repo:'Demo-2.0'},{enabled:true,owner:'WhiteChronos',repo:'Other-2.0'}])await assert.rejects(configurePublication(f.workspace,config));
 await assert.rejects(deliverProject(f.workspace,{manifest:{...f.manifest,files:f.manifest.files.slice(0,2)}}));
});
test('CLI parsing rejects malformed publication options before any adapter calls',async t=>{
 const f=fixture(t);let calls=0;const adapter=new Proxy({},{get(){calls++;return()=>assert.fail();}});
 for(const tail of [['publish',f.workspace,'--owner','WhiteChronos','--repo','Demo-2.0','--force','true'],['deliver',f.workspace,'--manifest','../outside.json'],['publication-policy',f.workspace,'--enabled','yes','--owner','WhiteChronos','--repo','Demo-2.0'],['publish',f.workspace,'--owner','WhiteChronos','--owner','WhiteChronos','--repo','Demo-2.0']])await assert.rejects(projectMain(tail,{adapter}));
 assert.equal(calls,0);
});
test('CLI publication distinguishes missing CLI from successful delivery',async t=>{
 const f=fixture(t);const adapter={inspectAuth:async()=>({ok:false,code:'TOOL_UNAVAILABLE'})};
 const log=console.log;const outputs=[];console.log=x=>outputs.push(JSON.parse(x));t.after(()=>{console.log=log;});
 const exit=await projectMain(['publish',f.workspace,'--owner','WhiteChronos','--repo','Demo-2.0'],{adapter});
 assert.equal(exit,1);assert.equal(outputs.at(-1).code,'TOOL_UNAVAILABLE');
});
test('enabled automatic delivery repeats without creating another repository; analysis never publishes',async t=>{
 const f=fixture(t);await configurePublication(f.workspace,{enabled:true,owner:'WhiteChronos',repo:'Demo-2.0'});
 const repository={id:123,owner:'WhiteChronos',name:'Demo-2.0',private:true,url:'https://github.com/WhiteChronos/Demo-2.0'},commitSha='a'.repeat(40);
 let created=0,pushed=0,analyses=0;
 const adapter={inspectAuth:async()=>({ok:true,login:'WhiteChronos'}),lookupRepo:async()=>({ok:true,exists:created>0,repository}),createPrivateRepo:async()=>{created++;return{ok:true,repository};},pushCommit:async()=>{pushed++;return{ok:true,commitSha};},verifyRemote:async()=>({ok:true,repository,commitSha})};
 const log=console.log;console.log=()=>{};t.after(()=>{console.log=log;});
 assert.equal(await projectMain(['analyze',f.workspace,'--source-path','index.js'],{adapter,analyze:async()=>{analyses++;return{state:'completed'};}}),0);
 assert.equal(analyses,1);assert.equal(created,0);
 assert.equal(await projectMain(['deliver',f.workspace],{adapter}),0);
 assert.equal(await projectMain(['deliver',f.workspace],{adapter}),0);
 assert.equal(created,1);assert.equal(pushed,1);
});
