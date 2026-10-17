# Projetos 2.0

CLI local para organizar análise estática JavaScript, tarefas e preparação de um repositório independente. Não gera automaticamente uma cópia funcional do alvo. Não necessita API paga para este fluxo; uso de Codex/modelos externos tem seus próprios limites.

## Iniciar no PowerShell

Abra um terminal na pasta deste programa, com Node.js >=24.15.0 e Git. Use `npm.cmd`, evitando a seleção de npm.ps1 pelo PowerShell. Não é necessário alterar ExecutionPolicy.

```powershell
npm.cmd ci --ignore-scripts --omit=optional
npm.cmd test
npm.cmd run doctor
npm.cmd run lab -- project create C:/projetos/meu-alvo --name MeuProjeto --workspace C:/projetos/meu-workspace --mode independent
npm.cmd run lab -- project analyze C:/projetos/meu-workspace --source-path src/index.js
npm.cmd run lab -- project task add C:/projetos/meu-workspace --title "Implementar recurso" --acceptance "Teste do recurso passa"
npm.cmd run lab -- project status C:/projetos/meu-workspace --json
npm.cmd run lab -- project report C:/projetos/meu-workspace
npm.cmd run lab -- project prepare-repo C:/projetos/meu-workspace --output-parent C:/entregas
```

Workspace e diretório final devem ser novos e separados do alvo. O diretório pai da entrega já deve existir. O nome final será MeuProjeto-2.0; colisões não são sobrescritas. O Git local é inicializado, sem commit ou push automático.

Para reutilização, escolha `--mode reuse` e prepare ATTRIBUTIONS.md no workspace com origens e licenças revisadas antes da exportação. O comando só copia esse documento e arquivos gerados por lista permitida; não copia o alvo. Confira o conteúdo antes de qualquer publicação. A preparação documental não publica nem comprova um produto funcional.

## Um programa, um repositório independente

ECC-2.0 é um produto independente, sem dependência do runtime REA. A publicação abaixo pertence ao Lab e não é incorporada ao ECC. Cada programa possui um projectId e um nome próprio terminado em `-2.0`; reanálise não cria outro repositório.

Declare a entrega própria em `delivery-manifest.json`, dentro do workspace privado. `deliveryRoot` é um diretório absoluto separado do alvo e do workspace. Declare somente arquivos revisados, com SHA-256 dos bytes exatos:

```json
{
  "schemaVersion": 1,
  "programId": "ID_DO_PROJECT_JSON",
  "deliveryRoot": "C:/entregas/MeuProjeto-2.0",
  "files": [
    {"path":"LICENSE","kind":"documentation","sha256":"SHA256_64_HEXADECIMAIS"},
    {"path":"ATTRIBUTIONS.md","kind":"documentation","sha256":"SHA256_64_HEXADECIMAIS"},
    {"path":"src/main.mjs","kind":"product","sha256":"SHA256_64_HEXADECIMAIS"}
  ]
}
```

Licença, atribuições e pelo menos um arquivo de produto são obrigatórios. Uma declaração `product` não comprova autoria, segurança ou execução: revise a origem e teste o programa separadamente. A triagem de segredos é heurística; revise também o conteúdo de textos e arquivos binários. Links, hardlinks, caminhos privados, `.gitattributes`, credenciais conhecidas e divergências de hash são recusados. Limites: 1.000 arquivos, 16 MiB por arquivo e 64 MiB no total.

Use Git e o GitHub CLI oficial `gh`, no PATH desta sessão, autenticado em github.com como WhiteChronos. O login do conector do chat não autentica o CLI. Não copie tokens para o manifesto ou repositório. Para publicar explicitamente:

```powershell
gh auth login --hostname github.com --git-protocol https --web
npm.cmd run lab -- project publish C:/projetos/meu-workspace --owner WhiteChronos --repo MeuProjeto-2.0
```

O comando cria somente um **novo repositório privado**. Repositório já existente é colisão; nunca é sobrescrito ou adotado automaticamente. A entrega usa somente os arquivos declarados, revalida hashes e confere os blobs Git antes do commit. Não usa `git add .` nem configurações/hooks do alvo.

Para publicar automaticamente ao entregar **este programa**, habilite a política persistida no seu workspace:

```powershell
npm.cmd run lab -- project publication-policy C:/projetos/meu-workspace --enabled true --owner WhiteChronos --repo MeuProjeto-2.0
npm.cmd run lab -- project deliver C:/projetos/meu-workspace
```

