import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {setup} from './project-helpers.mjs';
import {addTask,setTask,readTasks} from '../skills/whitechronos-lab/scripts/projects/tasks.mjs';
import {buildReport} from '../skills/whitechronos-lab/scripts/projects/report.mjs';
test('tasks enforce dependencies and forbid invalid rollback',async t=>{
 const {workspace:w}=setup(t);const a=await addTask(w,{title:'A',acceptance:'test'}),b=await addTask(w,{title:'B',acceptance:'test',dependsOn:[a.id]});
 await assert.rejects(addTask(w,{title:'bad',acceptance:'test',dependsOn:['absent']}));
 await assert.rejects(setTask(w,b.id,{state:'running'}));await assert.rejects(setTask(w,b.id,{state:'done',evidence:'ok.json'}));
 fs.writeFileSync(path.join(w,'ok.json'),'{}');await setTask(w,a.id,{state:'done',evidence:'ok.json'});await setTask(w,b.id,{state:'running'});
 await assert.rejects(setTask(w,a.id,{state:'pending'}));assert.equal(readTasks(w)[0].state,'done');
 const file=path.join(w,'tasks.json'),data=readTasks(w);data[0].dependsOn=[b.id];fs.writeFileSync(file,JSON.stringify(data));assert.throws(()=>readTasks(w),/ciclo/i);
});
test('evidence integrity and operator declaration stay distinct',async t=>{
 const {workspace:w,root}=setup(t),a=await addTask(w,{title:'A',acceptance:'correct'});fs.writeFileSync(path.join(root,'outside'),'secret');
 await assert.rejects(setTask(w,a.id,{state:'done',evidence:'../outside'}));
 fs.symlinkSync(root,path.join(w,'link'),process.platform==='win32'?'junction':'dir');await assert.rejects(setTask(w,a.id,{state:'done',evidence:'link/outside'}));
 fs.writeFileSync(path.join(w,'ok.json'),'{}');await setTask(w,a.id,{state:'done',evidence:'ok.json'});
 assert.equal(buildReport(w).tasks[0].evidenceStatus,'operator-declared');fs.writeFileSync(path.join(w,'ok.json'),'changed');
 assert.equal(buildReport(w).tasks[0].evidenceStatus,'invalid-evidence');assert.equal(buildReport(w).coverage.product,'unverified');
 fs.writeFileSync(path.join(w,'tasks.json'),'{bad');assert.throws(()=>buildReport(w));
});
