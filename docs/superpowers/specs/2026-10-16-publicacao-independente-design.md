# Publicação independente dos programas gerados — especificação para revisão

Estado: especificação aprovada pelo usuário neste chat. Plano e execução neste chat também aprovados. Ativação e aceitação real ainda não realizadas.

## Objetivo aprovado pelo usuário

Cada novo programa produzido no fluxo REA/WhiteChronos deve ter seu próprio repositório `WhiteChronos/<nome>-2.0`. ECC-2.0 é um desses produtos e não depende do REA para executar. Analisar novamente o mesmo projeto não cria outro repositório.

## Escopo e alternativa escolhida

Estender o fluxo de entrega existente do WhiteChronos Lab, mantendo o ECC-2.0 independente. A publicação acontece quando uma entrega de programa é preparada; não se conecta ao comando de análise nem ao runtime do ECC. Preferir uma operação explícita e persistida de publicação, chamada automaticamente pelo fluxo de criação de novos programas após a ativação da política deste usuário.

Alternativas consideradas: publicar por evento de cada análise criaria duplicatas e publicaria artefatos incompletos; um serviço permanente exigiria hospedagem e credenciais adicionais. A extensão local reutiliza o CLI, diário e diretórios já existentes.

## Contrato

- Nome remoto obrigatório e normalizado com sufixo `-2.0`, proprietário WhiteChronos.
- Cada projectId tem no máximo uma associação remota. Reanálise reutiliza a associação; outro programa recebe outro projectId e outro repositório.
- Não integrar código do produto ao REA. Não alterar repositório do alvo original ou substituir repositórios existentes.
- Novo repositório privado por padrão; a publicação pública de ECC-2.0 é autorização específica desta conversa, não uma regra para divulgar todos os programas futuros.
- A preparação documental atual exporta somente README, SCOPE, ATTRIBUTIONS, manifesto público e gitignore. Um programa funcional precisa declarar adicionalmente os arquivos próprios do produto em um manifesto exportável revisado. Preparação documental não equivale a reconstrução funcional.
- Antes de transmitir, verificar arquivos regulares, contenção de caminhos, hashes, licenças, nomes proibidos e possíveis segredos. Excluir credenciais, evidências privadas, notas, `.env`, configuração pessoal e o alvo inteiro. Nunca usar `git add .`.

## Transporte e autenticação

Adapter autenticado GitHub; para execução sem interface, usar CLI oficial `gh` já instalada/autenticada ou um adapter equivalente validado. Não extrair tokens, ler senhas do navegador, imprimir credenciais ou guardá-las no workspace. Autenticação ausente ou ferramenta indisponível gera bloqueio explícito. O conector autenticado no chat não comprova autenticação do CLI.

## Estado e retomada

`not-requested -> validating -> local-prepared -> remote-created -> published`.

Persistir no workspace privado proprietário, nome, ID remoto, URL, commit e estado. Falha após criação preserva a associação para retomar; não excluir nem recriar. Timeout de criação exige consultar o resultado antes de repetir. Só uma resposta confirmada de inexistência permite criar. Colisão com repositório preexistente recusa qualquer push.

## Arquivos previstos

No Lab: módulo adapter de publicação em `skills/whitechronos-lab/scripts/projects/github.mjs`, extensão pequena de `cli.mjs`/exportador, testes específicos e documentação do fluxo. Nenhum desses arquivos é dependência do ECC-2.0.

## Critérios de aceitação

Testes para nome/metacaracteres, colisão, isolamento, whitelist, segredos, autenticação ausente, rede indisponível, timeout desconhecido, falha de push e retomada sem duplicar. Depois, aceitação real de uma entrega própria pequena: repositório separado, conteúdo e SHA remoto conferidos, programa executado e testes registrados. Relatar separadamente criação GitHub, validação do programa e limitações de ambiente.

## Limites

Não remover controles Windows, licenças ou limites de serviços. Não declarar disponibilidade universal, execução contínua ou código recriado do zero quando há código upstream. Sem autenticação disponível, a publicação automática permanece bloqueada e deve indicar a ação necessária.

Após aprovação desta especificação, preparar o plano de implementação e seu método de execução; a automação não deve ser descrita como já instalada.
