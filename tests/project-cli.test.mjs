import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../skills/whitechronos-lab/scripts/lab.mjs',import.meta.url));
function call(...args){const p=spawnSync(process.execPath,[cli,'project',...args],{encoding:'utf8'});return{status:p.status,body:JSON.parse(p.stdout)};}
test('CLI creates, persists and prepares independent repository',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rea-cli-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const target=path.join(root,'target'),w=path.join(root,'work');fs.mkdirSync(target);fs.writeFileSync(path.join(target,'index.js'),'export const a=1;');
 const c=call('create',target,'--name','Demo','--workspace',w,'--mode','independent');assert.equal(c.status,0);
 const a=call('task','add',w,'--title','Implement','--acceptance','tests pass');assert.equal(a.status,0);
 const b=call('task','add',w,'--title','Validate','--acceptance','verified','--depends-on',a.body.id,'--depends-on',a.body.id);assert.equal(b.status,0);
 fs.writeFileSync(path.join(w,'proof.json'),'{}');assert.equal(call('task','set',w,a.body.id,'--state','done','--evidence','proof.json').status,0);
 assert.equal(call('status',w,'--json').body.tasks[1].state,'pending');assert.equal(call('report',w).body.coverage.product,'unverified');
 assert.equal(call('prepare-repo',w,'--output-parent',root).body.status,'prepared');assert.equal(fs.readFileSync(path.join(target,'index.js'),'utf8'),'export const a=1;');
});
test('CLI rejects unknown flags and reserved analysis output before launch',()=>{
 for(const args of [['create','target','--name'],['status','w','--unknown','x'],['create','t','--name','x','--workspace','w'],['analyze','w','--source-path',''],['analyze','w','--output-dir','out']])assert.equal(call(...args).status,1);
});
