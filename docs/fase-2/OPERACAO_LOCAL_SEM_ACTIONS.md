# Operacao local sem GitHub Actions pago

> **Status em 2026-08-28:** contingencia encerrada. Os gatilhos automaticos de CI e preview foram restaurados apos a regularizacao do GitHub Actions. Este procedimento permanece documentado apenas como plano de continuidade; `npm run validate:local` continua sendo uma protecao complementar.

O preview remoto depende de `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no environment `preview`. Na ausencia dessas credenciais, o workflow valida o projeto e preserva `dist` como artefato do GitHub, sem bloquear a pull request; a publicacao remota volta automaticamente quando os dois secrets forem configurados.

## Decisao

Enquanto a conta proprietaria estiver impedida de iniciar GitHub-hosted runners, o GitHub permanece como repositorio e historico remoto, mas nao executa CI ou preview automaticamente. Os workflows `CI` e `Preview` foram preservados com acionamento exclusivamente manual para uma eventual reativacao.

Essa contingencia evita novos consumos e novas falhas automaticas sem remover testes, configuracoes de deploy ou historico. Producao continua fora do escopo autorizado.

## Fluxo obrigatorio de desenvolvimento

1. Trabalhar na branch `Remodelagem`.
2. Quando o `package-lock.json` mudar, executar `npm run validate:local:clean`; nos demais casos, executar `npm run validate:local`.
3. Conferir `docs/validacao-local/ULTIMA_VALIDACAO.md` e somente continuar se o resultado geral for `APROVADO`.
4. Revisar `git diff` para impedir a inclusao de segredos, artefatos de build ou arquivos estranhos.
5. Criar o commit local e enviar normalmente ao GitHub.

O comando local cobre formatacao, lint, TypeScript, testes unitarios e de integracao, contencoes da Fase 1, auditoria de dependencias, build de staging, manifesto do artefato e Playwright.

## Banco local

O job de banco continua separado porque requer Docker, que nao esta instalado nesta estacao. A Supabase CLI esta disponivel via `npx supabase` 2.116.0. Quando Docker estiver disponivel, a verificacao obrigatoria e:

```powershell
npx supabase start
npx supabase db reset --local --no-seed
npm run test:rls
npx supabase stop --no-backup
```

Se qualquer comando falhar, executar `npx supabase stop --no-backup`, registrar a falha e nao promover a alteracao.

## Deploy

Os workflows de staging, producao e rollback continuam manuais e preservados. Nao devem ser acionados enquanto o bloqueio de cobranca existir. Um deploy local de staging so pode usar as credenciais exclusivas de staging e o comando ja versionado `npm run deploy:staging`.

Merge em `main` e deploy de producao permanecem bloqueados ate aprovacao explicita e evidencia equivalente de banco, staging e rollback.

## Reativacao futura

Quando houver GitHub Actions disponivel sem cobranca indesejada, restaurar os gatilhos `pull_request` e `push` de `ci.yml`, restaurar o preview automatico, executar uma PR real e configurar as protecoes de branch e environments antes de abandonar esta contingencia.
