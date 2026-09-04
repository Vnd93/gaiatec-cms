# Plano do canary G13 em staging

## Escopo permitido

- Supabase: `GAIATEC CMS Staging` (`glcqsosxwgmlhzgcsnzv`), região `us-east-2`;
- Cloudflare Pages: projeto `gaiatec-cms-staging`, alias `ev2-g13-canary`;
- banco: somente migration aditiva `0053`;
- funções: somente `cms-session` e `cms-public`;
- atores: dois usuários sintéticos com MFA/AAL2 e overrides individuais de até 30 minutos;
- conteúdo: nenhum dado real, domínio real ou provedor externo.

Ficam excluídos produção, `main`, projeto `gaiatec-website`, alias estável de staging, scopes
site/ambiente/global e qualquer default global ligado.

## Sequência

1. Congelar o SHA completo e confirmar CI/audit verdes.
2. Executar `npm run canary:ev2:phase13:validate`; o rehearsal abre transação, cria/testa a função e
   faz rollback, comprovando que o staging voltou ao estado anterior.
3. Aplicar a migration `0053` pelo mecanismo versionado e confirmar que não há outra migration
   pendente.
4. Republicar `cms-session` e `cms-public` com verificação JWT preservada.
5. Executar `EV2.13 Candidate Preview (not a gate)` com `PREVIEW-G13-STAGING` e o mesmo SHA. Esse
   workflow apenas publica e testa o candidato HTTP isolado; seu sucesso não aprova o G13 e não
   substitui migration, funções nem o executor integrado no host autenticado.
6. Confirmar contrato exato em `/healthz`, `X-Release` e `release-manifest.json`, smoke,
   acessibilidade e budget HTTP.
7. Executar `npm run canary:ev2:phase13` no host autenticado: criar dois atores MFA, conceder duas
   flags diferentes, provar isolamento, produção bloqueada, busca v2 anônima fechada e v1 íntegra.
8. Remover um override e medir desativação em até 60 segundos.
9. Encerrar todos os overrides, suspender credenciais sintéticas e confirmar zero resíduo ativo.
10. Versionar o relatório sem tokens, chaves, senhas, e-mails reais ou payload pessoal.

O gate G13 só pode ser declarado após a sequência completa dos passos 2 a 10. Artefato, build ou
preview isolado sem a migration `0053`, as funções e o canary runtime produz decisão `pause`.

## Abortamento

Qualquer divergência de projeto/região/SHA, migration inesperada, contrato não JSON, cruzamento de
capacidade, falha na limpeza ou budget violado interrompe o canary. A migration aditiva pode
permanecer instalada para diagnóstico; o rollback operacional restaura as versões anteriores das
duas funções e não remove schema de forma destrutiva.
