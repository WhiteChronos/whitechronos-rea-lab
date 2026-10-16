# Origem

- Integração e inventário: WhiteChronos Lab 0.1.1, implementação própria em Node.js. Repositório independente preparado a partir da integração local; a configuração pública não inclui caminhos pessoais.
- ECC: https://github.com/affaan-m/ECC, revisão `76aaa77df6adc5b889e689007bf99b9a4f74af34`, licença MIT. Os arquivos em `ecc/` são cópias preservadas das skills `security-review`, `tdd-workflow` e `verification-loop`; não são autoria original desta integração.
- REA: https://github.com/morluto/rea. Fonte consultada na revisão `1bd5c5c87e81b27bfb16140f71ffa03563e58477`; motor executado é o pacote npm oficial `rea-agents@6.5.0`, com integridade e dependências registradas em `outputs/rea-runtime/package-lock.json` no projeto de origem. O pacote publicado e o HEAD da fonte são identidades distintas, não foi afirmada equivalência byte a byte.
- Avisos dos dois projetos preservados em `licenses/`. A integração não remove proteções dos motores nem faz chamadas pagas a modelos por conta própria.
