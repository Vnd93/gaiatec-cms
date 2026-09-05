# Plano do canary G14 em staging

## Escopo proposto — ainda não executado

- Supabase: `GAIATEC CMS Staging` (`glcqsosxwgmlhzgcsnzv`), `us-east-2`;
- migration aditiva: somente `0054_ev2_ai_transactional.sql`;
- Edge Function: somente `cms-ai-execute`;
- Cloudflare Pages: `gaiatec-cms-staging`, alias `ev2-g14-canary`;
- identidade: dois usuários sintéticos com MFA e quatro overrides individuais, dois por usuário;
- TTL: até 30 minutos para `ev2.ai_assist` e `ev2.ai_execute`;
- dados: referências únicas `g14x-*`, sem payload real;
- provider: sintético/off, zero chamada externa.

Produção, projeto `gaiatec-website`, `main`, staging estável, dados/domínios reais, flags amplas e
promoção ficam fora do escopo.

## Pré-condições

1. Fixar o SHA completo após CI e audit verdes.
2. Obter revisão independente do código, migration, threat model e limpeza.
3. Receber autorização explícita que nomeie migration, função, alias, SHA, dois usuários MFA e os
   limites acima.
4. Confirmar staging vinculado e ausência da migration `0054` antes do rehearsal.

## Sequência

1. Executar o rehearsal transacional, que aplica `0054` dentro de `BEGIN`, prova capability,
   segregação, execução e compensação e termina em `ROLLBACK`:

   ```powershell
   $env:EV2_G14_REHEARSAL_AUTHORIZED = "STAGING-0054-SYNTHETIC"
   npm run canary:ev2:phase14:validate
   Remove-Item Env:EV2_G14_REHEARSAL_AUTHORIZED
   ```

2. Aplicar `0054` pelo mecanismo versionado e executar o pgTAP
   `rls_ev2_phase14_ai_transactional.test.sql`.
3. Publicar somente `cms-ai-execute`, preservando verificação JWT e
   `CMS_AI_EXTERNAL_PROVIDER_ENABLED=false`.
4. Disparar `EV2.14 Candidate Preview (not a gate)` com `PREVIEW-G14-STAGING` no SHA exato.
5. Verificar health, manifest, release header, rotas privadas, no-store, smoke, a11y e budgets.
6. Executar o canary integrado:

   ```powershell
   $env:EV2_G14_EXPECTED_SHA = "<sha-completo-autorizado>"
   $env:EV2_G14_CANARY_AUTHORIZED = "STAGING-G14-SYNTHETIC"
   $env:EV2_G14_REPORT_PATH = "docs/ev2/fase-14/evidencias/G14_CANARY_<sha-curto>.json"
   npm run canary:ev2:phase14
   Remove-Item Env:EV2_G14_EXPECTED_SHA
   Remove-Item Env:EV2_G14_CANARY_AUTHORIZED
   Remove-Item Env:EV2_G14_REPORT_PATH
   ```

7. Confirmar, com os dois atores, os casos positivos e negativos: dupla flag, MFA, catálogo,
   criação de fixture, dry-run, autoaprovação bloqueada, hash divergente bloqueado, aprovação
   segregada, replay idempotente, publicação sintética, aprovação/execução segregadas da
   compensação e produção/PII recusados. O canary apenas comprova que não existe ativação ampla; a
   recusa desse estado é exercitada no pgTAP transacional, sem confirmar o override.
8. Comparar staging estável, revisões, outbox e defaults antes/depois.
9. Limpar em ordem dependente as etapas, runs, aprovações, planos, alvos, decisões, recibos,
   overrides, papéis, perfis e usuários; confirmar resíduo zero.
10. Versionar somente relatório sanitizado, sem tokens, chaves, senhas ou e-mails reais.

## Abortamento

Qualquer divergência de projeto, região, SHA, alias ou contrato interrompe antes do ensaio. Falha
após criar fixtures aciona a limpeza no `finally`. Se a limpeza falhar, o resultado é falha mesmo que
os testes funcionais tenham passado; o gate permanece `pause` até a remoção comprovada.

Por ser aditiva, a migration pode permanecer em staging para diagnóstico se já tiver sido aplicada.
O rollback operacional desliga/remove os overrides individuais, restaura a versão anterior da Edge
Function e abandona o alias candidato; não há `DROP` destrutivo automático.
