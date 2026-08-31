# Relatório de publicação clean-room no staging — Fase 9

**Data:** 2026-08-30

**Ambiente:** `GAIATEC CMS Staging` / Cloudflare Pages staging

**Deploy imutável:** `https://fe4d84dc.gaiatec-cms-staging.pages.dev`

**Domínio estável:** `https://gaiatec-cms-staging.pages.dev`
**Produção:** não acessada ou alterada

## Origem e governança

Os substitutos foram criados exclusivamente com fatos já confirmados pelo administrador, documentos normativos/ADRs e texto original, neutro e tecnicamente seguro. O site/painel anterior não foi consultado nem usado como fonte ou fallback.

O publicador `scripts/phase9/publish-staging-clean-room-pages.mjs` é bloqueado fora de staging e percorre criação, revisão, aprovação e publicação. A publicação usa atores temporários com MFA; ao final, eles são suspensos/banidos. Recuperações de estados intermediários são registradas em auditoria e criam nova revisão imutável.

## Itens publicados

Páginas:

- `/`;
- `/sobre`;
- `/contato`;
- `/politica-de-privacidade`;
- `/termos-de-uso`;
- `/biodigestor`;
- `/biodigestor/como-funciona`;
- `/biodigestor/portes`;
- `/biodigestor/beneficios`;
- `/biodigestor/monitoramento`;
- `/biodigestor/biogas-biometano`;
- `/biodigestor/automacao`;
- `/biodigestor/escolas`;
- `/deteccao-de-gas`.

Indústrias:

- `/industrias/biogas-biometano`;
- `/industrias/protecao-catodica`;
- `/industrias/controle-ambiental`;
- `/industrias/seguranca-operacional`;
- `/industrias/instrumentacao`;
- `/industrias/telemetria`.

## Projeção e SEO

- as 14 páginas retornam `kind: page` e `renderer: managed-page`;
- as seis indústrias aparecem na coleção pública, totalizando 14 indústrias;
- canonical preserva as URLs definitivas de produção;
- staging envia `X-Robots-Tag: noindex, nofollow, noarchive`;
- busca pública inclui `page`/`homepage` e não usa índice editorial compilado;
- sitemap publicou 38 URLs e eliminou `/setores/*`;
- campos internos de fabricante não aparecem na projeção pública.

## Páginas legais

Política de Privacidade e Termos de Uso empregam redação conservadora original e dados empresariais confirmados. O CMS/proveniência registra: `Victor Nishida — staging; revisão final DPO antes de produção`. Isso não constitui parecer jurídico; a revisão final integra o sign-off obrigatório de go-live.

## Incidentes controlados da publicação

1. O bloco de Contato inicialmente usou uma chave não aceita pelo contrato de formulários. A publicação foi interrompida antes do release, o bloco passou a usar a chave genérica `lead` e uma nova revisão auditada foi publicada.
2. O hub Biodigestor referenciava subrotas ainda não publicadas. A validação bloqueou o release; as subrotas foram publicadas primeiro e o hub recebeu nova revisão auditada.

Nenhum item publicado foi apagado ou sobrescrito. Não houve uso de conteúdo anterior para contornar as validações.

## Resultado

Publicação e deploy de staging aprovados. Nenhum commit, push ou deploy de produção foi realizado.
