# EV2.13 — hardening pré-produção e elegibilidade runtime

**Estado:** implementação e canary de staging concluídos<br>
**Gate:** G13 aprovado<br>
**Produção:** bloqueada

## Objetivo

Eliminar falhas de controle identificadas depois do G12 antes de considerar qualquer promoção:
isolar segredos dos jobs produtivos, vincular a aprovação à evidência real, validar contratos de
saúde/release sem falso positivo e substituir switches de build por elegibilidade individual em
runtime.

## Entregas

| Frente              | Implementação                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| CI                  | `main` incluída, Supabase CLI fixado em `2.116.0` e suíte EV2.13 incorporada ao `check`        |
| Produção            | secrets removidos do escopo do job; candidato não os recebe durante instalação, teste ou build |
| Confiança do deploy | scripts de probe/rollback executados a partir do checkout confiável de `main`                  |
| Aprovação G12       | digest e conteúdo da evidência versionada são vinculados ao SHA, run id, janelas e limites     |
| Observabilidade     | `/healthz` e manifest exigem JSON e schema válidos; budgets passam a ser avaliados por rota    |
| Resíduo sintético   | ativos e credenciais são separados de tombstones retidos para auditoria                        |
| Runtime             | migration `0053`, manifesto agregado em `cms-session` e helper frontend fail-closed            |
| Isolamento          | um override individual de até 30 min, sem amplo paralelo; produção segue bloqueada             |
| Busca pública       | cliente público permanece em v1; `search-v2` técnico exige ambiente staging e token canary     |
| Canary              | alias `ev2-g13-canary`, dois atores sintéticos MFA, duas capacidades distintas e limpeza ativa |

## Limites

Esta fase não autoriza produção, dados ou domínios reais, ativação global, promoção do staging estável,
provedor externo nem rollout percentual. O canary reduzido testa apenas a nova fronteira runtime e
reutiliza os testes automatizados já existentes; não repete os fluxos funcionais G2–G11.

## Ordem operacional

1. concluir CI, revisão e SHA imutável no branch `ev2/fase-13-hardening-pre-producao`;
2. executar o rehearsal transacional da migration `0053` no staging;
3. aplicar `0053` somente no Supabase de staging e republicar `cms-session` e `cms-public`;
4. gerar/deployar o mesmo SHA no alias isolado `ev2-g13-canary`;
5. executar smoke, acessibilidade, probe HTTP e canary runtime reduzido;
6. remover overrides, suspender credenciais sintéticas e confirmar zero resíduo ativo;
7. registrar evidências e decidir G13; nenhuma falha é contornada por promoção do alias estável.

O workflow `EV2.13 Candidate Preview (not a gate)` cobre somente build, publicação isolada e
verificações HTTP. Ele falha se os secrets de preview estiverem ausentes e não representa aprovação
do G13; migration, funções, executor integrado e limpeza continuam obrigatórios no host autenticado.

## Documentos

- [ADR-022 — elegibilidade runtime fail-closed](../../adr/ADR-022-elegibilidade-ev2-em-runtime-fail-closed.md)
- [Gate G13](GATE_G13.md)
- [Plano do canary em staging](PLANO_CANARY_STAGING.md)
- [Relatório de validação local](RELATORIO_VALIDACAO_LOCAL_2026-09-04.md)
- [Relatório do canary G13 em staging](RELATORIO_CANARY_STAGING_2026-09-04.md)
