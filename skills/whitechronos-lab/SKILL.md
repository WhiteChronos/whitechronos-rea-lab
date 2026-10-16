---
name: whitechronos-lab
description: Integra os fluxos ECC e a análise local REA do WhiteChronos Lab. Use quando o usuário pedir esta ferramenta, análise de artefatos pelo REA ou aplicação dos fluxos ECC incluídos a um projeto.
---

# WhiteChronos Lab

Esta skill reúne uma CLI própria de inventário, três referências ECC e o motor oficial REA instalado localmente. Não é um modelo de IA ou uma reimplementação completa desses projetos.

Resolva `scripts/lab.mjs` relativamente à pasta desta skill e execute com Node. As localizações dos motores estão em `references/runtime.json`. Não exiba conteúdo de credenciais ou configurações pessoais.

## Operações

- `node <skill>/scripts/lab.mjs doctor`: testa caminhos, catálogo ECC e comunicação MCP real com o REA. O sucesso do MCP não comprova análise nativa nem descoberta no chat.
- `node <skill>/scripts/lab.mjs resolve <nova-pasta>`: executa regressões reais dos módulos/SDK instalados para prazo MCP e resposta grande, além dos diagnósticos MCP e Ghidra. Gera evidências; não instala programas nem modifica configurações globais. Retorno diferente de zero indica pendências, não deve ser convertido em PASS.
- `node <skill>/scripts/lab.mjs inspect <diretório>`: inventário próprio de metadados, limitado e sem executar arquivos do alvo. Não é decompilação ou análise semântica REA.
- `node <skill>/scripts/lab.mjs catalog [busca]`: consulta o catálogo ECC por nome e descrição.
- `node <skill>/scripts/lab.mjs workflow verification-loop`: retorna uma referência ECC incluída. Outras opções: `tdd-workflow`, `security-review`.
- `node <skill>/scripts/lab.mjs analyze <artefato> --source-path <relativo> --output-dir <nova-pasta>`: encaminha análise estática ao REA oficial, grava stdout/stderr diretamente e retorna resumo com hash. Permite repetir source-path. Não sobrescreve pasta existente. Prazo por fonte: 300000 ms, ajustável por `--analysis-timeout-ms`; prazo total ajustável por `--timeout-ms`, com margem de 120000 ms. `--max-heap-mb` controla o worker. Sem seleção explícita de fontes, planeje prazo total para o conjunto do artefato.

O resumo verifica JSON até 16 MiB e recusa declarar sucesso quando encontra bloqueio registrado. Acima disso preserva o arquivo completo e informa `unverified-large-output`, exigindo validação incremental externa. Não converter saída grande não verificada em sucesso. As regressões controladas não comprovam execução real de Ghidra, Notion ou Obsidian.

Para usar um fluxo ECC, leia somente a referência pertinente e adapte comandos ao projeto e ao hospedeiro. As referências originais incluem exemplos voltados ao Claude; elas não autorizam alterações de contas, revogação de chaves, envio de código, instalação de dependências ou agentes adicionais.

REA está disponível pela CLI desta skill, não como ferramentas MCP nativas desta conversa. O autoteste de controles Windows falhou na sessão de criação: não remova ou substitua controles para forçar a análise. Se continuar bloqueado, informe o motivo; o inventário próprio não equivale a um resultado REA.

As funções locais não chamam modelos pagos. O trabalho do assistente continua sujeito aos custos e limites do Codex. Consulte `references/PROVENANCE.md` para origem e versões, e `references/licenses` para os avisos MIT preservados.
