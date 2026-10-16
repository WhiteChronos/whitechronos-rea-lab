import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const MAX_JSON_INSPECTION_BYTES = 16 * 1024 * 1024;
function integer(value, name, minimum = 1) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < minimum || n > 2147483647) throw Error(`${name}: inteiro entre ${minimum} e 2147483647 esperado.`);
  return n;
}
export function readAnalysisOptions(args) {
  const options = { sourcePaths: [], analysisTimeoutMs: 300000, maxHeapMb: 512 };
  const names = { '--output-dir': 'outputDir', '--analysis-timeout-ms': 'analysisTimeoutMs', '--timeout-ms': 'timeoutMs', '--max-heap-mb': 'maxHeapMb' };
  for (let n = 0; n < args.length; n += 2) {
    const flag = args[n], value = args[n + 1];
    if (value === undefined || value.startsWith('--')) throw Error(`Valor ausente: ${flag}`);
    if (flag === '--source-path') {
      if (path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) throw Error('source-path deve ser relativo e permanecer no artefato.');
      options.sourcePaths.push(value);
    } else if (names[flag]) {
      options[names[flag]] = ['--output-dir'].includes(flag) ? value : integer(value, flag, flag === '--max-heap-mb' ? 64 : 1);
    } else throw Error(`Opção desconhecida: ${flag}`);
  }
  const allowance = options.analysisTimeoutMs * Math.max(options.sourcePaths.length, 1) + 120000;
  if (!options.timeoutMs) options.timeoutMs = integer(allowance, 'timeout total calculado');
  if (options.timeoutMs < allowance) throw Error(`Prazo externo insuficiente; use pelo menos ${allowance} ms para as fontes selecionadas, incluindo 120000 ms de margem.`);
  return options;
}
function freshDirectory(requested, prefix) {
  if (requested) {
    const dest = path.resolve(requested);
    fs.mkdirSync(dest); // Recusa destino existente; não sobrescreve evidências.
    return dest;
  }
  return fs.mkdtempSync(path.join(process.cwd(), prefix));
}
export async function runToFiles(entry, args, directory, timeoutMs, environment = {}) {
  const stdout = path.join(directory, 'stdout.json'), stderr = path.join(directory, 'stderr.log');
  const out = fs.openSync(stdout, 'wx');
  let err;
  const started = Date.now();
  try {
    err = fs.openSync(stderr, 'wx');
    return await new Promise(resolve => {
      let timedOut = false, processError = null;
      const child = spawn(process.execPath, [entry, ...args], { stdio: ['ignore', out, err], windowsHide: true, env: { ...process.env, ...environment } });
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
      child.once('error', e => { processError = e.message; });
      child.once('close', (exitCode, signal) => {
        clearTimeout(timer);
        resolve({ exitCode, signal, timedOut, processError, elapsedMs: Date.now() - started, stdout, stderr });
      });
    });
  } finally { fs.closeSync(out); if (err !== undefined) fs.closeSync(err); }
}
export function assessEvidence(value) {
  const blockers = new Set();
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.error) blockers.add(typeof node.error === 'string' ? node.error : node.error.message || 'erro registrado');
    if (node.code && /capability_unavailable|provider_unavailable|resource_constraint|provider_timeout|cancelled/.test(node.code)) blockers.add(node.code);
    if (Array.isArray(node.limitations)) for (const item of node.limitations) {
      if (typeof item === 'string' && /native self-test failed|cannot execute|capability_unavailable|Win32 (5|32)/i.test(item)) blockers.add(item);
    }
    if (node.reason === 'incomplete-module' || node.kind === 'incomplete-module') blockers.add('incomplete-module');
    for (const v of Object.values(node)) if (v && typeof v === 'object') visit(v);
  };
  visit(value);
  const evidence = value.evidence ?? value;
  const isAnalysis = evidence.operation === 'analyze_javascript_application';
  return { status: blockers.size ? 'partial-or-blocked' : isAnalysis ? 'completed-with-recorded-limitations' : 'unverified-output',
    operation: evidence.operation ?? null, evidenceId: evidence.evidence_id ?? null, blockers: [...blockers],
    limitations: evidence.limitations ?? [], fullRuntimeEquivalenceVerified: false };
}
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function runAnalysis(entry, target, supplied = readAnalysisOptions([])) {
  const options = { ...readAnalysisOptions([]), ...supplied };
  const source = fs.realpathSync(target);
  const directory = freshDirectory(options.outputDir, 'rea-evidence-');
  const args = ['analyze-javascript-application', source, ...options.sourcePaths.flatMap(p => ['--source-path', p]),
    '--analysis-timeout-ms', String(options.analysisTimeoutMs), '--max-heap-mb', String(options.maxHeapMb), '--format', 'json'];
  const run = await runToFiles(entry, args, directory, options.timeoutMs, options.environment);
  const bytes = fs.statSync(run.stdout).size;
  let assessment = { status: 'unverified-large-output', blockers: [], limitations: ['Resultado preservado; excede o limite de inspeção JSON deste wrapper. Validar com leitor incremental antes de declarar conclusão.'] };
  if (bytes <= MAX_JSON_INSPECTION_BYTES) {
    try { assessment = assessEvidence(JSON.parse(fs.readFileSync(run.stdout, 'utf8').replace(/^\uFEFF/, ''))); }
    catch { assessment = { status: 'invalid-json', blockers: ['Saída não é JSON válido ou foi interrompida.'] }; }
  }
  if (run.exitCode !== 0 || run.timedOut || run.processError) assessment.status = 'failed';
  const result = { ...run, ...assessment, command: [process.execPath, entry, ...args], source, directory, bytes,
    sha256: await digest(run.stdout), configuredTimeoutMs: options.timeoutMs, modelApiCalls: 0 };
  fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(result, null, 2));
  return result;
}
export async function resolveCases(config, outputDir) {
  if (!outputDir) throw Error('Informe uma pasta de evidências nova para resolve.');
  const directory = freshDirectory(outputDir);
  const packageRoot = path.resolve(path.dirname(config.reaEntry), '..');
  const checks = [];
  const add = (name, status, evidence) => checks.push({ name, status, evidence });
  const mod = rel => import(pathToFileURL(path.join(packageRoot, rel)).href);
  try {
    const { McpServer, InMemoryTransport } = await import(pathToFileURL(path.join(packageRoot, '../@modelcontextprotocol/server/dist/index.mjs')).href);
    const { Client } = await import(pathToFileURL(path.join(packageRoot, '../@modelcontextprotocol/client/dist/index.mjs')).href);
    const server = new McpServer({ name: 'lab-deadline-regression', version: '1.0.0' });
    const client = new Client({ name: 'lab-deadline-client', version: '1.0.0' });
    let cancellations = 0;
    server.registerTool('bounded_wait', { description: 'Fixture local de prazo; não analisa alvos.' }, async (...handlerArgs) => {
      const ctx = handlerArgs.at(-1);
      if (!ctx?.mcpReq?.signal) throw Error('SDK não forneceu contexto de cancelamento.');
      await new Promise((resolve, reject) => {
        const finish = () => { ctx.mcpReq.signal.removeEventListener('abort', abort); resolve(); };
        const timer = setTimeout(finish, 300);
        const abort = () => { clearTimeout(timer); cancellations++; reject(Error('fixture cancelled')); };
        ctx.mcpReq.signal.addEventListener('abort', abort, { once: true });
      });
      return { content: [{ type: 'text', text: 'finished' }] };
    });
    try {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      let shortDeadlineFailed = false, shortErrorCode;
      try { await client.callTool({ name: 'bounded_wait', arguments: {} }, { timeout: 80 }); }
      catch(e) { shortDeadlineFailed = true; shortErrorCode = e.code; }
      const delivered = await client.callTool({ name: 'bounded_wait', arguments: {} }, { timeout: 1000, signal: AbortSignal.timeout(1200) });
      add('REA-05: prazo do cliente MCP (#1720)', shortDeadlineFailed && cancellations > 0 && !delivered.isError ? 'pass' : 'fail',
        { sdk: '2.3.1 instalado', shortDeadlineMs: 80, adequateDeadlineMs: 1000, controlledWorkMs: 300, shortDeadlineFailed, shortErrorCode, cancellations,
          scope: 'Cliente/servidor reais do SDK em memória; fixture controlada, sem Ghidra nem importação longa.' });
    } finally { await Promise.allSettled([client.close(), server.close()]); }
  } catch(e) { add('REA-05: prazo do cliente MCP', 'fail', e.message); }
  try {
    const { ToolResultDelivery } = await mod('dist/server/toolResult.js');
    const delivery = new ToolResultDelivery(4096);
    const ordinary = delivery.toCallToolResult({ ok: true, value: { text: 'ok' } }, { kind: 'session', name: 'local-probe', returnsTargetContent: false });
    const large = delivery.toCallToolResult({ ok: true, value: { text: 'x'.repeat(8192) } }, { kind: 'session', name: 'local-probe', returnsTargetContent: false });
    const largeError = large.structuredContent?.error ?? JSON.parse(large.content[0].text).error;
    add('REA-07: entrega com orçamento (#1053)', !ordinary.isError && large.isError && largeError.code === 'resource_constraint' ? 'pass' : 'fail',
      { realInstalledModule: true, budgetBytes: 4096, ordinaryDelivered: !ordinary.isError, oversizedCode: largeError.code, scope: 'Regressão pequena do módulo oficial; não é transferência integral de ASAR nem prova de retenção.' });
  } catch(e) { add('REA-07: entrega com orçamento', 'fail', e.message); }
  try {
    const { ghidraDisabledAnalyzersSchema: schema } = await mod('dist/config/ghidraDisabledAnalyzers.js');
    add('REA-06: configuração de analisador', schema.safeParse('Objective-C Message Analyzer').success && !schema.safeParse('-postScript malicious').success ? 'pass' : 'fail',
      'Parser oficial aceita o nome documentado e recusa opção de launcher; nenhum analisador foi desativado.');
  } catch(e) { add('REA-06: configuração de analisador', 'fail', e.message); }
  for (const [name, args] of [['mcp', ['mcp', 'doctor', '--json']], ['ghidra', ['doctor', '--provider', 'ghidra', '--json']]]) {
    const sub = path.join(directory, name); fs.mkdirSync(sub);
    const result = await runToFiles(config.reaEntry, args, sub, 450000, config.reaEnvironment);
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(result.stdout, 'utf8')); } catch { parsed = null; }
    add(name === 'mcp' ? 'MCP real' : 'REA-13: Ghidra local', result.exitCode === 0 && parsed?.healthy === true ? 'pass' : 'blocked',
      { ...result, healthy: parsed?.healthy ?? false, scope: name === 'mcp' ? 'Initialize, inventário e request-flow; não comprova engines.' : 'Diagnóstico de pré-requisitos; não executa análise Ghidra.' });
    if (name === 'ghidra') {
      const provider = parsed?.providerInspections?.find(p => p.id === 'ghidra');
      const native = provider?.checks?.find(c => c.name === 'native_authority');
      add('REA-02/03/04: controles Windows', native ? (native.ok ? 'pass' : 'blocked') : 'not-tested',
        { providerVersion: provider?.providerVersion, checks: provider?.checks, nativeFailure: native?.detail ?? null,
          scope: 'O diagnóstico preserva a etapa exata; um erro de caminho não equivale ao defeito de limpeza nem à variante Win32 32.' });
    }
  }
  add('REA-09/10/12: clientes e Linux', 'not-tested', 'Claude MSIX, Copilot e Wakaru exigem seus próprios ambientes; nenhuma configuração global foi alterada.');
  const result = { name: 'WhiteChronos Lab — resoluções REA', version: '0.1.1', consultedAt: new Date().toISOString(), directory, checks,
    allApplicableChecksPassed: checks.every(c => c.status === 'pass'), modelApiCalls: 0,
    sources: ['https://github.com/morluto/rea/issues/1720', 'https://github.com/morluto/rea/issues/1053'],
    limitations: ['Checks sintéticos são regressões, não testes reais dos aplicativos citados.', 'Nenhum controle Windows, licença ou limite de serviço foi removido.'] };
  fs.writeFileSync(path.join(directory, 'resolutions.json'), JSON.stringify(result, null, 2));
  return result;
}
