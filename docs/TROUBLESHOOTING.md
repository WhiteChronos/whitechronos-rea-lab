# Problemas conhecidos e resoluções

Pesquisa de 16/10/2026; casos selecionados, não exaustivos. Correção upstream e sucesso num ambiente não comprovam aprovação em outro. O estado local atual está em [STATUS.md](STATUS.md).

## REA-01 — Codex / Windows / github-arena

- Sintoma: PSSecurityException ao executar .ps1; depois caminho relativo não encontrado
- Causa: Política de scripts e diretório atual C:\Windows\System32
- Procedimento: Usar caminhos absolutos e a CLI Node oficial diretamente, sem alterar a política de execução
- Evidência da pesquisa: sucesso local registrado
- Aceitação: Exit 0 e JSON com grafo de aplicação e grafo semântico; somente uma fonte selecionada
- Fonte: [Registro local resumido](STATUS.md)

## REA-02 — REA dentro da sessão restrita do Codex

- Sintoma: Open Windows path component failed [<perfil-do-usuario>] (Win32 5)
- Causa: Abertura do ancestral recusada no contexto restrito; entrada exata da ACL não foi legível
- Procedimento: Preservar a restrição; usar execução manual autorizada já comprovada fora da sessão, ou ambiente autorizado cujo caminho completo seja admitido
- Evidência da pesquisa: contorno local comprovado; restrição interna pendente
- Aceitação: A análise externa passou; não comprova que a mesma operação passou dentro desta sessão
- Fonte: [Registro local resumido](STATUS.md)

## REA-03 — REA Windows: limpeza nativa

- Sintoma: Delete owned object by handle failed (Win32 5)
- Causa: Handles de objetos privados sem FILE_SHARE_DELETE, conforme diagnóstico e correção upstream
- Procedimento: Consumir pacote oficial contendo 9b08c2b1cbbd74631738db1ddb326592682326e8; verificar inclusão antes de atualizar
- Evidência da pesquisa: correção upstream com evidência Windows; não reproduzida aqui
- Aceitação: Autoteste nativo, operação real e ausência de resíduos; issue 1701 permanece aberta
- Fonte: https://github.com/morluto/rea/issues/2196#issuecomment-6162526394

## REA-04 — REA Windows: abertura da raiz do volume

- Sintoma: Open Windows path component failed [C:\] (Win32 32)
- Causa: Conflito de compartilhamento na raiz do volume
- Procedimento: Consumir correção oficial 9a44fea34, que permite WRITE sharing somente no handle inicial da raiz
- Evidência da pesquisa: correção upstream; validação Windows hospedada com token elevado
- Aceitação: Admissão do alvo e verificador completo preservando negação de escrita, substituição e reparse; token comum não estabelecido
- Fonte: https://github.com/morluto/rea/issues/1701#issuecomment-6180767269

## REA-05 — MCP / Codex / Kimi / Ghidra

- Sintoma: Consulta termina perto de 60 segundos apesar de timeout maior no Ghidra
- Causa: Deadline do cliente independente do timeout do provedor
- Procedimento: Alinhar orçamento do cliente e do provedor; progresso com reset e deadline absoluto quando cliente permitir; correções de setup bb4925252 e fa318995f
- Evidência da pesquisa: mecanismo e configuração verificados upstream; alvo original de 21 minutos não reexecutado
- Aceitação: Teste de SDK/CLI com cancelamento; servidor não pode elevar limite imposto pelo cliente
- Fonte: https://github.com/morluto/rea/issues/1720#issuecomment-6179378231

## REA-06 — Ghidra / Mach-O Swift e Objective-C

- Sintoma: Análise não termina mesmo com 40 minutos
- Causa: Travamento no Objective-C Message Analyzer observado no alvo relatado
- Procedimento: Opt-in REA_GHIDRA_DISABLED_ANALYZERS="Objective-C Message Analyzer", disponível na correção #1800 / 9878bb729
- Evidência da pesquisa: controle implementado upstream; reprodução real sem esse analisador levou 76 s no relato original
- Aceitação: Registrar analisador omitido e perfil; fechamento não confirma nova execução do alvo nem correção do Ghidra
- Fonte: https://github.com/morluto/rea/issues/1783#issuecomment-6178772966

## REA-07 — Notion / Obsidian ASAR via REA MCP

