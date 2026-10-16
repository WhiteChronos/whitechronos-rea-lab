import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
export function loadRuntimeConfig(){
 const skillRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.resolve(skillRoot,'../..');
 const defaults=JSON.parse(fs.readFileSync(path.join(skillRoot,'references/runtime.json'),'utf8'));
 const localPath=path.join(root,'runtime.local.json'),local=fs.existsSync(localPath)?JSON.parse(fs.readFileSync(localPath,'utf8')):{};
 const c={...defaults,...local};c.reaEntry=path.resolve(root,process.env.REA_ENTRY||c.reaEntry);c.eccSkills=process.env.ECC_SKILLS||c.eccSkills;
 if(c.eccSkills)c.eccSkills=path.resolve(root,c.eccSkills);c.reaEnvironment={...(c.reaEnvironment||{})};
 for(const key of ['JAVA_HOME','GHIDRA_INSTALL_DIR'])if(process.env[key])c.reaEnvironment[key]=process.env[key];return c;
}
