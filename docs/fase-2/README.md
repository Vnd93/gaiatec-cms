# Fase 2 — Fundação de Engenharia

**Branch:** `Remodelagem`

**Base aprovada (G1):** `0835046ab99fd35a7dd05b6062a750958326bc7d`

**Ambiente autorizado:** staging isolado; nenhum passo deste pacote autoriza produção

## Rastreabilidade do escopo

| Item  | Implementação                                                                                          | Evidência de aceite                                                             |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| F2-01 | TypeScript estrito progressivo, ESLint flat config, Prettier e `npm run check`                         | `tsconfig.strict.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json` |
| F2-02 | Vitest, Testing Library, Zod, pgTAP, Playwright, Axe e smoke HTTP                                      | `tests/`, `supabase/tests/`, `scripts/phase2/`                                  |
| F2-03 | CI Node 22 com `npm ci`, banco efêmero, previews não indexáveis, artefatos imutáveis, gates e rollback | `.github/workflows/`, `release-manifest.json` dentro do artefato                |
| F2-04 | Eventos estruturados, correlação, métricas e redaction por allowlist                                   | `src/shared/observability.ts`, `cloudflare/_worker.js`                          |
| F2-05 | Fronteiras progressivas de código, sem movimentação ampla do legado                                    | `ESTRUTURA_CODIGO.md`, `src/*/README.md`                                        |

## Restrições mantidas

- nenhum painel administrativo, login CMS, conteúdo ou workflow editorial foi criado;
- nenhum cadastro, texto, mídia, produto ou serviço existente foi copiado ou adaptado;
- fixtures contêm exclusivamente identidades e registros sintéticos descartáveis;
- produção não é acessada por scripts de validação da Fase 2;
- migrações históricas permanecem imutáveis, exceto pela correção mínima de resolução de schema em `0008`, necessária para reproduzir banco vazio e registrada em `EXCECAO_INTEGRIDADE_MIGRATION_0008.md`.

Os resultados executados e a decisão do Gate G2 ficam em `EVIDENCIAS_GATE_G2.md`, preenchido somente com observações reais.
