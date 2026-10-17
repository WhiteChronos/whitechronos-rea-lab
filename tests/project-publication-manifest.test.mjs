import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {setup} from './project-helpers.mjs';
import {readProject} from '../skills/whitechronos-lab/scripts/projects/store.mjs';
import {validatePublicationManifest} from '../skills/whitechronos-lab/scripts/projects/publication-manifest.mjs';

function fixture(t){
 const f=setup(t);f.delivery=path.join(f.root,'delivery');fs.mkdirSync(f.delivery);
 f.manifest={schemaVersion:1,programId:readProject(f.workspace).id,deliveryRoot:f.delivery,files:[]};
 f.add=(name,body,kind='product')=>{
  const file=path.join(f.delivery,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);
  const entry={path:name,sha256:crypto.createHash('sha256').update(body).digest('hex'),kind};f.manifest.files.push(entry);return entry;
 };
 f.add('LICENSE','MIT License\nCopyright (c) Example\nPermission is hereby granted, free of charge.\n','documentation');
 f.add('ATTRIBUTIONS.md','Independent implementation; MIT notices preserved.\n','documentation');
 f.add('src/main.mjs','export const sum = (a,b) => a+b;\n');return f;
}

test('validates an explicit own product and preserves license and attribution bytes',async t=>{
 const f=fixture(t);f.add('tests/main.test.mjs',"import {test} from 'node:test'; import assert from 'node:assert/strict'; import {sum} from '../src/main.mjs'; test('sum',()=>assert.equal(sum(2,3),5));\n");
 f.add('README.md','# Own program\n','documentation');
 fs.writeFileSync(path.join(f.delivery,'unlisted.txt'),'not exported');
 const before=fs.readFileSync(path.join(f.delivery,'LICENSE'));
 const result=validatePublicationManifest(f.workspace,f.manifest);
 assert.deepEqual(result,{programId:f.manifest.programId,files:f.manifest.files.map(({path,sha256})=>({path,sha256}))});
 assert.deepEqual(fs.readFileSync(path.join(f.delivery,'LICENSE')),before);
 const run=spawnSync(process.execPath,['--test','tests/main.test.mjs'],{cwd:f.delivery,encoding:'utf8',shell:false});assert.equal(run.status,0);
});

for(const name of ['/absolute.txt','C:/absolute.txt','../escape','src/../../escape','src\\main.mjs','src//main.mjs','src/./main.mjs','NUL.txt','src/COM1.js','src/file:stream','src/file.','src/file ','src/a?.js','-option','src/\u0001.js']){
 test('rejects unsafe portable path '+JSON.stringify(name),t=>{const f=fixture(t);f.manifest.files[2].path=name;assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest));});
}

for(const name of ['.git/config','.gitattributes','.empty-hooks/x','.env','.env.production','src/runtime.local.json','evidence/result.json','reports/private.md','credentials.json','secret.pem','notes/personal.md','workspace/project.json','.npmrc','.netrc','_netrc','.pypirc','.git-credentials','.config/gh/hosts.yml','.docker/config.json','.kube/config']){
 test('rejects private path '+name,t=>{const f=fixture(t);f.add(name,'private data');assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/proibid|privad/i);});
}

test('rejects delivery overlap with target and workspace in either direction',t=>{
 const f=fixture(t);for(const deliveryRoot of [f.target,f.workspace,path.join(f.target,'out'),path.join(f.workspace,'out'),f.root])assert.throws(()=>validatePublicationManifest(f.workspace,{...f.manifest,deliveryRoot}));
});

test('rejects directory junctions before reading files outside delivery',t=>{
 const f=fixture(t);fs.symlinkSync(f.target,path.join(f.delivery,'linked'),process.platform==='win32'?'junction':'dir');
 f.manifest.files[2].path='linked/index.js';assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/link|redirecion/i);
});

test('rejects symbolic delivery root',t=>{
 const f=fixture(t),link=path.join(f.root,'delivery-link');fs.symlinkSync(f.delivery,link,process.platform==='win32'?'junction':'dir');
 assert.throws(()=>validatePublicationManifest(f.workspace,{...f.manifest,deliveryRoot:link}),/link|redirecion/i);
});

