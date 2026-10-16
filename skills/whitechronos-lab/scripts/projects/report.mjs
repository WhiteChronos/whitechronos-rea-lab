import fs from 'node:fs';
import {readProject,readJson} from './store.mjs';import {within} from './paths.mjs';import {readTasks,fileDigest} from './tasks.mjs';
export function buildReport(workspace){
 const project=readProject(workspace),tasks=readTasks(workspace).map(t=>{
  let evidenceStatus='unverified';if(t.evidence){try{evidenceStatus=fileDigest(within(workspace,t.evidence.path))===t.evidence.sha256?'operator-declared':'invalid-evidence';}catch{evidenceStatus='invalid-evidence';}}
  return{...t,evidenceStatus};
 });
 const runs=[];for(const entry of fs.readdirSync(within(workspace,'runs'),{withFileTypes:true})){
  if(entry.isSymbolicLink())throw Error('Link em runs recusado.');if(!entry.isDirectory())continue;
  const file=within(workspace,'runs/'+entry.name+'/run.json');if(fs.existsSync(file)){
   const run=readJson(file);let evidenceStatus='unverified';
   if(run.evidence){try{evidenceStatus=fileDigest(within(workspace,run.evidence.path))===run.evidence.sha256?'valid':'invalid-evidence';}catch{evidenceStatus='invalid-evidence';}}
   runs.push({...run,evidenceStatus});
  }
 }
 const events=fs.readFileSync(within(workspace,'events.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
 const lastRevision=(id,types,key='id')=>events.filter(e=>e[key]===id&&types.includes(e.type)).at(-1)?.journalRevision;
 const journalDivergent=!project.journalRevision||lastRevision(project.id,['created','project-analysis','repository-prepared'],'projectId')!==project.journalRevision||
  tasks.some(t=>!t.journalRevision||lastRevision(t.id,['task-added','task-state'])!==t.journalRevision)||
  runs.some(r=>!r.journalRevision||lastRevision(r.id,['analysis-finished','analysis-reconciled'])!==r.journalRevision);
 return{project:{id:project.id,name:project.name,format:project.format},tasks,runs,journalDivergent,
  coverage:{inventory:'unverified',semantic:runs.some(r=>r.state==='completed'&&r.verified===true&&r.evidenceStatus==='valid')?'verified-for-selected-sources':'unverified',product:'unverified',performance:'unverified'},
  limitations:['Análise estática não comprova equivalência funcional.','Conclusão manual de tarefa é declaração do operador.']};
}
