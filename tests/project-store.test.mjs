import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeName,assertSeparatePaths} from '../skills/whitechronos-lab/scripts/projects/paths.mjs';
import {createProject,readProject,writeJsonAtomic,withProjectLock} from '../skills/whitechronos-lab/scripts/projects/store.mjs';
export function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'rea-project-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const target=path.join(root,'target');fs.mkdirSync(target);fs.writeFileSync(path.join(target,'index.js'),'export const a=1;');return{root,target,workspace:path.join(root,'workspace')};}
test('names reject traversal, Windows devices and invalid characters',()=>{
 assert.equal(normalizeName('Éditor-2.0'),'Editor-2.0');assert.equal(normalizeName('Meu editor'),'Meu-editor-2.0');
 for(const x of ['', '.', '..','CON','con.txt','LPT1','x/y','a'.repeat(100)])assert.throws(()=>normalizeName(x));
});
test('project preserves target, refuses collisions and schema upgrades',t=>{
 const f=fixture(t);const p=createProject({...f,name:'Editor',mode:'independent'});
 assert.equal(readProject(f.workspace).id,p.id);assert.equal(p.schemaVersion,1);assert.equal(p.name,'Editor-2.0');
 assert.equal(fs.readFileSync(path.join(f.target,'index.js'),'utf8'),'export const a=1;');
 assert.throws(()=>createProject({...f,name:'Editor',mode:'independent'}));
 const file=path.join(f.workspace,'project.json');fs.writeFileSync(file,JSON.stringify({...p,schemaVersion:99}));assert.throws(()=>readProject(f.workspace),/schema/i);
});
test('path boundaries and links prevent writes into target',t=>{
 const f=fixture(t);assert.throws(()=>assertSeparatePaths({target:f.target,workspace:path.join(f.target,'out')}));
 assert.doesNotThrow(()=>assertSeparatePaths({target:f.target,workspace:f.target+'-other'}));
 assert.throws(()=>assertSeparatePaths({target:f.target,workspace:f.workspace,destination:path.join(f.workspace,'repo')}));
 const link=path.join(f.root,'junction');fs.symlinkSync(f.target,link,process.platform==='win32'?'junction':'dir');
 assert.throws(()=>assertSeparatePaths({target:f.target,workspace:path.join(link,'out')}),/link|redirecion/i);
});
test('atomic failure leaves previous document and lock excludes writers',async t=>{
 const f=fixture(t);createProject({...f,name:'Test',mode:'independent'});const file=path.join(f.workspace,'test.json');writeJsonAtomic(file,{n:1});
 assert.throws(()=>writeJsonAtomic(file,{n:2},{...fs,renameSync(){throw Error('disk failure');}}),/disk/);
 assert.deepEqual(JSON.parse(fs.readFileSync(file)),{n:1});
 await withProjectLock(f.workspace,async()=>{await assert.rejects(withProjectLock(f.workspace,async()=>{}),/bloque/i);});
 assert.equal(fs.existsSync(path.join(f.workspace,'.project.lock')),false);
});
