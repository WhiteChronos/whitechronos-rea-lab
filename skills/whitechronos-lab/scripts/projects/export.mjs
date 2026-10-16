import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {readProject,writeJsonAtomic,withProjectLock,recordEvent} from './store.mjs';import {within,assertNoLinks,assertSeparatePaths} from './paths.mjs';
export async function prepareRepository(workspace,{outputParent,gitRunner=(args,cwd)=>spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,shell:false})}){
 return withProjectLock(workspace,()=>{
  const p=readProject(workspace);const parent=assertNoLinks(outputParent),destination=path.join(parent,p.name);
  assertSeparatePaths({target:p.target,workspace,destination});assertNoLinks(destination);
  let attribution='Implementação independente. Nenhum código do alvo foi copiado automaticamente.\n';
  if(p.mode==='reuse'){
   const file=within(workspace,'ATTRIBUTIONS.md');if(!fs.existsSync(file)||fs.statSync(file).size>1024*1024)throw Error('Atribuições revisadas de origem e licença obrigatórias.');
   attribution=fs.readFileSync(file,'utf8');if(!attribution.trim())throw Error('Atribuições vazias.');
  }
  fs.mkdirSync(destination);
  const files={
   'README.md':`# ${p.name}\n\nProjeto independente em preparação. Código do produto ainda precisa ser implementado e testado.\n\nModo: ${p.mode}. Consulte SCOPE.md e ATTRIBUTIONS.md.\n`,
   'SCOPE.md':'# Escopo\n\nDescreva funcionalidades, critérios de aceitação e melhorias mensuráveis. Preparar este repositório não comprova equivalência funcional.\n',
   'ATTRIBUTIONS.md':attribution,
   '.gitignore':'node_modules/\n.env\n.env.*\nruntime.local.json\nevidence/\nworkspace/\n*.key\n*.pem\n',
   'project-manifest.json':JSON.stringify({schemaVersion:1,id:p.id,name:p.name,mode:p.mode},null,2)+'\n'
  };
  for(const [name,content]of Object.entries(files))fs.writeFileSync(path.join(destination,name),content,{flag:'wx'});
  let git;try{git=gitRunner(['init','-b','main'],destination);}catch(e){git={status:1,error:e};}
  const status=git.status===0&&!git.error?'prepared':'incomplete';p.destination=destination;p.repositoryStatus=status;p.updatedAt=new Date().toISOString();
  writeJsonAtomic(within(workspace,'project.json'),p);recordEvent(workspace,{type:'repository-prepared',status});
  return{destination,status,...(status==='incomplete'?{reason:'Git não inicializou; arquivos preservados, inspecione antes de retentar.'}:{})};
 });
}
