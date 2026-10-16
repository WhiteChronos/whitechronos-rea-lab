# Estado verificado — 16/10/2026

- Oito testes de comportamento passaram na origem: inventário, catálogo, preservação de falhas, prazos, streaming de 9 MiB, recusa de sobrescrita e cancelamento.
- MCP REA 6.5.0 inicializou e respondeu com 207 ferramentas/seis prompts no ambiente de origem. Isso não comprova que cada engine foi executado.
- Regressão com SDK MCP real 2.3.1 em memória: prazo de 80 ms interrompe tarefa controlada de 300 ms; 1000 ms permite concluir; cancelamento chega ao handler.
- Módulo oficial de resposta REA entrega resultado pequeno e retorna `resource_constraint` acima do orçamento. Não se testou transferência integral de ASAR grande.
- Ghidra oficial 12.1.4 foi instalado no ambiente de origem com digest verificado. Oito de nove pré-requisitos passaram.
- A sessão restrita de origem continua recusando um diretório ancestral do perfil Windows, Win32 5. Não foram removidos controles para contornar isso.
- Análise estática de uma fonte Arena foi concluída em execução manual anterior do usuário, em contexto diferente. Não prova execução completa dentro da sessão restrita.

Resultados específicos de máquina não são reproduzidos automaticamente no seu checkout. Use `doctor`, `resolve` e uma fixture própria. Claude MSIX, Copilot, Wakaru/Linux e outros adaptadores continuam exigindo validação nos ambientes correspondentes. Código gratuito não elimina custos ou limites de modelos/serviços externos.
