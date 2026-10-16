import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {setup} from './project-helpers.mjs';import {prepareRepository} from '../skills/whitechronos-lab/scripts/projects/export.mjs';
test('repository allowlist excludes target, workspace and private paths',async t=>{
 const f=setup(t);fs.writeFileSync(path.join(f.workspace,'private.key'),'secret');const p=await prepareRepository(f.workspace,{outputParent:f.root});
 assert.equal(path.basename(p.destination),'Demo-2.0');assert.equal(p.status,'prepared');
 assert.equal(spawnSync('git',['-C',p.destination,'rev-parse','--is-inside-work-tree'],{encoding:'utf8'}).stdout.trim(),'true');
 assert.deepEqual(fs.readdirSync(p.destination).filter(x=>x!=='.git').sort(),['.gitignore','ATTRIBUTIONS.md','README.md','SCOPE.md','project-manifest.json'].sort());
 for(const name of fs.readdirSync(p.destination).filter(x=>x!=='.git')){const body=fs.readFileSync(path.join(p.destination,name),'utf8');assert.equal(body.includes(f.target),false);assert.equal(body.includes('private.key'),false);}
 await assert.rejects(prepareRepository(f.workspace,{outputParent:f.root}));
});
test('Git failure preserves files and reuse requires attribution',async t=>{
 const f=setup(t),file=path.join(f.workspace,'project.json'),project=JSON.parse(fs.readFileSync(file));project.mode='reuse';fs.writeFileSync(file,JSON.stringify(project));
 await assert.rejects(prepareRepository(f.workspace,{outputParent:f.root}),/atribui/i);
 fs.writeFileSync(path.join(f.workspace,'ATTRIBUTIONS.md'),'Origem: https://example.com/source\nLicença: MIT\nRevisado pelo operador.');
 const r=await prepareRepository(f.workspace,{outputParent:f.root,gitRunner:()=>({status:1,stderr:'missing git'})});assert.equal(r.status,'incomplete');assert.equal(fs.existsSync(path.join(r.destination,'README.md')),true);
 await assert.rejects(prepareRepository(f.workspace,{outputParent:f.root}));
});
test('export rejects target nesting and treats shell metacharacters as path data',async t=>{
 const f=setup(t);await assert.rejects(prepareRepository(f.workspace,{outputParent:f.target}));
 const parent=path.join(f.root,'space & literal');fs.mkdirSync(parent);const r=await prepareRepository(f.workspace,{outputParent:parent});assert.equal(r.status,'prepared');
});
