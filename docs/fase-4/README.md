# Fase 4 — produto piloto vertical

**Branch exclusiva:** `Remodelagem`

**Base aprovada:** Gate G3 no commit `95a5a2ffe8608c620fc98aebcfaca8351c144c25`

**Alvo permitido:** Supabase staging `glcqsosxwgmlhzgcsnzv`

**Produção e `main`:** fora do escopo

## Escopo

- F4-01: contrato de produto, fabricante, linha, modelo/variante, atributos tipados, mídia, documentos, relações, busca, SEO, redirects e proveniência;
- F4-02: estrutura da taxonomia e regras de completude, sem inventar o workshop ou sua homologação;
- F4-03: editor completo no `/admin`;
- F4-04: capacidade de recadastro manual clean-room, sem lote real enquanto fontes e owners não forem formalmente aprovados;
- F4-05: lista, detalhe, cards, filtros, comparador, busca, relações, schema, canonical e sitemap derivados da projeção publicada;
- F4-06: fluxo vertical e casos negativos com fixtures sintéticas descartáveis.

## Regra de conteúdo

Nenhum dado, imagem, documento, taxonomia ou estrutura editorial do site, banco ou painel anterior é consultado ou transformado em cadastro. A ausência de fonte oficial e homologação nominal do owner do portfólio bloqueia o lote real e o Gate G4; ela não será substituída por conteúdo inventado.

## Contingência G2

`npm run validate:local` permanece obrigatório. Esta fase não declara GitHub Actions, environments, branch protection, `main` ou produção verdes.
