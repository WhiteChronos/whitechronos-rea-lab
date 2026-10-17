# Publicação independente — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar automaticamente um repositório próprio por novo programa entregue, sem tornar ECC-2.0 dependente do REA.

**Architecture:** Estender o fluxo de entrega do Lab. O publicador autentica pelo CLI oficial GitHub, valida o proprietário e os arquivos exportáveis, cria somente repositórios novos e registra a identidade remota no workspace privado. Análises isoladas não publicam nem criam duplicatas.

**Tech Stack:** Node.js >=24.15.0, Git e GitHub CLI `gh` autenticado. Testes `node:test`, runners de processo injetáveis. Sem tokens persistidos pelo Lab.

**Spec:** [Especificação aprovada](../specs/2026-10-16-publicacao-independente-design.md). Aprovações textuais recebidas neste chat: “Aprovo a especificação” e “Aprovo; executar neste chat”.

## Global Constraints

- Proprietário WhiteChronos, nome normalizado com sufixo `-2.0`; novo repositório privado por padrão.
- Um projectId tem no máximo uma associação remota. Reanálise reutiliza a associação.
- ECC-2.0 permanece independente; este módulo pertence ao Lab.
- Não sobrescrever repositórios, não remover controles Windows nem licenças; não guardar ou imprimir tokens.
- A preparação documental atual não equivale a um programa reconstruído. Arquivos do produto precisam de manifesto próprio e validação.
- Comandos usam argumentos vetoriais e `shell:false`; nunca `git add .`.

## Review Focus

- Timeout depois da criação pode deixar um repositório existente: reconciliar antes de repetir.
- Nomes/caminhos malformados ou links não podem escapar da entrega nem virar argumentos de shell.
- ATTRIBUTIONS é texto livre: uma whitelist de nomes não substitui a inspeção de conteúdo privado.
- Autenticação ou rede indisponível não significa repositório inexistente.
- Repetição de análise ou publicação não pode gerar outro repositório, trocar o proprietário ou alterar um repositório preexistente.

## Arquivos e responsabilidades

- `skills/whitechronos-lab/scripts/projects/publication-manifest.mjs`: seleciona e verifica os arquivos próprios exportáveis, hashes e exclusões.
- `skills/whitechronos-lab/scripts/projects/github.mjs`: adapter `gh`/Git sem shell, consultas, criação privada, push e verificação.
- `skills/whitechronos-lab/scripts/projects/publication.mjs`: política por projeto, estados, bloqueio e retomada.
- `skills/whitechronos-lab/scripts/projects/cli.mjs`: comando `project publish` e chamada no fluxo de entrega de novos programas quando a política está ativada.
- `skills/whitechronos-lab/scripts/projects/export.mjs`: manter exportação atual e permitir arquivos próprios declarados; nunca copiar o alvo inteiro.
- `tests/project-publication-{manifest,github,state,cli}.test.mjs`: testes de contrato, erros e regressão.
- `docs/PROJECTS-2.0.md` e `skills/whitechronos-lab/SKILL.md`: instruções de uso, publicação independente e limites reais.

## Task 1: Contrato da entrega exportável

**Interfaces:** `validatePublicationManifest(workspace, manifest) -> {files:[{path,sha256}], programId}`. Consome contenção de caminhos e `readProject` existentes; não abre o alvo original.

- [ ] Escrever testes RED para caminho absoluto, `..`, link, arquivo fora da entrega, mudança de hash, nome reservado, `.env`, evidência privada e texto com segredo sintético.
- [ ] Executar `node --test tests/project-publication-manifest.test.mjs` e registrar falhas esperadas.
- [ ] Implementar lista explícita de arquivos próprios/documentais e sua inspeção; respeitar licenças/atribuições. Não copiar pastas arbitrárias.
- [ ] Validar GREEN, incluindo produto próprio pequeno com teste real e rejeição de segredo sintético sem imprimi-lo.
- [ ] Commit `feat: validate independent product publication manifests`.

## Task 2: Adapter GitHub autenticado

