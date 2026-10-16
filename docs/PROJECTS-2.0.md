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

Para reutilização, escolha `--mode reuse` e prepare ATTRIBUTIONS.md no workspace com origens e licenças revisadas antes da exportação. O comando só copia esse documento e arquivos gerados por lista permitida; não copia o alvo. Confira o conteúdo antes de qualquer publicação. A criação remota no GitHub é uma ação posterior com ferramentas autenticadas do Codex, inicialmente privada.

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
