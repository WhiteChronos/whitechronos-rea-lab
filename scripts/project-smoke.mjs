import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {createProject} from '../skills/whitechronos-lab/scripts/projects/store.mjs';
import {addTask,setTask,fileDigest} from '../skills/whitechronos-lab/scripts/projects/tasks.mjs';
import {analyzeProject} from '../skills/whitechronos-lab/scripts/projects/analysis.mjs';
import {prepareRepository} from '../skills/whitechronos-lab/scripts/projects/export.mjs';
import {buildReport} from '../skills/whitechronos-lab/scripts/projects/report.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function projectSmoke(){
 const parent=path.join(root,'evidence');fs.mkdirSync(parent,{recursive:true});
 const work=fs.mkdtempSync(path.join(parent,'project-')),target=path.join(work,'target'),workspace=path.join(work,'workspace');
 fs.mkdirSync(target);for(const name of ['index.mjs','package.json'])fs.copyFileSync(path.join(root,'fixtures/projects-2.0-demo',name),path.join(target,name));
 const before=Object.fromEntries(['index.mjs','package.json'].map(n=>[n,fileDigest(path.join(target,n))]));
 createProject({target,workspace,name:'OwnedSum',mode:'independent'});
 const task=await addTask(workspace,{title:'Implementar soma própria',acceptance:'2+3=5; -2+2=0; entrada textual recusada'});
 const analysis=await analyzeProject(workspace,['--source-path','index.mjs','--analysis-timeout-ms','30000']);
 const repo=await prepareRepository(workspace,{outputParent:work});
 // Código novo próprio, escrito explicitamente pelo harness; não é cópia do alvo.
 fs.writeFileSync(path.join(repo.destination,'sum.mjs'),"export function sum(a,b){if(typeof a!=='number'||typeof b!=='number')throw new TypeError('numeric operands required');return a+b;}\n",{flag:'wx'});
 fs.copyFileSync(path.join(root,'fixtures/projects-2.0-demo/test.mjs'),path.join(repo.destination,'test.mjs'));
 const product=spawnSync(process.execPath,['--test','test.mjs'],{cwd:repo.destination,encoding:'utf8',windowsHide:true,timeout:15000,shell:false});
 fs.writeFileSync(path.join(workspace,'product-test.json'),JSON.stringify({exitCode:product.status,stdout:product.stdout,stderr:product.stderr}));
 if(product.status===0)await setTask(workspace,task.id,{state:'done',evidence:'product-test.json'});
 const unchanged=Object.entries(before).every(([n,sha])=>fileDigest(path.join(target,n))===sha);
 const report={passed:analysis.state==='completed'&&analysis.verified&&repo.status==='prepared'&&product.status===0&&unchanged,
  analysisState:analysis.state,semanticVerified:analysis.verified,analysisReason:analysis.reason??null,
  productTestPassed:product.status===0,repositoryPrepared:repo.status==='prepared',targetPreserved:unchanged,
  runtimeEquivalenceVerified:false,performanceImprovementVerified:false,workspace,repository:repo.destination,
  productSourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(repo.destination,'sum.mjs'))).digest('hex'),
  coverage:buildReport(workspace).coverage};
 fs.writeFileSync(path.join(work,'acceptance.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await projectSmoke();if(!result.passed)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}
}