**Interfaces:** `createGithubAdapter({run}) -> {inspectAuth, lookupRepo, createPrivateRepo, pushCommit, verifyRemote}`. `run(executable,args,{cwd,timeoutMs})` retorna `{exitCode,stdout,stderr}`; tratar saídas como dados e sanitizar mensagens.

- [ ] Escrever testes RED com runner fake para `gh` ausente, conta diferente, erro de autenticação, falha de rede, resposta 404 confirmada, colisão, criação desconhecida e confirmação de privacidade.
- [ ] Proibir comandos que imprimem tokens e qualquer consulta a armazenamento de senhas.
- [ ] Implementar consultas `gh auth status`, identidade de login, lookup do repositório e criação privada; usar limites de tempo e argumentos vetoriais.
- [ ] Adicionar Git add somente para a lista validada, commit local e push para o repositório recém-criado. Conferir ID, URL, visibilidade e SHA depois.
- [ ] Executar `node --test tests/project-publication-github.test.mjs`, GREEN e revisão de segurança.
- [ ] Commit `feat: add authenticated GitHub publication adapter`.

## Task 3: Estado e idempotência

**Interfaces:** `publishProject(workspace,{owner,repo,visibility='private'},dependencies) -> {state,repository,commitSha}`. Consome os módulos anteriores e `withProjectLock`, JSON atômico e diário existentes.

- [ ] Testar RED os estados `not-requested`, `validating`, `local-prepared`, `remote-created`, `published`, `failed` e `unknown`.
- [ ] Testar colisão com repositório anterior: nenhum push ou alteração. Testar timeout após criação: nenhuma recriação/exclusão automática.
- [ ] Persistir ID remoto antes de push. Retomar somente o ID associado à própria operação, após conferência do proprietário e do conteúdo.
- [ ] Testar que outra execução para o mesmo projectId retorna a associação existente, enquanto outro programa exige novo nome/ID.
- [ ] Executar `node --test tests/project-publication-state.test.mjs`, GREEN e commit `feat: persist idempotent independent repository publication`.

## Task 4: Fluxo automático de novos programas

**Interfaces:** `project publish <workspace> --owner WhiteChronos --repo <nome>-2.0`; política por workspace habilita publicação na entrega. `project analyze` permanece somente análise.

- [ ] Testar RED parsing estrito, política ausente/desativada, identidade trocada, reanálise sem criação, execução repetida e falha preservada para retomar.
- [ ] Integrar o publicador ao fluxo de entrega de programa pronto para exportação. Se só houver documentação, identificar o conteúdo como estrutura documental, não produto funcional.
- [ ] Configurar, para este usuário, a política de um repositório separado por novo programa após a validação do fluxo. Estado bloqueado deve indicar ferramenta/autenticação faltante.
- [ ] Executar `node --test tests/project-publication-cli.test.mjs` e `npm.cmd test`; corrigir regressões mantendo testes de segurança.
- [ ] Atualizar guia e skill com os comandos reais, distinção entre privado/público e separação ECC/REA.
- [ ] Commit `feat: publish new programs to separate GitHub repositories`.

## Task 5: Aceitação real e fechamento

- [ ] Verificar disponibilidade e autenticação do `gh` nesta máquina, sem reutilizar autenticação do conector como prova. Se faltar instalação/login, registrar bloqueio e orientar somente a ação necessária; não extrair credenciais.
- [ ] Preparar programa próprio mínimo com manifesto validado e testes reais; publicar um repositório privado de aceitação em WhiteChronos, conforme autorização desta especificação.
- [ ] Conferir conteúdo e SHA remotos, executar o programa e repetir a publicação provando que não surge outro repositório.
- [ ] Executar testes completos do Lab, doctor e smoke existentes; distinguir os resultados de engine, MCP, GitHub e produto.
- [ ] Revisão independente de segurança e comportamento de falhas. Registrar checks não executados e limitações Windows.
- [ ] Publicar PR revisável sem merge automático; preservar originais e evidências privadas.

## Método de execução proposto

Executar neste chat, tarefa por tarefa, com testes antes das mudanças e revisão independente por agentes especializados quando permitidos pelo AGENTS/skills. Revisar este plano e confirmar esse método antes da implementação, como exige a skill writing-plans.
