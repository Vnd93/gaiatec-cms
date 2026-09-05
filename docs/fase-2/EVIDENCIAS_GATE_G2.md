# Evidências e avaliação do Gate G2

**Decisão:** BLOQUEADO

**Data da avaliação:** 2026-08-28

**Branch:** `Remodelagem`

**Base aprovada (G1):** `0835046ab99fd35a7dd05b6062a750958326bc7d`

**Último commit de código/testes validado em máquina limpa:** `3d5d68ddf85f164ff2d4560d9fb5598b531e9b27`

**Produção:** não acessada nem alterada

## Resumo executivo

Os cinco critérios técnicos enumerados no Gate G2 foram demonstrados: instalação e build limpos, migrations em banco vazio, matriz RLS permitida/negada, preview não indexável e rollback real de aplicação no staging. A fundação F2-01 a F2-05 foi implementada.

O gate permanece bloqueado porque os controles operacionais obrigatórios de F2-03 ainda não estão efetivos no GitHub: todos os jobs hospedados encerram antes do primeiro passo por bloqueio de cobrança/limite da conta, não existem environments configurados no repositório e a branch `Remodelagem` não possui proteção observável. Assim, não há evidência real de checks obrigatórios por PR nem de aprovação protegida de staging/produção. Não é correto aprovar a passagem à Fase 3 enquanto esses controles externos não forem habilitados e executados com sucesso.

## Evidências por critério do Gate G2

| Critério                                       | Resultado observado                                                                                                                                                                                                                                                  | Situação |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Máquina limpa executa `npm ci`, checks e build | Arquivo Git exato do commit `3d5d68d...`, diretório temporário sem `node_modules`, Node `22.23.0`, npm `11.16.0`; 510 pacotes instalados; 0 vulnerabilidades; formatter, typecheck, testes e builds aprovados; lint com 0 erros e 81 warnings legados já delimitados | atendido |
| Migrations sobem em banco vazio                | `supabase db reset --linked --project-ref glcqsosxwgmlhzgcsnzv --no-seed --yes` aplicou `0001` a `0009` após correção mínima de `digest` para `extensions.digest`, documentada em `EXCECAO_INTEGRIDADE_MIGRATION_0008.md`                                            | atendido |
| RLS possui testes permitidos/negados           | pgTAP remoto no staging: 7/7; matriz remota complementar: 39/39; transação descartada e fixtures sintéticas removidas                                                                                                                                                | atendido |
| Preview é não indexável                        | preview `ceede83e...`: 6/6 smoke HTTP com `X-Robots-Tag: noindex`; rota inexistente e asset inexistente retornaram 404 real                                                                                                                                          | atendido |
| Rollback de aplicação foi ensaiado             | staging voltou de `c534be2...` para a base `0835046...` e foi restaurado ao artefato validado; ambos os lados passaram 6/6 smoke                                                                                                                                     | atendido |

## F2-01 — TypeScript e qualidade

- `tsconfig.strict.json` cobre a fundação nova em modo estrito; o legado permanece em fronteira progressiva explícita com `noCheck`, sem uma refatoração indiscriminada de centenas de erros preexistentes.
- ESLint flat config, Prettier e scripts `format:check`, `lint`, `typecheck` e `check` foram adicionados.
- A execução limpa do commit `3d5d68d...` concluiu `npm run check` com:
  - Prettier aprovado;
  - ESLint: 0 erros, 81 warnings legados;
  - typecheck estrito novo e verificação progressiva do legado aprovados;
  - Vitest: 3 arquivos, 7/7 testes;
  - integração estrutural: 3/3;
  - build Vite/Worker aprovado.
- `npm run test:phase1`: 4/4, preservando a contenção do G1.

## F2-02 — testes e banco

- Contratos Zod, testes unitários, componentes com Testing Library, integração de estrutura/migrations, Playwright desktop/mobile, Axe, smoke HTTP e pgTAP foram implementados.
- E2E remoto no preview e no staging final: 17 aprovados e 1 skip intencional (interação exclusivamente mobile não é repetida no projeto desktop).
- Em máquina limpa local: 15 aprovados e 3 skips intencionais; os dois testes de status no edge executam somente contra `pages.dev`.
- Axe não encontrou violações sérias/críticas nas rotas `/`, `/contato` e `/produtos`; contraste automatizado foi complementado por inspeção visual conforme a estratégia registrada.
- A validação de navegador cobriu `/`, `/produtos`, `/contato`, `/blog` e `/relatorio-de-obra/login` em 1440×900 e 390×844: H1 presente, zero overflow horizontal, responsividade preservada e nenhum erro de console nos testes de rotas.
- Teclado: o link “Pular para o conteúdo principal” move foco para `main` em desktop e mobile; o menu mobile abre com estado ARIA coerente, bloqueia scroll, fecha por Escape e restaura o corpo.
- O Supabase remoto usado foi exclusivamente `glcqsosxwgmlhzgcsnzv`. O PAT foi selecionado em memória somente pela linha `SUPABASE_ACCESS_TOKEN`; nenhuma outra credencial foi carregada ou exibida.

