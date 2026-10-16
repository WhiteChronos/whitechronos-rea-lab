import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {readProject,readJson,writeJsonAtomic,withProjectLock,recordEvent} from './store.mjs';import {within} from './paths.mjs';import {fileDigest} from './tasks.mjs';
import {readAnalysisOptions,runAnalysis} from '../resolutions.mjs';import {loadRuntimeConfig} from '../runtime-config.mjs';import {verifySourceEvidence} from '../semantic-evidence.mjs';
const excluded=new Set(['.git','node_modules','.env','.ssh','.aws','.azure','.codex','.obsidian','.venv','venv']);
export async function analyzeProject(workspace,args,{runner=runAnalysis}={}){
 if(args.includes('--output-dir'))throw Error('Destino pertence ao workspace.');
 const options=readAnalysisOptions(args);if(!options.sourcePaths.length)throw Error('Selecione ao menos uma fonte JavaScript.');
 options.sourcePaths=options.sourcePaths.map(s=>s.split(/[\\/]/).join('/'));if(new Set(options.sourcePaths).size!==options.sourcePaths.length)throw Error('Fontes duplicadas.');
 return withProjectLock(workspace,async()=>{
  const project=readProject(workspace),hashes={};
  for(const source of options.sourcePaths){if(source.split('/').some(c=>excluded.has(c)||c.startsWith('.env.'))||! /\.(?:[cm]?js|jsx|tsx?|mts|cts)$/i.test(source))throw Error('Fonte excluída ou formato sem adaptador: '+source);hashes[source]=fileDigest(within(project.target,source));}
  const runs=within(workspace,'runs');
  for(const dir of fs.readdirSync(runs,{withFileTypes:true})){if(!dir.isDirectory())continue;const f=within(workspace,'runs/'+dir.name+'/run.json');if(fs.existsSync(f)&&['running','unknown'].includes(readJson(f).state))throw Error('Execução ativa ou desconhecida: reconcilie antes de iniciar outra.');}
  const id=crypto.randomUUID(),base='runs/'+id;fs.mkdirSync(within(workspace,base));
  const file=within(workspace,base+'/run.json'),runtime=loadRuntimeConfig();
  const run={id,state:'running',verified:false,inputHashes:hashes,versions:{node:process.version,rea:runtime.reaVersion},options:{...options},startedAt:new Date().toISOString(),pid:null,processIdentity:null};
  writeJsonAtomic(file,run);
  try{
   const output=await runner(runtime.reaEntry,project.target,{...options,outputDir:within(workspace,base+'/engine'),environment:runtime.reaEnvironment});
   run.exitCode=output.exitCode??null;run.reason=output.processError??output.blockers?.join('; ')??output.status;
   if(output.timedOut)throw Error('Prazo excedido.');
   if((output.blockers??[]).length){run.state='blocked';throw Error(run.reason);}
   if(!output.stdout||fs.statSync(output.stdout).size>16*1024*1024)throw Error('Saída ausente ou acima de 16 MiB; preservada sem validação.');
   const expected=within(workspace,base+'/engine/stdout.json');if(path.resolve(output.stdout)!==expected)throw Error('Saída fora do destino esperado.');
   const proof=verifySourceEvidence(output,JSON.parse(fs.readFileSync(expected,'utf8').replace(/^\uFEFF/,'')),hashes);
   for(const [s,sha]of Object.entries(hashes))if(fileDigest(within(project.target,s))!==sha)throw Error('Fonte alterada durante análise.');
   run.state='completed';run.verified=true;run.proof=proof;
   run.evidence={path:base+'/engine/stdout.json',sha256:fileDigest(expected)};
   project.format='javascript';project.sourceHashes=hashes;project.updatedAt=new Date().toISOString();writeJsonAtomic(within(workspace,'project.json'),project);
  }catch(e){if(run.state!=='blocked')run.state='failed';run.verified=false;run.reason=e.message;}
  run.finishedAt=new Date().toISOString();writeJsonAtomic(file,run);recordEvent(workspace,{type:'analysis-finished',id,state:run.state});return run;
 });
}
export async function reconcileRuns(workspace,{probeProcess=()=> 'unknown'}={}){
 return withProjectLock(workspace,()=>{
  const result=[];for(const dir of fs.readdirSync(within(workspace,'runs'),{withFileTypes:true})){
   if(!dir.isDirectory())continue;const file=within(workspace,'runs/'+dir.name+'/run.json');if(!fs.existsSync(file))continue;const r=readJson(file);
   if(['running','unknown'].includes(r.state)){const activity=probeProcess(r);r.state=activity==='absent'?'interrupted':activity==='active'?'running':'unknown';writeJsonAtomic(file,r);}
   result.push(r);
  }return result;
 });
}
