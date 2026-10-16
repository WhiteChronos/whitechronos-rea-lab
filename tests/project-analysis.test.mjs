import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {setup} from './project-helpers.mjs';import {fileDigest} from '../skills/whitechronos-lab/scripts/projects/tasks.mjs';
import {analyzeProject,reconcileRuns} from '../skills/whitechronos-lab/scripts/projects/analysis.mjs';
import {buildReport} from '../skills/whitechronos-lab/scripts/projects/report.mjs';
function runner(transform=x=>x){return async(entry,target,options)=>{fs.mkdirSync(options.outputDir);const hashes=Object.fromEntries(options.sourcePaths.map(s=>[s,fileDigest(path.join(target,s))]));const value={operation:'analyze_javascript_application',parameters:{source_paths:options.sourcePaths},normalized_result:{semantic_graph:{graph_id:'test-only',nodes:options.sourcePaths.map(s=>({identity:{module_path:s,artifact_sha256:hashes[s]}}))}}};const stdout=path.join(options.outputDir,'stdout.json');fs.writeFileSync(stdout,JSON.stringify(transform(value,target)));return{exitCode:0,status:'completed-with-recorded-limitations',stdout,sha256:fileDigest(stdout)};};}
test('analysis validates multiple sources and never marks task done',async t=>{
 const f=setup(t);fs.writeFileSync(path.join(f.target,'other.js'),'export const b=2;');
 const r=await analyzeProject(f.workspace,['--source-path','index.js','--source-path','other.js'],{runner:runner()});
 assert.equal(r.state,'completed');assert.equal(r.verified,true);assert.equal(Object.keys(r.inputHashes).length,2);
});
test('partial graphs, changed sources and oversized results cannot pass',async t=>{
 const f=setup(t);for(const mutate of [v=>({...v,normalized_result:{}}),v=>({...v,parameters:{source_paths:['wrong.js']}}),v=>{v.normalized_result.semantic_graph.nodes[0].identity.artifact_sha256='bad';return v;},(v,target)=>{fs.writeFileSync(path.join(target,'index.js'),'changed');return v;}]){
 const r=await analyzeProject(f.workspace,['--source-path','index.js'],{runner:runner(mutate)});assert.notEqual(r.state,'completed');}
 const large=await analyzeProject(f.workspace,['--source-path','index.js'],{runner:async(e,t,o)=>{fs.mkdirSync(o.outputDir);const stdout=path.join(o.outputDir,'stdout.json');fs.writeFileSync(stdout,' '.repeat(16*1024*1024+1));return{exitCode:0,status:'unverified-large-output',stdout};}});assert.equal(large.verified,false);
});
test('deadlines, permission and malformed options stay explicit',async t=>{
 const f=setup(t);
 await assert.rejects(analyzeProject(f.workspace,[]));await assert.rejects(analyzeProject(f.workspace,['--source-path','../secret']));
 await assert.rejects(analyzeProject(f.workspace,['--source-path','index.js','--timeout-ms','1']));
 for(const result of [{status:'failed',exitCode:1,timedOut:true},{status:'failed',exitCode:1,blockers:['Win32 5: permission denied']}]){
 const run=await analyzeProject(f.workspace,['--source-path','index.js'],{runner:async()=>result});assert.equal(run.state,result.timedOut?'failed':'blocked');}
});
test('reconciliation never assumes unknown PID is absent',async t=>{
 const f=setup(t);await analyzeProject(f.workspace,['--source-path','index.js'],{runner:runner()});
 const dir=fs.readdirSync(path.join(f.workspace,'runs'))[0],file=path.join(f.workspace,'runs',dir,'run.json');
 for(const [probe,want] of [['unknown','unknown'],['active','running'],['absent','interrupted']]){
 const r=JSON.parse(fs.readFileSync(file));r.state='running';fs.writeFileSync(file,JSON.stringify(r));const runs=await reconcileRuns(f.workspace,{probeProcess:()=>probe});assert.equal(runs[0].state,want);}
});
test('deleted or changed semantic evidence invalidates coverage',async t=>{
 const f=setup(t),r=await analyzeProject(f.workspace,['--source-path','index.js'],{runner:runner()});
 assert.equal(buildReport(f.workspace).coverage.semantic,'verified-for-selected-sources');
 const file=path.join(f.workspace,r.evidence.path),body=fs.readFileSync(file);fs.writeFileSync(file,'changed');
 assert.equal(buildReport(f.workspace).coverage.semantic,'unverified');fs.writeFileSync(file,body);fs.unlinkSync(file);
 assert.equal(buildReport(f.workspace).coverage.semantic,'unverified');
});
test('missing analysis event makes journal divergence visible',async t=>{
 const f=setup(t);await analyzeProject(f.workspace,['--source-path','index.js'],{runner:runner()});
 assert.equal(buildReport(f.workspace).journalDivergent,false);const file=path.join(f.workspace,'events.jsonl');
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').split('\n').filter(l=>!l.includes('analysis-finished')).join('\n'));
 assert.equal(buildReport(f.workspace).journalDivergent,true);
});