## F2-03 — CI/CD, artefato e rollback

- Workflows versionados cobrem qualidade com `npm ci`, Postgres/Supabase efêmero, navegador, preview por PR, staging manual, produção manual restrita a `main` e rollback com confirmação textual.
- O workflow de produção não foi acionado.
- Artefato imutável publicado: release `b056d4325e40c0a250a07457ac142ff824bcde5e`, 1.418 arquivos, SHA-256 do `release-manifest.json` `0986df4ec0ce0a530f8bc13fd55e48b2982a6f8e6e8228a79d16d797f277b316`.
- Preview: `https://ceede83e.gaiatec-cms-staging.pages.dev` e alias `https://fase2-b056d43.gaiatec-cms-staging.pages.dev`.
- Staging final: `https://136127b5.gaiatec-cms-staging.pages.dev`.
- Rollback ensaiado:
  - base G1: `https://f5df2973.gaiatec-cms-staging.pages.dev`;
  - restauração do artefato: `https://864ce9d1.gaiatec-cms-staging.pages.dev`;
  - 6/6 smoke antes e depois, com `noindex` e 404 real.
- Simulação final limpa do commit `3d5d68d...`: build de staging e manifesto com 1.418 arquivos; SHA-256 do manifesto com release injetada `da14df0a332e2711fd73ba42de545555e270cdadcc933d55e06aadb4c56dcf47`.

### Bloqueios externos observados

- GitHub Actions run `33189715147`, no commit `b056d432...`: jobs `quality`, `database` e `browser` falharam com runner vazio e 0 passos.
- A anotação oficial dos três jobs é: o job não iniciou porque pagamentos recentes da conta falharam ou o limite de gastos precisa ser aumentado.
- A API do repositório retornou 0 environments configurados.
- A consulta de proteção de `Remodelagem` retornou 404, portanto não há proteção observável exigindo os checks.

Para desbloquear: regularizar cobrança/limite do GitHub Actions, configurar environments com revisores autorizados, proteger a branch com os três checks, executar uma PR real até obter CI verde e registrar uma aprovação protegida de staging. Esses passos dependem de autoridade administrativa/faturamento externa ao repositório.

### Contingência local sem serviço pago

Por decisão do responsável em 2026-08-28, os gatilhos automáticos de `CI` e `Preview` foram suspensos para impedir consumo ou falhas de GitHub-hosted runners. Os workflows permanecem versionados para acionamento manual futuro, e o desenvolvimento na branch `Remodelagem` passa a exigir `npm run validate:local` com evidência em `docs/validacao-local/ULTIMA_VALIDACAO.md`.

Essa contingência libera a continuidade do desenvolvimento local e o envio de commits ao repositório, mas não transforma checks inexistentes em checks aprovados. Merge em `main` e deploy de produção continuam bloqueados até aprovação explícita e validação equivalente de banco, staging e rollback.

## F2-04 — observabilidade sem PII

- Eventos JSON estruturados incluem nível, evento, versão, rota e correlation ID.
- Redaction é allowlist; e-mail, telefone, token, autorização, cookies e campos desconhecidos não são serializados.
- O Worker registra request/status/duração por rota e propaga correlation ID, sem conteúdo de formulário ou credenciais.
- Testes unitários validam estrutura e remoção de PII. O documento `OBSERVABILIDADE.md` define sinais e alertas iniciais.

## F2-05 — estrutura de código

- Fronteiras `src/public`, `src/shared`, `src/admin` e `src/rdo` foram aprovadas e documentadas; `src/admin` é apenas reserva documental.
- O RDO legado não foi movido sem necessidade; a transição passa por entrypoint público novo e contratos compartilhados.
- Nenhum painel antigo foi reutilizado e nenhum produto, serviço, texto editorial, imagem, mídia, cadastro ou estrutura cadastrada foi importado, copiado ou adaptado.

## Decisão formal

**Gate G2 técnico: ATENDIDO SOB CONTINGÊNCIA LOCAL.** O desenvolvimento pode continuar na branch `Remodelagem` com validação local obrigatória. O enforcement remoto de F2-03, o merge em `main` e o deploy de produção permanecem bloqueados até que os controles externos ou uma alternativa equivalente sejam comprovados.
