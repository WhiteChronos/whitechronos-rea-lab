import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createProject,readProject,readJson,writeJsonAtomic} from '../skills/whitechronos-lab/scripts/projects/store.mjs';
import {assertNoLinks,within} from '../skills/whitechronos-lab/scripts/projects/paths.mjs';
import {configurePublication,deliverProject,readPublicationPolicy} from '../skills/whitechronos-lab/scripts/projects/delivery.mjs';

const NAME='Lab-Publication-Acceptance-20261016-2.0';
const MARKER='.publication-acceptance.json';
const SOURCE='Own acceptance placeholder. This source directory is not executed or published.\n';
const PRODUCT={
 'sum.mjs':'export function sum(a,b) { return a+b; }\n',
 'sum.test.mjs':"import {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport {sum} from './sum.mjs';\ntest('sum handles positive and negative numbers',()=>{assert.equal(sum(2,3),5);assert.equal(sum(-2,2),0);});\n",
 'LICENSE':'MIT License\n\nCopyright (c) 2026 WhiteChronos\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n',
 'ATTRIBUTIONS.md':'# Attribution\n\nIndependent minimal acceptance fixture authored for WhiteChronos. No upstream product source is copied. Uses the Node.js standard library, supplied separately.\n'
};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function fixtureManifest(project,deliveryRoot){return{schemaVersion:1,programId:project.id,deliveryRoot,files:Object.entries(PRODUCT).map(([name,body])=>({path:name,kind:['LICENSE','ATTRIBUTIONS.md'].includes(name)?'documentation':'product',sha256:digest(body)}))};}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function prepare(root){
 if(typeof root!=='string'||!path.isAbsolute(root)||path.parse(path.resolve(root)).root===path.resolve(root))throw Error('Raiz absoluta específica obrigatória.');
 root=assertNoLinks(root);
 const source=within(root,'source'),workspace=within(root,'workspace'),delivery=within(root,'delivery');
 if(fs.existsSync(root)){
  if(!fs.statSync(root).isDirectory())throw Error('Raiz de aceitação inválida.');
  const allowed=new Set([MARKER,'source','workspace','delivery','acceptance.json']);
  if(fs.readdirSync(root).some(name=>!allowed.has(name)))throw Error('Raiz existente contém arquivos não reconhecidos.');
  const marker=readJson(within(root,MARKER)),project=readProject(workspace),manifest=fixtureManifest(project,delivery);
  if(marker.schemaVersion!==1||marker.tool!=='whitechronos-publication-acceptance'||marker.root!==root||marker.projectId!==project.id||!same(marker.manifest,manifest)||project.target!==source||project.name!==NAME||project.mode!=='independent')throw Error('Raiz existente não pertence a esta aceitação.');
  if(!same(fs.readdirSync(source),['placeholder.txt'])||fs.readFileSync(within(source,'placeholder.txt'),'utf8')!==SOURCE)throw Error('Fonte própria de aceitação alterada.');
  if(!same(fs.readdirSync(delivery).sort(),Object.keys(PRODUCT).sort()))throw Error('Entrega própria contém arquivos inesperados.');
  for(const [name,body] of Object.entries(PRODUCT)){
   const file=within(delivery,name),stat=fs.lstatSync(file);
   if(!stat.isFile()||stat.nlink!==1||stat.size!==Buffer.byteLength(body)||digest(fs.readFileSync(file))!==digest(body))throw Error('Entrega própria de aceitação alterada.');
  }
  return{root,workspace,delivery,manifest,project};
 }
 // Never overwrite or clean an existing directory. A partial initial preparation
 // without its identity marker requires operator inspection or a different root.
 fs.mkdirSync(root,{mode:0o700});fs.mkdirSync(source);fs.mkdirSync(delivery);
 fs.writeFileSync(within(source,'placeholder.txt'),SOURCE,{flag:'wx'});
 const project=createProject({target:source,name:NAME,workspace,mode:'independent'});
 for(const [name,body] of Object.entries(PRODUCT))fs.writeFileSync(within(delivery,name),body,{flag:'wx'});
 const manifest=fixtureManifest(project,delivery);
 writeJsonAtomic(within(root,MARKER),{schemaVersion:1,tool:'whitechronos-publication-acceptance',root,projectId:project.id,manifest});
 return{root,workspace,delivery,manifest,project};
}
/** Real default path uses authenticated gh adapter; injected transports never claim real GitHub proof. */
export async function runPublicationAcceptance(root,dependencies={}){
 const fixture=prepare(root),file=within(fixture.root,'acceptance.json');
 const report={schemaVersion:1,at:new Date().toISOString(),passed:false,realGitHubPublication:false,productRuntimeVerified:false,repository:null,commitSha:null,code:null};
 const save=()=>{writeJsonAtomic(file,report);return report;};
 const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;
 const run=dependencies.runProduct??spawnSync;
 let test;
 try{test=run(process.execPath,['--test',within(fixture.delivery,'sum.test.mjs')],{cwd:fixture.delivery,env,encoding:'utf8',shell:false,windowsHide:true,timeout:30000,maxBuffer:1024*1024});}
 catch{report.code='PRODUCT_TEST_FAILED';return save();}
 if(test.status!==0){report.code='PRODUCT_TEST_FAILED';return save();}
 report.productRuntimeVerified=!dependencies.runProduct;
 const current=readPublicationPolicy(fixture.workspace);
 if(current&&!current.enabled){report.code='ACCEPTANCE_POLICY_DISABLED';return save();}
 if(!current)await configurePublication(fixture.workspace,{enabled:true,owner:'WhiteChronos',repo:NAME});
 let first,second;
 try{
  first=await deliverProject(fixture.workspace,{manifest:fixture.manifest},dependencies.deliveryDependencies??{});
  second=await deliverProject(fixture.workspace,{manifest:fixture.manifest},dependencies.deliveryDependencies??{});
 }catch{report.code='PUBLICATION_INTERRUPTED';return save();}
 const a=first.publication,b=second.publication;
 const matched=a.state==='published'&&b.state==='published'&&a.repository?.id===b.repository?.id&&a.repository?.owner==='WhiteChronos'&&a.repository?.name===NAME&&a.repository?.private===true&&b.repository?.private===true&&a.commitSha===b.commitSha&&/^[a-f0-9]{40,64}$/.test(b.commitSha??'');
 report.repository=b.repository??null;report.commitSha=b.commitSha??null;
 report.code=matched?null:(b.code??a.code??'PUBLICATION_NOT_VERIFIED');
 report.realGitHubPublication=matched&&!dependencies.deliveryDependencies;
 report.passed=matched&&report.productRuntimeVerified&&report.realGitHubPublication;
 return save();
}
async function main(){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--root')throw Error('Uso: node scripts/publication-smoke.mjs --root <diretório-absoluto-novo-ou-aceitação-existente>');
 const report=await runPublicationAcceptance(args[1]);
 process.stdout.write(JSON.stringify(report,null,2)+'\n');process.exitCode=report.passed?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{
 process.stderr.write('Aceitação interrompida; diretórios e estado preservados. Inspecione a raiz e publication.json sem compartilhar credenciais.\n');process.exitCode=1;
});
