# Fase 5 — Catálogo, Serviços e Descoberta

Execução restrita à Fase 5 do planejamento executivo, iniciada sobre o Gate G4 aprovado no commit `c2a5486219bf3c7b6ad83ea2239a0d77844492be`, branch `Remodelagem`.

## Resultado

A fundação técnica da expansão foi concluída para produtos, serviços, indústrias, aplicações, soluções e busca única. O staging usa contratos estritos, workflow editorial versionado, RBAC/RLS, projeção publicada, preview, auditoria, monitoramento, consumidores públicos e administrativos e testes de round-trip. A migration `0025_fase5_catalog_discovery.sql` não cadastra conteúdo, taxonomia, sinônimo ou mídia.

O lote funcional GATFLOW foi preservado. A auditoria final do staging confirmou:

- marca comercial `GATFLOW`;
- modelo comercial `GATFLOW-B`;
- referência do fabricante `KF700E`;
- `pilotState=homologated` e `content_version=7`;
- campos de fabricante/OEM e dados técnicos incertos continuam editáveis;
- exatamente uma projeção de produto publicada.

Nenhum lote real de serviços, indústrias, aplicações, soluções ou detecção de gases foi fornecido com fonte nova e aprovação dos owners. O solicitante registrou que fará os cadastros definitivos futuramente no `/admin`. Por isso, a decisão formal do Gate G5 é **BLOQUEADO**. A Fase 6 não foi iniciada.

## Entregas principais

- contratos `CmsServiceContentSchema`, `CmsIndustryContentSchema`, `CmsApplicationContentSchema` e `CmsSolutionContentSchema`;
- projeção `cms_discovery_projection`, sinônimos governados e eventos anônimos de busca;
- permissões por domínio e guards de homologação, indexabilidade, relações e mídia;
- comando editorial comum e API administrativa de sinônimos/zero resultado;
- editores em `/admin/descoberta/:contentType`, governança em `/admin/busca` e métricas F5 em diagnósticos;
- listas, detalhes, filtros, relações, CTA, SEO e preview nos quatro domínios;
- busca única, autocomplete acessível, agrupamento, zero resultado e consultas técnicas;
- teste remoto descartável dos quatro workflows e limpeza transacional.

## Ambiente e evidência final

- Supabase exclusivo: `glcqsosxwgmlhzgcsnzv` — `GAIATEC CMS Staging`, `us-east-2`;
- migration remota mais recente: `0025_fase5_catalog_discovery`;
- Cloudflare Pages final: `https://bea97ba2.gaiatec-cms-staging.pages.dev`;
- alias canônico de staging: `https://gaiatec-cms-staging.pages.dev`;
- produção e branch `main`: não acessadas nem alteradas;
- CI remoto: não declarado verde; `npm run validate:local` permanece a autoridade pela contingência G2.

## Documentos

- `MODELOS_E_CONTRATOS.md`
- `DECISAO_DETECCAO_GASES.md`
- `AUDITORIA_CAMPO_CONSUMIDOR.md`
- `EVIDENCIAS_TECNICAS_F5.md`
- `VALIDACAO_UX_UI_F5.md`
- `EVIDENCIAS_GATE_G5.md`
