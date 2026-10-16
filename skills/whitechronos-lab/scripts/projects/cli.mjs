import crypto from 'node:crypto';
import {createProject,writeJsonAtomic,withProjectLock} from './store.mjs';import {within} from './paths.mjs';
import {addTask,setTask} from './tasks.mjs';import {buildReport} from './report.mjs';import {analyzeProject,reconcileRuns} from './analysis.mjs';import {prepareRepository} from './export.mjs';
function parse(args,allowed,repeat=[]){
 const options={};for(let i=0;i<args.length;i++){
  const flag=args[i];if(!allowed.includes(flag))throw Error('Opção desconhecida: '+flag);
  if(flag==='--json'){if(options[flag])throw Error('Opção duplicada.');options[flag]=true;continue;}
  const value=args[++i];if(!value||value.startsWith('--'))throw Error('Valor ausente: '+flag);
  if(repeat.includes(flag))(options[flag]??=[]).push(value);else{if(flag in options)throw Error('Opção duplicada: '+flag);options[flag]=value;}
 }return options;
}
function required(value,label){if(!value)throw Error('Informe '+label);return value;}
export async function projectMain(args){
 const [command,...rest]=args;let result,code=0;
 if(command==='create'){
  const [target,...flags]=rest,o=parse(flags,['--name','--workspace','--mode']);
  result=createProject({target:required(target,'alvo'),name:required(o['--name'],'nome'),workspace:required(o['--workspace'],'workspace'),mode:required(o['--mode'],'modo')});
 }else if(command==='task'){
  const [action,workspace,...tail]=rest;required(workspace,'workspace');
  if(action==='add'){const o=parse(tail,['--title','--acceptance','--depends-on'],['--depends-on']);result=await addTask(workspace,{title:o['--title'],acceptance:o['--acceptance'],dependsOn:o['--depends-on']??[]});}
  else if(action==='set'){const[id,...flags]=tail,o=parse(flags,['--state','--evidence']);result=await setTask(workspace,required(id,'id'),{state:o['--state'],evidence:o['--evidence']});}
  else throw Error('Use task add ou task set.');
 }else{
  const [workspace,...flags]=rest;required(workspace,'workspace');
  if(command==='analyze'){
   parse(flags,['--source-path','--analysis-timeout-ms','--timeout-ms','--max-heap-mb'],['--source-path']);
   result=await analyzeProject(workspace,flags);code=result.state==='completed'?0:1;
  }else if(command==='status'){parse(flags,['--json']);result=buildReport(workspace);}
  else if(command==='report'){
   parse(flags,[]);result=await withProjectLock(workspace,()=>{const report=buildReport(workspace),reportPath='reports/'+crypto.randomUUID()+'.json';writeJsonAtomic(within(workspace,reportPath),report);return{...report,reportPath};});
  }else if(command==='reconcile'){parse(flags,[]);result=await reconcileRuns(workspace);}
  else if(command==='prepare-repo'){
   const o=parse(flags,['--output-parent']);result=await prepareRepository(workspace,{outputParent:required(o['--output-parent'],'destino pai')});code=result.status==='prepared'?0:1;
  }else throw Error('Use project create, analyze, task, status, report, reconcile ou prepare-repo.');
 }
 console.log(JSON.stringify(result,null,2));return code;
}
