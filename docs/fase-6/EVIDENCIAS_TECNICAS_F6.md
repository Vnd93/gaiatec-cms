# Evidências técnicas da Fase 6

**Data da execução:** 2026-08-29

## Implementação

- contrato completo em `src/shared/contracts/cms-content.ts`;
- migration inédita e vazia em `supabase/migrations/0026_fase6_site_builder.sql`;
- comandos administrativos em `supabase/functions/cms-content/index.ts`;
- leitura pública em `supabase/functions/cms-public/index.ts`;
- preview com mídia de blocos e ALT em `supabase/functions/cms-preview/index.ts`;
- painéis em `/admin/paginas`, `/admin/paginas/:id` e `/admin/site`;
- renderer compartilhado em `src/public/components/CmsPageRenderer.tsx`;
- resolução pública em `src/public/pages/CmsManagedPageRoute.tsx`;
- shell global em `src/public/site-shell-context.tsx`;
- status e SEO de borda em `cloudflare/_worker.js`.

## Proteções comprovadas em código

- migration contém declaração clean-room e não insere conteúdo ou mídia;
- 13 blocos possuem consumidor e nenhum aceita código arbitrário;
- URLs `javascript:`, `#` editorial, rotas reservadas, ciclos e quarto nível de menu são rejeitados;
- canonical precisa coincidir com a rota;
- hero com imagem exige ALT;
- galeria e grade recebem ALT da biblioteca de mídia;
- relação exige destino publicado do tipo correto;
- redirect exige destino existente e rejeita loop por barra final;
- hard delete só aceita rascunho nunca revisado/publicado;
- retirada preserva auditoria e gera outbox de `unpublish`;
- Worker testa `200`, `301`, `404` e `410`, rota administrativa privada e SEO inicial.

## Resultados automáticos

| Verificação           | Resultado                                       |
| --------------------- | ----------------------------------------------- |
| `npm run check`       | aprovado integralmente                          |
| `npm run typecheck`   | aprovado                                        |
| `npm run lint`        | 0 erros; 45 warnings históricos não impeditivos |
| `npm run test:unit`   | 12 arquivos, 38 testes aprovados                |
| testes fases 2–6      | 37 testes contratuais aprovados                 |
| `npm run test:phase6` | 6 testes aprovados                              |
| `npm run test:e2e`    | 22 aprovados, 4 skips condicionais              |
| `npm run test:a11y`   | 5 aprovados, 1 skip exclusivo de viewport       |
| `npm run build`       | aprovado                                        |
| `git diff --check`    | aprovado                                        |

O teste WCAG foi endurecido: a exclusão da regra `color-contrast` foi removida. As violações encontradas no footer, aviso de cookies e catálogo foram corrigidas antes do resultado verde.

## Artefato de produção

Principais tamanhos gzip do build final observado:

- entrada pública: aproximadamente `50.23 kB`;
- CSS global: aproximadamente `26.41 kB`;
- CSS do catálogo: aproximadamente `5.46 kB`;
- renderer de página CMS: aproximadamente `2.27 kB`;
- builder administrativo: aproximadamente `9.80 kB`.

O chunk PDF/RDO permanece grande (`~605 kB` gzip), porém separado e carregado sob demanda; não integra a jornada pública do catálogo nem o site builder. O build mantém o warning existente para chunks acima de 600 kB.

## Banco e staging

- Supabase staging: `glcqsosxwgmlhzgcsnzv`;
- migration 0026 aplicada e listada remotamente;
- `cms-content`, `cms-public`, `cms-preview` e `cms-outbox-worker` implantadas;
- Cloudflare Pages staging publicado na branch `Remodelagem`;
- Super Admin real com MFA executou o round-trip de revisões 1, 2 e 3;
- restauração, retirada `404`, preview desktop/mobile, RLS/RBAC e projeção pública verificados;
- outbox processada de 11 pendências para zero, sem falhas;
- produção e branch `main` não acessadas.

Os resultados locais e remotos agora comprovam a integração transacional do Gate G6 no staging. O fixture sintético permanece arquivado para auditoria e não integra o conteúdo editorial do site.
