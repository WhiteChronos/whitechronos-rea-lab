import fs from 'node:fs';
import {readProject,readJson} from './store.mjs';import {within} from './paths.mjs';import {readTasks,fileDigest} from './tasks.mjs';
export function buildReport(workspace){
 const project=readProject(workspace),tasks=readTasks(workspace).map(t=>{
  let evidenceStatus='unverified';if(t.evidence){try{evidenceStatus=fileDigest(within(workspace,t.evidence.path))===t.evidence.sha256?'operator-declared':'invalid-evidence';}catch{evidenceStatus='invalid-evidence';}}
  return{...t,evidenceStatus};
 });
 const runs=[];for(const entry of fs.readdirSync(within(workspace,'runs'),{withFileTypes:true})){
  if(entry.isSymbolicLink())throw Error('Link em runs recusado.');if(!entry.isDirectory())continue;
  const file=within(workspace,'runs/'+entry.name+'/run.json');if(fs.existsSync(file))runs.push(readJson(file));
 }
 const events=fs.readFileSync(within(workspace,'events.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
 const journalDivergent=tasks.some(t=>!events.some(e=>e.id===t.id&&(e.type==='task-added'||e.type==='task-state')));
 return{project:{id:project.id,name:project.name,format:project.format},tasks,runs,journalDivergent,
  coverage:{inventory:'unverified',semantic:runs.some(r=>r.state==='completed'&&r.verified===true)?'verified-for-selected-sources':'unverified',product:'unverified',performance:'unverified'},
  limitations:['Análise estática não comprova equivalência funcional.','Conclusão manual de tarefa é declaração do operador.']};
}
