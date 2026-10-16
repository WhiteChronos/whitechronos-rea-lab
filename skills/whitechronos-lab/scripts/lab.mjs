import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runAnalysis, readAnalysisOptions, resolveCases } from './resolutions.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['.git', 'node_modules', '.env', '.ssh', '.aws', '.azure', '.codex', '.obsidian', '.venv', 'venv']);

export function inspect(root, limit = 5000) {
  root = fs.realpathSync(root);
  if (!fs.statSync(root).isDirectory()) throw new Error('O alvo deve ser um diretório.');
  const stack = [root], extensions = {}, manifests = [];
  let files = 0, skippedLinks = 0, skippedEntries = 0, visitedEntries = 0;
  while (stack.length && visitedEntries < limit) {
    const current = stack.pop();
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      if (visitedEntries >= limit) break;
      visitedEntries++;
      if (item.isSymbolicLink()) { skippedLinks++; continue; }
      if (ignored.has(item.name) || item.name.startsWith('.env.')) { skippedEntries++; continue; }
      const full = path.join(current, item.name);
      if (item.isDirectory()) { stack.push(full); continue; }
      if (!item.isFile()) continue;
      files++;
      const extension = path.extname(item.name).toLowerCase() || '(sem extensão)';
      extensions[extension] = (extensions[extension] || 0) + 1;
      if (item.name === 'package.json') {
        if (fs.statSync(full).size > 1024 * 1024) { skippedEntries++; continue; }
        try {
          const p = JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
          manifests.push({ path: path.relative(root, full), name: p.name, version: p.version,
            license: p.license, scripts: Object.keys(p.scripts || {}), dependencies: Object.keys(p.dependencies || {}) });
        } catch { manifests.push({ path: path.relative(root, full), error: 'manifesto inválido' }); }
      }
    }
  }
  return { kind: 'metadata-inventory', root, files, visitedEntries, extensions, manifests, skippedLinks, skippedEntries,
    truncated: visitedEntries >= limit,
    limitations: ['Metadados estáticos; nenhum arquivo do alvo foi executado.', 'Não comprova comportamento, segurança ou equivalência funcional.', 'Links e diretórios excluídos não foram percorridos.'] };
}

export function catalog(root, query = '') {
  const needle = query.toLocaleLowerCase();
  if (!root) return ['security-review','tdd-workflow','verification-loop'].filter(name => name.includes(needle)).map(name => ({ name, description: 'Referência ECC incluída; não é execução automática.', path: path.join(skillRoot,'references/ecc',name+'.md') }));
  return fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).flatMap(d => {
    const file = path.join(root, d.name, 'SKILL.md');
    if (!fs.existsSync(file) || fs.statSync(file).size > 1024 * 1024) return [];
    const text = fs.readFileSync(file, 'utf8');
    const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/) || text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const description = match?.[1].match(/^description:\s*(.*)$/m)?.[1] || '';
    return `${d.name} ${description}`.toLocaleLowerCase().includes(needle) ? [{ name: d.name, description, path: file }] : [];
  });
}

function config() {
  const root = path.resolve(skillRoot, '../..');
  const defaults = JSON.parse(fs.readFileSync(path.join(skillRoot, 'references/runtime.json'), 'utf8'));
  const localPath = path.join(root, 'runtime.local.json');
  const local = fs.existsSync(localPath) ? JSON.parse(fs.readFileSync(localPath,'utf8')) : {};
  const c = { ...defaults, ...local };
  c.reaEntry = path.resolve(root, process.env.REA_ENTRY || c.reaEntry);
  c.eccSkills = process.env.ECC_SKILLS || c.eccSkills;
  if (c.eccSkills) c.eccSkills = path.resolve(root,c.eccSkills);
  c.reaEnvironment = { ...(c.reaEnvironment || {}) };
  for (const key of ['JAVA_HOME','GHIDRA_INSTALL_DIR']) if (process.env[key]) c.reaEnvironment[key]=process.env[key];
  return c;
}
function output(value) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
export function reaProcess(entry, args, capture = false, timeoutMs = 450000) {
  if (!fs.existsSync(entry)) throw new Error('Motor REA indisponível no caminho configurado.');
  const result = spawnSync(process.execPath, [entry, ...args], {
    stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8', windowsHide: true,
    timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`REA interrompido: ${result.signal}`);
  return result;
}

export async function main(args) {
  const [command, value] = args;
  if (command === 'inspect') { output(inspect(value)); return 0; }
  if (command === 'workflow') {
    if (!['verification-loop', 'security-review', 'tdd-workflow'].includes(value)) throw new Error('Escolha verification-loop, security-review ou tdd-workflow.');
    process.stdout.write(fs.readFileSync(path.join(skillRoot, 'references/ecc', value + '.md'), 'utf8')); return 0;
  }
  if (command === 'catalog') { output(catalog(config().eccSkills, value)); return 0; }
  if (command === 'analyze') {
    if (!value) throw new Error('Informe o artefato autorizado para análise.');
    const c = config();
    const result = await runAnalysis(c.reaEntry, value, { ...readAnalysisOptions(args.slice(2)), environment: c.reaEnvironment });
    output(result);
    return result.status === 'completed-with-recorded-limitations' ? 0 : 1;
  }
  if (command === 'resolve') {
    const result = await resolveCases(config(), value);
    output(result);
    return result.allApplicableChecksPassed ? 0 : 1;
  }
  if (command === 'doctor') {
    const c = config();
    const result = reaProcess(c.reaEntry, ['mcp', 'doctor', '--json'], true);
    let mcp;
    try { mcp = JSON.parse(result.stdout); } catch { throw new Error('REA não retornou um diagnóstico JSON válido.'); }
    const skills = catalog(c.eccSkills);
    output({ name: 'WhiteChronos Lab', version: '0.1.1', ecc: { skills: skills.length, revision: c.eccRevision },
      rea: { version: c.reaVersion, exitCode: result.status, mcpHealthy: mcp.healthy, inventory: mcp.inventory, requestFlow: mcp.request_flow },
      modelApiCalls: 0, hostMcpDiscoveryVerified: false, nativeAnalysisVerified: false });
    return result.status === 0 && mcp.healthy && skills.length > 0 ? 0 : 1;
  }
  throw new Error('Uso: lab.mjs doctor | resolve <nova-pasta-evidencias> | inspect <pasta> | catalog [busca] | workflow <nome> | analyze <artefato> [--source-path <relativo>] [--output-dir <nova-pasta>] [--analysis-timeout-ms <ms>] [--timeout-ms <ms>] [--max-heap-mb <MiB>]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (e) { output({ error: e.message }); process.exitCode = 1; }
}
