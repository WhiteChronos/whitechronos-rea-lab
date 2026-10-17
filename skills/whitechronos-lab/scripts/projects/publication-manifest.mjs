import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readProject} from './store.mjs';
import {assertNoLinks,assertSeparatePaths,within} from './paths.mjs';

const DOCUMENTS=new Set(['README.md','SCOPE.md','ATTRIBUTIONS.md','LICENSE','NOTICE','.gitignore','project-manifest.json']);
const MAX_FILES=1000,MAX_FILE_BYTES=16*1024*1024,MAX_BYTES=64*1024*1024;

function portablePath(value){
 if(typeof value!=='string'||!value||value.length>240||value.includes('\\')||path.posix.isAbsolute(value)||path.win32.isAbsolute(value))throw Error('Caminho relativo portável inválido.');
 for(const part of value.split('/')){
  if(!part||part==='.'||part==='..'||part.length>120||/^[\s-]|[.\s]$|[<>:"|?*\x00-\x1f\x7f]/u.test(part)||/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))throw Error('Nome de arquivo inválido ou reservado.');
  if(/^(?:\.git|\.gitattributes|\.empty-hooks|\.hg|\.svn|\.env(?:\..*)?|runtime\.local(?:\..*)?|evidence|evidences|private|reports|runs|notes|workspace|\.codex|\.agents|\.aws|\.ssh|node_modules|\.npmrc|\.netrc|_netrc|\.pypirc|\.git-credentials|\.config|\.docker|\.kube)$/i.test(part)||/(?:credentials?|secrets?|private[-_]?(?:key|evidence))|\.(?:pem|key|pfx|p12|kdbx)$/i.test(part))throw Error('Caminho privado ou proibido na publicação.');
 }
 return value;
}

function inspectContents(bytes){
 // Conservative screening only: never include file contents or matched values in errors.
 const text=bytes.toString('utf8').replace(/\0/g,'');
 if(/\bnpm_[A-Za-z0-9]{20,}\b|\bpassword\s+[^\s]{8,}/i.test(text)||/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/.test(text)||/\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/.test(text)||/\b(?:[a-z][a-z0-9]*[_-])*(?:api[_-]?key|access[_-]?token|_?auth[_-]?token|oauth[_-]?token|password|passwd|client[_-]?secret|secret[_-]?key)\b\s*["']?\s*[:=]\s*["']?[^\s"'`,;]{8,}/i.test(text)||/\bauthorization\b\s*["']?\s*[:=]\s*["']?Bearer\s+[^\s"']{8,}/i.test(text)||/https?:\/\/[^\s/@:]+:[^\s/@]+@/i.test(text))throw Error('Possível segredo no conteúdo; revise localmente antes de publicar.');
}

/** Validate explicit files from a separate own-product delivery; does not copy or execute. */
export function validatePublicationManifest(workspace,manifest){
 const project=readProject(workspace);
 if(!manifest||typeof manifest!=='object'||manifest.schemaVersion!==1||manifest.programId!==project.id)throw Error('Manifesto de publicação ou identidade inválida.');
 if(typeof manifest.deliveryRoot!=='string'||!path.isAbsolute(manifest.deliveryRoot))throw Error('Raiz absoluta da entrega obrigatória.');
 const root=assertNoLinks(manifest.deliveryRoot);
 assertSeparatePaths({target:project.target,workspace,destination:root});
 if(!fs.statSync(root).isDirectory())throw Error('Entrega deve ser diretório.');
 if(!Array.isArray(manifest.files)||manifest.files.length===0||manifest.files.length>MAX_FILES)throw Error('Limite de arquivos da entrega inválido.');
 const seen=new Set(),entries=[];let total=0,products=0;
 // Preflight paths and byte budgets before reading any file content.
 for(const entry of manifest.files){
  if(!entry||typeof entry!=='object')throw Error('Entrada de arquivo inválida.');
  const relative=portablePath(entry.path),key=relative.normalize('NFC').toLowerCase();
  if(seen.has(key))throw Error('Caminho duplicado no manifesto.');seen.add(key);
  if(!/^[a-f0-9]{64}$/.test(entry.sha256??''))throw Error('Hash SHA-256 inválido.');
  if(!['product','documentation'].includes(entry.kind))throw Error('Tipo de arquivo inválido.');
  if(entry.kind==='documentation'&&!DOCUMENTS.has(relative))throw Error('Documento fora da lista permitida.');
  if(DOCUMENTS.has(relative)&&entry.kind!=='documentation')throw Error('Documento deve declarar o tipo documentation.');
  if(entry.kind==='product')products++;
  const file=within(root,relative),stat=fs.lstatSync(file);
  if(!stat.isFile())throw Error('Somente arquivo regular pode ser publicado.');
  if(stat.nlink!==1)throw Error('Arquivo com hardlink recusado.');
  total+=stat.size;
  if(stat.size>MAX_FILE_BYTES||total>MAX_BYTES)throw Error('Limite de bytes da entrega excedido.');
  entries.push({relative,file,entry,stat});
 }
 if(!products)throw Error('Entrega documental não é um programa; declare arquivos próprios do produto.');
 for(const notice of ['LICENSE','ATTRIBUTIONS.md'])if(!entries.some(e=>e.relative===notice&&e.stat.size>0))throw Error('Licença e atribuições não vazias obrigatórias.');
 const files=[];
 for(const {relative,file,entry,stat} of entries){
  assertNoLinks(file);
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
  try{
   const current=fs.fstatSync(fd);
   if(!current.isFile()||current.nlink!==1||current.dev!==stat.dev||current.ino!==stat.ino||current.size!==stat.size)throw Error('Arquivo alterado durante validação.');
   // Fixed bounded read avoids unbounded allocation if a file grows after preflight.
   const bytes=Buffer.alloc(stat.size+1);let count=0;
   while(count<bytes.length){const n=fs.readSync(fd,bytes,count,bytes.length-count,null);if(n===0)break;count+=n;}
   if(count!==stat.size)throw Error('Arquivo alterado durante validação.');
   const body=bytes.subarray(0,count),sha256=crypto.createHash('sha256').update(body).digest('hex');
   if(sha256!==entry.sha256)throw Error('Hash do arquivo não confere.');
   inspectContents(body);
   if(['LICENSE','ATTRIBUTIONS.md'].includes(relative)&&!body.toString('utf8').trim())throw Error('Licença e atribuições não vazias obrigatórias.');
   files.push({path:relative,sha256});
  }finally{fs.closeSync(fd);}
 }
 return{files,programId:project.id};
}
