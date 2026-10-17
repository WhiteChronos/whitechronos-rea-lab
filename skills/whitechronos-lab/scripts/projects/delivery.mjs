import fs from 'node:fs';
import {readProject,readJson,writeJsonAtomic,withProjectLock,recordEvent} from './store.mjs';
import {within} from './paths.mjs';
import {validatePublicationManifest} from './publication-manifest.mjs';
import {publishProject} from './publication.mjs';

function checkedPolicy(workspace,policy){
 const project=readProject(workspace);
 if(!policy||typeof policy.enabled!=='boolean'||policy.owner!=='WhiteChronos'||policy.repo!==project.name)throw Error('Política deve corresponder ao proprietário e ao nome deste programa.');
 return{schemaVersion:1,projectId:project.id,enabled:policy.enabled,owner:policy.owner,repo:policy.repo,visibility:'private'};
}
export async function configurePublication(workspace,policy){
 return withProjectLock(workspace,()=>{
  const result=checkedPolicy(workspace,policy);writeJsonAtomic(within(workspace,'publication-policy.json'),result);
  recordEvent(workspace,{type:'publication-policy',projectId:result.projectId,enabled:result.enabled});return result;
 });
}
export function readPublicationPolicy(workspace){
 const file=within(workspace,'publication-policy.json');if(!fs.existsSync(file))return null;
 const policy=readJson(file),project=readProject(workspace);
 if(policy.schemaVersion!==1||policy.projectId!==project.id||policy.visibility!=='private')throw Error('Política de publicação inválida.');
 return checkedPolicy(workspace,policy);
}
/** Delivery validates an explicitly selected own product; never runs the target. */
export async function deliverProject(workspace,{manifest},dependencies={}){
 const validated=validatePublicationManifest(workspace,manifest),policy=readPublicationPolicy(workspace);
 const publication=policy?.enabled?await(dependencies.publish??publishProject)(workspace,{owner:policy.owner,repo:policy.repo,manifest},dependencies):{state:'not-requested'};
 return{state:'delivery-validated',programId:validated.programId,files:validated.files,productRuntimeVerified:false,publication};
}