test('rejects directories and hardlinked files as product entries',t=>{
 const f=fixture(t);f.manifest.files[2].path='src';assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/regular/i);
 f.manifest.files[2].path='hard.mjs';fs.linkSync(path.join(f.target,'index.js'),path.join(f.delivery,'hard.mjs'));assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/link/i);
});

test('rejects tampering and malformed hash without exposing contents',t=>{
 const f=fixture(t);fs.appendFileSync(path.join(f.delivery,'src/main.mjs'),'// changed');assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/hash/i);
 f.manifest.files[2].sha256='not a digest';assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/hash/i);
});

test('rejects identity mismatch, malformed schema, duplicates, docs-only and missing notices',t=>{
 const f=fixture(t);for(const change of [{programId:'other'},{schemaVersion:2},{deliveryRoot:'relative'},{files:[]},{files:[...f.manifest.files,f.manifest.files[2]]},{files:f.manifest.files.slice(0,2)},{files:f.manifest.files.slice(1)}])assert.throws(()=>validatePublicationManifest(f.workspace,{...f.manifest,...change}));
 f.manifest.files.push({...f.manifest.files[2],path:'SRC/main.mjs'});assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/duplic/i);
});

test('documentation kind is restricted to safe root names and cannot disguise product',t=>{
 const f=fixture(t);f.add('arbitrary.md','text','documentation');assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/document/i);
 f.manifest.files.pop();f.manifest.files[2].kind='documentation';assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/document/i);
});

test('rejects obvious synthetic secrets in product and free text attribution without printing values',t=>{
 const bodies=['OPENAI_API_KEY='+['sk','proj','A'.repeat(40)].join('-'),'-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----','password = "synthetic-password-123"','https://user:synthetic-password@example.com','ghp_'+'A'.repeat(36),'_authToken=npm_'+'A'.repeat(36),'machine example.com login synthetic password synthetic-value-123','oauth_token: synthetic-value-123'];
 const f=fixture(t);for(const body of bodies){const entry=f.manifest.files[1];fs.writeFileSync(path.join(f.delivery,entry.path),body);entry.sha256=crypto.createHash('sha256').update(body).digest('hex');let caught;try{validatePublicationManifest(f.workspace,f.manifest);}catch(e){caught=e;}assert.ok(caught);assert.match(caught.message,/segredo/i);assert.equal(caught.message.includes(body),false);}
});

test('enforces count, individual size and total byte budgets before exporting',t=>{
 const f=fixture(t);assert.throws(()=>validatePublicationManifest(f.workspace,{...f.manifest,files:Array.from({length:1001},()=>f.manifest.files[2])}),/limite/i);
 const fd=fs.openSync(path.join(f.delivery,'src/main.mjs'),'w');fs.ftruncateSync(fd,16*1024*1024+1);fs.closeSync(fd);assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/limite/i);
 f.manifest.files.splice(2);for(let i=0;i<5;i++)f.add(`part${i}.bin`,Buffer.alloc(14*1024*1024));assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/limite/i);
});

test('rejects prefixed credential assignments and bearer authorization in either encoding',t=>{
 const f=fixture(t),entry=f.manifest.files[2];
 for(const [text,encoding] of [['SERVICE_API_KEY="synthetic-value-123"','utf8'],['Authorization: Bearer synthetic-value-123','utf8'],['password = synthetic-value-123','utf16le']]){
  const bytes=Buffer.from(text,encoding);fs.writeFileSync(path.join(f.delivery,entry.path),bytes);entry.sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/segredo/i);
 }
});

test('rejects whitespace-only license and attribution notices',t=>{
 const f=fixture(t),entry=f.manifest.files[0],body=' \n\t';fs.writeFileSync(path.join(f.delivery,entry.path),body);entry.sha256=crypto.createHash('sha256').update(body).digest('hex');
 assert.throws(()=>validatePublicationManifest(f.workspace,f.manifest),/licen|atribui/i);
});
