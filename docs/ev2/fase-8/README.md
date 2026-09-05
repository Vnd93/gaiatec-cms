# EV2.8 — usuários, permissões escopadas e auditoria

## Resultado de engenharia

A fase implementa o candidato de F-014 de forma aditiva e `default-off`. O RBAC atual continua sendo a fonte de autorização para todas as identidades sem override individual. Uma identidade entra no caminho novo somente com um único override ativo de `ev2.rbac_scoped`, vinculado ao ambiente; qualquer ativação ampla, ambígua ou de produção falha fechada.

- papéis efetivos por `site_key` e `environment`;
- concessões diretas e delegações temporárias com validade máxima de 30 dias;
- novos papéis operacionais `auditor` e `support`, ambos sujeitos a MFA;
- MFA/AAL2 para toda permissão crítica e para papéis que o exigem;
- autoelevação bloqueada e último superadministrador protegido;
- comandos idempotentes com versão otimista e conflitos HTTP 409;
- decisões `allow/deny` imutáveis com motivo, alvo, AAL, hash de sessão e `correlationId`;
- auditoria `before/after` de toda mutação de concessão;
- RLS e privilégios negativos: clientes autenticados não acessam as tabelas nem executam as RPCs internas;
- sessão administrativa resolvida com os papéis escopados somente quando o canary individual está efetivamente ativo;
- interface candidata isolada para conceder, revogar, inspecionar e simular decisões.

## Superfícies implementadas

| Camada    | Artefato                                                                |
| --------- | ----------------------------------------------------------------------- |
| Dados/RLS | `0047_ev2_scoped_rbac.sql`                                              |
| API       | `supabase/functions/cms-scopes/index.ts`                                |
| Sessão    | extensão compatível de `supabase/functions/cms-session/index.ts`        |
| Admin     | painel EV2.8 em `/admin/usuarios`, atrás do build e da flag de servidor |
| Contratos | `src/shared/contracts/ev2-rbac.ts`                                      |
| Testes    | `npm run test:ev2:phase8` e `supabase test db`                          |
| Rehearsal | `npm run canary:ev2:phase8:validate`                                    |
| Canary    | `npm run canary:ev2:phase8`                                             |

## Estado do Gate G8

O Gate G8 foi aprovado no SHA `896d0c6019bf5f0e3d65d2dc527ae10d1da5dd9a`. A migration `0047`, `cms-scopes` v1, `cms-session` v13 e o deployment `385bb13e` foram aplicados somente em staging. O build permanece no alias isolado `ev2-g8-canary`; staging estável e produção não foram alterados.

O canary concluiu 27/27 verificações com dois usuários sintéticos MFA, fallback legado, RLS negativa, códigos 401/403/412, expiração, concorrência, idempotência, ativação ampla fail-closed, produção bloqueada, 15/15 decisões correlacionadas e 3/3 mutações com recibo/auditoria. A limpeza automática e a reconciliação independente confirmaram resíduo zero; a flag global terminou `default_enabled=false` e `kill_switch=false`.

Consulte o [relatório do canary](RELATORIO_CANARY_STAGING_2026-09-03.md), o [relatório de prontidão do candidato](RELATORIO_CANDIDATO_CI_2026-09-03.md), o [contrato e modelo operacional](CONTRATO_E_OPERACAO.md), os [critérios do Gate G8](GATE_G8.md) e o [plano de canary](PLANO_CANARY_STAGING.md).
