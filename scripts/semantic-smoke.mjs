import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runAnalysis, readAnalysisOptions } from '../skills/whitechronos-lab/scripts/resolutions.mjs';
import {verifySourceEvidence} from '../skills/whitechronos-lab/scripts/semantic-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root,'fixtures/javascript-app');

export function verifySemanticSmoke(result, value, sourceSha256) {
  const proof=verifySourceEvidence(result,value,{'index.js':sourceSha256});
  const evidence = value.evidence ?? value;
  const graph = evidence.normalized_result?.semantic_graph;
  if (evidence.operation !== 'analyze_javascript_application' || !graph?.graph_id || !Array.isArray(graph.nodes)) throw Error('Grafo semântico ausente; inventário não satisfaz o smoke.');
  const nodes = graph.nodes.filter(n => n.identity?.module_path === 'index.js' && n.identity?.artifact_sha256 === sourceSha256);
  if (proof.matchingSourceNodes < 3) throw Error('Grafo não contém observações suficientes vinculadas ao hash da fonte selecionada.');
  const selected = evidence.parameters?.source_paths ?? evidence.normalized_result?.source_selection?.requested_paths;
  if (!Array.isArray(selected) || selected.length !== 1 || selected[0] !== 'index.js') throw Error('Escopo de fontes inesperado.');
  return { passed: true, operation:evidence.operation, graphId:graph.graph_id, matchingSourceNodes:nodes.length,
    sourceSha256, runtimeEquivalenceVerified:false, scope:'Análise estática real de uma fixture própria; não executa o alvo e não valida Ghidra.' };
}

export async function smoke() {
  const parent=path.join(root,'evidence'); fs.mkdirSync(parent,{recursive:true});
  const out=path.join(parent,'semantic-'+new Date().toISOString().replace(/[:.]/g,'-'));
  const options=readAnalysisOptions(['--source-path','index.js','--output-dir',out,'--analysis-timeout-ms','30000']);
  const result=await runAnalysis(path.join(root,'node_modules/rea-agents/scripts/rea.mjs'),fixture,options);
  const value=JSON.parse(fs.readFileSync(result.stdout,'utf8'));
  const sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(fixture,'index.js'))).digest('hex');
  const report=verifySemanticSmoke(result,value,sha);
  fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,evidenceDirectory:out},null,2));
  return report;
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await smoke(); } catch(e) { console.error(e.message); process.exitCode=1; }
}
