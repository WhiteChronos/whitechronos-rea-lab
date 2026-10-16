export function verifySourceEvidence(result,value,sourceHashes){
 if(result.exitCode!==0||result.status!=='completed-with-recorded-limitations')throw Error('Análise falhou ou ficou parcial.');
 const evidence=value.evidence??value,graph=evidence.normalized_result?.semantic_graph;
 if(evidence.operation!=='analyze_javascript_application'||!graph?.graph_id||!Array.isArray(graph.nodes))throw Error('Grafo semântico ausente.');
 const selected=evidence.parameters?.source_paths??evidence.normalized_result?.source_selection?.requested_paths;
 const sources=Object.keys(sourceHashes);if(!Array.isArray(selected)||selected.length!==sources.length||new Set(selected).size!==sources.length||sources.some(s=>!selected.includes(s)))throw Error('Escopo de fontes inesperado.');
 let count=0;for(const s of sources){const nodes=graph.nodes.filter(n=>n.identity?.module_path===s&&n.identity?.artifact_sha256===sourceHashes[s]);if(!nodes.length)throw Error('Grafo sem vínculo ao hash da fonte: '+s);count+=nodes.length;}
 return{passed:true,operation:evidence.operation,graphId:graph.graph_id,matchingSourceNodes:count,sourceHashes,runtimeEquivalenceVerified:false};
}
