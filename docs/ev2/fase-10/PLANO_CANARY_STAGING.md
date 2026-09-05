# Plano de canary EV2.10 em staging

## Estado

Executado em 3 de setembro de 2026 no SHA
`c2500c7de38fdb6c33f338232e858ef12a8fe0e5`, após autorização explícita. Resultado: 26/26
verificações e resíduo zero. Consulte o
[relatório do canary](RELATORIO_CANARY_STAGING_2026-09-03.md). Nenhuma etapa deste arquivo constitui
autorização para repetição.

## Escopo estrito

- migration `0049_ev2_ai_assist.sql`;
- função `cms-ai`;
- build do SHA exato no alias `ev2-g10-canary`;
- `VITE_EV2_AI_ASSIST_CANDIDATE=true` somente no alias;
- dois usuários sintéticos com MFA;
- dois overrides individuais de `ev2.ai_assist` por até 30 minutos;
- adaptador `synthetic/deterministic-v1`;
- sem produção, sem dados reais, sem provedor externo, sem ativação global e sem promoção do staging
  estável.

`ev2.ai_execute` permanece desligada e não recebe override.

## Pré-condições

1. autorização explícita contendo migration, função, SHA, alias, usuários e limites;
2. CI verde no SHA autorizado;
3. revisão da migration 0049 e do catálogo de ferramentas;
4. `npm run canary:ev2:phase10:validate` aprovado por transação com rollback;
5. função publicada com `CMS_ENVIRONMENT=staging`, rate limit configurado e provider externo
   ausente/desligado;
6. build candidato gerado pelo workflow dedicado;
7. baseline do staging estável, flags, revisões e outbox capturado.

## Sequência

1. confirmar manifesto do alias no SHA exato e rotas privadas com `no-store`;
2. provar 401 sem sessão, 412 sem MFA e 403 para produção;
3. criar dois usuários sintéticos, MFA e overrides individuais;
4. provar capability individual e configuração provider-off;
5. criar sessões read/draft com budgets;
6. testar proposta com fonte completa, confiança alta e replay idempotente;
7. provar fila segregada, bloquear autoaprovação e testar baixa confiança pendente sem aceitação
   direta;
8. testar PII redigida e segredo/injection bloqueados;
9. testar permissão negativa e decisões do revisor segregado sem aplicação;
10. registrar eval sintética aprovada;
11. criar override amplo temporário e provar fail-closed;
12. reconciliar calls, recibos, eventos e custo zero;
13. comparar staging estável, revisões, outbox, flags e sentinelas;
14. limpar tabelas na ordem referencial, overrides, perfis, papéis, MFA e usuários;
15. executar verificação independente de resíduo zero.

## Condições de aborto

Interromper, remover overrides e limpar fixtures diante de qualquer SHA divergente, origem errada,
falha de MFA, chamada externa, PII persistida, bypass, ferramenta fora do allowlist, custo não zero,
aplicação/publicação, mudança no staging estável/produção ou limpeza incompleta.

## Comando

Após autorização, publicação e validação:

```powershell
$env:EV2_G10_EXPECTED_SHA = "<sha-completo-autorizado>"
npm run canary:ev2:phase10
```

## Texto mínimo de autorização futura

“Autorizo o canary controlado da EV2.10 em staging, incluindo a migration 0049, a função cms-ai, o
build candidato no alias ev2-g10-canary para o SHA [SHA], dois usuários sintéticos com MFA e
overrides individuais de 30 minutos, usando somente o adaptador sintético, sem provedor externo, sem
produção, sem dados reais, sem ativação global e sem promoção do staging estável.”
