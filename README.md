# WhiteChronos REA Lab

Ferramenta própria em Node.js para inventário de projetos, referências ECC, análise estática com REA e diagnóstico de integração. Versão 0.1.1, ainda em desenvolvimento. Código gratuito; não é um modelo de IA treinado.

## Executar

Requer Node.js 24.15 ou posterior. Instale a versão fixada do motor com scripts de dependências desativados:

```sh
npm ci --ignore-scripts --omit=optional
npm test
npm run doctor
npm run smoke
npm run lab -- inspect ./seu-projeto
npm run lab -- analyze ./seu-projeto --source-path src/main.js --output-dir ./evidence-nova
npm run lab -- resolve ./diagnostico-novo
npm run upstreams
```

O destino de evidências precisa ser novo. Prazo de análise por fonte e prazo total são ajustáveis. O arquivo completo é gravado diretamente; o resumo recusa declarar sucesso se houver bloqueios ou saída grande ainda não validada.

`npm run smoke` analisa uma fixture própria com o motor REA real e exige grafo semântico vinculado ao SHA-256 da fonte. O CI executa esse comando no Linux e Windows; falha nativa não é omitida nem convertida em sucesso. O teste não executa o alvo, não prova equivalência funcional e não valida Ghidra.

O catálogo padrão inclui três referências ECC preservadas. Para consultar um checkout ECC completo, configure `ECC_SKILLS` no ambiente ou `eccSkills` em `runtime.local.json` (ignorado pelo Git). `REA_ENTRY` permite selecionar uma instalação local existente do motor oficial. Não inclua credenciais nesse arquivo.

Ghidra é opcional e separado do pacote: instale a distribuição oficial e um JDK completo compatível, depois forneça `GHIDRA_INSTALL_DIR` e `JAVA_HOME` no ambiente. O Lab não baixa nem executa engines automaticamente. Consulte [estado e limites](docs/STATUS.md).

## Componentes

- Código próprio: CLI de inventário, encaminhamento REA, streaming de evidências e diagnósticos.
- REA 6.5.0: dependência npm fixada. Seu código, avisos e controles permanecem preservados.
- ECC: três referências incluídas com licença e atribuição. Não são agentes executados automaticamente.
- Ghidra e ferramentas relacionadas: registro em [upstreams.json](registry/upstreams.json), com origem, fork, revisão e estado de integração.

Forks preservam histórico; não tornam todas as ferramentas instaladas nem fazem um repositório ter vários pais. O projeto integrador é independente. Atualizações upstream passam por revisão e testes, sem merge automático.

## Evolução

Veja [roteiro](docs/ROADMAP.md), [histórico](CHANGELOG.md) e [contribuição](CONTRIBUTING.md). A validação em CI cobre a integração e os testes indicados, não todos os programas ou hosts. Não há serviço permanente hospedado no ChatGPT.

Licença MIT para o código próprio; avisos dos componentes permanecem em `skills/whitechronos-lab/references/licenses`. Os catálogos não concedem licença adicional aos projetos listados.