- Sintoma: Análise termina, entrega falha com Invalid string length
- Causa: Resultados completos muito grandes e representações repetidas; bytes UTF-8 não equivalem ao limite de string UTF-16
- Procedimento: Codificação com orçamento, resource_constraint tipado e retenção de Evidence; usar resumos e páginas quando a operação suportar
- Evidência da pesquisa: proteção de serialização confirmada pelo mantenedor; não equivale a transferência integral ilimitada
- Aceitação: Validar recebimento no cliente além do progresso terminal e JSON CLI
- Fonte: https://github.com/morluto/rea/issues/1053#issuecomment-6071368941

## REA-08 — Autocompletar MCP / Ghidra / Hopper

- Sintoma: Digitar argumento inicia análise pesada e bloqueia fechamento
- Causa: Completer acessava provedor frio e não propagava corretamente ciclo de cancelamento
- Procedimento: Usar somente sessão de provedor já pronta e propagar cancelamento/transição; commit 07b36c148
- Evidência da pesquisa: correção upstream com testes; sem exercício de provedor real no fechamento
- Aceitação: Autocompletar frio sem iniciar filho; conclusão em sessão pronta; cancelamento e fechamento
- Fonte: https://github.com/morluto/rea/issues/2076#issuecomment-6158644380

## REA-09 — Claude Desktop Windows MSIX

- Sintoma: Registro MCP desaparece ou fica invisível após reiniciar
- Causa: Configuração virtualizada pelo MSIX, aplicativo aberto regravando arquivo ou launcher em cache privado
- Procedimento: Encerrar completamente o aplicativo; setup revisado em terminal comum; usar configuração efetiva e launcher persistente fora do armazenamento privado MSIX
- Evidência da pesquisa: procedimento documentado com observação Windows upstream
- Aceitação: Reabrir aplicativo e conferir configuração persistida, doctor e tools/list no cliente
- Fonte: https://github.com/morluto/rea/blob/1bd5c5c87e81b27bfb16140f71ffa03563e58477/docs/client-configuration.md

## REA-10 — GitHub Copilot CLI / clientes com contexto limitado

- Sintoma: compaction_static_context_blocked ou catálogo ocupa contexto excessivo
- Causa: Schemas completos de muitas ferramentas consomem janela de contexto
- Procedimento: Perfil documentado REA_MCP_INPUT_SCHEMA_PROFILE=compact na configuração do cliente e reinício
- Evidência da pesquisa: teste upstream com fixture de modelo; não comprova aceitação por todo modelo real
- Aceitação: Inventário continua completo, entradas validadas pelo REA, chamada real de análise no cliente pretendido
- Fonte: https://github.com/morluto/rea/blob/1bd5c5c87e81b27bfb16140f71ffa03563e58477/docs/client-configuration.md

## REA-11 — Ghidra / importação grande

- Sintoma: Importação inicial ultrapassa orçamento
- Causa: Importação e autoanálise caras; snapshot Evidence não é banco Ghidra
- Procedimento: Medir inicialização, heap e deadline do cliente; escopo menor quando apropriado; não prometer reabertura de projeto pré-importado como recurso entregue
- Evidência da pesquisa: ajustes documentados; feature de projeto pré-importado #1048 aberta
- Aceitação: Análise completa e resposta entregue, sem reiniciar repetidamente uma importação sempre cancelada
- Fonte: https://github.com/morluto/rea/issues/1048

## REA-12 — Recuperação JavaScript / Wakaru

- Sintoma: Recuperação indisponível no Windows ou saída existente recusada
- Causa: Caminho documentado Linux x64 com Wakaru e prlimit; destino exige ausência prévia
- Procedimento: Usar ambiente Linux x64 autorizado, Wakaru compatível e diretório novo; manter análise estática separada de recuperação
- Evidência da pesquisa: suporte documentado Linux; integração Windows não comprovada
- Aceitação: Mapas, hashes, proveniência e importações cruzadas; equivalência ao programa original continua desconhecida
- Fonte: https://github.com/morluto/rea/blob/1bd5c5c87e81b27bfb16140f71ffa03563e58477/docs/javascript-recovery.md

## REA-13 — REA / Ghidra / dependências e plataforma

- Sintoma: Provider indisponível mesmo com MCP inicializado
- Causa: MCP saudável não garante engine instalado, JDK completo, caminho correto ou formato admitido
- Procedimento: Instalação compatível do engine e JDK; configuração no processo que inicia MCP; diagnóstico específico do provedor antes de analisar fixture própria
- Evidência da pesquisa: procedimento documentado; Ghidra não validado localmente neste trabalho
- Aceitação: Doctor específico, análise de fixture e resultado no cliente; depois alvo real
- Fonte: https://github.com/morluto/rea/blob/1bd5c5c87e81b27bfb16140f71ffa03563e58477/docs/installation.md
