# GAIATEC CMS

Repositório executável do site público e do CMS da GAIATEC SISTEMAS.

## Índice

- [Documentação canônica](https://github.com/Vnd93/gaiatec-documentacao/tree/main/docs)
- [Evolução EV2](https://github.com/Vnd93/gaiatec-documentacao/tree/main/docs/80-evolucao/ev2)
- [Índice documental local](docs/README.md)
- [Controles operacionais de release](.github/release-controls)

## Desenvolvimento local

```bash
npm ci
npm run dev
npm run check
```

## Publicação em produção

A produção é publicada exclusivamente pelo workflow versionado
`.github/workflows/deploy-production.yml`, com SHA imutável, registro de aprovação correspondente e
as credenciais do ambiente `production`. O comando local `npm run deploy:production` é bloqueado de
forma intencional: o Vite carrega `.env.local`, que pode apontar para staging, e esse artefato não
pode ser enviado ao projeto produtivo do Cloudflare Pages.

## CMS administrativo

O CMS em `src/admin/` usa uma sidebar achatada em seis seções: Trabalho, Catálogo, Conteúdo,
Marketing, Site e Administração. Ferramentas do mesmo domínio aparecem como abas internas; listas
abrem primeiro um drawer de resumo e depois o editor ou ficha completa. “Meu trabalho” foi
consolidado na Visão geral, mantendo redirect da rota anterior.

O design system administrativo usa Instrument Sans, JetBrains Mono para valores técnicos, canvas
`#fafafa`, superfície branca e acento único `#0057de`. Os tokens vivem em `src/admin/admin.css` e
não recebem a regra de cantos retos do site público.

As decisões, o inventário e a matriz de rotas atuais ficam na
[documentação canônica](https://github.com/Vnd93/gaiatec-documentacao/tree/main/docs/30-cms).
