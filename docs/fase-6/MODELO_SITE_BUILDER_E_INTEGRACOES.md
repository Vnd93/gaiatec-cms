# Modelo do site builder e integrações da Fase 6

## Fonte canônica

```text
rascunho CMS
  -> revisão congelada
  -> aprovação
  -> cms_published_projection
  -> cms-public
  -> preview e frontend público compartilhando CmsPageRenderer
  -> Worker Cloudflare resolvendo SEO e HTTP
```

Nenhum consumidor consulta o painel antigo. Em falha, o frontend não revela conteúdo editorial antigo; apresenta estado indisponível. A compatibilidade temporária com páginas públicas codificadas só ocorre quando `cms-public` responde explicitamente `kind: fallback`, enquanto o recadastro novo ainda não publicou uma substituição.

## Entidades

| Entidade      | `consumer_id`             | Consumidores                         |
| ------------- | ------------------------- | ------------------------------------ |
| página        | `cms.managed-page.v1`     | rota dinâmica, preview, SEO, sitemap |
| homepage      | `cms.homepage-builder.v1` | `/`, preview, placements, SEO        |
| navegação     | `cms.site-navigation.v1`  | header, menu mobile e footer         |
| configurações | `cms.site-settings.v1`    | header, footer, contato e CTAs       |
| destaques     | `cms.site-placements.v1`  | homepage, catálogo e aviso global    |

## Blocos permitidos

`hero`, `rich_text`, `image`, `gallery`, `benefit_grid`, `content_grid`, `steps`, `metrics`, `testimonial`, `faq`, `form`, `cta` e `related_content`.

Cada bloco possui:

- schema Zod no cliente;
- campos visuais no painel;
- validação defensiva no banco ao publicar;
- renderer React sem `dangerouslySetInnerHTML` e sem execução arbitrária;
- teste estrutural e/ou de componente;
- mídia e relações verificadas contra projeções publicadas.

## Rotas e retirada

- `/` é exclusiva da homepage;
- páginas não podem ocupar prefixos estruturais como `/admin`, `/preview`, `/produtos` ou `/servicos`;
- rotas publicadas são únicas;
- links internos de menus e blocos precisam corresponder a rota pública conhecida;
- redirect não pode apontar para a própria rota, incluindo diferença apenas por barra final;
- `404` e `410` removem a projeção e preservam uma regra de borda;
- `301`/`302` só existem com destino interno válido;
- republicar uma rota remove a regra de retirada anterior.

## Governança e segurança

- autorização no RPC e no banco;
- permissões separadas para páginas, homepage, navegação, configurações e destaques;
- Editor edita; Revisor aprova; publicação permanece permissão crítica;
- homepage, menus e documentos globais são singletons na projeção;
- hard delete exige `super_admin`, MFA e item nunca congelado/publicado;
- proveniência e direitos são obrigatórios;
- mídia precisa estar `ready`, com direitos confirmados e ALT;
- relações são conferidas pelo ID e pelo tipo do destino;
- audit log e recibos idempotentes acompanham os comandos.

## Destaques temporários

Slots suportados:

- `home_hero`;
- `home_featured`;
- `catalog_featured`;
- `global_announcement`.

A API pública entrega somente destaques habilitados cujo período esteja ativo, ordenados por prioridade e com alvo ainda publicado. A expiração remove o destaque sem remover o conteúdo-alvo.

## SEO inicial

Para páginas gerenciadas, o Worker consulta `page-by-path` antes de servir a SPA e injeta no HTML inicial:

- title e description;
- robots;
- canonical;
- Open Graph e Twitter;
- imagem social assinada quando configurada;
- schema `WebPage`.

O mesmo Worker resolve redirect, `404` e `410` antes do React. Staging continua com `X-Robots-Tag: noindex`.
