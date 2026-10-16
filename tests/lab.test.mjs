import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspect, catalog, reaProcess } from '../skills/whitechronos-lab/scripts/lab.mjs';

test('checkout portátil inclui três referências ECC sem caminho externo', () => {
  const items = catalog(null);
  assert.equal(items.length, 3);
  assert.ok(items.every(item => fs.existsSync(item.path)));
  assert.equal(catalog(null, 'verification').length, 1);
});

test('inventário não executa scripts nem percorre arquivos de credenciais e dependências', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wclab-test-'));
  try {
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, '.env'), 'SECRET=hidden');
    fs.writeFileSync(path.join(dir, 'node_modules', 'hidden.js'), '');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { prepare: 'never run' } }));
    fs.writeFileSync(path.join(dir, 'target.js'), 'throw new Error("must never execute");');
    const result = inspect(dir);
    assert.equal(result.files, 2);
    assert.equal(result.skippedEntries, 2);
    assert.deepEqual(result.manifests[0].scripts, ['prepare']);
    assert.equal(JSON.stringify(result).includes('never run'), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('inventário informa cobertura limitada', () => {
  const result = inspect(path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, '$1'), 1);
  assert.equal(result.truncated, true);
});
test('REA preserva falha do processo sem fabricar resultado de sucesso', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wclab-test-'));
  try {
    const entry = path.join(dir, 'fake.mjs');
    fs.writeFileSync(entry, 'process.stderr.write("blocked");process.exit(7)');
    const result = reaProcess(entry, [], true);
    assert.equal(result.status, 7);
    assert.equal(result.stderr, 'blocked');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('catálogo aceita diretório de skill e filtra descrição', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wclab-test-'));
  try {
    fs.mkdirSync(path.join(dir, 'example'));
    fs.writeFileSync(path.join(dir, 'example/SKILL.md'), '---\nname: example\ndescription: Review local files\n---\n');
    assert.equal(catalog(dir, 'REVIEW').length, 1);
    assert.equal(catalog(dir, 'missing').length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