`deliver` valida os arquivos e chama o publicador quando a política está habilitada. `analyze`, `prepare-repo` e a criação de um workspace continuam sem publicar. A política é local a cada workspace; não é um serviço permanente nem uma autorização global para divulgar arquivos. Desative com o mesmo comando e `--enabled false`. Sem autenticação, o estado indica o bloqueio; não transforma falha em sucesso.

`publication.json`, `publication-policy.json`, `publication-staging/` e o diário são privados. Preserve-os fora do repositório de produto. Retentativa do mesmo manifesto verifica a associação existente. Alterar nome, proprietário ou hashes da entrega associada é recusado. A evolução posterior do produto ocorre no seu repositório próprio, por commits revisados; este publicador é de criação inicial e não força atualizações.

Após timeout de criação, o estado `unknown` exige conciliar o resultado com o operador; encontrar um nome no GitHub não prova que esta operação o criou. Não apague estado para repetir cegamente. Se o ID remoto já foi persistido, a retomada verifica esse ID. Se há SHA conhecido após envio incerto, verifica o commit remoto sem reenviar. Não remova locks de processos ativos.

## Aceitação de publicação

```powershell
npm.cmd run publication:smoke -- --root C:/evidencias/nova-aceitacao-publicacao
```

Esse comando testa e publica um programa mínimo próprio em `WhiteChronos/Lab-Publication-Acceptance-20261016-2.0`, privado, com licença MIT e atribuições. Requer autenticação real do CLI. A raiz deve ser nova; uma execução anterior deste mesmo harness pode ser retomada sem sobrescrever seus arquivos. A raiz existente com conteúdo humano é recusada.

`acceptance.json` distingue teste do programa, publicação GitHub e resultado final. Sem login, o programa pode passar enquanto a publicação permanece `AUTH_REQUIRED`. O harness repete a entrega e exige o mesmo ID/SHA remoto. Um transporte simulado não pode produzir `realGitHubPublication=true`. Use uma só raiz para esta aceitação: outra raiz possui outro projectId e deve recusar o repositório já existente.

## Tarefas e evidências

```powershell
npm.cmd run lab -- project task add C:/projetos/meu-workspace --title "Validar" --acceptance "Resultado correto" --depends-on ID_DA_TAREFA
npm.cmd run lab -- project task set C:/projetos/meu-workspace ID_DA_TAREFA --state done --evidence reports/prova.json
```

O arquivo de evidência deve ser regular e estar dentro do workspace, com caminho relativo. `done` é declaração manual do operador; o hash detecta alteração posterior, não prova que um critério foi atendido. Análise semântica não conclui tarefas de produto automaticamente.

## Prazos, interrupção e falhas

`project analyze` aceita `--source-path` repetido, `--analysis-timeout-ms`, `--timeout-ms` e `--max-heap-mb`. Não aceita `--output-dir`: resultados ficam em runs/UUID/engine. O prazo externo exige pelo menos o prazo por fonte multiplicado pelo número de fontes, acrescido de 120000 ms. Saída acima de 16 MiB é preservada sem aprovação automática.

`project reconcile <workspace>` inspeciona o estado persistido. Sem identidade de processo confiável, marca `unknown`; não termina processos e não relança análises. O wrapper atual não fornece PID verificável. Após falha abrupta, um `.project.lock` remanescente exige inspeção manual: confirme que o processo original terminou antes de remover apenas esse bloqueio. Não remova bloqueios de acesso do sistema operacional.

Quando uma execução está `unknown`, conserve o workspace para investigação e crie outro workspace separado para nova execução após confirmar que a análise anterior terminou. Não altere os arquivos de estado para fabricar sucesso.

## Cobertura

MCP saudável, testes de unidade e análise real são verificações diferentes. A sessão restrita do Codex neste computador já apresentou Win32 5 no diretório ancestral do perfil. Uma falha assim não é corrigida por npm.cmd; npm.cmd resolve apenas o lançador do PowerShell. Execute o smoke em contexto autorizado e confira a evidência, sem alterar controles para forçar aprovação.

Ghidra, .NET, Android, painel gráfico, execução isolada de alvos e serviço permanente não integram esta entrega. Mocks em testes não comprovam execução desses motores. Os relatórios mantêm produto, desempenho e equivalência como não verificados quando não há evidência própria.
