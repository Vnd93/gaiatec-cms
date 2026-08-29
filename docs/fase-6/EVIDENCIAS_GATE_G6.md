# Gate G6 — decisão formal

**Data:** 2026-08-29  
**Decisão:** BLOQUEADO

## Avaliação

| Critério do Gate G6                                                          | Evidência                                                                                    | Decisão                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| jornadas desktop/mobile                                                      | manual, screenshots e E2E sem overflow                                                       | atende localmente                              |
| WCAG 2.2 AA nas jornadas principais                                          | Axe com contraste ativo, teclado e foco verdes                                               | atende jornadas públicas testadas              |
| administrador cria, edita, ordena, publica, despublica e restaura sem código | UI, comandos e testes locais existem; round-trip remoto não executado                        | bloqueia                                       |
| menus, configurações e destaques chegam aos consumidores                     | integração e testes estruturais existem; documento real não foi publicado em staging         | bloqueia                                       |
| editor visual sem JSON e preview fiel                                        | editor estruturado e renderer compartilhado comprovados; preview autenticado remoto pendente | atende tecnicamente; bloqueia homologação      |
| retirada exige destino e não cria órfão                                      | contrato, trigger, helper de rotas e Worker testados                                         | atende tecnicamente; migration remota pendente |
| nenhum link `#` editorial                                                    | contrato e banco rejeitam; renderer recusa esquemas inseguros                                | atende                                         |
| sem overflow                                                                 | desktop e mobile aprovados                                                                   | atende                                         |
| SEO e HTTP corretos                                                          | teste de Worker cobre HTML inicial, `301`, `404` e `410`                                     | atende localmente; staging pendente            |
| budgets de performance                                                       | chunks F6 pequenos e build verde; chunk PDF/RDO lazy mantém warning histórico                | parcial                                        |

## Causa objetiva

O Gate não falha por falta de implementação local. Ele permanece bloqueado porque a migration 0026 e as Edge Functions ainda não foram aplicadas no Supabase staging e, portanto, não existe evidência de RLS/RBAC, transação, publicação, restauração e consumidores operando juntos no ambiente real.

## Restrições preservadas

- zero importação do painel/site atual;
- zero cadastro automático de produtos, serviços, páginas ou imagens;
- nenhum dado editorial sintético publicado;
- staging e produção não alterados;
- Fase 7 e go-live não autorizados por este documento.

## Condição para reavaliar

Executar integralmente o [runbook de homologação](./RUNBOOK_HOMOLOGACAO_G6.md), anexar os IDs/correlation IDs do round-trip e repetir a inspeção autenticada desktop/mobile. Somente depois a decisão pode mudar para APROVADO.
