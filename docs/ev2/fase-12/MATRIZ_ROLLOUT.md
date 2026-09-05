# Matriz de rollout EV2.12

## Estágios ordenados

| Estágio            | Alcance                        | Flags EV2                       | Entrada                             | Saída                                    |
| ------------------ | ------------------------------ | ------------------------------- | ----------------------------------- | ---------------------------------------- |
| `staging-canary`   | dois usuários sintéticos MFA   | overrides individuais <= 30 min | G11 e SHA exato                     | canary, limpeza e três janelas saudáveis |
| `production-shell` | site público; comportamento v1 | todos os candidatos `false`     | G12, preflight e rollback aprovados | três janelas saudáveis                   |
| `production-1`     | até 1% da coorte elegível      | runtime, escopo nominal         | frontend runtime homologado         | três janelas saudáveis                   |
| `production-5`     | até 5%                         | runtime                         | estágio anterior saudável           | três janelas saudáveis                   |
| `production-25`    | até 25%                        | runtime                         | estágio anterior saudável           | três janelas saudáveis                   |
| `production-50`    | até 50%                        | runtime                         | estágio anterior saudável           | três janelas saudáveis                   |
| `production-100`   | coorte aprovada                | runtime                         | estágio anterior saudável e owners  | fechamento G12/hipercare                 |

Nenhum estágio pode ser pulado. As porcentagens são limites máximos de elegibilidade de
funcionalidade, não uma declaração de que o Cloudflare Pages já divide tráfego. Até a avaliação
runtime do frontend existir, somente `staging-canary` e o `production-shell` default-off são
tecnicamente permitidos.

## Janela válida

Cada janela registra início/fim, ambiente, estágio, SHA, amostra, disponibilidade, 5xx, latências,
outbox, acessibilidade, incidentes, projeções, restore e reviews de segurança/privacidade. Três
janelas consecutivas do mesmo SHA e estágio são necessárias para ampliar.

## Decisão automática

- `continue`: todos os budgets e reviews passam;
- `advance`: três janelas consecutivas passam e o próximo estágio é adjacente;
- `pause`: qualquer medida ausente, fora do budget ou não aprovada;
- `rollback`: P0/P1, incidente de segurança, divergência, perda, mismatch de release ou falha no
  probe pós-promoção.

Uma pausa conserva o estágio e desliga a expansão. Rollback desliga flags, interrompe workers quando
aplicável, restaura o deployment produtivo aprovado e preserva dados/auditoria para investigação.
