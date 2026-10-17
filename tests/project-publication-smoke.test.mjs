import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runPublicationAcceptance} from '../scripts/publication-smoke.mjs';
import {configurePublication,readPublicationPolicy} from '../skills/whitechronos-lab/scripts/projects/delivery.mjs';
import {readPublication} from '../skills/whitechronos-lab/scripts/projects/publication.mjs';

const NAME='Lab-Publication-Acceptance-20261016-2.0';
const COMMIT='b'.repeat(40);
function setup(t){
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'rea-publication-smoke-test-'));
 t.after(()=>{
  const resolved=fs.realpathSync(parent),relative=path.relative(fs.realpathSync(os.tmpdir()),resolved);
  assert.equal(path.isAbsolute(relative),false);assert.equal(relative.startsWith('..'),false);assert.equal(path.basename(resolved).startsWith('rea-publication-smoke-test-'),true);
  fs.rmSync(resolved,{recursive:true,force:true});
 });
 const root=path.join(parent,'acceptance'),calls=[];
 const repository={id:78,owner:'WhiteChronos',name:NAME,url:`https://github.com/WhiteChronos/${NAME}`,private:true};
 const adapter={
  async inspectAuth(){calls.push('auth');return{ok:true,login:'WhiteChronos'};},
  async lookupRepo(){calls.push('lookup');return{ok:true,exists:false};},
  async createPrivateRepo(){calls.push('create');return{ok:true,repository};},
  async pushCommit({files}){calls.push('push');assert.deepEqual(files.map(x=>x.path).sort(),['ATTRIBUTIONS.md','LICENSE','sum.mjs','sum.test.mjs']);return{ok:true,commitSha:COMMIT};},
  async verifyRemote(){calls.push('verify');return{ok:true,repository,commitSha:COMMIT};}
 };
 return{parent,root,calls,adapter,dependencies:{deliveryDependencies:{adapter}}};
}
test('acceptance executes its own real Node test but never calls fake GitHub proof real',async t=>{
 const f=setup(t),report=await runPublicationAcceptance(f.root,f.dependencies);
 assert.equal(report.productRuntimeVerified,true);assert.equal(report.realGitHubPublication,false);assert.equal(report.passed,false);assert.equal(report.code,null);
 assert.equal(report.repository.id,78);assert.equal(report.commitSha,COMMIT);
 assert.equal(f.calls.filter(x=>x==='create').length,1);assert.equal(f.calls.filter(x=>x==='push').length,1);assert.equal(f.calls.filter(x=>x==='verify').length,2);
 const stored=JSON.parse(fs.readFileSync(path.join(f.root,'acceptance.json'),'utf8'));assert.deepEqual(stored,report);
 const publication=readPublication(path.join(f.root,'workspace'));assert.equal(publication.state,'published');assert.equal(publication.repository.id,78);
 const second=await runPublicationAcceptance(f.root,f.dependencies);
 assert.equal(second.repository.id,78);assert.equal(second.commitSha,COMMIT);assert.equal(second.productRuntimeVerified,true);assert.equal(second.realGitHubPublication,false);
 assert.equal(f.calls.filter(x=>x==='create').length,1);assert.equal(f.calls.filter(x=>x==='push').length,1);assert.equal(f.calls.filter(x=>x==='verify').length,4);
});
test('existing arbitrary root and relative path are refused and human files preserved',async t=>{
 const f=setup(t);fs.mkdirSync(f.root);const human=path.join(f.root,'human.md');fs.writeFileSync(human,'Original human note.');
 await assert.rejects(runPublicationAcceptance(f.root,f.dependencies),/não reconhecidos/);
 assert.equal(fs.readFileSync(human,'utf8'),'Original human note.');assert.deepEqual(fs.readdirSync(f.root),['human.md']);assert.deepEqual(f.calls,[]);
 await assert.rejects(runPublicationAcceptance('relative-acceptance',f.dependencies),/absoluta/);
 await assert.rejects(runPublicationAcceptance(path.parse(f.root).root,f.dependencies),/absoluta/);assert.deepEqual(f.calls,[]);
});
test('changed own product is refused before any publication call on retry',async t=>{
 const f=setup(t);await runPublicationAcceptance(f.root,f.dependencies);f.calls.length=0;
 fs.appendFileSync(path.join(f.root,'delivery','sum.mjs'),'// changed');
 await assert.rejects(runPublicationAcceptance(f.root,f.dependencies),/alterada/);assert.deepEqual(f.calls,[]);
 assert.equal(fs.readFileSync(path.join(f.root,'delivery','sum.mjs'),'utf8').endsWith('// changed'),true);
});
test('disabled acceptance policy stays disabled and no publication call is made',async t=>{
 const f=setup(t);await runPublicationAcceptance(f.root,f.dependencies);f.calls.length=0;
 const workspace=path.join(f.root,'workspace');await configurePublication(workspace,{enabled:false,owner:'WhiteChronos',repo:NAME});
 const report=await runPublicationAcceptance(f.root,f.dependencies);
 assert.equal(report.code,'ACCEPTANCE_POLICY_DISABLED');assert.equal(report.passed,false);assert.equal(report.realGitHubPublication,false);assert.equal(report.productRuntimeVerified,true);
 assert.equal(readPublicationPolicy(workspace).enabled,false);assert.deepEqual(f.calls,[]);
});
test('product test failure stops before policy or adapter and never exports raw error output',async t=>{
 const f=setup(t);let runs=0;
 const report=await runPublicationAcceptance(f.root,{...f.dependencies,runProduct:()=>{runs++;return{status:1,stdout:'synthetic private diagnostic',stderr:'synthetic private diagnostic'};}});
 assert.equal(runs,1);assert.equal(report.code,'PRODUCT_TEST_FAILED');assert.equal(report.productRuntimeVerified,false);assert.equal(report.realGitHubPublication,false);assert.equal(report.passed,false);
 assert.deepEqual(f.calls,[]);assert.equal(readPublicationPolicy(path.join(f.root,'workspace')),null);
 assert.equal(fs.readFileSync(path.join(f.root,'acceptance.json'),'utf8').includes('synthetic private diagnostic'),false);
});
test('injected successful product runner never claims real product execution',async t=>{
 const f=setup(t),report=await runPublicationAcceptance(f.root,{...f.dependencies,runProduct:()=>({status:0})});
 assert.equal(report.productRuntimeVerified,false);assert.equal(report.realGitHubPublication,false);assert.equal(report.passed,false);
});
