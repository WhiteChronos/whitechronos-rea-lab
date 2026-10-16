import fs from 'node:fs';
import path from 'node:path';

export function normalizeName(value){
 if(typeof value!=='string')throw Error('Nome inválido.');
 const name=value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,'-').replace(/-2\.0$/i,'');
 if(!name||!/[a-z0-9]/i.test(name)||!/^[a-z0-9._-]+$/i.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)||name.length+4>100)throw Error('Nome inválido ou reservado para repositório.');
 return name+'-2.0';
}
export function assertNoLinks(input){
 const absolute=path.resolve(input);let current=path.parse(absolute).root;
 for(const part of absolute.slice(current.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);
  try{const s=fs.lstatSync(current);if(s.isSymbolicLink())throw Error('Link ou redirecionamento recusado: '+current);}
  catch(e){if(e.code!=='ENOENT')throw e;}
 }
 return absolute;
}
export function contains(parent,child){const rel=path.relative(parent,child);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
export function assertSeparatePaths({target,workspace,destination}){
 const paths=[target,workspace,destination].filter(Boolean).map(assertNoLinks);
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)if(contains(paths[i],paths[j])||contains(paths[j],paths[i]))throw Error('Alvo, workspace e destino precisam ser separados.');
}
export function within(root,relative){
 if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('Caminho relativo inválido.');
 const base=assertNoLinks(root),file=assertNoLinks(path.resolve(base,relative));
 if(file===base||!contains(base,file))throw Error('Caminho fora do diretório.');return file;
}
