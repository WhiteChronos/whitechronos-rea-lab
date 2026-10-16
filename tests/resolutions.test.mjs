import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAnalysisOptions, runAnalysis, runToFiles, assessEvidence } from '../skills/whitechronos-lab/scripts/resolutions.mjs';

test('prazo externo acompanha número de fontes e preserva margem de entrega', () => {
  assert.equal(readAnalysisOptions([]).timeoutMs, 420000);
  assert.equal(readAnalysisOptions(['--source-path','a.js','--source-path','b.js']).timeoutMs,720000);
  assert.throws(() => readAnalysisOptions(['--timeout-ms','60000']), /insuficiente/);
  assert.throws(() => readAnalysisOptions(['--source-path','../secret.js']), /relativo/);
});
test('exit 0 não mascara bloqueio de controle nativo em Evidence parcial', () => {
  const value={ operation:'analyze_javascript_application', limitations:['Provider cannot execute: native self-test failed (Win32 5)'] };
  assert.equal(assessEvidence(value).status, 'partial-or-blocked');
  assert.equal(assessEvidence({operation:value.operation,limitations:['Selected source scope; dynamic behavior remains unknown.']}).status,'completed-with-recorded-limitations');
  assert.equal(assessEvidence({hello:'world'}).status,'unverified-output');
});
test('streaming preserva mais de 8 MiB e não sobrescreve evidência', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wclab-stream-'));
  try {
    const entry=path.join(dir,'fixture.mjs'), out=path.join(dir,'evidence');
    fs.writeFileSync(entry, 'process.stdout.write(JSON.stringify({operation:"analyze_javascript_application",padding:"x".repeat(9*1024*1024)}))');
    const result=await runAnalysis(entry,dir,readAnalysisOptions(['--output-dir',out]));
    assert.equal(result.status,'completed-with-recorded-limitations');
    assert.ok(result.bytes>8*1024*1024);
    assert.match(result.sha256,/^[a-f0-9]{64}$/);
    await assert.rejects(runAnalysis(entry,dir,readAnalysisOptions(['--output-dir',out])),/exist/i);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('cancelamento por prazo não é registrado como análise concluída', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wclab-deadline-'));
  try {
    const entry=path.join(dir,'fixture.mjs');
    fs.writeFileSync(entry,'setTimeout(()=>{},10000)');
    const result=await runToFiles(entry,[],dir,50);
    assert.equal(result.timedOut,true);
    assert.ok(result.exitCode!==0||result.signal);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
