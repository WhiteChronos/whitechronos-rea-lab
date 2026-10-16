import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifySemanticSmoke} from '../scripts/semantic-smoke.mjs';

test('smoke recusa inventário, fonte diferente e sucesso parcial',()=>{
  const result={exitCode:0,status:'completed-with-recorded-limitations'};
  assert.throws(()=>verifySemanticSmoke(result,{operation:'analyze_javascript_application'},'sha'),/ausente/);
  const evidence={operation:'analyze_javascript_application',parameters:{source_paths:['index.js']},normalized_result:{semantic_graph:{graph_id:'graph',nodes:Array.from({length:3},()=>({identity:{module_path:'index.js',artifact_sha256:'sha'}}))}}};
  assert.equal(verifySemanticSmoke(result,evidence,'sha').passed,true);
  assert.throws(()=>verifySemanticSmoke(result,evidence,'different'),/hash/);
  assert.throws(()=>verifySemanticSmoke({...result,status:'partial-or-blocked'},evidence,'sha'),/parcial/);
});
