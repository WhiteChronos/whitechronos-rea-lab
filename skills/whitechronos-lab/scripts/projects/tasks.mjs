import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {readProject,readJson,writeJsonAtomic,withProjectLock,recordEvent} from './store.mjs';
import {within,assertNoLinks} from './paths.mjs';
const states=new Set(['pending','running','blocked','done','failed']);
export function fileDigest(file){
 assertNoLinks(file);if(!fs.statSync(file).isFile())throw Error('Evidência precisa ser arquivo regular.');
 const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(65536);
 try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}return hash.digest('hex');
}
export function readTasks(workspace){
 readProject(workspace);const tasks=readJson(within(workspace,'tasks.json'));
 if(!Array.isArray(tasks))throw Error('Tarefas inválidas.');const byId=new Map();
 for(const task of tasks){if(!task||typeof task.id!=='string'||byId.has(task.id)||!states.has(task.state)||!Array.isArray(task.dependsOn)||typeof task.title!=='string'||typeof task.acceptance!=='string')throw Error('Tarefa inválida.');byId.set(task.id,task);}
 const visiting=new Set(),visited=new Set();
 function visit(id){if(visiting.has(id))throw Error('Ciclo nas dependências.');if(visited.has(id))return;const t=byId.get(id);if(!t)throw Error('Dependência inexistente.');visiting.add(id);for(const dep of t.dependsOn)visit(dep);visiting.delete(id);visited.add(id);}
 for(const id of byId.keys())visit(id);return tasks;
}
export async function addTask(workspace,{title,acceptance,dependsOn=[]}){
 return withProjectLock(workspace,()=>{
  if(typeof title!=='string'||!title.trim()||typeof acceptance!=='string'||!acceptance.trim()||!Array.isArray(dependsOn))throw Error('Título e critério obrigatórios.');
  const tasks=readTasks(workspace);for(const dep of dependsOn)if(!tasks.some(t=>t.id===dep))throw Error('Dependência inexistente.');
  const at=new Date().toISOString(),task={id:crypto.randomUUID(),journalRevision:crypto.randomUUID(),title,acceptance,dependsOn:[...new Set(dependsOn)],state:'pending',createdAt:at,updatedAt:at};
  tasks.push(task);writeJsonAtomic(within(workspace,'tasks.json'),tasks);recordEvent(workspace,{type:'task-added',id:task.id,journalRevision:task.journalRevision});return task;
 });
}
export async function setTask(workspace,id,{state,evidence}){
 return withProjectLock(workspace,()=>{
  if(!states.has(state))throw Error('Estado de tarefa inválido.');const tasks=readTasks(workspace),task=tasks.find(t=>t.id===id);if(!task)throw Error('Tarefa inexistente.');
  if(['running','done'].includes(state)&&task.dependsOn.some(dep=>tasks.find(t=>t.id===dep).state!=='done'))throw Error('Dependências pendentes.');
  if(task.state==='done'&&state!=='done'&&tasks.some(t=>t.dependsOn.includes(id)&&['running','done'].includes(t.state)))throw Error('Dependentes ativos impedem retrocesso.');
  if(state==='done'){
   if(!evidence)throw Error('Evidência obrigatória.');const file=within(workspace,evidence);
   task.evidence={path:path.relative(path.resolve(workspace),file).split(path.sep).join('/'),sha256:fileDigest(file),verification:'operator-declared'};
  }else delete task.evidence;
  task.state=state;task.updatedAt=new Date().toISOString();task.journalRevision=crypto.randomUUID();writeJsonAtomic(within(workspace,'tasks.json'),tasks);recordEvent(workspace,{type:'task-state',id,state,journalRevision:task.journalRevision});return task;
 });
}
