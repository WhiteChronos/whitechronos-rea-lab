import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createProject} from '../skills/whitechronos-lab/scripts/projects/store.mjs';
export function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'rea-project-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const target=path.join(root,'target'),workspace=path.join(root,'workspace');fs.mkdirSync(target);fs.writeFileSync(path.join(target,'index.js'),'export const a=1;');createProject({target,workspace,name:'Demo',mode:'independent'});return{root,target,workspace};}
